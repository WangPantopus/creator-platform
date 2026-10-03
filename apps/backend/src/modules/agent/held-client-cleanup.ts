import type { PoolClient } from "pg";

/** Cleanup grants no task, output or accounting authority. Keep the exact
 * borrowed client until rollback or destruction has actually settled. */
export async function releaseAgentHeldClient(
  client: PoolClient,
  input: { rollback: boolean; destroy: boolean; failure?: unknown },
): Promise<void> {
  let discard = input.destroy;
  let transportError: Error | undefined;
  const errors: unknown[] = [];
  const onError = (error: Error) => {
    transportError ??= error;
    discard = true;
  };
  client.on("error", onError);
  try {
    if (input.rollback && !discard) {
      try {
        await client.query("ROLLBACK");
      } catch (error) {
        discard = true;
        errors.push(error);
      }
    }
    if (transportError && !errors.includes(transportError))
      errors.push(transportError);
    if (discard) {
      try {
        await client.end();
      } catch (error) {
        errors.push(error);
      }
    }
  } finally {
    client.removeListener("error", onError);
    try {
      client.release(discard);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(
      input.failure === undefined ? errors : [input.failure, ...errors],
      "Agent held-client cleanup failed",
    );
}
