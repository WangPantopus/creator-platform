package com.pantopus.qelvora.conversation

import android.content.Context
import java.security.MessageDigest

/**
 * WP 7.4 P8, the 3-hour reminder. No server signal exists, so the count lives
 * on this phone only (another device keeps its own). Time counts while an AI
 * conversation is in front and its AI is on, across creators; time while the
 * creator is in the thread does not count. A break of 15 minutes or more (the
 * app in the background, another part of the app, the screen off) starts the
 * count again. Each further 3 hours of the same count shows the fixed line
 * (`longSession`) once, as a system line in the conversation open then.
 * The count is kept per account (its id hashed) so a relaunch within the break
 * keeps it; the lines themselves are memory only.
 */
object ConversationLongSession {
    private const val STORE = "qelvora_long_session_v1"
    var threshold = 3 * 3600_000L; private set
    var pause = 15 * 60_000L; private set
    /** How often the count is advanced while it runs. */
    val interval get() = minOf(15_000L, threshold / 20)
    private var loaded = false
    private var account = ""
    private var millis = 0L
    private var lastAt = 0L
    private var shown = 0
    private var running = false
    /** Lines shown, by thread: the row each follows (null: the thread's end), and its words. */
    private val lines = mutableMapOf<String, MutableList<Pair<String?, String>>>()

    /** Debug launches may shorten both durations (milliseconds). */
    fun configure(custom: Pair<Long, Long>?) { custom?.let { (reminder, gap) -> threshold = reminder; pause = gap } }

    /** The thread came to the front with its AI on. */
    fun begin(context: Context, accountId: String, now: Long = System.currentTimeMillis()) {
        load(context)
        val key = MessageDigest.getInstance("SHA-256").digest(accountId.toByteArray()).joinToString("") { "%02x".format(it) }
        if (key != account) { account = key; millis = 0; shown = 0; lastAt = 0 }
        if (lastAt > 0 && now - lastAt >= pause) { millis = 0; shown = 0 }
        lastAt = now; running = true; save(context)
    }
    /** Advances the count; true when a reminder is due now. */
    fun tick(context: Context, now: Long = System.currentTimeMillis()): Boolean {
        if (!running) return false
        advance(now)
        val due = (millis / threshold).toInt()
        if (due <= shown) { save(context); return false }
        shown = due; save(context)
        return true
    }
    /** The thread left the front, or its AI stopped: the count waits. */
    fun end(context: Context, now: Long = System.currentTimeMillis()) {
        if (!running) return
        advance(now); running = false; save(context)
    }
    fun lines(thread: String): List<Pair<String?, String>> = lines[thread].orEmpty()
    fun add(thread: String, after: String?, text: String) { lines.getOrPut(thread) { mutableListOf() } += after to text }
    /** A clean start for operated verification (debug launches only). */
    fun forget(context: Context) { context.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit().clear().apply(); loaded = false; account = ""; millis = 0; lastAt = 0; shown = 0; running = false }

    /** A suspended app is not counted: one step adds at most twice the interval. */
    private fun advance(now: Long) {
        if (lastAt > 0) millis += (now - lastAt).coerceIn(0, 2 * interval)
        lastAt = now
    }
    private fun load(context: Context) {
        if (loaded) return
        loaded = true
        val store = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)
        account = store.getString("account", "").orEmpty()
        millis = store.getLong("millis", 0); lastAt = store.getLong("lastAt", 0); shown = store.getInt("shown", 0)
    }
    private fun save(context: Context) {
        context.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit()
            .putString("account", account).putLong("millis", millis).putLong("lastAt", lastAt).putInt("shown", shown).apply()
    }
}
