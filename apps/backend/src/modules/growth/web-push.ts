import { ECDH } from "node:crypto";
import { z } from "zod";
import webpush from "web-push";

const endpoints = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
]);
const Subscription = z.strictObject({
  endpoint: z
    .url()
    .max(2048)
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === "https:" &&
        endpoints.has(url.hostname) &&
        !url.port &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname.length > 1
      );
    }),
  expirationTime: z.number().int().positive().nullable().optional(),
  keys: z.strictObject({
    p256dh: z
      .string()
      .regex(/^[A-Za-z0-9_-]{87}$/u)
      .refine((key) => {
        try {
          const bytes = Buffer.from(key, "base64url");
          return (
            bytes.length === 65 &&
            bytes[0] === 4 &&
            bytes.toString("base64url") === key &&
            ECDH.convertKey(bytes, "prime256v1").length === 65
          );
        } catch {
          return false;
        }
      }),
    auth: z
      .string()
      .regex(/^[A-Za-z0-9_-]{22}$/u)
      .refine(
        (key) => Buffer.from(key, "base64url").toString("base64url") === key,
      ),
  }),
});
export const WebSubscriptionToken = z
  .string()
  .max(4096)
  .transform((value, context) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      context.addIssue({ code: "custom", message: "Invalid subscription." });
      return z.NEVER;
    }
  })
  .pipe(Subscription);

export interface WebPushConfiguration {
  subject: string;
  publicKey: string;
  privateKey: string;
  /** Outer-edge HTTP seam for the disposable gateway; production uses fetch. */
  fetch?: typeof fetch;
}

/** Encrypt only a lookup ID. Display remains the current service worker's job:
 * it must recheck its captured account, permission and current notice first. */
export async function submitWebPush(
  config: WebPushConfiguration,
  token: string,
  notificationId: string,
  signal: AbortSignal,
  beforeSend: () => void,
) {
  const subscription = WebSubscriptionToken.parse(token);
  const request = webpush.generateRequestDetails(
    subscription,
    JSON.stringify({ notificationId }),
    {
      vapidDetails: {
        subject: config.subject,
        publicKey: config.publicKey,
        privateKey: config.privateKey,
      },
      TTL: 86400,
      urgency: "normal",
      contentEncoding: "aes128gcm",
    },
  );
  // Do not follow a gateway redirect to an unapproved host or local address.
  signal.throwIfAborted();
  beforeSend();
  return (config.fetch ?? fetch)(request.endpoint, {
    method: request.method,
    headers: request.headers,
    body: new Uint8Array(request.body),
    signal,
    redirect: "error",
  });
}
