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
let identityScope: { accountId: string; signal: AbortSignal } | null = null;
export function configureStudioRequests(
  scope: NonNullable<typeof identityScope>,
) {
  const purge = () => {
    pendingCommands.clear();
    for (const key of Object.keys(sessionStorage))
      if (
        key.startsWith("w5.pendingPublication:") ||
        key.startsWith("w5.queue.")
      )
        sessionStorage.removeItem(key);
  };
  if (identityScope && identityScope.accountId !== scope.accountId) purge();
  identityScope = scope;
  scope.signal.addEventListener("abort", purge, { once: true });
  return () => {
    scope.signal.removeEventListener("abort", purge);
    if (identityScope === scope) identityScope = null;
  };
}
export async function studioRequest<T>(
  domain: "studio" | "content" | "commerce-approvals",
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
  let response: Response;
  let fingerprint: string | undefined;
  if (body && typeof body === "object" && "idempotencyKey" in body) {
    const { idempotencyKey, ...command } = body as Record<string, unknown>;
    fingerprint = JSON.stringify([domain, path, expectedAccountId, command]);
    const original = pendingCommands.get(fingerprint) ?? String(idempotencyKey);
    pendingCommands.set(fingerprint, original);
    body = { ...command, idempotencyKey: original };
  }
  try {
    response = await fetch(`/api/${domain}/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(expectedAccountId
          ? { "x-qelvora-expected-account": expectedAccountId }
          : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      signal: AbortSignal.any([
        scope.signal,
        AbortSignal.timeout(15000),
        ...(options.signal ? [options.signal] : []),
      ]),
    });
  } catch {
    throw new StudioFailure(
      503,
      "offline",
      "Reconnect to continue. Your input is kept; nothing is replayed automatically.",
    );
  }
  let value;
  try {
    value = await response.json();
  } catch {
    throw new StudioFailure(
      503,
      "response_unknown",
      "The response was interrupted. Refresh current state or retry this exact action.",
    );
  }
  if (fingerprint && (response.ok || response.status < 500))
    pendingCommands.delete(fingerprint);
  if (!response.ok)
    throw new StudioFailure(
      response.status,
      value.error?.code ?? "unavailable",
      value.error?.message ?? "This action is unavailable.",
    );
  return value as T;
}
