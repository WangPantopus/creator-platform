export type Creator = {
  id: string;
  display_name: string;
  handle: string;
  verification: string;
  owned: boolean;
  roles: string[];
  memberHandle: string | null;
  viewerAccountId: string;
};
export type Page<T> = { items: T[]; nextCursor: string | null };
export type QueueItem = {
  id: string;
  fan_id: string;
  handle: string;
  version: number;
  state: string;
  payment_state: string;
  decision_at: string;
  deadline: string;
  commitment_id: string | null;
  commitment_state: string | null;
  commitment_version: number;
  due_at: string | null;
  snapshot: {
    title: string;
    mode: string;
    amount: number;
    currency: string;
    shareable: boolean;
  };
  disclosure: {
    summary?: string;
    identity?: "handle" | "shared_intro";
    wholeThread?: boolean;
    attachmentIds?: string[];
    attachments?: unknown[];
    messages?: { text: string }[];
  };
};
export type Queue = Page<QueueItem> & {
  capacity: {
    title: string;
    weekly_limit: number;
    used: number;
    reserved: number;
  }[];
  serverTime: string;
  requests: number;
};
export type Packet = {
  groupModes: {
    id: string;
    title: string;
    kind: string;
    amount: string;
    currency: string;
    version: number;
  }[];
  packet: QueueItem & {
    thread_id: string;
    creator_id: string;
    hold_expires_at: string;
    accepted_at: string | null;
    proposed_mode: unknown;
  };
  commitment: {
    id: string;
    version: number;
    state: string;
    due_at: string;
  } | null;
  ledger: { kind: string; amount: number; currency: string; cause: string }[];
  share: unknown;
};
