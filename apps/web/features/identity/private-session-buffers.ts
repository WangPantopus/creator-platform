export type OriginalSession = { accountId: string; sessionId: string };

type PrivateBuffer = {
  storage: Storage;
  key: string;
  raw: string | null;
  identity: OriginalSession | null;
  namespaceMarker?: { key: string; raw: string | null };
};
type CleanupObserver = {
  original: OriginalSession;
  discard: () => void;
};
const cleanupObservers = new Set<CleanupObserver>();
const sameSession = (a: OriginalSession | null, b: OriginalSession | null) =>
  !!a && !!b && a.accountId === b.accountId && a.sessionId === b.sessionId;

/** Negative presentation cleanup only. The tuple comes from the consumer's
 * genuine original scope; this registration supplies no identity or lifetime. */
export function registerPrivateSessionBufferCleanup(
  original: OriginalSession,
  discard: () => void,
) {
  const observer = { original: { ...original }, discard };
  cleanupObservers.add(observer);
  return () => {
    cleanupObservers.delete(observer);
  };
}

function storedSession(raw: string | null): OriginalSession | null {
  try {
    const tuple: unknown = JSON.parse(raw ?? "null");
    return Array.isArray(tuple) &&
      tuple.length === 2 &&
      tuple.every((value) => typeof value === "string" && value)
      ? { accountId: tuple[0], sessionId: tuple[1] }
      : null;
  } catch {
    return null;
  }
}

/** Snapshots are private presentation metadata, never request authority. */
export function capturePrivateBufferMarkers() {
  const buffers: PrivateBuffer[] = [];
  try {
    for (const key of Object.keys(localStorage)) {
      const parts = key.split(":");
      if (parts[0] === "w2-session" && parts.length === 2) {
        const raw = localStorage.getItem(key);
        let sessionId: unknown;
        try {
          sessionId = JSON.parse(raw ?? "null");
        } catch {
          sessionId = null;
        }
        buffers.push({
          storage: localStorage,
          key,
          raw,
          namespaceMarker: { key, raw },
          identity:
            typeof sessionId === "string" && sessionId
              ? { accountId: parts[1]!, sessionId }
              : null,
        });
      } else if (
        ["w2-source", "w2-interview", "w2-config"].includes(parts[0] ?? "")
      ) {
        let identity: OriginalSession | null = null;
        let namespaceMarker: PrivateBuffer["namespaceMarker"];
        if (parts.length === 4 && parts[1] && parts[2])
          identity = { accountId: parts[1], sessionId: parts[2] };
        else if (parts.length === 3 && parts[1]) {
          // Legacy adoption remains limited to its pre-existing session marker.
          try {
            const markerKey = `w2-session:${parts[1]}`;
            const markerRaw = localStorage.getItem(markerKey);
            namespaceMarker = { key: markerKey, raw: markerRaw };
            const sessionId: unknown = JSON.parse(markerRaw ?? "null");
            if (typeof sessionId === "string" && sessionId)
              identity = { accountId: parts[1], sessionId };
          } catch {
            /* Unbound legacy data cannot establish a session. */
          }
        }
        buffers.push({
          storage: localStorage,
          key,
          raw: localStorage.getItem(key),
          identity,
          namespaceMarker,
        });
      }
    }
  } catch {
    /* Independent namespaces may still be available. */
  }
  for (const [markerKey, prefixes] of [
    [
      "w5.original-session",
      [
        "w5.pendingPublication:",
        "w5.queue.",
        "w5.queue:",
        "w5.approval:",
        "w5.team-reply:",
      ],
    ],
    ["w6.recording-delivery-session", ["w6.recording-delivery:"]],
  ] as const) {
    try {
      const markerRaw = sessionStorage.getItem(markerKey);
      const identity = storedSession(markerRaw);
      for (const key of Object.keys(sessionStorage))
        if (
          key === markerKey ||
          prefixes.some((prefix) => key.startsWith(prefix))
        )
          buffers.push({
            storage: sessionStorage,
            key,
            raw: sessionStorage.getItem(key),
            identity,
            namespaceMarker: { key: markerKey, raw: markerRaw },
          });
    } catch {
      /* One disabled namespace cannot prevent the others. */
    }
  }
  return { buffers, observers: [...cleanupObservers] };
}

function discardSnapshot(
  snapshot: ReturnType<typeof capturePrivateBufferMarkers>,
  inactive: (original: OriginalSession | null) => boolean,
) {
  // Keep each namespace marker until its entries have been considered. A new
  // session may write identical values while the genuine reread is pending.
  const entries = snapshot.buffers.filter(
    (buffer) => buffer.namespaceMarker?.key !== buffer.key,
  );
  const markers = snapshot.buffers.filter(
    (buffer) => buffer.namespaceMarker?.key === buffer.key,
  );
  for (const buffer of [...entries, ...markers]) {
    if (!inactive(buffer.identity)) continue;
    try {
      if (
        buffer.namespaceMarker &&
        buffer.storage.getItem(buffer.namespaceMarker.key) !==
          buffer.namespaceMarker.raw
      )
        continue;
      // New W2 sessions have disjoint keys. Legacy values changed since the
      // snapshot are retained; they never authorize adoption or a request.
      if (buffer.storage.getItem(buffer.key) === buffer.raw)
        buffer.storage.removeItem(buffer.key);
    } catch {
      /* Disabled storage cannot restore these optional buffers. */
    }
  }
  for (const observer of snapshot.observers) {
    if (!cleanupObservers.has(observer) || !inactive(observer.original))
      continue;
    cleanupObservers.delete(observer);
    try {
      observer.discard();
    } catch {
      /* Independent private cleanup continues. */
    }
  }
}

/** Only a genuine canonical reread can establish an inactive original tuple.
 * Unknown responses are handled by the caller without reaching this function. */
export function discardInactivePrivateSessionBuffers(
  snapshot: ReturnType<typeof capturePrivateBufferMarkers>,
  current: OriginalSession | null,
) {
  discardSnapshot(
    snapshot,
    (original) =>
      current === null ||
      (original !== null && !sameSession(original, current)),
  );
}

/** A genuine original end cannot delete a replacement session's namespace. */
export function discardPrivateSessionBuffers(original: OriginalSession) {
  discardSnapshot(capturePrivateBufferMarkers(), (candidate) =>
    sameSession(candidate, original),
  );
}
