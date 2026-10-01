import { connect } from "node:http2";
import { createHash } from "node:crypto";
import { DeliveryFailure, type DeliveryProvider } from "./notifications.js";
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
/** Credential suppliers are injected from secret management, never persisted in evidence. */
export class NativeDeliveryProvider implements DeliveryProvider {
  constructor(
    private readonly service: () => GrowthService,
    private readonly config: NotificationProviderConfiguration,
  ) {
    if (new URL(config.publicOrigin).protocol !== "https:")
      throw new Error("A configured HTTPS app origin is required.");
  }
  async send(input: Parameters<DeliveryProvider["send"]>[0]) {
    const service = this.service();
    if (input.channel === "email") {
      if (!this.config.email) throw new Error("email_unconfigured");
      const result = await service.db.worker.query(
        "SELECT encrypted_address FROM growth.email WHERE account_id=$1 AND bounced_at IS NULL AND unsubscribed_at IS NULL",
        [input.accountId],
      );
      if (!result.rowCount) throw new Error("email_ineligible");
      const unsubscribeUrl = await this.config.email.unsubscribeUrl(
        input.accountId,
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
      const receipt = await this.config.email.transport.send({
        to: service.open(result.rows[0].encrypted_address),
        idempotencyKey: input.idempotencyKey,
        ...content,
      });
      return { providerRef: receipt.id };
    }
    // A lost response is neither acceptance nor rejection. Preserve the
    // original registration receipt for reconciliation and never resend it
    // or hide it behind another device's successful response.
    const uncertain = await service.db.worker.query(
      "SELECT 1 FROM growth.provider_receipt WHERE delivery_id=$1 AND (state IN ('sending','unknown') OR (state='sent' AND (provider_ref IS NULL OR provider_ref=''))) LIMIT 1",
      [input.idempotencyKey],
    );
    if (uncertain.rowCount) throw new Error("provider_outcome_unknown");
    const devices = await service.db.worker.query(
      "SELECT id,installation_id,platform,encrypted_token FROM growth.device WHERE account_id=$1 AND permission='granted' AND revoked_at IS NULL AND updated_at>now()-interval '270 days' ORDER BY id LIMIT 20",
      [input.accountId],
    );
    if (!devices.rowCount) throw new Error("no_active_device");
    const receipts: string[] = [];
    for (const device of devices.rows) {
      const token = service.open(device.encrypted_token),
        registrationHash = createHash("sha256").update(token).digest("hex");
      const prior = (
        await service.db.worker.query(
          "SELECT state,provider_ref FROM growth.provider_receipt WHERE delivery_id=$1 AND registration_hash=$2",
          [input.idempotencyKey, registrationHash],
        )
      ).rows[0];
      if (prior) {
        if (prior.state === "sent" && prior.provider_ref)
          receipts.push(prior.provider_ref);
        else if (prior.state !== "invalid")
          throw new Error("provider_outcome_unknown");
        continue;
      }
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
          const authorization = await this.config.apns.authorization();
          await this.beginReceipt(input.idempotencyKey, registrationHash);
          sending = true;
          receipts.push(await this.sendAPNS(token, id, input, authorization));
        } else {
          if (!this.config.fcm) throw new Error("fcm_unconfigured");
          const accessToken = await this.config.fcm.accessToken();
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
            },
          );
          const data = (await response.json()) as {
            name?: string;
            error?: { details?: { errorCode?: string }[] };
          };
          if (
            data.error?.details?.some((d) => d.errorCode === "UNREGISTERED")
          ) {
            await service.db.worker.query(
              "UPDATE growth.provider_receipt SET state='invalid',updated_at=now() WHERE delivery_id=$1 AND registration_hash=$2",
              [input.idempotencyKey, registrationHash],
            );
            await service.db.worker.query(
              "UPDATE growth.device SET revoked_at=now() WHERE id=$1",
              [device.id],
            );
            continue;
          }
          if (!response.ok || !data.name) {
            await service.db.worker.query(
              "DELETE FROM growth.provider_receipt WHERE delivery_id=$1 AND registration_hash=$2",
              [input.idempotencyKey, registrationHash],
            );
            sending = false;
            throw new DeliveryFailure(
              Number(response.headers.get("retry-after")) || 60,
              response.status >= 400 &&
                response.status < 500 &&
                response.status !== 429,
            );
          }
          receipts.push(data.name);
        }
        await service.db.worker.query(
          "UPDATE growth.provider_receipt SET state='sent',provider_ref=$3,updated_at=now() WHERE delivery_id=$1 AND registration_hash=$2",
          [input.idempotencyKey, registrationHash, receipts.at(-1)],
        );
      } catch (error) {
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
        if (
          error instanceof Error &&
          [
            "BadDeviceToken",
            "DeviceTokenNotForTopic",
            "Unregistered",
            "ExpiredToken",
          ].includes(error.message)
        ) {
          await service.db.worker.query(
            "UPDATE growth.device SET revoked_at=now() WHERE id=$1",
            [device.id],
          );
          continue;
        }
        throw error;
      }
    }
    if (!receipts.length) throw new Error("no_deliverable_device");
    return { providerRef: receipts.join(",").slice(0, 1000) };
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
      const finish = (error?: Error, result?: string) => {
        session.close();
        if (error) reject(error);
        else resolve(result ?? id);
      };
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
        body += String(chunk).slice(0, 4096);
      });
      request.setTimeout(10000, () => {
        request.close();
        finish(new Error("apns_timeout"));
      });
      request.on("error", (error) => finish(error));
      request.on("end", () => {
        if (status === 200) finish(undefined, id);
        else {
          let reason = "apns_delivery_unavailable";
          try {
            reason = JSON.parse(body).reason ?? reason;
          } catch {
            /* Redacted error only. */
          }
          finish(
            status === 429 || status >= 500
              ? new DeliveryFailure(status >= 500 ? 900 : 60)
              : new Error(reason),
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
