"use client";
import { useCallback, useRef, useState } from "react";
import { Notice } from "@qelvora/ui-web";
export function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const pending = useRef(false);
  const run = useCallback(async (work: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (f) {
      setError(
        f instanceof Error ? f.message : "This action could not complete.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, error, notice, setNotice, run };
}
/** `error` is a refusal from Studio's live stream, shown like an action's. */
export function Feedback({
  action,
  error,
}: {
  action: ReturnType<typeof useAction>;
  error?: string;
}) {
  return (
    <>
      {(action.error || error) && (
        <div>
          <Notice tone="error" title="Action status">
            {action.error || error}
          </Notice>
        </div>
      )}
      {action.notice && (
        <p role="status" className="qv-help">
          {action.notice}
        </p>
      )}
    </>
  );
}
