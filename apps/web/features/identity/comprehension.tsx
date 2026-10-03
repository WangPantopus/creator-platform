"use client";
import { useEffect, useRef, useState } from "react";
import { Message } from "@qelvora/ui-web";

const cards = [
  {
    kind: "ai",
    text: "Crawling usually means the coat is too thick.",
    answer: "ai",
    time: undefined,
  },
  {
    kind: "approved_draft",
    text: "Thin the glaze and wipe the top 5 mm.",
    answer: "draft",
    time: "OCT 4",
  },
  {
    kind: "human_creator",
    text: "That crawl is the rim, not the recipe.",
    answer: "maya",
    time: "09:15",
  },
  {
    kind: "team",
    text: "Your workshop seat is confirmed.",
    answer: "team",
    time: "16:05",
  },
] as const;
const answers = [
  ["ai", "Maya's AI"],
  ["draft", "AI, approved by Maya"],
  ["maya", "Maya herself"],
  ["team", "Maya's team"],
] as const;

export function ComprehensionPractice() {
  const [step, setStep] = useState(0);
  const [score, setScore] = useState(0);
  const restartRef = useRef<HTMLButtonElement>(null);
  const completedAnswerRef = useRef<HTMLButtonElement | null>(null);
  const current = cards[step];
  useEffect(() => {
    const completedAnswer = completedAnswerRef.current;
    completedAnswerRef.current = null;
    if (
      !current &&
      completedAnswer &&
      document.visibilityState === "visible" &&
      (document.activeElement === document.body ||
        document.activeElement === completedAnswer) &&
      restartRef.current?.isConnected
    ) {
      restartRef.current.focus();
    }
  }, [current]);
  return (
    <>
      <div className="preview-notice">
        5.5 · Source reference practice. This four-card score is not T-21 study
        acceptance; the research pass bar remains undecided.
      </div>
      <main
        className="qv"
        style={{
          width: "100%",
          maxWidth: 390,
          minHeight: 844,
          boxSizing: "border-box",
          margin: "0 auto",
          background: "var(--ground)",
          color: "var(--ink)",
          fontFamily: "var(--font-sans)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 16px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <span className="qv-meta" role="status">
            T-21 · CARD {Math.min(step + 1, 4)} OF 4 · {score} RIGHT
          </span>
          <button
            ref={restartRef}
            className="qv-link-btn"
            onClick={() => {
              setStep(0);
              setScore(0);
            }}
          >
            Restart
          </button>
        </div>
        <div
          style={{
            padding: "20px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            flexGrow: 1,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-serif)",
              fontWeight: 400,
              fontSize: 28,
              lineHeight: "32px",
            }}
          >
            Who wrote this message?
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-muted)" }}>
            Answer within a second. The pass bar is the one set for T-21 in the
            source docs.
          </p>
          {current ? (
            <Message
              key={step}
              kind={current.kind}
              actions={false}
              {...(current.time ? { time: current.time } : {})}
            >
              {current.text}
            </Message>
          ) : (
            <p
              role="status"
              style={{
                margin: 0,
                fontFamily: "var(--font-serif)",
                fontSize: 22,
                lineHeight: "30px",
              }}
            >
              You got {score} of 4.
            </p>
          )}
          <div
            style={{
              marginTop: "auto",
              display: "grid",
              gridTemplateColumns: "repeat(2,minmax(0,1fr))",
              gap: 8,
            }}
          >
            {answers.map(([id, label]) => (
              <button
                key={id}
                className="qv-btn qv-btn--secondary"
                style={{ minHeight: 52, fontSize: 13 }}
                disabled={!current}
                onClick={(event) => {
                  if (current) {
                    if (
                      step === cards.length - 1 &&
                      document.activeElement === event.currentTarget
                    ) {
                      completedAnswerRef.current = event.currentTarget;
                    }
                    setScore(score + (current.answer === id ? 1 : 0));
                    setStep(step + 1);
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
