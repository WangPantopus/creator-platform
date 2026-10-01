import { connect } from "node:http2";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  DeliveryFailure,
  DeliveryProgress,
  type DeliveryProvider,
} from "./notifications.js";
import type { GrowthService } from "./service.js";
import { notificationEmail, notificationDigest } from "./email.js";

export interface EmailTransport {
  send(input: {
    to: string;
    idempotencyKey: string;
    subject: string;
    html: string;
    text: string;
    headers: Record<string, string>;
    signal: AbortSignal;
  }): Promise<{ id: string }>;
}
export interface NotificationProviderConfiguration {
  publicOrigin: string;
  brandName: string;
  apns?: {
    sandbox: boolean;
    topic: string;
    authorization: () => Promise<string>;
  };
  fcm?: { projectId: string; accessToken: () => Promise<string> };
  email?: {
    transport: EmailTransport;
    unsubscribeUrl: (accountId: string) => Promise<string>;
  };
}
class InvalidDeviceToken extends Error {}
/** Credential suppliers are injected from secret management, never persisted in evidence. */
export class NativeDeliveryProvider implements DeliveryProvider {
  constructor(
    private readonly service: () => GrowthService,
    private readonly config: NotificationProviderConfiguration,
  ) {
    const origin = new URL(config.publicOrigin);
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw new Error("A configured root HTTPS app origin is required.");
  }
  async send(input: Parameters<DeliveryProvider["send"]>[0]) {
    const service = this.service();
    if (input.channel === "email") return this.sendEmail(input);
    // A lost response is neither acceptance nor rejection. Preserve the
    // original registration receipt for reconciliation and never resend it
    // or hide it behind another device's successful response.
    const uncertain = await service.db.worker.query(
      "SELECT 1 FROM growth.provider_receipt WHERE delivery_id=$1 AND (state IN ('sending','unknown') OR (state='sent' AND (provider_ref IS NULL OR provider_ref=''))) LIMIT 1",
      [input.idempotencyKey],
    );
    if (uncertain.rowCount) throw new Error("provider_outcome_unknown");
    const devices = await service.db.worker.query(
      `SELECT d.id,d.installation_id,d.platform,d.encrypted_token FROM growth.device d
       WHERE d.account_id=$1 AND d.permission='granted' AND d.revoked_at IS NULL AND d.updated_at>now()-interval '270 days'
       AND NOT EXISTS(SELECT FROM growth.provider_receipt r WHERE r.delivery_id=$2 AND r.registration_hash=d.token_hash)
       ORDER BY d.id LIMIT 1`,
      [input.accountId, input.idempotencyKey],
    );
    const receipts: string[] = [];
    for (const device of devices.rows) {
      const token = service.open(device.encrypted_token),
        registrationHash = createHash("sha256").update(token).digest("hex");
      let sending = false;
      try {
        if (device.platform === "ios") {
          if (!this.config.apns) throw new Error("apns_unconfigured");
          const id = createHash("sha256")
            .update(`${input.idempotencyKey}:${device.installation_id}`)
            .digest("hex")
            .slice(0, 32)
            .replace(
              /^(........)(....)(....)(....)(............)$/u,
              "$1-$2-$3-$4-$5",
            );
          const authorization = await this.bounded(() =>
            this.config.apns!.authorization(),
          );
          await this.beginReceipt(input.idempotencyKey, registrationHash);
          sending = true;
          receipts.push(await this.sendAPNS(token, id, input, authorization));
        } else {
          if (!this.config.fcm) throw new Error("fcm_unconfigured");
          const accessToken = await this.bounded(() =>
            this.config.fcm!.accessToken(),
          );
          await this.beginReceipt(input.idempotencyKey, registrationHash);
          sending = true;
          const response = await fetch(
            `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.config.fcm.projectId)}/messages:send`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                message: {
                  token,
                  notification: { title: input.sender, body: input.preview },
                  data: {
                    destination: input.destination,
                    notificationId: input.notificationId,
                  },
                  android: { ttl: "0s", collapse_key: input.notificationId },
                },
              }),
              signal: AbortSignal.timeout(10000),
              redirect: "error",
            },
          );
          const data = (await response.json().catch(() => null)) as {
            name?: string;
            error?: { details?: { errorCode?: string }[] };
          } | null;
          if (
            response.status === 404 &&
            Array.isArray(data?.error?.details) &&
            data.error.details.some((d) => d?.errorCode === "UNREGISTERED")
          ) {
            await service.db.worker.query(
              "UPDATE growth.provider_receipt SET state='invalid',updated_at=now() WHERE delivery_id=$1 AND registration_hash=$2",
              [input.idempotencyKey, registrationHash],
            );
            sending = false;
            await service.db.worker.query(
              "UPDATE growth.device SET revoked_at=now() WHERE id=$1",
              [device.id],
            );
            continue;
          }
          if (!response.ok) {
            await service.db.worker.query(
              "DELETE FROM growth.provider_receipt WHERE delivery_id=$1 AND registration_hash=$2",
              [input.idempotencyKey, registrationHash],
            );
            sending = false;
            const retryAfter = response.headers.get("retry-after");
            const delay = retryAfter
              ? /^\d+$/u.test(retryAfter)
                ? Number(retryAfter)
                : Math.ceil((Date.parse(retryAfter) - Date.now()) / 1000)
              : 60;
            throw new DeliveryFailure(
              Number.isFinite(delay) ? Math.max(60, delay) : 60,
              response.status >= 400 &&
                response.status < 500 &&
                response.status !== 401 &&
                response.status !== 429,
            );
          }
          // A 2xx response without FCM's message name is not a proven rejection.
          // Retain the in-flight receipt as unknown; retrying it could resend.
          if (
            !data ||
            data.error ||
            typeof data.name !== "string" ||
            data.name.length > 512 ||
            !/^projects\/[^/\s]+\/messages\/[^/\s]+$/u.test(data.name)
          )
            throw new Error("provider_outcome_unknown");
          receipts.push(data.name);
        }
        await service.db.worker.query(
          "UPDATE growth.provider_receipt SET state='sent',provider_ref=$3,updated_at=now() WHERE delivery_id=$1 AND registration_hash=$2",
          [input.idempotencyKey, registrationHash, receipts.at(-1)],
        );
      } catch (error) {
        if (sending && error instanceof InvalidDeviceToken) {
          await service.db.worker.query(
            "UPDATE growth.provider_receipt SET state='invalid',updated_at=now() WHERE delivery_id=$1 AND registration_hash=$2",
            [input.idempotencyKey, registrationHash],
          );
          sending = false;
          await service.db.worker.query(
            "UPDATE growth.device SET revoked_at=now() WHERE id=$1",
            [device.id],
          );
          continue;
        }
        if (sending && error instanceof DeliveryFailure) {
          await service.db.worker.query(
            "DELETE FROM growth.provider_receipt WHERE delivery_id=$1 AND registration_hash=$2",
            [input.idempotencyKey, registrationHash],
          );
          sending = false;
        }
        if (sending)
          await service.db.worker.query(
            "UPDATE growth.provider_receipt SET state='unknown',updated_at=now() WHERE delivery_id=$1 AND registration_hash=$2",
            [input.idempotencyKey, registrationHash],
          );
        throw error;
      }
    }
    const pending = await service.db.worker.query(
      `SELECT 1 FROM growth.device d WHERE d.account_id=$1 AND d.permission='granted' AND d.revoked_at IS NULL AND d.updated_at>now()-interval '270 days'
       AND NOT EXISTS(SELECT FROM growth.provider_receipt r WHERE r.delivery_id=$2 AND r.registration_hash=d.token_hash) LIMIT 1`,
      [input.accountId, input.idempotencyKey],
    );
    if (pending.rowCount) throw new DeliveryProgress();
    const accepted = await service.db.worker.query(
      `SELECT r.provider_ref FROM growth.provider_receipt r JOIN growth.device d ON d.token_hash=r.registration_hash
       WHERE r.delivery_id=$1 AND r.state='sent' AND r.provider_ref IS NOT NULL AND r.provider_ref<>''
       AND d.account_id=$2 AND d.permission='granted' AND d.revoked_at IS NULL AND d.updated_at>now()-interval '270 days'
       ORDER BY r.registration_hash LIMIT 1`,
      [input.idempotencyKey, input.accountId],
    );
    if (!accepted.rowCount) throw new Error("no_deliverable_device");
    // Complete receipts remain in the ledger; this bounded field is a trace reference.
    return { providerRef: accepted.rows[0].provider_ref };
  }
  private async bounded<T>(work: (signal: AbortSignal) => Promise<T>) {
    const signal = AbortSignal.timeout(10000);
    const timeout = new Promise<never>((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => reject(new Error("provider_outcome_unknown")),
        { once: true },
      );
    });
    return Promise.race([Promise.resolve().then(() => work(signal)), timeout]);
  }
  private async sendEmail(input: Parameters<DeliveryProvider["send"]>[0]) {
    const config = this.config.email;
    if (!config) throw new Error("email_unconfigured");
    const service = this.service();
    const ids = z.array(z.uuid()).min(1).max(100).parse(input.deliveryIds);
    const leaseId = z.uuid().parse(input.leaseId);
    if (new Set(ids).size !== ids.length)
      throw new Error("email_receipt_scope_unavailable");
    const key = `email:${z.uuid().parse(input.idempotencyKey)}`;
    const prior = await service.db.worker.query(
      `SELECT r.delivery_id,r.state,r.provider_ref FROM growth.provider_receipt r
       JOIN growth.delivery d ON d.id=r.delivery_id
       WHERE d.channel='email' AND d.account_id=$1 AND d.digest_id=$2 AND r.registration_hash=$3 LIMIT 101`,
      [input.accountId, input.idempotencyKey, key],
    );
    if (prior.rowCount) {
      if (
        prior.rowCount > 100 ||
        prior.rows.some((row) => row.state !== "sent" || !row.provider_ref) ||
        ids.some((id) => !prior.rows.some((row) => row.delivery_id === id))
      )
        throw new Error("provider_outcome_unknown");
      return { providerRef: prior.rows[0].provider_ref as string };
    }
    const result = await service.db.worker.query(
      "SELECT encrypted_address FROM growth.email WHERE account_id=$1 AND bounced_at IS NULL AND unsubscribed_at IS NULL",
      [input.accountId],
    );
    if (!result.rowCount) throw new Error("email_ineligible");
    const unsubscribeUrl = await this.bounded(() =>
      config.unsubscribeUrl(input.accountId),
    );
    const content = input.entries
      ? notificationDigest({
          brand: this.config.brandName,
          unsubscribeUrl,
          entries: input.entries.map((entry) => ({
            ...entry,
            url: new URL(entry.destination, this.config.publicOrigin).href,
          })),
        })
      : notificationEmail({
          brand: this.config.brandName,
          sender: input.sender,
          preview: input.preview,
          url: new URL(input.destination, this.config.publicOrigin).href,
          unsubscribeUrl,
          authorship: input.authorship,
        });
    await service.db.transaction(service.db.worker, async (client) => {
      const scope = await client.query(
        "SELECT id FROM growth.delivery WHERE id=ANY($1::uuid[]) AND channel='email' AND account_id=$2 AND digest_id=$3 AND state='leased' AND lease_id=$4 AND lease_until>clock_timestamp()",
        [ids, input.accountId, input.idempotencyKey, leaseId],
      );
      if (scope.rowCount !== ids.length)
        throw new Error("email_receipt_scope_unavailable");
      const inserted = await client.query(
        "INSERT INTO growth.provider_receipt(delivery_id,registration_hash,state) SELECT unnest($1::uuid[]),$2,'sending' ON CONFLICT DO NOTHING RETURNING delivery_id",
        [ids, key],
      );
      if (inserted.rowCount !== ids.length)
        throw new Error("provider_outcome_unknown");
    });
    try {
      const receipt = await this.bounded((signal) =>
        config.transport.send({
          to: service.open(result.rows[0].encrypted_address),
          idempotencyKey: input.idempotencyKey,
          ...content,
          signal,
        }),
      );
      if (
        typeof receipt?.id !== "string" ||
        !receipt.id ||
        receipt.id.length > 512 ||
        [...receipt.id].some((character) => character.charCodeAt(0) < 32)
      )
        throw new Error("provider_outcome_unknown");
      await service.db.worker.query(
        "UPDATE growth.provider_receipt SET state='sent',provider_ref=$3,updated_at=now() WHERE delivery_id=ANY($1::uuid[]) AND registration_hash=$2 AND state='sending'",
        [ids, key, receipt.id],
      );
      return { providerRef: receipt.id };
    } catch (error) {
      if (error instanceof DeliveryFailure)
        await service.db.worker.query(
          "DELETE FROM growth.provider_receipt WHERE delivery_id=ANY($1::uuid[]) AND registration_hash=$2 AND state='sending'",
          [ids, key],
        );
      else
        await service.db.worker.query(
          "UPDATE growth.provider_receipt SET state='unknown',updated_at=now() WHERE delivery_id=ANY($1::uuid[]) AND registration_hash=$2 AND state='sending'",
          [ids, key],
        );
      throw error;
    }
  }
  private async beginReceipt(deliveryId: string, registrationHash: string) {
    const result = await this.service().db.worker.query(
      "INSERT INTO growth.provider_receipt(delivery_id,registration_hash,state) VALUES($1,$2,'sending') ON CONFLICT DO NOTHING RETURNING delivery_id",
      [deliveryId, registrationHash],
    );
    if (!result.rowCount) throw new DeliveryFailure(60);
  }
  private async sendAPNS(
    token: string,
    id: string,
    input: Parameters<DeliveryProvider["send"]>[0],
    authorization: string,
  ): Promise<string> {
    const config = this.config.apns!;
    return new Promise((resolve, reject) => {
      const session = connect(
        config.sandbox
          ? "https://api.sandbox.push.apple.com"
          : "https://api.push.apple.com",
      );
      let settled = false;
      const finish = (error?: Error, result?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        if (error) session.destroy();
        else session.close();
        if (error) reject(error);
        else resolve(result ?? id);
      };
      const deadline = setTimeout(
        () => finish(new Error("apns_timeout")),
        10000,
      );
      session.on("error", (error) => finish(error));
      const request = session.request({
        ":method": "POST",
        ":path": `/3/device/${encodeURIComponent(token)}`,
        authorization: `bearer ${authorization}`,
        "apns-topic": config.topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": "0",
        "apns-id": id,
        "apns-collapse-id": input.notificationId,
      });
      let status = 0,
        body = "";
      request.on("response", (headers) => {
        status = Number(headers[":status"]);
      });
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        if (body.length < 4096)
          body += String(chunk).slice(0, 4096 - body.length);
      });
      request.on("error", (error) => finish(error));
      request.on("close", () => {
        if (!settled) finish(new Error("provider_outcome_unknown"));
      });
      request.on("end", () => {
        if (status === 200) finish(undefined, id);
        else {
          let reason = "apns_delivery_unavailable";
          try {
            const received = JSON.parse(body)?.reason;
            if (typeof received === "string") reason = received;
          } catch {
            /* Redacted error only. */
          }
          const invalidDevice =
            (status === 400 &&
              ["BadDeviceToken", "DeviceTokenNotForTopic"].includes(reason)) ||
            (status === 410 &&
              ["ExpiredToken", "Unregistered"].includes(reason));
          finish(
            invalidDevice
              ? new InvalidDeviceToken("device_token_invalid")
              : !Number.isInteger(status) || status < 400 || status > 599
                ? new Error("provider_outcome_unknown")
                : new DeliveryFailure(
                    status >= 500 ? 900 : 60,
                    status < 500 &&
                      status !== 429 &&
                      reason !== "ExpiredProviderToken",
                  ),
          );
        }
      });
      request.end(
        JSON.stringify({
          aps: {
            alert: { title: input.sender, body: input.preview },
            sound: "default",
          },
          destination: input.destination,
          notificationId: input.notificationId,
        }),
      );
    });
  }
}
