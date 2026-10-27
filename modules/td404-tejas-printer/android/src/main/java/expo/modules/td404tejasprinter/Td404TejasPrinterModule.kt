package expo.modules.td404tejasprinter

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.util.Log
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.core.content.ContextCompat
import com.ninestar.printer.command.LabelCommand
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.Vector
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * TD-404 / Ninestar classic Bluetooth (SPP) bridge.
 * Lists bonded (paired) devices + nearby discovery, then connects via SPP
 * (same profile as SppBluetoothPort in labelprinter.aar).
 */
class Td404TejasPrinterModule : Module() {
  /** Bump when the TSPL packer changes so a stale installed binary is visible in logcat. */
  private val nativeRev = "td404-border-fix-2"
  private val sppUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
  private val ioExecutor = Executors.newCachedThreadPool()
  @Volatile private var probeSocket: android.bluetooth.BluetoothSocket? = null
  private val connectTimeoutMs = 8_000L
  private val printChunk = 32 * 1024
  private val connectGeneration = AtomicInteger(0)
  private var socket: BluetoothSocket? = null
  private var pendingSocket: BluetoothSocket? = null
  private var connectedMac: String? = null
  private var connectedName: String? = null
  private var receiverRegistered = false


  private val discoveryReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      when (intent?.action) {
        // NAME_CHANGED: a printer first seen without a name announces it a moment later.
        BluetoothDevice.ACTION_FOUND, BluetoothDevice.ACTION_NAME_CHANGED -> {
          val device: BluetoothDevice? =
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
              intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
            } else {
              @Suppress("DEPRECATION")
              intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
            }
          if (device != null) {
            Log.i("Td404Scan", "found ${device.address} name=${intent.getStringExtra(BluetoothDevice.EXTRA_NAME)} type=${device.type} class=${device.bluetoothClass?.deviceClass}")
            // The name carried by the broadcast is more reliable than device.name for an unpaired printer.
            emitDevice(device, bonded = false, nameHint = intent.getStringExtra(BluetoothDevice.EXTRA_NAME))
          }
        }
        BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
          sendEvent("onScanFinished", emptyMap<String, Any?>())
        }
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("Td404TejasPrinter")

    Events("onDeviceFound", "onScanFinished", "onConnectionChanged")

    OnCreate {
      ensureReceiver()
    }

    OnDestroy {
      unregisterReceiverSafe()
      closeSocket()
    }

    Function("isAvailable") {
      getAdapter() != null
    }

    /** Adapter power only — does not start scan, discovery, or connect. */
    Function("isBluetoothEnabled") {
      val adapter = getAdapter()
      adapter != null && adapter.isEnabled
    }

    /**
     * Android 13+ system battery for a remote Bluetooth device (the printer MAC).
     * Returns -1 when unknown, unsupported, or permission is missing. Not the phone battery.
     */
    AsyncFunction("debugLogRemoteBattery") { mac: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null || (context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) == 0) {
        promise.resolve(null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        val level = if (mac.isBlank()) -1 else readRemoteBatteryLevelForMac(mac)
        android.util.Log.i("TdBattery", "readSystemBluetoothBatteryPercent raw=$level mac=$mac")
        promise.resolve(null)
      }
    }

    AsyncFunction("getBluetoothDeviceBatteryLevel") { mac: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null || !hasConnectPermission(context) || Build.VERSION.SDK_INT < 33) {
        promise.resolve(-1)
        return@AsyncFunction
      }
      val adapter = getAdapter()
      if (adapter == null || mac.isBlank()) {
        promise.resolve(-1)
        return@AsyncFunction
      }
      ioExecutor.execute {
        promise.resolve(readRemoteBatteryLevelForMac(mac))
      }
    }

    /** Baseline perf logs — tag PIPELINE for `adb logcat -s PIPELINE`. */
    Function("logPipelineTrace") { message: String ->
      android.util.Log.i("PIPELINE", message)
    }

    /** Always-available paired list (even when not discoverable / already connected in system BT). */
    AsyncFunction("getBondedDevices") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("NO_CONTEXT", "React context unavailable", null)
        return@AsyncFunction
      }
      // Bonded list only needs BLUETOOTH_CONNECT (not SCAN / location).
      if (!hasConnectPermission(context)) {
        promise.reject("PERMISSION", "Bluetooth Connect permission is required.", null)
        return@AsyncFunction
      }
      val adapter = getAdapter()
      if (adapter == null) {
        promise.reject("NO_ADAPTER", "Bluetooth adapter not found.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          @SuppressLint("MissingPermission")
          val bonded = adapter.bondedDevices ?: emptySet()
          val list = bonded.map { deviceToMap(it, bonded = true) }
          promise.resolve(list)
        } catch (e: Exception) {
          promise.reject("BONDED_FAILED", e.message, e)
        }
      }
    }

    AsyncFunction("startScan") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("NO_CONTEXT", "React context unavailable", null)
        return@AsyncFunction
      }
      // Prefer full scan perms; fall back to bonded-only if SCAN is missing.
      val canDiscover = hasPermissions(context)
      if (!hasConnectPermission(context)) {
        promise.reject(
          "PERMISSION",
          "Bluetooth permissions are required to scan for TD-404 printers.",
          null,
        )
        return@AsyncFunction
      }
      val adapter = getAdapter()
      if (adapter == null) {
        promise.reject("NO_ADAPTER", "Bluetooth adapter not found on this device.", null)
        return@AsyncFunction
      }
      if (!adapter.isEnabled) {
        // Resolve (do not reject) so JS `void startScan()` cannot surface LogBox.
        sendEvent("onScanFinished", emptyMap<String, Any?>())
        promise.resolve(
          mapOf(
            "discoveryStarted" to false,
            "bondedCount" to 0,
            "reason" to "BT_OFF",
          ),
        )
        return@AsyncFunction
      }

      ensureReceiver()

      ioExecutor.execute {
        try {
          // cancelDiscovery is asynchronous; starting a new inquiry before it ends can fail or be cut short.
          @SuppressLint("MissingPermission")
          if (adapter.isDiscovering) {
            adapter.cancelDiscovery()
            var waited = 0
            while (adapter.isDiscovering && waited < 1500) {
              Thread.sleep(100)
              waited += 100
            }
          }

          @SuppressLint("MissingPermission")
          val bonded = adapter.bondedDevices ?: emptySet()
          for (device in bonded) {
            emitDevice(device, bonded = true)
          }

          if (!canDiscover) {
            sendEvent("onScanFinished", emptyMap<String, Any?>())
            promise.resolve(mapOf("discoveryStarted" to false, "bondedCount" to bonded.size))
            return@execute
          }

          @SuppressLint("MissingPermission")
          val started = adapter.startDiscovery()
          Log.i("Td404Scan", "classic discovery started=$started")
          if (!started) {
            sendEvent("onScanFinished", emptyMap<String, Any?>())
            promise.resolve(mapOf("discoveryStarted" to false, "bondedCount" to bonded.size))
            return@execute
          }
          promise.resolve(mapOf("discoveryStarted" to true, "bondedCount" to bonded.size))
        } catch (e: Exception) {
          promise.reject("SCAN_FAILED", e.message, e)
        }
      }
    }

    /** Opens the system pairing dialog for an unpaired printer. Resolves true once it is bonded. */
    AsyncFunction("pairDevice") { macAddress: String, timeoutMs: Int, promise: Promise ->
      val context = appContext.reactContext
      val adapter = getAdapter()
      if (context == null || adapter == null || !adapter.isEnabled || !hasConnectPermission(context)) {
        promise.resolve(false)
        return@AsyncFunction
      }
      ioExecutor.execute {
        promise.resolve(
          try {
            pairBlocking(context, adapter, macAddress, timeoutMs.toLong())
          } catch (_: Exception) {
            false
          },
        )
      }
    }

    AsyncFunction("stopScan") { promise: Promise ->
      ioExecutor.execute {
        try {
          getAdapter()?.let { adapter ->
            @SuppressLint("MissingPermission")
            if (adapter.isDiscovering) adapter.cancelDiscovery()
          }
          promise.resolve(null)
        } catch (e: Exception) {
          promise.reject("STOP_FAILED", e.message, e)
        }
      }
    }

    // Reachability check for the paired printer: opens the SPP link and closes it again.
    // A paired printer is often not discoverable, so a scan can't tell if it is on.
    AsyncFunction("probe") { macAddress: String, timeoutMs: Int, promise: Promise ->
      val adapter = getAdapter()
      if (adapter == null || !adapter.isEnabled) {
        promise.resolve(false)
        return@AsyncFunction
      }
      if (socket != null && connectedMac.equals(macAddress, ignoreCase = true)) {
        promise.resolve(true)
        return@AsyncFunction
      }
      ioExecutor.execute {
        var sock: android.bluetooth.BluetoothSocket? = null
        var killer: Thread? = null
        try {
          @SuppressLint("MissingPermission")
          if (adapter.isDiscovering) adapter.cancelDiscovery()
          val device = adapter.getRemoteDevice(macAddress.uppercase())
          @SuppressLint("MissingPermission")
          val s = device.createInsecureRfcommSocketToServiceRecord(sppUuid)
          sock = s
          probeSocket = s
          killer = Thread {
            try { Thread.sleep(timeoutMs.toLong()) } catch (_: InterruptedException) { return@Thread }
            try { s.close() } catch (_: Exception) {}
          }.also { it.isDaemon = true; it.start() }
          @SuppressLint("MissingPermission")
          s.connect()
          promise.resolve(true)
        } catch (_: Exception) {
          promise.resolve(false)
        } finally {
          killer?.interrupt()
          try { sock?.close() } catch (_: Exception) {}
          if (probeSocket === sock) probeSocket = null
        }
      }
    }

    AsyncFunction("connect") { macAddress: String, name: String?, promise: Promise ->
      val adapter = getAdapter()
      if (adapter == null) {
        promise.reject("NO_ADAPTER", "Bluetooth adapter not found.", null)
        return@AsyncFunction
      }
      if (!adapter.isEnabled) {
        promise.reject("BT_OFF", "Bluetooth is turned off. Enable Bluetooth and try again.", null)
        return@AsyncFunction
      }
      val generation = connectGeneration.incrementAndGet()
      ioExecutor.execute {
        try {
          if (generation != connectGeneration.get()) {
            promise.reject("CONNECT_SUPERSEDED", "Connection replaced by a newer printer.", null)
            return@execute
          }
          @SuppressLint("MissingPermission")
          if (adapter.isDiscovering) {
            adapter.cancelDiscovery()
            try { Thread.sleep(150) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
          }
          try { probeSocket?.close() } catch (_: Exception) {}
          closePendingSocket()
          closeSocket()
          try { Thread.sleep(100) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
          if (generation != connectGeneration.get()) {
            promise.reject("CONNECT_SUPERSEDED", "Connection replaced by a newer printer.", null)
            return@execute
          }

          val device = adapter.getRemoteDevice(macAddress.uppercase())
          val sock = openSppSocket(device, generation)
          if (generation != connectGeneration.get()) {
            try { sock.close() } catch (_: Exception) {}
            promise.reject("CONNECT_SUPERSEDED", "Connection replaced by a newer printer.", null)
            return@execute
          }
          socket = sock
          connectedMac = device.address
          @SuppressLint("MissingPermission")
          val resolvedName = name ?: device.name ?: device.address
          connectedName = resolvedName
          sendEvent(
            "onConnectionChanged",
            mapOf(
              "connected" to true,
              "id" to device.address,
              "name" to resolvedName,
              "transport" to "bluetooth-spp",
              "sdkId" to "td404",
            ),
          )
          promise.resolve(
            mapOf(
              "id" to device.address,
              "name" to resolvedName,
              "transport" to "bluetooth-spp",
              "sdkId" to "td404",
            ),
          )
        } catch (e: Exception) {
          if (generation == connectGeneration.get()) {
            closeSocket()
            promise.reject("CONNECT_FAILED", e.message ?: "Failed to connect to TD-404 printer.", e)
          } else {
            promise.reject("CONNECT_SUPERSEDED", "Connection replaced by a newer printer.", null)
          }
        }
      }
    }

    AsyncFunction("disconnect") { promise: Promise ->
      connectGeneration.incrementAndGet()
      ioExecutor.execute {
        closeSocket()
        sendEvent(
          "onConnectionChanged",
          mapOf("connected" to false, "sdkId" to "td404"),
        )
        promise.resolve(null)
      }
    }

    Function("isConnected") {
      isSocketAlive()
    }

    Function("getConnectedDevice") {
      if (isSocketAlive() && connectedMac != null) {
        mapOf(
          "id" to connectedMac,
          "name" to connectedName,
          "transport" to "bluetooth-spp",
          "sdkId" to "td404",
        )
      } else {
        null
      }
    }

    /** Lightweight health check: verifies the socket and output stream are still viable. */
    Function("isSocketAlive") {
      isSocketAlive()
    }

    /** Returns connection diagnostics for the debug screen. */
    Function("getConnectionInfo") {
      mapOf(
        "connected" to isSocketAlive(),
        "mac" to connectedMac,
        "name" to connectedName,
        "transport" to "bluetooth-spp",
        "sdkId" to "td404",
        "socketClass" to (socket?.javaClass?.simpleName ?: "none"),
      )
    }

    AsyncFunction("printBase64") { base64: String, promise: Promise ->
      try {
        val bytes = android.util.Base64.decode(base64, android.util.Base64.DEFAULT)
        writeBytesToSocket(bytes, promise)
      } catch (e: Exception) {
        promise.reject("DECODE_FAILED", e.message, e)
      }
    }

    AsyncFunction("printRaw") { bytes: ByteArray, promise: Promise ->
      writeBytesToSocket(bytes, promise)
    }

    /**
     * Write [bytes], then read whatever the printer sends back. Returns base64 of the reply
     * (empty when silent). Stops once the reply has been idle for idleMs or timeoutMs passes.
     */
    AsyncFunction("queryRaw") { bytes: ByteArray, timeoutMs: Int, idleMs: Int, promise: Promise ->
      val sock = socket
      if (sock == null || !sock.isConnected) {
        promise.reject("NOT_CONNECTED", "No TD-404 printer connected.", null)
        return@AsyncFunction
      }
      ioExecutor.execute {
        try {
          val input = sock.inputStream ?: throw IOException("Printer input stream unavailable.")
          // Drop stale bytes so the reply belongs to this query.
          while (input.available() > 0) input.skip(input.available().toLong())
          writeBytesToSocketSync(bytes)
          val reply = ByteArrayOutputStream()
          val buf = ByteArray(256)
          val deadline = System.currentTimeMillis() + timeoutMs.coerceIn(100, 30000)
          var lastRx = 0L
          while (System.currentTimeMillis() < deadline) {
            val n = input.available()
            if (n > 0) {
              val got = input.read(buf, 0, minOf(n, buf.size))
              if (got > 0) {
                reply.write(buf, 0, got)
                lastRx = System.currentTimeMillis()
              }
            } else {
              if (reply.size() > 0 && System.currentTimeMillis() - lastRx >= idleMs.coerceIn(20, 5000)) break
              Thread.sleep(20)
            }
          }
          promise.resolve(android.util.Base64.encodeToString(reply.toByteArray(), android.util.Base64.NO_WRAP))
        } catch (e: IOException) {
          android.util.Log.e("Td404TejasPrinter", "SPP query failed: ${e.message}")
          promise.reject("QUERY_FAILED", e.message, e)
        } catch (e: InterruptedException) {
          Thread.currentThread().interrupt()
          promise.reject("QUERY_FAILED", "Interrupted", e)
        }
      }
    }

    /**
     * Fast SDK-style print: PNG → LabelCommand (native) → SPP write without waiting
     * for printer ACK. Skips the slow JS PNG→gray→1-bit→TSPL path.
     *
     * Mirrors Ninestar demo: LabelCommand.addSize/addGap/addBitmap/addPrint then
     * writeDataImmediately(..., isReadReceive=false).
     */
    AsyncFunction("printPngLabel") { options: Map<String, Any?>, promise: Promise ->
      val dryRun = optionsDryRun(options)
      if (!dryRun) {
        val sock = socket
        if (sock == null || !sock.isConnected) {
          promise.reject("NOT_CONNECTED", "No TD-404 printer connected.", null)
          return@AsyncFunction
        }
      }
      ioExecutor.execute {
        try {
          val result = printPngLabelNative(options)
          promise.resolve(result)
        } catch (e: Exception) {
          android.util.Log.e("Td404TejasPrinter", "printPngLabel failed: ${e.message}", e)
          if (e is IOException) {
            closeSocket()
            sendEvent(
              "onConnectionChanged",
              mapOf("connected" to false, "sdkId" to "td404"),
            )
          }
          promise.reject("PRINT_FAILED", e.message, e)
        }
      }
    }

    /**
     * Stage B: already-packed 1-bit buffer → TSPL BITMAP → SPP.
     * No BitmapFactory, scale, threshold, or dither. Invert logical black=1 once for TSPL black=0.
     */
    AsyncFunction("printMonoLabel") { monoBytes: ByteArray, options: Map<String, Any?>, promise: Promise ->
      val dryRun = optionsDryRun(options)
      if (!dryRun) {
        val sock = socket
        if (sock == null || !sock.isConnected) {
          promise.reject("NOT_CONNECTED", "No TD-404 printer connected.", null)
          return@AsyncFunction
        }
      }
      ioExecutor.execute {
        try {
          val result = printMonoLabelNative(monoBytes, options)
          promise.resolve(result)
        } catch (e: IllegalArgumentException) {
          android.util.Log.e("Td404TejasPrinter", "printMonoLabel rejected: ${e.message}", e)
          promise.reject("MONO_INVALID", e.message, e)
        } catch (e: Exception) {
          android.util.Log.e("Td404TejasPrinter", "printMonoLabel failed: ${e.message}", e)
          if (e is IOException) {
            closeSocket()
            sendEvent(
              "onConnectionChanged",
              mapOf("connected" to false, "sdkId" to "td404"),
            )
          }
          promise.reject("PRINT_FAILED", e.message, e)
        }
      }
    }

    /**
     * Native Android hardware-accelerated PDF renderer.
     * Converts any PDF URI (content:// or file://) into page Bitmaps/PNGs at target DPI.
     */
    AsyncFunction("renderPdfPages") { uriString: String, options: Map<String, Any?>?, promise: Promise ->
      ioExecutor.execute {
        var pfd: ParcelFileDescriptor? = null
        var renderer: PdfRenderer? = null
        var tempFile: File? = null
        try {
          val context = appContext.reactContext ?: throw IllegalStateException("No Android React Context available")
          val uri = Uri.parse(uriString)
          val targetDpi = (options?.get("dpi") as? Number)?.toDouble() ?: 203.0
          val maxPages = (options?.get("maxPages") as? Number)?.toInt() ?: 100

          val file = if (uri.scheme == "content" || (uri.scheme == null && !uriString.startsWith("/"))) {
            val tmp = File.createTempFile("pdf_render_", ".pdf", context.cacheDir)
            tempFile = tmp
            context.contentResolver.openInputStream(uri)?.use { input ->
              tmp.outputStream().use { output ->
                input.copyTo(output)
              }
            } ?: throw IOException("Cannot open input stream for: $uriString")
            tmp
          } else {
            val path = if (uri.scheme == "file") uri.path ?: uriString else uriString
            File(path)
          }

          pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
          renderer = PdfRenderer(pfd)
          val totalPages = renderer.pageCount
          val renderCount = minOf(totalPages, maxPages)
          val pagesList = mutableListOf<Map<String, Any?>>()
          val scale = targetDpi / 72.0

          for (i in 0 until renderCount) {
            val page = renderer.openPage(i)
            val pageW = page.width
            val pageH = page.height
            val w = Math.max(1, Math.round(pageW * scale).toInt())
            val h = Math.max(1, Math.round(pageH * scale).toInt())
            val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(Color.WHITE)
            val matrix = android.graphics.Matrix()
            matrix.setScale(w.toFloat() / pageW.toFloat(), h.toFloat() / pageH.toFloat())
            page.render(bitmap, null, matrix, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
            page.close()

            val stream = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.PNG, 95, stream)
            val base64 = android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP)
            bitmap.recycle()

            pagesList.add(
              mapOf(
                "pageIndex" to i,
                "widthPx" to w,
                "heightPx" to h,
                "widthMm" to (pageW * 25.4 / 72.0),
                "heightMm" to (pageH * 25.4 / 72.0),
                "base64" to base64,
              )
            )
          }

          promise.resolve(
            mapOf(
              "pageCount" to totalPages,
              "pages" to pagesList,
            )
          )
        } catch (e: Exception) {
          android.util.Log.e("Td404TejasPrinter", "renderPdfPages failed: ${e.message}", e)
          promise.reject("PDF_RENDER_FAILED", e.message, e)
        } finally {
          try { renderer?.close() } catch (_: Exception) {}
          try { pfd?.close() } catch (_: Exception) {}
          try { tempFile?.delete() } catch (_: Exception) {}
        }
      }
    }
  }

  private fun writeBytesToSocket(bytes: ByteArray, promise: Promise) {
    val sock = socket
    if (sock == null || !sock.isConnected) {
      promise.reject("NOT_CONNECTED", "No TD-404 printer connected.", null)
      return
    }
    ioExecutor.execute {
      try {
        val written = writeBytesToSocketSync(bytes)
        promise.resolve(mapOf("bytesSent" to written))
      } catch (e: IOException) {
        android.util.Log.e("Td404TejasPrinter", "SPP write failed, closing dead socket: ${e.message}")
        closeSocket()
        sendEvent(
          "onConnectionChanged",
          mapOf("connected" to false, "sdkId" to "td404"),
        )
        promise.reject("PRINT_FAILED", e.message, e)
      }
    }
  }

  /** Fire-and-forget SPP stream with pacing for large payloads to prevent UART buffer overrun. */
  private fun writeBytesToSocketSync(bytes: ByteArray): Int {
    val sock = socket
    if (sock == null || !sock.isConnected) {
      throw IOException("No TD-404 printer connected.")
    }
    val rawOut = sock.outputStream ?: throw IOException("Printer output stream unavailable.")
    val startMs = System.currentTimeMillis()

    // Fast path: small payloads (test prints, small labels <= 32KB) fit in printer RAM.
    // Stream directly with zero delay.
    if (bytes.size <= 32 * 1024) {
      rawOut.write(bytes)
      rawOut.flush()
      val totalMs = System.currentTimeMillis() - startMs
      android.util.Log.i("Td404TejasPrinter", "SPP fast write ${bytes.size} bytes in ${totalMs}ms")
      return bytes.size
    }

    // Paced path for large payloads (4x6 labels, 100KB–300KB):
    // Write in 1024-byte chunks with a micro-pause (3ms) — Ninestar vendor reference.
    val chunkSize = 1024
    var offset = 0
    while (offset < bytes.size) {
      val count = minOf(chunkSize, bytes.size - offset)
      rawOut.write(bytes, offset, count)
      rawOut.flush()
      offset += count
      if (offset < bytes.size) {
        try {
          Thread.sleep(3) // 3ms breather between 4KB packets prevents UART RX overrun
        } catch (_: InterruptedException) {
          Thread.currentThread().interrupt()
          break
        }
      }
    }
    val totalMs = System.currentTimeMillis() - startMs
    android.util.Log.i("Td404TejasPrinter", "SPP paced write ${bytes.size} bytes in ${totalMs}ms chunk=${1024}")
    return bytes.size
  }

  /**
   * Build a TSPL job with Ninestar LabelCommand (native bitmap packing) and
   * stream it over the open SPP socket. Matches vendor demo PrintContent.getLabel.
   */
  private fun printPngLabelNative(options: Map<String, Any?>): Map<String, Any?> {
    val pngBase64 = options["pngBase64"] as? String
      ?: throw IllegalArgumentException("pngBase64 is required")
    val widthMm = (options["widthMm"] as? Number)?.toDouble() ?: 50.0
    val heightMm = (options["heightMm"] as? Number)?.toDouble() ?: 30.0
    val gapMm = clampTd404GapMm((options["gapMm"] as? Number)?.toDouble() ?: 2.0)
    val density = clampTd404Density((options["density"] as? Number)?.toInt() ?: 10)
    val speed = clampTd404Speed((options["speed"] as? Number)?.toInt() ?: 3)
    val threshold = (options["threshold"] as? Number)?.toInt() ?: 160
    val xDots = (options["xDots"] as? Number)?.toInt() ?: 0
    val yDots = (options["yDots"] as? Number)?.toInt() ?: 0
    val copies = ((options["copies"] as? Number)?.toInt() ?: 1).coerceAtLeast(1)
    val media = normalizeTd404Media(options["media"] as? String)
    val orientation = (options["orientation"] as? Number)?.toInt() ?: 0
    val dpi = (options["dpi"] as? Number)?.toDouble() ?: 304.0
    // DIRECTION 1 matches the JS TSPL pipeline default. DIRECTION 0 mirrors the
    // bitmap along the feed axis, causing apparent zoom/offset vs the on-screen preview.
    val direction = (options["direction"] as? Number)?.toInt() ?: 1

    val t0 = System.currentTimeMillis()
    val raw = android.util.Base64.decode(pngBase64, android.util.Base64.DEFAULT)
    var bitmap = BitmapFactory.decodeByteArray(raw, 0, raw.size)
      ?: throw IllegalArgumentException("Could not decode PNG for print.")
    val pngW = bitmap.width
    val pngH = bitmap.height
    val tDecode = System.currentTimeMillis()

    val deg = ((orientation % 360) + 360) % 360
    if (deg == 90 || deg == 180 || deg == 270) {
      val matrix = Matrix().apply { postRotate(deg.toFloat()) }
      val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
      if (rotated !== bitmap) {
        bitmap.recycle()
        bitmap = rotated
      }
    }
    val tRotate = System.currentTimeMillis()

    // Same table as dotsPerMm(): 304 → 12, 203 → 8. No dpi/25.4.
    val dpm = td404DotsPerMm(dpi)
    val sizeDotsW = Math.max(1, Math.round(widthMm * dpm).toInt())
    val sizeDotsH = Math.max(1, Math.round(heightMm * dpm).toInt())
    // TSPL BITMAP is bytes×8. Never pack UP past SIZE-in-dots.
    val packedW = Math.max(8, (sizeDotsW / 8) * 8)
    val packedH = sizeDotsH
    bitmap = fitTd404Bitmap(bitmap, packedW, packedH)
    val fitMode = when {
      pngW == packedW && pngH == packedH -> "identity"
      pngW > packedW && pngW - packedW in 1..7 && pngH == packedH -> "crop"
      pngW % packedW == 0 && pngH % packedH == 0 -> "average"
      else -> "other"
    }

    val sizeCmd = "SIZE ${formatMm(widthMm)} mm,${formatMm(heightMm)} mm\r\n"

    val dither = (options["dither"] as? Boolean) ?: false
    val contentW = minOf(bitmap.width, packedW)
    val contentH = minOf(bitmap.height, packedH)
    val bytesPerRow = packedW / 8
    val pixels = IntArray(bitmap.width * bitmap.height)
    bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
    val rawBmp = ByteArray(bytesPerRow * contentH)

    // Pre-fill white (bit 1 set) so unused trailing bits stay blank
    java.util.Arrays.fill(rawBmp, 0xFF.toByte())

    if (!dither) {
      for (y in 0 until contentH) {
        val rowOffset = y * bytesPerRow
        val pixRowOffset = y * bitmap.width
        for (x in 0 until contentW) {
          val c = pixels[pixRowOffset + x]
          val r = (c shr 16) and 0xFF
          val g = (c shr 8) and 0xFF
          val b = c and 0xFF
          val lum = (77 * r + 150 * g + 29 * b) shr 8
          if (lum < threshold) {
            val byteIndex = rowOffset + (x shr 3)
            val bitIndex = 7 - (x and 7)
            rawBmp[byteIndex] = (rawBmp[byteIndex].toInt() and (1 shl bitIndex).inv()).toByte()
          }
        }
      }
    } else {
      // Native Floyd-Steinberg error diffusion for photo & halftone print quality
      val work = IntArray(contentW * contentH)
      for (y in 0 until contentH) {
        val pixRowOffset = y * bitmap.width
        val workRowOffset = y * contentW
        for (x in 0 until contentW) {
          val c = pixels[pixRowOffset + x]
          val r = (c shr 16) and 0xFF
          val g = (c shr 8) and 0xFF
          val b = c and 0xFF
          work[workRowOffset + x] = (77 * r + 150 * g + 29 * b) shr 8
        }
      }
      for (y in 0 until contentH) {
        val rowOffset = y * bytesPerRow
        val workRowOffset = y * contentW
        val hasNextRow = y + 1 < contentH
        val nextWorkRowOffset = workRowOffset + contentW
        for (x in 0 until contentW) {
          val idx = workRowOffset + x
          val oldLum = work[idx]
          val black = oldLum < threshold
          if (black) {
            val byteIndex = rowOffset + (x shr 3)
            val bitIndex = 7 - (x and 7)
            rawBmp[byteIndex] = (rawBmp[byteIndex].toInt() and (1 shl bitIndex).inv()).toByte()
          }
          val error = if (black) oldLum else (oldLum - 255)
          if (error != 0) {
            if (x + 1 < contentW) {
              work[idx + 1] += (error * 7) shr 4
            }
            if (hasNextRow) {
              if (x > 0) {
                work[nextWorkRowOffset + x - 1] += (error * 3) shr 4
              }
              work[nextWorkRowOffset + x] += (error * 5) shr 4
              if (x + 1 < contentW) {
                work[nextWorkRowOffset + x + 1] += error shr 4
              }
            }
          }
        }
      }
    }

    val gapCmd = when (media) {
      "bline" -> "BLINE ${formatGap(gapMm)} mm,0 mm\r\n"
      "continuous" -> "GAP 0.00 mm,0 mm\r\n"
      else -> "GAP ${formatGap(gapMm)} mm,0 mm\r\n"
    }

    val header = "\r\n" +
      sizeCmd +
      gapCmd +
      "SPEED $speed\r\n" +
      "DENSITY $density\r\n" +
      "DIRECTION $direction\r\n" +
      "SET TEAR ON\r\n" +
      tsplOriginAndBitmap(xDots, yDots, bytesPerRow, contentH)
    // TSPL PRINT m,n — one socket write for all copies (avoids re-sending bitmap per copy).
    val printCmd = if (copies <= 1) "PRINT 1\r\n" else "PRINT 1,$copies\r\n"
    val footer = "\r\n$printCmd"

    val headerBytes = header.toByteArray(Charsets.US_ASCII)
    val footerBytes = footer.toByteArray(Charsets.US_ASCII)

    val job = ByteArray(headerBytes.size + rawBmp.size + footerBytes.size)
    System.arraycopy(headerBytes, 0, job, 0, headerBytes.size)
    System.arraycopy(rawBmp, 0, job, headerBytes.size, rawBmp.size)
    System.arraycopy(footerBytes, 0, job, headerBytes.size + rawBmp.size, footerBytes.size)
    val tEncode = System.currentTimeMillis()
    val dryRun = optionsDryRun(options)
    logJobIdentity(options, dryRun)
    val headerLine = header.replace("\r\n", " | ").trim()
    val ink = wireInkMargins(rawBmp, bytesPerRow, packedW, contentH)
    android.util.Log.i("Td404TejasPrinter", "PRINT-HEADER native_rev=$nativeRev $headerLine")
    android.util.Log.i(
      "Td404TejasPrinter",
      "PRINT-INK native_rev=$nativeRev png=${pngW}x${pngH} fit=$fitMode packed=${packedW}x${contentH} $ink",
    )

    var totalSent = 0
    var writeMs = 0L
    if (dryRun) {
      android.util.Log.i(
        "Td404TejasPrinter",
        "PRINT-TRACE DRY-RUN SDK png=${pngW}x${pngH} packed=${packedW}x${packedH} " +
          "BITMAP=${bytesPerRow}x${contentH} job=${job.size}B (no socket write)",
      )
    } else {
      val tWrite0 = System.currentTimeMillis()
      totalSent = writeBytesToSocketSync(job)
      writeMs = System.currentTimeMillis() - tWrite0
      android.util.Log.i(
        "Td404TejasPrinter",
        "PRINT-TRACE SDK png=${pngW}x${pngH} packed=${packedW}x${packedH} sizeDots=${sizeDotsW}x${sizeDotsH} " +
          "dpm=$dpm dpi=$dpi SIZE=${formatMm(widthMm)}x${formatMm(heightMm)}mm " +
          "BITMAP=${bytesPerRow}x${contentH} DIRECTION=$direction job=${job.size}B copies=$copies " +
          "decode=${tDecode - t0}ms rotate=${tRotate - tDecode}ms encode=${tEncode - tRotate}ms write=${writeMs}ms",
      )
    }

    if (!bitmap.isRecycled) bitmap.recycle()

    val result = mutableMapOf<String, Any?>(
      "bytesSent" to totalSent,
      "jobBytes" to job.size,
      "copies" to copies,
      "decodeMs" to (tDecode - t0),
      "encodeMs" to (tEncode - tRotate),
      "writeMs" to writeMs,
      "path" to "labelcommand-sdk",
      "dryRun" to dryRun,
      "nativeRev" to nativeRev,
      "reference" to "$xDots,$yDots",
      "bitmapX" to 0,
      "bitmapY" to 0,
      "requestedX" to xDots,
      "requestedY" to yDots,
      "pngWidth" to pngW,
      "pngHeight" to pngH,
      "fit" to fitMode,
      "marginL" to ink.marginL,
      "marginR" to ink.marginR,
      "marginT" to ink.marginT,
      "marginB" to ink.marginB,
    )
    if (dryRun) {
      result["jobBase64"] = android.util.Base64.encodeToString(job, android.util.Base64.NO_WRAP)
      result["wireBmpBase64"] = android.util.Base64.encodeToString(rawBmp, android.util.Base64.NO_WRAP)
      result["bytesPerRow"] = bytesPerRow
      result["heightDots"] = contentH
      result["widthDots"] = packedW
      result["gitSha"] = optionsGitSha(options)
      result["buildTime"] = optionsBuildTime(options)
    }
    return result
  }

  /**
   * Packed 1-bit (logical black=1) → TSPL BITMAP wire (black=0). Header matches printPngLabelNative.
   */
  private fun printMonoLabelNative(monoBytes: ByteArray, options: Map<String, Any?>): Map<String, Any?> {
    val widthMm = (options["widthMm"] as? Number)?.toDouble() ?: 50.0
    val heightMm = (options["heightMm"] as? Number)?.toDouble() ?: 30.0
    val gapMm = clampTd404GapMm((options["gapMm"] as? Number)?.toDouble() ?: 2.0)
    val density = clampTd404Density((options["density"] as? Number)?.toInt() ?: 10)
    val speed = clampTd404Speed((options["speed"] as? Number)?.toInt() ?: 3)
    val xDots = (options["xDots"] as? Number)?.toInt() ?: 0
    val yDots = (options["yDots"] as? Number)?.toInt() ?: 0
    val copies = ((options["copies"] as? Number)?.toInt() ?: 1).coerceAtLeast(1)
    val media = normalizeTd404Media(options["media"] as? String)
    val dpi = (options["dpi"] as? Number)?.toDouble() ?: 304.0
    val direction = (options["direction"] as? Number)?.toInt() ?: 1
    val widthDots = (options["widthDots"] as? Number)?.toInt()
      ?: throw IllegalArgumentException("widthDots is required")
    val heightDots = (options["heightDots"] as? Number)?.toInt()
      ?: throw IllegalArgumentException("heightDots is required")
    val bytesPerRow = (options["bytesPerRow"] as? Number)?.toInt()
      ?: throw IllegalArgumentException("bytesPerRow is required")

    val dpm = td404DotsPerMm(dpi)
    val sizeDotsW = Math.max(1, Math.round(widthMm * dpm).toInt())
    val sizeDotsH = Math.max(1, Math.round(heightMm * dpm).toInt())
    val packedW = Math.max(8, (sizeDotsW / 8) * 8)
    val packedH = sizeDotsH

    if (bytesPerRow * 8 != packedW) {
      throw IllegalArgumentException(
        "TD-404 mono buffer bytesPerRow*8 (${bytesPerRow * 8}) != packedW ($packedW) for ${widthMm}x${heightMm}mm @ ${dpi.toInt()} dpi",
      )
    }
    if (widthDots != packedW) {
      throw IllegalArgumentException(
        "TD-404 mono widthDots ($widthDots) != packedW ($packedW)",
      )
    }
    if (heightDots != packedH) {
      throw IllegalArgumentException(
        "TD-404 mono heightDots ($heightDots) != packedH ($packedH)",
      )
    }
    val expectedLen = bytesPerRow * heightDots
    if (monoBytes.size != expectedLen) {
      throw IllegalArgumentException(
        "TD-404 mono buffer length ${monoBytes.size} != bytesPerRow*heightDots ($expectedLen)",
      )
    }

    val wireBmp = ByteArray(expectedLen)
    for (i in 0 until expectedLen) {
      wireBmp[i] = (monoBytes[i].toInt() xor 0xFF).toByte()
    }
    val ink = wireInkMargins(wireBmp, bytesPerRow, packedW, heightDots)
    android.util.Log.i(
      "Td404TejasPrinter",
      "PRINT-INK MONO native_rev=$nativeRev packed=${packedW}x${heightDots} REFERENCE=${xDots},${yDots} BITMAP=0,0 $ink",
    )

    val sizeCmd = "SIZE ${formatMm(widthMm)} mm,${formatMm(heightMm)} mm\r\n"
    val gapCmd = when (media) {
      "bline" -> "BLINE ${formatGap(gapMm)} mm,0 mm\r\n"
      "continuous" -> "GAP 0.00 mm,0 mm\r\n"
      else -> "GAP ${formatGap(gapMm)} mm,0 mm\r\n"
    }
    val header = "\r\n" +
      sizeCmd +
      gapCmd +
      "SPEED $speed\r\n" +
      "DENSITY $density\r\n" +
      "DIRECTION $direction\r\n" +
      "SET TEAR ON\r\n" +
      tsplOriginAndBitmap(xDots, yDots, bytesPerRow, heightDots)
    val printCmd = if (copies <= 1) "PRINT 1\r\n" else "PRINT 1,$copies\r\n"
    val footer = "\r\n$printCmd"

    val headerBytes = header.toByteArray(Charsets.US_ASCII)
    val footerBytes = footer.toByteArray(Charsets.US_ASCII)
    val job = ByteArray(headerBytes.size + wireBmp.size + footerBytes.size)
    System.arraycopy(headerBytes, 0, job, 0, headerBytes.size)
    System.arraycopy(wireBmp, 0, job, headerBytes.size, wireBmp.size)
    System.arraycopy(footerBytes, 0, job, headerBytes.size + wireBmp.size, footerBytes.size)

    val dryRun = optionsDryRun(options)
    logJobIdentity(options, dryRun)

    var totalSent = 0
    var writeMs = 0L
    if (dryRun) {
      android.util.Log.i(
        "Td404TejasPrinter",
        "PRINT-TRACE DRY-RUN MONO packed=${packedW}x${packedH} BITMAP=${bytesPerRow}x${heightDots} job=${job.size}B (no socket write)",
      )
    } else {
      val tWrite0 = System.currentTimeMillis()
      totalSent = writeBytesToSocketSync(job)
      writeMs = System.currentTimeMillis() - tWrite0
      android.util.Log.i(
        "Td404TejasPrinter",
        "PRINT-TRACE MONO packed=${packedW}x${packedH} sizeDots=${sizeDotsW}x${sizeDotsH} " +
          "dpm=$dpm dpi=$dpi SIZE=${formatMm(widthMm)}x${formatMm(heightMm)}mm " +
          "BITMAP=${bytesPerRow}x${heightDots} DIRECTION=$direction job=${job.size}B copies=$copies " +
          "write=${writeMs}ms bytesSent=$totalSent",
      )
    }

    val result = mutableMapOf<String, Any?>(
      "bytesSent" to totalSent,
      "jobBytes" to job.size,
      "copies" to copies,
      "writeMs" to writeMs,
      "path" to "mono-bitmap",
      "dryRun" to dryRun,
      "reference" to "$xDots,$yDots",
      "bitmapX" to 0,
      "bitmapY" to 0,
      "marginL" to ink.marginL,
      "marginR" to ink.marginR,
      "marginT" to ink.marginT,
      "marginB" to ink.marginB,
    )
    if (dryRun) {
      result["jobBase64"] = android.util.Base64.encodeToString(job, android.util.Base64.NO_WRAP)
      result["wireBmpBase64"] = android.util.Base64.encodeToString(wireBmp, android.util.Base64.NO_WRAP)
      result["bytesPerRow"] = bytesPerRow
      result["heightDots"] = heightDots
      result["widthDots"] = packedW
      result["gitSha"] = optionsGitSha(options)
      result["buildTime"] = optionsBuildTime(options)
    }
    return result
  }


  /** TSPL wire: bit 1 is white, bit 0 is black. Margins are dots from the packed bitmap edge. */
  private class WireInk(
    val marginL: Int,
    val marginR: Int,
    val marginT: Int,
    val marginB: Int,
  ) {
    override fun toString(): String = "L$marginL R$marginR T$marginT B$marginB"
  }

  private fun wireInkMargins(raw: ByteArray, bytesPerRow: Int, width: Int, height: Int): WireInk {
    var minX = width
    var minY = height
    var maxX = -1
    var maxY = -1
    for (y in 0 until height) {
      val row = y * bytesPerRow
      for (x in 0 until width) {
        val b = raw[row + (x shr 3)].toInt() and 0xFF
        val bit = 7 - (x and 7)
        val white = ((b shr bit) and 1) == 1
        if (!white) {
          if (x < minX) minX = x
          if (y < minY) minY = y
          if (x > maxX) maxX = x
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) return WireInk(width, width, height, height)
    return WireInk(minX, width - 1 - maxX, minY, height - 1 - maxY)
  }

  /**
   * Calibration lives on REFERENCE (signed dots). BITMAP stays 0,0 so a
   * negative origin shift does not crop left/top ink out of the payload.
   */
  private fun tsplOriginAndBitmap(xDots: Int, yDots: Int, bytesPerRow: Int, heightDots: Int): String {
    return "OFFSET 0 mm\r\n" +
      "REFERENCE $xDots,$yDots\r\n" +
      "CLS\r\n" +
      "BITMAP 0,0,$bytesPerRow,$heightDots,0,"
  }

  /** 304 → 12 dots/mm, 203 → 8. Matches print-spec dotsPerMm. Other dpi values are rejected. */
  private fun td404DotsPerMm(dpi: Double): Double {
    if (dpi == 304.0) return 12.0
    if (dpi == 203.0) return 8.0
    throw IllegalArgumentException("TD-404 dpi $dpi is not 203 or 304")
  }

  /**
   * Pack the capture only when it is already the packed size, or an integer
   * supersample of it (box-average, no bilinear filter). Any other size fails.
   */
  private fun fitTd404Bitmap(bitmap: Bitmap, packedW: Int, packedH: Int): Bitmap {
    val srcW = bitmap.width
    val srcH = bitmap.height
    if (srcW == packedW && srcH == packedH) return bitmap
    // SIZE-in-dots capture can be up to 7 columns wider than packed BITMAP width.
    // Crop from the top-left (same as JS prepareEditorGrayForPrint) — never scale.
    val cropW = srcW - packedW
    if (srcH == packedH && cropW in 1..7) {
      val cropped = Bitmap.createBitmap(bitmap, 0, 0, packedW, packedH)
      if (cropped !== bitmap) {
        bitmap.recycle()
      }
      android.util.Log.i(
        "Td404TejasPrinter",
        "PRINT-TRACE BITMAP_CROP src=${srcW}x${srcH} packed=${packedW}x${packedH} cropRight=$cropW",
      )
      return cropped
    }
    if (packedW <= 0 || packedH <= 0 || srcW % packedW != 0 || srcH % packedH != 0) {
      throw IllegalArgumentException(
        "TD-404 bitmap ${srcW}x${srcH} is not packed ${packedW}x${packedH} and is not an integer supersample. Refusing to resize.",
      )
    }
    val scaleX = srcW / packedW
    val scaleY = srcH / packedH
    if (scaleX != scaleY) {
      throw IllegalArgumentException(
        "TD-404 bitmap ${srcW}x${srcH} supersample is not square (${scaleX}x${scaleY}). Refusing to resize.",
      )
    }
    val scale = scaleX
    val src = IntArray(srcW * srcH)
    bitmap.getPixels(src, 0, srcW, 0, 0, srcW, srcH)
    val dst = IntArray(packedW * packedH)
    val samples = scale * scale
    for (y in 0 until packedH) {
      for (x in 0 until packedW) {
        var acc = 0
        for (dy in 0 until scale) {
          val row = (y * scale + dy) * srcW + x * scale
          for (dx in 0 until scale) {
            val c = src[row + dx]
            val r = (c shr 16) and 0xFF
            val g = (c shr 8) and 0xFF
            val b = c and 0xFF
            acc += (77 * r + 150 * g + 29 * b) shr 8
          }
        }
        val lum = acc / samples
        dst[y * packedW + x] = (0xFF shl 24) or (lum shl 16) or (lum shl 8) or lum
      }
    }
    val out = Bitmap.createBitmap(packedW, packedH, Bitmap.Config.ARGB_8888)
    out.setPixels(dst, 0, packedW, 0, 0, packedW, packedH)
    if (out !== bitmap) bitmap.recycle()
    android.util.Log.i(
      "Td404TejasPrinter",
      "PRINT-TRACE BITMAP_AVERAGE src=${srcW}x${srcH} packed=${packedW}x${packedH} scale=$scale",
    )
    return out
  }

  private fun optionsDryRun(options: Map<String, Any?>): Boolean =
    (options["dryRun"] as? Boolean) == true

  private fun optionsGitSha(options: Map<String, Any?>): String =
    (options["gitSha"] as? String)?.ifBlank { null } ?: "unknown"

  private fun optionsBuildTime(options: Map<String, Any?>): String =
    (options["buildTime"] as? String)?.ifBlank { null } ?: "unknown"

  private fun logJobIdentity(options: Map<String, Any?>, dryRun: Boolean) {
    android.util.Log.i(
      "Td404TejasPrinter",
      "JOB-IDENTITY native_rev=$nativeRev gitSha=${optionsGitSha(options)} buildTime=${optionsBuildTime(options)} dryRun=$dryRun",
    )
  }

  /** Same limits as src/lib/printer/td404-job-params.ts. */
  private fun clampTd404Density(value: Int): Int = value.coerceIn(0, 15)

  private fun clampTd404Speed(value: Int): Int = value.coerceIn(1, 7)

  private fun clampTd404GapMm(value: Double): Double {
    val clamped = value.coerceIn(0.0, 20.0)
    return Math.round(clamped * 100.0) / 100.0
  }

  private fun normalizeTd404Media(media: String?): String = when (media) {
    "bline", "continuous" -> media
    else -> "gap"
  }

  private fun formatGap(gapMm: Double): String = formatMm(gapMm)

  private fun formatMm(mm: Double): String {
    val rounded = Math.round(mm * 100.0) / 100.0
    return String.format(java.util.Locale.US, "%.2f", rounded)
  }



  @SuppressLint("MissingPermission")
  private fun openSppSocket(device: BluetoothDevice, generation: Int): BluetoothSocket {
    val isBonded = try {
      device.bondState == BluetoothDevice.BOND_BONDED
    } catch (_: SecurityException) {
      false
    }

    val attempts = if (isBonded) {
      listOf(
        "secure-rfcomm" to { device.createRfcommSocketToServiceRecord(sppUuid) },
        "insecure-rfcomm" to { device.createInsecureRfcommSocketToServiceRecord(sppUuid) },
        "channel-1" to {
          val method = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
          method.invoke(device, 1) as BluetoothSocket
        },
      )
    } else {
      listOf(
        "insecure-rfcomm" to { device.createInsecureRfcommSocketToServiceRecord(sppUuid) },
        "secure-rfcomm" to { device.createRfcommSocketToServiceRecord(sppUuid) },
        "channel-1" to {
          val method = device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
          method.invoke(device, 1) as BluetoothSocket
        },
      )
    }

    var lastError: Exception? = null
    for ((name, makeSocket) in attempts) {
      var sock: BluetoothSocket? = null
      try {
        android.util.Log.i("Td404TejasPrinter", "Opening SPP socket via $name...")
        sock = makeSocket()
        if (generation != connectGeneration.get()) {
          try { sock?.close() } catch (_: Exception) {}
          throw IOException("Connection replaced by a newer printer.")
        }
        pendingSocket = sock
        connectWithTimeout(sock!!, connectTimeoutMs)
        if (generation != connectGeneration.get()) {
          try { sock?.close() } catch (_: Exception) {}
          if (pendingSocket === sock) pendingSocket = null
          throw IOException("Connection replaced by a newer printer.")
        }
        if (pendingSocket === sock) pendingSocket = null
        android.util.Log.i("Td404TejasPrinter", "SPP socket connected successfully via $name")
        return sock!!
      } catch (e: Exception) {
        if (generation != connectGeneration.get()) {
          try { sock?.close() } catch (_: Exception) {}
          if (pendingSocket === sock) pendingSocket = null
          throw IOException("Connection replaced by a newer printer.")
        }
        android.util.Log.w("Td404TejasPrinter", "SPP attempt via $name failed: ${e.message}")
        lastError = e
        try {
          sock?.close()
        } catch (_: Exception) {
        }
        if (pendingSocket === sock) pendingSocket = null
        try {
          Thread.sleep(200)
        } catch (_: InterruptedException) {
          Thread.currentThread().interrupt()
          break
        }
      }
    }
    throw lastError ?: IOException("Could not open Bluetooth SPP socket.")
  }

  private fun connectWithTimeout(sock: BluetoothSocket, timeoutMs: Long) {
    val done = CountDownLatch(1)
    var error: Exception? = null
    val worker = Thread({
      try {
        sock.connect()
      } catch (e: Exception) {
        error = e
      } finally {
        done.countDown()
      }
    }, "td404-spp-connect")
    worker.isDaemon = true
    worker.start()
    if (!done.await(timeoutMs, TimeUnit.MILLISECONDS)) {
      try {
        sock.close()
      } catch (_: Exception) {
      }
      throw IOException("Printer did not accept the connection in time. Keep it on and close other phone connections.")
    }
    error?.let { throw it }
  }

  /** Bonds with an unpaired printer and waits for the result. False when declined, failed or timed out. */
  @SuppressLint("MissingPermission")
  private fun pairBlocking(context: Context, adapter: BluetoothAdapter, mac: String, timeoutMs: Long): Boolean {
    val device = try { adapter.getRemoteDevice(mac.uppercase()) } catch (_: Exception) { return false }
    if (device.bondState == BluetoothDevice.BOND_BONDED) return true

    // An active inquiry makes bonding fail or crawl.
    if (adapter.isDiscovering) {
      adapter.cancelDiscovery()
      var waited = 0
      while (adapter.isDiscovering && waited < 2000) {
        Thread.sleep(100)
        waited += 100
      }
    }

    val latch = CountDownLatch(1)
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(c: Context?, intent: Intent?) {
        if (intent == null) return
        @Suppress("DEPRECATION")
        val d = intent.getParcelableExtra<BluetoothDevice>(BluetoothDevice.EXTRA_DEVICE)
        if (d?.address != device.address) return
        val state = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.BOND_NONE)
        val previous = intent.getIntExtra(BluetoothDevice.EXTRA_PREVIOUS_BOND_STATE, BluetoothDevice.BOND_NONE)
        // Done when bonded, or when bonding ended back at none (declined / failed).
        if (state == BluetoothDevice.BOND_BONDED ||
          (state == BluetoothDevice.BOND_NONE && previous == BluetoothDevice.BOND_BONDING)
        ) latch.countDown()
      }
    }
    val filter = IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
    // System BT broadcasts (bond state) require RECEIVER_EXPORTED on API 33+.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      context.registerReceiver(receiver, filter)
    }
    return try {
      val started = device.createBond()
      if (!started && device.bondState != BluetoothDevice.BOND_BONDING) {
        false
      } else {
        latch.await(timeoutMs, TimeUnit.MILLISECONDS)
        device.bondState == BluetoothDevice.BOND_BONDED
      }
    } finally {
      try { context.unregisterReceiver(receiver) } catch (_: Exception) {}
    }
  }

  private fun ensureReceiver() {
    if (receiverRegistered) return
    val context = appContext.reactContext ?: return
    val filter = IntentFilter().apply {
      addAction(BluetoothDevice.ACTION_FOUND)
      addAction(BluetoothDevice.ACTION_NAME_CHANGED)
      addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
    }
    // ACTION_FOUND / NAME_CHANGED / DISCOVERY_FINISHED are sent by the system Bluetooth
    // stack. RECEIVER_NOT_EXPORTED drops them on API 33+, so unpaired printers never appear
    // (bonded list still works via getBondedDevices). Match DevPrinterModule: EXPORTED.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      context.registerReceiver(discoveryReceiver, filter, Context.RECEIVER_EXPORTED)
    } else {
      context.registerReceiver(discoveryReceiver, filter)
    }
    receiverRegistered = true
  }

  private fun unregisterReceiverSafe() {
    if (!receiverRegistered) return
    try {
      appContext.reactContext?.unregisterReceiver(discoveryReceiver)
    } catch (_: Exception) {
    }
    receiverRegistered = false
  }

  /**
   * API 33+ BluetoothDevice.getBatteryLevel() for the remote printer.
   * Called by reflection because some compile stubs omit the method. -1 means unknown.
   */
  @SuppressLint("MissingPermission")
  private fun readRemoteBatteryLevelForMac(mac: String): Int {
    val context = appContext.reactContext
    if (context == null || !hasConnectPermission(context) || Build.VERSION.SDK_INT < 33) {
      return -1
    }
    val adapter = getAdapter() ?: return -1
    return try {
      readRemoteBatteryLevel(adapter.getRemoteDevice(mac))
    } catch (_: Exception) {
      -1
    }
  }

  @SuppressLint("MissingPermission")
  private fun readRemoteBatteryLevel(device: BluetoothDevice): Int {
    if (Build.VERSION.SDK_INT < 33) return -1
    return try {
      val level = BluetoothDevice::class.java.getMethod("getBatteryLevel").invoke(device) as? Int ?: -1
      if (level in 0..100) level else -1
    } catch (_: Throwable) {
      -1
    }
  }

  private fun getAdapter(): BluetoothAdapter? {
    val context = appContext.reactContext ?: return null
    val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    return manager?.adapter ?: @Suppress("DEPRECATION") BluetoothAdapter.getDefaultAdapter()
  }

  private fun hasConnectPermission(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
        PackageManager.PERMISSION_GRANTED
    } else {
      true
    }
  }

  private fun hasPermissions(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val scan = ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) ==
        PackageManager.PERMISSION_GRANTED
      val connect = hasConnectPermission(context)
      // Location helps classic discovery on some OEMs but must not block bonded listing.
      scan && connect
    } else {
      ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
    }
  }

  @SuppressLint("MissingPermission")
  private fun deviceToMap(device: BluetoothDevice, bonded: Boolean, nameHint: String? = null): Map<String, Any?> {
    val systemName = try {
      device.name
    } catch (_: SecurityException) {
      null
    }
    val name = systemName?.takeIf { it.isNotBlank() } ?: nameHint?.takeIf { it.isNotBlank() }
    val displayName = if (name.isNullOrBlank()) "Bluetooth ${device.address}" else name
    return mapOf(
      "id" to device.address,
      "name" to displayName,
      "rawName" to name,
      "bonded" to bonded,
      "transport" to "bluetooth-spp",
      "sdkId" to "td404",
      "likelyTd404" to (isLikelyTd404(name) || isLikelyTd404(displayName)),
      // Android's own view of the device: the real printer link is the classic one with the
      // printer (imaging) class, whatever the name. A Low Energy twin has the same name stem.
      "deviceType" to when (device.type) {
        BluetoothDevice.DEVICE_TYPE_CLASSIC -> "classic"
        BluetoothDevice.DEVICE_TYPE_LE -> "le"
        BluetoothDevice.DEVICE_TYPE_DUAL -> "dual"
        else -> "unknown"
      },
      "printerClass" to (device.bluetoothClass?.majorDeviceClass == android.bluetooth.BluetoothClass.Device.Major.IMAGING),
    )
  }

  @SuppressLint("MissingPermission")
  private fun emitDevice(device: BluetoothDevice, bonded: Boolean, nameHint: String? = null) {
    sendEvent("onDeviceFound", deviceToMap(device, bonded, nameHint))
  }

  private fun isLikelyTd404(name: String?): Boolean {
    if (name.isNullOrBlank()) return false
    val n = name.lowercase()
    return n.contains("td-404") ||
      n.contains("td404") ||
      n.contains("td 404") ||
      n.contains("ninestar") ||
      n.contains("nsprinter") ||
      n.contains("labelprinter") ||
      n.contains("label printer") ||
      n.contains("tpl") ||
      n.startsWith("btprinter") ||
      n.contains("gp-") ||
      n.contains("printer")
  }

  /**
   * Non-destructive socket health check.
   * Verifies both socket.isConnected and that the outputStream is accessible.
   * On some Android devices, socket.isConnected stays true even after the
   * physical BT link drops — checking outputStream catches those cases.
   */
  private fun isSocketAlive(): Boolean {
    val sock = socket ?: return false
    return try {
      sock.isConnected && sock.outputStream != null
    } catch (_: Exception) {
      false
    }
  }

  private fun closePendingSocket() {
    val pending = pendingSocket
    pendingSocket = null
    try {
      pending?.close()
    } catch (_: Exception) {
    }
  }

  private fun closeSocket() {
    closePendingSocket()
    try {
      socket?.close()
    } catch (_: Exception) {
    }
    socket = null
    connectedMac = null
    connectedName = null
  }
}
