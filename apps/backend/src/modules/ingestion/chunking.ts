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
  for (let start = 0; start < text.length; ) {
    let end = Math.min(start + 1600, text.length);
    if (end < text.length) {
      const breakAt = Math.max(
        text.lastIndexOf("\n", end),
        text.lastIndexOf(". ", end),
        text.lastIndexOf(" ", end),
      );
      if (breakAt > start + 1200) end = breakAt + 1;
    }
    chunks.push({
      id: randomUUID(),
      ordinal: chunks.length,
      text: text.slice(start, end),
      start,
      end,
    });
    if (end === text.length) break;
    start = end - 200;
  }
  if (chunks.length > 200)
    throw new DomainError(
      "source_large",
      "Split this source into smaller files before importing.",
      400,
    );
  return chunks;
}
