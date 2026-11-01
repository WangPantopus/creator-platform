"use client";

import { copy, formatCopy } from "@qelvora/copy";
import {
  FAQ_MAX_QUESTIONS,
  type FaqItem,
} from "../../../../packages/api/src/agent/contracts";

/** The creator's FAQ set: questions fans ask, each with the answer the creator
 * expects. Saved with the draft; the evaluation asks each question as a fan
 * and judges the answer against the expected one. */
export function FaqEditor({
  value,
  onChange,
  disabled,
  minimum,
  percent,
  live,
}: {
  value: readonly FaqItem[];
  onChange: (value: FaqItem[]) => void;
  disabled: boolean;
  /** Questions needed before a new version may replace the live one. */
  minimum: number;
  percent: number;
  /** Whether a live version exists, so the minimum applies. */
  live: boolean;
}) {
  const seen = new Map<string, number>();
  const duplicateAt = value.map((item, index) => {
    const key = item.question.trim().toLocaleLowerCase();
    if (!key) return false;
    if (seen.has(key)) return true;
    seen.set(key, index);
    return false;
  });
  const update = (index: number, change: Partial<FaqItem>) =>
    onChange(
      value.map((item, at) => (at === index ? { ...item, ...change } : item)),
    );
  return (
    <div className="w2-faq">
      <p className="qv-help">{formatCopy("creatorAiFaqIntro", { percent })}</p>
      {value.length === 0 && (
        <p className="qv-help">{copy.creatorAiFaqEmpty}</p>
      )}
      <ol className="w2-faq__list">
        {value.map((item, index) => (
          <li key={index} className="w2-faq__item">
            <label className="w2-field">
              <span>
                {copy.creatorAiFaqQuestion} {index + 1}
              </span>
              <input
                value={item.question}
                maxLength={500}
                disabled={disabled}
                aria-invalid={duplicateAt[index] || undefined}
                onChange={(e) => update(index, { question: e.target.value })}
              />
            </label>
            {duplicateAt[index] && (
              <span className="qv-help" role="alert">
                {copy.creatorAiFaqDuplicate}
              </span>
            )}
            <label className="w2-field">
              <span>{copy.creatorAiFaqAnswer}</span>
              <textarea
                rows={2}
                value={item.answer}
                maxLength={2000}
                disabled={disabled}
                onChange={(e) => update(index, { answer: e.target.value })}
              />
            </label>
            <button
              type="button"
              className="qv-btn qv-btn--quiet"
              disabled={disabled}
              onClick={() => onChange(value.filter((_, at) => at !== index))}
            >
              {formatCopy("creatorAiFaqRemove", { number: index + 1 })}
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="qv-btn qv-btn--secondary"
        disabled={disabled || value.length >= FAQ_MAX_QUESTIONS}
        onClick={() => onChange([...value, { question: "", answer: "" }])}
      >
        {copy.creatorAiFaqAdd}
      </button>
      <span className="qv-meta">
        {formatCopy("creatorAiFaqCount", {
          count: value.length,
          max: FAQ_MAX_QUESTIONS,
        })}
      </span>
      {live && value.length < minimum && (
        <p className="qv-help">
          {formatCopy("creatorAiFaqMinimum", { min: minimum })}
        </p>
      )}
    </div>
  );
}
