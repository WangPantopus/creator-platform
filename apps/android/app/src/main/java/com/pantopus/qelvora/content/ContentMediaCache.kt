package com.pantopus.qelvora.content

import java.io.File
import java.nio.file.Files
import java.nio.file.LinkOption

/** First process entry has no live decoder; later navigation preserves its files. */
internal object ContentMediaCache {
    private var prepared = false
    // Android File.createTempFile uses a nonnegative decimal long between this
    // downloader's fixed prefix and suffix. Keep the exact legacy name contract.
    private val privateName = Regex("w5-content-[0-9]+\\.(m4a|png)")
    @Synchronized
    fun prepare(cache: File): Boolean {
        if (prepared) return true
        return try {
            val files = cache.listFiles() ?: return false
            for (file in files) {
                if (privateName.matches(file.name) && Files.isRegularFile(file.toPath(), LinkOption.NOFOLLOW_LINKS) && !file.delete()) return false
            }
            prepared = true
            true
        } catch (_: SecurityException) { false }
    }
}
