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
export async function studioRequest<T>(
  domain: "studio" | "content" | "commerce-approvals" | "conversations",
  path: string,
  body?: unknown,
  expectedAccountId?: string,
): Promise<T> {
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
