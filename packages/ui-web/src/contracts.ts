import type * as React from "react";

/** Every author in a conversation. Each carries a surface, a mark, a word and a color that travel together. */
export type AuthorKind =
  | "ai"
  | "approved_draft"
  | "human_creator"
  | "human_broadcast"
  | "human_reaction"
  | "team"
  | "correction";

/* ---------- identity ---------- */

/** The authorship mark for one author. Draw it only beside that author's own words. */
export interface MarkProps {
  kind?: AuthorKind;
  /** Glyph size in px. Default 14 (ring, team), 16 (seal, broadcast). */
  size?: number;
  /** The creator's initial, for `human_creator`. Default "M". */
  initial?: string;
  /** Adds the house lights to the seal while the creator is present. */
  live?: boolean;
  /** Set when the mark sits on `maya-surface`, so it takes `maya-accent` instead of `maya-ink`. */
  onMaya?: boolean;
}

/** The creator's filled seal with her initial. */
export interface SealProps {
  initial?: string;
  /** Diameter in px. Default 18. */
  size?: number;
  /** House lights: a ground gap, an accent ring and `glow-maya`. Only while she is in the conversation. */
  live?: boolean;
}

/** The creator's 38px avatar tile for headers and lists. */
export interface AvatarProps {
  initial?: string;
  live?: boolean;
}

/** The mark plus the fixed author word that sits above or inside every message. */
export interface AuthorLabelProps {
  kind?: AuthorKind;
  /** The creator's name. Default "Maya". */
  name?: string;
  /** For `human_broadcast`. Default "Kiln Club members". */
  audience?: string;
  /** For `team`. Default "Priya". */
  member?: string;
  /** Shown in mono after the label, e.g. "14:38". */
  time?: string;
  onMaya?: boolean;
}

/** The strip under a thread header that names who reads the fan's next message. It never scrolls away. */
export interface IdentityStripProps {
  state?: "ai" | "human" | "team" | "paused" | "updating";
  name?: string;
}

/** The thread header: back, avatar, name and a subtitle that says what the thread is. */
export interface ThreadHeaderProps {
  name?: string;
  /** Default "Official AI · Kiln Club". Replaced by "In this conversation" while `live`. */
  subtitle?: string;
  live?: boolean;
}

/** "Signed by Maya", a link to the verification page, on every act made under her name. */
export interface SignedMarkerProps {
  name?: string;
  time?: string;
  /** A second meta item, e.g. "312 members" or "Recorded by Maya". */
  extra?: string;
  /** The verification page. */
  href?: string;
  /** Server-issued signed act; uses the public metadata verifier. */
  signedActId?: string;
  size?: number;
}

/** A centered status line that announces a change of speaker, a date or an event. */
export interface SystemLineProps {
  variant?: "plain" | "presence" | "date";
  /** For `presence`. */
  name?: string;
  /** For `presence`. */
  time?: string;
  /** The sentence, for `plain` and `date`. */
  children?: React.ReactNode;
}

/* ---------- conversation ---------- */

/** One message in a thread, drawn with its author's surface, mark, word and color. */
export interface SignedActPresentation {
  /** Server-issued act ID, never a locally synthesized identity. */
  signedActId?: string;
  /** Owner-supplied verification destination, when routing outside this host. */
  verificationHref?: string;
}

export interface MessageProps extends SignedActPresentation {
  kind?: "fan" | "ai" | "team" | "human_creator" | "approved_draft";
  name?: string;
  /** For `team`. */
  member?: string;
  time?: string;
  /** `fan`: pending | failed. `ai`: accepted (typing) | streaming | interrupted. */
  delivery?: "pending" | "failed" | "accepted" | "streaming" | "interrupted";
  /** For `approved_draft`. Default "split". */
  treatment?: "split" | "gradient" | "stacked";
  /** For `ai`: a CitationChip placed inside the panel. */
  citation?: React.ReactNode;
  /** For `human_creator`: house lights while she is in the conversation. */
  live?: boolean;
  /** For `fan`: a meta line under the bubble, e.g. "Seen by Maya's queue". */
  meta?: React.ReactNode;
  /** For `fan`: content under the bubble, e.g. a ReactionChip. */
  after?: React.ReactNode;
  /** For `ai`: false hides "This helped" and "Report". */
  actions?: boolean;
  /** For `ai`: a listed sponsor the reply mentions. Adds "Paid partnership: Maya is paid by {sponsor}." */
  sponsor?: string;
  children?: React.ReactNode;
}

/** A Note: the creator's one-to-many post, always labeled with its audience. */
export interface NoteProps extends SignedActPresentation {
  name?: string;
  /** Default "Kiln Club members". */
  audience?: string;
  time?: string;
  /** A caption for attached media; shows a labeled placeholder row. */
  media?: string;
  /** Optional audience size shown beside the Signed marker, e.g. "312". */
  audienceSize?: string | number;
  /** false hides the private reply field. */
  reply?: boolean;
  replyId?: string;
  /** Shows "Maya removed this Note" instead of the card. */
  retracted?: boolean;
  children?: React.ReactNode;
}

/** The pill that shows the creator reacted to a fan's message. */
export interface ReactionChipProps extends SignedActPresentation {
  name?: string;
}

/** A source the AI used, shown inside its panel and linking to the source. */
export interface CitationChipProps {
  title?: string;
  meta?: string;
  /** Short mono text in the stamp, e.g. "PDF". Default: a play glyph. */
  stamp?: React.ReactNode;
  href?: string;
  /** The source was removed or the fan lost access to it. */
  unavailable?: boolean;
}

/** What the AI remembers about the fan, and the question it asks before remembering. */
export interface MemoryChipProps {
  text?: string;
  variant?: "saved" | "ask";
}

/** The creator's signed correction attached under an AI reply. */
export interface CorrectionProps extends SignedActPresentation {
  name?: string;
  /** The AI reply being corrected, kept visible. */
  aiText?: React.ReactNode;
  aiTime?: string;
  /** When the correction was signed. */
  time?: string;
  /** The correction, in her words. */
  children?: React.ReactNode;
}

/** The post a fan arrived from, attached to their first message and removable. */
export interface ContextCardProps {
  /** Default "From Instagram". */
  source?: string;
  title?: string;
  onRemove?: () => void;
}

/** A voice note: the creator's recording, or the AI's synthesized voice, never confusable. */
export interface VoiceNoteProps extends SignedActPresentation {
  kind?: "human" | "ai";
  name?: string;
  time?: string;
  /** Default "0:42". */
  duration?: string;
  transcript?: React.ReactNode;
}

/** The pinned bottom of a thread: the step-in button and the message field, in every access state. */
export interface ComposerProps {
  state?: "ai" | "trial" | "paused" | "ended" | "human" | "capacity_zero";
  name?: string;
  /** For `trial`, uppercase mono, e.g. "18 H". */
  trialLeft?: string;
  /** For `paused`. Default "Monday". */
  backDate?: string;
  /** The input id. Unique per page. */
  id?: string;
}

/** Ask Maya to step in: the only person-colored button in a thread. */
export interface StepInProps {
  name?: string;
  disabled?: boolean;
  /** The reason shown beside a disabled button. */
  note?: string;
}

/* ---------- access and money ---------- */

/** The four fixed lines that say what a fan can do, what is included, what costs extra and what changes next. */
export interface AccessLinesProps {
  name?: string;
  can?: React.ReactNode;
  included?: React.ReactNode;
  byRequest?: React.ReactNode;
  changes?: React.ReactNode;
}

export interface Mode {
  title: string;
  meta?: string;
  /** "$25". Never "from $". */
  price?: string;
  selected?: boolean;
  disabled?: boolean;
}
/** Radio rows for how the creator can answer a request, each with its price. */
export interface ModeListProps {
  modes: Mode[];
  /** The radio group name. Unique per page. */
  group?: string;
  legend?: string;
}

export interface IncludeItem {
  label: string;
  help?: string;
  checked?: boolean;
}
/** The packet editor: an editable summary and the items the fan chooses to share. */
export interface IncludeListProps {
  summary?: string;
  items?: IncludeItem[];
  /** Shows "Edited by you" beside the summary. */
  edited?: boolean;
  /** false hides the fixed access notice under the list. */
  notice?: boolean;
  name?: string;
}

/** The fixed money copy under every request: the two outcomes and the hold note. */
export interface TermsBlockProps {
  name?: string;
  /** Default "$25.00". */
  price?: string;
  /** Default "48 h". */
  deadline?: string;
  /** false hides the approved-draft note. */
  draftNote?: boolean;
}

/** How long the creator usually takes to decide, as a range. */
export interface EtaLineProps {
  name?: string;
  /** Default "1 to 2 days". */
  range?: string;
  /** Requests ahead of this one. */
  ahead?: number;
}

export interface Step {
  label: string;
  time?: string;
  state?: "done" | "current" | "todo";
}
/** A request's ID, mode, price and step-by-step progress. */
export interface RequestStatusProps {
  reqId?: string;
  mode?: string;
  price?: string;
  steps?: Step[];
  /** A closing line, e.g. "Maya passed on this one · nothing charged". */
  outcome?: React.ReactNode;
  children?: React.ReactNode;
}

/** A dated receipt for a delivered request, signed with the seal. */
export interface ReceiptProps {
  name?: string;
  reqId?: string;
  title?: string;
  /** [label, value] pairs. */
  rows?: [string, string][];
  /** The authorship line under the seal. Default "Written by Maya". */
  label?: string;
}

/** The monthly spend limit picker. */
export interface SpendLimitProps {
  /** Default ["$30", "$60", "$120", "No limit"]. */
  options?: string[];
  /** Current saved reminder state. Omit when it is unavailable. */
  remindersOn?: boolean | null;
}

/* ---------- studio ---------- */

/** One item in the creator's request queue: a new packet, an accepted commitment or a rule match. */
export interface QueueCardProps {
  kind?: "packet" | "commitment" | "rule";
  handle?: string;
  mode?: string;
  price?: string;
  /** Uppercase mono, e.g. "DECIDE BY OCT 5". */
  due?: string;
  summary?: string;
  /** What the fan chose to share. */
  shared?: string;
  draftReady?: boolean;
  overdue?: boolean;
}

export interface CapacityRow {
  mode: string;
  used: number;
  limit: number;
}
/** The creator's weekly capacity by mode. */
export interface CapacityHeaderProps {
  rows?: CapacityRow[];
  line?: React.ReactNode;
}

/** Shows the creator exactly which label the fan will see before she sends. */
export interface LabelPreviewProps {
  kind?: AuthorKind;
  name?: string;
}

/** The sheet where the creator reviews and signs an act made under her name. */
export interface SigningSheetProps {
  title?: string;
  rows?: [string, string][];
  /** Default "Sign with Face ID". */
  action?: string;
  onSign?: () => void;
  disabled?: boolean;
  signing?: boolean;
  helper?: React.ReactNode;
}

/** The fixed notice that opening a fan's conversation is logged and visible to the fan. */
export interface AuditBannerProps {
  children?: React.ReactNode;
}

/** One knowledge source for the creator's AI, with its scope and its approve or revoke action. */
export interface SourceRowProps {
  title?: string;
  meta?: string;
  /** "public", or a tier name such as "Kiln Club". */
  scope?: string;
  state?: "approved" | "candidate" | "revoked";
}

/* ---------- shared ---------- */

/** Buttons. `ai` and `maya` belong to their authors; `secondary` and `quiet` are neutral. */
export interface ButtonProps {
  variant?: "ai" | "maya" | "secondary" | "quiet";
  size?: "md" | "lg";
  block?: boolean;
  href?: string;
  /** For `maya`: the initial in the seal. */
  initial?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  children?: React.ReactNode;
}

/** The fan app's four tabs. */
export interface TabBarProps {
  active?: "Home" | "Discover" | "Requests" | "You";
  /** Shipping route destinations; design previews may omit them. */
  hrefs?: Partial<Record<"Home" | "Discover" | "Requests" | "You", string>>;
}

/** A segmented section switcher. */
export interface SegmentedProps {
  items?: string[];
  active?: string;
  label?: string;
}

/** An inline notice with a tone, a title and a sentence. */
export interface NoticeProps {
  tone?: "neutral" | "paused" | "error" | "offline";
  title?: string;
  children?: React.ReactNode;
}

/** One row in the notifications list, with its author's mark and word. */
export interface NotificationRowProps {
  kind?: "ai" | "maya" | "note" | "approved" | "reaction" | "team" | "system";
  name?: string;
  audience?: string;
  /** For `system`. Default "Request update". */
  systemLabel?: string;
  time?: string;
  unread?: boolean;
  children?: React.ReactNode;
}

/** An empty list: what will appear here and one way forward. */
export interface EmptyStateProps {
  title: string;
  body?: string;
  action?: React.ReactNode;
}

/** The square card a fan shares of the creator's reply, with a verification address. */
export interface ShareCardProps extends SignedActPresentation {
  name?: string;
  /** null when the sharer is not disclosed; undefined retains catalog copy. */
  handle?: string | null;
  time?: string;
  /** Uppercase address, e.g. "QELVORA.APP/V/8KD2Q4". */
  verify?: string;
  children?: React.ReactNode;
}

/* ---------- calls and reserved states ---------- */

/** The person-colored chip pinned for a whole live call: "Maya · the person", the recording state and the fixed-length timer. */
export interface CallChipProps {
  name?: string;
  /** Connected time, e.g. "08:42". */
  time?: string;
  /** The fixed end, e.g. "10:00". */
  end?: string;
  /** Only when both people agreed to a recording. Default false: "Not recording". */
  recording?: boolean;
}

/** A reserved authorship state, drawn but disabled: never shown to fans until it is enabled. */
export interface ReservedLabelProps {
  kind?: "fan_agent" | "ai_call" | "ai_video";
  name?: string;
  /** For `fan_agent`. Default "@kilnfire". */
  handle?: string;
}

/** A mono time pill: a trial, a decision deadline, a call starting or an overdue commitment. */
export interface CountdownProps {
  tone?: "neutral" | "soon" | "overdue";
  /** Uppercase text, e.g. "31 H LEFT TO DECIDE". `overdue` prefixes "OVERDUE ·". */
  children?: React.ReactNode;
}

/* ---------- studio, continued ---------- */

/** The actions behind "Instead" on a packet: none of them fulfills the paid mode, and none charges the fan. */
export interface InsteadMenuProps {
  name?: string;
  /** [title, explanation] pairs. Default: the four fixed actions. */
  items?: [string, string][];
}

export interface BoundaryTest {
  name: string;
  state?: "pass" | "fail" | "running";
}
/** The boundary tests a draft version must pass before publishing, with the transcript of a failing case. */
export interface TestConsoleProps {
  tests?: BoundaryTest[];
  /** Uppercase, e.g. "V4 DRAFT". */
  version?: string;
  /** Used in the Publish button, e.g. "v4". */
  versionShort?: string;
  transcript?: { test: string; fan: string; ai: string; why?: string };
}

export interface AgentVersion {
  id: string;
  state?: "draft" | "live" | "retired";
  date?: string;
  changes?: string;
}
/** The AI's versions with the live pointer, what changed and rollback. */
export interface VersionListProps {
  versions?: AgentVersion[];
}

/** One AI reply in the 72-hour digest after publishing, with "I'd never say that". */
export interface DigestItemProps {
  name?: string;
  handle?: string;
  time?: string;
  /** The reply was flagged and filed as a test case. */
  filed?: boolean;
  children?: React.ReactNode;
}

/* ---------- navigation ---------- */

/** The studio's phone tabs: Notes, Requests, Threads, My AI and More. */
export interface StudioTabBarProps {
  active?: "Notes" | "Requests" | "Threads" | "My AI" | "More";
  /** Waiting packets and due commitments. */
  requests?: number;
}

/** The studio's desktop sidebar: the four phone sections, then Offers, Publish, Insights, Earnings and Team. */
export interface SidebarProps {
  name?: string;
  active?: string;
  requests?: number;
  /** Default "Your AI is live · v4". */
  status?: string;
}

/* ---------- overlays and feedback ---------- */

/** A bottom sheet with a grabber, a display title, a body and stacked actions. */
export interface SheetProps {
  title: string;
  meta?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

/** A confirmation dialog for a consequential, hard-to-undo action. */
export interface DialogProps {
  title: string;
  confirm?: string;
  cancel?: string;
  /** Marks the action as destructive for assistive tech; the style stays neutral. */
  destructive?: boolean;
  children?: React.ReactNode;
}

/** A short confirmation that something happened, with at most one action. */
export interface ToastProps {
  action?: string;
  children?: React.ReactNode;
}

/** Loading placeholders, shown only after 300 ms. */
export interface SkeletonProps {
  kind?: "message" | "row";
}

/* ---------- email ---------- */

/** The email layout: the sender label set by the product, a preview that respects restrictions, one link back. */
export interface EmailFrameProps extends SignedActPresentation {
  kind?: AuthorKind;
  name?: string;
  from?: string;
  subject: string;
  time?: string;
  cta?: string;
  ctaHref?: string;
  footer?: string;
  children?: React.ReactNode;
}
