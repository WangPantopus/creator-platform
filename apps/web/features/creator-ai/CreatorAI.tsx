"use client";
import Link from "next/link";
import { brand } from "@qelvora/brand";
import { Avatar, Mark, Notice, Skeleton, Toast } from "@qelvora/ui-web";
import { Button, type CreatorAIIdentity, Glyph, tabs } from "./shared";
import { OverviewScreen } from "./OverviewScreen";
import { SourcesScreen } from "./SourcesScreen";
import { StyleScreen } from "./StyleScreen";
import { TestScreen } from "./TestScreen";
import { LicenseScreen } from "./LicenseScreen";
import { InterviewScreen } from "./InterviewScreen";
import { useCreatorAI } from "./useCreatorAI";
import "./creator-ai.css";

export function CreatorAI({
  section,
  creatorId,
  identity,
}: {
  section: string;
  creatorId?: string;
  identity?: CreatorAIIdentity;
}) {
  const ai = useCreatorAI({ section, creatorId, identity });
  const {
    action,
    busy,
    configuration,
    confirmation,
    confirmationVisible,
    current,
    destination,
    dialog,
    dirty,
    error,
    errorNotice,
    fetchState,
    message,
    navNames,
    navigate,
    online,
    setConfirmation,
    state,
    studioHeading,
    titleFor,
    versionNumber,
  } = ai;
  const studioHeader = (
    <header className="w2-header">
      <div>
        <span className="qv-meta">
          {current === "license"
            ? "YOUR LICENSE TO YOUR AI"
            : current === "overview"
              ? "CREATOR STUDIO"
              : `MY AI${dirty ? " · UNSAVED DRAFT" : ""}`}
        </span>
        <h1 ref={studioHeading} tabIndex={-1}>
          {titleFor[current]}
        </h1>
      </div>
      {![
        "overview",
        "license",
        "interview",
        "onboard",
        "test",
        "versions",
      ].includes(current) && (
        <nav className="w2-segments" aria-label="My AI sections">
          {tabs.map((tab) => (
            <Link
              key={tab}
              href={`/studio/ai/${tab.toLowerCase()}`}
              onClick={(e) => navigate(e, `/studio/ai/${tab.toLowerCase()}`)}
              aria-current={current === tab.toLowerCase() ? "page" : undefined}
            >
              {tab}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
  return (
    <div className="qv w2-studio">
      <aside className="w2-sidebar">
        <nav className="qv-side" aria-label="Studio">
          <div className="qv-side__who">
            <Avatar initial={state?.creator.name.charAt(0) ?? "C"} />
            <div>
              <strong>{state?.creator.name ?? "Creator Studio"}</strong>
              <div className="qv-side__product">{brand.studioName}</div>
            </div>
          </div>
          <div className="qv-side__group">
            {navNames.slice(0, 4).map((name) => (
              <Link
                key={name}
                href={destination(name)}
                onClick={(e) => navigate(e, destination(name))}
                className={`qv-side__item ${name === "My AI" ? "is-active" : ""}`}
                aria-current={name === "My AI" ? "page" : undefined}
              >
                <span className="qv-side__icon">
                  <Glyph name={name} />
                </span>
                <span className="qv-side__label">{name}</span>
              </Link>
            ))}
          </div>
          <div className="qv-side__rule" />
          <div className="qv-side__group">
            {navNames.slice(4).map((name) => (
              <Link
                key={name}
                href={destination(name)}
                onClick={(e) => navigate(e, destination(name))}
                className="qv-side__item"
              >
                <span className="qv-side__icon">
                  <Glyph name={name} />
                </span>
                <span className="qv-side__label">{name}</span>
              </Link>
            ))}
          </div>
          <div className="qv-side__status">
            <Mark kind="ai" size={12} />
            <span>
              {versionNumber
                ? `Your AI is ${state?.paused ? "paused" : "live"} · v${versionNumber}`
                : "Your AI is a draft"}
            </span>
          </div>
        </nav>
      </aside>
      <main className={`w2-main w2-${current}`}>
        {state?.development && (
          <div className="w2-development" role="note">
            Development identity ·{" "}
            {state.creator.verification === "verified"
              ? "fictional verified creator"
              : "pending verification"}
            {state.capabilities.syntheticLicensing
              ? " · synthetic license only"
              : ""}{" "}
            · external fan publication disabled
          </div>
        )}
        {!online && (
          <Notice tone="offline" title="You’re offline">
            Your saved information is shown. Reconnect before sending or
            publishing.
          </Notice>
        )}
        {!["test", "license"].includes(current) && studioHeader}
        {error && (
          <div
            role="alert"
            ref={errorNotice}
            tabIndex={-1}
            className="w2-action-alert"
          >
            <Notice tone="error" title="Action needs attention">
              {error}
            </Notice>
            <Button variant="quiet" onClick={() => void fetchState(!state)}>
              Refresh saved state
            </Button>
            {!state && (
              <Link
                className="qv-link-btn"
                href="/auth/continue?returnTo=%2Fstudio%2Fai"
              >
                Continue with Pantopus
              </Link>
            )}
          </div>
        )}
        {message && <p className="w2-status">{message}</p>}
        {message && confirmationVisible && (
          <div className="w2-confirmation">
            <Toast>{message}</Toast>
          </div>
        )}
        {!state && !error && (
          <div aria-label="Loading creator AI">
            <Skeleton />
            <Skeleton />
          </div>
        )}
        {state && configuration && (
          <>
            {current === "overview" && <OverviewScreen ai={ai} state={state} />}
            {(current === "sources" || current === "onboard") && (
              <SourcesScreen ai={ai} state={state} />
            )}
            {(current === "style" || current === "rules") && (
              <StyleScreen
                ai={ai}
                state={state}
                configuration={configuration}
              />
            )}
            {(current === "test" || current === "versions") && (
              <TestScreen ai={ai} state={state} studioHeader={studioHeader} />
            )}
            {current === "license" && (
              <LicenseScreen
                ai={ai}
                state={state}
                studioHeader={studioHeader}
              />
            )}
            {current === "interview" && (
              <InterviewScreen ai={ai} state={state} />
            )}
          </>
        )}
      </main>
      <nav className="w2-phone-nav" aria-label="Phone Studio">
        {["Notes", "Requests", "Threads", "My AI", "More"].map((name) => (
          <Link
            key={name}
            href={destination(name)}
            onClick={(e) => navigate(e, destination(name))}
            aria-current={name === "My AI" ? "page" : undefined}
          >
            <Glyph name={name} size={name === "Notes" ? 17 : 22} />
            <span>{name}</span>
          </Link>
        ))}
      </nav>
      <dialog
        ref={dialog}
        className="w2-dialog"
        aria-labelledby="w2-confirm-title"
        aria-describedby="w2-confirm-body"
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const buttons =
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            );
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        onCancel={() => setConfirmation(null)}
        onClose={() => setConfirmation(null)}
      >
        <h2 id="w2-confirm-title">{confirmation?.title}</h2>
        <p id="w2-confirm-body">{confirmation?.body}</p>
        {error && <p role="alert">{error}</p>}
        <div className="w2-actions">
          <Button
            disabled={busy}
            onClick={() => {
              if (confirmation)
                void action(async () => {
                  await confirmation.run();
                  setConfirmation(null);
                }, "Action saved.");
            }}
          >
            {confirmation?.confirm}
          </Button>
          <Button
            id="w2-confirm-cancel"
            variant="quiet"
            onClick={() => setConfirmation(null)}
          >
            Cancel
          </Button>
        </div>
      </dialog>
    </div>
  );
}
