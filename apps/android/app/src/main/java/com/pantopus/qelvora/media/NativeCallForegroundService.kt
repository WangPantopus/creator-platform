package com.pantopus.qelvora.media

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import com.pantopus.qelvora.generated.QelvoraCopy

/** No restart or Intent can manufacture an admitted call. After process death
 * the user recovers through the actual account/call route and server state. */
class NativeCallForegroundService : Service() {
    private var owner: TelecomNativeCallTransport? = null
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val current = NativeCallConnectionService.delegate as? TelecomNativeCallTransport
        if (intent == null || current == null || !current.ownsForeground(intent)) {
            stopSelf(startId); return START_NOT_STICKY
        }
        owner = current
        val channel = "human-calls"
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(channel, QelvoraCopy.text("w6CallInProgress"), NotificationManager.IMPORTANCE_LOW))
        val target = Intent(Intent.ACTION_VIEW, Uri.parse("qelvora://app${current.destination}"))
            .setClassName(packageName, "$packageName.MainActivity")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pending = PendingIntent.getActivity(this, 0, target, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notice = Notification.Builder(this, channel).setSmallIcon(android.R.drawable.ic_menu_call)
            .setContentTitle(QelvoraCopy.brandName).setContentText(QelvoraCopy.text("w6CallInProgress"))
            .setContentIntent(pending).setOngoing(true).setCategory(Notification.CATEGORY_CALL).build()
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                val kinds = ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or
                    (if (current.cameraRequested) ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA else 0)
                startForeground(6106, notice, kinds)
            } else startForeground(6106, notice)
            current.foregroundStarted()
        } catch (_: Exception) { current.foregroundLost(); stopSelf(startId) }
        return START_NOT_STICKY
    }
    override fun onDestroy() {
        val current = owner; owner = null; current?.foregroundLost()
        super.onDestroy()
    }
}
