function escape(value: string) {
  return value.replace(
    /[&<>"']/gu,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
/** Both formats always carry sender identity, destination and optional-channel controls. */
export function notificationEmail(input: {
  brand: string;
  sender: string;
  preview: string;
  url: string;
  unsubscribeUrl: string;
  authorship: "human" | "ai" | "approved" | "system";
}) {
  if (
    ![input.url, input.unsubscribeUrl].every(
      (url) => new URL(url).protocol === "https:",
    )
  )
    throw new Error("Email links require a configured HTTPS origin");
  const label = escape(input.sender),
    preview = escape(input.preview),
    url = escape(input.url),
    unsubscribe = escape(input.unsubscribeUrl),
    brand = escape(input.brand);
  const human = input.authorship === "human";
  return {
    subject: input.sender,
    text: `${input.brand}\n${input.sender}\n\n${input.preview}\n\nOpen in the app: ${input.url}\nEmail preferences / unsubscribe: ${input.unsubscribeUrl}`,
    html: `<!doctype html><html lang="en"><body style="margin:0;padding:40px 20px;background:#E6E4DE;color:#1B1A18;font-family:Arial,sans-serif"><main style="max-width:520px;margin:auto;background:#FFFFFF;border:1px solid #DAD8D2;border-radius:20px;padding:28px"><p style="font-family:Georgia,serif;font-style:italic;font-size:24px">${brand}</p><strong>${label}</strong><p style="padding:24px;background:${human ? "#221E1A" : input.authorship === "ai" ? "#F2F0FC" : "#F7F6F3"};color:${human ? "#F7EEDD" : input.authorship === "ai" ? "#514195" : "#1B1A18"};font-family:${human ? "Georgia,serif" : "Arial,sans-serif"};font-size:22px;line-height:30px">${preview}</p><p><a href="${url}">Open in the app</a></p><p style="font-size:12px;line-height:18px">Your in-app record remains available. <a href="${unsubscribe}">Unsubscribe from optional email</a></p></main></body></html>`,
    headers: {
      "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

/** One sender-labeled daily/weekly digest, rather than a delayed email per event. */
export function notificationDigest(input: {
  brand: string;
  unsubscribeUrl: string;
  entries: {
    sender: string;
    preview: string;
    url: string;
    authorship: "human" | "ai" | "approved" | "system";
  }[];
}) {
  if (!input.entries.length || input.entries.length > 100)
    throw new Error("Invalid digest size");
  const emails = input.entries.map((entry) =>
    notificationEmail({
      ...entry,
      brand: input.brand,
      unsubscribeUrl: input.unsubscribeUrl,
    }),
  );
  const rows = input.entries
    .map(
      (entry) =>
        `<section style="padding:20px 0;border-top:1px solid #DAD8D2"><strong>${escape(entry.sender)}</strong><p style="font-family:${entry.authorship === "human" ? "Georgia,serif" : "Arial,sans-serif"};font-size:18px;line-height:26px">${escape(entry.preview)}</p><a href="${escape(entry.url)}">Open in the app</a></section>`,
    )
    .join("");
  return {
    subject: `${input.brand} · your updates`,
    text: emails.map((email) => email.text).join("\n\n—\n\n"),
    html: `<!doctype html><html lang="en"><body style="margin:0;padding:40px 20px;background:#E6E4DE;color:#1B1A18;font-family:Arial,sans-serif"><main style="max-width:520px;margin:auto;background:white;border:1px solid #DAD8D2;border-radius:20px;padding:28px"><p style="font-family:Georgia,serif;font-style:italic;font-size:24px">${escape(input.brand)}</p><h1 style="font-size:28px">Your updates</h1>${rows}<p style="font-size:12px">Your in-app record remains available. <a href="${escape(input.unsubscribeUrl)}">Unsubscribe from optional email</a></p></main></body></html>`,
    headers: emails[0]!.headers,
  };
}
