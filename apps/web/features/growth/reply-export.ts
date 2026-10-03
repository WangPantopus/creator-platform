import { copy } from "@qelvora/copy";

export interface ReplyExport {
  id: string;
  version: number;
  sourceHash: string;
  authorLabel: string;
  authorKind: "human_creator" | "approved_draft";
  verificationURL: string;
  text: string;
}

export function replyID(value: string) {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(
    value,
  );
}

// The complete native/web artifact includes the current correction as well as
// the immutable reply. Compare every field again after local rendering.
export function parseReplyExport(value: unknown, id: string): ReplyExport {
  if (!value || typeof value !== "object")
    throw new Error(copy.growthCardUnavailable);
  const source = value as Partial<ReplyExport>;
  if (
    !replyID(id) ||
    source.id !== id ||
    !Number.isSafeInteger(source.version) ||
    source.version! < 1 ||
    typeof source.sourceHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(source.sourceHash) ||
    typeof source.authorLabel !== "string" ||
    !source.authorLabel.length ||
    source.authorLabel.length > 512 ||
    !["human_creator", "approved_draft"].includes(source.authorKind ?? "") ||
    typeof source.text !== "string" ||
    !source.text.length ||
    source.text.length > 128000 ||
    typeof source.verificationURL !== "string" ||
    source.verificationURL.length > 2048
  )
    throw new Error(copy.growthCardUnavailable);
  const url = new URL(source.verificationURL);
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.pathname !== `/share/${id}` ||
    url.search ||
    url.hash
  )
    throw new Error(copy.growthImageNeedsOrigin);
  return {
    id,
    version: source.version!,
    sourceHash: source.sourceHash,
    authorLabel: source.authorLabel,
    authorKind: source.authorKind!,
    verificationURL: source.verificationURL,
    text: source.text,
  };
}

export function sameReplyExport(a: ReplyExport, b: ReplyExport) {
  return (
    a.id === b.id &&
    a.version === b.version &&
    a.sourceHash === b.sourceHash &&
    a.authorLabel === b.authorLabel &&
    a.authorKind === b.authorKind &&
    a.verificationURL === b.verificationURL &&
    a.text === b.text
  );
}
