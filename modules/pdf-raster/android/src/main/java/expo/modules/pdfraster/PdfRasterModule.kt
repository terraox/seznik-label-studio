package expo.modules.pdfraster

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.pdf.PdfRenderer
import android.util.Base64
import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.atomic.AtomicInteger

class PdfRasterModule : Module() {
  private val ioExecutor = Executors.newCachedThreadPool()

  override fun definition() = ModuleDefinition {
    Name("PdfRaster")

    AsyncFunction("renderPdfPage") { uriString: String, pageIndex: Int, dpi: Double, promise: Promise ->
      ioExecutor.execute {
        var pfd: ParcelFileDescriptor? = null
        var renderer: PdfRenderer? = null
        var tempFile: File? = null
        try {
          val context = appContext.reactContext
            ?: throw IllegalStateException("No Android React Context available")
          val uri = Uri.parse(uriString)
          val file = if (uri.scheme == "content" || (uri.scheme == null && !uriString.startsWith("/"))) {
            val tmp = File.createTempFile("pdf_src_", ".pdf", context.cacheDir)
            tempFile = tmp
            context.contentResolver.openInputStream(uri)?.use { input ->
              tmp.outputStream().use { output -> input.copyTo(output) }
            } ?: throw IOException("Cannot open input stream for: $uriString")
            tmp
          } else {
            val path = if (uri.scheme == "file") uri.path ?: uriString else uriString
            File(path)
          }

          pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
          renderer = PdfRenderer(pfd)
          if (pageIndex < 0 || pageIndex >= renderer.pageCount) {
            throw IllegalArgumentException("Page index $pageIndex out of range (0..${renderer.pageCount - 1})")
          }

          val page = renderer.openPage(pageIndex)
          try {
            val scale = (if (dpi > 0) dpi else 300.0) / 72.0
            val w = Math.max(1, Math.round(page.width * scale).toInt())
            val h = Math.max(1, Math.round(page.height * scale).toInt())
            val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(Color.WHITE)
            val matrix = Matrix()
            matrix.setScale(w.toFloat() / page.width.toFloat(), h.toFloat() / page.height.toFloat())
            page.render(bitmap, null, matrix, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)

            val outFile = File(context.cacheDir, "pdf_page_${pageIndex}_${dpi.toInt()}_${System.currentTimeMillis()}.png")
            FileOutputStream(outFile).use { stream ->
              bitmap.compress(Bitmap.CompressFormat.PNG, 95, stream)
            }
            bitmap.recycle()

            promise.resolve(
              mapOf(
                "uri" to "file://${outFile.absolutePath}",
                "widthPx" to w,
                "heightPx" to h,
                "widthPt" to page.width.toDouble(),
                "heightPt" to page.height.toDouble(),
                "pageCount" to renderer.pageCount,
              )
            )
          } finally {
            page.close()
          }
        } catch (e: Exception) {
          promise.reject("PDF_RASTER_FAILED", e.message, e)
        } finally {
          try { renderer?.close() } catch (_: Exception) {}
          try { pfd?.close() } catch (_: Exception) {}
          try { tempFile?.delete() } catch (_: Exception) {}
        }
      }
    }

    // Row ink profile of many pages at once. Each page is drawn at `dpi`, and for every pixel row
    // the percent of dark pixels between x0 and x1 (fractions of the width) is kept. Several
    // renderers work in parallel and only the profiles cross the bridge, no images.
    AsyncFunction("scanPdfRows") { uriString: String, startPage: Int, endPage: Int, dpi: Double, x0: Double, x1: Double, threads: Int, promise: Promise ->
      ioExecutor.execute {
        var tempFile: File? = null
        try {
          val context = appContext.reactContext
            ?: throw IllegalStateException("No Android React Context available")
          val uri = Uri.parse(uriString)
          val file = if (uri.scheme == "content" || (uri.scheme == null && !uriString.startsWith("/"))) {
            val tmp = File.createTempFile("pdf_src_", ".pdf", context.cacheDir)
            tempFile = tmp
            context.contentResolver.openInputStream(uri)?.use { input ->
              tmp.outputStream().use { output -> input.copyTo(output) }
            } ?: throw IOException("Cannot open input stream for: $uriString")
            tmp
          } else {
            File(if (uri.scheme == "file") uri.path ?: uriString else uriString)
          }

          var pageCount = 0
          var widthPt = 0.0
          var heightPt = 0.0
          ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { pfd ->
            val probe = PdfRenderer(pfd)
            try {
              pageCount = probe.pageCount
              val first = probe.openPage(0)
              widthPt = first.width.toDouble()
              heightPt = first.height.toDouble()
              first.close()
            } finally {
              probe.close()
            }
          }

          val from = Math.max(0, startPage)
          val to = Math.min(pageCount, endPage)
          if (to <= from) throw IllegalArgumentException("Empty page range $startPage..$endPage of $pageCount")
          val scale = (if (dpi > 0) dpi else 72.0) / 72.0
          val w = Math.max(1, Math.round(widthPt * scale).toInt())
          val h = Math.max(1, Math.round(heightPt * scale).toInt())
          val xa = Math.max(0, Math.min(w - 1, Math.floor(x0 * w).toInt()))
          val xb = Math.max(xa + 1, Math.min(w, Math.ceil(x1 * w).toInt()))
          val bandWidth = xb - xa
          val count = to - from
          val out = ByteArray(count * h)
          val next = AtomicInteger(from)
          val workers = Math.max(1, Math.min(if (threads > 0) threads else 4, count))
          val pool = Executors.newFixedThreadPool(workers)
          try {
            val jobs = ArrayList<Future<*>>()
            repeat(workers) {
              jobs.add(pool.submit {
                val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                val renderer = PdfRenderer(pfd)
                val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                val pixels = IntArray(w * h)
                try {
                  while (true) {
                    val index = next.getAndIncrement()
                    if (index >= to) break
                    try {
                      val page = renderer.openPage(index)
                      try {
                        bitmap.eraseColor(Color.WHITE)
                        val matrix = Matrix()
                        matrix.setScale(w.toFloat() / page.width.toFloat(), h.toFloat() / page.height.toFloat())
                        page.render(bitmap, null, matrix, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                      } finally {
                        page.close()
                      }
                      bitmap.getPixels(pixels, 0, w, 0, 0, w, h)
                      val base = (index - from) * h
                      for (y in 0 until h) {
                        var dark = 0
                        val row = y * w
                        for (x in xa until xb) {
                          val p = pixels[row + x]
                          val lum = (77 * ((p shr 16) and 0xFF) + 150 * ((p shr 8) and 0xFF) + 29 * (p and 0xFF)) shr 8
                          if (lum < 170) dark++
                        }
                        out[base + y] = (dark * 100 / bandWidth).toByte()
                      }
                    } catch (_: Exception) {
                      // A page that cannot be drawn keeps an empty profile; the caller checks it in full.
                    }
                  }
                } finally {
                  bitmap.recycle()
                  try { renderer.close() } catch (_: Exception) {}
                  try { pfd.close() } catch (_: Exception) {}
                }
              })
            }
            jobs.forEach { it.get() }
          } finally {
            pool.shutdown()
          }

          promise.resolve(
            mapOf(
              "pageCount" to pageCount,
              "start" to from,
              "count" to count,
              "heightPx" to h,
              "widthPx" to w,
              "data" to Base64.encodeToString(out, Base64.NO_WRAP),
            )
          )
        } catch (e: Exception) {
          promise.reject("PDF_SCAN_FAILED", e.message, e)
        } finally {
          try { tempFile?.delete() } catch (_: Exception) {}
        }
      }
    }
  }
}
