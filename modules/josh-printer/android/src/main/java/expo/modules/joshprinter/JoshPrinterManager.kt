package expo.modules.joshprinter

import android.bluetooth.BluetoothAdapter
import android.content.Context
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.dothantech.lpapi.LPAPI
import com.dothantech.printer.IDzPrinter
import com.dothantech.printer.IDzPrinter.AddressType
import com.dothantech.printer.IDzPrinter.PrintParamName
import com.dothantech.printer.IDzPrinter.PrintProgress
import com.dothantech.printer.IDzPrinter.PrinterAddress
import com.dothantech.printer.IDzPrinter.PrinterState
import com.dothantech.printer.IDzPrinter.ProgressInfo
import com.dothantech.printer.IDzPrinter2
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.atomic.AtomicReference
import java.util.concurrent.locks.ReentrantLock
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round

/**
 * JOSH / DothanTech LPAPI printer lifecycle manager.
 *
 * Owns a single LPAPI instance. Provides:
 *  • Explicit state machine (no bare booleans)
 *  • Serialized print queue (one job at a time)
 *  • Connection guard (no duplicate openPrinterByAddress calls)
 *  • Auto-reconnection with exponential backoff
 *  • Print timeout (never stuck in PRINTING)
 *  • Thread-safe callback marshalling to main thread
 *
 * This class is NOT an Activity. It survives screen navigation.
 */
class JoshPrinterManager(private val context: Context) {

    companion object {
        private const val TAG = "JoshPrinter"
        private const val BATTERY_DEBUG_TAG = "JoshBattery"
        private const val BATTERY_POLL_MS = 300L
        private const val BATTERY_POLL_TIMEOUT_MS = 3_000L
        private const val DISCOVERY_TIMEOUT_MS = 15_000L
        private const val CONNECT_TIMEOUT_MS = 20_000L
        private const val CONNECT_RETRY_DELAY_MS = 1_500L
        private const val CONNECT_MAX_ATTEMPTS = 2
        private const val PRINT_TIMEOUT_MS = 15_000L
        private const val PRINT_SUBMIT_FALLBACK_MS = 800L
        /** Narrow strip — fits 50×15 mm and top band of 25×25 mm. */
        const val TEST_LABEL_WIDTH_MM = 50.0
        const val TEST_LABEL_HEIGHT_MM = 15.0
        const val TEST_LABEL_DEFAULT_TEXT = "test print sent by sez print"
        /** Match JS `JOSH_MEDIA_ORIGIN_H_MM` + `JOSH_LPAPI_DRAW_BIAS_H_MM` (print-spec / josh-print). */
        private const val JOSH_MEDIA_ORIGIN_H_MM = 0.0
        private const val JOSH_LPAPI_DRAW_BIAS_H_MM = -1.0
        private const val JOSH_LPAPI_DRAW_BIAS_V_MM = -1.0
        /** Match JS `JOSH_TEST_LABEL_EXTRA_H_MM` — test strip only. */
        private const val TEST_LABEL_EXTRA_H_MM = 2.0
        private const val MAX_RECONNECT_ATTEMPTS = 3
        private val RECONNECT_DELAYS_MS = longArrayOf(1000, 2000, 4000)

        // Default print parameters — -1 means use printer hardware defaults
        const val DEFAULT_DENSITY = -1   // -1 = use printer default (safe for all models)
        const val DEFAULT_SPEED = -1     // -1 = use printer default
        const val DEFAULT_GAP_TYPE = -1  // -1 = use printer default
        const val DEFAULT_GAP_LENGTH_MM = -1.0
        const val LABEL_GAP_MM = 3.0

        /**
         * PrintParamName.GAP_LENGTH is an alias of GAP_LENGTH_01MM (0.01 mm units), and
         * setPrintPageGapLength(int) uses the same wire encoding, so both take mm × 100.
         */
        fun gapMmTo01mm(gapMm: Double): Int = Math.round(gapMm * 100.0).toInt()
        /** DothanTech JOSH heads are 203 DPI. 304 is TD-404 and must not size the bitmap. */
        const val HARDWARE_DPI = 203.0
        const val HARDWARE_DPM = 8.0
        /** Official demo: Label / 间隙纸. Die-cut 50×30 stock. */
        const val GAP_TYPE_LABEL = 2
        const val GAP_TYPE_RECEIPT = 0
        const val GAP_TYPE_BLACK_MARK = 3
    }

    // ─── State Machine ─────────────────────────────────────────────────

    enum class State {
        IDLE,
        SCANNING,
        CONNECTING,
        CONNECTED,
        DISCONNECTING,
        DISCONNECTED,
        PRINTING,
        PRINT_SUCCESS,
        PRINT_FAILED,
        RECONNECTING,
        ERROR
    }

    private val state = AtomicReference(State.IDLE)
    private val mainHandler = Handler(Looper.getMainLooper())

    // ─── Connection ────────────────────────────────────────────────────

    private val isConnecting = AtomicBoolean(false)
    private val isDiscovering = AtomicBoolean(false)
    private var connectedPrinterAddress: PrinterAddress? = null
    private var connectedPrinterName: String? = null
    private var connectedMacAddress: String? = null
    private var connectingMacAddress: String? = null
    private var lastConnectedAddress: PrinterAddress? = null
    private val lastConnectedAt = AtomicLong(0)
    private var connectLatch: CountDownLatch? = null
    /** Bumped on every new connect or explicit disconnect so a stale attempt cannot reclaim the bridge. */
    private val connectToken = AtomicInteger(0)
    /** While set, an unexpected LPAPI disconnect must not reconnect the previous printer. */
    private val suppressNativeReconnect = AtomicBoolean(false)
    private val batteryDebugScheduled = AtomicBoolean(false)

    // ─── Discovery ─────────────────────────────────────────────────────

    private val discoveredPrinters = ConcurrentHashMap<String, PrinterAddress>()
    private var discoveryTimer: Runnable? = null

    // ─── Print Queue ───────────────────────────────────────────────────

    private val printLock = ReentrantLock()
    private val isPrinting = AtomicBoolean(false)
    private var printLatch: CountDownLatch? = null
    private var lastPrintSuccess = false
    /** true only for a genuine PrintProgress.Success ACK from the printer hardware;
     *  false when DataEnded's 200ms no-ACK fallback completed the job instead. */
    private var lastPrintConfirmedByDevice = false
    private val jobIdCounter = AtomicInteger(0)
    private var printSubmitFallback: Runnable? = null
    private var printDataEndedFallback: Runnable? = null

    // ─── Configuration ─────────────────────────────────────────────────

    private var density = DEFAULT_DENSITY
    private var speed = DEFAULT_SPEED
    private var gapType = DEFAULT_GAP_TYPE
    private var gapLengthMm = DEFAULT_GAP_LENGTH_MM

    // ─── Last Error ────────────────────────────────────────────────────

    @Volatile
    var lastError: String? = null
        private set

    // ─── Event Listener ────────────────────────────────────────────────

    interface EventListener {
        fun onStateChanged(state: State, data: Map<String, Any?>)
        fun onPrinterDiscovered(printer: Map<String, Any?>)
        fun onPrintProgress(jobId: String, progress: String, data: Map<String, Any?>)
        fun onError(code: String, message: String)
    }

    @Volatile
    var listener: EventListener? = null

    // ─── LPAPI ─────────────────────────────────────────────────────────

    private var api: LPAPI? = null
    private val apiInitialized = AtomicBoolean(false)

    private val lpapiCallback = object : LPAPI.Callback {

        override fun onStateChange(address: PrinterAddress?, printerState: PrinterState?) {
            Log.i(TAG, "[JOSH-CONN-P4:STATE_CHANGE] address=${address?.shownName ?: address?.macAddress} state=$printerState (group=${printerState?.group()})")
            val isConn = printerState == PrinterState.Connected ||
                         printerState == PrinterState.Connected2 ||
                         printerState?.group() == 2 ||
                         (printerState?.name?.contains("Connected", ignoreCase = true) == true)
            if (isConn) {
                mainHandler.post { handleConnected(address) }
            } else if (printerState == PrinterState.Disconnected || printerState?.group() == 0) {
                mainHandler.post { handleDisconnected() }
            } else if (printerState == PrinterState.Connecting || printerState?.group() == 1) {
                Log.d(TAG, "[JOSH-CONN-P3:STATE_CHANGE] Connecting in progress...")
            } else {
                Log.d(TAG, "[JOSH-CONN-P3:STATE_CHANGE] State: $printerState")
            }
        }

        override fun onProgressInfo(info: ProgressInfo?, data: Any?) {
            Log.d(TAG, "[JOSH-INFO] info=$info")
        }

        override fun onPrinterDiscovery(address: PrinterAddress?, data: Any?) {
            if (address == null) return
            mainHandler.post { handlePrinterDiscovered(address) }
        }

        override fun onPrintProgress(
            address: PrinterAddress?,
            bitmapData: IDzPrinter.PrintData?,
            progress: PrintProgress?,
            addiInfo: Any?
        ) {
            Log.i(TAG, "[JOSH-PRINT-P4:HARDWARE-PROGRESS] progress=$progress addiInfo=$addiInfo")
            when (progress) {
                PrintProgress.Success -> {
                    Log.i(TAG, "[JOSH-PRINT-P4:HARDWARE-ACK] Physical print confirmed by printer hardware!")
                    cancelPrintFallbacks()
                    lastPrintSuccess = true
                    lastPrintConfirmedByDevice = true
                    printLatch?.countDown()
                    mainHandler.post { handlePrintSuccess() }
                }
                PrintProgress.Failed -> {
                    cancelPrintFallbacks()
                    lastPrintSuccess = false
                    val reason = addiInfo?.toString() ?: "Print job failed"
                    Log.e(TAG, "[JOSH-PRINT-P4:HARDWARE-FAIL] Physical print failed at hardware level: $reason")
                    lastError = "JOSH_PRINT_FAILED: $reason"
                    printLatch?.countDown()
                    mainHandler.post { handlePrintFailed(reason) }
                }
                PrintProgress.DataEnded -> {
                    Log.i(TAG, "[JOSH-PRINT-P3:DATA-TRANSMITTED] Bluetooth byte transmission completed, waiting for hardware print confirmation...")
                    printDataEndedFallback?.let { mainHandler.removeCallbacks(it) }
                    val dataEndedRunnable = Runnable {
                        if (printLatch != null && isPrinting.get() && !lastPrintSuccess) {
                            Log.i(TAG, "[JOSH-PRINT-P4:FALLBACK-SUCCESS] DataEnded confirmed and safety timer elapsed; completing print.")
                            lastPrintSuccess = true
                            printLatch?.countDown()
                            handlePrintSuccess()
                        }
                    }
                    printDataEndedFallback = dataEndedRunnable
                    mainHandler.postDelayed(dataEndedRunnable, 200)
                }
                else -> {
                    Log.d(TAG, "[JOSH-PRINT-P4:HARDWARE-PROGRESS] $progress (info=$addiInfo)")
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Initialization
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Initialize the LPAPI instance. Must be called once.
     * Safe to call multiple times — subsequent calls are no-ops.
     */
    fun initialize(): Boolean {
        if (apiInitialized.get()) return true
        return try {
            // Android 14/15 reflection fix:
            // LPAPI's DzPrinter internally relies on com.dothantech.common.a.g (Application).
            // Under Android 14/15, ActivityThread.currentApplication() can return null, causing
            // DzPrinter.init() to fail and openPrinter/print to be rejected immediately.
            try {
                val appClass = Class.forName("com.dothantech.common.a")
                val field = appClass.getDeclaredField("g")
                field.isAccessible = true
                val app = (context.applicationContext as? android.app.Application)
                    ?: (context as? android.app.Application)
                if (app != null) {
                    field.set(null, app)
                    Log.i(TAG, "[INIT] Injected Application context into com.dothantech.common.a.g")
                }
            } catch (t: Throwable) {
                Log.w(TAG, "[INIT] Reflection injection into com.dothantech.common.a: ${t.message}")
            }

            api = LPAPI.Factory.createInstance(lpapiCallback)

            // Also directly initialize DzPrinter singleton with explicit context
            try {
                val dz = com.dothantech.printer.DzPrinter.getInstance()
                dz.init(context.applicationContext, lpapiCallback)
                Log.i(TAG, "[INIT] DzPrinter.init called with explicit applicationContext")
            } catch (t: Throwable) {
                Log.w(TAG, "[INIT] DzPrinter.init call: ${t.message}")
            }

            apiInitialized.set(true)
            setState(State.IDLE)
            Log.i(TAG, "[INIT] LPAPI initialized successfully")
            true
        } catch (e: Exception) {
            Log.e(TAG, "[INIT] Failed to initialize LPAPI", e)
            lastError = "JOSH_SDK_INIT_FAILED: ${e.message}"
            emitError("JOSH_SDK_INIT_FAILED", e.message ?: "Failed to initialize JOSH SDK")
            false
        }
    }

    /**
     * Full shutdown. Only call on application/module destruction.
     */
    fun destroy() {
        Log.i(TAG, "[DESTROY] Shutting down JoshPrinterManager")
        stopDiscovery()
        try {
            api?.quit()
        } catch (e: Exception) {
            Log.w(TAG, "[DESTROY] quit() threw", e)
        }
        api = null
        apiInitialized.set(false)
        connectedPrinterAddress = null
        connectedPrinterName = null
        connectedMacAddress = null
        setState(State.IDLE)
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Discovery
    // ═══════════════════════════════════════════════════════════════════

    fun startDiscovery(): Boolean {
        val currentApi = api
        if (currentApi == null) {
            emitError("JOSH_SDK_ERROR", "LPAPI not initialized")
            return false
        }

        val btAdapter = BluetoothAdapter.getDefaultAdapter()
        if (btAdapter == null || !btAdapter.isEnabled) {
            Log.w(TAG, "[DISCOVERY_START] Bluetooth is off — skipping LPAPI discovery")
            return false
        }

        // Prevent duplicate discovery
        if (isDiscovering.get()) {
            Log.w(TAG, "[DISCOVERY_START] Already discovering — ignoring")
            return false
        }

        // Don't discover while connecting or printing
        val currentState = state.get()
        if (currentState == State.CONNECTING || currentState == State.PRINTING) {
            Log.w(TAG, "[DISCOVERY_START] Cannot scan in state=$currentState")
            emitError("JOSH_INVALID_STATE", "Cannot scan while $currentState")
            return false
        }

        discoveredPrinters.clear()
        isDiscovering.set(true)
        setState(State.SCANNING)
        Log.i(TAG, "[DISCOVERY_START] Starting printer discovery")

        currentApi.discovery()

        // Immediate query for bonded/paired LPAPI printers
        try {
            val pairedList = currentApi.getAllPrinterAddresses(null)
            if (pairedList != null) {
                for (addr in pairedList) {
                    handlePrinterDiscovered(addr)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "[DISCOVERY] getAllPrinterAddresses threw", e)
        }

        // Auto-stop timer
        val timeout = Runnable {
            if (isDiscovering.get()) {
                Log.i(TAG, "[DISCOVERY_TIMEOUT] ${DISCOVERY_TIMEOUT_MS}ms elapsed — stopping")
                stopDiscovery()
            }
        }
        discoveryTimer = timeout
        mainHandler.postDelayed(timeout, DISCOVERY_TIMEOUT_MS)

        return true
    }

    fun stopDiscovery() {
        if (!isDiscovering.getAndSet(false)) return
        Log.i(TAG, "[DISCOVERY_STOP] Stopping discovery")
        try {
            api?.stopDiscovery()
        } catch (e: Exception) {
            Log.w(TAG, "[DISCOVERY_STOP] stopDiscovery() threw", e)
        }
        discoveryTimer?.let { mainHandler.removeCallbacks(it) }
        discoveryTimer = null

        if (state.get() == State.SCANNING) {
            setState(if (connectedPrinterAddress != null) State.CONNECTED else State.DISCONNECTED)
        }
    }

    /**
     * Return bonded (paired) Bluetooth devices that are potential JOSH printers.
     */
    fun getBondedDevices(): List<Map<String, Any?>> {
        val btAdapter = BluetoothAdapter.getDefaultAdapter() ?: return emptyList()
        if (!btAdapter.isEnabled) return emptyList()
        val bonded = try {
            btAdapter.bondedDevices
        } catch (e: Exception) {
            Log.w(TAG, "[BONDED] getBondedDevices threw", e)
            emptySet()
        } ?: emptySet()

        val list = mutableListOf<Map<String, Any?>>()
        for (dev in bonded) {
            val name = dev.name ?: ""
            val mac = dev.address ?: continue
            val lower = name.lowercase().trim()

            // Skip obvious other non-JOSH printer families
            if (lower.contains("tejas") ||
                lower.contains("rudra") ||
                lower.contains("td-404") ||
                lower.contains("td404") ||
                lower.contains("minix") ||
                lower.contains("caysn")
            ) {
                continue
            }

            list.add(mapOf(
                "id" to mac,
                "name" to (if (name.isNotBlank()) name else mac),
                "macAddress" to mac,
                "transport" to "josh-lpapi",
                "sdkId" to "josh",
                "bonded" to true,
            ))
        }
        return list
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Connection
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Connect to a JOSH printer by its PrinterAddress (MAC).
     * Blocks the calling thread until Connected callback or timeout.
     *
     * @return true if connection succeeded, false on failure/timeout.
     */
    fun connect(macAddress: String, printerName: String?): Boolean {
        val currentApi = api
        if (currentApi == null) {
            lastError = "JOSH_SDK_ERROR: LPAPI not initialized"
            emitError("JOSH_SDK_ERROR", "LPAPI not initialized")
            return false
        }

        // A second connect to the printer we are already opening is a duplicate.
        // A different printer must take the bridge instead of waiting for this one.
        if (isConnecting.get() && macAddress.equals(connectingMacAddress, ignoreCase = true)) {
            Log.w(TAG, "[CONNECT] Already connecting to $macAddress — ignoring duplicate")
            return false
        }

        val token = connectToken.incrementAndGet()
        suppressNativeReconnect.set(true)
        connectLatch?.countDown()
        fun stillMine(): Boolean = connectToken.get() == token

        connectingMacAddress = macAddress

        // Pre-flight: Check Bluetooth adapter is enabled
        val btAdapter = BluetoothAdapter.getDefaultAdapter()
        if (btAdapter == null || !btAdapter.isEnabled) {
            lastError = "JOSH_BT_DISABLED: Bluetooth is not enabled"
            emitError("JOSH_BT_DISABLED", "Bluetooth adapter is not enabled")
            if (stillMine()) {
                suppressNativeReconnect.set(false)
                isConnecting.set(false)
            }
            return false
        }

        // Cancel any active Bluetooth discovery to avoid RFCOMM page collisions
        if (btAdapter.isDiscovering) {
            try { btAdapter.cancelDiscovery() } catch (_: Exception) {}
            try { Thread.sleep(150) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
        }

        // Already connected to this device?
        val currentState = state.get()
        if ((currentState == State.CONNECTED) &&
            connectedMacAddress != null &&
            connectedMacAddress.equals(macAddress, ignoreCase = true)
        ) {
            Log.i(TAG, "[CONNECT] Already connected to $macAddress — no-op")
            suppressNativeReconnect.set(false)
            return true
        }

        // Don't connect while printing
        if (currentState == State.PRINTING) {
            Log.w(TAG, "[CONNECT] Cannot connect during PRINTING")
            emitError("JOSH_INVALID_STATE", "Cannot connect while printing")
            if (stillMine()) suppressNativeReconnect.set(false)
            return false
        }

        // Stop any running discovery
        stopDiscovery()

        isConnecting.set(true)
        if (!stillMine()) return false
        setState(State.CONNECTING)
        lastError = null
        Log.i(TAG, "[JOSH-CONN-P1:IDENTIFY] Initiating JOSH connection: mac=$macAddress, name=$printerName")

        // Release the previous printer on this bridge before opening a different one.
        // LPAPI can still hold that session after our state machine says disconnected,
        // and a later connect+disconnect was the only way to clear it.
        val previousMac = connectedMacAddress ?: lastConnectedAddress?.macAddress
        val switchingPrinter = previousMac != null && !previousMac.equals(macAddress, ignoreCase = true)
        val sdkOpen = try {
            currentApi.isPrinterOpened
        } catch (_: Exception) {
            false
        }
        if (switchingPrinter || sdkOpen || currentState == State.CONNECTED || connectedMacAddress != null) {
            Log.i(TAG, "[JOSH-CONN-P2:PREPARE] Releasing previous printer ${previousMac ?: "unknown"} before $macAddress")
            try {
                currentApi.closePrinter()
            } catch (e: Exception) {
                Log.w(TAG, "[JOSH-CONN-P2:PREPARE] closePrinter() threw (non-fatal)", e)
            }
            val releaseStarted = System.currentTimeMillis()
            while (stillMine() && System.currentTimeMillis() - releaseStarted < 1200) {
                val stillOpen = try {
                    currentApi.isPrinterOpened
                } catch (_: Exception) {
                    false
                }
                if (!stillOpen) break
                try {
                    Thread.sleep(50)
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    break
                }
            }
            if (switchingPrinter) {
                connectedPrinterAddress = null
                connectedPrinterName = null
                connectedMacAddress = null
            }
        }
        if (!stillMine()) return false

        // Resolve PrinterAddress with validated friendly name (NEVER pass a MAC as shownName!)
        var printerAddress = discoveredPrinters[macAddress.uppercase()]
        if (printerAddress == null) {
            try {
                printerAddress = currentApi.getFirstPrinterAddress(macAddress)
            } catch (e: Exception) {
                Log.w(TAG, "[JOSH-CONN-P2:PREPARE] getFirstPrinterAddress threw", e)
            }
        }

        val remoteDevice = try {
            btAdapter.getRemoteDevice(macAddress)
        } catch (e: Exception) {
            null
        }

        if (printerAddress == null && remoteDevice != null) {
            try {
                printerAddress = com.dothantech.b.b.c(remoteDevice)
            } catch (e: Exception) {
                Log.w(TAG, "[JOSH-CONN-P2:PREPARE] BluetoothUtils.c threw", e)
            }
        }

        val resolvedName = when {
            !printerName.isNullOrBlank() && !printerName.contains(":") -> printerName
            remoteDevice?.name != null && !remoteDevice.name.isNullOrBlank() -> remoteDevice.name
            printerAddress?.shownName != null && !printerAddress.shownName.contains(":") -> printerAddress.shownName
            else -> "JOSH"
        }

        val resolvedType = when {
            printerAddress?.addressType != null -> printerAddress.addressType
            remoteDevice != null -> {
                try { com.dothantech.b.b.b(remoteDevice) } catch (_: Throwable) { AddressType.DUAL }
            }
            else -> AddressType.DUAL
        }

        val targetAddress = if (printerAddress == null) {
            PrinterAddress(resolvedName, macAddress, resolvedType)
        } else if (printerAddress.shownName.isNullOrBlank() || printerAddress.shownName.contains(":")) {
            PrinterAddress(resolvedName, macAddress, printerAddress.addressType ?: resolvedType)
        } else {
            printerAddress
        }
        Log.i(TAG, "[JOSH-CONN-P2:PREPARE] Target PrinterAddress: shownName=${targetAddress.shownName}, mac=${targetAddress.macAddress}, type=${targetAddress.addressType}")

        // ── PHASE 3: OPEN — attempt connection with retry ──
        for (attempt in 1..CONNECT_MAX_ATTEMPTS) {
            if (!stillMine()) return false
            if (attempt > 1) {
                Log.i(TAG, "[JOSH-CONN-P3:RETRY] Attempt $attempt/$CONNECT_MAX_ATTEMPTS after ${CONNECT_RETRY_DELAY_MS}ms delay")
                try { Thread.sleep(CONNECT_RETRY_DELAY_MS) } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    break
                }
                if (!stillMine()) return false
                // Clean up before retry
                try { currentApi.closePrinter() } catch (_: Exception) {}
                try { Thread.sleep(300) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
            }

            val latch = CountDownLatch(1)
            connectLatch = latch

            // Tier 1: Try openPrinter(BluetoothDevice) if remoteDevice is resolved
            var requestAccepted = false
            if (remoteDevice != null) {
                Log.i(TAG, "[JOSH-CONN-P3:OPEN] Attempt $attempt — openPrinter(BluetoothDevice: ${remoteDevice.address})")
                requestAccepted = try {
                    currentApi.openPrinter(remoteDevice)
                } catch (e: Exception) {
                    Log.w(TAG, "[JOSH-CONN-P3:OPEN] openPrinter(device) threw", e)
                    false
                }
            }

            // Tier 2: Try openPrinterByAddress(targetAddress)
            if (!requestAccepted) {
                Log.i(TAG, "[JOSH-CONN-P3:OPEN] Attempt $attempt — openPrinterByAddress(${targetAddress.shownName}, ${targetAddress.macAddress})")
                requestAccepted = try {
                    currentApi.openPrinterByAddress(targetAddress)
                } catch (e: Exception) {
                    Log.w(TAG, "[JOSH-CONN-P3:OPEN] openPrinterByAddress threw", e)
                    false
                }
            }

            // Tier 3: Try openPrinter(macAddress)
            if (!requestAccepted) {
                Log.i(TAG, "[JOSH-CONN-P3:OPEN] Attempt $attempt — openPrinter(mac: $macAddress)")
                requestAccepted = try {
                    currentApi.openPrinter(macAddress)
                } catch (e: Exception) {
                    Log.w(TAG, "[JOSH-CONN-P3:OPEN] openPrinter(mac) threw", e)
                    false
                }
            }

            // Tier 4: Try openPrinter(resolvedName)
            if (!requestAccepted && resolvedName.isNotBlank()) {
                Log.i(TAG, "[JOSH-CONN-P3:OPEN] Attempt $attempt — openPrinter(name: $resolvedName)")
                requestAccepted = try {
                    currentApi.openPrinter(resolvedName)
                } catch (e: Exception) {
                    Log.w(TAG, "[JOSH-CONN-P3:OPEN] openPrinter(name) threw", e)
                    false
                }
            }

            if (!requestAccepted) {
                Log.w(TAG, "[JOSH-CONN-P3:OPEN] Attempt $attempt — all openPrinter methods returned false")
                if (connectLatch === latch) connectLatch = null
                if (!stillMine()) return false
                if (attempt < CONNECT_MAX_ATTEMPTS) continue
                // Final attempt failed
                isConnecting.set(false)
                lastError = "JOSH_CONNECTION_FAILED: Connection request rejected"
                setState(State.DISCONNECTED)
                suppressNativeReconnect.set(false)
                emitError("JOSH_CONNECTION_FAILED", "Printer rejected connection request")
                return false
            }

            Log.i(TAG, "[JOSH-CONN-P3:WAIT] Attempt $attempt — waiting for LPAPI Connected callback (timeout=${CONNECT_TIMEOUT_MS}ms)...")
            val connected = try {
                latch.await(CONNECT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                false
            }

            if (connectLatch === latch) connectLatch = null
            if (!stillMine()) return false

            val confirmedThisTarget = connectedMacAddress?.equals(macAddress, ignoreCase = true) == true
            if (confirmedThisTarget) {
                isConnecting.set(false)
                setState(State.CONNECTED)
                connectedPrinterAddress = targetAddress
                connectedPrinterName = targetAddress.shownName ?: currentApi.printerName ?: resolvedName
                connectedMacAddress = macAddress
                lastConnectedAt.set(System.currentTimeMillis())
                lastConnectedAddress = targetAddress
                suppressNativeReconnect.set(false)
                Log.i(TAG, "[JOSH-CONN-P4:CONFIRMED] Connected to ${connectedPrinterName ?: macAddress} on attempt $attempt")
                listener?.onStateChanged(State.CONNECTED, mapOf(
                    "printerName" to (connectedPrinterName ?: targetAddress.shownName ?: resolvedName),
                    "macAddress" to macAddress,
                    "timestamp" to System.currentTimeMillis(),
                ))
                scheduleDebugBatteryLogAfterConnect()
                return true
            }
            val liveMac = connectedMacAddress
            if (liveMac != null && !liveMac.equals(macAddress, ignoreCase = true)) {
                Log.w(TAG, "[JOSH-CONN-P3:WRONG-PRINTER] SDK is still on $liveMac, wanted $macAddress")
                try { currentApi.closePrinter() } catch (_: Exception) {}
                connectedPrinterAddress = null
                connectedPrinterName = null
                connectedMacAddress = null
            }

            Log.w(TAG, "[JOSH-CONN-P3:TIMEOUT] Attempt $attempt — no Connected callback within ${CONNECT_TIMEOUT_MS}ms (state=${currentApi.printerState})")
            if (attempt < CONNECT_MAX_ATTEMPTS) {
                // Reset state for retry
                setState(State.CONNECTING)
            }
        }

        if (!stillMine()) return false
        // All attempts exhausted
        isConnecting.set(false)
        Log.e(TAG, "[JOSH-CONN-P4:FAILED] All $CONNECT_MAX_ATTEMPTS connect attempts exhausted")
        lastError = "JOSH_CONNECTION_TIMEOUT: Printer did not respond after $CONNECT_MAX_ATTEMPTS attempts"
        setState(State.DISCONNECTED)
        suppressNativeReconnect.set(false)
        emitError("JOSH_CONNECTION_TIMEOUT", "Printer did not respond after $CONNECT_MAX_ATTEMPTS attempts")
        return false
    }

    /**
     * Disconnect from the current printer.
     * Uses closePrinter() instead of quit() to preserve the LPAPI instance
     * for future connections. quit() is only called in destroy().
     */
    fun disconnect() {
        connectToken.incrementAndGet()
        suppressNativeReconnect.set(true)
        connectLatch?.countDown()

        val opened = try {
            api?.isPrinterOpened == true
        } catch (_: Exception) {
            false
        }
        val currentState = state.get()
        val holdsSession = opened ||
            connectedMacAddress != null ||
            currentState == State.CONNECTED ||
            currentState == State.CONNECTING ||
            currentState == State.PRINTING ||
            currentState == State.DISCONNECTING ||
            currentState == State.RECONNECTING
        if (!holdsSession && (currentState == State.DISCONNECTED || currentState == State.IDLE)) {
            Log.d(TAG, "[DISCONNECT] Already disconnected")
            suppressNativeReconnect.set(false)
            return
        }

        if (currentState == State.PRINTING) {
            Log.w(TAG, "[DISCONNECT] Warning: disconnecting during active print")
        }

        setState(State.DISCONNECTING)
        Log.i(TAG, "[DISCONNECT_START] Disconnecting from ${connectedPrinterName ?: connectedMacAddress}")

        stopDiscovery()
        try {
            // Use closePrinter() instead of quit() — this cleanly closes the
            // RFCOMM socket without destroying the LPAPI singleton. The instance
            // remains valid for future openPrinter calls.
            api?.closePrinter()
            Log.i(TAG, "[DISCONNECT] closePrinter() completed")
        } catch (e: Exception) {
            Log.w(TAG, "[DISCONNECT] closePrinter() threw", e)
        }

        connectedPrinterAddress = null
        connectedPrinterName = null
        connectedMacAddress = null
        connectingMacAddress = null
        isPrinting.set(false)
        isConnecting.set(false)
        setState(State.DISCONNECTED)
        suppressNativeReconnect.set(false)
        Log.i(TAG, "[DISCONNECT_DONE] Disconnected")
    }

    /**
     * Attempt to reconnect to the last connected printer with backoff.
     * @return true if reconnection succeeded.
     */
    fun reconnect(): Boolean {
        val lastAddr = lastConnectedAddress ?: run {
            Log.w(TAG, "[RECONNECT] No last known address")
            return false
        }

        if (state.get() == State.CONNECTED) {
            Log.d(TAG, "[RECONNECT] Already connected")
            return true
        }

        setState(State.RECONNECTING)
        Log.i(TAG, "[RECONNECT_START] Attempting reconnect to ${lastAddr.shownName ?: lastAddr.macAddress}")

        for (attempt in 0 until MAX_RECONNECT_ATTEMPTS) {
            val delay = RECONNECT_DELAYS_MS[attempt.coerceAtMost(RECONNECT_DELAYS_MS.size - 1)]
            Log.i(TAG, "[RECONNECT] Attempt ${attempt + 1}/$MAX_RECONNECT_ATTEMPTS after ${delay}ms delay")

            try {
                Thread.sleep(delay)
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                break
            }

            val success = connect(lastAddr.macAddress, lastAddr.shownName)
            if (success) {
                Log.i(TAG, "[RECONNECT_SUCCESS] Reconnected on attempt ${attempt + 1}")
                return true
            }
        }

        Log.e(TAG, "[RECONNECT_FAILED] All $MAX_RECONNECT_ATTEMPTS attempts failed")
        lastError = "JOSH_RECONNECT_FAILED: Max retries exceeded"
        setState(State.ERROR)
        emitError("JOSH_RECONNECT_FAILED", "Could not reconnect after $MAX_RECONNECT_ATTEMPTS attempts")
        return false
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Print
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Headless path: packed 1-bit dots (logical black=1, MSB first) → ARGB Bitmap → LPAPI mm job.
     * No PNG decode, contain-fit, or ViewShot round-trip.
     */
    fun printMonoLabel(
        monoBytes: ByteArray,
        widthDots: Int,
        heightDots: Int,
        bytesPerRow: Int,
        widthMm: Double,
        heightMm: Double,
        dpi: Double = HARDWARE_DPI,
        copies: Int = 1,
        paramDensity: Int = -1,
        paramSpeed: Int = -1,
        direction: Int = 0,
        paramGapType: Int = GAP_TYPE_LABEL,
        paramGapLengthMm: Double = LABEL_GAP_MM,
        hOffsetMm: Double = 0.0,
        vOffsetMm: Double = 0.0,
        alignment: String = "left",
    ): Map<String, Any?>? {
        val hardwareDpi = if (dpi == 300.0) 300.0 else HARDWARE_DPI
        val dpm = if (hardwareDpi == 300.0) hardwareDpi / 25.4 else HARDWARE_DPM
        val sizeDotsW = Math.max(1, Math.round(widthMm * dpm).toInt())
        val sizeDotsH = Math.max(1, Math.round(heightMm * dpm).toInt())
        // Pad up to a byte. The extra columns are white and are cropped before draw.
        val packedW = Math.max(8, ((sizeDotsW + 7) / 8) * 8)
        if (bytesPerRow * 8 != packedW) {
            lastError = "JOSH_MONO_INVALID: bytesPerRow*8 ($bytesPerRow * 8) != packedW ($packedW)"
            emitError("JOSH_MONO_INVALID", lastError!!)
            return null
        }
        if (widthDots != packedW || heightDots != sizeDotsH) {
            lastError = "JOSH_MONO_INVALID: buffer ${widthDots}x${heightDots} != packed ${packedW}x${sizeDotsH}"
            emitError("JOSH_MONO_INVALID", lastError!!)
            return null
        }
        val expectedLen = bytesPerRow * heightDots
        if (monoBytes.size != expectedLen) {
            lastError = "JOSH_MONO_INVALID: length ${monoBytes.size} != $expectedLen"
            emitError("JOSH_MONO_INVALID", lastError!!)
            return null
        }
        val currentApi = api ?: run {
            lastError = "JOSH_SDK_ERROR: LPAPI not initialized"
            emitError("JOSH_SDK_ERROR", "LPAPI not initialized")
            return null
        }
        val currentState = state.get()
        if (currentState != State.CONNECTED && currentState != State.PRINT_SUCCESS && currentState != State.PRINT_FAILED) {
            lastError = "JOSH_NOT_CONNECTED: State is $currentState"
            emitError("JOSH_NOT_CONNECTED", "Printer is not connected (state: $currentState)")
            return null
        }
        val sdkState = currentApi.printerState
        if (sdkState == null || sdkState == PrinterState.Disconnected) {
            lastError = "JOSH_NOT_CONNECTED: SDK reports disconnected"
            emitError("JOSH_NOT_CONNECTED", "LPAPI reports printer disconnected")
            return null
        }
        if (isPrinting.get() || !printLock.tryLock()) {
            lastError = "JOSH_PRINT_ALREADY_RUNNING"
            emitError("JOSH_PRINT_ALREADY_RUNNING", "Another print job is active")
            return null
        }

        isPrinting.set(true)
        val jobId = "JOSH-MONO-${String.format("%03d", jobIdCounter.incrementAndGet())}"
        setState(State.PRINTING)
        Log.i(TAG, "[$jobId] [JOSH-MONO-P1] ${widthMm}x${heightMm}mm ${widthDots}x${heightDots}px copies=$copies")

        try {
            val t0 = System.currentTimeMillis()
            val dotBitmap = mono1bppToBitmap(monoBytes, widthDots, heightDots, bytesPerRow)
            val hOffsetPx = Math.round(hOffsetMm * dpm).toInt()
            val vOffsetPx = Math.round(vOffsetMm * dpm).toInt()
            val composited = compositeLabelPage(dotBitmap, widthDots, heightDots, hOffsetPx, vOffsetPx)
            if (dotBitmap !== composited && !dotBitmap.isRecycled) dotBitmap.recycle()
            // Drop the byte-align pad so drawBitmap(widthMm) stays at hardware dpm.
            val bitmap = cropBitmapToWidth(composited, sizeDotsW)
            val tPack = System.currentTimeMillis()

            var finalWidthMm = widthMm
            var finalHeightMm = heightMm
            if (direction == 90 || direction == 270) {
                finalWidthMm = heightMm
                finalHeightMm = widthMm
            }

            val submitResult = submitLabelBitmapAndWait(
                currentApi,
                jobId,
                bitmap,
                finalWidthMm,
                finalHeightMm,
                copies,
                paramDensity,
                paramSpeed,
                paramGapType,
                paramGapLengthMm,
                alignment,
            )
            if (submitResult == null) return null

            if (!bitmap.isRecycled) bitmap.recycle()
            val tDone = System.currentTimeMillis()
            return mapOf<String, Any?>(
                "jobId" to jobId,
                "copies" to copies,
                "widthMm" to finalWidthMm,
                "heightMm" to finalHeightMm,
                "targetW" to bitmap.width,
                "targetH" to bitmap.height,
                "decodeMs" to (tPack - t0),
                "fitMs" to 0,
                "submitMs" to submitResult.submitMs,
                "waitMs" to submitResult.waitMs,
                "totalMs" to (tDone - t0),
                "confirmedByDevice" to lastPrintConfirmedByDevice,
                "path" to "mono-dots",
                "debugStrategyUsed" to submitResult.strategyUsed,
            )
        } catch (e: Exception) {
            Log.e(TAG, "[$jobId] JOSH_MONO_ERROR", e)
            lastError = "JOSH_PRINT_FAILED: ${e.message}"
            setState(State.PRINT_FAILED)
            emitError("JOSH_PRINT_FAILED", e.message ?: "Print failed")
            return null
        } finally {
            cancelPrintFallbacks()
            isPrinting.set(false)
            printLock.unlock()
            if (isConnected()) {
                setState(State.CONNECTED)
            } else {
                setState(State.DISCONNECTED)
            }
        }
    }

    /**
     * Print a PNG bitmap on the connected JOSH printer.
     *
     * @param pngBytes Raw PNG bytes (decoded from base64 by the caller).
     * @param widthMm Physical label width in mm.
     * @param heightMm Physical label height in mm.
     * Physical size is locked with LPAPI startJob(widthMm, heightMm) + drawBitmap in mm.
     * Bitmap pixels are never treated as 304 DPI TSPL dots (that prints ~1.5× too large).
     */
    fun printBitmap(
        pngBytes: ByteArray,
        widthMm: Double,
        heightMm: Double,
        dpi: Double = HARDWARE_DPI,
        copies: Int = 1,
        paramDensity: Int = -1,
        paramSpeed: Int = -1,
        direction: Int = 0,
        paramGapType: Int = GAP_TYPE_LABEL,
        paramGapLengthMm: Double = LABEL_GAP_MM,
        hOffsetMm: Double = 0.0,
        vOffsetMm: Double = 0.0,
        alignment: String = "left",
    ): Map<String, Any?>? {
        val currentApi = api ?: run {
            lastError = "JOSH_SDK_ERROR: LPAPI not initialized"
            emitError("JOSH_SDK_ERROR", "LPAPI not initialized")
            return null
        }

        // ── Pre-flight checks ──────────────────────────────────────────

        // 1. Check state — must be CONNECTED
        val currentState = state.get()
        if (currentState != State.CONNECTED && currentState != State.PRINT_SUCCESS && currentState != State.PRINT_FAILED) {
            lastError = "JOSH_NOT_CONNECTED: State is $currentState"
            emitError("JOSH_NOT_CONNECTED", "Printer is not connected (state: $currentState)")
            return null
        }

        // 2. Check SDK state
        val sdkState = currentApi.printerState
        if (sdkState == null || sdkState == PrinterState.Disconnected) {
            lastError = "JOSH_NOT_CONNECTED: SDK reports disconnected"
            emitError("JOSH_NOT_CONNECTED", "LPAPI reports printer disconnected")
            return null
        }

        // 3. Acquire print lock (non-blocking check first)
        if (isPrinting.get()) {
            lastError = "JOSH_PRINT_ALREADY_RUNNING"
            emitError("JOSH_PRINT_ALREADY_RUNNING", "Another print job is active")
            return null
        }

        // 4. Acquire lock
        if (!printLock.tryLock()) {
            lastError = "JOSH_PRINT_ALREADY_RUNNING: Lock contention"
            emitError("JOSH_PRINT_ALREADY_RUNNING", "Print lock is held by another job")
            return null
        }

        isPrinting.set(true)
        val jobId = "JOSH-PRINT-${String.format("%03d", jobIdCounter.incrementAndGet())}"
        setState(State.PRINTING)
        Log.i(TAG, "[$jobId] [JOSH-PRINT-P1:PREFLIGHT] Start ${widthMm}x${heightMm}mm @${dpi}DPI copies=$copies")

        try {
            val t0 = System.currentTimeMillis()

            // ── Decode PNG ─────────────────────────────────────────────
            val decoded = BitmapFactory.decodeByteArray(pngBytes, 0, pngBytes.size)
                ?: run {
                    lastError = "JOSH_INVALID_BITMAP: Could not decode PNG"
                    emitError("JOSH_INVALID_BITMAP", "Failed to decode PNG bitmap")
                    return null
                }
            val decodedW = decoded.width
            val decodedH = decoded.height
            val tDecode = System.currentTimeMillis()

            val hardwareDpi = if (dpi == 300.0) 300.0 else HARDWARE_DPI
            val dpm = if (hardwareDpi == 300.0) hardwareDpi / 25.4 else HARDWARE_DPM

            var working = decoded
            var finalWidthMm = widthMm
            var finalHeightMm = heightMm
            if (direction != 0) {
                val matrix = Matrix().apply { postRotate(direction.toFloat()) }
                val rotated = Bitmap.createBitmap(working, 0, 0, working.width, working.height, matrix, true)
                if (rotated !== working) {
                    working.recycle()
                    working = rotated
                }
                if (direction == 90 || direction == 270) {
                    finalWidthMm = heightMm
                    finalHeightMm = widthMm
                }
            }

            val targetW = Math.max(1, Math.round(finalWidthMm * dpm).toInt())
            val targetH = Math.max(1, Math.round(finalHeightMm * dpm).toInt())
            Log.i(
                TAG,
                "[$jobId] [JOSH-PRINT-P2:RASTERIZE] src=${working.width}x${working.height} page=${targetW}x${targetH}px " +
                    "${finalWidthMm}x${finalHeightMm}mm dpm=$dpm dpi=$hardwareDpi dir=$direction align=$alignment offset=${hOffsetMm}x${vOffsetMm}",
            )

            // Composite onto solid OPAQUE WHITE canvas at exact label dots.
            // Apply H/V offsets here so Strategy 1 (printBitmap) honours calibration —
            // startJob drawBitmap offsets only run on fallback strategies.
            val hOffsetPx = Math.round(hOffsetMm * dpm).toInt()
            val vOffsetPx = Math.round(vOffsetMm * dpm).toInt()
            val usedContainFit = working.width != targetW || working.height != targetH
            val fitted = if (!usedContainFit) {
                working
            } else {
                containFitToPage(working, targetW, targetH, alignment)
            }
            val bitmap = if (hOffsetPx == 0 && vOffsetPx == 0 && fitted.width == targetW && fitted.height == targetH) {
                if (fitted === working) {
                    val page = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888)
                    val canvas = Canvas(page)
                    canvas.drawColor(Color.WHITE)
                    canvas.drawBitmap(fitted, 0f, 0f, null)
                    page
                } else {
                    fitted
                }
            } else {
                val page = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888)
                val canvas = Canvas(page)
                canvas.drawColor(Color.WHITE)
                canvas.drawBitmap(fitted, hOffsetPx.toFloat(), vOffsetPx.toFloat(), null)
                if (fitted !== working && fitted !== page && !fitted.isRecycled) fitted.recycle()
                page
            }
            if (working !== decoded && working !== bitmap && !working.isRecycled) working.recycle()
            if (!decoded.isRecycled) decoded.recycle()
            val tFit = System.currentTimeMillis()
            Log.i(
                TAG,
                "[$jobId] [JOSH-PRINT-P2:OFFSET] applied h=${hOffsetMm}mm (${hOffsetPx}px) v=${vOffsetMm}mm (${vOffsetPx}px)",
            )

            lastPrintSuccess = false
            lastPrintConfirmedByDevice = false
            val latch = CountDownLatch(1)
            printLatch = latch

            val gapTypeValue = if (paramGapType >= 0) paramGapType else GAP_TYPE_LABEL
            val gapLengthValue = gapMmTo01mm(if (paramGapLengthMm >= 0.0) paramGapLengthMm else LABEL_GAP_MM)
            Log.i(TAG, "[$jobId] [JOSH-PRINT-P2:GAP] type=$gapTypeValue length=${paramGapLengthMm}mm → $gapLengthValue (0.01 mm)")
            try {
                currentApi.setPrintPageGapType(gapTypeValue)
                currentApi.setPrintPageGapLength(gapLengthValue)
            } catch (e: Exception) {
                Log.w(TAG, "[$jobId] [JOSH-PRINT-P2:GAP] setPrintPageGap* threw (non-fatal)", e)
            }

            val printParams = Bundle().apply {
                if (gapTypeValue >= 0) putInt(PrintParamName.GAP_TYPE, gapTypeValue)
                if (gapLengthValue >= 0) putInt(PrintParamName.GAP_LENGTH, gapLengthValue)
                if (paramDensity >= 0) putInt(PrintParamName.PRINT_DENSITY, paramDensity)
                if (paramSpeed >= 0) putInt(PrintParamName.PRINT_SPEED, paramSpeed)
                if (copies > 1) putInt(PrintParamName.PRINT_COPIES, copies)
            }
            val finalParams = if (printParams.isEmpty) null else printParams

            // Offsets already baked into bitmap; keep startJob origin at 0 to avoid double-shift.
            val xMm = 0.0
            val yMm = 0.0

            // Clear any stale LPAPI job (test prints and failed jobs leave state behind).
            try {
                currentApi.abortJob()
            } catch (e: Exception) {
                Log.w(TAG, "[$jobId] [JOSH-PRINT-P2:PREPARE] abortJob threw (non-fatal)", e)
            }

            // Strategy 1 (Primary — same mm-native path as the working test print):
            // startJob(widthMm, heightMm) + drawBitmap(mm) + commitJob locks physical size.
            var strategyUsed = 0
            var submitted = submitMmJob(currentApi, bitmap, finalWidthMm, finalHeightMm, xMm, yMm, finalParams, alignment)
            if (submitted) strategyUsed = 1
            Log.i(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] Strategy 1 (startJob+drawBitmap mm) submitted=$submitted")

            // Strategy 2 (Fallback — startJob without extra params):
            if (!submitted) {
                Log.i(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] Strategy 2 fallback to submitMmJob no-params")
                submitted = submitMmJob(currentApi, bitmap, finalWidthMm, finalHeightMm, xMm, yMm, null, alignment)
                if (submitted) strategyUsed = 2
            }

            // Strategy 3 (Fallback — direct printBitmap with params):
            if (!submitted) {
                submitted = try {
                    currentApi.printBitmap(bitmap, finalParams)
                } catch (e: Exception) {
                    Log.w(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] currentApi.printBitmap threw", e)
                    false
                }
                if (submitted) strategyUsed = 3
                Log.i(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] Strategy 3 (direct printBitmap) submitted=$submitted")
            }

            // Strategy 4 (Fallback — printBitmap null params):
            if (!submitted) {
                submitted = try {
                    currentApi.printBitmap(bitmap, null)
                } catch (e: Exception) {
                    Log.w(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] printBitmap(null) threw", e)
                    false
                }
                if (submitted) strategyUsed = 4
                Log.i(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] Strategy 4 printBitmap(null) submitted=$submitted")
            }
            val usedOffsetComposite = hOffsetPx != 0 || vOffsetPx != 0 || fitted.width != targetW || fitted.height != targetH

            if (!submitted) {
                Log.e(TAG, "[$jobId] [JOSH-PRINT-P3:SUBMIT] PRINT_REJECTED all print strategies were rejected")
                printLatch = null
                lastError = "JOSH_PRINT_FAILED: Print request rejected by printer SDK"
                handlePrintFailed("Print request rejected by LPAPI SDK")
                return null
            }
            val tSubmit = System.currentTimeMillis()

            // printBitmap on some LPAPI firmware never emits PrintProgress — complete quickly after submit.
            printSubmitFallback?.let { mainHandler.removeCallbacks(it) }
            val submitFallback = Runnable {
                if (printLatch != null && isPrinting.get() && !lastPrintSuccess) {
                    Log.i(
                        TAG,
                        "[$jobId] [JOSH-PRINT-P4:SUBMIT-FALLBACK] printBitmap submitted without LPAPI progress; completing.",
                    )
                    lastPrintSuccess = true
                    printLatch?.countDown()
                    mainHandler.post { handlePrintSuccess() }
                }
            }
            printSubmitFallback = submitFallback
            mainHandler.postDelayed(submitFallback, PRINT_SUBMIT_FALLBACK_MS)

            Log.i(TAG, "[$jobId] [JOSH-PRINT-P4:WAIT-HARDWARE] PRINT_SUBMITTED waiting for physical completion (timeout=${PRINT_TIMEOUT_MS}ms)")

            // ── Wait for completion callback ───────────────────────────
            val completed = try {
                latch.await(PRINT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                false
            }
            printLatch = null
            val tDone = System.currentTimeMillis()

            if (!completed) {
                Log.e(TAG, "[$jobId] PRINT_TIMEOUT No callback within ${PRINT_TIMEOUT_MS}ms")
                lastError = "JOSH_PRINT_TIMEOUT"
                setState(State.PRINT_FAILED)
                emitError("JOSH_PRINT_TIMEOUT", "Print timed out — printer may be unresponsive")
                emitPrintProgress(jobId, "TIMEOUT", mapOf("timeoutMs" to PRINT_TIMEOUT_MS))

                // Check connection after timeout
                val postState = currentApi.printerState
                if (postState == null || postState == PrinterState.Disconnected) {
                    Log.w(TAG, "[$jobId] Connection lost after timeout")
                    handleDisconnected()
                }
                return null
            }

            if (!lastPrintSuccess) {
                Log.e(TAG, "[$jobId] PRINT_FAILED callback received")
                return null
            }

            // Recycle bitmap
            if (!bitmap.isRecycled) bitmap.recycle()

            val result = mapOf<String, Any?>(
                "jobId" to jobId,
                "copies" to copies,
                "widthMm" to finalWidthMm,
                "heightMm" to finalHeightMm,
                "targetW" to targetW,
                "targetH" to targetH,
                "decodeMs" to (tDecode - t0),
                "fitMs" to (tFit - tDecode),
                "submitMs" to (tSubmit - tFit),
                "waitMs" to (tDone - tSubmit),
                "totalMs" to (tDone - t0),
                "confirmedByDevice" to lastPrintConfirmedByDevice,
                "debugAlignment" to alignment,
                "debugHOffsetMm" to hOffsetMm,
                "debugVOffsetMm" to vOffsetMm,
                "debugHOffsetPx" to hOffsetPx,
                "debugVOffsetPx" to vOffsetPx,
                "debugDecodedW" to decodedW,
                "debugDecodedH" to decodedH,
                "debugFittedW" to fitted.width,
                "debugFittedH" to fitted.height,
                "debugBitmapW" to bitmap.width,
                "debugBitmapH" to bitmap.height,
                "debugUsedContainFit" to usedContainFit,
                "debugUsedOffsetComposite" to usedOffsetComposite,
                "debugStrategyUsed" to strategyUsed,
            )
            Log.i(TAG, "[$jobId] [JOSH-PRINT-P5:FINALIZE] Print complete in ${tDone - t0}ms $result")
            return result

        } catch (e: Exception) {
            Log.e(TAG, "[$jobId] PRINT_ERROR", e)
            lastError = "JOSH_PRINT_FAILED: ${e.message}"
            setState(State.PRINT_FAILED)
            emitError("JOSH_PRINT_FAILED", e.message ?: "Print failed")
            emitPrintProgress(jobId, "FAILED", mapOf("error" to (e.message ?: "Unknown")))
            return null
        } finally {
            cancelPrintFallbacks()
            isPrinting.set(false)
            printLock.unlock()
            if (isConnected()) {
                setState(State.CONNECTED)
            } else {
                setState(State.DISCONNECTED)
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Configuration
    // ═══════════════════════════════════════════════════════════════════

    fun configureParams(
        newDensity: Int? = null,
        newSpeed: Int? = null,
        newGapType: Int? = null,
        newGapLengthMm: Double? = null,
    ) {
        val currentApi = api
        newDensity?.let {
            density = it
            if (currentApi != null && state.get() == State.CONNECTED) {
                currentApi.setPrintDarkness(it)
                Log.d(TAG, "[CONFIG] density=$it")
            }
        }
        newSpeed?.let {
            speed = it
            if (currentApi != null && state.get() == State.CONNECTED) {
                currentApi.setPrintSpeed(it)
                Log.d(TAG, "[CONFIG] speed=$it")
            }
        }
        newGapType?.let {
            gapType = it
            if (currentApi != null && state.get() == State.CONNECTED) {
                currentApi.setPrintPageGapType(it)
                Log.d(TAG, "[CONFIG] gapType=$it")
            }
        }
        newGapLengthMm?.let {
            gapLengthMm = it
            if (currentApi != null && state.get() == State.CONNECTED) {
                val gap01mm = gapMmTo01mm(it)
                currentApi.setPrintPageGapLength(gap01mm)
                Log.d(TAG, "[CONFIG] gapLength=${it}mm → $gap01mm (0.01 mm)")
            }
        }
    }

    fun printTestText(text: String): Boolean {
        val currentApi = api ?: return false
        if (!isConnected()) return false

        if (!printLock.tryLock(5000, TimeUnit.MILLISECONDS)) {
            Log.w(TAG, "[JOSH-PRINT-P1:PREFLIGHT] Test print lock contention")
            return false
        }
        isPrinting.set(true)
        setState(State.PRINTING)

        return try {
            lastPrintSuccess = false
            val latch = CountDownLatch(1)
            printLatch = latch

            currentApi.abortJob()
            Log.i(
                TAG,
                "[JOSH-PRINT-P2:TEST-DRAW] Starting test job (${TEST_LABEL_WIDTH_MM}x${TEST_LABEL_HEIGHT_MM}mm), text=\"$text\"",
            )
            val started = currentApi.startJob(TEST_LABEL_WIDTH_MM, TEST_LABEL_HEIGHT_MM, 0)
            if (!started) {
                Log.w(TAG, "[JOSH-PRINT-P2:TEST-DRAW] startJob($TEST_LABEL_WIDTH_MM, $TEST_LABEL_HEIGHT_MM, 0) returned false")
                return false
            }
            try {
                currentApi.setPrintPageGapType(GAP_TYPE_LABEL)
                currentApi.setPrintPageGapLength(gapMmTo01mm(LABEL_GAP_MM))
            } catch (e: Exception) {
                Log.w(TAG, "[JOSH-PRINT-P2:TEST-DRAW] setPrintPageGap* threw (non-fatal)", e)
            }
            currentApi.setItemHorizontalAlignment(0) // Left
            currentApi.setItemVerticalAlignment(0)   // Top
            val xPadMm = JOSH_MEDIA_ORIGIN_H_MM + JOSH_LPAPI_DRAW_BIAS_H_MM + TEST_LABEL_EXTRA_H_MM
            val yPadMm = max(0.5, 1.0 + JOSH_LPAPI_DRAW_BIAS_V_MM)
            val rightPadMm = 1.5
            val textW = TEST_LABEL_WIDTH_MM - xPadMm - rightPadMm
            val lines = text.split('\n').map { it.trim() }.filter { it.isNotEmpty() }.take(4)
            val drawLines = if (lines.isEmpty()) listOf(TEST_LABEL_DEFAULT_TEXT) else lines
            val lineStepMm = (TEST_LABEL_HEIGHT_MM - yPadMm - 1.0) / drawLines.size.coerceAtLeast(1)
            val fontMm = min(1.85, lineStepMm * 0.72)
            var yMm = yPadMm
            for (line in drawLines) {
                val lineH = max(2.0, min(lineStepMm, TEST_LABEL_HEIGHT_MM - yMm - 1.0))
                if (yMm + lineH > TEST_LABEL_HEIGHT_MM - 0.5) break
                currentApi.drawTextRegular(line, xPadMm, yMm, textW, lineH, fontMm, 1)
                yMm += lineStepMm
            }
            val committed = currentApi.commitJob()
            Log.i(TAG, "[JOSH-PRINT-P3:TEST-SUBMIT] commitJob returned: $committed, awaiting physical hardware ACK")
            if (!committed) {
                return false
            }

            val completed = try {
                latch.await(15_000L, TimeUnit.MILLISECONDS)
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                false
            }
            Log.i(TAG, "[JOSH-PRINT-P4:TEST-RESULT] Physical print result: completed=$completed, success=$lastPrintSuccess")
            completed && lastPrintSuccess
        } catch (e: Exception) {
            Log.e(TAG, "[JOSH-PRINT-P4:TEST-ERROR] Error during test print", e)
            false
        } finally {
            printLatch = null
            isPrinting.set(false)
            printLock.unlock()
            if (isConnected()) {
                setState(State.CONNECTED)
            } else {
                setState(State.DISCONNECTED)
            }
            Log.i(TAG, "[JOSH-PRINT-P5:TEST-FINALIZE] State restored to ${state.get()}")
        }
    }

    private data class LabelSubmitTiming(val submitMs: Long, val waitMs: Long, val strategyUsed: Int)

    /** Logical 1-bit buffer (black=1, MSB first) → ARGB bitmap, 1 px per printer dot. */
    private fun mono1bppToBitmap(
        monoBytes: ByteArray,
        widthDots: Int,
        heightDots: Int,
        bytesPerRow: Int,
    ): Bitmap {
        val bitmap = Bitmap.createBitmap(widthDots, heightDots, Bitmap.Config.ARGB_8888)
        val row = IntArray(widthDots)
        for (y in 0 until heightDots) {
            val srcRow = y * bytesPerRow
            for (x in 0 until widthDots) {
                val byteIndex = srcRow + (x shr 3)
                val bitMask = 0x80 shr (x and 7)
                val black = (monoBytes[byteIndex].toInt() and bitMask) != 0
                row[x] = if (black) Color.BLACK else Color.WHITE
            }
            bitmap.setPixels(row, 0, widthDots, 0, y, widthDots, 1)
        }
        return bitmap
    }

    private fun compositeLabelPage(
        source: Bitmap,
        targetW: Int,
        targetH: Int,
        hOffsetPx: Int,
        vOffsetPx: Int,
    ): Bitmap {
        if (hOffsetPx == 0 && vOffsetPx == 0 && source.width == targetW && source.height == targetH) {
            return source
        }
        val page = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(page)
        canvas.drawColor(Color.WHITE)
        canvas.drawBitmap(source, hOffsetPx.toFloat(), vOffsetPx.toFloat(), null)
        return page
    }

    /** Keep the left `width` columns. Columns to the right are the byte-align pad. */
    private fun cropBitmapToWidth(source: Bitmap, width: Int): Bitmap {
        if (width <= 0 || source.width <= width) return source
        val cropped = Bitmap.createBitmap(width, source.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(cropped)
        canvas.drawColor(Color.WHITE)
        canvas.drawBitmap(source, 0f, 0f, null)
        if (!source.isRecycled) source.recycle()
        return cropped
    }

    private fun submitLabelBitmapAndWait(
        currentApi: LPAPI,
        jobId: String,
        bitmap: Bitmap,
        widthMm: Double,
        heightMm: Double,
        copies: Int,
        paramDensity: Int,
        paramSpeed: Int,
        paramGapType: Int,
        paramGapLengthMm: Double,
        alignment: String,
    ): LabelSubmitTiming? {
        lastPrintSuccess = false
        lastPrintConfirmedByDevice = false
        val latch = CountDownLatch(1)
        printLatch = latch

        val gapTypeValue = if (paramGapType >= 0) paramGapType else GAP_TYPE_LABEL
        val gapLengthValue = gapMmTo01mm(if (paramGapLengthMm >= 0.0) paramGapLengthMm else LABEL_GAP_MM)
        try {
            currentApi.setPrintPageGapType(gapTypeValue)
            currentApi.setPrintPageGapLength(gapLengthValue)
        } catch (e: Exception) {
            Log.w(TAG, "[$jobId] setPrintPageGap* threw (non-fatal)", e)
        }

        val printParams = Bundle().apply {
            if (gapTypeValue >= 0) putInt(PrintParamName.GAP_TYPE, gapTypeValue)
            if (gapLengthValue >= 0) putInt(PrintParamName.GAP_LENGTH, gapLengthValue)
            if (paramDensity >= 0) putInt(PrintParamName.PRINT_DENSITY, paramDensity)
            if (paramSpeed >= 0) putInt(PrintParamName.PRINT_SPEED, paramSpeed)
            if (copies > 1) putInt(PrintParamName.PRINT_COPIES, copies)
        }
        val finalParams = if (printParams.isEmpty) null else printParams
        val xMm = 0.0
        val yMm = 0.0

        try {
            currentApi.abortJob()
        } catch (e: Exception) {
            Log.w(TAG, "[$jobId] abortJob threw (non-fatal)", e)
        }

        val tSubmitStart = System.currentTimeMillis()
        var strategyUsed = 0
        var submitted = submitMmJob(currentApi, bitmap, widthMm, heightMm, xMm, yMm, finalParams, alignment)
        if (submitted) strategyUsed = 1
        if (!submitted) {
            submitted = submitMmJob(currentApi, bitmap, widthMm, heightMm, xMm, yMm, null, alignment)
            if (submitted) strategyUsed = 2
        }
        if (!submitted) {
            submitted = try {
                currentApi.printBitmap(bitmap, finalParams)
            } catch (e: Exception) {
                false
            }
            if (submitted) strategyUsed = 3
        }
        if (!submitted) {
            submitted = try {
                currentApi.printBitmap(bitmap, null)
            } catch (e: Exception) {
                false
            }
            if (submitted) strategyUsed = 4
        }
        if (!submitted) {
            printLatch = null
            lastError = "JOSH_PRINT_FAILED: Print request rejected by LPAPI SDK"
            handlePrintFailed("Print request rejected by LPAPI SDK")
            return null
        }
        val tSubmitEnd = System.currentTimeMillis()

        printSubmitFallback?.let { mainHandler.removeCallbacks(it) }
        val submitFallback = Runnable {
            if (printLatch != null && isPrinting.get() && !lastPrintSuccess) {
                lastPrintSuccess = true
                printLatch?.countDown()
                mainHandler.post { handlePrintSuccess() }
            }
        }
        printSubmitFallback = submitFallback
        mainHandler.postDelayed(submitFallback, PRINT_SUBMIT_FALLBACK_MS)

        val completed = try {
            latch.await(PRINT_TIMEOUT_MS, TimeUnit.MILLISECONDS)
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            false
        }
        printLatch = null
        val tDone = System.currentTimeMillis()

        if (!completed) {
            lastError = "JOSH_PRINT_TIMEOUT"
            setState(State.PRINT_FAILED)
            emitError("JOSH_PRINT_TIMEOUT", "Print timed out — printer may be unresponsive")
            emitPrintProgress(jobId, "TIMEOUT", mapOf("timeoutMs" to PRINT_TIMEOUT_MS))
            return null
        }
        if (!lastPrintSuccess) {
            return null
        }
        return LabelSubmitTiming(tSubmitEnd - tSubmitStart, tDone - tSubmitEnd, strategyUsed)
    }

    private fun containFitToPage(
        src: Bitmap,
        pageW: Int,
        pageH: Int,
        alignment: String,
    ): Bitmap {
        val page = Bitmap.createBitmap(pageW, pageH, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(page)
        canvas.drawColor(Color.WHITE)
        if (src.width <= 0 || src.height <= 0) return page
        val scale = Math.min(pageW.toFloat() / src.width, pageH.toFloat() / src.height)
        val dw = src.width * scale
        val dh = src.height * scale
        val left = if (alignment.equals("left", ignoreCase = true)) 0f else (pageW - dw) / 2f
        val top = if (alignment.equals("left", ignoreCase = true)) 0f else (pageH - dh) / 2f
        val paint = Paint().apply {
            isFilterBitmap = true
            isDither = true
            isAntiAlias = false
        }
        canvas.drawBitmap(src, null, RectF(left, top, left + dw, top + dh), paint)
        return page
    }

    private fun submitMmJob(
        api: LPAPI,
        bitmap: Bitmap,
        widthMm: Double,
        heightMm: Double,
        xMm: Double,
        yMm: Double,
        params: Bundle?,
        alignment: String = "left",
    ): Boolean {
        return try {
            if (!api.startJob(widthMm, heightMm, 0)) {
                false
            } else {
                // Left/top pins ink to the label origin; center shifts the whole page on the head.
                val hAlign = if (alignment.equals("center", ignoreCase = true)) 1 else 0
                val vAlign = if (alignment.equals("center", ignoreCase = true)) 1 else 0
                try {
                    api.setItemHorizontalAlignment(hAlign)
                    api.setItemVerticalAlignment(vAlign)
                } catch (_: Exception) {}
                api.drawBitmap(bitmap, xMm, yMm, widthMm, heightMm)
                if (params != null) {
                    api.commitJobWithParam(params)
                } else {
                    api.commitJob()
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "[JOSH-PRINT-P3:SUBMIT] startJob(mm)+drawBitmap(mm) threw", e)
            false
        }
    }

    /**
     * Check if a device name matches DothanTech SDK printer model formats.
     */
    fun isDeviceNameSupported(name: String?): Boolean {
        if (name.isNullOrBlank()) return false
        return try {
            com.dothantech.b.b.g(name)
        } catch (e: Throwable) {
            false
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  State Accessors
    // ═══════════════════════════════════════════════════════════════════

    fun getState(): State = state.get()

    fun isConnected(): Boolean {
        val currentApi = api ?: return false
        val isOpened = try {
            currentApi.isPrinterOpened
        } catch (e: Exception) {
            false
        }
        if (isOpened) {
            val s = state.get()
            if (s == State.DISCONNECTED || s == State.IDLE || s == State.PRINT_SUCCESS || s == State.PRINT_FAILED) {
                state.set(State.CONNECTED)
            }
            return true
        }
        return false
    }

    fun getStateSnapshot(): Map<String, Any?> {
        return mapOf(
            "state" to state.get().name,
            "isConnected" to isConnected(),
            "isPrinting" to isPrinting.get(),
            "isDiscovering" to isDiscovering.get(),
            "printerName" to connectedPrinterName,
            "macAddress" to connectedMacAddress,
            "lastError" to lastError,
            "lastConnectedAt" to lastConnectedAt.get(),
            "density" to density,
            "speed" to speed,
            "gapType" to gapType,
            "gapLength" to gapLengthMm,
        )
    }

    /**
     * Printer battery 0–100 from LPAPI [IDzPrinter2.PrinterParam], or -1 when unknown.
     * Blocks briefly while [refreshPrinterParam] settles (same path as debug probe).
     */
    fun getBatteryLevel(): Int {
        if (!isConnected()) return -1
        val dz2 = IDzPrinter.Factory.getInstance() as? IDzPrinter2 ?: return -1
        return try {
            dz2.refreshPrinterParam()
            var param = dz2.getPrinterParam()
            var percent = mapJoshBatteryToPercent(param)
            val refreshStart = System.currentTimeMillis()
            while (percent < 0 && System.currentTimeMillis() - refreshStart < BATTERY_POLL_TIMEOUT_MS) {
                Thread.sleep(BATTERY_POLL_MS)
                param = dz2.getPrinterParam()
                percent = mapJoshBatteryToPercent(param)
            }
            percent
        } catch (e: Exception) {
            Log.w(TAG, "getBatteryLevel failed", e)
            -1
        }
    }

    private fun mapJoshBatteryToPercent(param: IDzPrinter2.PrinterParam?): Int {
        if (param == null) return -1
        val countStr = param.batteryVoltageCount?.trim()
        if (!countStr.isNullOrEmpty()) {
            countStr.toIntOrNull()?.let { if (it in 0..100) return it }
            Regex("""(\d{1,3})""").find(countStr)?.groupValues?.getOrNull(1)?.toIntOrNull()?.let {
                if (it in 0..100) return it
            }
        }
        val v = param.batteryVoltage
        if (!v.isFinite() || v <= 0) return -1
        if (v in 1.0..100.0 && abs(v - round(v)) < 0.01) {
            val p = round(v).toInt()
            if (p in 0..100) return p
        }
        if (v in 280.0..435.0) return liIonSinglePercent(v / 100.0)
        if (v in 2.8..4.35) return liIonSinglePercent(v)
        if (v in 600.0..850.0) return liIon2sPercent(v / 100.0)
        if (v in 6.0..8.5) return liIon2sPercent(v)
        return -1
    }

    private fun liIonSinglePercent(volts: Double): Int {
        return ((volts - 3.0) / (4.2 - 3.0) * 100.0).toInt().coerceIn(0, 100)
    }

    private fun liIon2sPercent(volts: Double): Int {
        return ((volts - 6.0) / (8.4 - 6.0) * 100.0).toInt().coerceIn(0, 100)
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Debug-only battery probe (no UI, no percent mapping)
    // ═══════════════════════════════════════════════════════════════════

    private fun isDebuggable(): Boolean {
        return (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    }

    /**
     * LPAPI is created via [LPAPI.Factory.createInstance] with no custom [IDzPrinter] — shared DzPrinter singleton.
     */
    fun scheduleDebugBatteryLogAfterConnect() {
        if (!isDebuggable()) return
        if (!batteryDebugScheduled.compareAndSet(false, true)) return
        mainHandler.postDelayed({
            Thread({ debugLogBattery() }, "josh-battery-debug").start()
        }, 500)
    }

    fun debugLogBattery() {
        if (!isDebuggable()) return
        if (!isConnected()) {
            Log.i(BATTERY_DEBUG_TAG, "not connected")
            return
        }
        val dz2 = IDzPrinter.Factory.getInstance() as? IDzPrinter2
        if (dz2 == null) {
            Log.i(BATTERY_DEBUG_TAG, "IDzPrinter.Factory.getInstance() is not IDzPrinter2")
            return
        }
        logPrinterParamSnapshot("BEFORE", dz2.getPrinterParam())
        val refreshOk = dz2.refreshPrinterParam()
        Log.i(BATTERY_DEBUG_TAG, "refreshPrinterParam() returned $refreshOk")
        val beforeVoltage = dz2.getPrinterParam()?.batteryVoltage
        val refreshStart = System.currentTimeMillis()
        var changedAtMs: Long? = null
        var polls = 0
        while (System.currentTimeMillis() - refreshStart < BATTERY_POLL_TIMEOUT_MS) {
            Thread.sleep(BATTERY_POLL_MS)
            polls++
            val nowParam = dz2.getPrinterParam()
            val nowVoltage = nowParam?.batteryVoltage
            if (beforeVoltage != null && nowVoltage != null && nowVoltage != beforeVoltage) {
                changedAtMs = System.currentTimeMillis() - refreshStart
                Log.i(
                    BATTERY_DEBUG_TAG,
                    "batteryVoltage changed after ${changedAtMs}ms (poll #$polls): $beforeVoltage -> $nowVoltage",
                )
                break
            }
        }
        if (changedAtMs == null) {
            val elapsed = System.currentTimeMillis() - refreshStart
            Log.i(
                BATTERY_DEBUG_TAG,
                "no batteryVoltage change within ${elapsed}ms ($polls polls); last=${dz2.getPrinterParam()?.batteryVoltage}",
            )
        }
        logPrinterParamSnapshot("AFTER", dz2.getPrinterParam())
        Log.i(BATTERY_DEBUG_TAG, "final PrinterParam=${dz2.getPrinterParam()?.toString()}")
    }

    private fun logPrinterParamSnapshot(label: String, param: IDzPrinter2.PrinterParam?) {
        if (param == null) {
            Log.i(BATTERY_DEBUG_TAG, "$label param=null")
            return
        }
        Log.i(
            BATTERY_DEBUG_TAG,
            "$label batteryVoltage=${param.batteryVoltage} chargeStatus=${param.chargeStatus} " +
                "batteryCount=${param.batteryCount} batteryVoltageCount=${param.batteryVoltageCount} " +
                "printerStatus=${param.printerStatus}",
        )
    }

    // ═══════════════════════════════════════════════════════════════════
    //  LPAPI Callback Handlers (always called on main thread)
    // ═══════════════════════════════════════════════════════════════════

    private fun handleConnected(address: PrinterAddress?) {
        val callbackMac = address?.macAddress
        val expectedMac = connectingMacAddress
        if (
            isConnecting.get() &&
            expectedMac != null &&
            callbackMac != null &&
            !callbackMac.equals(expectedMac, ignoreCase = true)
        ) {
            Log.w(TAG, "[CONNECTED] Ignoring $callbackMac while a connect to $expectedMac is in progress")
            return
        }
        Log.i(TAG, "[CONNECTED] ${address?.shownName ?: address?.macAddress}")
        connectedPrinterAddress = address
        connectedPrinterName = address?.shownName ?: api?.printerName ?: connectingMacAddress
        connectedMacAddress = address?.macAddress ?: connectingMacAddress
        connectingMacAddress = null
        lastConnectedAt.set(System.currentTimeMillis())
        isConnecting.set(false)

        setState(State.CONNECTED)
        connectLatch?.countDown()

        listener?.onStateChanged(State.CONNECTED, mapOf(
            "printerName" to (connectedPrinterName ?: connectedMacAddress),
            "macAddress" to connectedMacAddress,
            "timestamp" to lastConnectedAt.get(),
        ))
        scheduleDebugBatteryLogAfterConnect()
    }

    private fun handleDisconnected() {
        Log.i(TAG, "[DISCONNECTED] Previous: ${connectedPrinterName ?: connectedMacAddress}, isConnecting=${isConnecting.get()}")
        val wasConnected = state.get() == State.CONNECTED ||
                state.get() == State.PRINTING ||
                state.get() == State.PRINT_SUCCESS ||
                state.get() == State.PRINT_FAILED

        connectedPrinterAddress = null
        connectedPrinterName = null
        connectedMacAddress = null
        batteryDebugScheduled.set(false)
        if (!isConnecting.get()) {
            connectingMacAddress = null
        }

        // If actively connecting, DO NOT abort the connection attempt or count down the latch!
        // Transient Disconnected callbacks from a prior session or initial state must not fail the handshake.
        if (!isConnecting.get()) {
            setState(State.DISCONNECTED)
            listener?.onStateChanged(State.DISCONNECTED, mapOf(
                "wasConnected" to wasConnected,
                "timestamp" to System.currentTimeMillis(),
            ))
        }

        // Release print latch if waiting — but not during an active job (transient ACL drops).
        if (isPrinting.get()) {
            Log.w(TAG, "[DISCONNECT-DURING-PRINT] Suppressing latch release — job will resolve via callback or timeout")
        } else {
            lastPrintSuccess = false
            printLatch?.countDown()
        }

        // Do not reconnect the previous printer when the user is switching, or when
        // disconnect() / a newer connect() already took the bridge.
        if (suppressNativeReconnect.get() || isConnecting.get()) {
            Log.d(TAG, "[AUTO_RECONNECT] Suppressed — switching printers or connect in progress")
        } else if (wasConnected && lastConnectedAddress != null) {
            val scheduledToken = connectToken.get()
            Log.i(TAG, "[AUTO_RECONNECT] Unexpected disconnect — scheduling reconnect")
            Thread({
                try {
                    Thread.sleep(500)
                    if (
                        connectToken.get() != scheduledToken ||
                        suppressNativeReconnect.get() ||
                        isConnecting.get()
                    ) {
                        Log.d(TAG, "[AUTO_RECONNECT] Cancelled — a newer printer took this bridge")
                        return@Thread
                    }
                    reconnect()
                } catch (e: InterruptedException) {
                    Thread.currentThread().interrupt()
                }
            }, "josh-reconnect").start()
        }
    }

    private fun handlePrinterDiscovered(address: PrinterAddress) {
        val mac = address.macAddress ?: return
        val key = mac.uppercase()

        // Deduplicate by MAC
        if (discoveredPrinters.containsKey(key)) return

        val shownName = (address.shownName ?: "").trim()
        val lowerName = shownName.lowercase()

        // Filter: DO NOT claim devices that belong to TD-404, Tejas, Rudra, Tez, Shakti, or Dev printers!
        if (lowerName.contains("tejas") ||
            lowerName.contains("rudra") ||
            lowerName.contains("td-404") ||
            lowerName.contains("td404") ||
            lowerName.contains("minix") ||
            lowerName.contains("caysn")
        ) {
            Log.d(TAG, "[PRINTER_IGNORED_NON_JOSH] Ignoring non-JOSH printer in JOSH scan: $shownName ($mac)")
            return
        }

        discoveredPrinters[key] = address

        Log.i(TAG, "[PRINTER_FOUND] name=${address.shownName} mac=$mac")

        val btAdapter = BluetoothAdapter.getDefaultAdapter()
        val dev = try { btAdapter?.getRemoteDevice(mac) } catch (_: Exception) { null }
        val isBonded = dev?.bondState == android.bluetooth.BluetoothDevice.BOND_BONDED

        val data = mapOf<String, Any?>(
            "id" to mac,
            "name" to (if (shownName.isNotBlank()) shownName else mac),
            "macAddress" to mac,
            "transport" to "josh-lpapi",
            "sdkId" to "josh",
            "bonded" to isBonded,
        )
        listener?.onPrinterDiscovered(data)
    }

    private fun handlePrintSuccess() {
        Log.i(TAG, "[PRINT_SUCCESS]")
        cancelPrintFallbacks()
        lastPrintSuccess = true
        setState(State.PRINT_SUCCESS)
        printLatch?.countDown()

        val jobId = "JOSH-PRINT-${String.format("%03d", jobIdCounter.get())}"
        emitPrintProgress(jobId, "SUCCESS", emptyMap())
    }

    private fun handlePrintFailed(reason: String) {
        Log.e(TAG, "[PRINT_FAILED] $reason")
        cancelPrintFallbacks()
        lastPrintSuccess = false
        lastError = "JOSH_PRINT_FAILED: $reason"
        setState(State.PRINT_FAILED)
        printLatch?.countDown()

        val jobId = "JOSH-PRINT-${String.format("%03d", jobIdCounter.get())}"
        emitPrintProgress(jobId, "FAILED", mapOf("reason" to reason))
        emitError("JOSH_PRINT_FAILED", reason)
    }

    private fun cancelPrintFallbacks() {
        printSubmitFallback?.let { mainHandler.removeCallbacks(it) }
        printSubmitFallback = null
        printDataEndedFallback?.let { mainHandler.removeCallbacks(it) }
        printDataEndedFallback = null
    }

    // ═══════════════════════════════════════════════════════════════════
    //  State + Event Helpers
    // ═══════════════════════════════════════════════════════════════════

    private fun setState(newState: State) {
        val old = state.getAndSet(newState)
        if (old != newState) {
            Log.d(TAG, "[STATE] $old → $newState")
        }
    }

    private fun emitError(code: String, message: String) {
        listener?.onError(code, message)
    }

    private fun emitPrintProgress(jobId: String, progress: String, data: Map<String, Any?>) {
        listener?.onPrintProgress(jobId, progress, data)
    }
}
