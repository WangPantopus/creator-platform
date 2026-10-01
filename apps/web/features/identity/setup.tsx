"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { brand } from "@qelvora/brand";
import { Notice } from "@qelvora/ui-web";
import { ProofSchema, type Session } from "@qelvora/api";
import { registerPasskey } from "./passkey";
import { useIdentityRequest } from "./session-boundary";

class IdentityActionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function identityAction(
  request: ReturnType<typeof useIdentityRequest>["request"],
  path: string,
  body?: unknown,
) {
  const response = await request(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  }).catch(() => {
    throw new IdentityActionError(
      "The service is unavailable. Your input has been kept; try again.",
      503,
      "service_unavailable",
    );
  });
  const data = await response.json();
  if (!response.ok)
    throw new IdentityActionError(
      data.error?.message ?? "This action is unavailable.",
      response.status,
      data.error?.code,
    );
  return data;
}
export function CreatorSetup({ initial }: { initial: Session }) {
  const identity = useIdentityRequest();
  const action = useCallback(
    (path: string, body?: unknown) =>
      identityAction(identity.request, path, body),
    [identity.request],
  );
  const [creator, setCreator] = useState(initial.creator);
  const [name, setName] = useState(creator?.displayName ?? "");
  const [handle, setHandle] = useState(creator?.handle ?? "");
  const [platform, setPlatform] = useState("instagram");
  const [account, setAccount] = useState("");
  const [post, setPost] = useState("");
  const [proof, setProof] = useState<ReturnType<
    typeof ProofSchema.parse
  > | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [proofRead, setProofRead] = useState<{
    creatorId: string | null;
    status: "loading" | "ready" | "unavailable";
  }>({ creatorId: null, status: "loading" });
  const [proofRetry, setProofRetry] = useState(0);
  const proofFocus = useRef<HTMLButtonElement | null>(null);
  const proofRetryFocus = useRef<HTMLButtonElement | null>(null);
  const proofAccountFocus = useRef<HTMLInputElement | null>(null);
  const restoreProofFocus = useRef(false);
  const proofReady =
    !!creator &&
    proofRead.creatorId === creator.id &&
    proofRead.status === "ready";
  const proofUnavailable =
    !!creator &&
    proofRead.creatorId === creator.id &&
    proofRead.status === "unavailable";
  const proofExpired =
    !!proof && new Date(proof.expiresAt).getTime() <= Date.now();
  const proofAccountBound =
    proofReady &&
    !!proof &&
    !proofExpired &&
    ["challenge", "pending"].includes(proof.state);
  useEffect(() => {
    if (
      !restoreProofFocus.current ||
      busy ||
      (!proofReady && !proofUnavailable)
    )
      return;
    restoreProofFocus.current = false;
    const button = proofReady ? proofFocus.current : proofRetryFocus.current;
    if (
      button?.isConnected &&
      !identity.signal.aborted &&
      !document.hidden &&
      document.activeElement === document.body
    )
      button.focus();
  }, [busy, proofReady, proofUnavailable, identity.signal]);
  useEffect(() => {
    const current = identity.session.creator;
    if (
      current &&
      (!creator ||
        current.id !== creator.id ||
        current.version > creator.version ||
        current.verification !== creator.verification)
    )
      setCreator(current);
  }, [identity.session.creator, creator]);
  useEffect(() => {
    let active = true;
    const creatorId = creator?.id;
    if (creatorId) {
      setProofRead({ creatorId, status: "loading" });
      action(`${creatorId}/proof`)
        .then((value) => {
          if (active) {
            setProof(ProofSchema.parse(value));
            setPlatform(value.platform);
            setAccount(value.accountUrl);
            setProofRead({ creatorId, status: "ready" });
          }
        })
        .catch((error: unknown) => {
          if (!active || identity.signal.aborted) return;
          if (
            error instanceof IdentityActionError &&
            error.status === 404 &&
            error.code === "proof_not_found"
          ) {
            setProof(null);
            setProofRead({ creatorId, status: "ready" });
          } else setProofRead({ creatorId, status: "unavailable" });
        });
    }
    return () => {
      active = false;
    };
  }, [creator?.id, creator?.version, action, identity.signal, proofRetry]);
  const perform = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not complete. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  const steps = [
    "Continue with Pantopus",
    "Prove it’s you",
    "A passkey for signing",
    "Your license to your AI",
    "A 15-minute interview in your voice",
    "Sources, style, rules, tests",
  ];
  return (
    <main className="creator-setup qv">
      <aside className="qv-on-maya setup-rail">
        <span>{brand.studioName}</span>
        <h1>An AI that speaks for you only as far as you allow.</h1>
        <p>
          It learns from what you've published, answers under its own label, and
          hands fans to you when they need you. Nothing goes live until you've
          read its tests.
        </p>
        <ol>
          {steps.map((title, index) => (
            <li className={index > 1 ? "todo" : undefined} key={title}>
              <span
                className={index < 1 ? "done" : index === 1 ? "now" : "todo"}
              >
                {index + 1}
              </span>
              {title}
            </li>
          ))}
        </ol>
      </aside>
      <section className="setup-content">
        {identity.session.mode === "development" && (
          <Notice title="Development identity">
            Synthetic local account. External proof is not approved and cannot
            activate a public AI.
          </Notice>
        )}
        {!creator ? (
          <>
            <span className="qv-meta">CONTINUE SETTING UP</span>
            <h2>Your public creator identity</h2>
            <Notice title="Draft setup stays private">
              External proof must be approved before you register a signing
              passkey. Your AI cannot become public while identity is pending.
            </Notice>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                perform(async () =>
                  setCreator(
                    await action("creator-profile", {
                      handle,
                      displayName: name,
                    }),
                  ),
                );
              }}
            >
              <label className="qv-field__label" htmlFor="creator-name">
                Creator name
              </label>
              <input
                id="creator-name"
                className="qv-input"
                required
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <label className="qv-field__label" htmlFor="creator-handle">
                Public handle
              </label>
              <input
                id="creator-handle"
                className="qv-input"
                required
                pattern="@?[a-zA-Z0-9_]{3,30}"
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
              />
              <button
                disabled={busy}
                className="qv-btn qv-btn--secondary qv-btn--lg"
              >
                Continue
              </button>
            </form>
          </>
        ) : (
          <>
            <span className="qv-meta">STEP 2 OF 6 · PROVE IT'S YOU</span>
            <h2>
              Post this code from your{" "}
              {platform === "instagram" ? "Instagram" : "YouTube"}
            </h2>
            <p>
              {identity.session.mode === "development" ? (
                "This synthetic account does not verify a real person's identity. Local proof challenges are for development only."
              ) : (
                <>
                  Your Pantopus account proves you're a person. This proves
                  you're the {creator.displayName} your fans already follow.
                  Post the code in a story or a caption; you can delete it once
                  we've seen it.
                </>
              )}
            </p>
            {proofReady && proof && proof.state === "challenge" && (
              <div className="proof-code">
                <span>{proof.code}</span>
                <button
                  type="button"
                  className="qv-btn qv-btn--secondary"
                  onClick={() =>
                    perform(async () => {
                      await navigator.clipboard.writeText(proof.code);
                      setNotice("Code copied.");
                    })
                  }
                >
                  Copy code
                </button>
              </div>
            )}
            <div className="qv-field">
              <label className="qv-field__label" htmlFor="proof-account">
                Your account
              </label>
              <input
                id="proof-account"
                ref={proofAccountFocus}
                className="qv-input"
                disabled={busy || !proofReady}
                readOnly={proofAccountBound}
                aria-describedby={
                  proofAccountBound ? "proof-account-hint" : undefined
                }
                placeholder={
                  platform === "instagram"
                    ? "https://instagram.com/your_handle"
                    : "https://youtube.com/@your_handle"
                }
                value={
                  proofAccountBound ? (proof?.accountUrl ?? account) : account
                }
                onChange={(event) => setAccount(event.target.value)}
              />
              {proofAccountBound && (
                <p id="proof-account-hint" className="qv-field__hint">
                  This code applies to the saved account. Start a new proof
                  request to use a different account.
                </p>
              )}
            </div>
            <Notice title="Proof is reviewed before signing">
              The proof code is saved with your verification request. Signing
              stays disabled until your request is approved.
            </Notice>
            {!proofReady && (
              <Notice
                title={
                  proofUnavailable
                    ? "Verification status unavailable"
                    : "Loading verification status"
                }
                tone={proofUnavailable ? "offline" : undefined}
              >
                {proofUnavailable
                  ? "Reconnect and reload your saved verification request before continuing. Your draft setup is kept."
                  : "Checking your saved verification request before continuing."}
              </Notice>
            )}
            {proofUnavailable && (
              <button
                type="button"
                ref={proofRetryFocus}
                className="qv-btn qv-btn--secondary"
                disabled={busy}
                onClick={(event) => {
                  restoreProofFocus.current =
                    document.activeElement === event.currentTarget;
                  setError("");
                  setProofRetry((attempt) => attempt + 1);
                }}
              >
                Retry verification status
              </button>
            )}
            {proofReady && proof?.state === "challenge" && (
              <div className="qv-field">
                <label className="qv-field__label" htmlFor="proof-post">
                  Post URL
                </label>
                <input
                  id="proof-post"
                  className="qv-input"
                  type="url"
                  value={post}
                  onChange={(event) => setPost(event.target.value)}
                />
              </div>
            )}
            {proofAccountBound && (
              <button
                type="button"
                className="qv-btn qv-btn--quiet"
                disabled={busy}
                onClick={() => {
                  setProof(null);
                  setAccount("");
                  setPost("");
                  setError("");
                  setNotice("Enter the account for a new proof code.");
                  proofAccountFocus.current?.focus();
                }}
              >
                Use a different account
              </button>
            )}
            <div className="proof-actions">
              <button
                ref={proof ? undefined : proofFocus}
                disabled={
                  busy ||
                  !proofReady ||
                  (proof?.state === "pending" && !proofExpired)
                }
                className="qv-btn qv-btn--secondary qv-btn--lg"
                onClick={() =>
                  perform(async () => {
                    if (
                      !proof ||
                      ["rejected", "revoked", "approved"].includes(
                        proof.state,
                      ) ||
                      proofExpired
                    ) {
                      setProof(
                        ProofSchema.parse(
                          await action(`${creator.id}/proof`, {
                            platform,
                            accountUrl: account,
                          }),
                        ),
                      );
                    } else {
                      setProof(
                        ProofSchema.parse(
                          await action(`proof/${proof.id}/submit`, {
                            postUrl: post,
                          }),
                        ),
                      );
                      setNotice(
                        "Submitted for manual review. Draft setup stays usable; nothing public is activated.",
                      );
                    }
                  })
                }
              >
                {!proof ||
                proofExpired ||
                ["rejected", "revoked", "approved"].includes(proof.state)
                  ? "Create proof code"
                  : "I've posted it · check now"}
              </button>
              <button
                disabled={busy || !proofReady}
                className="qv-btn qv-btn--quiet"
                onClick={() => {
                  setPlatform(
                    platform === "instagram" ? "youtube" : "instagram",
                  );
                  setProof(null);
                  setAccount("");
                  setPost("");
                }}
              >
                {platform === "instagram"
                  ? "Use YouTube instead"
                  : "Use Instagram instead"}
              </button>
            </div>
            {proofReady && proof && (
              <>
                <Notice
                  title={`Verification ${proofExpired ? "expired" : proof.state}`}
                >
                  {proofExpired
                    ? "Create a fresh proof code to continue. Your draft setup is kept."
                    : (proof.reason ??
                      (proof.state === "pending"
                        ? "Your proof is awaiting manual review. This status is separate from payout-provider identity checks."
                        : "Creator identity is checked independently of payout-provider identity checks."))}
                </Notice>
                <button
                  ref={proofFocus}
                  className="qv-btn qv-btn--quiet"
                  disabled={busy}
                  onClick={(event) => {
                    restoreProofFocus.current =
                      document.activeElement === event.currentTarget;
                    return perform(async () => {
                      setProofRead({
                        creatorId: creator.id,
                        status: "loading",
                      });
                      try {
                        const [freshProof, freshSession] = await Promise.all([
                          action(`${creator.id}/proof`),
                          action("session"),
                        ]);
                        setProof(ProofSchema.parse(freshProof));
                        setPlatform(freshProof.platform);
                        setCreator(freshSession.creator);
                        setProofRead({
                          creatorId: creator.id,
                          status: "ready",
                        });
                      } catch (error) {
                        if (!identity.signal.aborted)
                          setProofRead({
                            creatorId: creator.id,
                            status: "unavailable",
                          });
                        throw error;
                      }
                    });
                  }}
                >
                  Refresh verification status
                </button>
              </>
            )}
            <div className="passkey-controls">
              <h3>A passkey for signing</h3>
              <button
                disabled={
                  busy || !proofReady || creator.verification !== "verified"
                }
                className="qv-btn qv-btn--secondary"
                onClick={() =>
                  perform(async () => {
                    const begin = await action("passkeys/begin", {});
                    try {
                      const credential = await registerPasskey(
                        begin.options,
                        identity.signal,
                      );
                      await action("passkeys/register", {
                        challengeId: begin.challengeId,
                        credential,
                      });
                      setNotice(
                        "Passkey registered. Each named act still needs a fresh exact-content assertion.",
                      );
                    } catch (error) {
                      await action(
                        `passkeys/${begin.challengeId}/cancel`,
                        {},
                      ).catch(() => {});
                      throw error;
                    }
                  })
                }
              >
                Register a signing passkey
              </button>
              <details>
                <summary>Lost your signing device?</summary>
                <Notice title="Recovery stops named acts">
                  All existing signing keys are revoked. Continue with Pantopus
                  again and submit fresh external creator proof before
                  registering a replacement.
                </Notice>
                <button
                  disabled={busy}
                  className="qv-btn qv-btn--secondary"
                  onClick={() =>
                    perform(async () => {
                      await action("passkeys/recovery", {});
                      const updated = await action("session");
                      setCreator(updated.creator);
                      setNotice(
                        "Recovery started. Reconnect your Pantopus account, then submit fresh external creator proof.",
                      );
                    })
                  }
                >
                  Start signing-key recovery
                </button>
              </details>
            </div>
            <a href="/studio/ai" className="qv-btn qv-btn--quiet">
              Continue draft AI setup
            </a>
          </>
        )}
        {error && (
          <div role="alert">
            <Notice tone="error" title="Action unavailable">
              {error}
            </Notice>
          </div>
        )}
        {notice && (
          <div role="status">
            <Notice title="Status">{notice}</Notice>
          </div>
        )}
      </section>
    </main>
  );
}
