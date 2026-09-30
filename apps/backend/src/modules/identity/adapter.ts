import { z } from "zod";
import { DomainError } from "../../core/errors.js";

/** The adapter drops all parent-platform profile data at this boundary. */
const IdentityEnvelope = z.strictObject({
  accountId: z.uuid(),
  adultEligible: z.boolean(),
});
export type Actor = Readonly<z.infer<typeof IdentityEnvelope>>;
export interface PantopusIdentityAdapter {
  readonly mode?: "development" | "pantopus";
  readonly developmentActors?: readonly { id: string; label: string }[];
  beginSession(context: {
    returnTo: string;
    state?: string;
    continuationId?: string;
    codeChallenge?: string;
    reauthenticate?: boolean;
  }): Promise<{ redirectUrl: string }>;
  completeSession?(context: {
    code: string;
    state: string;
    codeVerifier?: string;
  }): Promise<{ token: string; authenticatedAt?: string }>;
  resolveSession(
    token: string,
  ): Promise<{ accountId: string; adultEligible: boolean }>;
}
export async function resolveActor(
  adapter: PantopusIdentityAdapter,
  token: string,
): Promise<Actor> {
  const actor = IdentityEnvelope.parse(await adapter.resolveSession(token));
  if (!actor.adultEligible)
    throw new DomainError(
      "adult_eligibility_required",
      "This app is available to adults aged 18 and over.",
    );
  return Object.freeze(actor);
}
