import { registerPrivateSessionBufferCleanup } from "../identity/private-session-buffers";

export class StudioFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
// Retry only when the user repeats an action. Keep the original command key after
// an unknown response; raw input remains in memory, never browser storage.
const pendingCommands = new Map<
  string,
  { idempotencyKey: string; accountId: string; sessionId: string }
>();
let identityScope: {
  accountId: string;
  sessionId: string;
  signal: AbortSignal;
  end: () => void;
  isSessionEnded: () => boolean;
} | null = null;
// Retain only the last genuine identity tuple for clearing private retry state.
// Effect cleanup may remove the active scope before the next one is configured.
let previousIdentity: { accountId: string; sessionId: string } | null = null;
const identityStorage = "w5.original-session";
let removeCleanupObserver: (() => void) | undefined;
function purgeStudioState(original?: { accountId: string; sessionId: string }) {
  if (original) {
    // A delayed genuine end may belong to a departed view. Its negative
    // cleanup cannot erase a newer session's immutable uncertain command.
    for (const [fingerprint, command] of pendingCommands)
      if (
        command.accountId === original.accountId &&
        command.sessionId === original.sessionId
      )
        pendingCommands.delete(fingerprint);
  } else pendingCommands.clear();
  try {
    if (
      original &&
      sessionStorage.getItem(identityStorage) !==
        JSON.stringify([original.accountId, original.sessionId])
    )
      return;
    for (const key of Object.keys(sessionStorage))
      if (
        key.startsWith("w5.pendingPublication:") ||
        key.startsWith("w5.queue.") ||
        key.startsWith("w5.queue:") ||
        key.startsWith("w5.approval:") ||
        key.startsWith("w5.team-reply:")
      )
        sessionStorage.removeItem(key);
    sessionStorage.removeItem(identityStorage);
  } catch {
    // Unavailable storage cannot restore a private command or cursor.
  }
}
export function configureStudioRequests(
  scope: NonNullable<typeof identityScope>,
) {
  if (
    previousIdentity &&
    (previousIdentity.accountId !== scope.accountId ||
      previousIdentity.sessionId !== scope.sessionId)
  )
    purgeStudioState(previousIdentity);
  const marker = JSON.stringify([scope.accountId, scope.sessionId]);
  try {
    // A reload loses the in-memory tuple. Persist only the actual identity
    // marker, and refuse old metadata before any same-session saved return.
    if (sessionStorage.getItem(identityStorage) !== marker) purgeStudioState();
    sessionStorage.setItem(identityStorage, marker);
  } catch {
    // Storage-free operation retains only this genuine in-memory lifetime.
  }
  previousIdentity = {
    accountId: scope.accountId,
    sessionId: scope.sessionId,
  };
  // Retain only the genuine tuple's negative cleanup while Studio is unmounted.
  // A literal cross-tab hint never clears commands; the canonical observer
  // first rereads the actual session and skips a replacement's tuple.
  removeCleanupObserver?.();
  const original = { accountId: scope.accountId, sessionId: scope.sessionId };
  removeCleanupObserver = registerPrivateSessionBufferCleanup(original, () =>
    purgeStudioState(original),
  );
  identityScope = scope;
  const ended = () => {
    if (scope.isSessionEnded()) purgeStudioState(scope);
  };
  scope.signal.addEventListener("abort", ended, { once: true });
  if (scope.signal.aborted) ended();
  return () => {
    scope.signal.removeEventListener("abort", ended);
    if (identityScope === scope) identityScope = null;
  };
}
export async function studioRequest<T>(
  domain: "studio" | "content" | "commerce-approvals" | "conversations",
  path: string,
  body?: unknown,
  expectedAccountId?: string,
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const scope = identityScope;
  if (!scope || scope.signal.aborted)
    throw new StudioFailure(
      401,
      "session_ended",
      "Continue with Pantopus before using Studio.",
    );
  if (expectedAccountId && expectedAccountId !== scope.accountId)
    throw new StudioFailure(
      409,
      "session_account_changed",
      "Your account changed. Reopen Studio before continuing.",
    );
  expectedAccountId = scope.accountId;
  const signal = AbortSignal.any([
    scope.signal,
    AbortSignal.timeout(15000),
    ...(options.signal ? [options.signal] : []),
  ]);
  const assertCurrent = () => {
    if (identityScope !== scope || scope.signal.aborted)
      throw new StudioFailure(
        409,
        "session_view_changed",
        "Your original Studio view changed. Reopen it before continuing.",
      );
    if (signal.aborted)
      throw new StudioFailure(
        503,
        "response_unknown",
        "The response was interrupted. Refresh current state or retry this exact action.",
      );
  };
  assertCurrent();
  let response: Response;
  let fingerprint: string | undefined;
  if (body && typeof body === "object" && "idempotencyKey" in body) {
    const { idempotencyKey, ...command } = body as Record<string, unknown>;
    fingerprint = JSON.stringify([
      domain,
      path,
      expectedAccountId,
      scope.sessionId,
      command,
    ]);
    const original =
      pendingCommands.get(fingerprint)?.idempotencyKey ??
      String(idempotencyKey);
    pendingCommands.set(fingerprint, {
      idempotencyKey: original,
      accountId: scope.accountId,
      sessionId: scope.sessionId,
    });
    body = { ...command, idempotencyKey: original };
  }
  try {
    response = await fetch(`/api/${domain}/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        // Denial preconditions only. The actual credential resolves authority.
        "X-Expected-Session-Id": scope.sessionId,
        ...(expectedAccountId
          ? {
              "x-qelvora-expected-account": expectedAccountId,
              ...(domain === "conversations"
                ? { "X-Expected-Account-Id": expectedAccountId }
                : {}),
            }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      signal,
    });
  } catch {
    assertCurrent();
    throw new StudioFailure(
      503,
      "offline",
      "Reconnect to continue. Your input is kept; nothing is replayed automatically.",
    );
  }
  assertCurrent();
  let value;
  try {
    value = await response.json();
  } catch {
    assertCurrent();
    if (response.status === 404)
      throw new StudioFailure(
        404,
        "producer_unavailable",
        "This service is not connected in the current workspace. Your input is kept.",
      );
    throw new StudioFailure(
      503,
      "response_unknown",
      "The response was interrupted. Refresh current state or retry this exact action.",
    );
  }
  // A completed HTTP response can still parse after disposal/replacement.
  // Never apply it or mutate a replacement scope's retry map.
  assertCurrent();
  if (fingerprint && (response.ok || response.status < 500))
    pendingCommands.delete(fingerprint);
  if (!response.ok) {
    const failure = new StudioFailure(
      response.status,
      value.error?.code ?? "unavailable",
      value.error?.message ?? "This action is unavailable.",
    );
    if (
      ["session_view_changed", "session_account_changed"].includes(failure.code)
    )
      scope.end();
    throw failure;
  }
  return value as T;
}
