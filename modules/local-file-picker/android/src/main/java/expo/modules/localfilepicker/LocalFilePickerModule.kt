package expo.modules.localfilepicker

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.FileUtils
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.io.File
import java.io.FileNotFoundException
import java.io.FileOutputStream

private const val PICK_LOCAL_CODE = 5192
private const val TAG = "LocalFilePicker"
private const val DEFAULT_MAX_BYTES = 104_857_600L // 100 MB
private const val PRIMARY_ROOT_URI =
  "content://com.android.externalstorage.documents/document/primary:"

data class PickLocalDocumentOptions(
  @Field val mimeTypes: List<String>,
  @Field val multiple: Boolean = false,
  @Field val maxBytes: Double = DEFAULT_MAX_BYTES.toDouble(),
) : Record

class LocalFilePickerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var pendingPromise: Promise? = null
  private var pendingMaxBytes: Long = DEFAULT_MAX_BYTES
  private var lastPickPath: String? = null

  override fun definition() = ModuleDefinition {
    Name("LocalFilePicker")

    AsyncFunction("getFilePickerDiagnostics") {
      buildDiagnostics()
    }

    AsyncFunction("pickLocalDocumentAsync") { options: PickLocalDocumentOptions, promise: Promise ->
      if (pendingPromise != null) {
        throw PickInProgressException()
      }
      pendingPromise = promise
      pendingMaxBytes = options.maxBytes.toLong().coerceAtLeast(1L)
      val intent = buildPickIntent(options.mimeTypes, options.multiple)
        ?: throw NoLocalPickerException()
      appContext.throwingActivity.startActivityForResult(intent, PICK_LOCAL_CODE)
    }

    OnActivityResult { _, (requestCode, resultCode, intent) ->
      if (requestCode != PICK_LOCAL_CODE || pendingPromise == null) {
        return@OnActivityResult
      }

      val promise = pendingPromise!!
      pendingPromise = null

      if (resultCode != Activity.RESULT_OK || intent?.data == null) {
        promise.resolve(canceledPickResult())
        return@OnActivityResult
      }

      try {
        val asset = copyPickedUriToCache(intent.data!!, pendingMaxBytes)
        Log.i(TAG, "pick succeeded via $lastPickPath -> ${asset.uri}")
        promise.resolve(successPickResult(asset))
      } catch (error: FileTooLargeException) {
        promise.reject(error)
      } catch (error: Exception) {
        promise.reject(PickFailedException(error.message ?: "Could not read the selected file."))
      }
    }
  }

  private fun buildDiagnostics(): Map<String, Any?> {
    val pm = context.packageManager
    val openDocument = baseOpenDocumentIntent()
    val getContent = baseGetContentIntent()
    val openTree = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)

    return mapOf(
      "manufacturer" to Build.MANUFACTURER,
      "model" to Build.MODEL,
      "sdkInt" to Build.VERSION.SDK_INT,
      "expoDocumentPickerPatched" to isExpoDocumentPickerPatched(),
      "intents" to listOf(
        intentDiagnostics("ACTION_OPEN_DOCUMENT", openDocument, pm),
        intentDiagnostics("ACTION_GET_CONTENT", getContent, pm),
        intentDiagnostics("ACTION_OPEN_DOCUMENT_TREE", openTree, pm),
      ),
      "knownPackages" to KNOWN_PACKAGES.map { packageName ->
        mapOf(
          "packageName" to packageName,
          "installed" to isPackageInstalled(packageName, pm),
          "label" to packageLabel(packageName, pm),
        )
      },
      "preferredPackages" to PREFERRED_PACKAGES.map { packageName ->
        mapOf(
          "packageName" to packageName,
          "installed" to isPackageInstalled(packageName, pm),
          "handlesGetContent" to packageHandlesIntent(packageName, baseGetContentIntent(), pm),
        )
      },
    )
  }

  private fun intentDiagnostics(
    name: String,
    intent: Intent,
    pm: PackageManager,
  ): Map<String, Any?> {
    val queryFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PackageManager.MATCH_ALL
    } else {
      0
    }
    val handlers = pm.queryIntentActivities(intent, queryFlags).map { resolveInfo ->
      mapOf(
        "packageName" to resolveInfo.activityInfo.packageName,
        "label" to resolveInfo.loadLabel(pm).toString(),
        "activityName" to resolveInfo.activityInfo.name,
      )
    }
    val defaultResolve = pm.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY)
    return mapOf(
      "name" to name,
      "handlers" to handlers,
      "defaultPackage" to defaultResolve?.activityInfo?.packageName,
      "defaultLabel" to defaultResolve?.loadLabel(pm)?.toString(),
      "defaultActivity" to defaultResolve?.activityInfo?.name,
    )
  }

  private fun isExpoDocumentPickerPatched(): Boolean {
    return try {
      val optionsClass = Class.forName("expo.modules.documentpicker.DocumentPickerOptions")
      val moduleClass = Class.forName("expo.modules.documentpicker.DocumentPickerModule")
      val hasLocalOnly = optionsClass.declaredFields.any { it.name == "localOnly" }
      val hasInitialFolder = optionsClass.declaredFields.any { it.name == "initialFolder" }
      val hasResolver = moduleClass.declaredMethods.any { it.name == "resolveInitialFolderUri" }
      hasLocalOnly && hasInitialFolder && hasResolver
    } catch (_: Exception) {
      false
    }
  }

  private fun buildPickIntent(mimeTypes: List<String>, multiple: Boolean): Intent? {
    val normalizedTypes = mimeTypes.ifEmpty { listOf("*/*") }
    for (packageName in PREFERRED_PACKAGES) {
      if (!packageHandlesIntent(packageName, baseGetContentIntent(), context.packageManager)) {
        continue
      }
      val intent = baseGetContentIntent(normalizedTypes, multiple).apply {
        putExtra(Intent.EXTRA_LOCAL_ONLY, true)
        setPackage(packageName)
      }
      lastPickPath = "GET_CONTENT:$packageName"
      Log.i(TAG, "launching $lastPickPath")
      return intent
    }

    val openDocument = baseOpenDocumentIntent(normalizedTypes, multiple).apply {
      putExtra(Intent.EXTRA_LOCAL_ONLY, true)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse(PRIMARY_ROOT_URI))
      }
    }
    lastPickPath = "OPEN_DOCUMENT:primary-root"
    Log.i(TAG, "launching $lastPickPath")
    return openDocument
  }

  private fun baseOpenDocumentIntent(
    mimeTypes: List<String> = listOf("*/*"),
    multiple: Boolean = false,
  ): Intent =
    Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
      type = if (mimeTypes.size > 1) {
        putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes.toTypedArray())
        "*/*"
      } else {
        mimeTypes.first()
      }
    }

  private fun baseGetContentIntent(
    mimeTypes: List<String> = listOf("*/*"),
    multiple: Boolean = false,
  ): Intent =
    Intent(Intent.ACTION_GET_CONTENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple)
      type = if (mimeTypes.size > 1) {
        putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes.toTypedArray())
        "*/*"
      } else {
        mimeTypes.first()
      }
    }

  private fun packageHandlesIntent(
    packageName: String,
    baseIntent: Intent,
    pm: PackageManager,
  ): Boolean {
    if (!isPackageInstalled(packageName, pm)) return false
    val probe = Intent(baseIntent).apply { setPackage(packageName) }
    val matches = pm.queryIntentActivities(probe, PackageManager.MATCH_DEFAULT_ONLY)
    return matches.isNotEmpty()
  }

  private fun isPackageInstalled(packageName: String, pm: PackageManager): Boolean {
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        pm.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
      } else {
        @Suppress("DEPRECATION")
        pm.getPackageInfo(packageName, 0)
      }
      true
    } catch (_: PackageManager.NameNotFoundException) {
      false
    }
  }

  private fun packageLabel(packageName: String, pm: PackageManager): String? {
    return try {
      val appInfo = pm.getApplicationInfo(packageName, 0)
      pm.getApplicationLabel(appInfo).toString()
    } catch (_: PackageManager.NameNotFoundException) {
      null
    }
  }

  private fun copyPickedUriToCache(uri: Uri, maxBytes: Long): PickedAsset {
    val (name, size, mimeType) = readDocumentMetadata(uri)
    if (size != null && size > maxBytes) {
      throw FileTooLargeException(maxBytes)
    }

    val cacheDir = File(context.cacheDir, "local-file-picker").apply { mkdirs() }
    val safeName = sanitizeFileName(name)
    val extension = safeName.substringAfterLast('.', "")
    val outputBase = if (extension.isNotEmpty()) {
      safeName.removeSuffix(".$extension")
    } else {
      safeName
    }
    val outputFile = File.createTempFile(outputBase.ifEmpty { "picked" }, if (extension.isNotEmpty()) ".$extension" else "", cacheDir)

    context.contentResolver.openInputStream(uri).use { inputStream ->
      inputStream ?: throw FileNotFoundException("Input stream for $uri was null.")
      FileOutputStream(outputFile).use { outputStream ->
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          FileUtils.copy(inputStream, outputStream)
        } else {
          inputStream.copyTo(outputStream)
        }
      }
    }

    val finalSize = outputFile.length()
    if (finalSize > maxBytes) {
      outputFile.delete()
      throw FileTooLargeException(maxBytes)
    }

    return PickedAsset(
      uri = Uri.fromFile(outputFile).toString(),
      name = safeName,
      size = finalSize,
      mimeType = mimeType,
      pickPath = lastPickPath,
    )
  }

  private fun readDocumentMetadata(uri: Uri): Triple<String, Long?, String?> {
    var name = "file"
    var size: Long? = null
    var mimeType = context.contentResolver.getType(uri)

    context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) {
        name = cursor.readColumn(OpenableColumns.DISPLAY_NAME) ?: name
        size = cursor.readLongColumn(OpenableColumns.SIZE)
      }
    }

    return Triple(name, size, mimeType)
  }

  private fun Cursor.readColumn(column: String): String? {
    val index = getColumnIndex(column)
    if (index == -1 || isNull(index)) return null
    return getString(index)
  }

  private fun Cursor.readLongColumn(column: String): Long? {
    val index = getColumnIndex(column)
    if (index == -1 || isNull(index)) return null
    return getLong(index)
  }

  private fun sanitizeFileName(name: String): String {
    val trimmed = name.trim().ifEmpty { "file" }
    return trimmed.replace(Regex("[\\\\/]+"), "_")
  }

  private fun canceledPickResult(): Map<String, Any?> = mapOf(
    "canceled" to true,
    "asset" to null,
  )

  private fun successPickResult(asset: PickedAsset): Map<String, Any?> = mapOf(
    "canceled" to false,
    "asset" to mapOf(
      "uri" to asset.uri,
      "name" to asset.name,
      "size" to asset.size,
      "mimeType" to asset.mimeType,
      "pickPath" to asset.pickPath,
    ),
  )

  companion object {
    private val PREFERRED_PACKAGES = listOf(
      "com.mi.android.globalFileexplorer",
      "com.android.fileexplorer",
      "com.sec.android.app.myfiles",
      "com.google.android.apps.nbu.files",
    )

    private val KNOWN_PACKAGES = listOf(
      "com.mi.android.globalFileexplorer",
      "com.android.fileexplorer",
      "com.google.android.apps.nbu.files",
      "com.sec.android.app.myfiles",
      "com.android.documentsui",
      "com.google.android.documentsui",
    )
  }
}

data class PickedAsset(
  val uri: String,
  val name: String,
  val size: Long,
  val mimeType: String?,
  val pickPath: String?,
)

class PickInProgressException :
  CodedException("PICK_IN_PROGRESS", "A local file pick is already in progress.", null)

class NoLocalPickerException :
  CodedException("NO_LOCAL_PICKER", "No local file picker is available on this device.", null)

class PickFailedException(message: String) :
  CodedException("PICK_FAILED", message, null)

class FileTooLargeException(maxBytes: Long) :
  CodedException("FILE_TOO_LARGE", "That file is larger than ${maxBytes / (1024 * 1024)} MB.", null)
