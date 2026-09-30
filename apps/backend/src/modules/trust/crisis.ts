import type { Pool } from "pg";
import { z } from "zod";

const Referral = z.strictObject({
  eventId: z.uuid(),
  day: z.iso.date(),
  region: z.string().regex(/^[A-Z]{2}(-[A-Z0-9]{1,8})?$/),
  protocolVersion: z.string().regex(/^[a-z0-9_-]{1,40}$/),
});
/** Called only after W2's classifier and resource delivery pipeline record a real referral. */
export async function recordCrisisReferral(
  pool: Pool,
  input: z.infer<typeof Referral>,
) {
  const value = Referral.parse(input);
  const result = await pool.query(
    `WITH fresh AS(INSERT INTO creator_trust.crisis_referral_event(event_id,day,region,protocol_version) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING *)
    INSERT INTO creator_trust.crisis_counter(day,region,protocol_version,referrals) SELECT day,region,protocol_version,1 FROM fresh
    ON CONFLICT(day,region,protocol_version) DO UPDATE SET referrals=creator_trust.crisis_counter.referrals+1 RETURNING referrals`,
    [value.eventId, value.day, value.region, value.protocolVersion],
  );
  return { counted: result.rowCount === 1 };
}
