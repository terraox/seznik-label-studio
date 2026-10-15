package expo.modules.sharetarget

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import android.util.Log
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

private const val TAG = "ShareTarget"
private const val MAX_BYTES = 104_857_600L // 100 MB
private const val XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

class ShareTargetModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("ShareTarget")

    Events("onSharedFile")

    // Cold start: the intent that launched the activity. Cleared once read so a JS reload
    // does not import the same file again.
    AsyncFunction("consumeSharedFileAsync") {
      val intent = appContext.currentActivity?.intent
      val result = if (intent != null && isShare(intent)) readShared(intent) else null
      if (result != null) clearShare(intent)
      result
    }

    // Warm start: the app is already running and receives a new share.
    OnNewIntent { intent ->
      if (isShare(intent)) {
        readShared(intent)?.let { sendEvent("onSharedFile", it) }
      }
    }
  }

  private fun isShare(intent: Intent): Boolean = intent.action == Intent.ACTION_SEND

  private fun clearShare(intent: Intent?) {
    intent ?: return
    intent.action = null
    intent.removeExtra(Intent.EXTRA_STREAM)
    intent.clipData = null
  }

  private fun streamUri(intent: Intent): Uri? {
    val fromExtra = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
    }
    if (fromExtra != null) return fromExtra
    val clip = intent.clipData
    return if (clip != null && clip.itemCount > 0) clip.getItemAt(0).uri else null
  }

  /** Copies the shared file into the app cache. Failures are returned as { error } so JS can show them. */
  private fun readShared(intent: Intent): Map<String, Any?>? {
    val uri = streamUri(intent)
    if (uri == null) {
      Log.i(TAG, "SEND without a file stream type=${intent.type}")
      return mapOf("error" to "SEZ Print received nothing to import. Share the spreadsheet file.")
    }
    return try {
      val mime = intent.type ?: context.contentResolver.getType(uri)
      val name = withExtension(displayName(uri), mime)
      val dir = File(context.cacheDir, "SharedFiles").apply { mkdirs() }
      val out = File(dir, "${System.nanoTime()}-$name")
      context.contentResolver.openInputStream(uri).use { input ->
        input ?: throw IllegalStateException("The sending app gave no data.")
        FileOutputStream(out).use { output ->
          val buffer = ByteArray(8192)
          var total = 0L
          while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            total += read
            if (total > MAX_BYTES) {
              out.delete()
              return mapOf("error" to "This file is too large to import.")
            }
            output.write(buffer, 0, read)
          }
        }
      }
      if (out.length() <= 0L) {
        out.delete()
        return mapOf("error" to "The shared file is empty.")
      }
      Log.i(TAG, "received name=$name mime=$mime bytes=${out.length()} from=$uri")
      mapOf(
        "name" to name,
        "uri" to Uri.fromFile(out).toString(),
        "size" to out.length().toDouble(),
        "mimeType" to mime,
      )
    } catch (error: Exception) {
      Log.i(TAG, "read failed ${error.javaClass.simpleName}: ${error.message} uri=$uri")
      mapOf("error" to "Could not read the shared file. Try again or download it as .xlsx first.")
    }
  }

  private fun displayName(uri: Uri): String {
    var name: String? = null
    try {
      context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst() && !cursor.isNull(0)) name = cursor.getString(0)
      }
    } catch (error: Exception) {
      Log.i(TAG, "display name query failed ${error.javaClass.simpleName}")
    }
    val raw = name ?: uri.lastPathSegment ?: "Shared sheet"
    val cleaned = raw.substringAfterLast('/').replace(Regex("""[\\/:*?"<>|\u0000-\u001F]"""), "").trim()
    return cleaned.ifEmpty { "Shared sheet" }
  }

  private fun withExtension(name: String, mime: String?): String {
    val known = listOf(".xlsx", ".xls", ".xlsm", ".csv")
    if (known.any { name.endsWith(it, ignoreCase = true) }) return name
    val extension = when (mime?.substringBefore(';')?.trim()) {
      XLSX_MIME -> "xlsx"
      "application/vnd.ms-excel" -> "xls"
      "application/vnd.ms-excel.sheet.macroEnabled.12" -> "xlsm"
      "text/csv", "text/comma-separated-values" -> "csv"
      else -> null
    }
    return if (extension != null) "$name.$extension" else name
  }
}
