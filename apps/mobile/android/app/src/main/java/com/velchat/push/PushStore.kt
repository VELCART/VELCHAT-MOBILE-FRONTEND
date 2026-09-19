package com.velchat.push

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * The push layer's own persistence (ADR 0008).
 *
 * Everything here has to be readable by a process that was started by FCM with **no React
 * context and no JS runtime** — a killed app woken at 03:00 to acknowledge a message. That rules
 * out MMKV (owned by react-native-mmkv, initialised from JS) and WatermelonDB (a JSI database
 * whose schema is JS's business), so the push layer keeps a small, flat, native-owned store and
 * JS mirrors into it the handful of facts native needs.
 *
 * Storage is `MODE_PRIVATE` SharedPreferences: app-private on any non-rooted device, and the same
 * protection domain the Firebase SDK already keeps the registration token in. Deliberately NOT
 * `EncryptedSharedPreferences` — that is another dependency plus a Keystore failure mode on
 * exactly the low-end devices this app targets (§M0.1), to protect a value the FCM SDK stores
 * beside it in the clear anyway.
 *
 * Every accessor is safe to call from any thread — but NOT for the reason this comment used to
 * give. SharedPreferences being internally synchronised makes a single `getString` or `putString`
 * atomic, and almost nothing here is a single one: each of these maps is ONE string holding every
 * conversation, read whole and written back whole. Three threads do that in one process (FCM's
 * delivery thread, the receiver's main thread, the RN native-modules thread), and two that read
 * before either writes leave the later write silently discarding the earlier — a just-arrived
 * line lost, or lines the user already read resurrected (VC-066). So every read-modify-write
 * holds {@link WRITE_LOCK}.
 *
 * The writes are small enough that `apply()` is the right trade — except the ack credentials and
 * the active conversation, which use `commit()` because a process killed a millisecond later must
 * not lose them. Those are blind writes with nothing to read first, and they stay OUTSIDE the
 * lock on purpose: `commit()` blocks on disk, and nothing here is worth holding a monitor across
 * a disk sync for.
 */
internal class PushStore(context: Context) {

  private val prefs: SharedPreferences =
      context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  private val appContext: Context = context.applicationContext

  // ── ack credentials ────────────────────────────────────────────────────────

  /**
   * The API origin to POST acks to.
   *
   * JS mirrors the resolved base URL here on every launch, because it is the only side that
   * knows which one it actually chose. The fallback reads the `API_BASE_URL` string resource
   * that `react-native-config` generates per flavor — looked up by NAME rather than through
   * `R.string`, so a build with no env file compiles and simply reports "no base URL" instead of
   * failing to compile.
   */
  fun baseUrl(): String? {
    prefs.getString(KEY_BASE_URL, null)?.takeIf { it.isNotBlank() }?.let { return it.trimEnd('/') }
    return try {
      val id = appContext.resources.getIdentifier("API_BASE_URL", "string", appContext.packageName)
      if (id == 0) null else appContext.getString(id).trim().trimEnd('/').ifBlank { null }
    } catch (_: Throwable) {
      null
    }
  }

  fun deviceId(): String? = prefs.getString(KEY_DEVICE_ID, null)?.takeIf { it.isNotBlank() }

  fun accountId(): String? = prefs.getString(KEY_ACCOUNT_ID, null)?.takeIf { it.isNotBlank() }

  fun pushToken(): String? = prefs.getString(KEY_PUSH_TOKEN, null)?.takeIf { it.isNotBlank() }

  fun setPushToken(token: String?) {
    prefs.edit().putString(KEY_PUSH_TOKEN, token).apply()
  }

  /**
   * Store what a woken process needs to authenticate an ack. `commit()`, not `apply()`: this is
   * written once per launch and losing it costs every delivery receipt until the next launch.
   */
  @Suppress("ApplySharedPref")
  fun setCredentials(baseUrl: String?, deviceId: String?, accountId: String?) {
    prefs
        .edit()
        .putString(KEY_BASE_URL, baseUrl)
        .putString(KEY_DEVICE_ID, deviceId)
        .putString(KEY_ACCOUNT_ID, accountId)
        .commit()
  }

  /** Sign-out: nothing that identifies the previous account may survive into the next session. */
  @Suppress("ApplySharedPref")
  fun clearSession() {
    prefs
        .edit()
        .remove(KEY_DEVICE_ID)
        .remove(KEY_ACCOUNT_ID)
        .remove(KEY_PUSH_TOKEN)
        .remove(KEY_NAMES)
        .remove(KEY_PEOPLE)
        .remove(KEY_LINES)
        .remove(KEY_MUTED)
        .remove(KEY_PENDING)
        .remove(KEY_COUNTS)
        .remove(KEY_ACTIVE_CONVO)
        .remove(KEY_AVATARS)
        .remove(KEY_LAST_SEQ)
        .remove(KEY_SEEN)
        .commit()
  }

  // ── conversation display names ─────────────────────────────────────────────

  /**
   * `conversationId -> display name`, mirrored from JS.
   *
   * A push carries ids only (§A19 — the server sends no content, on purpose), so without this a
   * notification could say nothing more useful than "VelChat". Reading the name out of
   * WatermelonDB from Kotlin would be fresher, but it would couple the notification layer to a
   * JS-owned SQLite schema that can migrate without this file noticing — and it would fail
   * silently when it did. A mirrored map is coupled to nothing and degrades to a generic title.
   *
   * Bounded at {@link MAX_NAMES}, newest-wins, because this is a notification nicety and must
   * never grow into a real cache (§M "no unbounded caches").
   */
  fun conversationName(conversationId: String): String? = readName(KEY_NAMES, conversationId)

  fun putConversationNames(names: Map<String, String>) = putNames(KEY_NAMES, names)

  /**
   * `accountId -> display name`, also mirrored from JS.
   *
   * Separate from the conversation map because a push names its SENDER by id, and in a group the
   * sender is not the conversation. Without this, every message in a group notification would be
   * attributed to nobody — which is precisely the case where knowing who spoke matters most.
   */
  fun personName(accountId: String): String? = readName(KEY_PEOPLE, accountId)

  fun putPersonNames(names: Map<String, String>) = putNames(KEY_PEOPLE, names)

  // ── sender photos ──────────────────────────────────────────────────────────

  /**
   * `accountId -> { url, file }` for the sender photo shown in a notification.
   *
   * The FILE is what matters: a notification posted by a JS-less process cannot go and fetch a
   * picture — the whole reason the ack is on a time budget is that network work inside the FCM
   * callback stalls every message behind it. So the download happens while the app is alive and
   * mirroring names, and the push path only ever decodes a local file.
   *
   * The URL is kept beside it purely to answer "is this still the same photo?" — media URLs are
   * signed and rotate, so comparing them is how a changed avatar gets re-fetched and an
   * unchanged one costs nothing.
   */
  fun personAvatarFile(accountId: String): String? =
      readJson(KEY_AVATARS).optJSONObject(accountId)?.optString("file", "")?.takeIf {
        it.isNotBlank()
      }

  /** The URL the cached photo came from, so a caller can tell whether it needs refreshing. */
  fun personAvatarUrl(accountId: String): String? =
      readJson(KEY_AVATARS).optJSONObject(accountId)?.optString("url", "")?.takeIf {
        it.isNotBlank()
      }

  fun putPersonAvatar(accountId: String, url: String, file: String) {
    if (accountId.isBlank()) return
    // The download that produced `file` happened before this call, not inside it — the lock never
    // covers the network.
    synchronized(WRITE_LOCK) {
      val all = readJson(KEY_AVATARS)
      all.put(accountId, JSONObject().put("url", url).put("file", file))
      trimOldest(all, MAX_NAMES)
      prefs.edit().putString(KEY_AVATARS, all.toString()).apply()
    }
  }

  // ── the last seq we notified about ─────────────────────────────────────────

  /**
   * The highest `seq` a notification for this conversation was built from.
   *
   * Needed because a notification is REBUILT after the user replies inline, and its actions carry
   * the seq they acknowledge. Without remembering it, the rebuilt notification either loses its
   * buttons or carries a meaningless `0` — and a Mark-as-read that acknowledges nothing is worse
   * than no button at all.
   */
  fun lastSeq(conversationId: String): Long =
      readJson(KEY_LAST_SEQ).optLong(conversationId, 0L)

  /**
   * Record that a notification is about to be built for this (conversation, seq), and say
   * whether it is NEW. `false` means we have already notified about this exact message.
   *
   * FCM is at-least-once, so the same data message genuinely arrives twice — and without this
   * the second copy appended a second identical line to the thread and bumped the count, so one
   * message read as two (VC-032).
   *
   * A high-water mark is the obvious way to do this and it is WRONG here. FCM gives no ordering
   * guarantee, so a genuinely new message with a LOWER seq than one already delivered is
   * ordinary — the whole reason notification lines are sorted by seq rather than by arrival
   * (VC-056). A watermark would silently swallow that message's notification entirely, which is
   * a far worse failure than showing a duplicate. So this remembers the actual seqs.
   *
   * A seq of 0 means the push carried none: nothing to compare, so it always counts as new.
   */
  fun markSeen(conversationId: String, seq: Long): Boolean {
    if (conversationId.isBlank() || seq <= 0L) return true
    synchronized(WRITE_LOCK) {
      val all = readJson(KEY_SEEN)
      val seen = all.optJSONArray(conversationId) ?: JSONArray()
      for (i in 0 until seen.length()) {
        if (seen.optLong(i, 0L) == seq) return false
      }
      seen.put(seq)
      while (seen.length() > MAX_SEEN_PER_CONV) seen.remove(0)
      all.put(conversationId, seen)
      trimOldest(all, MAX_NAMES)
      prefs.edit().putString(KEY_SEEN, all.toString()).apply()
      return true
    }
  }

  fun setLastSeq(conversationId: String, seq: Long) {
    if (conversationId.isBlank() || seq <= 0L) return
    synchronized(WRITE_LOCK) {
      val all = readJson(KEY_LAST_SEQ)
      if (all.optLong(conversationId, 0L) >= seq) return // watermarks only move forward
      all.put(conversationId, seq)
      trimOldest(all, MAX_NAMES)
      prefs.edit().putString(KEY_LAST_SEQ, all.toString()).apply()
    }
  }

  private fun readName(key: String, id: String): String? =
      readJson(key).optString(id, "").takeIf { it.isNotBlank() }

  private fun putNames(key: String, names: Map<String, String>) {
    if (names.isEmpty()) return
    synchronized(WRITE_LOCK) {
      val merged = readJson(key)
      for ((id, name) in names) {
        if (id.isBlank()) continue
        if (name.isBlank()) merged.remove(id) else merged.put(id, name)
      }
      trimOldest(merged, MAX_NAMES)
      prefs.edit().putString(key, merged.toString()).apply()
    }
  }

  /**
   * Keep a mirrored map bounded, oldest-first.
   *
   * `JSONObject` preserves insertion order in practice; when it does not, an arbitrary excess
   * entry is dropped instead — which costs one generic notification title and nothing else. These
   * maps are a notification nicety and must never grow into a real cache (§M: no unbounded
   * caches).
   */
  private fun trimOldest(map: JSONObject, max: Int) {
    while (map.length() > max) {
      val keys = map.keys()
      if (!keys.hasNext()) break
      map.remove(keys.next())
    }
  }

  // ── the lines shown inside one conversation's notification ─────────────────

  /**
   * One rendered line in a conversation's notification.
   *
   * `mine` marks a reply the user sent FROM the notification. Keeping it in the thread is what
   * makes an inline reply feel like it went somewhere — without it, the notification silently
   * drops the message the user just typed and looks like it was swallowed.
   */
  data class Line(
      val sender: String?,
      val text: String,
      val at: Long,
      val mine: Boolean = false,
      /**
       * Who sent it, by account id. Carried beside the display name because the sender PHOTO is
       * cached by id, and in a group each line can be a different person — resolving the photo
       * from the conversation instead would put one member's face on everybody's messages.
       */
      val senderId: String? = null,
      /**
       * The message's own `seq`, which is what puts the thread in order — see {@link sortBySeq}.
       * Zero for a line that has none: an inline reply the user typed, which the server has not
       * sequenced yet, and every line written by a build that predates this field.
       */
      val seq: Long = 0L,
  )

  /**
   * Remember what a conversation's notification is currently showing, so a second message
   * EXPANDS it into a thread instead of replacing the first.
   *
   * This has to be persisted rather than held in memory: each push can arrive in a freshly
   * started process that is torn down again as soon as `onMessageReceived` returns, so an
   * in-memory list would be empty every single time and the notification would never stack.
   *
   * Bounded twice over — {@link MAX_LINES} per conversation and {@link MAX_LINE_CONVOS}
   * conversations — because this is notification state, not a message store (§M "no unbounded
   * caches"). The DB remains the source of truth for everything real.
   */
  fun appendLine(conversationId: String, line: Line): List<Line> {
    synchronized(WRITE_LOCK) {
      val all = readJson(KEY_LINES)
      val existing = all.optJSONArray(conversationId) ?: JSONArray()
      existing.put(
          JSONObject()
              .put("s", line.sender ?: JSONObject.NULL)
              .put("t", line.text)
              .put("at", line.at)
              .put("me", line.mine)
              .put("sid", line.senderId ?: JSONObject.NULL)
              .put("q", line.seq))
      // Order BEFORE capping, so "drop the oldest" drops the oldest MESSAGE rather than whichever
      // one FCM happened to deliver first.
      val ordered = sortBySeq(existing)
      while (ordered.length() > MAX_LINES) ordered.remove(0)
      all.put(conversationId, ordered)
      while (all.length() > MAX_LINE_CONVOS) {
        val it = all.keys()
        if (!it.hasNext()) break
        val oldest = it.next()
        if (oldest == conversationId) {
          if (!it.hasNext()) break
          all.remove(it.next())
        } else {
          all.remove(oldest)
        }
      }
      prefs.edit().putString(KEY_LINES, all.toString()).apply()
      return toLines(ordered)
    }
  }

  fun lines(conversationId: String): List<Line> =
      toLines(sortBySeq(readJson(KEY_LINES).optJSONArray(conversationId) ?: JSONArray()))

  fun clearLines(conversationId: String) {
    synchronized(WRITE_LOCK) {
      val all = readJson(KEY_LINES)
      if (!all.has(conversationId)) return
      all.remove(conversationId)
      prefs.edit().putString(KEY_LINES, all.toString()).apply()
    }
  }

  /**
   * Drop every conversation's lines at once.
   *
   * For the group summary: it stands for all of them, so dismissing it dismisses all of them, and
   * clearing only their counts would leave the next single message rebuilding a thread out of
   * lines the user has already swept away (VC-067).
   */
  fun clearAllLines() {
    synchronized(WRITE_LOCK) { prefs.edit().remove(KEY_LINES).apply() }
  }

  /**
   * Put a conversation's stored lines in message order.
   *
   * FCM guarantees no ordering, so arrival order is not message order: a push held back while the
   * package was stopped lands after a later one, and the thread then advertises an older message
   * as the newest one (VC-056). `at` cannot arbitrate — it records when the push reached this
   * device, not when the message was sent — so `seq`, the per-conversation counter the actions
   * already carry, is the only signal there is.
   *
   * A line with no seq inherits the rank of the line before it, which is right for both kinds
   * that exist: an inline reply belongs immediately after the message it answered, and a thread
   * written by a build that predates this field ranks entirely at zero, where a STABLE sort
   * leaves it exactly as stored — the only order anyone ever knew for it. That is the migration:
   * old lines keep their old order instead of crashing or being dropped.
   */
  private fun sortBySeq(arr: JSONArray): JSONArray {
    if (arr.length() < 2) return arr
    var rank = 0L
    val ranked = ArrayList<Pair<Long, JSONObject>>(arr.length())
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      val seq = o.optLong("q", 0L)
      if (seq > 0L) rank = seq
      ranked.add(rank to o)
    }
    val sorted = JSONArray()
    // `sortedBy` is stable, and that is load-bearing rather than incidental: equal ranks — a reply
    // beside the message it answers, or a whole pre-seq thread — must come back in the order they
    // were stored and not in an arbitrary one.
    for ((_, o) in ranked.sortedBy { it.first }) sorted.put(o)
    return sorted
  }

  private fun toLines(arr: JSONArray): List<Line> {
    val out = ArrayList<Line>(arr.length())
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      val text = o.optString("t", "")
      if (text.isBlank()) continue
      out.add(
          Line(
              o.optString("s", "").takeIf { it.isNotBlank() },
              text,
              o.optLong("at", 0L),
              o.optBoolean("me", false),
              o.optString("sid", "").takeIf { it.isNotBlank() },
              o.optLong("q", 0L),
          ))
    }
    return out
  }

  // ── what the user is looking at ────────────────────────────────────────────

  /**
   * The conversation currently open on screen, mirrored from JS, or null.
   *
   * This is what makes suppression correct. Suppressing on "the app is resumed" alone was wrong
   * in two ways: a user reading chat A got no notification for a message in chat B, and a user
   * whose socket had quietly died got neither the message nor a notification — the app looked
   * simply broken. Suppress only for the chat they are actually reading.
   */
  fun activeConversationId(): String? =
      prefs.getString(KEY_ACTIVE_CONVO, null)?.takeIf { it.isNotBlank() }

  fun setActiveConversation(conversationId: String?) {
    // `commit()`: a push can arrive in the same instant the user opens a chat, and reading a
    // stale value here posts a notification for the conversation already on screen.
    @Suppress("ApplySharedPref")
    prefs.edit().putString(KEY_ACTIVE_CONVO, conversationId).commit()
  }

  // ── mute ───────────────────────────────────────────────────────────────────

  /** `conversationId -> epoch millis until which it is muted`. `Long.MAX_VALUE` = forever. */
  fun isMuted(conversationId: String, now: Long = System.currentTimeMillis()): Boolean {
    val until = readJson(KEY_MUTED).optLong(conversationId, 0L)
    return until > now
  }

  fun setMuted(conversationId: String, untilMillis: Long) {
    synchronized(WRITE_LOCK) {
      val muted = readJson(KEY_MUTED)
      if (untilMillis <= System.currentTimeMillis()) muted.remove(conversationId)
      else muted.put(conversationId, untilMillis)
      prefs.edit().putString(KEY_MUTED, muted.toString()).apply()
    }
  }

  // ── per-conversation notification counters ─────────────────────────────────

  /**
   * How many pushes are currently stacked in one conversation's notification, so it can say
   * "3 new messages" instead of replacing itself with an identical line three times.
   *
   * Reset when the user opens or dismisses the notification, not when the app syncs — the count
   * describes what is on screen, not what is unread.
   */
  fun bumpCount(conversationId: String): Int {
    synchronized(WRITE_LOCK) {
      val counts = readJson(KEY_COUNTS)
      val next = counts.optInt(conversationId, 0) + 1
      counts.put(conversationId, next)
      prefs.edit().putString(KEY_COUNTS, counts.toString()).apply()
      return next
    }
  }

  /**
   * How many conversations currently have a notification of ours on screen.
   *
   * Derived from our OWN counters rather than `NotificationManagerCompat.activeNotifications`,
   * because `notify()` is asynchronous: a read taken immediately after posting routinely does
   * not include the notification just posted, so the group summary was computed from a value
   * that was wrong most of the time — and a stale summary can be the only thing the user sees.
   * These counters are written synchronously by `bumpCount`/`clearCount`, so they cannot race.
   */
  fun countedConversations(): Int {
    val counts = readJson(KEY_COUNTS)
    var n = 0
    val keys = counts.keys()
    while (keys.hasNext()) {
      if (counts.optInt(keys.next(), 0) > 0) n++
    }
    return n
  }

  /**
   * How many MESSAGES are stacked across every conversation that currently has a notification.
   *
   * The group summary used `countedConversations()` and formatted it with "%d new messages", so
   * it reported the number of chats while naming messages — it read "5 new messages" for a burst
   * of eight and "5 new messages" again for a single one (VC-054). The per-conversation counts
   * were already here; this just adds them up instead of discarding them.
   */
  fun countedMessages(): Int {
    val counts = readJson(KEY_COUNTS)
    var n = 0
    val keys = counts.keys()
    while (keys.hasNext()) {
      val c = counts.optInt(keys.next(), 0)
      if (c > 0) n += c
    }
    return n
  }

  fun clearCount(conversationId: String) {
    synchronized(WRITE_LOCK) {
      val counts = readJson(KEY_COUNTS)
      counts.remove(conversationId)
      prefs.edit().putString(KEY_COUNTS, counts.toString()).apply()
    }
  }

  fun clearAllCounts() {
    // A blind write, but it still takes the lock: a `bumpCount` that read the map before this and
    // writes after it would otherwise put back a count the user just cleared.
    synchronized(WRITE_LOCK) { prefs.edit().remove(KEY_COUNTS).apply() }
  }

  // ── events owed to JS ──────────────────────────────────────────────────────

  /**
   * Things that happened while no JS runtime existed and that JS still has to act on: a
   * notification tap to navigate to, a mute the server has not been told about, a read receipt
   * whose local unread count still needs clearing.
   *
   * A bounded queue, oldest dropped first. Losing the oldest of 64 queued events is a cosmetic
   * loss; growing without bound in a process that may never start JS again is not.
   */
  fun enqueueEvent(event: JSONObject) {
    synchronized(WRITE_LOCK) {
      val queue = readArray(KEY_PENDING)
      queue.put(event)
      val overflow = queue.length() - MAX_PENDING
      if (overflow > 0) for (i in 0 until overflow) queue.remove(0)
      prefs.edit().putString(KEY_PENDING, queue.toString()).apply()
    }
  }

  /**
   * Drain — callers must succeed at handling these, because they are gone after this returns.
   *
   * Under the same lock as {@link enqueueEvent}, and for a sharper reason than the maps: an
   * action queued on the receiver's thread between this read and its removal would be dropped
   * without ever being handed to anybody, which is precisely the promise the queue exists to
   * keep.
   */
  fun takeEvents(): JSONArray {
    synchronized(WRITE_LOCK) {
      val queue = readArray(KEY_PENDING)
      if (queue.length() > 0) prefs.edit().remove(KEY_PENDING).apply()
      return queue
    }
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private fun readJson(key: String): JSONObject =
      try {
        JSONObject(prefs.getString(key, "{}") ?: "{}")
      } catch (_: Throwable) {
        // A corrupt entry must not wedge notifications forever — start over.
        JSONObject()
      }

  private fun readArray(key: String): JSONArray =
      try {
        JSONArray(prefs.getString(key, "[]") ?: "[]")
      } catch (_: Throwable) {
        JSONArray()
      }

  internal companion object {
    /**
     * The monitor every read-modify-write in this class holds.
     *
     * On the companion rather than the instance, which is the whole trick: `PushStore(context)`
     * is constructed fresh at each entry point — the FCM service, the broadcast receiver, the RN
     * module — so an instance monitor would be three separate locks guarding one shared file and
     * would guard nothing at all. Android hands every one of those instances the SAME
     * SharedPreferences object for a given file in a given process, so one process-wide monitor
     * is exactly the scope of the contention. Uncontended in the normal case, and the critical
     * sections are a parse and a `putString` — never a network call and never a `commit()`.
     */
    private val WRITE_LOCK = Any()

    private const val FILE = "velchat_push"
    private const val KEY_BASE_URL = "baseUrl"
    private const val KEY_DEVICE_ID = "deviceId"
    private const val KEY_ACCOUNT_ID = "accountId"
    private const val KEY_PUSH_TOKEN = "pushToken"
    private const val KEY_NAMES = "names"
    private const val KEY_PEOPLE = "people"
    private const val KEY_LINES = "lines"
    private const val KEY_MUTED = "muted"
    private const val KEY_COUNTS = "counts"
    private const val KEY_PENDING = "pending"
    private const val KEY_ACTIVE_CONVO = "activeConvo"
    // v2: the cached files changed SHAPE (square -> pre-masked circle), and the freshness check
    // is by URL, so an unchanged URL would have gone on serving the old square crops forever.
    // A new key retires them without needing a migration.
    private const val KEY_AVATARS = "avatars.v2"
    private const val KEY_LAST_SEQ = "lastSeq"
    private const val KEY_SEEN = "seenSeqs"

    private const val MAX_NAMES = 300
    private const val MAX_PENDING = 64

    /** Android collapses a MessagingStyle to the last few lines anyway; keeping more is waste. */
    private const val MAX_LINES = 6

    /**
     * How many recent seqs per conversation are remembered for duplicate suppression.
     *
     * Only has to outlast FCM's own retry window, so it is deliberately small — the map is
     * rewritten whole on every message and a long tail would cost more than the duplicates do.
     */
    private const val MAX_SEEN_PER_CONV = 20
    private const val MAX_LINE_CONVOS = 20
  }
}
