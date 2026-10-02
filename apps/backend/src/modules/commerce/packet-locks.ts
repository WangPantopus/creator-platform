import type { PoolClient } from "pg";
import { DomainError } from "../../core/errors.js";

/** Resolve only the caller-visible binding and lock its packet first. A joined
 * FOR UPDATE OF c,p does not guarantee packet-before-commitment acquisition.
 * Callers still re-read and authorize the current commitment after this lock;
 * a missing binding grants nothing and retains their existing missing-row path.
 */
export async function lockCommitmentPacket(
  client: PoolClient,
  commitmentId: string,
) {
  await client.query(
    `SELECT p.id FROM creator.commerce_packet p
     JOIN creator.commerce_commitment c ON c.packet_id=p.id
      AND c.creator_id=p.creator_id AND c.fan_id=p.fan_id
     WHERE c.id=$1 FOR UPDATE OF p`,
    [commitmentId],
  );
}

/** Signing preparation is below held creator/domain authority. Never wait for
 * a packet writer there; a joined packet/commitment read lock has no fixed order.
 * The caller still verifies the exact current commitment after this lease.
 */
export async function tryLockCommitmentPacketForRead(
  client: PoolClient,
  commitmentId: string,
) {
  try {
    await client.query(
      `SELECT p.id FROM creator.commerce_packet p
       JOIN creator.commerce_commitment c ON c.packet_id=p.id
        AND c.creator_id=p.creator_id AND c.fan_id=p.fan_id
       WHERE c.id=$1 FOR SHARE OF p NOWAIT`,
      [commitmentId],
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "55P03"
    )
      throw new DomainError(
        "call_preparation_busy",
        "This call is changing. Refresh before signing times.",
        503,
      );
    throw error;
  }
}
