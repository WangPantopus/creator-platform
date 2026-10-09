"use client";
import { useRef, useState } from "react";
import { Notice } from "@qelvora/ui-web";
export function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const pending = useRef(false);
  const run = async (work: () => Promise<void>) => {
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
  };
  return { busy, error, notice, setNotice, run };
}
export function Feedback({ action }: { action: ReturnType<typeof useAction> }) {
  return (
    <>
      {action.error && (
        <div>
          <Notice tone="error" title="Action status">
            {action.error}
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
