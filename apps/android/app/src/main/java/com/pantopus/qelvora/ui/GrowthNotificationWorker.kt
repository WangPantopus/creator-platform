package com.pantopus.qelvora.ui

import android.content.Context
import android.os.Build
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import kotlinx.coroutines.withTimeoutOrNull
import java.util.concurrent.TimeUnit

/** Durable lifecycle for current server lookups, never a stored notification.
 * The session digest only rejects work after rotation or account transfer;
 * the actual W1 credential authorizes every fresh request at execution time. */
class GrowthNotificationWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        val id = inputData.getString("notificationId") ?: return Result.success()
        val binding = inputData.getString("sessionDigest") ?: return Result.success()
        val receivedAt = inputData.getLong("receivedAt", 0)
        if (!Regex("[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}").matches(id) || !Regex("[a-f0-9]{64}").matches(binding) || !fresh(receivedAt)) return Result.success()
        val retry = withTimeoutOrNull(25_000) { GrowthPush.deliver(applicationContext, id, binding, receivedAt) } ?: true
        return if (retry && runAttemptCount < 3 && fresh(receivedAt)) Result.retry() else Result.success()
    }

    companion object {
        private const val lifetime = 5 * 60_000L
        private fun sessionTag(binding: String) = "growth-push-session:$binding"
        internal fun fresh(receivedAt: Long): Boolean = receivedAt > 0 && System.currentTimeMillis() - receivedAt in 0 until lifetime
        internal fun enqueue(context: Context, id: String, binding: String, highPriority: Boolean) {
            val builder = OneTimeWorkRequestBuilder<GrowthNotificationWorker>()
                .setInputData(workDataOf("notificationId" to id, "sessionDigest" to binding, "receivedAt" to System.currentTimeMillis()))
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
                .addTag(sessionTag(binding))
                .keepResultsForAtLeast(0, TimeUnit.MILLISECONDS)
            // Android 12+ supports expedited jobs without a foreground service.
            // Earlier OS versions use ordinary work rather than display private
            // content or an unrequested foreground notification before lookup.
            if (highPriority && Build.VERSION.SDK_INT >= 31) builder.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            WorkManager.getInstance(context.applicationContext).enqueueUniqueWork("growth-push:$binding:$id", ExistingWorkPolicy.KEEP, builder.build())
        }
        internal fun cancelSession(context: Context, binding: String) {
            // Cancel only the captured session: a delayed purge must not cancel
            // another account's newly received work or other product features.
            WorkManager.getInstance(context.applicationContext).cancelAllWorkByTag(sessionTag(binding))
        }
    }
}
