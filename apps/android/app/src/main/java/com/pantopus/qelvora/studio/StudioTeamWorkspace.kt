package com.pantopus.qelvora.studio

import android.os.SystemClock
import androidx.compose.foundation.background
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.pantopus.qelvora.generated.*
import com.pantopus.qelvora.identity.FanSession
import com.pantopus.qelvora.identity.FanSessionRequestCapture
import com.pantopus.qelvora.ui.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import java.util.UUID

private fun teamCopy(key: String, values: Map<String, String> = emptyMap()) = QelvoraCopy.text("w5NativeTeam$key", values)
private fun uuid(value: String): Boolean = runCatching { UUID.fromString(value).toString().equals(value, ignoreCase = true) }.getOrDefault(false)
private enum class TeamRole {
    TRIAGE, DRAFTER, PUBLISHER, SCHEDULER;
    val key: String get() = name.lowercase()
    val title: String get() = teamCopy(key + "Title")
    val detail: String get() = teamCopy(key + "Detail")
}
private data class TeamEdit(
    val accountId: String, val label: String, val capture: FanSessionRequestCapture,
    val expected: List<String>, val desired: List<String>,
    val unknown: Boolean = false, val confirmed: Boolean = false,
)
private class TeamDenied : Exception()
private class TeamExpired : Exception()

/** Display lifetime only; canonical Studio/Identity still own every permission.
 * No reconstructed storage, fabricated Actor, or client-issued signing scope. */
private class NativeTeamState(
    private val session: FanSession, private val creatorId: String?, private val scope: CoroutineScope,
) {
    val accountId = session.session?.accountId
    val sessionId = session.session?.sessionId
    private val destination = session.destination
    var directory by mutableStateOf<APIStudioSession?>(null); private set
    var creator by mutableStateOf<APIStudioSessionCreatorsItem?>(null); private set
    var team by mutableStateOf<APIStudioTeam?>(null); private set
    var current by mutableStateOf(false); private set
    var reading by mutableStateOf(false); private set
    var saving by mutableStateOf(false); private set
    var error by mutableStateOf(""); private set
    var edit by mutableStateOf<TeamEdit?>(null); private set
    private var capture: FanSessionRequestCapture? = null
    private var active = false
    private var generation = 0
    private var checkedUntil = 0L
    private var readJob: Job? = null
    private var writeJob: Job? = null
    val mayManage: Boolean get() = current && SystemClock.elapsedRealtime() < checkedUntil && creator?.owned == true && creator?.verification == "verified"
    val currentEditRoles: List<String>? get() = edit?.let { command -> team?.members?.firstOrNull { it.account_id == command.accountId && it.revoked_at == null }?.roles?.map { it.name }?.sorted() }
    val editIsStale: Boolean get() = edit?.let { command -> currentEditRoles?.let { it != command.expected.sorted() && it != command.desired.sorted() } ?: true } ?: false
    val canSave: Boolean get() = mayManage && !saving && !reading && edit?.desired?.isNotEmpty() == true && edit?.confirmed == false && !editIsStale && currentEditRoles != null

    fun activate() { deactivate(); active = true; refresh() }
    fun deactivate() {
        active = false; generation++
        readJob?.cancel(); writeJob?.cancel(); readJob = null; writeJob = null
        reading = false; saving = false; conceal(discardEdit = true)
    }
    private fun conceal(discardEdit: Boolean = false) {
        checkedUntil = 0; current = false; directory = null; creator = null; team = null; capture = null
        if (discardEdit) edit = null
    }
    private fun matches(snapshot: Int): Boolean = active && generation == snapshot && session.destination == destination &&
        session.session?.accountId == accountId && session.session?.sessionId == sessionId && !session.purgingPrivateState && !session.localPurgeFailed
    private suspend fun matches(snapshot: Int, request: FanSessionRequestCapture): Boolean {
        currentCoroutineContext().ensureActive()
        if (!matches(snapshot)) return false
        val currentCapture = request.isCurrent()
        // Storage may suspend independently of this component's view lifetime.
        currentCoroutineContext().ensureActive()
        return currentCapture && matches(snapshot)
    }
    suspend fun expire() {
        currentCoroutineContext().ensureActive()
        if (!active) return
        val snapshot = generation
        if (!matches(snapshot)) { deactivate(); return }
        val request = capture
        if (request != null && !matches(snapshot, request)) {
            if (matches(snapshot)) { conceal(discardEdit = true); error = teamCopy("AccountChanged") }
            return
        }
        if (SystemClock.elapsedRealtime() >= checkedUntil) conceal()
    }
    fun refresh() {
        if (!active || reading || saving) return
        val snapshot = generation; val started = SystemClock.elapsedRealtime()
        reading = true
        readJob = scope.launch {
            try {
                val request = session.captureRequest(destination, maximumResponseBytes = 262_144, timeoutMs = 4_000)
                if (request == null || !matches(snapshot, request)) {
                    if (matches(snapshot)) { conceal(); error = teamCopy("Unavailable") }
                    return@launch
                }
                val first = request.client.studioSession()
                if (!matches(snapshot, request)) return@launch
                validate(first, request)
                var selected: APIStudioSessionCreatorsItem? = null
                var members: APIStudioTeam? = null
                if (creatorId != null) {
                    val found = first.creators.firstOrNull { it.id == creatorId } ?: throw TeamDenied()
                    if (!uuid(creatorId) || found.verification != "verified" || (!found.owned && found.roles.isEmpty())) throw TeamDenied()
                    members = request.client.studioTeam(creatorId)
                    if (members.members.size > 50 || members.invitations.size > 50 || members.members.map { it.account_id }.toSet().size != members.members.size || members.members.any { !uuid(it.account_id) }) throw TeamDenied()
                    if (!matches(snapshot, request) || SystemClock.elapsedRealtime() >= started + 5_000) throw TeamExpired()
                    val last = request.client.studioSession()
                    if (!matches(snapshot, request)) return@launch
                    validate(last, request)
                    val final = last.creators.firstOrNull { it.id == creatorId } ?: throw TeamDenied()
                    if (final.owned != found.owned || final.verification != found.verification || final.roles.map { it.name }.sorted() != found.roles.map { it.name }.sorted()) throw TeamDenied()
                    if (!final.owned) {
                        val membership = members.members.firstOrNull { it.account_id == request.expectedAccountId && it.revoked_at == null } ?: throw TeamDenied()
                        if (membership.roles.map { it.name }.sorted() != final.roles.map { it.name }.sorted()) throw TeamDenied()
                    }
                    selected = final
                }
                if (!matches(snapshot, request) || SystemClock.elapsedRealtime() >= started + 5_000) throw TeamExpired()
                directory = first; creator = selected; team = members; capture = request
                checkedUntil = started + 5_000; current = true
                // A real desired set is visible after a fresh read. It does not
                // manufacture acknowledgement of an interrupted role command.
                if (edit?.unknown != true && edit?.confirmed != true) error = ""
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) {
                if (matches(snapshot)) {
                    val denied = failure is TeamDenied || (failure as? CreatorAPIError)?.status in listOf(401, 403, 404)
                    conceal(discardEdit = denied); error = teamCopy(if (denied) "Denied" else "Unavailable")
                }
            } finally { if (generation == snapshot) { reading = false; readJob = null } }
        }
    }
    private fun validate(value: APIStudioSession, request: FanSessionRequestCapture) {
        if (value.creators.size > 50 || value.invitations.size > 50 || value.creators.map { it.id }.toSet().size != value.creators.size ||
            value.creators.any { it.viewerAccountId != request.expectedAccountId || !uuid(it.id) } || request.expectedAccountId != accountId || request.sessionId != sessionId) throw TeamDenied()
    }
    fun openEditor(member: APIStudioTeamMembersItem) {
        val request = capture ?: return
        if (!mayManage || saving || edit != null || member.revoked_at != null || member.roles.isEmpty() || member.account_id == accountId || team?.members?.none { it.account_id == member.account_id && it.revoked_at == null } != false) return
        edit = TeamEdit(member.account_id, member.handle?.let { "@$it" } ?: member.account_id, request,
            member.roles.map { it.name }.sorted(), member.roles.map { it.name }.sorted())
        error = ""
    }
    fun select(role: String, selected: Boolean) {
        val value = edit ?: return
        if (!mayManage || saving || reading || editIsStale || value.unknown || value.confirmed) return
        edit = value.copy(desired = (if (selected) (value.desired + role).distinct() else value.desired.filter { it != role }).sorted())
    }
    fun reviewCurrent() {
        val roles = currentEditRoles ?: return; val value = edit ?: return
        if (!mayManage || saving || reading) return
        edit = value.copy(expected = roles, unknown = false, confirmed = false); error = ""
    }
    fun closeEditor() { if (!saving) { edit = null; error = "" } }
    fun save() {
        val command = edit ?: return; val id = creatorId ?: return
        if (!canSave) return
        val snapshot = generation
        val body = APITeamRolesUpdateInput(command.expected.map { APITeamRolesUpdateInputExpectedRolesItem.valueOf(it) }, command.desired.map { APITeamRolesUpdateInputRolesItem.valueOf(it) })
        saving = true
        writeJob = scope.launch {
            try {
                if (!matches(snapshot, command.capture) || !mayManage) {
                    if (matches(snapshot)) { conceal(discardEdit = true); error = teamCopy("AccountChanged") }
                    return@launch
                }
                command.capture.client.updateTeamMemberRoles(id, command.accountId, command.capture.expectedAccountId, body)
                if (!matches(snapshot, command.capture) || edit?.accountId != command.accountId) return@launch
                edit = command.copy(confirmed = true, unknown = false); error = teamCopy("Saved")
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) {
                if (!matches(snapshot, command.capture) || edit?.accountId != command.accountId) return@launch
                if ((failure as? CreatorAPIError)?.status in listOf(401, 403, 404)) {
                    conceal(discardEdit = true); error = teamCopy("Denied")
                } else {
                    // Includes parse failure after HTTP 200: lock the immutable
                    // original capture and tuple for an explicit exact retry.
                    edit = command.copy(unknown = true)
                    error = teamCopy(if ((failure as? CreatorAPIError)?.status == 409) "Changed" else "Unknown")
                }
            } finally { if (generation == snapshot) { saving = false; writeJob = null; refresh() } }
        }
    }
}

/** Standalone W5 domain screen for W1's shipping shell. The shell supplies its
 * genuine FanSession and navigation callbacks; this does not modify root gates.
 * Null creatorId reads the workspace directory, otherwise current Team access. */
@Composable
fun StudioTeamWorkspace(
    session: FanSession, creatorId: String? = null,
    onOpenTeam: (String) -> Unit, onReturnToWorkspace: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val accountId = session.session?.accountId; val sessionId = session.session?.sessionId
    val state = remember(session, creatorId, accountId, sessionId, session.destination) { NativeTeamState(session, creatorId, scope) }
    val owner = LocalLifecycleOwner.current
    var foreground by remember(owner) { mutableStateOf(owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    DisposableEffect(owner, state) {
        val observer = LifecycleEventObserver { _, _ ->
            foreground = owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
            if (!foreground) state.deactivate()
        }
        owner.lifecycle.addObserver(observer)
        onDispose { owner.lifecycle.removeObserver(observer); state.deactivate() }
    }
    LaunchedEffect(state, foreground) {
        if (!foreground) return@LaunchedEffect
        state.activate(); var ticks = 0
        while (true) {
            delay(250); state.expire(); ticks++
            if (ticks % 12 == 0) state.refresh()
        }
    }
    val visible = foreground && state.current && accountId == state.accountId && sessionId == state.sessionId && !session.purgingPrivateState && !session.localPurgeFailed
    Column(Modifier.fillMaxSize().background(qColor("ground")).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        TextLine(teamCopy(if (creatorId == null) "Workspace" else "Title"), "display-md", modifier = Modifier.semantics { heading() })
        if (state.error.isNotEmpty()) Notice(title = teamCopy("Status"), children = state.error)
        Button(teamCopy("Refresh"), ButtonVariant.SECONDARY, block = true, disabled = state.reading || state.saving, onClick = state::refresh)
        if (visible) {
            val directory = state.directory; val creator = state.creator; val team = state.team
            if (creatorId == null && directory != null) {
                if (directory.creators.isEmpty()) TextLine(teamCopy("NoWorkspace"))
                directory.creators.forEach { item ->
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        TextLine(item.display_name, strong = true); TextLine("@${item.handle}", "caption")
                        TextLine(teamCopy(if (item.owned) "Owner" else "Member"), "label")
                        if (item.verification == "verified") Button(QelvoraCopy.text("navTeam"), ButtonVariant.SECONDARY, block = true) { if (state.current) onOpenTeam(item.id) }
                        else TextLine(teamCopy("VerificationRequired"))
                    }
                }
                directory.invitations.forEach { invitation -> TextLine(teamCopy("Invitation", mapOf("name" to invitation.creatorName, "roles" to invitation.roles.joinToString { it.name.lowercase() }, "expires" to invitation.expiresAt))) }
            } else if (creator != null && team != null) {
                TextLine(creator.display_name, strong = true); TextLine(teamCopy("IdentityRule"))
                if (team.members.isEmpty()) TextLine(teamCopy("NoMembers"))
                team.members.forEach { member ->
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        TextLine(member.handle?.let { "@$it" } ?: member.account_id, strong = true)
                        TextLine(member.roles.joinToString { it.name.lowercase() })
                        if (member.revoked_at != null) TextLine(teamCopy("Removed"), "label")
                        else if (state.mayManage && member.account_id != state.accountId) Button(teamCopy("Edit"), ButtonVariant.SECONDARY, block = true, disabled = state.saving || state.edit != null || member.roles.isEmpty()) { state.openEditor(member) }
                    }
                }
                if (!creator.owned) TextLine(teamCopy("CreatorOnly"))
                state.edit?.takeIf { state.mayManage }?.let { edit ->
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        TextLine(teamCopy("EditFor", mapOf("member" to edit.label)), strong = true, modifier = Modifier.semantics { heading() })
                        TextLine(teamCopy("Reviewed", mapOf("roles" to edit.expected.joinToString { it.lowercase() })))
                        TextLine(teamCopy("Desired", mapOf("roles" to edit.desired.joinToString { it.lowercase() })))
                        state.currentEditRoles?.let { TextLine(teamCopy("Current", mapOf("roles" to it.joinToString { role -> role.lowercase() }))) }
                        TeamRole.entries.forEach { role ->
                            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(value = edit.desired.contains(role.name), enabled = !state.saving && !state.reading && !state.editIsStale && !edit.unknown && !edit.confirmed, role = Role.Checkbox, onValueChange = { state.select(role.name, it) }).padding(vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Glyph(if (edit.desired.contains(role.name)) "check" else "circle", 20.dp, qColor("ink"))
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) { TextLine(role.title, strong = true); TextLine(role.detail, "caption") }
                            }
                        }
                        if (state.editIsStale && state.currentEditRoles != null) Button(teamCopy("ReviewCurrent"), ButtonVariant.SECONDARY, block = true, disabled = state.saving || state.reading, onClick = state::reviewCurrent)
                        Button(teamCopy(if (edit.unknown) "RetryExact" else "Save"), ButtonVariant.SECONDARY, block = true, disabled = !state.canSave, onClick = state::save)
                        Button(QelvoraCopy.text("close"), ButtonVariant.QUIET, block = true, disabled = state.saving, onClick = state::closeEditor)
                    }
                }
            }
        } else TextLine(teamCopy("Unavailable"))
        if (creatorId != null) Button(teamCopy("Back"), ButtonVariant.QUIET, block = true, disabled = state.saving, onClick = onReturnToWorkspace)
    }
}
