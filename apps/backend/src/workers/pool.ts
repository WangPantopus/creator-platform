import { invariant } from "../core/errors.js";
import {
  assertThreadScope,
  type ThreadScope,
} from "../modules/access/scope.js";

export const workerBudgets = {
  interactive: {
    connections: 20,
    concurrency: 16,
    queueCapacity: 128,
    perCreator: 4,
  },
  generation: {
    connections: 10,
    concurrency: 8,
    queueCapacity: 64,
    perCreator: 2,
  },
  ingestion: {
    connections: 4,
    concurrency: 2,
    queueCapacity: 16,
    perCreator: 1,
  },
} as const;
type Task = {
  scope: ThreadScope;
  run: () => Promise<void>;
  resolve: () => void;
  reject: (reason: unknown) => void;
};
/** Each runtime instantiates its own budget; no shared unbounded generation queue. */
export class BoundedWorkerPool {
  private readonly waiting: Task[] = [];
  private readonly byCreator = new Map<string, number>();
  private running = 0;
  constructor(
    private readonly limits: {
      concurrency: number;
      queueCapacity: number;
      perCreator: number;
    },
  ) {}
  enqueue(scope: ThreadScope, run: () => Promise<void>): Promise<void> {
    assertThreadScope(scope);
    invariant(
      this.waiting.length < this.limits.queueCapacity,
      "worker_queue_full",
      "The worker queue is full.",
    );
    return new Promise<void>((resolve, reject) => {
      this.waiting.push({ scope, run, resolve, reject });
      this.drain();
    });
  }
  private drain(): void {
    while (this.running < this.limits.concurrency) {
      const index = this.waiting.findIndex(
        (task) =>
          (this.byCreator.get(task.scope.creatorId) ?? 0) <
          this.limits.perCreator,
      );
      if (index < 0) return;
      const task = this.waiting.splice(index, 1)[0]!;
      this.running++;
      this.byCreator.set(
        task.scope.creatorId,
        (this.byCreator.get(task.scope.creatorId) ?? 0) + 1,
      );
      void task
        .run()
        .then(task.resolve, task.reject)
        .finally(() => {
          this.running--;
          this.byCreator.set(
            task.scope.creatorId,
            (this.byCreator.get(task.scope.creatorId) ?? 1) - 1,
          );
          this.drain();
        });
    }
  }
}
