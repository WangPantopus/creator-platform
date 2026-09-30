/** Typed port of design/design-system/project/components/bundle.js.
 * The qv class structure and compositions intentionally preserve the reference.
 * Approved visual corrections are recorded in docs/BUILD_LOG.md. */
import * as React from "react";
import { brand } from "@qelvora/brand";
import { copy, formatCopy } from "@qelvora/copy";
import type {
  MarkProps,
  SealProps,
  AvatarProps,
  AuthorLabelProps,
  IdentityStripProps,
  ThreadHeaderProps,
  SignedMarkerProps,
  SignedActPresentation,
  SystemLineProps,
  MessageProps,
  NoteProps,
  ReactionChipProps,
  CitationChipProps,
  MemoryChipProps,
  CorrectionProps,
  ContextCardProps,
  VoiceNoteProps,
  ComposerProps,
  StepInProps,
  AccessLinesProps,
  ModeListProps,
  IncludeListProps,
  TermsBlockProps,
  EtaLineProps,
  RequestStatusProps,
  ReceiptProps,
  SpendLimitProps,
  QueueCardProps,
  CapacityHeaderProps,
  LabelPreviewProps,
  SigningSheetProps,
  AuditBannerProps,
  SourceRowProps,
  ButtonProps,
  TabBarProps,
  SegmentedProps,
  NoticeProps,
  NotificationRowProps,
  EmptyStateProps,
  ShareCardProps,
  CallChipProps,
  ReservedLabelProps,
  CountdownProps,
  InsteadMenuProps,
  TestConsoleProps,
  VersionListProps,
  DigestItemProps,
  StudioTabBarProps,
  SidebarProps,
  SheetProps,
  DialogProps,
  ToastProps,
  SkeletonProps,
  EmailFrameProps,
} from "./contracts";
const h = React.createElement;
const Frag = React.Fragment;
function cx(...values: (string | boolean | undefined | null)[]): string {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i]) out.push(values[i]);
  }
  return out.join(" ");
}
function svg(
  size: number,
  box: string,
  kids: React.ReactNode[],
  extra?: React.SVGProps<SVGSVGElement>,
) {
  const p: React.SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    viewBox: box,
    fill: "none",
    "aria-hidden": "true",
    focusable: "false",
  };
  if (extra) Object.assign(p, extra);
  return h("svg", p, ...kids);
}
const STROKE: React.SVGProps<SVGPathElement> = {
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};
function path(d: string, more?: React.SVGProps<SVGPathElement>) {
  return h("path", { d, ...STROKE, ...more });
}

/* ---------- glyphs ---------- */
const SCALLOP =
  "M8 1.2l1.6 1.2 2-.2.6 1.9 1.7 1.1-.6 1.9.6 1.9-1.7 1.1-.6 1.9-2-.2L8 14.8l-1.6-1.2-2 .2-.6-1.9-1.7-1.1.6-1.9-.6-1.9 1.7-1.1.6-1.9 2 .2z";
const G = {
  ring: function (s?: number) {
    return svg(s || 14, "0 0 16 16", [
      h("circle", {
        key: 1,
        cx: 8,
        cy: 8,
        r: 6,
        stroke: "currentColor",
        strokeWidth: 1.6,
      }),
      h("circle", { key: 2, cx: 8, cy: 8, r: 1.8, fill: "currentColor" }),
    ]);
  },
  sealCheck: function (s?: number) {
    return svg(s || 13, "0 0 16 16", [
      h("path", { key: 1, d: SCALLOP, fill: "currentColor" }),
      h("path", {
        key: 2,
        d: "M5.4 8.2l1.8 1.8 3.5-3.7",
        style: { stroke: "var(--qv-cut, var(--surface))" },
        strokeWidth: 1.4,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      }),
    ]);
  },
  broadcast: function (s?: number) {
    return svg(
      s || 16,
      "0 0 22 16",
      [
        h("circle", { key: 1, cx: 6.5, cy: 8, r: 4.5, fill: "currentColor" }),
        path("M13.5 4.2a5.4 5.4 0 0 1 0 7.6", { key: 2 }),
        path("M16.8 1.8a8.8 8.8 0 0 1 0 12.4", { key: 3 }),
      ],
      { width: Math.round((s || 16) * 1.375) },
    );
  },
  approved: function (s?: number) {
    return svg(
      s || 16,
      "0 0 34 24",
      [
        h("circle", {
          key: 1,
          cx: 11,
          cy: 12,
          r: 8,
          style: { stroke: "var(--ai-ink)" },
          strokeWidth: 1.8,
        }),
        h("circle", {
          key: 2,
          cx: 22,
          cy: 12,
          r: 8,
          style: { fill: "var(--maya-surface)" },
        }),
        h("circle", {
          key: 3,
          cx: 22,
          cy: 12,
          r: 3.6,
          style: { fill: "var(--maya-accent)" },
        }),
      ],
      { width: Math.round((s || 16) * 1.42) },
    );
  },
  team: function (s?: number) {
    return svg(s || 14, "0 0 16 16", [
      h("rect", {
        key: 1,
        x: 2.5,
        y: 2.5,
        width: 11,
        height: 11,
        rx: 2,
        stroke: "currentColor",
        strokeWidth: 1.4,
        strokeDasharray: "2 1.6",
      }),
    ]);
  },
  correction: function (s?: number) {
    return svg(s || 14, "0 0 16 16", [
      h("rect", {
        key: 1,
        x: 2,
        y: 3,
        width: 12,
        height: 10,
        rx: 2,
        stroke: "currentColor",
        strokeWidth: 1.4,
      }),
      path("M4.8 7h6.4M4.8 9.6h4", { key: 2 }),
    ]);
  },
  heart: function (s?: number) {
    return svg(s || 13, "0 0 14 14", [
      h("path", {
        key: 1,
        d: "M7 12.2S1.6 8.9 1.6 5.3A2.8 2.8 0 0 1 7 4a2.8 2.8 0 0 1 5.4 1.3C12.4 8.9 7 12.2 7 12.2z",
        fill: "currentColor",
      }),
    ]);
  },
  bookmark: function (s?: number) {
    return svg(s || 14, "0 0 14 14", [
      path("M3.5 1.8h7v10.6L7 10.1l-3.5 2.3z", { key: 1, strokeWidth: 1.3 }),
    ]);
  },
  play: function (s?: number) {
    return svg(s || 16, "0 0 16 16", [
      h("path", { key: 1, d: "M5.5 3.5v9l7-4.5z", fill: "currentColor" }),
    ]);
  },
  clock: function (s?: number) {
    return svg(s || 16, "0 0 16 16", [
      h("circle", {
        key: 1,
        cx: 8,
        cy: 8,
        r: 6.2,
        stroke: "currentColor",
        strokeWidth: 1.3,
      }),
      path("M8 4.8V8l2.2 1.4", { key: 2, strokeWidth: 1.3 }),
    ]);
  },
  lock: function (s?: number) {
    return svg(s || 12, "0 0 12 12", [
      h("rect", {
        key: 1,
        x: 2.5,
        y: 5.2,
        width: 7,
        height: 5,
        rx: 1,
        stroke: "currentColor",
        strokeWidth: 1.1,
      }),
      path("M4 5.2V3.8a2 2 0 0 1 4 0v1.4", { key: 2, strokeWidth: 1.1 }),
    ]);
  },
  chevron: function (s?: number) {
    return svg(s || 16, "0 0 16 16", [
      path("M6 3.5L10.5 8 6 12.5", { key: 1 }),
    ]);
  },
  back: function (s?: number) {
    return svg(s || 22, "0 0 22 22", [
      path("M13.5 4.5L7 11l6.5 6.5", { key: 1 }),
    ]);
  },
  plus: function (s?: number) {
    return svg(s || 22, "0 0 22 22", [
      path("M11 4.5v13M4.5 11h13", { key: 1 }),
    ]);
  },
  close: function (s?: number) {
    return svg(s || 16, "0 0 16 16", [path("M4 4l8 8M12 4l-8 8", { key: 1 })]);
  },
  send: function (s?: number) {
    return svg(s || 20, "0 0 20 20", [
      path("M10 15.5v-11M5.2 9.2L10 4.4l4.8 4.8", { key: 1, strokeWidth: 1.8 }),
    ]);
  },
  info: function (s?: number) {
    return svg(s || 20, "0 0 20 20", [
      h("circle", {
        key: 1,
        cx: 10,
        cy: 10,
        r: 7.5,
        stroke: "currentColor",
        strokeWidth: 1.3,
      }),
      path("M10 9v4.5", { key: 2, strokeWidth: 1.3 }),
      h("circle", { key: 3, cx: 10, cy: 6.4, r: 0.9, fill: "currentColor" }),
    ]);
  },
  image: function (s?: number) {
    return svg(s || 16, "0 0 22 22", [
      h("rect", {
        key: 1,
        x: 3,
        y: 4.5,
        width: 16,
        height: 13,
        rx: 2,
        stroke: "currentColor",
        strokeWidth: 1.4,
      }),
      path("M4 16l4.5-4 3.5 3 2.5-2 3.5 3", { key: 2, strokeWidth: 1.4 }),
    ]);
  },
  alert: function (s?: number) {
    return svg(s || 16, "0 0 16 16", [
      h("circle", {
        key: 1,
        cx: 8,
        cy: 8,
        r: 6.2,
        stroke: "currentColor",
        strokeWidth: 1.4,
      }),
      path("M8 4.8v3.6", { key: 2, strokeWidth: 1.6 }),
      h("circle", { key: 3, cx: 8, cy: 11, r: 0.9, fill: "currentColor" }),
    ]);
  },
  pause: function (s?: number) {
    return svg(s || 16, "0 0 16 16", [
      path("M6 4v8M10 4v8", { key: 1, strokeWidth: 1.8 }),
    ]);
  },
  face: function (s?: number) {
    return svg(s || 18, "0 0 18 18", [
      path(
        "M2.5 6V4.5a2 2 0 0 1 2-2H6M12 2.5h1.5a2 2 0 0 1 2 2V6M15.5 12v1.5a2 2 0 0 1-2 2H12M6 15.5H4.5a2 2 0 0 1-2-2V12",
        { key: 1 },
      ),
      path("M6.5 7v1M11.5 7v1M9 7v3H8.2M6.8 12.2c1.3.9 3.1.9 4.4 0", {
        key: 2,
      }),
    ]);
  },
  home: function (s?: number) {
    return svg(s || 22, "0 0 22 22", [
      path("M4 9.5L11 4l7 5.5V18H4z", { key: 1 }),
      path("M9 18v-5h4v5", { key: 2 }),
    ]);
  },
  compass: function (s?: number) {
    return svg(s || 22, "0 0 22 22", [
      h("circle", {
        key: 1,
        cx: 11,
        cy: 11,
        r: 7.5,
        stroke: "currentColor",
        strokeWidth: 1.5,
      }),
      path("M13.8 8.2l-1.6 4-4 1.6 1.6-4z", { key: 2 }),
    ]);
  },
  inbox: function (s?: number) {
    return svg(s || 22, "0 0 22 22", [
      path("M4 12.5l2-7.5h10l2 7.5V17H4z", { key: 1 }),
      path("M4 12.5h4l1 2h4l1-2h4", { key: 2 }),
    ]);
  },
  user: function (s?: number) {
    return svg(s || 22, "0 0 22 22", [
      h("circle", {
        key: 1,
        cx: 11,
        cy: 8,
        r: 3.5,
        stroke: "currentColor",
        strokeWidth: 1.5,
      }),
      path("M4.5 18c1.2-3 3.7-4.5 6.5-4.5s5.3 1.5 6.5 4.5", { key: 2 }),
    ]);
  },
  bell: function (s?: number) {
    return svg(s || 20, "0 0 20 20", [
      path("M5 13.5V9a5 5 0 0 1 10 0v4.5l1.5 1.5h-13z", { key: 1 }),
      path("M8.5 17h3", { key: 2 }),
    ]);
  },
  threads: function (s?: number) {
    return svg(s || 22, "0 0 22 22", [
      path(
        "M4 5.5h10a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 14 13.5H9l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 12V7A1.5 1.5 0 0 1 4 5.5z",
        { key: 1 },
      ),
      path(
        "M18 9h.5A1.5 1.5 0 0 1 20 10.5v4a1.5 1.5 0 0 1-1.5 1.5H18v2.5L15 16h-3",
        { key: 2 },
      ),
    ]);
  },
  more: function (s?: number) {
    return svg(s || 22, "0 0 22 22", [
      h("circle", { key: 1, cx: 5.5, cy: 11, r: 1.4, fill: "currentColor" }),
      h("circle", { key: 2, cx: 11, cy: 11, r: 1.4, fill: "currentColor" }),
      h("circle", { key: 3, cx: 16.5, cy: 11, r: 1.4, fill: "currentColor" }),
    ]);
  },
  tag: function (s?: number) {
    return svg(s || 22, "0 0 22 22", [
      path("M3.5 4.5v6l8 8 7-7-8-8h-6a1 1 0 0 0-1 1z", { key: 1 }),
      h("circle", { key: 2, cx: 7.5, cy: 8, r: 1.3, fill: "currentColor" }),
    ]);
  },
  pen: function (s?: number) {
    return svg(s || 22, "0 0 22 22", [
      path("M4 18l1-4.5L14.5 4l3.5 3.5L8.5 17z", { key: 1 }),
      path("M12.5 6l3.5 3.5", { key: 2 }),
    ]);
  },
  chart: function (s?: number) {
    return svg(s || 22, "0 0 22 22", [
      path("M4 18h14", { key: 1 }),
      path("M6.5 15v-4M11 15V6.5M15.5 15v-6.5", { key: 2 }),
    ]);
  },
  coin: function (s?: number) {
    return svg(s || 22, "0 0 22 22", [
      h("circle", {
        key: 1,
        cx: 11,
        cy: 11,
        r: 7.5,
        stroke: "currentColor",
        strokeWidth: 1.5,
      }),
      path(
        "M13.3 8.3c-.5-.6-1.3-1-2.3-1-1.4 0-2.3.7-2.3 1.7 0 2.4 4.8 1.3 4.8 3.9 0 1-1 1.8-2.5 1.8-1.1 0-2-.4-2.5-1.1M11 6v1.3M11 14.7V16",
        { key: 2 },
      ),
    ]);
  },
  people: function (s?: number) {
    return svg(s || 22, "0 0 22 22", [
      h("circle", {
        key: 1,
        cx: 8.5,
        cy: 8,
        r: 3,
        stroke: "currentColor",
        strokeWidth: 1.5,
      }),
      path("M3 17.5c.9-2.6 3-4 5.5-4s4.6 1.4 5.5 4", { key: 2 }),
      path("M14 5.2a3 3 0 0 1 0 5.6M16 13.8c1.3.6 2.3 1.9 2.8 3.7", { key: 3 }),
    ]);
  },
  check: function (s?: number) {
    return svg(s || 16, "0 0 16 16", [
      path("M3.5 8.4l3 3 6-6.6", { key: 1, strokeWidth: 1.7 }),
    ]);
  },
  dashRing: function (s?: number) {
    return svg(s || 14, "0 0 16 16", [
      h("circle", {
        key: 1,
        cx: 8,
        cy: 8,
        r: 6,
        stroke: "currentColor",
        strokeWidth: 1.4,
        strokeDasharray: "2.2 1.8",
      }),
      h("circle", { key: 2, cx: 8, cy: 8, r: 1.8, fill: "currentColor" }),
    ]);
  },
  phone: function (s?: number) {
    return svg(s || 16, "0 0 16 16", [
      path(
        "M5.2 2.5l1.6 3-1.3 1.2a7.5 7.5 0 0 0 3.8 3.8l1.2-1.3 3 1.6-.7 2.4c-5.5.3-10.4-4.6-10.1-10.1z",
        { key: 1, strokeWidth: 1.3 },
      ),
    ]);
  },
  video: function (s?: number) {
    return svg(s || 16, "0 0 16 16", [
      h("rect", {
        key: 1,
        x: 1.8,
        y: 4,
        width: 9,
        height: 8,
        rx: 1.6,
        stroke: "currentColor",
        strokeWidth: 1.3,
      }),
      path("M10.8 7l3.4-2v6l-3.4-2", { key: 2, strokeWidth: 1.3 }),
    ]);
  },
};

/* ---------- identity ---------- */
export function Seal(p: SealProps) {
  const size = p.size || 18;
  return h(
    "span",
    {
      className: cx("qv-seal", p.live && "is-live"),
      "aria-hidden": "true",
      style: { width: size, height: size, fontSize: Math.round(size * 0.62) },
    },
    p.initial || "M",
  );
}
export function Avatar(p: AvatarProps) {
  return h(
    "span",
    { className: cx("qv-avatar", p.live && "is-live"), "aria-hidden": "true" },
    p.initial || "M",
  );
}
export function Mark(p: MarkProps) {
  const k = p.kind || "ai",
    s = p.size;
  if (k === "ai")
    return h("span", { className: "qv-mark qv-ink-ai" }, G.ring(s));
  if (k === "approved_draft")
    return h("span", { className: "qv-mark" }, G.approved(s));
  if (k === "human_creator")
    return h(Seal, { size: s || 16, initial: p.initial, live: p.live });
  if (k === "human_broadcast")
    return h(
      "span",
      {
        className: cx(
          "qv-mark",
          p.onMaya ? "qv-ink-maya-accent" : "qv-ink-maya",
        ),
      },
      G.broadcast(s),
    );
  if (k === "human_reaction")
    return h(
      "span",
      {
        className: cx(
          "qv-mark",
          p.onMaya ? "qv-ink-maya-accent" : "qv-ink-maya",
        ),
      },
      G.heart(s),
    );
  if (k === "team")
    return h("span", { className: "qv-mark qv-ink-team" }, G.team(s));
  if (k === "correction")
    return h(
      "span",
      {
        className: cx(
          "qv-mark",
          p.onMaya ? "qv-ink-maya-accent" : "qv-ink-maya",
        ),
      },
      G.correction(s),
    );
  return null;
}
export function AuthorLabel(p: AuthorLabelProps) {
  const k = p.kind || "ai",
    name = p.name || "Maya";
  const time = p.time
    ? h("span", { className: "qv-author__time" }, "· " + p.time)
    : null;
  const mayaInk = p.onMaya ? "qv-ink-maya-accent" : "qv-ink-maya";
  let text;
  if (k === "ai")
    text = h(
      "span",
      { className: "qv-ink-ai" },
      formatCopy("aiAuthor", { name }),
    );
  else if (k === "approved_draft")
    text = h(
      Frag,
      null,
      h("span", { className: "qv-ink-ai" }, copy.preparedByAI),
      h(
        "span",
        { className: mayaInk },
        "· " + formatCopy("approvedBy", { name }),
      ),
    );
  else if (k === "human_creator")
    text = h("span", { className: mayaInk }, name);
  else if (k === "human_broadcast")
    text = h(
      "span",
      { className: mayaInk },
      formatCopy("noteAudience", {
        name,
        audience: p.audience || "Kiln Club members",
      }),
    );
  else if (k === "human_reaction")
    text = h("span", { className: mayaInk }, formatCopy("reaction", { name }));
  else if (k === "team")
    text = h(
      "span",
      { className: "qv-ink-team" },
      formatCopy("teamAuthor", { name, member: p.member || "Priya" }),
    );
  else if (k === "correction")
    text = h(
      "span",
      { className: mayaInk },
      formatCopy("correctionAuthor", { name }),
    );
  return h(
    "div",
    { className: "qv-author" },
    h(Mark, {
      kind: k,
      onMaya: p.onMaya,
      size: k === "human_creator" ? 16 : undefined,
      initial: name.charAt(0),
    }),
    text,
    time,
  );
}
export function IdentityStrip(p: IdentityStripProps) {
  const s = p.state || "ai",
    name = p.name || "Maya";
  let lead, bold, rest;
  if (s === "human") {
    lead = h(Seal, { size: 22, live: true, initial: name.charAt(0) });
    bold = formatCopy("takeover", { name });
    rest = " · she's in this conversation now";
  } else if (s === "team") {
    lead = h("span", { className: "qv-strip__box qv-ink-team" }, G.team(12));
    bold = name + "'s team is here";
    rest = " · they reply as her team, never as " + name;
  } else if (s === "paused") {
    lead = h("span", { className: "qv-strip__box qv-ink-muted" }, G.pause(12));
    bold = name + "'s AI is paused";
    rest = " · requests still work";
  } else if (s === "updating") {
    lead = h("span", { className: "qv-strip__box qv-ink-ai" }, G.ring(12));
    bold = name + "'s AI is being updated";
    rest = " · requests still work";
  } else {
    lead = h("span", { className: "qv-strip__box" }, G.ring(12));
    const [identityLead, identityRest] = formatCopy("identityStrip", { name })
      .replace(/\.$/, "")
      .split(" · ");
    bold = identityLead;
    rest = " · " + identityRest;
  }
  return h(
    "div",
    { role: "status", className: cx("qv", "qv-strip", "qv-strip--" + s) },
    lead,
    h("div", null, h("b", null, bold), h("span", null, rest)),
  );
}
export function ThreadHeader(p: ThreadHeaderProps) {
  const name = p.name || "Maya";
  return h(
    "header",
    {
      className: "qv",
      style: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px 10px 4px",
        borderBottom: "1px solid var(--line)",
        background: "var(--ground)",
      },
    },
    h(
      "button",
      {
        className: "qv-icon-btn",
        "aria-label": "Back",
        style: { color: "var(--ink)" },
      },
      G.back(),
    ),
    h(Avatar, { initial: name.charAt(0), live: p.live }),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          gap: 2,
          flexGrow: 1,
        },
      },
      h(
        "div",
        { style: { fontSize: 17, fontWeight: 600, letterSpacing: "-0.015em" } },
        name,
      ),
      h(
        "div",
        {
          className: "qv-meta",
          style: p.live ? { color: "var(--maya-ink)" } : null,
        },
        p.live
          ? "In this conversation"
          : p.subtitle || "Official AI · Kiln Club",
      ),
    ),
    h(
      "button",
      { className: "qv-icon-btn", "aria-label": "About this conversation" },
      G.info(),
    ),
  );
}
export function SignedMarker(p: SignedMarkerProps) {
  const name = p.name || "Maya";
  const href = signatureHref({
    signedActId: p.signedActId,
    verificationHref: p.href,
  });
  return h(
    href ? "a" : "span",
    {
      className: "qv-signed",
      ...(href ? { href } : {}),
      "aria-label":
        formatCopy("signedBy", { name }) +
        (p.time ? " at " + p.time : "") +
        (href ? ". " + copy.openVerification : ""),
    },
    h("span", { className: "qv-mark" }, G.sealCheck(p.size || 13)),
    h(
      "span",
      { className: "qv-signed__label" },
      formatCopy("signedBy", { name }),
    ),
    p.time ? h("span", { className: "qv-signed__time" }, "· " + p.time) : null,
    p.extra
      ? h("span", { className: "qv-signed__time" }, "· " + p.extra)
      : null,
  );
}
function signatureHref(p: SignedActPresentation): string | undefined {
  if (p.verificationHref) return p.verificationHref;
  return p.signedActId &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(
      p.signedActId,
    )
    ? `/verify/${p.signedActId}`
    : undefined;
}
export function SystemLine(p: SystemLineProps) {
  const v = p.variant || "plain";
  if (v === "date")
    return h("div", { className: "qv qv-date qv-meta" }, p.children);
  if (v === "presence")
    return h(
      "div",
      { className: "qv qv-system qv-system--presence", role: "status" },
      h(
        "span",
        { className: "qv-presence-pill" },
        h(Seal, { size: 18, initial: (p.name || "Maya").charAt(0) }),
        formatCopy("takeover", { name: p.name || "Maya" }),
        p.time
          ? h(
              "span",
              {
                className: "qv-mono",
                style: {
                  fontWeight: 400,
                  fontSize: 11,
                  color: "var(--on-maya-muted)",
                },
              },
              p.time,
            )
          : null,
      ),
    );
  return h(
    "div",
    { className: "qv qv-system", role: "status" },
    h("span", null, p.children),
  );
}

/* ---------- conversation ---------- */
export function Message(p: MessageProps) {
  const k = p.kind || "ai",
    name = p.name || "Maya";
  if (k === "fan") {
    let st = null;
    if (p.delivery === "pending")
      st = h("div", { className: "qv-msg__status" }, copy.sending);
    else if (p.delivery === "failed")
      st = h(
        "div",
        { className: "qv-msg__status qv-msg__status--failed" },
        h("span", { className: "qv-mark" }, G.alert(14)),
        copy.notSent,
        h(
          "button",
          { className: "qv-link-btn", style: { color: "var(--ink)" } },
          copy.retry,
        ),
      );
    else if (p.meta) st = h("div", { className: "qv-meta" }, p.meta);
    return h(
      "div",
      {
        className: cx(
          "qv",
          "qv-msg",
          "qv-msg--fan",
          p.delivery === "pending" && "qv-msg--pending",
        ),
      },
      h("div", { className: "qv-bubble qv-bubble--fan" }, p.children),
      st,
      p.after || null,
    );
  }
  if (k === "ai") {
    const body =
      p.delivery === "accepted"
        ? h(
            "span",
            {
              className: "qv-typing",
              "aria-label": formatCopy("aiWriting", { name }),
            },
            h("i"),
            h("i"),
            h("i"),
          )
        : h(
            "div",
            null,
            p.children,
            p.delivery === "streaming"
              ? h("span", { className: "qv-caret", "aria-hidden": "true" })
              : null,
          );
    return h(
      "div",
      { className: "qv qv-msg qv-msg--in" },
      h(AuthorLabel, { kind: "ai", name: name, time: p.time }),
      h(
        "div",
        { className: "qv-bubble qv-bubble--ai" },
        p.sponsor
          ? h(
              "div",
              { className: "qv-sponsor" },
              formatCopy("sponsorDisclosure", { name, brand: p.sponsor }),
            )
          : null,
        body,
        p.citation || null,
        p.delivery === "interrupted"
          ? h("span", { className: "qv-tag" }, copy.interrupted)
          : null,
      ),
      p.actions === false
        ? null
        : h(
            "div",
            { className: "qv-actions" },
            h("button", { className: "qv-link-btn" }, copy.thisHelped),
            h("button", { className: "qv-link-btn" }, copy.report),
          ),
    );
  }
  if (k === "team") {
    return h(
      "div",
      { className: "qv qv-msg qv-msg--in" },
      h(AuthorLabel, {
        kind: "team",
        name: name,
        member: p.member,
        time: p.time,
      }),
      h("div", { className: "qv-bubble qv-bubble--team" }, p.children),
    );
  }
  if (k === "human_creator") {
    return h(
      "div",
      { className: "qv qv-msg qv-msg--in" },
      h(
        "div",
        {
          className: cx(
            "qv-bubble",
            "qv-bubble--maya",
            "qv-on-maya",
            p.live && "is-live",
          ),
          style: { "--qv-cut": "var(--maya-surface)" },
        },
        h(AuthorLabel, {
          kind: "human_creator",
          name: name,
          time: p.time,
          onMaya: true,
        }),
        h("p", { className: "qv-voice" }, p.children),
        h(
          "div",
          { className: "qv-bubble__foot" },
          h(SignedMarker, { name: name, href: signatureHref(p) }),
        ),
      ),
    );
  }
  if (k === "approved_draft") {
    const t = p.treatment || "split";
    if (t === "gradient")
      return h(
        "div",
        { className: "qv qv-msg qv-msg--in" },
        h(
          "div",
          { className: "qv-draft qv-draft--gradient" },
          h(
            "div",
            { className: "qv-draft__inner" },
            h(AuthorLabel, {
              kind: "approved_draft",
              name: name,
              time: p.time,
            }),
            h("div", null, p.children),
            signatureHref(p)
              ? h(SignedMarker, { name, time: p.time, href: signatureHref(p) })
              : null,
          ),
        ),
      );
    if (t === "stacked")
      return h(
        "div",
        { className: "qv qv-msg qv-msg--in" },
        h(
          "div",
          { className: "qv-draft qv-draft--stacked" },
          h(
            "div",
            { className: "qv-draft__stamp" },
            h(
              "span",
              { className: "qv-ink-ai" },
              G.ring(13),
              copy.preparedByAI,
            ),
            h(
              "span",
              { className: "qv-ink-maya" },
              h(Seal, { size: 13, initial: name.charAt(0) }),
              formatCopy("approvedBy", { name }),
              p.time
                ? h("span", { className: "qv-author__time" }, "· " + p.time)
                : null,
            ),
          ),
          h("div", { className: "qv-draft__text" }, p.children),
          signatureHref(p)
            ? h(SignedMarker, { name, time: p.time, href: signatureHref(p) })
            : null,
        ),
      );
    return h(
      "div",
      { className: "qv qv-msg qv-msg--in" },
      h(
        "div",
        { className: "qv-draft qv-draft--split" },
        h(
          "span",
          { className: "qv-sr" },
          copy.preparedByAI + " · " + formatCopy("approvedBy", { name }),
        ),
        h(
          "div",
          { className: "qv-draft__body" },
          h(
            "div",
            { className: "qv-author", "aria-hidden": true },
            h("span", { className: "qv-mark qv-ink-ai" }, G.ring(14)),
            h("span", { className: "qv-ink-ai" }, copy.preparedByAI),
          ),
          h("div", null, p.children),
        ),
        h(
          "div",
          {
            className: "qv-draft__band qv-on-maya",
            style: { "--qv-cut": "var(--maya-surface)" },
          },
          h(Seal, { size: 18, initial: name.charAt(0) }),
          h(
            "span",
            { className: "qv-ink-maya-accent", "aria-hidden": true },
            formatCopy("approvedBy", { name }),
          ),
          h("span", { className: "qv-draft__spacer" }),
          h(SignedMarker, { name: name, time: p.time, href: signatureHref(p) }),
        ),
      ),
    );
  }
  return null;
}
export function Note(p: NoteProps) {
  const name = p.name || "Maya";
  if (p.retracted)
    return h(
      "div",
      { className: "qv qv-note--retracted", role: "status" },
      formatCopy("noteRemoved", { name }),
    );
  return h(
    "article",
    {
      className: "qv qv-note qv-on-maya",
      "aria-label":
        "Note from " + name + " to " + (p.audience || "Kiln Club members"),
      style: { "--qv-cut": "var(--maya-surface)" },
    },
    h("div", { className: "qv-note__fold", "aria-hidden": "true" }),
    h(
      "div",
      { className: "qv-note__head" },
      h("span", { className: "qv-mark" }, G.broadcast(14)),
      h(
        "span",
        null,
        formatCopy("noteAudience", {
          name,
          audience: p.audience || "Kiln Club members",
        }),
      ),
      h(
        "span",
        {
          className: "qv-mono",
          style: {
            fontWeight: 400,
            fontSize: 11,
            color: "var(--on-maya-muted)",
          },
        },
        p.time || "",
      ),
    ),
    h(
      "div",
      { className: "qv-note__body" },
      h("p", { className: "qv-voice" }, p.children),
      p.media
        ? h(
            "div",
            { className: "qv-note__media" },
            h(
              "span",
              { className: "qv-mark", style: { marginRight: 8 } },
              G.image(18),
            ),
            p.media,
          )
        : null,
      h(
        "div",
        null,
        h(SignedMarker, {
          name: name,
          extra: p.audienceSize ? p.audienceSize + " members" : undefined,
          href: signatureHref(p),
        }),
      ),
    ),
    p.reply === false
      ? null
      : h(
          "div",
          { className: "qv-note__reply" },
          h(
            "div",
            { className: "qv-field" },
            h(
              "label",
              {
                className: "qv-field__label",
                htmlFor: p.replyId || "qv-note-reply",
              },
              formatCopy("noteReplyLabel", { name }),
            ),
            h("input", {
              id: p.replyId || "qv-note-reply",
              className: "qv-input",
              placeholder: copy.writeReply,
            }),
            h(
              "div",
              { className: "qv-help" },
              formatCopy("noteReplies", { name }),
            ),
          ),
        ),
  );
}
export function ReactionChip(p: ReactionChipProps) {
  const name = p.name || "Maya";
  const href = signatureHref(p);
  return h(
    href ? "a" : "span",
    {
      className: "qv qv-reaction qv-on-maya",
      ...(href
        ? {
            href,
            "aria-label":
              formatCopy("reaction", { name }) + ". " + copy.openVerification,
          }
        : {}),
    },
    h(Seal, { size: 22, initial: name.charAt(0) }),
    h(
      "span",
      { className: "qv-ink-maya-accent", style: { display: "inline-flex" } },
      G.heart(13),
    ),
    formatCopy("reaction", { name }),
  );
}
export function CitationChip(p: CitationChipProps) {
  if (p.unavailable)
    return h(
      "span",
      { className: "qv qv-cite qv-cite--gone" },
      h(
        "span",
        { className: "qv-cite__text" },
        h("span", { className: "qv-cite__title" }, p.title || "Source"),
        h("span", { className: "qv-cite__meta" }, copy.sourceUnavailable),
      ),
    );
  return h(
    "a",
    { className: "qv qv-cite", href: p.href || "#" },
    h("span", { className: "qv-cite__stamp" }, p.stamp ? p.stamp : G.play(12)),
    h(
      "span",
      { className: "qv-cite__text" },
      h("span", { className: "qv-cite__title" }, p.title),
      h("span", { className: "qv-cite__meta" }, p.meta),
    ),
    h("span", { className: "qv-mark qv-ink-muted" }, G.chevron()),
  );
}
export function MemoryChip(p: MemoryChipProps) {
  if (p.variant === "ask") {
    return h(
      "div",
      {
        className: "qv qv-memory qv-memory--ask",
        role: "group",
        "aria-label": "Memory question",
      },
      h(
        "div",
        { className: "qv-author" },
        h("span", { className: "qv-mark qv-ink-ai" }, G.bookmark()),
        h("span", { className: "qv-ink-ai" }, copy.sensitiveMemory),
      ),
      h("div", { style: { fontSize: 14, lineHeight: "20px" } }, p.text),
      h(
        "div",
        { style: { display: "flex", gap: 8 } },
        h(
          "button",
          { className: "qv-btn qv-btn--secondary", style: { minHeight: 44 } },
          "Remember",
        ),
        h("button", { className: "qv-btn qv-btn--quiet" }, "Don’t remember"),
      ),
    );
  }
  return h(
    "div",
    {
      className: "qv",
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
      },
    },
    h(
      "div",
      { className: "qv-memory" },
      h("span", { className: "qv-mark qv-ink-ai" }, G.bookmark()),
      h("span", { className: "qv-memory__text" }, "Remembered: " + p.text),
      h("button", { className: "qv-memory__btn" }, "Edit"),
    ),
    h("button", { className: "qv-link-btn" }, "Don’t remember this"),
  );
}
export function Correction(p: CorrectionProps) {
  const name = p.name || "Maya";
  return h(
    "div",
    { className: "qv qv-msg qv-msg--in" },
    h(AuthorLabel, { kind: "ai", name: name, time: p.aiTime }),
    h(
      "div",
      { className: "qv-correction-wrap" },
      h("div", { className: "qv-correction-ai" }, p.aiText),
      h(
        "div",
        {
          className: "qv-correction qv-on-maya",
          style: { "--qv-cut": "var(--maya-surface)" },
        },
        h(AuthorLabel, { kind: "correction", name: name, onMaya: true }),
        h("p", { className: "qv-voice-md" }, p.children),
        h(SignedMarker, { name: name, time: p.time, href: signatureHref(p) }),
      ),
    ),
  );
}
export function ContextCard(p: ContextCardProps) {
  return h(
    "div",
    { className: "qv qv-context" },
    h(
      "div",
      { className: "qv-context__text" },
      h("span", { className: "qv-meta" }, p.source || "From Instagram"),
      h("span", null, p.title),
    ),
    h(
      "button",
      {
        className: "qv-icon-btn",
        "aria-label": copy.removeContext,
        onClick: p.onRemove,
      },
      G.close(),
    ),
  );
}
export function VoiceNote(p: VoiceNoteProps) {
  const human = (p.kind || "human") === "human",
    name = p.name || "Maya";
  const bars = [
    8, 14, 22, 12, 18, 26, 16, 10, 20, 24, 14, 8, 18, 22, 12, 16, 26, 20, 10,
    14, 18, 8, 12, 20, 16, 10,
  ];
  return h(
    "div",
    {
      className: "qv",
      style: { display: "flex", flexDirection: "column", gap: 6 },
    },
    human ? null : h(AuthorLabel, { kind: "ai", name: name, time: p.time }),
    h(
      "div",
      {
        className: cx(
          "qv-voicenote",
          human ? "qv-voicenote--human qv-on-maya" : "qv-voicenote--ai",
        ),
        style: human ? { "--qv-cut": "var(--maya-surface)" } : null,
      },
      human
        ? h(AuthorLabel, {
            kind: "human_creator",
            name: name,
            time: p.time,
            onMaya: true,
          })
        : h(
            "span",
            {
              className: "qv-tag",
              style: { color: "var(--ai-ink)", borderColor: "var(--ai-line)" },
            },
            "AI voice · opens with “" + name + "’s AI”",
          ),
      h(
        "div",
        { className: "qv-voicenote__row" },
        h(
          "button",
          { className: "qv-voicenote__play", "aria-label": "Play voice note" },
          G.play(16),
        ),
        h(
          "div",
          { className: "qv-wave", "aria-hidden": "true" },
          bars.map(function (b, i) {
            return h("i", { key: i, style: { height: b } });
          }),
        ),
        h(
          "span",
          { className: "qv-mono", style: { fontSize: 12 } },
          p.duration || "0:42",
        ),
      ),
      p.transcript
        ? h("div", { className: "qv-voicenote__transcript" }, p.transcript)
        : null,
      human
        ? h(SignedMarker, {
            name: name,
            extra: "Recorded by " + name,
            href: signatureHref(p),
          })
        : null,
    ),
  );
}
export function StepIn(p: StepInProps) {
  const name = p.name || "Maya";
  if (p.disabled)
    return h(
      "div",
      {
        className: "qv",
        style: {
          display: "flex",
          flexDirection: "column",
          gap: 4,
          alignItems: "flex-start",
        },
      },
      h(
        "button",
        { className: "qv-stepin", disabled: true },
        h(Seal, { size: 30, initial: name.charAt(0) }),
        formatCopy("stepIn", { name }),
      ),
      h(
        "span",
        { className: "qv-help" },
        p.note || name + " is fully booked this week · opens Monday",
      ),
    );
  return h(
    "button",
    { className: "qv qv-stepin qv-on-maya" },
    h(Seal, { size: 30, initial: name.charAt(0) }),
    formatCopy("stepIn", { name }),
  );
}
export function Composer(p: ComposerProps) {
  const s = p.state || "ai",
    name = p.name || "Maya",
    id = p.id || "qv-composer";
  const inputRow = function (placeholder: string, maya: boolean) {
    return h(
      "div",
      { className: "qv-composer__row" },
      h(
        "button",
        { className: "qv-icon-btn", "aria-label": "Attach a photo" },
        G.plus(),
      ),
      h("label", { className: "qv-sr", htmlFor: id }, placeholder),
      h("input", {
        id: id,
        className: "qv-composer__input",
        placeholder: placeholder,
        style: maya ? { borderColor: "var(--maya-line)" } : null,
      }),
      h(
        "button",
        {
          className: cx("qv-send", maya && "qv-send--maya"),
          "aria-label": maya
            ? "Send to " + name
            : "Send to " + formatCopy("aiAuthor", { name }),
        },
        G.send(),
      ),
    );
  };
  if (s === "human")
    return h(
      "div",
      { className: "qv qv-composer qv-composer--human" },
      inputRow("Reply to " + name, true),
    );
  if (s === "paused")
    return h(
      "div",
      { className: "qv qv-composer" },
      h(
        "div",
        { className: "qv-composer__note" },
        h("span", { className: "qv-mark" }, G.pause(14)),
        name +
          "'s AI is paused · back " +
          (p.backDate || "Monday") +
          " · requests still work",
      ),
      h(StepIn, { name: name }),
    );
  if (s === "ended")
    return h(
      "div",
      { className: "qv qv-composer" },
      h(
        "div",
        { className: "qv-composer__panel" },
        h(
          "div",
          { style: { fontWeight: 600 } },
          "Your free conversation has ended",
        ),
        h(AccessLines, {
          can: "read this conversation and ask " + name + " to step in.",
          included: "your free first conversation, now complete.",
          changes:
            "Kiln Club includes " +
            name +
            "'s AI, her Notes and the right to ask for her.",
        }),
        h(
          Button,
          { variant: "secondary", block: true },
          "Join Kiln Club · $5 a month",
        ),
      ),
      h(StepIn, { name }),
    );
  const top =
    s === "capacity_zero"
      ? h(StepIn, { name: name, disabled: true })
      : h(StepIn, { name: name });
  const note =
    s === "trial"
      ? h(
          "div",
          { className: "qv-composer__note qv-mono", style: { fontSize: 12 } },
          h("span", { className: "qv-mark" }, G.clock(14)),
          "FREE CONVERSATION · " + (p.trialLeft || "18 H") + " LEFT",
        )
      : null;
  return h(
    "div",
    { className: "qv qv-composer" },
    note,
    top,
    inputRow("Message " + formatCopy("aiAuthor", { name }), false),
  );
}

/* ---------- access and money ---------- */
export function AccessLines(p: AccessLinesProps) {
  const name = p.name || "Maya";
  return h(
    "dl",
    { className: "qv qv-access" },
    h("dt", null, "You can"),
    h("dd", null, p.can || "message " + name + "'s AI."),
    h("dt", null, "Included"),
    h("dd", null, p.included || "with your Kiln Club membership."),
    h("dt", null, "By request"),
    h(
      "dd",
      null,
      p.byRequest ||
        "a written reply, a voice note, a call · priced by " +
          name +
          ", charged only if she accepts.",
    ),
    h("dt", null, "Changes"),
    h("dd", null, p.changes || "your Kiln Club membership renews Oct 14."),
  );
}
export function ModeList(p: ModeListProps) {
  const name = p.group || "qv-mode";
  return h(
    "fieldset",
    { className: "qv qv-modes" },
    h("legend", { className: "qv-sr" }, p.legend || "How Maya answers"),
    (p.modes || []).map(function (m, i) {
      const id = name + "-" + i;
      return h(
        "label",
        {
          key: id,
          htmlFor: id,
          className: cx(
            "qv-mode",
            m.selected && "is-selected",
            m.disabled && "is-disabled",
          ),
        },
        h("input", {
          id: id,
          type: "radio",
          name: name,
          defaultChecked: !!m.selected,
          disabled: !!m.disabled,
        }),
        h(
          "span",
          { className: "qv-mode__text" },
          h("span", { className: "qv-mode__title" }, m.title),
          h("span", { className: "qv-mode__meta" }, m.meta),
        ),
        h("span", { className: "qv-mode__price" }, m.price),
      );
    }),
  );
}
export function IncludeList(p: IncludeListProps) {
  return h(
    "div",
    { className: "qv qv-include" },
    h(
      "div",
      { className: "qv-include__item", style: { borderBottom: 0 } },
      h("input", {
        id: "qv-inc-summary",
        type: "checkbox",
        defaultChecked: true,
      }),
      h(
        "label",
        {
          htmlFor: "qv-inc-summary",
          className: "qv-include__label",
          style: { fontWeight: 600, fontSize: 15 },
        },
        "Summary of your question",
      ),
      p.edited
        ? h("span", { className: "qv-badge qv-ink-maya" }, "Edited by you")
        : null,
    ),
    h("label", { htmlFor: "qv-summary", className: "qv-sr" }, "Summary"),
    h("textarea", {
      id: "qv-summary",
      rows: 4,
      className: "qv-include__summary",
      defaultValue: p.summary,
    }),
    (p.items || []).map(function (it, i) {
      const id = "qv-inc-" + i;
      return h(
        "div",
        { key: id, className: "qv-include__item" },
        h("input", { id: id, type: "checkbox", defaultChecked: !!it.checked }),
        h(
          "label",
          { htmlFor: id, className: "qv-include__label" },
          h("span", null, it.label),
          it.help ? h("span", { className: "qv-help" }, it.help) : null,
        ),
      );
    }),
    p.notice === false
      ? null
      : h(
          "p",
          { className: "qv-help qv-include__notice" },
          formatCopy("packetAccess", { name: p.name || "Maya" }),
        ),
  );
}
export function TermsBlock(p: TermsBlockProps) {
  const name = p.name || "Maya",
    dl = p.deadline || "48 h";
  return h(
    "div",
    { className: "qv qv-terms" },
    h(
      "div",
      { className: "qv-terms__row" },
      h("span", null, "If " + name + " accepts"),
      h("span", null, p.price || "$25.00"),
    ),
    h(
      "div",
      { className: "qv-terms__row" },
      h("span", null, "If she declines or " + dl + " pass"),
      h("span", null, "$0.00"),
    ),
    h(
      "div",
      { className: "qv-terms__copy" },
      h(
        "p",
        null,
        h("b", null, "Charged only when " + name + " accepts."),
        " If she declines or " + dl + " pass, nothing is charged.",
      ),
      h("p", { className: "qv-help" }, copy.pendingHold),
      p.draftNote === false
        ? null
        : h("p", { className: "qv-help" }, formatCopy("draftNotice", { name })),
    ),
  );
}
export function EtaLine(p: EtaLineProps) {
  const name = p.name || "Maya";
  return h(
    "div",
    { className: "qv qv-eta" },
    h("span", { className: "qv-mark" }, G.clock()),
    h(
      "span",
      null,
      name +
        " usually decides in " +
        (p.range || "1 to 2 days") +
        (p.ahead != null ? " · " + p.ahead + " requests ahead of you" : ""),
    ),
  );
}
export function RequestStatus(p: RequestStatusProps) {
  return h(
    "section",
    { className: "qv qv-status", "aria-label": "Request status" },
    h(
      "div",
      { className: "qv-status__head" },
      h("span", { className: "qv-meta" }, p.reqId || "REQ-0412"),
      h("span", { className: "qv-status__rule" }),
      h(
        "span",
        { className: "qv-meta" },
        (p.mode || "Written reply") + " · " + (p.price || "$25"),
      ),
    ),
    h(
      "ol",
      { className: "qv-steps" },
      (p.steps || []).map(function (s, i) {
        return h(
          "li",
          { key: i, className: cx("qv-step", "is-" + (s.state || "todo")) },
          h("span", { className: "qv-step__dot", "aria-hidden": "true" }),
          h("span", { className: "qv-step__label" }, s.label),
          h("span", { className: "qv-step__time" }, s.time || ""),
        );
      }),
    ),
    p.outcome ? h("div", { className: "qv-outcome" }, p.outcome) : null,
    p.children || null,
  );
}
export function Receipt(p: ReceiptProps) {
  const name = p.name || "Maya";
  return h(
    "article",
    { className: "qv qv-receipt", style: { "--qv-cut": "var(--surface)" } },
    h(
      "div",
      {
        style: { display: "flex", justifyContent: "space-between" },
        className: "qv-meta",
      },
      h("span", null, brand.name + " · Receipt"),
      h("span", null, p.reqId || "REQ-0412"),
    ),
    h(
      "h3",
      { className: "qv-receipt__title" },
      p.title || "A written reply from " + name,
    ),
    h(
      "div",
      { className: "qv-receipt__rows" },
      (p.rows || []).map(function (r, i) {
        return h(
          "div",
          { key: i },
          h("span", null, r[0]),
          h("span", null, r[1]),
        );
      }),
    ),
    h(
      "div",
      { style: { display: "flex", alignItems: "center", gap: 10 } },
      h("span", { className: "qv-mark qv-ink-maya" }, G.sealCheck(30)),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 2 } },
        h(
          "span",
          {
            className: "qv-ink-maya",
            style: { fontWeight: 600, fontSize: 13 },
          },
          formatCopy("signedBy", { name }),
        ),
        h("span", { className: "qv-help" }, p.label || "Written by " + name),
      ),
    ),
  );
}
export function SpendLimit(p: SpendLimitProps) {
  const opts = p.options || ["$30", "$60", "$120", "No limit"];
  return h(
    "div",
    {
      className: "qv",
      style: { display: "flex", flexDirection: "column", gap: 12 },
    },
    h("div", { style: { fontWeight: 600, fontSize: 15 } }, copy.spendLimit),
    h(
      "fieldset",
      { className: "qv-limit" },
      h(
        "legend",
        { className: "qv-sr" },
        "Monthly limit for requests and memberships",
      ),
      opts.map(function (o, i) {
        const id = "qv-limit-" + i;
        return h(
          "label",
          { key: id, htmlFor: id },
          h("input", { id: id, type: "radio", name: "qv-limit" }),
          o,
        );
      }),
    ),
    h(
      "div",
      { className: "qv-help" },
      "Reminders at 50% and 100% of your limit are on. Lowering a limit is immediate.",
    ),
  );
}

/* ---------- studio ---------- */
export function QueueCard(p: QueueCardProps) {
  const k = p.kind || "packet";
  const due = h(
    "span",
    { className: cx("qv-due", p.overdue && "qv-due--overdue") },
    p.overdue ? "OVERDUE · " + p.due : p.due,
  );
  return h(
    "article",
    {
      className: cx(
        "qv",
        "qv-queue",
        k === "commitment" && "qv-queue--commitment",
        p.overdue && "qv-queue--overdue",
      ),
    },
    h(
      "div",
      { className: "qv-queue__top" },
      p.overdue
        ? h(
            "span",
            { className: "qv-mark", style: { color: "var(--alert)" } },
            G.alert(),
          )
        : null,
      h("span", { className: "qv-queue__handle" }, p.handle),
      due,
    ),
    h(
      "div",
      { className: "qv-meta" },
      (k === "commitment"
        ? "Accepted · "
        : k === "rule"
          ? "Matched your rule · "
          : "New request · ") +
        p.mode +
        " · " +
        p.price,
    ),
    h("p", { className: "qv-queue__summary" }, p.summary),
    h(
      "div",
      { className: "qv-queue__foot" },
      p.shared
        ? h("span", { className: "qv-help" }, "Shared: " + p.shared)
        : null,
      p.draftReady
        ? h("span", { className: "qv-badge qv-ink-ai" }, "AI draft ready")
        : null,
      h("span", { style: { flexGrow: 1 } }),
      k === "commitment"
        ? null
        : h(
            "button",
            { className: "qv-btn qv-btn--quiet", style: { fontSize: 13 } },
            "Decline · no charge",
          ),
      h(
        "button",
        {
          className: "qv-btn qv-btn--secondary",
          style: { minHeight: 44, fontSize: 14 },
        },
        k === "commitment" ? "Deliver" : "Open",
      ),
    ),
  );
}
export function CapacityHeader(p: CapacityHeaderProps) {
  return h(
    "section",
    { className: "qv qv-capacity", "aria-label": "This week" },
    h(
      "div",
      { className: "qv-meta", style: { color: "var(--on-maya-muted)" } },
      "This week",
    ),
    (p.rows || []).map(function (r, i) {
      return h(
        "div",
        { key: i, className: "qv-capacity__row" },
        h("span", null, r.mode),
        h(
          "span",
          null,
          r.used + " of " + r.limit + " used · " + (r.limit - r.used) + " left",
        ),
      );
    }),
    p.line ? h("div", { className: "qv-capacity__line" }, p.line) : null,
  );
}
export function LabelPreview(p: LabelPreviewProps) {
  return h(
    "div",
    { className: "qv qv-preview" },
    h("span", { className: "qv-help" }, "The fan will see this as:"),
    h(AuthorLabel, {
      kind: p.kind || "approved_draft",
      name: p.name || "Maya",
    }),
  );
}
export function SigningSheet(p: SigningSheetProps) {
  return h(
    "section",
    { className: "qv qv-sign", "aria-label": "Review and sign" },
    h("div", { className: "qv-sign__grab", "aria-hidden": "true" }),
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 4 } },
      h("div", { className: "qv-meta" }, "Review and sign"),
      h(
        "h3",
        {
          style: {
            margin: 0,
            fontFamily: "var(--font-serif)",
            fontWeight: 400,
            fontSize: 28,
            lineHeight: "32px",
          },
        },
        p.title || "Accept this request",
      ),
    ),
    h(
      "dl",
      { className: "qv-sign__rows", style: { margin: 0 } },
      (p.rows || []).map(function (r, i) {
        return h("div", { key: i }, h("dt", null, r[0]), h("dd", null, r[1]));
      }),
    ),
    h(
      "div",
      { className: "qv-help" },
      p.helper ??
        "Face ID signs exactly this. Any change needs a new signature.",
    ),
    h(
      "button",
      {
        className: "qv-btn qv-btn--maya qv-btn--lg qv-btn--block qv-on-maya",
        type: "button",
        onClick: p.onSign,
        disabled: p.disabled || p.signing,
        "aria-busy": p.signing || undefined,
      },
      h(
        "span",
        { className: "qv-ink-maya-accent", style: { display: "inline-flex" } },
        G.face(20),
      ),
      p.action || "Sign with Face ID",
    ),
  );
}
export function AuditBanner(p: AuditBannerProps) {
  return h(
    "div",
    { className: "qv qv-audit", role: "note" },
    h("span", { className: "qv-mark qv-ink-muted" }, G.info(18)),
    p.children || copy.auditAccess,
  );
}
export function SourceRow(p: SourceRowProps) {
  const scope = p.scope || "public";
  return h(
    "div",
    { className: "qv qv-source" },
    h(
      "div",
      { className: "qv-source__text" },
      h("span", { className: "qv-source__title" }, p.title),
      h("span", { className: "qv-help" }, p.meta),
    ),
    h(
      "span",
      { className: cx("qv-scope", scope !== "public" && "qv-scope--tier") },
      scope === "public" ? "Public" : scope,
    ),
    p.state === "candidate"
      ? h(
          "button",
          {
            className: "qv-btn qv-btn--secondary",
            style: { minHeight: 44, fontSize: 13, padding: "0 14px" },
          },
          "Approve",
        )
      : h(
          "button",
          { className: "qv-btn qv-btn--quiet", style: { fontSize: 13 } },
          p.state === "revoked" ? "Restore" : "Revoke",
        ),
  );
}

/* ---------- shared ---------- */
export function Button(p: ButtonProps) {
  const v = p.variant || "secondary";
  const cls = cx(
    "qv",
    "qv-btn",
    "qv-btn--" + v,
    p.size === "lg" && "qv-btn--lg",
    p.block && "qv-btn--block",
    v === "maya" && "qv-on-maya",
  );
  const kids = [
    v === "maya"
      ? h(Seal, { key: "s", size: 28, initial: p.initial || "M" })
      : null,
    p.children,
  ];
  if (p.href) return h("a", { className: cls, href: p.href }, ...kids);
  return h(
    "button",
    { className: cls, disabled: p.disabled, type: p.type || "button" },
    ...kids,
  );
}
export function TabBar(p: TabBarProps) {
  const tabs: [string, (s?: number) => React.ReactElement][] = [
    ["Home", G.home],
    ["Discover", G.compass],
    ["Requests", G.inbox],
    ["You", G.user],
  ];
  const active = p.active || "Home";
  return h(
    "nav",
    { className: "qv qv-tabbar", "aria-label": "Main" },
    tabs.map(function (t) {
      return h(
        "a",
        {
          key: t[0],
          href: "#",
          className: cx("qv-tab", active === t[0] && "is-active"),
          "aria-current": active === t[0] ? "page" : undefined,
        },
        t[1](22),
        t[0],
      );
    }),
  );
}
export function Segmented(p: SegmentedProps) {
  const items = p.items || ["Chat", "Posts", "Requests", "Access"],
    active = p.active || items[0];
  return h(
    "nav",
    {
      className: "qv qv-seg",
      "aria-label": p.label || "Sections",
      style: {
        gridTemplateColumns: "repeat(" + items.length + ", minmax(0, 1fr))",
      },
    },
    items.map(function (it) {
      return h(
        "a",
        {
          key: it,
          href: "#",
          "aria-current": it === active ? "page" : undefined,
        },
        it,
      );
    }),
  );
}
export function Notice(p: NoticeProps) {
  const tone = p.tone || "neutral";
  const icon =
    tone === "error" ? G.alert() : tone === "paused" ? G.pause() : G.info(16);
  return h(
    "div",
    {
      className: cx("qv", "qv-notice", "qv-notice--" + tone),
      role: tone === "error" ? "alert" : "status",
    },
    h("span", { className: "qv-notice__icon" }, icon),
    h(
      "div",
      null,
      p.title ? h("div", { style: { fontWeight: 600 } }, p.title) : null,
      h("div", null, p.children),
    ),
  );
}
export function NotificationRow(p: NotificationRowProps) {
  const k = p.kind || "ai",
    name = p.name || "Maya";
  const sender = {
    ai: formatCopy("aiAuthor", { name }),
    maya: name,
    note: formatCopy("noteAudience", {
      name,
      audience: p.audience || "Kiln Club members",
    }),
    approved: "Approved by " + name,
    reaction: formatCopy("reaction", { name }),
    team: name + "'s team",
    system: p.systemLabel || "Request update",
  }[k];
  const iconCls = {
    ai: "ai",
    maya: "maya",
    note: "maya",
    approved: "maya",
    reaction: "maya",
    team: "team",
    system: "system",
  }[k];
  const glyph =
    k === "ai"
      ? G.ring(16)
      : k === "note"
        ? G.broadcast(16)
        : k === "reaction"
          ? G.heart(15)
          : k === "team"
            ? G.team(16)
            : k === "system"
              ? G.inbox(18)
              : k === "approved"
                ? G.approved(16)
                : h(
                    "span",
                    {
                      style: {
                        fontFamily: "var(--font-serif)",
                        fontStyle: "italic",
                        fontSize: 20,
                      },
                    },
                    name.charAt(0),
                  );
  return h(
    "div",
    { className: cx("qv", "qv-notif", p.unread && "is-unread") },
    h(
      "span",
      {
        className: "qv-notif__icon qv-notif__icon--" + iconCls,
        "aria-hidden": "true",
      },
      glyph,
    ),
    h(
      "div",
      null,
      h("div", { className: "qv-notif__sender" }, sender),
      h("div", { className: "qv-notif__preview" }, p.children),
    ),
    h("span", { className: "qv-meta" }, p.time || ""),
  );
}
export function EmptyState(p: EmptyStateProps) {
  return h(
    "div",
    { className: "qv qv-empty" },
    h("h3", { className: "qv-empty__title" }, p.title),
    p.body ? h("p", { className: "qv-empty__body" }, p.body) : null,
    p.action || null,
  );
}
export function ShareCard(p: ShareCardProps) {
  const name = p.name || "Maya";
  return h(
    "article",
    {
      className: "qv qv-share qv-on-maya",
      style: { "--qv-cut": "var(--maya-surface)" },
      "aria-label":
        p.handle === null
          ? "Signed act by " + name
          : name + " replied to " + (p.handle || "@kilnfire"),
    },
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", gap: 14 } },
      h(AuthorLabel, { kind: "human_creator", name: name, onMaya: true }),
      h("p", { className: "qv-share__quote" }, p.children),
    ),
    h(
      "div",
      { className: "qv-share__foot" },
      h(
        "div",
        { style: { fontSize: 13, fontWeight: 600 } },
        p.handle === null
          ? "Signed by " + name
          : name + " replied to " + (p.handle || "@kilnfire"),
      ),
      h(SignedMarker, { name: name, time: p.time, href: signatureHref(p) }),
      h(
        "div",
        { className: "qv-share__verify" },
        "VERIFY AT " + (p.verify || brand.slug.toUpperCase() + ".APP/V/8KD2Q4"),
      ),
    ),
  );
}

/* ---------- calls and reserved states ---------- */
export function CallChip(p: CallChipProps) {
  const name = p.name || "Maya";
  return h(
    "div",
    { className: "qv qv-call" },
    h(
      "span",
      { className: "qv-call__who qv-on-maya" },
      h(Seal, { size: 24, live: true, initial: name.charAt(0) }),
      formatCopy("callAuthor", { name }),
    ),
    h(
      "div",
      { className: "qv-call__meta" },
      h(
        "span",
        {
          className: cx("qv-call__rec", p.recording && "is-recording"),
          role: "status",
        },
        h("span", { className: "qv-call__dot", "aria-hidden": "true" }),
        p.recording ? "Recording · both of you agreed" : copy.notRecording,
      ),
      p.time
        ? h(
            "span",
            { className: "qv-call__timer", role: "timer", "aria-live": "off" },
            p.time + (p.end ? " of " + p.end : ""),
          )
        : null,
    ),
  );
}
export function ReservedLabel(p: ReservedLabelProps) {
  const k = p.kind || "fan_agent",
    name = p.name || "Maya";
  const word =
    k === "fan_agent"
      ? (p.handle || "@kilnfire") + "'s assistant"
      : k === "ai_call"
        ? name + "'s AI · call"
        : name + "'s AI · video";
  const glyph =
    k === "fan_agent"
      ? G.dashRing(14)
      : k === "ai_call"
        ? G.phone(14)
        : G.video(14);
  return h(
    "div",
    { className: "qv qv-reserved", "aria-disabled": "true" },
    h(
      "span",
      { className: "qv-author" },
      h("span", { className: "qv-mark" }, glyph),
      h("span", null, word),
    ),
    h("span", { className: "qv-tag" }, "Reserved · not shown until enabled"),
  );
}

/* ---------- time ---------- */
export function Countdown(p: CountdownProps) {
  const tone = p.tone || "neutral";
  return h(
    "span",
    { className: cx("qv", "qv-countdown", "qv-countdown--" + tone) },
    tone === "overdue"
      ? h("span", { className: "qv-mark" }, G.alert(13))
      : h("span", { className: "qv-mark" }, G.clock(13)),
    (tone === "overdue" ? "OVERDUE · " : "") + p.children,
  );
}

/* ---------- studio, continued ---------- */
export function InsteadMenu(p: InsteadMenuProps) {
  const items = p.items || [
    [
      "Let my AI answer",
      "No charge. The request closes and your AI answers under its own label.",
    ],
    [
      "Convert to group answer",
      "Offer it at your group price. The fan accepts or keeps waiting.",
    ],
    [
      "Ask for more info",
      "The fan replies in the request. Your deadline pauses; the card hold's does not.",
    ],
    [
      "Decline · no charge",
      "Add a one-tap reason if you like. It never counts against you.",
    ],
  ];
  return h(
    "section",
    { className: "qv qv-instead", "aria-label": "Instead" },
    h(
      "div",
      { className: "qv-instead__head" },
      h("span", { className: "qv-meta" }, "Instead"),
      h(
        "span",
        { className: "qv-help" },
        "None of these charge the fan. Some need the fan's acceptance first.",
      ),
    ),
    h(
      "ul",
      { className: "qv-instead__list" },
      items.map(function (it, i) {
        return h(
          "li",
          { key: i },
          h(
            "button",
            { className: "qv-instead__item" },
            h(
              "span",
              { className: "qv-instead__text" },
              h("span", { className: "qv-instead__title" }, it[0]),
              h("span", { className: "qv-help" }, it[1]),
            ),
            h("span", { className: "qv-mark qv-ink-muted" }, G.chevron()),
          ),
        );
      }),
    ),
  );
}
export function TestConsole(p: TestConsoleProps) {
  const tests = p.tests || [];
  const failing = tests.filter(function (t) {
    return t.state === "fail";
  });
  return h(
    "section",
    { className: "qv qv-console", "aria-label": "Boundary tests" },
    h(
      "div",
      { className: "qv-console__head" },
      h(
        "span",
        { className: "qv-meta" },
        "Boundary tests · " + (p.version || "V4 DRAFT"),
      ),
      h(
        "span",
        { className: "qv-meta" },
        tests.length - failing.length + " OF " + tests.length + " PASS",
      ),
    ),
    h(
      "ol",
      { className: "qv-console__list" },
      tests.map(function (t, i) {
        return h(
          "li",
          {
            key: i,
            className: cx("qv-console__row", "is-" + (t.state || "pass")),
          },
          h(
            "span",
            { className: "qv-console__state" },
            t.state === "fail"
              ? G.alert(14)
              : t.state === "running"
                ? G.clock(14)
                : G.check(14),
          ),
          h("span", { className: "qv-console__name" }, t.name),
          h(
            "span",
            { className: "qv-console__result" },
            t.state === "fail"
              ? "Fails"
              : t.state === "running"
                ? "Running"
                : "Passes",
          ),
        );
      }),
    ),
    p.transcript
      ? h(
          "div",
          { className: "qv-console__transcript" },
          h(
            "div",
            { className: "qv-meta" },
            "Transcript · " + p.transcript.test,
          ),
          h(
            "div",
            { className: "qv-console__line" },
            h("span", { className: "qv-console__who" }, "Test fan"),
            h("span", null, p.transcript.fan),
          ),
          h(
            "div",
            { className: "qv-console__line" },
            h("span", { className: "qv-console__who qv-ink-ai" }, "Maya's AI"),
            h("span", null, p.transcript.ai),
          ),
          p.transcript.why
            ? h("div", { className: "qv-console__why" }, p.transcript.why)
            : null,
        )
      : null,
    h(
      "div",
      { className: "qv-console__foot" },
      h(
        Button,
        { variant: "ai", disabled: failing.length > 0 },
        "Publish " + (p.versionShort || "v4"),
      ),
      failing.length
        ? h(
            "span",
            { className: "qv-help" },
            "Publishing waits until every test passes · failing: " +
              failing
                .map(function (t) {
                  return t.name.toLowerCase();
                })
                .join(", "),
          )
        : h(
            "span",
            { className: "qv-help" },
            "Every test passes. Publishing makes this version live for every fan.",
          ),
    ),
  );
}
export function VersionList(p: VersionListProps) {
  return h(
    "ol",
    { className: "qv qv-versions", "aria-label": "Versions" },
    (p.versions || []).map(function (v, i) {
      return h(
        "li",
        {
          key: i,
          className: cx("qv-version", v.state === "live" && "is-live"),
        },
        h("span", { className: "qv-version__id" }, v.id),
        h(
          "span",
          { className: "qv-version__text" },
          h("span", { className: "qv-version__changes" }, v.changes),
          h("span", { className: "qv-meta" }, v.date),
        ),
        v.state === "live"
          ? h("span", { className: "qv-badge qv-ink-ai" }, "Live")
          : v.state === "draft"
            ? h("span", { className: "qv-badge qv-ink-muted" }, "Draft")
            : h(
                "button",
                { className: "qv-btn qv-btn--quiet", style: { fontSize: 13 } },
                "Roll back to " + v.id,
              ),
      );
    }),
  );
}
export function DigestItem(p: DigestItemProps) {
  return h(
    "article",
    { className: "qv qv-digest" },
    h(
      "div",
      { className: "qv-digest__top" },
      h(AuthorLabel, { kind: "ai", name: p.name || "Maya", time: p.time }),
      h(
        "span",
        { className: "qv-meta" },
        "TO " + (p.handle || "@kilnfire").toUpperCase(),
      ),
    ),
    h("p", { className: "qv-digest__text" }, p.children),
    p.filed
      ? h(
          "div",
          { className: "qv-digest__filed" },
          h("span", { className: "qv-mark" }, G.check(14)),
          "Filed as a test case · every future version is checked against it",
        )
      : h(
          "button",
          {
            className: "qv-link-btn",
            style: { color: "var(--ink)", paddingLeft: 0 },
          },
          "I'd never say that",
        ),
  );
}

/* ---------- navigation ---------- */
export function StudioTabBar(p: StudioTabBarProps) {
  const tabs: [string, (s?: number) => React.ReactElement][] = [
    ["Notes", G.broadcast],
    ["Requests", G.inbox],
    ["Threads", G.threads],
    ["My AI", G.ring],
    ["More", G.more],
  ];
  const active = p.active || "Requests";
  return h(
    "nav",
    { className: "qv qv-tabbar qv-tabbar--studio", "aria-label": "Studio" },
    tabs.map(function (t) {
      const badge =
        t[0] === "Requests" && p.requests
          ? h(
              "span",
              { className: "qv-count", "aria-label": p.requests + " waiting" },
              p.requests,
            )
          : null;
      return h(
        "a",
        {
          key: t[0],
          href: "#",
          className: cx("qv-tab", active === t[0] && "is-active"),
          "aria-current": active === t[0] ? "page" : undefined,
        },
        h(
          "span",
          { className: "qv-tab__icon" },
          t[1](t[0] === "Notes" ? 17 : 22),
          badge,
        ),
        t[0],
      );
    }),
  );
}
export function Sidebar(p: SidebarProps) {
  const name = p.name || "Maya",
    active = p.active || "Requests";
  const main: [string, (s?: number) => React.ReactElement][] = [
    ["Notes", G.broadcast],
    ["Requests", G.inbox],
    ["Threads", G.threads],
    ["My AI", G.ring],
  ];
  const more: [string, (s?: number) => React.ReactElement][] = [
    ["Offers", G.tag],
    ["Publish", G.pen],
    ["Insights", G.chart],
    ["Earnings", G.coin],
    ["Team", G.people],
  ];
  function item(t: [string, (s?: number) => React.ReactElement]) {
    const count =
      t[0] === "Requests" && p.requests
        ? h("span", { className: "qv-count" }, p.requests)
        : null;
    return h(
      "a",
      {
        key: t[0],
        href: "#",
        className: cx("qv-side__item", active === t[0] && "is-active"),
        "aria-current": active === t[0] ? "page" : undefined,
      },
      h(
        "span",
        { className: "qv-side__icon" },
        t[1](t[0] === "Notes" ? 15 : 20),
      ),
      h("span", { className: "qv-side__label" }, t[0]),
      count,
    );
  }
  return h(
    "nav",
    { className: "qv qv-side", "aria-label": "Studio" },
    h(
      "div",
      { className: "qv-side__who" },
      h(Avatar, { initial: name.charAt(0) }),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 2 } },
        h("span", { style: { fontWeight: 600, fontSize: 15 } }, name),
        h("span", { className: "qv-side__product" }, brand.studioName),
      ),
    ),
    h("div", { className: "qv-side__group" }, main.map(item)),
    h("div", { className: "qv-side__rule", role: "presentation" }),
    h("div", { className: "qv-side__group" }, more.map(item)),
    h(
      "div",
      { className: "qv-side__status" },
      h("span", { className: "qv-mark qv-ink-ai" }, G.ring(12)),
      h("span", null, p.status || "Your AI is live · v4"),
    ),
  );
}

/* ---------- overlays and feedback ---------- */
export function Sheet(p: SheetProps) {
  return h(
    "section",
    { className: "qv qv-sheet", role: "dialog", "aria-label": p.title },
    h("div", { className: "qv-sign__grab", "aria-hidden": "true" }),
    h(
      "div",
      { className: "qv-sheet__head" },
      p.meta ? h("div", { className: "qv-meta" }, p.meta) : null,
      h("h3", { className: "qv-sheet__title" }, p.title),
      h(
        "button",
        { className: "qv-icon-btn qv-sheet__close", "aria-label": "Close" },
        G.close(),
      ),
    ),
    h("div", { className: "qv-sheet__body" }, p.children),
    p.actions ? h("div", { className: "qv-sheet__actions" }, p.actions) : null,
  );
}
export function Dialog(p: DialogProps) {
  return h(
    "div",
    { className: "qv qv-dialog", role: "alertdialog", "aria-label": p.title },
    h("h3", { className: "qv-dialog__title" }, p.title),
    h("div", { className: "qv-dialog__body" }, p.children),
    h(
      "div",
      { className: "qv-dialog__actions" },
      h(Button, { variant: "quiet" }, p.cancel || "Cancel"),
      h(
        "button",
        { className: "qv-btn qv-btn--secondary" },
        p.confirm || "Confirm",
      ),
    ),
  );
}
export function Toast(p: ToastProps) {
  return h(
    "div",
    { className: "qv qv-toast", role: "status" },
    h("span", { className: "qv-mark" }, G.check(16)),
    h("span", { className: "qv-toast__text" }, p.children),
    p.action
      ? h(
          "button",
          { className: "qv-link-btn", style: { color: "var(--ink)" } },
          p.action,
        )
      : null,
  );
}
export function Skeleton(p: SkeletonProps) {
  const k = p.kind || "message";
  if (k === "row")
    return h(
      "div",
      { className: "qv qv-skel-row", "aria-hidden": "true" },
      h("span", {
        className: "qv-skel",
        style: { width: 38, height: 38, borderRadius: 11 },
      }),
      h(
        "span",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: 8,
            flexGrow: 1,
          },
        },
        h("span", {
          className: "qv-skel",
          style: { width: "40%", height: 12 },
        }),
        h("span", {
          className: "qv-skel",
          style: { width: "80%", height: 12 },
        }),
      ),
    );
  return h(
    "div",
    { className: "qv qv-skel-msg", "aria-hidden": "true" },
    h("span", { className: "qv-skel", style: { width: 88, height: 12 } }),
    h("span", {
      className: "qv-skel",
      style: {
        width: "100%",
        height: 72,
        borderRadius:
          "var(--radius-tail) var(--radius-lg) var(--radius-lg) var(--radius-lg)",
      },
    }),
  );
}

/* ---------- email ---------- */
export function EmailFrame(p: EmailFrameProps) {
  const k = p.kind || "human_creator",
    name = p.name || "Maya";
  const human = k === "human_creator";
  const from =
    p.from ||
    (human
      ? name + " via " + brand.name
      : k === "ai"
        ? name + "'s AI via Qelvora"
        : brand.name);
  const body = human
    ? h(
        "div",
        {
          className: "qv-email__quote qv-on-maya",
          style: { "--qv-cut": "var(--maya-surface)" },
        },
        h(AuthorLabel, { kind: k, name: name, time: p.time, onMaya: true }),
        h("p", { className: "qv-voice" }, p.children),
        h(SignedMarker, { name: name, href: signatureHref(p) }),
      )
    : h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 10 } },
        h(AuthorLabel, { kind: k, name: name, time: p.time }),
        h("p", { className: "qv-email__text" }, p.children),
      );
  return h(
    "article",
    { className: "qv qv-email", "aria-label": "Email preview" },
    h(
      "div",
      { className: "qv-email__meta" },
      h("span", null, "From: " + from),
      h("span", null, "Subject: " + p.subject),
    ),
    h(
      "div",
      { className: "qv-email__sheet" },
      h("div", { className: "qv-email__brand" }, brand.name),
      body,
      h(
        "a",
        {
          className: "qv-btn qv-btn--secondary",
          href: p.ctaHref || signatureHref(p) || "#",
          style: { alignSelf: "flex-start" },
        },
        p.cta || "Read it in " + brand.name,
      ),
      h(
        "div",
        { className: "qv-email__foot" },
        p.footer ||
          "You get this email because you asked " +
            name +
            " to step in. Manage email for each creator, set quiet hours or hide sensitive previews in You › Notifications.",
      ),
    ),
  );
}

export const glyphs = G;
