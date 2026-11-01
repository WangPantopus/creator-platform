import type { ReactNode } from "react";
import { brand } from "@qelvora/brand";
import { AuthorLabel } from "@qelvora/ui-web";
import {
  DEVELOPMENT_LICENSE_TERMS,
  developmentProofReference,
} from "../../../../packages/api/src/agent/contracts";
import { Button, Field, Panel } from "./shared";
import type { CreatorAIView } from "./useCreatorAI";

export function LicenseScreen({
  ai,
  state,
  studioHeader,
}: {
  ai: CreatorAIView;
  state: NonNullable<CreatorAIView["state"]>;
  studioHeader: ReactNode;
}) {
  const {
    action,
    aliases,
    api,
    controlsDisabled,
    setAliases,
    setConfirmation,
    setSponsorBrand,
    setSponsorExpiry,
    sponsorBrand,
    sponsorExpiry,
  } = ai;
  return (
    <div className="w2-two-grid">
      <section className="w2-list">
        {studioHeader}
        <Panel
          title={
            state.license?.counselVersion === DEVELOPMENT_LICENSE_TERMS
              ? `DEVELOPMENT LICENSE · NOT REVIEWED · ${state.license.state}`
              : state.license
                ? `LICENSE · ${state.license.state}`
                : state.capabilities.syntheticLicensing
                  ? "DEVELOPMENT LICENSE · NOT RECORDED"
                  : "LICENSE · REVIEWED TERMS REQUIRED"
          }
        >
          <span>
            Your AI speaks only on {brand.name}, only under the label “
            {state.creator.name}’s AI”.
          </span>
          <span>
            Source permission and provider data policy are checked before use.
          </span>
          <span>You can pause your AI at any time.</span>
          <span>
            AI voice is off. Turning it on needs a separate consent recording.
          </span>
          {state.license ? (
            <>
              <p>
                {state.license.counselVersion === DEVELOPMENT_LICENSE_TERMS
                  ? "Synthetic terms for a fictional development creator. Counsel has not reviewed them, nothing was signed, and real fans, payments and AI voice stay off."
                  : `Reviewed terms: ${state.license.counselVersion}`}
              </p>
              <p>
                Term ends {new Date(state.license.termEndsAt).toLocaleString()}
              </p>
              <p>Permitted uses: {state.license.permittedUses.join(", ")}</p>
            </>
          ) : state.capabilities.syntheticLicensing ? (
            <>
              <p className="qv-help">
                This loopback host can record a labeled development license so a
                fictional creator’s AI can be tested end to end. It is not a
                reviewed license, carries no signature and never applies to real
                fans.
              </p>
              <Button
                disabled={
                  controlsDisabled || state.creator.verification !== "verified"
                }
                onClick={() =>
                  void action(async () => {
                    await api("license", {
                      proofReference: developmentProofReference(
                        state.creator.id,
                      ),
                      counselVersion: DEVELOPMENT_LICENSE_TERMS,
                      permittedUses: ["sponsored_mentions", "text_ai"],
                      termEndsAt: new Date(
                        Date.now() + 90 * 86_400_000,
                      ).toISOString(),
                    });
                  }, "Development license recorded for 90 days.")
                }
              >
                Record development license
              </Button>
              {state.creator.verification !== "verified" && (
                <span className="qv-help">
                  Creator verification is pending.
                </span>
              )}
            </>
          ) : (
            <p className="qv-help">
              Reviewed license terms and creator signing are required before
              publication.
            </p>
          )}
        </Panel>
        <Button
          disabled={controlsDisabled}
          onClick={() =>
            setConfirmation({
              title: "Pause my AI",
              confirm: "Pause my AI",
              body: "Generation stops. Any pending commitments remain visible until their refunds are confirmed.",
              run: async () => {
                await api("pause");
              },
            })
          }
        >
          Pause my AI
        </Button>
        <span className="qv-help">
          License renewal requires your signature on the exact reviewed terms.
        </span>
      </section>
      <section className="w2-list">
        <span className="qv-meta">SPONSORSHIPS</span>
        {state.sponsors.map((sponsor) => (
          <Panel key={sponsor.id} title={sponsor.brand}>
            <span className="qv-badge qv-ink-ai">
              {sponsor.active && Date.parse(sponsor.expiresAt) > Date.now()
                ? `Active until ${new Date(sponsor.expiresAt).toLocaleDateString()}`
                : "Inactive"}
            </span>
            <p className="qv-help">
              Your AI may mention this sponsor when it answers the question.
              Every such reply carries the disclosure.
            </p>
            <div className="w2-live">
              <AuthorLabel kind="ai" name={state.creator.name} />
              <p>
                Paid partnership: {state.creator.name} is paid by{" "}
                {sponsor.brand}.
              </p>
            </div>
            <Button
              variant="quiet"
              disabled={controlsDisabled}
              onClick={() =>
                void action(async () => {
                  await api("sponsors", {
                    brand: sponsor.brand,
                    aliases: sponsor.aliases,
                    expiresAt: sponsor.expiresAt,
                    active: !sponsor.active,
                  });
                }, "Sponsor registry updated.")
              }
            >
              {sponsor.active ? "Deactivate sponsor" : "Activate sponsor"}
            </Button>
          </Panel>
        ))}
        <Panel title="ADD A SPONSOR">
          <form
            className="w2-form"
            onSubmit={(e) => {
              e.preventDefault();
              void action(async () => {
                await api("sponsors", {
                  brand: sponsorBrand,
                  aliases: aliases
                    .split(",")
                    .map((a) => a.trim())
                    .filter(Boolean),
                  expiresAt: new Date(sponsorExpiry).toISOString(),
                  active: true,
                });
                setSponsorBrand("");
                setAliases("");
              }, "Sponsor saved; mentions carry the paid-partnership disclosure.");
            }}
          >
            <Field label="Sponsor brand">
              <input
                required
                value={sponsorBrand}
                maxLength={80}
                onChange={(e) => setSponsorBrand(e.target.value)}
              />
            </Field>
            <Field label="Aliases (comma separated)">
              <input
                value={aliases}
                onChange={(e) => setAliases(e.target.value)}
              />
            </Field>
            <Field label="Sponsorship expiry">
              <input
                required
                type="datetime-local"
                value={sponsorExpiry}
                onChange={(e) => setSponsorExpiry(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={controlsDisabled}>
              Add a sponsor
            </Button>
          </form>
        </Panel>
      </section>
    </div>
  );
}
