import { createHash, randomUUID } from "node:crypto";
import express from "express";
import {
  AccessToken,
  RoomServiceClient,
  TrackSource,
  WebhookReceiver,
  type WebhookEvent,
} from "livekit-server-sdk";
import { z } from "zod";
import { DomainError } from "../../core/errors.js";
import type { CallProvider } from "./provider.js";

const authenticated = new WeakMap<
  object,
  { event: WebhookEvent; sha256: string; apiKey: string; observedAt: number }
>();
export type LiveKitCallbackProof = Readonly<{ claimToken: string }>;
export function assertLiveKitCallbackProof(
  proof: LiveKitCallbackProof,
  event: WebhookEvent,
  sha256: string,
  apiKey: string,
) {
  const actual = authenticated.get(proof);
  if (
    !actual ||
    actual.event !== event ||
    actual.sha256 !== sha256 ||
    actual.apiKey !== apiKey ||
    Date.now() < actual.observedAt ||
    Date.now() - actual.observedAt > 30000
  )
    throw new DomainError(
      "call_webhook_authority_unavailable",
      "Current authenticated callback authority is required.",
      503,
    );
}

/** One verification may authorize one custody transaction. A genuine provider
 * retry is verified again and receives a fresh claim, then deduplicated by DB. */
export function consumeLiveKitCallbackProof(
  proof: LiveKitCallbackProof,
  event: WebhookEvent,
  sha256: string,
  apiKey: string,
) {
  assertLiveKitCallbackProof(proof, event, sha256, apiKey);
  authenticated.delete(proof);
}

function freezeCallback(value: object) {
  for (const nested of Object.values(value))
    if (nested && typeof nested === "object") freezeCallback(nested);
  Object.freeze(value);
}

type RoomBinding = Readonly<{
  roomId: string;
  providerRoomId: string | null;
  closedToAdmission: boolean;
  revocationConfirmed: boolean;
}>;

/** A reviewed, durable owner port, not a participant Actor or an in-memory map.
 * Preparation must recheck current canonical room/admission authority. Closure
 * blocks issuance atomically before returning EVERY issued identity, including
 * identities which never joined or already left. Missing custody never opens a
 * room. W8 owns the separate purpose authority and registry activation.
 */
export interface LiveKitCallCustody {
  room(roomId: string): Promise<RoomBinding>;
  prepareRoom(input: Parameters<CallProvider["ensureRoom"]>[0]): Promise<void>;
  bindRoom(roomId: string, providerRoomId: string): Promise<void>;
  admission(input: Parameters<CallProvider["token"]>[0]): Promise<{
    identity: string;
    expiresAt: string;
  }>;
  beginClosure(roomId: string, revokeTokenTs: bigint): Promise<string[]>;
  recordRemoval(
    roomId: string,
    identity: string,
    revokeTokenTs: bigint,
  ): Promise<void>;
  confirmRevocation(roomId: string, revokeTokenTs: bigint): Promise<void>;
  accountForIdentity(roomId: string, identity: string): Promise<string | null>;
}

export type LiveKitConfiguration = Readonly<{
  mode: "cloud" | "self-hosted-development";
  apiURL: string;
  websocketURL: string;
  apiKey: string;
  apiSecret: string;
}>;

function validateConfiguration(config: LiveKitConfiguration) {
  const api = new URL(config.apiURL);
  const ws = new URL(config.websocketURL);
  const local = (url: URL) =>
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    !config.apiKey ||
    config.apiSecret.length < 32 ||
    [api, ws].some(
      (url) => url.username || url.password || url.search || url.hash,
    ) ||
    (config.mode === "cloud"
      ? api.protocol !== "https:" || ws.protocol !== "wss:"
      : process.env.NODE_ENV !== "development" ||
        !local(api) ||
        !local(ws) ||
        api.protocol !== "http:" ||
        ws.protocol !== "ws:")
  )
    throw new Error(
      "LiveKit requires explicit secure provider or labelled loopback development configuration.",
    );
}

/** Real SDK room operations. Standard LiveKit JWTs remain replayable: this
 * adapter NEVER advertises provider-enforced single-use admission. The
 * canonical CallService consequently keeps paid calling unavailable.
 */
export class LiveKitCallProvider implements CallProvider {
  readonly name: string;
  readonly supportsSingleUseAdmission = false;
  private readonly rooms: RoomServiceClient;
  constructor(
    private readonly config: LiveKitConfiguration,
    private readonly custody: LiveKitCallCustody,
    private readonly recording?: Pick<
      CallProvider,
      "setRecording" | "deleteRecording"
    >,
    private readonly authoritativeHistory?: CallProvider["history"],
  ) {
    validateConfiguration(config);
    this.name =
      config.mode === "cloud"
        ? "livekit-cloud"
        : "livekit-self-hosted-development";
    this.rooms = new RoomServiceClient(
      config.apiURL,
      config.apiKey,
      config.apiSecret,
      {
        requestTimeout: 5,
        failover: false,
      },
    );
  }
  async ensureRoom(input: Parameters<CallProvider["ensureRoom"]>[0]) {
    if (
      input.recording !== false ||
      !Number.isFinite(Date.parse(input.endAt)) ||
      Date.parse(input.endAt) <= Date.now()
    )
      throw new DomainError("call_room_invalid", "This call cannot open.", 400);
    await this.custody.prepareRoom(input);
    const existing = await this.custody.room(input.roomId);
    if (existing.closedToAdmission)
      throw new DomainError("call_ended", "This call has ended.", 409);
    const room = await this.rooms.createRoom({
      name: input.roomId,
      maxParticipants: 2,
      emptyTimeout: Math.max(
        1,
        Math.ceil((Date.parse(input.endAt) - Date.now()) / 1000),
      ),
      departureTimeout: 180,
      // No egress/agent dispatch: recording starts only via its consented owner.
    });
    if (room.activeRecording)
      throw new DomainError(
        "call_recording_unconfirmed",
        "Recording requires confirmation.",
        503,
      );
    await this.custody.bindRoom(input.roomId, room.sid);
  }
  async token(input: Parameters<CallProvider["token"]>[0]) {
    z.uuid().parse(input.nonce);
    const room = await this.custody.room(input.roomId);
    if (room.closedToAdmission)
      throw new DomainError("call_ended", "This call has ended.", 409);
    const admission = await this.custody.admission(input);
    z.uuid().parse(admission.identity);
    const end = Math.min(
      Date.parse(admission.expiresAt),
      Date.parse(input.expiresAt),
    );
    const ttl = Math.floor((end - Date.now()) / 1000);
    if (!Number.isFinite(ttl) || ttl < 1 || ttl > 30)
      throw new DomainError(
        "call_token_expired",
        "Rejoin this call for current admission.",
        409,
      );
    const token = new AccessToken(this.config.apiKey, this.config.apiSecret, {
      identity: admission.identity,
      ttl,
      attributes: { "w6.admission": input.nonce, "w6.role": input.role },
    });
    token.addGrant({
      room: input.roomId,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
      canPublishSources: input.camera
        ? [TrackSource.MICROPHONE, TrackSource.CAMERA]
        : [TrackSource.MICROPHONE],
    });
    return { token: await token.toJwt(), url: this.config.websocketURL };
  }
  async closeRoom(roomId: string) {
    // An explicit Cloud cutoff must be within 60s of the provider's clock.
    // Leave room for clock skew and cover SDK refreshes during this bounded
    // removal attempt. Custody blocks issuance before returning all identities.
    const started = performance.now();
    const cutoff = BigInt(Math.floor(Date.now() / 1000) + 30);
    const requireCurrentCutoff = () => {
      const remaining = Number(cutoff) - Date.now() / 1000;
      if (
        performance.now() - started > 20_000 ||
        remaining < 5 ||
        remaining > 45
      )
        throw new DomainError(
          "call_revocation_attempt_expired",
          "Call closure requires a fresh provider revocation attempt.",
          503,
        );
    };
    const identities = await this.custody.beginClosure(roomId, cutoff);
    if (
      identities.length > 1000 ||
      new Set(identities).size !== identities.length
    )
      throw new DomainError(
        "call_identity_unconfirmed",
        "Call closure requires current identity custody.",
        503,
      );
    for (const identity of identities) {
      z.uuid().parse(identity);
      requireCurrentCutoff();
      await this.rooms.removeParticipant(roomId, identity, {
        revokeTokenTs: cutoff,
      });
      requireCurrentCutoff();
      await this.custody.recordRemoval(roomId, identity, cutoff);
    }
    requireCurrentCutoff();
    const rooms = await this.rooms.listRooms([roomId]);
    if (rooms.length) await this.rooms.deleteRoom(roomId);
    if ((await this.rooms.listRooms([roomId])).length)
      throw new DomainError(
        "call_room_closure_unconfirmed",
        "Call closure is awaiting provider confirmation.",
        503,
      );
    if (this.config.mode !== "cloud")
      throw new DomainError(
        "call_provider_revocation_unconfirmed",
        "Self-hosted token revocation is not verified.",
        503,
      );
    requireCurrentCutoff();
    await this.custody.confirmRevocation(roomId, cutoff);
  }
  async state(roomId: string) {
    const binding = await this.custody.room(roomId);
    const rooms = await this.rooms.listRooms([roomId]);
    if (
      rooms.length > 1 ||
      (rooms[0] && rooms[0].sid !== binding.providerRoomId)
    )
      throw new DomainError(
        "call_room_recreated",
        "Current provider room identity needs confirmation.",
        503,
      );
    const participants = rooms.length
      ? await this.rooms.listParticipants(roomId)
      : [];
    const accounts = [] as string[];
    for (const participant of participants) {
      const account = await this.custody.accountForIdentity(
        roomId,
        participant.identity,
      );
      if (!account)
        throw new DomainError(
          "call_identity_unconfirmed",
          "Current participant identity needs confirmation.",
          503,
        );
      accounts.push(z.uuid().parse(account));
    }
    return {
      presentAccountIds: [...new Set(accounts)],
      recording: rooms[0]?.activeRecording ?? false,
      closed:
        !rooms.length &&
        this.config.mode === "cloud" &&
        binding.closedToAdmission &&
        binding.revocationConfirmed,
    };
  }
  async history(roomId: string): ReturnType<CallProvider["history"]> {
    const binding = await this.custody.room(roomId);
    if (this.authoritativeHistory) return this.authoritativeHistory(roomId);
    return {
      complete: false,
      closed: false,
      reference: `livekit:${binding.providerRoomId ?? "unbound"}:authoritative-history-unavailable`,
      participants: [],
    };
  }
  async setRecording(roomId: string, enabled: boolean, key: string) {
    await this.custody.room(roomId);
    if (this.recording)
      return this.recording.setRecording(roomId, enabled, key);
    if (!enabled) {
      const state = await this.state(roomId);
      if (!state.recording) return { recording: false };
    }
    throw new DomainError(
      "call_recording_unconfigured",
      "Consented recording storage is unavailable.",
      503,
    );
  }
  async deleteRecording(
    roomId: string,
    key: string,
  ): ReturnType<CallProvider["deleteRecording"]> {
    await this.custody.room(roomId);
    if (!this.recording)
      throw new DomainError(
        "call_recording_deletion_unconfigured",
        "Recording deletion requires actual storage receipts.",
        503,
      );
    return this.recording.deleteRecording(roomId, key);
  }
}

/** Verified, bounded callback ingress. The durable journal must bind actual
 * room SID/identity, reject same-ID/different-body conflicts and acknowledge
 * only after commit. Callback delivery/polling never establishes completeness.
 */
export function liveKitWebhookRouter(input: {
  config: LiveKitConfiguration;
  journal: {
    ingest(
      event: WebhookEvent,
      bodySha256: string,
      proof: LiveKitCallbackProof,
    ): Promise<"stored" | "duplicate">;
  };
}) {
  validateConfiguration(input.config);
  const receiver = new WebhookReceiver(
    input.config.apiKey,
    input.config.apiSecret,
  );
  const router = express.Router();
  router.post(
    "/",
    express.raw({
      type: ["application/webhook+json", "application/json"],
      limit: "256kb",
    }),
    async (req, res) => {
      res.setHeader("Cache-Control", "no-store");
      if (!Buffer.isBuffer(req.body)) {
        res.status(400).json({ error: { code: "call_webhook_invalid" } });
        return;
      }
      let event: WebhookEvent;
      try {
        event = await receiver.receive(
          req.body.toString("utf8"),
          req.get("Authorization"),
          false,
          0,
        );
        z.string().min(1).max(128).parse(event.id);
        z.string().min(1).max(64).parse(event.event);
      } catch {
        res
          .status(401)
          .json({ error: { code: "call_webhook_unauthenticated" } });
        return;
      }
      const sha256 = createHash("sha256").update(req.body).digest("hex");
      freezeCallback(event);
      const proof = Object.freeze({ claimToken: randomUUID() });
      authenticated.set(proof, {
        event,
        sha256,
        apiKey: input.config.apiKey,
        observedAt: Date.now(),
      });
      try {
        await input.journal.ingest(event, sha256, proof);
      } finally {
        authenticated.delete(proof);
      }
      res.status(204).end();
    },
  );
  return router;
}
