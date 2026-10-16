"use client";

import { useState } from "react";
import { copy, formatCopy } from "@qelvora/copy";
import type { MemoryItem } from "../../../../packages/api/src/conversation/contracts";

export type MemoryList = { revision: number; items: MemoryItem[] };
export type MemoryDecision = (
  item: MemoryItem,
  action: "accept" | "delete",
) => Promise<void>;

/** B5: under the AI answer it came from, what the AI proposes to remember is
 * asked ("Want me to remember this? Only if you say yes.") and what it
 * remembers is shown with a way to undo it. Nothing is memory until the fan
 * says yes; a sensitive item records its own consent on yes (INV-23); no
 * stores nothing and the item is not proposed again. */
export function MemoryPrompt({
  items,
  online,
  decide,
}: {
  items: readonly MemoryItem[];
  online: boolean;
  decide: MemoryDecision;
}) {
  const [busy, setBusy] = useState(false);
  const choose = async (item: MemoryItem, action: "accept" | "delete") => {
    if (busy || !online) return;
    setBusy(true);
    try {
      await decide(item, action);
    } finally {
      setBusy(false);
    }
  };
  if (!items.length) return null;
  return (
    <section className="conversation-memory-prompt" aria-label="Memory">
      {items.map((item) =>
        item.state === "remembered" ? (
          <p key={item.id} className="qv-meta">
            {formatCopy("remembered", { text: item.text })}{" "}
            <button
              className="qv-link-btn"
              disabled={busy || !online}
              onClick={() => void choose(item, "delete")}
            >
              {copy.dontRememberThis}
            </button>
          </p>
        ) : (
          <div key={item.id}>
            <p>{copy.sensitiveMemory}</p>
            <blockquote style={{ margin: 0 }}>{item.text}</blockquote>
            <div className="conversation-actions">
              <button
                className="qv-btn qv-btn--secondary"
                disabled={busy || !online}
                onClick={() => void choose(item, "accept")}
              >
                {copy.remember}
              </button>
              <button
                className="qv-btn qv-btn--quiet"
                disabled={busy || !online}
                onClick={() => void choose(item, "delete")}
              >
                {copy.dontRemember}
              </button>
            </div>
          </div>
        ),
      )}
    </section>
  );
}

/** Memory to show after each AI answer: proposed and remembered items whose
 * source is the fan message that answer replied to. */
export function memoryByAnswer(
  messages: readonly { id: string; authorKind: string }[],
  items: readonly MemoryItem[],
): Map<string, MemoryItem[]> {
  const byAnswer = new Map<string, MemoryItem[]>();
  let lastFan: string | null = null;
  for (const message of messages) {
    if (message.authorKind === "fan") lastFan = message.id;
    else if (message.authorKind === "ai" && lastFan) {
      const from = lastFan;
      const mine = items.filter(
        (item) =>
          item.provenanceMessageId === from &&
          (item.state === "proposed" || item.state === "remembered"),
      );
      if (mine.length) byAnswer.set(message.id, mine);
      lastFan = null;
    }
  }
  return byAnswer;
}
