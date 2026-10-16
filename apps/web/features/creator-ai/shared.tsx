// Module-level helpers shared by My AI's screens (split from CreatorAI.tsx, B8).
import type { ReactNode } from "react";
import { Mark } from "@qelvora/ui-web";

export type ErrorBody = { error?: { code: string; message: string } };
export type CreatorAIIdentity = Readonly<{
  accountId: string;
  sessionId: string;
  signal: AbortSignal;
  end: () => void;
  isSessionEnded: () => boolean;
}>;
export type Preview = {
  revision: number;
  sentences: { text: string; citations: string[] }[];
  passages: {
    id: string;
    title: string;
    text: string;
    start: number;
    end: number;
  }[];
  durationMs: number;
  firstApprovedMs: number | null;
  usage: { costMicros: number | null }[];
};
export const tabs = ["Sources", "Style", "Rules", "Test", "Versions"];
export const sections = [
  "overview",
  "sources",
  "style",
  "rules",
  "test",
  "versions",
  "license",
  "interview",
  "onboard",
];
export function readDraft(key: string) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as unknown;
  } catch {
    return null;
  }
}
export function storeDraft(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private browsing may disable storage; server drafts still work. */
  }
}
export type DraftKind = "w2-source" | "w2-interview" | "w2-config";
export function draftStorageKey(
  kind: DraftKind,
  accountId: string,
  creatorId: string,
  sessionId?: string,
) {
  return `${kind}:${accountId}:${sessionId ? `${sessionId}:` : ""}${creatorId}`;
}
export function purgeStoredDrafts(accountId: string, sessionId: string) {
  try {
    // Each genuine session owns distinct keys. A delayed original end never
    // checks then deletes shared keys belonging to a replacement session.
    const prefixes = ["w2-source", "w2-interview", "w2-config"].map(
      (kind) => `${kind}:${accountId}:${sessionId}:`,
    );
    for (const key of Object.keys(localStorage))
      if (prefixes.some((prefix) => key.startsWith(prefix)))
        localStorage.removeItem(key);
  } catch {
    /* Unavailable storage cannot restore a draft. */
  }
}
export function Button({
  id,
  children,
  onClick,
  disabled = false,
  variant = "secondary",
  type = "button",
}: {
  id?: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "secondary" | "quiet" | "ai";
  type?: "button" | "submit";
}) {
  return (
    <button
      id={id}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`qv-btn qv-btn--${variant}`}
    >
      {children}
    </button>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="w2-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="w2-panel">
      <span className="qv-meta">{title}</span>
      {children}
    </section>
  );
}
export function Lines({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      rows={4}
      value={value.join("\n")}
      onChange={(e) => onChange(e.target.value.split("\n"))}
      placeholder={placeholder}
    />
  );
}
// Exact paths from the shared ui-web glyph definitions; W1 owns their public export seam.
export function Glyph({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    Notes: "M13.5 4.2a5.4 5.4 0 0 1 0 7.6M16.8 1.8a8.8 8.8 0 0 1 0 12.4",
    Requests: "M4 12.5l2-7.5h10l2 7.5V17H4zM4 12.5h4l1 2h4l1-2h4",
    Threads:
      "M4 5.5h10a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 14 13.5H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 12V7A1.5 1.5 0 0 1 4 5.5zM18 9h.5A1.5 1.5 0 0 1 20 10.5v4a1.5 1.5 0 0 1-1.5 1.5H18v2.5L15 16h-3",
    Offers: "M3.5 4.5v6l8 8 7-7-8-8h-6a1 1 0 0 0-1 1z",
    Publish: "M4 18l1-4.5L14.5 4l3.5 3.5L8.5 17zM12.5 6l3.5 3.5",
    Insights: "M4 18h14M6.5 15v-4M11 15V6.5M15.5 15v-6.5",
    Earnings:
      "M13.3 8.3c-.5-.6-1.3-1-2.3-1-1.4 0-2.3.7-2.3 1.7 0 2.4 4.8 1.3 4.8 3.9 0 1-1 1.8-2.5 1.8-1.1 0-2-.4-2.5-1.1M11 6v1.3M11 14.7V16",
    Team: "M3 17.5c.9-2.6 3-4 5.5-4s4.6 1.4 5.5 4M14 5.2a3 3 0 0 1 0 5.6M16 13.8c1.3.6 2.3 1.9 2.8 3.7",
  };
  if (name === "My AI") return <Mark kind="ai" size={size} />;
  return (
    <svg
      width={name === "Notes" ? Math.round(size * 1.375) : size}
      height={size}
      viewBox={name === "Notes" ? "0 0 22 16" : "0 0 22 22"}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {name === "Notes" && (
        <circle cx="6.5" cy="8" r="4.5" fill="currentColor" />
      )}
      {name === "Earnings" && (
        <circle
          cx="11"
          cy="11"
          r="7.5"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      )}
      {name === "Team" && (
        <circle cx="8.5" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
      )}
      {name === "Offers" && (
        <circle cx="7.5" cy="8" r="1.3" fill="currentColor" />
      )}
      {name === "More" ? (
        [5.5, 11, 16.5].map((cx) => (
          <circle key={cx} cx={cx} cy="11" r="1.4" fill="currentColor" />
        ))
      ) : (
        <path
          d={paths[name]}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
