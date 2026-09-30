export class ConversationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function conversationRequest<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/conversations/${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: signal ?? AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new ConversationError(
      data.error?.code ?? "unavailable",
      data.error?.message ?? "This conversation is unavailable.",
      response.status,
    );
  return data as T;
}
