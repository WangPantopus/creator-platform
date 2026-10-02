package com.pantopus.qelvora.ui

import android.Manifest
import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.pantopus.qelvora.BuildConfig
import com.pantopus.qelvora.MainActivity
import com.pantopus.qelvora.generated.QelvoraCopy
import com.pantopus.qelvora.identity.SecureSessionStorage
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID

/** Device-protected metadata survives account transfers and process death.
 * Neither credentials nor Firebase registration identifiers are stored here. */
private class GrowthPushInstallation(context: Context) {
    private val preferences = context.createDeviceProtectedStorageContext().getSharedPreferences("growth-installation-v1", Context.MODE_PRIVATE)
    fun next(): Pair<String, Long> = synchronized(installationLock) {
        val id = preferences.getString("id", null)?.takeIf { runCatching { UUID.fromString(it) }.isSuccess } ?: UUID.randomUUID().toString()
        val previous = preferences.getLong("revision", 0)
        check(previous in 0 until 9_007_199_254_740_991L)
        val revision = previous + 1
        check(preferences.edit().putString("id", id).putLong("revision", revision).commit())
        id to revision
    }
    companion object { private val installationLock = Any() }
}

class GrowthApplication : Application() {
    override fun onCreate() { super.onCreate(); GrowthPush.refresh(this) }
}

/** FCM25.1 uses the real registered FID. The independent UUID above orders
 * Qelvora account bindings; it is never substituted for an FCM identifier. */
class GrowthMessagingService : FirebaseMessagingService() {
    override fun onRegistered(installationId: String) { GrowthPush.registered(this, installationId) }
    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onNewToken(token: String) { GrowthPush.refresh(this) }
    override fun onMessageReceived(message: RemoteMessage) { GrowthPush.received(this, message.data["notificationId"], message.priority == RemoteMessage.PRIORITY_HIGH) }
}

object GrowthPush {
    const val TAP_ACTION = "com.pantopus.qelvora.GROWTH_NOTIFICATION"
    const val NOTIFICATION_ID = "growth_notification_id"
    private const val channelId = "growth-updates-v1"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val registration = Mutex()
    private var generation = 0L
    private var lastSession: String? = null
    private var lastPermission: Boolean? = null
    private var retryAfter = 0L
    private var pending = false
    var failed by mutableStateOf(false); private set
    val configured: Boolean get() = BuildConfig.CREATOR_PUSH_ENABLED && runCatching { java.net.URI(BuildConfig.CREATOR_API_URL).let { it.scheme == "https" && !it.host.isNullOrBlank() && it.rawUserInfo == null && it.rawPath in listOf("", "/") && it.rawQuery == null && it.rawFragment == null } }.getOrDefault(false) &&
        BuildConfig.CREATOR_FIREBASE_APPLICATION_ID.isNotBlank() && BuildConfig.CREATOR_FIREBASE_PROJECT_ID.isNotBlank() &&
        BuildConfig.CREATOR_FIREBASE_SENDER_ID.isNotBlank() && BuildConfig.CREATOR_FIREBASE_API_KEY.isNotBlank()
    private fun credential(context: Context) = runCatching { SecureSessionStorage(context.applicationContext, BuildConfig.CREATOR_API_URL).read() }.getOrElse { failed = true; null }
    fun permitted(context: Context): Boolean = (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) && NotificationManagerCompat.from(context).areNotificationsEnabled() &&
        context.getSystemService(NotificationManager::class.java).getNotificationChannel(channelId)?.importance != NotificationManager.IMPORTANCE_NONE
    private fun messaging(context: Context): FirebaseMessaging {
        if (FirebaseApp.getApps(context).isEmpty()) {
            val options = FirebaseOptions.Builder().setApplicationId(BuildConfig.CREATOR_FIREBASE_APPLICATION_ID)
                .setProjectId(BuildConfig.CREATOR_FIREBASE_PROJECT_ID).setGcmSenderId(BuildConfig.CREATOR_FIREBASE_SENDER_ID)
                .setApiKey(BuildConfig.CREATOR_FIREBASE_API_KEY).build()
            FirebaseApp.initializeApp(context.applicationContext, options)
        }
        return FirebaseMessaging.getInstance().also { it.isAutoInitEnabled = false; it.setDeliveryMetricsExportToBigQuery(false); it.setNotificationDelegationEnabled(false) }
    }
    private fun channel(context: Context) { context.getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(channelId, QelvoraCopy.text("growthYourUpdates"), NotificationManager.IMPORTANCE_DEFAULT).apply { lockscreenVisibility = android.app.Notification.VISIBILITY_PRIVATE }) }
    fun refresh(context: Context) {
        if (!configured || pending || System.currentTimeMillis() < retryAfter) return
        val captured = credential(context) ?: return
        val granted = permitted(context)
        if (captured == lastSession && granted == lastPermission) return
        channel(context)
        val current = generation
        if (!granted) { enqueue(context, captured, null, current); return }
        pending = true
        try {
            messaging(context).register().addOnCompleteListener { task ->
                pending = false
                if (current != generation || credential(context) != captured) return@addOnCompleteListener
                if (!task.isSuccessful) { failed = true; retryAfter = System.currentTimeMillis() + 30_000 }
                // onRegistered owns the actual FID and serialized registration.
            }
        } catch (_: Exception) { pending = false; failed = true; retryAfter = System.currentTimeMillis() + 30_000 }
    }
    fun registered(context: Context, value: String) {
        if (!configured || !Regex("[A-Za-z0-9_-]{22}").matches(value)) return
        scope.launch {
            val captured = credential(context) ?: return@launch
            enqueue(context, captured, value, generation)
        }
    }
    private fun enqueue(context: Context, captured: String, value: String?, current: Long) {
        val app = context.applicationContext
        // Allocate before launching work so delayed old work retains its order.
        val order = runCatching { GrowthPushInstallation(app).next() }.getOrElse { failed = true; return }
        scope.launch {
            registration.withLock {
                if (current != generation || credential(app) != captured) return@withLock
                val granted = permitted(app)
                try {
                    val client = GrowthClient(BuildConfig.CREATOR_API_URL) { credential(app) }
                    if (granted && value != null) client.registerDevice(order.first, "fcm-fid-v1:$value", true, order.second, captured)
                    else client.revokeDevice(order.first, order.second, captured)
                    if (current == generation && credential(app) == captured) { lastSession = captured; lastPermission = granted && value != null; failed = false; retryAfter = 0 }
                } catch (cancelled: CancellationException) { throw cancelled }
                catch (_: Exception) { if (current == generation) { failed = true; retryAfter = System.currentTimeMillis() + 30_000 } }
            }
        }
    }
    fun clearSession(context: Context, captured: String?) {
        generation++; lastSession = null; lastPermission = null; retryAfter = 0; pending = false; failed = false
        context.getSystemService(NotificationManager::class.java).cancelAll()
        // Scheduling failure must never prevent W1 from erasing credentials.
        if (captured != null) runCatching { GrowthNotificationWorker.cancelSession(context, sessionDigest(captured)) }
        if (!configured || captured == null || credential(context) != captured) return
        val order = runCatching { GrowthPushInstallation(context).next() }.getOrNull() ?: return
        scope.launch {
            registration.withLock {
                // This is only the captured real credential being revoked;
                // newer registration has a greater durable revision.
                try { GrowthClient(BuildConfig.CREATOR_API_URL) { captured }.revokeDevice(order.first, order.second, captured) }
                catch (cancelled: CancellationException) { throw cancelled }
                catch (_: Exception) { /* A revoked session already denies provider delivery. */ }
            }
        }
    }
    fun tapId(intent: Intent): String? = if (intent.action == TAP_ACTION) intent.getStringExtra(NOTIFICATION_ID)?.takeIf { Regex("[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}").matches(it) } else null
    suspend fun resolveTap(client: GrowthClient, id: String, captured: String): String {
        val current = client.request("notifications/$id", expectedSession = captured)
        check(current.getString("id") == id)
        check(current.optBoolean("available", false))
        val destination = current.getString("destination")
        check(com.pantopus.qelvora.generated.ApplicationDestination.isPermitted(destination))
        client.request("notifications/$id/read", "PUT", org.json.JSONObject(), captured)
        return destination
    }
    private fun sessionDigest(value: String): String = java.security.MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    fun received(context: Context, id: String?, highPriority: Boolean) {
        if (!configured || id == null || !Regex("[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}").matches(id) || !permitted(context)) return
        val captured = credential(context) ?: return
        // Enqueue within Firebase's callback. No credentials, payload content or
        // payload destinations enter WorkManager's persistent input.
        runCatching { GrowthNotificationWorker.enqueue(context, id, sessionDigest(captured), highPriority) }
    }
    internal suspend fun deliver(context: Context, id: String, binding: String, receivedAt: Long): Boolean = withContext(Dispatchers.Main.immediate) {
        val app = context.applicationContext
        val captured = credential(app) ?: return@withContext false
        val current = generation
        fun allowed() = configured && current == generation && credential(app) == captured && sessionDigest(captured) == binding && permitted(app) && GrowthNotificationWorker.fresh(receivedAt)
        if (!allowed()) return@withContext false
        try {
            val client = GrowthClient(BuildConfig.CREATOR_API_URL) { credential(app) }
            val item = client.request("notifications/$id", expectedSession = captured)
            val preferences = client.request("preferences", expectedSession = captured)
            val disabled = preferences.getJSONArray("disabledPushTypes")
            val muted = preferences.getJSONArray("mutedCreators")
            val now = java.time.ZonedDateTime.now(java.time.ZoneId.of(preferences.getString("timeZone")))
            val minute = now.hour * 60 + now.minute
            val quiet = if (preferences.isNull("quietStart") || preferences.isNull("quietEnd")) false else {
                val start = preferences.getInt("quietStart"); val end = preferences.getInt("quietEnd")
                if (start == end) true else if (start < end) minute in start until end else minute >= start || minute < end
            }
            if (!item.optBoolean("available", false) || !item.isNull("readAt") || quiet || !preferences.getBoolean("push") ||
                (!item.isNull("creatorId") && (0 until muted.length()).any { muted.getString(it) == item.getString("creatorId") }) ||
                (0 until disabled.length()).any { disabled.getString(it) == item.getString("type") } || !allowed()) return@withContext false
            check(item.getString("id") == id)
            val intent = Intent(app, MainActivity::class.java).setAction(TAP_ACTION).setData(Uri.fromParts("qelvora-notification", id, null)).putExtra(NOTIFICATION_ID, id)
            val tap = PendingIntent.getActivity(app, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            channel(app)
            val notification = NotificationCompat.Builder(app, channelId).setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(item.getString("sender")).setContentText(if (preferences.getBoolean("hideSensitive")) QelvoraCopy.text("growthHiddenUpdate") else item.getString("preview"))
                .setContentIntent(tap).setAutoCancel(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE).build()
            currentCoroutineContext().ensureActive()
            if (allowed()) NotificationManagerCompat.from(app).notify(id, 0, notification)
            false
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: GrowthRequestFailure) { allowed() && (failure.status == 408 || failure.status == 429 || failure.status in 500..599) }
        catch (_: java.io.IOException) { allowed() }
        catch (_: Exception) { false /* Private, withdrawn or malformed updates produce no notification. */ }
    }
}

@Composable
internal fun GrowthDevicePushSettings() {
    val context = LocalContext.current
    val preferences = remember(context) { context.getSharedPreferences("growth-permission-v1", Context.MODE_PRIVATE) }
    var asked by remember { mutableStateOf(preferences.getBoolean("asked", false)) }
    var granted by remember { mutableStateOf(GrowthPush.permitted(context)) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = GrowthPush.permitted(context); GrowthPush.refresh(context) }
    DisposableEffect(context) {
        val activity = context as? ComponentActivity
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) { granted = GrowthPush.permitted(context); GrowthPush.refresh(context) } }
        activity?.lifecycle?.addObserver(observer)
        onDispose { activity?.lifecycle?.removeObserver(observer) }
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        BasicText(QelvoraCopy.text("growthDevicePushHeading"), style = qText("label").copy(color = qColor("ink")))
        val text = when { !GrowthPush.configured -> "growthDevicePushUnavailable"; GrowthPush.failed -> "growthDevicePushRegistrationFailed"; granted -> "growthDevicePushGranted"; !asked && Build.VERSION.SDK_INT >= 33 -> "growthDevicePushNotRequested"; else -> "growthDevicePushDenied" }
        BasicText(QelvoraCopy.text(text), style = qText("body").copy(color = qColor("ink")))
        if (GrowthPush.configured) Button(QelvoraCopy.text(if (!granted && !asked && Build.VERSION.SDK_INT >= 33) "growthDevicePushAllow" else "growthDevicePushOpenSettings"), ButtonVariant.SECONDARY) {
            if (!granted && !asked && Build.VERSION.SDK_INT >= 33) { asked = true; preferences.edit().putBoolean("asked", true).apply(); permission.launch(Manifest.permission.POST_NOTIFICATIONS) }
            else context.startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName))
        }
    }
}
