import type {
  ConnectedInterval,
  SessionOutcome,
} from "../../../../../packages/api/src/session.js";

type Interval = { start: number; end: number };
/** Sort and merge provider intervals before intersection: duplicate/reordered events add no time. */
function union(
  values: ConnectedInterval[],
  start: number,
  end: number,
): Interval[] {
  const sorted = values
    .map((value) => ({
      start: Math.max(start, Date.parse(value.start)),
      end: Math.min(end, Date.parse(value.end)),
    }))
    .filter(
      (value) =>
        Number.isFinite(value.start) &&
        Number.isFinite(value.end) &&
        value.end > value.start,
    )
    .sort((a, b) => a.start - b.start);
  const result: Interval[] = [];
  for (const value of sorted) {
    const prior = result.at(-1);
    if (prior && value.start <= prior.end)
      prior.end = Math.max(prior.end, value.end);
    else result.push({ ...value });
  }
  return result;
}
export function calculateClocks(input: {
  creator: ConnectedInterval[];
  fan: ConnectedInterval[];
  scheduledAt: string;
  measuredUntil: string;
  durationSeconds: number;
  hardEndAt: string;
  reconnectBudgetSeconds?: number;
}) {
  const start = Date.parse(input.scheduledAt);
  const end = Math.min(
    Date.parse(input.measuredUntil),
    Date.parse(input.hardEndAt),
  );
  const creator = union(input.creator, start, end);
  const fan = union(input.fan, start, end);
  const connected: Interval[] = [];
  let a = 0;
  let b = 0;
  while (a < creator.length && b < fan.length) {
    const x = creator[a]!;
    const y = fan[b]!;
    const begin = Math.max(x.start, y.start);
    const finish = Math.min(x.end, y.end);
    if (finish > begin) connected.push({ start: begin, end: finish });
    if (x.end < y.end) a++;
    else b++;
  }
  // Never count initial waiting or pre-appointment media as reconnect time.
  let consumed = 0;
  let reconnect = 0;
  const budget = (input.reconnectBudgetSeconds ?? 180) * 1000;
  let exhaustedAt: number | null = null;
  const bounded: Interval[] = [];
  for (const interval of connected) {
    const prior = bounded.at(-1);
    if (prior) {
      const gap = Math.max(0, interval.start - prior.end);
      const remaining = Math.max(0, budget - reconnect);
      reconnect += Math.min(gap, remaining);
      if (gap >= remaining) {
        exhaustedAt = prior.end + remaining;
        break;
      }
    }
    const length = Math.min(
      interval.end - interval.start,
      input.durationSeconds * 1000 - consumed,
    );
    if (length <= 0) break;
    bounded.push({ start: interval.start, end: interval.start + length });
    consumed += length;
  }
  const last = bounded.at(-1);
  if (last && consumed < input.durationSeconds * 1000 && exhaustedAt === null) {
    const gap = Math.max(0, end - last.end);
    const remaining = Math.max(0, budget - reconnect);
    reconnect += Math.min(gap, remaining);
    if (gap >= remaining) exhaustedAt = last.end + remaining;
  }
  return {
    connectedMilliseconds: consumed,
    reconnectUsedMilliseconds: reconnect,
    reconnectExhaustedAt:
      exhaustedAt === null ? null : new Date(exhaustedAt).toISOString(),
    connectedIntervals: bounded.map((value) => ({
      start: new Date(value.start).toISOString(),
      end: new Date(value.end).toISOString(),
    })),
    creatorPresentByGrace: creator.some((value) => value.start < end),
    fanPresentByGrace: fan.some((value) => value.start < end),
  };
}
export function determineOutcome(input: {
  connectedMilliseconds: number;
  durationSeconds: number;
  endedBy: "creator" | "fan" | "timer" | "failure";
  fanEndedByChoice: boolean;
  creatorJoinedByGrace: boolean;
  fanJoinedByGrace: boolean;
  graceElapsed: boolean;
}): SessionOutcome | null {
  if (!input.connectedMilliseconds && input.graceElapsed) {
    // Both absent has no approved source rule; keep evidence unresolved for W4/W8 decision.
    if (!input.creatorJoinedByGrace && !input.fanJoinedByGrace) return null;
    if (!input.creatorJoinedByGrace) return "creator_no_show";
    if (!input.fanJoinedByGrace) return "fan_no_show";
  }
  if (input.connectedMilliseconds <= 0) return "technical_failure";
  if (input.endedBy === "fan" && input.fanEndedByChoice) return "completed";
  if (input.connectedMilliseconds >= input.durationSeconds * 800)
    return "completed";
  if (input.endedBy === "creator") return "partial";
  return "technical_failure";
}
