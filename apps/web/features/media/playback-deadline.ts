/** Actual server deadlines, with an elapsed-time bound against clock rollback. */
export type PlaybackDeadline = Readonly<{ wall: number; elapsed: number }>;

export function playbackDeadline(
  ticketExpiresAt: string,
  assetExpiresAt: string,
): PlaybackDeadline {
  const ticket = Date.parse(ticketExpiresAt),
    asset = Date.parse(assetExpiresAt),
    remaining = Math.min(ticket, asset) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0)
    throw new Error("The media link expired. Check current access again.");
  return {
    wall: Math.min(ticket, asset),
    elapsed: performance.now() + remaining,
  };
}

export function playbackUnexpired(deadline: PlaybackDeadline | null): boolean {
  return (
    deadline !== null &&
    Date.now() < deadline.wall &&
    performance.now() < deadline.elapsed
  );
}
