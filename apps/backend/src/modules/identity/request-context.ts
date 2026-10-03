import { querySettlementUncertain } from "../../core/query-settlement.js";

/** Restore request-local presentation/participant settings only after a known
 * result. This issues no authority and never settles/releases the caller's
 * client. An unknown response or real cancellation escapes without later SQL.
 * A completed refusal retains its original failure even if restoration fails.
 */
export async function withRequestContextRestore<T>(
  work: () => Promise<T>,
  restore: () => Promise<unknown>,
): Promise<T> {
  let result: T;
  try {
    result = await work();
  } catch (failure) {
    if (
      querySettlementUncertain(failure) ||
      (failure !== null &&
        typeof failure === "object" &&
        "name" in failure &&
        ["AbortError", "TimeoutError"].includes(String(failure.name)))
    )
      throw failure;
    try {
      await restore();
    } catch (cleanup) {
      throw new AggregateError(
        [failure, cleanup],
        "Original request check and context restoration failed.",
      );
    }
    throw failure;
  }
  await restore();
  return result;
}
