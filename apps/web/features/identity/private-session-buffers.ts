type OriginalSession = { accountId: string; sessionId: string };

function discardTupleBuffers(
  storage: Storage,
  markerKey: string,
  prefixes: readonly string[],
  original?: OriginalSession,
) {
  if (original) {
    const marker: unknown = JSON.parse(storage.getItem(markerKey) ?? "null");
    if (
      !Array.isArray(marker) ||
      marker.length !== 2 ||
      marker[0] !== original.accountId ||
      marker[1] !== original.sessionId
    )
      return;
  }
  for (const key of Object.keys(storage))
    if (key === markerKey || prefixes.some((prefix) => key.startsWith(prefix)))
      storage.removeItem(key);
}

/** Negative presentation cleanup only. Markers never supply request authority.
 * Cold Account pages must discard these existing app-owned buffers without
 * loading their feature modules. A scoped end cannot erase a newer session. */
export function discardPrivateSessionBuffers(original?: OriginalSession) {
  try {
    const markerKey = original ? `w2-session:${original.accountId}` : null;
    if (
      !original ||
      JSON.parse(localStorage.getItem(markerKey!) ?? "null") ===
        original.sessionId
    ) {
      const prefixes = ["w2-source", "w2-interview", "w2-config"].map(
        (kind) => `${kind}:${original ? `${original.accountId}:` : ""}`,
      );
      for (const key of Object.keys(localStorage))
        if (
          prefixes.some((prefix) => key.startsWith(prefix)) ||
          (markerKey ? key === markerKey : key.startsWith("w2-session:"))
        )
          localStorage.removeItem(key);
    }
  } catch {
    // Storage may be disabled. Cancellation and real server checks remain.
  }
  try {
    discardTupleBuffers(
      sessionStorage,
      "w5.original-session",
      [
        "w5.pendingPublication:",
        "w5.queue.",
        "w5.queue:",
        "w5.approval:",
        "w5.team-reply:",
      ],
      original,
    );
  } catch {
    // One unavailable namespace must not prevent the other cleanup attempts.
  }
  try {
    discardTupleBuffers(
      sessionStorage,
      "w6.recording-delivery-session",
      ["w6.recording-delivery:"],
      original,
    );
  } catch {
    // Optional retry metadata is never permission or publication authority.
  }
}
