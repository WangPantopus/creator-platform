"use client";
import { copy, formatCopy } from "@qelvora/copy";
import { useEffect, useRef, useState } from "react";
import { parseReplyExport, sameReplyExport } from "./reply-export";

export function ShareImages({ id }: { id: string }) {
  const active = useRef<AbortController | null>(null);
  const downloadURL = useRef<string | null>(null);
  const [busy, setBusy] = useState(false),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  useEffect(() => {
    const purge = () => {
      active.current?.abort();
      active.current = null;
      if (downloadURL.current) URL.revokeObjectURL(downloadURL.current);
      downloadURL.current = null;
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") {
        purge();
        setBusy(false);
        setReady(false);
        setPage(0);
      }
    };
    window.addEventListener("pagehide", purge);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      purge();
      window.removeEventListener("pagehide", purge);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [id]);
  async function download() {
    if (active.current || document.visibilityState !== "visible") return;
    const controller = new AbortController();
    active.current = controller;
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(90000),
    ]);
    setBusy(true);
    setError("");
    setReady(false);
    setPage(0);
    try {
      const current = async () => {
        const response = await fetch(`/share/${id}/image/source`, {
          cache: "no-store",
          credentials: "omit",
          signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
        });
        const value = await response.json();
        if (!response.ok)
          throw new Error(value.error?.message ?? copy.growthCardUnavailable);
        return parseReplyExport(value, id);
      };
      const source = await current();
      const { replyImages } = await import("./reply-images");
      signal.throwIfAborted();
      const result = await replyImages(source, signal, setPage);
      // Current dual consent and corrections can change while rendering.
      // Hand nothing to the browser until the complete owner artifact matches.
      if (!sameReplyExport(source, await current()))
        throw new Error(copy.growthCardUnavailable);
      signal.throwIfAborted();
      if (
        active.current !== controller ||
        document.visibilityState !== "visible"
      )
        return;
      if (downloadURL.current) URL.revokeObjectURL(downloadURL.current);
      const url = URL.createObjectURL(result.blob);
      downloadURL.current = url;
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setReady(true);
      setTimeout(() => {
        URL.revokeObjectURL(url);
        if (downloadURL.current === url) downloadURL.current = null;
      }, 60000);
    } catch (failure) {
      if (active.current === controller && !controller.signal.aborted)
        setError(
          failure instanceof Error && !signal.aborted
            ? failure.message
            : copy.growthReplyImageExportFailed,
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <div className="growth-stack">
      <p className="growth-help">{copy.growthReplyImageExportHelp}</p>
      <button
        className="qv-btn qv-btn--primary"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy
          ? copy.growthPreparingReplyImages
          : copy.growthDownloadLabeledImage}
      </button>
      <p role="status" aria-live="polite">
        {busy && page
          ? formatCopy("growthReplyImageProgress", { page })
          : ready
            ? copy.growthReplyImagesReady
            : ""}
      </p>
      {error ? (
        <p className="growth-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
