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
const pendingCommands = new Map<string, string>();
let identityScope: {
  accountId: string;
  sessionId: string;
  signal: AbortSignal;
  end: () => void;
} | null = null;
// Retain only the last genuine identity tuple for clearing private retry state.
// Effect cleanup may remove the active scope before the next one is configured.
let previousIdentity: { accountId: string; sessionId: string } | null = null;
export function configureStudioRequests(
  scope: NonNullable<typeof identityScope>,
) {
  const purge = () => {
    pendingCommands.clear();
    for (const key of Object.keys(sessionStorage))
      if (
        key.startsWith("w5.pendingPublication:") ||
        key.startsWith("w5.queue.") ||
        key.startsWith("w5.queue:") ||
        key.startsWith("w5.approval:") ||
        key.startsWith("w5.team-reply:")
      )
        sessionStorage.removeItem(key);
  };
  if (
    previousIdentity &&
    (previousIdentity.accountId !== scope.accountId ||
      previousIdentity.sessionId !== scope.sessionId)
  )
    purge();
  previousIdentity = {
    accountId: scope.accountId,
    sessionId: scope.sessionId,
  };
  identityScope = scope;
  scope.signal.addEventListener("abort", purge, { once: true });
  return () => {
    scope.signal.removeEventListener("abort", purge);
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
    const original = pendingCommands.get(fingerprint) ?? String(idempotencyKey);
    pendingCommands.set(fingerprint, original);
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
