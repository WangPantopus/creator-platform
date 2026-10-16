import pg from "pg";

/** Accepted fan work is announced here when its accepting transaction
 * commits. The payload is empty: a wakeup grants nothing, and the worker's own
 * discovery and claim remain the only authority over what runs. */
export const generationQueuedChannel = "creator_generation_queued";

/** One dedicated LISTEN session on the worker's own login. It reconnects with
 * backoff and wakes the worker once after every (re)connect, so work accepted
 * while it was disconnected is found by ordinary discovery. */
export class GenerationWake {
  private client?: pg.Client;
  private connecting = false;
  private closed = false;
  private retry?: ReturnType<typeof setTimeout>;
  private retryMs = 250;

  constructor(
    private readonly connectionString: string,
    private readonly wake: () => void,
  ) {}

  /** Whether accepted work currently reaches the worker without polling. */
  get listening(): boolean {
    return Boolean(this.client);
  }

  start(): void {
    void this.connect();
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    this.retry = undefined;
    const client = this.client;
    this.client = undefined;
    await client?.end().catch(() => {});
  }

  private scheduleReconnect(): void {
    if (this.closed || this.retry) return;
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
    if (this.closed || this.client || this.connecting) return;
    this.connecting = true;
    const client = new pg.Client({
      connectionString: this.connectionString,
      connectionTimeoutMillis: 5000,
    });
    const failed = () => {
      if (this.client === client) this.client = undefined;
      void client.end().catch(() => {});
      this.scheduleReconnect();
    };
    client.on("error", failed);
    client.once("end", failed);
    client.on("notification", (notification) => {
      if (
        this.client === client &&
        notification.channel === generationQueuedChannel
      )
        this.wake();
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${generationQueuedChannel}`);
      if (this.closed) {
        await client.end().catch(() => {});
        return;
      }
      this.client = client;
      this.retryMs = 250;
      // Covers anything accepted before this session was listening.
      this.wake();
    } catch {
      // Never include a connection string or driver error in diagnostics.
      await client.end().catch(() => {});
      this.scheduleReconnect();
    } finally {
      this.connecting = false;
    }
  }
}
