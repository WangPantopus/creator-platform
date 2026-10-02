import type { PoolClient } from "pg";

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
