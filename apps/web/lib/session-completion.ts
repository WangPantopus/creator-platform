import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

/** Run after the issuer's successful completion and cookie replacement. Only
 * a negative hint crosses tabs; each consumer must recheck its own session.
 * The destination is the completion handler's already validated app URL. */
export function sessionCompletionResponse(destination: URL) {
  const nonce = randomBytes(24).toString("base64");
  const target = JSON.stringify(destination.href).replaceAll("<", "\\u003c");
  const href = destination.href.replace(
    /[&<>"']/gu,
    (value) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        value
      ]!,
  );
  return new NextResponse(
    `<!doctype html><html lang="en"><meta charset="utf-8"><title>Continue</title><script nonce="${nonce}">try{const c=new BroadcastChannel("qelvora-identity-status");c.postMessage("ended");c.close()}catch{}location.replace(${target})</script><noscript><a href="${href}">Continue</a></noscript></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`,
        "Referrer-Policy": "same-origin",
      },
    },
  );
}
