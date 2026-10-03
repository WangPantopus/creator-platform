import type { Notification, Pool, PoolClient } from "pg";
import { IdSchema } from "@qelvora/api";

/** Wakeups carry only an opaque aggregate ID. Durable, authorized replay is
 * always the source of frame content, cursors and control boundaries. */
export const threadFrameChannel = "creator_thread_frames";

export class ThreadFrameNotifications {
  private readonly subscribers = new Map<string, Set<() => void>>();
  private client?: PoolClient;
  private connecting = false;
  private closed = false;
  private retry?: ReturnType<typeof setTimeout>;
  private retryMs = 250;

  constructor(private readonly pool: Pool) {}

  subscribe(threadId: string, wake: () => void): () => void {
    IdSchema.parse(threadId);
    if (this.closed) throw new Error("Realtime is closed");
    let subscribers = this.subscribers.get(threadId);
    if (!subscribers) {
      subscribers = new Set();
      this.subscribers.set(threadId, subscribers);
    }
    subscribers.add(wake);
    void this.connect();
    const group = subscribers;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      group.delete(wake);
      if (!group.size) this.subscribers.delete(threadId);
      if (!this.subscribers.size) this.disconnect();
    };
  }

  close(): void {
    this.closed = true;
    this.subscribers.clear();
    this.disconnect();
  }

  private disconnect(): void {
    if (this.retry) clearTimeout(this.retry);
    this.retry = undefined;
    const client = this.client;
    this.client = undefined;
    // Destroy this dedicated LISTEN session; do not return its session-level
    // registration to the general query pool.
    client?.release(true);
  }

  private wake(threadId?: string): void {
    const groups = threadId
      ? [this.subscribers.get(threadId)]
      : this.subscribers.values();
    for (const subscribers of groups) {
      for (const callback of subscribers ?? []) {
        try {
          callback();
        } catch {
          // One closing subscriber cannot prevent another from catching up.
        }
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.closed || !this.subscribers.size || this.retry) return;
    this.retry = setTimeout(
      () => {
        this.retry = undefined;
        void this.connect();
      },
      this.retryMs + Math.floor(Math.random() * 100),
    );
    this.retry.unref();
    this.retryMs = Math.min(2000, this.retryMs * 2);
  }

  private async connect(): Promise<void> {
    if (this.closed || this.client || this.connecting || !this.subscribers.size)
      return;
    this.connecting = true;
    let acquired: PoolClient | undefined;
    try {
      acquired = await this.pool.connect();
      if (this.closed || !this.subscribers.size) {
        acquired.release(true);
        return;
      }
      const client = acquired;
      this.client = client;
      const failed = () => {
        if (this.client !== client) return;
        this.disconnect();
        this.scheduleReconnect();
      };
      client.on("error", failed);
      client.once("end", failed);
      client.on("notification", (notification: Notification) => {
        if (
          this.client !== client ||
          notification.channel !== threadFrameChannel
        )
          return;
        const thread = IdSchema.safeParse(notification.payload);
        if (thread.success) this.wake(thread.data);
      });
      // LISTEN commits before catch-up. Notifications before registration or
      // during a disconnected session are covered by a fresh durable replay.
      await client.query(`LISTEN ${threadFrameChannel}`);
      if (this.client === client) {
        this.retryMs = 250;
        this.wake();
      }
    } catch {
      if (acquired && this.client === acquired) this.disconnect();
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
      if (!this.client) this.scheduleReconnect();
    }
  }
}
