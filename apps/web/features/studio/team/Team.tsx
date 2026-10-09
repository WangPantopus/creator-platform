"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { copy } from "@qelvora/copy";
import { Notice } from "@qelvora/ui-web";
import { DoneSchema, TeamRolesUpdateInputSchema } from "@qelvora/api";
import { StudioFailure, studioRequest } from "../api";
import { useIdentityRequest } from "../../identity/session-boundary";
import { Feedback, useAction } from "../shared/action";
import { time } from "../shared/format";
import type { Creator } from "../shared/types";
const teamRoleChoices = [
  ["triage", "Triage", "Reads and routes the queue. Replies as team."],
  ["drafter", "Drafting", "Prepares drafts. Never approves as you."],
  ["publisher", "Publishing", "Publishes content under team identity."],
  ["scheduler", "Scheduling", "Offers times from your hours."],
] as const;
const sameTeamRoles = (left: readonly string[], right: readonly string[]) =>
  [...left].sort().join("|") === [...right].sort().join("|");
type TeamRoleEdit = {
  accountId: string;
  label: string;
  expectedRoles: string[];
  roles: string[];
  responseUnknown: boolean;
};
export function Team({
  creator,
  suspended,
}: {
  creator: Creator;
  suspended: boolean;
}) {
  const [members, setMembers] = useState<
      {
        account_id: string;
        roles: string[];
        revoked_at: string | null;
        handle: string | null;
      }[]
    >([]),
    [account, setAccount] = useState(""),
    [pendingInvites, setPendingInvites] = useState<
      {
        id: string;
        account_id: string;
        handle: string | null;
        roles: string[];
        expires_at: string;
        accepted_at: string | null;
        revoked_at: string | null;
      }[]
    >([]),
    [roles, setRoles] = useState<string[]>([]),
    [roleEdit, setRoleEdit] = useState<TeamRoleEdit | null>(null),
    [teamCurrent, setTeamCurrent] = useState(false),
    [reading, setReading] = useState(false),
    [readError, setReadError] = useState(""),
    action = useAction();
  const retryRef = useRef<HTMLButtonElement>(null),
    handleRef = useRef<HTMLInputElement>(null),
    retryFocusRequested = useRef(false),
    mounted = useRef(false),
    previousFocus = useRef<HTMLElement | null>(null),
    roleTrigger = useRef<HTMLButtonElement | null>(null),
    roleReturn = useRef(false),
    teamRefresh = useRef<HTMLButtonElement | null>(null),
    generation = useRef(0),
    checkedUntil = useRef(0),
    request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (!mounted.current || document.hidden || request.current) return;
    const controller = new AbortController(),
      current = generation.current,
      started = performance.now();
    request.current = controller;
    setReading(true);
    try {
      const result = await studioRequest<{
        members: typeof members;
        invitations: typeof pendingInvites;
      }>("studio", `${creator.id}/team`, undefined, creator.viewerAccountId, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]),
      });
      if (!mounted.current || current !== generation.current) return;
      if (document.hidden || performance.now() >= started + 5000)
        throw new StudioFailure(
          503,
          "authority_expired",
          "Check the current team again before continuing.",
        );
      setMembers(result.members);
      setPendingInvites(result.invitations);
      checkedUntil.current = started + 5000;
      setTeamCurrent(true);
      setReadError("");
    } catch (failure) {
      if (!mounted.current || current !== generation.current) return;
      checkedUntil.current = 0;
      setTeamCurrent(false);
      setMembers([]);
      setPendingInvites([]);
      setReadError(
        failure instanceof Error ? failure.message : "Team is unavailable.",
      );
    } finally {
      if (request.current === controller) request.current = null;
      if (mounted.current && current === generation.current) setReading(false);
    }
  }, [creator.id, creator.viewerAccountId]);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => void load(),
      conceal = () => {
        generation.current++;
        request.current?.abort();
        request.current = null;
        checkedUntil.current = 0;
        setReading(false);
        setTeamCurrent(false);
        setMembers([]);
        setPendingInvites([]);
      },
      visibility = () => {
        if (document.hidden) conceal();
        else refresh();
      };
    refresh();
    const polling = setInterval(refresh, 4000),
      expiry = setInterval(() => {
        if (performance.now() >= checkedUntil.current) setTeamCurrent(false);
      }, 250);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false;
      generation.current++;
      request.current?.abort();
      request.current = null;
      checkedUntil.current = 0;
      clearInterval(polling);
      clearInterval(expiry);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load]);
  useEffect(() => {
    if (reading) return;
    const requested = retryFocusRequested.current;
    retryFocusRequested.current = false;
    if (suspended || document.hidden) return;
    if (document.activeElement !== document.body) return;
    const previous = previousFocus.current;
    if (
      teamCurrent &&
      previous?.isConnected &&
      !previous.closest("[hidden], [inert]") &&
      previous.getClientRects().length
    ) {
      previous.focus();
    } else if (requested && document.activeElement === document.body) {
      const target =
        teamCurrent && creator.owned ? handleRef.current : retryRef.current;
      if (
        target?.isConnected &&
        !target.closest("[hidden], [inert]") &&
        target.getClientRects().length
      )
        target.focus();
    }
  }, [teamCurrent, reading, suspended, creator.owned]);
  const {
    request: identityRequest,
    session,
    signal: identitySignal,
  } = useIdentityRequest();
  useEffect(() => {
    if (
      roleReturn.current &&
      !roleEdit &&
      teamCurrent &&
      !action.busy &&
      !reading &&
      !suspended &&
      !document.hidden
    ) {
      roleReturn.current = false;
      if (document.activeElement !== document.body) return;
      const target = roleTrigger.current?.isConnected
        ? roleTrigger.current
        : teamRefresh.current;
      if (
        target?.isConnected &&
        !target.closest("[hidden], [inert]") &&
        target.getClientRects().length
      )
        target.focus();
    }
  }, [roleEdit, teamCurrent, suspended, action.busy, reading]);
  const requireManagement = () => {
    if (
      !creator.owned ||
      !teamCurrent ||
      suspended ||
      session.accountId !== creator.viewerAccountId ||
      document.hidden ||
      performance.now() >= checkedUntil.current
    )
      throw new StudioFailure(
        403,
        "current_creator_required",
        "Check your current creator access before managing the team.",
      );
  };
  const identity = async (path: string, body: unknown) => {
    requireManagement();
    const current = generation.current;
    let response: Response;
    try {
      response = await identityRequest(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new StudioFailure(
        503,
        "response_unknown",
        "The response was interrupted. Check the current team or retry the exact reviewed action.",
      );
    }
    let value;
    try {
      value = await response.json();
    } catch {
      throw new StudioFailure(
        503,
        "response_unknown",
        "The response was interrupted. Check the current team or retry the exact reviewed action.",
      );
    }
    if (
      !mounted.current ||
      identitySignal.aborted ||
      document.hidden ||
      current !== generation.current
    )
      throw new StudioFailure(
        503,
        "response_unknown",
        "The response arrived after this view changed. Check the current team before continuing.",
      );
    if (!response.ok)
      throw new StudioFailure(
        response.status,
        value.error?.code ?? "team_unavailable",
        response.status === 404
          ? "This team action is not connected in the current workspace. Your reviewed input is kept."
          : (value.error?.message ?? "The team action is unavailable."),
      );
    return value;
  };
  const editedMember = roleEdit
    ? members.find((member) => member.account_id === roleEdit.accountId)
    : undefined;
  const memberActive = Boolean(editedMember && !editedMember.revoked_at),
    rolesChanged = Boolean(
      roleEdit &&
        editedMember &&
        !sameTeamRoles(editedMember.roles, roleEdit.expectedRoles) &&
        !sameTeamRoles(editedMember.roles, roleEdit.roles),
    );
  const saveRoles = async () => {
    const reviewed = roleEdit;
    requireManagement();
    if (
      !reviewed ||
      !memberActive ||
      rolesChanged ||
      !reviewed.roles.length ||
      creator.verification !== "verified"
    )
      throw new StudioFailure(
        409,
        "team_roles_changed",
        "Check this member's current roles and review them before saving.",
      );
    try {
      const command = TeamRolesUpdateInputSchema.safeParse({
        expectedRoles: reviewed.expectedRoles,
        roles: reviewed.roles,
      });
      if (!command.success)
        throw new StudioFailure(
          409,
          "team_roles_changed",
          "The reviewed role set is unavailable. Refresh and review this member again.",
        );
      const result = await identity(
        `${creator.id}/team/${reviewed.accountId}/roles`,
        command.data,
      );
      if (!DoneSchema.safeParse(result).success)
        throw new StudioFailure(
          503,
          "response_unknown",
          "The role-change response was interrupted. Check the current team or retry this exact change.",
        );
      roleReturn.current = true;
      setRoleEdit(null);
      action.setNotice("Role change saved. Current access is being checked.");
    } catch (failure) {
      if (failure instanceof StudioFailure && failure.status >= 500)
        setRoleEdit((edit) =>
          edit === reviewed ? { ...edit, responseUnknown: true } : edit,
        );
      throw failure;
    } finally {
      // A read never silently replaces the roles the creator reviewed.
      await load();
    }
  };
  return (
    <section className="w5-team">
      <header className="w5-heading">
        <div className="w5-team-title">
          <span className="qv-meta">TEAM</span>
          <h1>Who helps, and what they can do</h1>
        </div>
        <button
          ref={teamRefresh}
          type="button"
          className="qv-btn qv-btn--secondary"
          disabled={reading || action.busy}
          aria-busy={reading}
          onClick={() => void load()}
        >
          {reading ? "Checking team…" : "Refresh team"}
        </button>
      </header>
      <Feedback action={action} />
      {!teamCurrent && (
        <Notice
          tone={readError ? "offline" : "neutral"}
          title={copy.identityTeamAccessTitle}
        >
          <p>{readError || copy.identityTeamAccessLoading}</p>
          <p>{copy.identityTeamAccessRequired}</p>
          {creator.owned && <p>Your invitation input is kept in this tab.</p>}
          <button
            ref={retryRef}
            type="button"
            className="qv-btn qv-btn--secondary"
            aria-busy={reading}
            aria-disabled={reading || action.busy}
            onClick={(event) => {
              if (reading || action.busy) return;
              retryFocusRequested.current =
                document.activeElement === event.currentTarget;
              void load();
            }}
          >
            {copy.retry}
          </button>
        </Notice>
      )}
      <div
        className="w5-team-columns"
        hidden={!teamCurrent}
        inert={!teamCurrent}
        onFocusCapture={(event) => {
          if (teamCurrent && !suspended) previousFocus.current = event.target;
        }}
      >
        <div className="w5-card">
          <h2>Roles</h2>
          {members.map((m) => (
            <div className="w5-team-member" key={m.account_id}>
              <strong>{m.handle ? `@${m.handle}` : m.account_id}</strong>
              <p>{m.revoked_at ? "Removed" : m.roles.join(" · ")}</p>
              {creator.owned && !m.revoked_at && (
                <div className="w5-actions">
                  <button
                    className="qv-btn qv-btn--secondary"
                    aria-label={`Edit roles for ${m.handle ? `@${m.handle}` : m.account_id}`}
                    disabled={
                      action.busy ||
                      reading ||
                      Boolean(roleEdit) ||
                      creator.verification !== "verified"
                    }
                    onClick={(event) =>
                      void action.run(async () => {
                        requireManagement();
                        roleTrigger.current = event.currentTarget;
                        setRoleEdit({
                          accountId: m.account_id,
                          label: m.handle ? `@${m.handle}` : m.account_id,
                          expectedRoles: [...m.roles],
                          roles: [...m.roles],
                          responseUnknown: false,
                        });
                      })
                    }
                  >
                    Edit roles
                  </button>
                  <button
                    className="qv-btn qv-btn--quiet"
                    disabled={action.busy || reading || Boolean(roleEdit)}
                    onClick={() =>
                      void action.run(async () => {
                        await identity(
                          `${creator.id}/team/${m.account_id}/remove`,
                          {},
                        );
                        await load();
                      })
                    }
                  >
                    Remove access
                  </button>
                </div>
              )}
            </div>
          ))}
          {roleEdit && creator.owned && (
            <fieldset className="w5-team-invite" disabled={action.busy}>
              <legend>Review roles for {roleEdit.label}</legend>
              <p className="qv-help">
                Team roles never approve or sign as you. Saving also closes this
                member's pending invitations.
              </p>
              <p>Reviewed roles: {roleEdit.expectedRoles.join(" · ")}</p>
              {!memberActive && (
                <Notice title="Member access changed">
                  This member no longer has active access. Refresh the team
                  before making another change.
                </Notice>
              )}
              {rolesChanged && editedMember && (
                <Notice title="Roles changed">
                  Current roles: {editedMember.roles.join(" · ")}. Review this
                  set before saving your selection.
                  <button
                    className="qv-btn qv-btn--secondary"
                    disabled={reading}
                    onClick={() =>
                      void action.run(async () => {
                        requireManagement();
                        setRoleEdit({
                          ...roleEdit,
                          expectedRoles: [...editedMember.roles],
                          responseUnknown: false,
                        });
                      })
                    }
                  >
                    Review current roles
                  </button>
                </Notice>
              )}
              {roleEdit.responseUnknown && (
                <Notice tone="offline" title="Role change not confirmed">
                  Your exact reviewed change is kept. Check the current team,
                  then retry it. Nothing is sent automatically.
                </Notice>
              )}
              {teamRoleChoices.map(([role, label, description]) => (
                <label className="w5-check" key={role}>
                  <input
                    type="checkbox"
                    aria-label={`${label} role for ${roleEdit.label}`}
                    disabled={
                      !memberActive || rolesChanged || roleEdit.responseUnknown
                    }
                    checked={roleEdit.roles.includes(role)}
                    onChange={(event) =>
                      setRoleEdit({
                        ...roleEdit,
                        roles: event.target.checked
                          ? [...roleEdit.roles, role]
                          : roleEdit.roles.filter((value) => value !== role),
                      })
                    }
                  />
                  <span>
                    <strong>{label}</strong>
                    <span className="qv-help">{description}</span>
                  </span>
                </label>
              ))}
              <div className="w5-actions">
                <button
                  className="qv-btn qv-btn--secondary"
                  disabled={
                    reading ||
                    !memberActive ||
                    rolesChanged ||
                    !roleEdit.roles.length ||
                    creator.verification !== "verified"
                  }
                  onClick={() => void action.run(saveRoles)}
                >
                  {roleEdit.responseUnknown
                    ? "Retry exact role change"
                    : "Save roles"}
                </button>
                <button
                  className="qv-btn qv-btn--quiet"
                  disabled={reading}
                  onClick={() => void load()}
                >
                  Check current team
                </button>
                <button
                  className="qv-btn qv-btn--quiet"
                  onClick={() => {
                    roleReturn.current = true;
                    setRoleEdit(null);
                    setTeamCurrent(false);
                    void load();
                  }}
                >
                  Close role editor
                </button>
              </div>
            </fieldset>
          )}
          {pendingInvites
            .filter((i) => !i.accepted_at && !i.revoked_at)
            .map((i) => (
              <article key={i.id}>
                <strong>
                  Invitation · {i.handle ? `@${i.handle}` : i.account_id}
                </strong>
                <p>
                  {i.roles.join(" · ")} ·{" "}
                  {new Date(i.expires_at).getTime() > Date.now()
                    ? "Expires"
                    : "Expired"}{" "}
                  {time(i.expires_at)}
                </p>
                {creator.owned && (
                  <button
                    className="qv-btn qv-btn--quiet"
                    disabled={action.busy || reading || Boolean(roleEdit)}
                    onClick={() =>
                      void action.run(async () => {
                        await identity(
                          `${creator.id}/team/${i.account_id}/remove`,
                          {},
                        );
                        await load();
                      })
                    }
                  >
                    Remove invitation
                  </button>
                )}
              </article>
            ))}
          {!members.length &&
            !pendingInvites.some((i) => !i.accepted_at && !i.revoked_at) && (
              <p className="qv-help">No team members or pending invitations.</p>
            )}
          {creator.owned && (
            <fieldset
              className="w5-team-invite"
              disabled={action.busy || Boolean(roleEdit)}
            >
              <legend>Invite a team member</legend>
              <label className="w5-field">
                Public fan handle
                <input
                  ref={handleRef}
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                />
              </label>
              {teamRoleChoices.map(([role, label, description]) => (
                <label className="w5-check" key={role}>
                  <input
                    type="checkbox"
                    checked={roles.includes(role!)}
                    onChange={(e) =>
                      setRoles(
                        e.target.checked
                          ? [...roles, role!]
                          : roles.filter((r) => r !== role),
                      )
                    }
                  />
                  <span>
                    <strong>{label}</strong>
                    <span className="qv-help">{description}</span>
                  </span>
                </label>
              ))}
              <button
                className="qv-btn qv-btn--secondary"
                disabled={
                  action.busy ||
                  reading ||
                  creator.verification !== "verified" ||
                  !account ||
                  !roles.length
                }
                onClick={() =>
                  void action.run(async () => {
                    requireManagement();
                    await studioRequest(
                      "studio",
                      `${creator.id}/team/invite`,
                      {
                        handle: account,
                        roles,
                      },
                      creator.viewerAccountId,
                    );
                    action.setNotice(
                      "Invitation created. Roles take effect only after the invited account accepts.",
                    );
                    setAccount("");
                    setRoles([]);
                    await load();
                  })
                }
              >
                Create invitation
              </button>
            </fieldset>
          )}
          {!creator.owned && (
            <p className="qv-help">
              Only the creator can invite members or remove access.
            </p>
          )}
        </div>
        <div className="w5-editor qv-on-maya w5-team-creator-only">
          <h2 className="qv-meta">Only you · Cannot be shared</h2>
          <p>Approve anything as you</p>
          <p>Deliver written replies, voice notes and calls</p>
          <p>Change your AI's rules and guardrails</p>
          <p className="w5-team-attribution">
            Team members reply as your team, never as you.
          </p>
          <Link className="qv-btn qv-btn--quiet" href="/identity/account">
            Verification and account
          </Link>
        </div>
      </div>
    </section>
  );
}
