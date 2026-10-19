package expo.modules.smsconsent

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import com.google.android.gms.auth.api.identity.GetPhoneNumberHintIntentRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.auth.api.phone.SmsRetriever
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.common.api.Status
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val CONSENT_REQUEST_CODE = 5193
private const val PHONE_HINT_REQUEST_CODE = 5194
private const val TAG = "SmsConsent"

/**
 * Wraps Google's SMS User Consent API: Play services shows its own "Allow to read this
 * message?" prompt for the next SMS, and only that one message is handed to the app.
 * No READ_SMS permission and no app hash in the message is needed.
 */
class SmsConsentModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var receiver: BroadcastReceiver? = null
  private var hintPromise: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("SmsConsent")

    Events("onMessage", "onTimeout")

    AsyncFunction("startListening") {
      stop()
      val br = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
          if (intent?.action != SmsRetriever.SMS_RETRIEVED_ACTION) return
          val status = intent.extras?.get(SmsRetriever.EXTRA_STATUS) as? Status ?: return
          when (status.statusCode) {
            CommonStatusCodes.SUCCESS -> {
              @Suppress("DEPRECATION")
              val consent = intent.extras?.getParcelable<Intent>(SmsRetriever.EXTRA_CONSENT_INTENT)
              val activity = appContext.currentActivity
              if (consent != null && activity != null) {
                try {
                  activity.startActivityForResult(consent, CONSENT_REQUEST_CODE)
                } catch (e: Exception) {
                  Log.w(TAG, "could not show the consent prompt", e)
                }
              }
            }
            CommonStatusCodes.TIMEOUT -> sendEvent("onTimeout", emptyMap<String, Any?>())
          }
        }
      }
      val filter = IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION)
      if (Build.VERSION.SDK_INT >= 33) {
        context.registerReceiver(
          br,
          filter,
          SmsRetriever.SEND_PERMISSION,
          null,
          Context.RECEIVER_EXPORTED,
        )
      } else {
        context.registerReceiver(br, filter, SmsRetriever.SEND_PERMISSION, null)
      }
      receiver = br
      SmsRetriever.getClient(context).startSmsUserConsent(null)
    }

    Function("stopListening") { stop() }

    // Google's Phone Number Hint: a system sheet listing the numbers on this phone. No permission
    // is needed and the app only receives the number the person taps. Resolves null if dismissed.
    AsyncFunction("requestPhoneNumberHint") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(null)
        return@AsyncFunction
      }
      hintPromise?.resolve(null)
      hintPromise = promise
      Identity.getSignInClient(activity)
        .getPhoneNumberHintIntent(GetPhoneNumberHintIntentRequest.builder().build())
        .addOnSuccessListener { pending ->
          try {
            activity.startIntentSenderForResult(pending.intentSender, PHONE_HINT_REQUEST_CODE, null, 0, 0, 0)
          } catch (e: Exception) {
            Log.w(TAG, "could not show the phone number sheet", e)
            hintPromise?.resolve(null)
            hintPromise = null
          }
        }
        .addOnFailureListener { e ->
          Log.w(TAG, "phone number hint unavailable", e)
          hintPromise?.resolve(null)
          hintPromise = null
        }
    }

    OnActivityResult { _, (requestCode, resultCode, intent) ->
      if (requestCode == PHONE_HINT_REQUEST_CODE) {
        val pending = hintPromise
        hintPromise = null
        val activity = appContext.currentActivity
        var number: String? = null
        if (resultCode == Activity.RESULT_OK && intent != null && activity != null) {
          try {
            number = Identity.getSignInClient(activity).getPhoneNumberFromIntent(intent)
          } catch (e: Exception) {
            Log.w(TAG, "could not read the chosen number", e)
          }
        }
        pending?.resolve(number)
        return@OnActivityResult
      }
      if (requestCode != CONSENT_REQUEST_CODE) return@OnActivityResult
      if (resultCode == Activity.RESULT_OK) {
        val message = intent?.getStringExtra(SmsRetriever.EXTRA_SMS_MESSAGE)
        if (message != null) sendEvent("onMessage", mapOf("message" to message))
      }
    }

    OnDestroy { stop() }
  }

  private fun stop() {
    val br = receiver ?: return
    receiver = null
    try {
      context.unregisterReceiver(br)
    } catch (_: Exception) {
    }
  }
}
