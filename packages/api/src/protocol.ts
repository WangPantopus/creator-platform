import type { Frame } from "./schemas.ts";

export type ThreadDeliverySnapshot = Readonly<{
  threadId: string;
  cursor: number;
  epoch: number;
  generationSequences: Readonly<Record<string, number>>;
}>;

/** A device owns one state per thread. Replay must include every committed cursor. */
export class ThreadDeliveryGate {
  private renderedCursor = 0;
  private renderedEpoch = 0;
  private readonly pending = new Map<number, Frame>();
  private readonly generationSequences = new Map<string, number>();

  constructor(
    private readonly threadId: string,
    cursor = 0,
    epoch = 0,
    generationSequences: Readonly<Record<string, number>> = {},
  ) {
    if (
      !Number.isSafeInteger(cursor) ||
      cursor < 0 ||
      !Number.isSafeInteger(epoch) ||
      epoch < 0
    )
      throw new Error("Invalid delivery snapshot");
    this.renderedCursor = cursor;
    this.renderedEpoch = epoch;
    for (const [id, sequence] of Object.entries(generationSequences)) {
      if (!Number.isSafeInteger(sequence) || sequence < 0)
        throw new Error("Invalid generation snapshot");
      this.generationSequences.set(id, sequence);
    }
  }

  get cursor(): number {
    return this.renderedCursor;
  }
  get epoch(): number {
    return this.renderedEpoch;
  }
  snapshot(): ThreadDeliverySnapshot {
    return Object.freeze({
      threadId: this.threadId,
      cursor: this.renderedCursor,
      epoch: this.renderedEpoch,
      generationSequences: Object.freeze(
        Object.fromEntries(this.generationSequences),
      ),
    });
  }

  receive(frame: Frame): Frame[] {
    if (frame.threadId !== this.threadId)
      throw new Error("Wrong thread channel");
    if (frame.cursor <= this.renderedCursor) return [];
    // Missing cursors are fetched on reconnect; never render around an unseen boundary.
    if (this.pending.size >= 1024 && !this.pending.has(frame.cursor))
      throw new Error("Replay required");
    this.pending.set(frame.cursor, frame);
    const visible: Frame[] = [];
    // A rejected drain must not consume earlier frames that the caller never receives.
    let cursor = this.renderedCursor;
    let epoch = this.renderedEpoch;
    const consumed: number[] = [];
    const sequences = new Map<string, number>();
    while (true) {
      const next = this.pending.get(cursor + 1);
      if (!next) break;
      if (next.epoch > epoch && next.kind !== "control") break;
      if (
        next.epoch >= epoch &&
        next.generationId &&
        next.kind === "sentence"
      ) {
        const last =
          sequences.get(next.generationId) ??
          this.generationSequences.get(next.generationId) ??
          0;
        if (next.sequence > last + 1)
          throw new Error("Generation replay required");
      }
      consumed.push(next.cursor);
      cursor = next.cursor;
      if (next.epoch < epoch) continue;
      if (next.kind === "control") {
        epoch = next.epoch;
        visible.push(next);
        continue;
      }
      if (next.generationId && next.kind === "sentence") {
        const last =
          sequences.get(next.generationId) ??
          this.generationSequences.get(next.generationId) ??
          0;
        if (next.sequence <= last) continue;
        sequences.set(next.generationId, next.sequence);
      }
      visible.push(next);
    }
    for (const accepted of consumed) this.pending.delete(accepted);
    this.renderedCursor = cursor;
    this.renderedEpoch = epoch;
    for (const [generation, sequence] of sequences)
      this.generationSequences.set(generation, sequence);
    return visible;
  }
}
