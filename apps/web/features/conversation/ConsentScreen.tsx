"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthorLabel, Button, Notice } from "@qelvora/ui-web";
import type {
  ConversationPage,
  ProviderPolicy,
} from "../../../../packages/api/src/conversation/contracts";
import { useConversationRequest } from "./api";
import "./conversation.css";
type Capabilities = {
  providers: ProviderPolicy | null;
  consentAvailable: boolean;
  generationAvailable: boolean;
  accessDisclosure: string;
};
export function ConsentScreen({
  creatorId,
  name,
  backHref,
}: {
  creatorId: string;
  name: string;
  backHref: string;
}) {
  const request = useConversationRequest();
  const router = useRouter();
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key] = useState(() =>
    typeof crypto === "undefined" ? "" : crypto.randomUUID(),
  );
  useEffect(() => {
    let active = true;
    void request<Capabilities>("capabilities")
      .then((value) => {
        if (active) setCapabilities(value);
      })
      .catch((error) => {
        if (active) setError(String(error.message));
      });
    return () => {
      active = false;
    };
  }, [request]);
  const begin = async () => {
    if (
      !capabilities?.providers?.verified ||
      !capabilities.consentAvailable ||
      !capabilities.generationAvailable ||
      busy
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const page = await request<ConversationPage>("begin", {
        creatorId,
        policyVersion: capabilities.providers.version,
        accessNoticeAccepted: true,
        idempotencyKey: key || crypto.randomUUID(),
      });
      router.replace(`/threads/${page.creatorId}/${page.fanId}`);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "This conversation is unavailable.",
      );
      setBusy(false);
    }
  };
  return (
    <main className="conversation-consent">
      <header className="conversation-actions">
        <a className="qv-icon-btn" aria-label="Back" href={backHref}>
          ‹
        </a>
        <span className="qv-meta">1 OF 1</span>
      </header>
      <div>
        <AuthorLabel kind="ai" name={name} />
        <h1>Before your first message</h1>
      </div>
      <article>
        <section>
          <span className="qv-meta">WHO RUNS IT</span>
          {capabilities?.providers ? (
            <>
              <p>
                Before your first message, {name}'s AI is powered by{" "}
                {capabilities.providers.providers.map((p) => p.name).join(", ")}
                .
              </p>
              {capabilities.providers.providers.map((provider) => (
                <p key={provider.name}>
                  <a href={provider.termsUrl}>
                    {provider.name} processing terms
                  </a>
                  {provider.noTraining
                    ? " · Doesn't train on your messages"
                    : " · Review how your messages are used"}
                  {provider.noRetention
                    ? " · Doesn't keep your messages"
                    : " · Review message retention"}
                </p>
              ))}
            </>
          ) : (
            <p>
              AI providers and their verified processing terms are not
              configured yet. Messaging is unavailable.
            </p>
          )}
        </section>
        <section>
          <span className="qv-meta">WHO CAN READ IT</span>
          <p>
            {capabilities?.accessDisclosure ??
              "Conversations with a creator's AI can be read by that creator and their authorized team. Those accesses are logged. You can delete any conversation at any time."}
          </p>
        </section>
        <section>
          <span className="qv-meta">WHAT IT REMEMBERS</span>
          <p>
            Only what you agree to. It asks first, and you can see and delete
            every memory in You.
          </p>
        </section>
      </article>
      {error && (
        <Notice tone="error" title="Conversation unavailable">
          {error}
        </Notice>
      )}
      <footer>
        <button
          className="qv-btn qv-btn--ai qv-btn--lg qv-btn--block"
          disabled={
            busy ||
            !capabilities?.consentAvailable ||
            !capabilities.generationAvailable
          }
          onClick={() => void begin()}
        >
          {busy ? "Starting…" : `Start with ${name}'s AI`}
        </button>
        <Button href={backHref} variant="quiet" block>
          Not now
        </Button>
      </footer>
    </main>
  );
}
