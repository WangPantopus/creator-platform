import { randomUUID } from "node:crypto";
import { DomainError } from "../../core/errors.js";

/** Conservative character budget for ~400 tokens. Offsets always identify exact stored text. */
export function chunkText(text: string) {
  if (
    Buffer.byteLength(text, "utf8") > 1_000_000 ||
    text.includes("\u0000") ||
    [...text].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 && ![9, 10, 13].includes(code);
    })
  )
    throw new DomainError(
      "source_damaged",
      "Use a readable UTF-8 text file, up to 1 MB.",
      400,
    );
  const chunks: {
    id: string;
    ordinal: number;
    text: string;
    start: number;
    end: number;
  }[] = [];
  // Never cut between the two halves of an emoji or other astral character:
  // a lone half is stored as U+FFFD and the chunk no longer equals its span.
  const whole = (at: number) =>
    at > 0 &&
    at < text.length &&
    text.charCodeAt(at) >= 0xdc00 &&
    text.charCodeAt(at) <= 0xdfff &&
    text.charCodeAt(at - 1) >= 0xd800 &&
    text.charCodeAt(at - 1) <= 0xdbff
      ? at - 1
      : at;
  for (let start = 0; start < text.length; ) {
    let end = Math.min(start + 1600, text.length);
    if (end < text.length) {
      const breakAt = Math.max(
        text.lastIndexOf("\n", end),
        text.lastIndexOf(". ", end),
        text.lastIndexOf(" ", end),
      );
      if (breakAt > start + 1200) end = breakAt + 1;
      end = whole(end);
    }
    chunks.push({
      id: randomUUID(),
      ordinal: chunks.length,
      text: text.slice(start, end),
      start,
      end,
    });
    if (end === text.length) break;
    start = whole(end - 200);
  }
  if (chunks.length > 200)
    throw new DomainError(
      "source_large",
      "Split this source into smaller files before importing.",
      400,
    );
  return chunks;
}
