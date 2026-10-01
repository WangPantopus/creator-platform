import { growthLabel } from "./copy";
import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import { brand } from "@qelvora/brand";
import { EmptyState, Notice, glyphs } from "@qelvora/ui-web";
import { GrowthUnavailable } from "./server";
import "./growth.css";
export function GrowthShell({
  children,
  active = "Home",
  studio = false,
}: {
  children: React.ReactNode;
  active?: string;
  studio?: boolean;
}) {
  const dev =
    process.env.QELVORA_GROWTH_DEVELOPMENT === "true" &&
    process.env.NODE_ENV !== "production";
  return (
    <main className={`growth ${studio ? "growth-studio" : ""}`}>
      {studio ? (
        <aside className="growth-sidebar">
          <span className="growth-wordmark">
            {growthFormat("growthStudio", { value1: brand.name })}
          </span>
          <a href="/studio/insights">{growthCopy.navInsights}</a>
          <a href="/studio/impact">{growthCopy.growthImpact}</a>
          <a href="/studio/activation">{growthCopy.growthFirst72Hours}</a>
          <a href="/studio/launch">{growthCopy.growthLaunchKit}</a>
          <a href="/studio/measurement">{growthCopy.growthMeasurement}</a>
        </aside>
      ) : null}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        {dev ? (
          <div className="growth-dev">
            {
              growthCopy.growthDevelopmentEnvironmentSyntheticDataProvidersUnavailable
            }{" "}
            <a href="/growth-development">
              {growthCopy.growthDevelopmentControls}
            </a>
          </div>
        ) : null}
        {children}
        {!studio ? (
          <nav
            className="qv qv-tabbar growth-nav"
            aria-label={growthCopy.growthMainNavigation}
          >
            {[
              ["Home", "/home", glyphs.home],
              ["Discover", "/discover", glyphs.compass],
              ["Requests", "/requests", glyphs.inbox],
              ["You", "/you", glyphs.user],
            ].map(([label, href, icon]) => (
              <a
                key={String(label)}
                className={`qv-tab ${active === label ? "is-active" : ""}`}
                aria-current={active === label ? "page" : undefined}
                href={String(href)}
              >
                {typeof icon === "function" ? icon(22) : null}
                {growthLabel(String(label))}
              </a>
            ))}
          </nav>
        ) : null}
      </div>
    </main>
  );
}
export function Failure({
  error,
  returnTo = "/discover",
}: {
  error: unknown;
  returnTo?: string;
}) {
  const message =
    error instanceof Error
      ? error.message
      : growthCopy.growthThisFeatureIsUnavailable;
  return (
    <div className="growth-stack">
      <Notice
        title={
          error instanceof GrowthUnavailable && error.status === 401
            ? growthCopy.growthSignInToContinue
            : growthCopy.growthTemporarilyUnavailable
        }
      >
        {message}
      </Notice>
      <a
        className="qv-btn qv-btn--secondary"
        href={
          error instanceof GrowthUnavailable && error.status === 401
            ? `/auth/continue?returnTo=${encodeURIComponent(returnTo)}`
            : returnTo
        }
      >
        {error instanceof GrowthUnavailable && error.status === 401
          ? growthCopy.continueWithPantopus
          : growthCopy.growthTryAgain}
      </a>
    </div>
  );
}
export function NoData({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <EmptyState title={title} />
      <div className="growth-help">{children}</div>
    </div>
  );
}
