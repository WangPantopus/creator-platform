"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Notice } from "@qelvora/ui-web";
import { studioRequest } from "../api";
import { Feedback, useAction } from "../shared/action";
import { key } from "../shared/format";
import type { Creator } from "../shared/types";
export function CorrectionForm({
  creator,
  answer,
}: {
  creator: Creator;
  answer: string;
}) {
  const [revision, setRevision] = useState<number | null>(null),
    [question, setQuestion] = useState(""),
    [rule, setRule] = useState(""),
    [excerpt, setExcerpt] = useState(answer),
    [saved, setSaved] = useState<string | null>(null),
    action = useAction();
  useEffect(() => {
    let current = true;
    void action.run(async () => {
      const value = await studioRequest<{ revision: number }>(
        "studio",
        `${creator.id}/corrections`,
      );
      if (current) setRevision(value.revision);
    });
    return () => {
      current = false;
    };
  }, [creator.id]);
  return (
    <>
      <Feedback action={action} />
      <p>
        Describe the question in your own words, leaving out fan details. The
        signed conversation remains unchanged.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            const result = await studioRequest<{ id: string }>(
              "studio",
              `${creator.id}/corrections`,
              {
                expectedRevision: revision,
                paraphrasedPrompt: question,
                rule,
                unacceptableAnswer: excerpt,
                idempotencyKey: key(),
              },
              creator.viewerAccountId,
            );
            setSaved(result.id);
          });
        }}
      >
        <label className="w5-field">
          Paraphrased question
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            minLength={5}
            maxLength={1000}
            required
          />
        </label>
        <label className="w5-field">
          AI answer or excerpt
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            maxLength={3000}
          />
        </label>
        <label className="w5-field">
          My rule
          <textarea
            value={rule}
            onChange={(e) => setRule(e.target.value)}
            minLength={5}
            maxLength={500}
            required
          />
        </label>
        <button
          className="qv-btn qv-btn--maya"
          disabled={
            action.busy || revision === null || !!saved || excerpt.length > 3000
          }
        >
          Save rule and regression
        </button>
      </form>
      {saved && (
        <Notice title="AI draft updated">
          The rule and regression example are stored. Review and evaluate your
          AI draft before publishing it.
        </Notice>
      )}
      <Link href="/studio/ai">Open My AI</Link>
      <p className="qv-help">
        Use “Correct this answer” beside the original AI answer to review a
        signed correction for that fan.
      </p>
    </>
  );
}
