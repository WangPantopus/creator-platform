import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import type { FileHandle } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { z, ZodError } from "zod";
import { DomainError } from "../../core/errors.js";
import type { ThreadScope } from "../access/scope.js";
import type { MediaService } from "./service.js";
import type { CreatorMediaService } from "./creator-service.js";
import type { CreatorScope } from "../identity/creator-scope.js";
import type { AudienceScope } from "../identity/audience-scope.js";
import type { SessionService } from "../session/service.js";
import type { Actor } from "../identity/adapter.js";
import type { AccountCallMetadata } from "../session/account-call-metadata.js";
import type { AvailabilityService } from "../session/availability.js";
import { visibleSession } from "../session/service.js";
import { withDeadline } from "./deadline.js";
import { CapabilitiesSchema } from "../../../../../packages/api/src/media.js";
import {
  AdmissionRedemptionSchema,
  type CallSession,
} from "../../../../../packages/api/src/session.js";

export type W6RouterDependencies = {
  scopeFor: (request: Request) => Promise<ThreadScope>;
  /** Supplied only by the canonical host's actual request identity resolver. */
  actorFor?: (request: Request) => Promise<Actor>;
  media?: MediaService;
  creatorMedia?: CreatorMediaService;
  creatorScopeFor?: (request: Request) => Promise<CreatorScope>;
  audienceScopeFor?: (request: Request) => Promise<AudienceScope>;
  sessions?: SessionService;
  accountCalls?: AccountCallMetadata;
  availability?: AvailabilityService;
};
/** W1 mounts before its terminal404/error handler. No identity inference in W6. */
export function createW6Router(dependencies: W6RouterDependencies) {
  const router = express.Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  router.get("/capabilities", (_req, res) =>
    res.json(
      CapabilitiesSchema.parse({
        mediaAvailable: Boolean(dependencies.media),
        creatorMediaAvailable: Boolean(
          dependencies.creatorMedia && dependencies.creatorScopeFor,
        ),
        creatorMediaAudienceAvailable: Boolean(
          dependencies.creatorMedia?.audienceIdentity &&
            dependencies.audienceScopeFor,
        ),
        callsAvailable: Boolean(
          dependencies.sessions &&
            dependencies.actorFor &&
            dependencies.sessions.provider.name !== "unconfigured" &&
            dependencies.sessions.interactiveControlAvailable &&
            dependencies.sessions.provider.supportsSingleUseAdmission,
        ),
        aiAudioAvailable: false,
        callRecoveryAvailable: dependencies.accountCalls?.available === true,
        reason: !dependencies.media
          ? "media_unconfigured"
          : "licensed_ai_audio_and_provider_verification_required",
      }),
    ),
  );
  router.use(express.json({ limit: "64kb" }));
  router.get("/calls/:sessionId/route", async (req, res) => {
    const sessionId = z.uuid().parse(req.params.sessionId);
    if (!dependencies.accountCalls?.available)
      throw new DomainError(
        "call_metadata_unconfigured",
        "Current-account call recovery is unavailable.",
        503,
      );
    const selector = req.headers["x-qelvora-expected-account"];
    if (selector !== undefined && typeof selector !== "string")
      throw new DomainError(
        "session_account_invalid",
        "Reopen this call with your current account.",
        400,
      );
    res.json(await dependencies.accountCalls.read(sessionId, selector));
  });
  const root = "/threads/:creatorId/:fanId";
  const media = () => {
    if (!dependencies.media)
      throw new DomainError(
        "media_unconfigured",
        "Uploading and playback are not connected yet.",
        503,
      );
    return dependencies.media;
  };
  const session = () => {
    if (!dependencies.sessions)
      throw new DomainError(
        "calls_unconfigured",
        "Calling is not connected yet.",
        503,
      );
    return dependencies.sessions;
  };
  const scope = async (req: Request) => {
    z.uuid().parse(req.params.creatorId);
    z.uuid().parse(req.params.fanId);
    const current = await dependencies.scopeFor(req);
    assertExpectedAccount(req, current.actorAccountId);
    return current;
  };
  const callActor = async (req: Request) => {
    if (!dependencies.actorFor)
      throw new DomainError(
        "call_control_request_required",
        "Calling requires this host’s current authenticated request.",
        503,
      );
    return dependencies.actorFor(req);
  };
  router.get(`${root}/recording-policy`, async (req, res) =>
    res.json(await media().recordingPolicy(await scope(req))),
  );
  const id = (req: Request, key = "assetId") => z.uuid().parse(req.params[key]);
  const creatorMedia = () => {
    if (!dependencies.creatorMedia || !dependencies.creatorScopeFor)
      throw new DomainError(
        "creator_media_unconfigured",
        "Creator media is not connected yet.",
        503,
      );
    return dependencies.creatorMedia;
  };
  const creatorScope = async (req: Request) => {
    z.uuid().parse(req.params.creatorId);
    if (!dependencies.creatorScopeFor)
      throw new DomainError(
        "creator_scope_unconfigured",
        "Creator operations are not connected yet.",
        503,
      );
    const current = await dependencies.creatorScopeFor!(req);
    assertExpectedAccount(req, current.accountId);
    return current;
  };
  const audienceScope = async (req: Request) => {
    z.uuid().parse(req.params.creatorId);
    if (!dependencies.audienceScopeFor)
      throw new DomainError(
        "media_audience_unconfigured",
        "Content playback is awaiting its current audience authority.",
        503,
      );
    const current = await dependencies.audienceScopeFor(req);
    assertExpectedAccount(req, current.actorAccountId);
    return current;
  };
  const creatorAvailability = () => {
    if (!dependencies.availability)
      throw new DomainError(
        "availability_unconfigured",
        "Call availability is not connected yet.",
        503,
      );
    return dependencies.availability;
  };
  router.get("/creators/:creatorId/call-availability", async (req, res) =>
    res.json(await creatorAvailability().readCreator(await creatorScope(req))),
  );
  router.put("/creators/:creatorId/call-availability", async (req, res) =>
    res.json(
      await creatorAvailability().saveCreator(
        await creatorScope(req),
        req.body,
      ),
    ),
  );
  const creatorRoot = "/creators/:creatorId/media";
  router.get("/creators/:creatorId/media-policy", async (req, res) =>
    res.json(
      await creatorMedia().uploadPolicy(await creatorScope(req), {
        objectId: req.query.objectId,
        purpose: req.query.purpose,
      }),
    ),
  );
  router.post(creatorRoot, async (req, res) =>
    res
      .status(201)
      .json(await creatorMedia().begin(await creatorScope(req), req.body)),
  );
  router.get(`${creatorRoot}/:assetId`, async (req, res) =>
    res.json(await creatorMedia().read(await creatorScope(req), id(req))),
  );
  router.post(`${creatorRoot}/:assetId/resume`, async (req, res) =>
    res.json(await creatorMedia().resume(await creatorScope(req), id(req))),
  );
  router.put(
    `${creatorRoot}/:assetId/upload`,
    express.raw({ type: "application/octet-stream", limit: "1mb" }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body))
        throw new DomainError(
          "media_chunk_invalid",
          "Send a binary upload chunk.",
          400,
        );
      res.json(
        await creatorMedia().chunk(
          await creatorScope(req),
          id(req),
          z.string().parse(req.query.ticket),
          Number(req.headers["upload-offset"]),
          req.body,
        ),
      );
    },
  );
  router.post(`${creatorRoot}/:assetId/finish`, async (req, res) =>
    res.json(await creatorMedia().finish(await creatorScope(req), id(req))),
  );
  router.delete(`${creatorRoot}/:assetId`, async (req, res) => {
    await creatorMedia().revoke(await creatorScope(req), id(req));
    res.status(202).json({ state: "revoked", deletion: "pending" });
  });
  router.post(`${creatorRoot}/:assetId/playback`, async (req, res) =>
    res.json(await creatorMedia().playback(await creatorScope(req), id(req))),
  );
  router.get(`${creatorRoot}/:assetId/play`, async (req, res) => {
    const service = creatorMedia();
    const current = await creatorScope(req);
    const assetId = id(req);
    const result = await service.download(
      current,
      assetId,
      z.string().parse(req.query.ticket),
    );
    await streamMedia(req, res, result, () =>
      service.assertPlaybackCurrent(
        current,
        assetId,
        result.asset.version,
        result.accessEpoch,
        result.publication,
        result.playbackFile,
      ),
    );
  });
  const audienceRoot = "/creators/:creatorId/audience-media";
  router.get(`${audienceRoot}/:assetId`, async (req, res) =>
    res.json(await creatorMedia().read(await audienceScope(req), id(req))),
  );
  router.post(`${audienceRoot}/:assetId/playback`, async (req, res) =>
    res.json(await creatorMedia().playback(await audienceScope(req), id(req))),
  );
  router.get(`${audienceRoot}/:assetId/play`, async (req, res) => {
    const service = creatorMedia();
    const current = await audienceScope(req);
    const assetId = id(req);
    const result = await service.download(
      current,
      assetId,
      z.string().parse(req.query.ticket),
    );
    await streamMedia(req, res, result, () =>
      service.assertPlaybackCurrent(
        current,
        assetId,
        result.asset.version,
        result.accessEpoch,
        result.publication,
        result.playbackFile,
      ),
    );
  });
  router.get(`${root}/creator-media/:assetId`, async (req, res) =>
    res.json(await creatorMedia().read(await scope(req), id(req))),
  );
  router.post(`${root}/creator-media/:assetId/playback`, async (req, res) =>
    res.json(await creatorMedia().playback(await scope(req), id(req))),
  );
  router.get(`${root}/creator-media/:assetId/play`, async (req, res) => {
    const service = creatorMedia();
    const current = await scope(req);
    const assetId = id(req);
    const result = await service.download(
      current,
      assetId,
      z.string().parse(req.query.ticket),
    );
    await streamMedia(req, res, result, () =>
      service.assertPlaybackCurrent(
        current,
        assetId,
        result.asset.version,
        result.accessEpoch,
        result.publication,
        result.playbackFile,
      ),
    );
  });
  const callResponse = async (
    req: Request,
    res: Response,
    run: (scope: ThreadScope) => Promise<CallSession>,
  ) => {
    const currentScope = await scope(req);
    res.json(visibleSession(currentScope, await run(currentScope)));
  };
  router.get(`${root}/call-availability`, async (req, res) => {
    if (!dependencies.availability)
      throw new DomainError(
        "availability_unconfigured",
        "Call availability is not connected yet.",
        503,
      );
    res.json(await dependencies.availability.read(await scope(req)));
  });
  router.put(`${root}/call-availability`, async (req, res) => {
    if (!dependencies.availability)
      throw new DomainError(
        "availability_unconfigured",
        "Call availability is not connected yet.",
        503,
      );
    res.json(await dependencies.availability.save(await scope(req), req.body));
  });
  router.post(`${root}/media`, async (req, res) =>
    res.status(201).json(await media().begin(await scope(req), req.body)),
  );
  router.get(`${root}/media/:assetId`, async (req, res) =>
    res.json(await media().read(await scope(req), id(req))),
  );
  router.post(`${root}/media/:assetId/resume`, async (req, res) =>
    res.json(await media().resume(await scope(req), id(req))),
  );
  router.put(
    `${root}/media/:assetId/upload`,
    express.raw({ type: "application/octet-stream", limit: "1mb" }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body))
        throw new DomainError(
          "media_chunk_invalid",
          "Send a binary upload chunk.",
          400,
        );
      res.json(
        await media().chunk(
          await scope(req),
          id(req),
          z.string().parse(req.query.ticket),
          Number(req.headers["upload-offset"]),
          req.body,
        ),
      );
    },
  );
  router.post(`${root}/media/:assetId/finish`, async (req, res) =>
    res.json(await media().finish(await scope(req), id(req))),
  );
  router.post(`${root}/media/:assetId/sign`, async (req, res) =>
    res.json(await media().sign(await scope(req), id(req), req.body)),
  );
  router.get(`${root}/media/:assetId/signing-command`, async (req, res) =>
    res.json(await media().signingCommand(await scope(req), id(req))),
  );
  router.delete(`${root}/media/:assetId`, async (req, res) => {
    await media().revoke(await scope(req), id(req));
    res.status(202).json({ state: "revoked", deletion: "pending" });
  });
  router.post(`${root}/media/:assetId/playback`, async (req, res) =>
    res.json(await media().playback(await scope(req), id(req))),
  );
  router.get(`${root}/media/:assetId/play`, async (req, res) => {
    const service = media();
    const currentScope = await scope(req);
    const assetId = id(req);
    const result = await service.download(
      currentScope,
      assetId,
      z.string().parse(req.query.ticket),
    );
    await streamMedia(req, res, result, () =>
      service.assertPlaybackCurrent(
        currentScope,
        assetId,
        result.asset.version,
        result.playbackFile,
      ),
    );
  });
  router.get(`${root}/call-offers`, async (req, res) =>
    res.json(await session().offers(await scope(req))),
  );
  router.get(`${root}/call-offers/context/:commitmentId`, async (req, res) =>
    res.json(
      await session().offerContext(await scope(req), id(req, "commitmentId")),
    ),
  );
  router.post(`${root}/call-offers`, async (req, res) =>
    res.status(201).json(await session().offer(await scope(req), req.body)),
  );
  router.post(`${root}/call-offers/:offerId/select`, async (req, res) =>
    callResponse(req, res, (current) =>
      session().select(current, id(req, "offerId"), req.body),
    ),
  );
  router.get(`${root}/calls/:sessionId`, async (req, res) =>
    callResponse(req, res, (current) =>
      session().read(current, id(req, "sessionId")),
    ),
  );
  router.post(`${root}/calls/:sessionId/join`, async (req, res) =>
    res.json(
      await session().join(
        await scope(req),
        id(req, "sessionId"),
        await callActor(req),
      ),
    ),
  );
  router.post(`${root}/calls/:sessionId/redeem`, async (req, res) => {
    const service = session();
    const body = AdmissionRedemptionSchema.parse(req.body);
    res.json(
      await service.redeem(
        await scope(req),
        id(req, "sessionId"),
        body.nonce,
        await callActor(req),
      ),
    );
  });
  router.post(`${root}/calls/:sessionId/consent`, async (req, res) =>
    callResponse(req, res, (current) =>
      session().consent(current, id(req, "sessionId"), req.body),
    ),
  );
  router.post(`${root}/calls/:sessionId/end`, async (req, res) =>
    callResponse(req, res, (current) =>
      session().end(current, id(req, "sessionId"), req.body),
    ),
  );
  router.post(`${root}/calls/:sessionId/summary-note`, async (req, res) =>
    callResponse(req, res, (current) =>
      session().summaryNote(current, id(req, "sessionId"), req.body),
    ),
  );
  router.post(`${root}/calls/:sessionId/delete-summary`, async (req, res) =>
    callResponse(req, res, (current) =>
      session().deleteSummary(current, id(req, "sessionId"), req.body),
    ),
  );
  router.post(`${root}/calls/:sessionId/cancel`, async (req, res) =>
    callResponse(req, res, (current) =>
      session().cancel(current, id(req, "sessionId"), req.body),
    ),
  );
  router.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      void _next;
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const domain =
        error instanceof DomainError
          ? error
          : error instanceof ZodError || error instanceof SyntaxError
            ? new DomainError(
                "invalid_request",
                "The request does not match the media contract.",
                400,
              )
            : new DomainError(
                "media_service_unavailable",
                "Media is unavailable. Try again.",
                503,
              );
      res.status(domain.status).json({
        error: {
          code: domain.code,
          message: domain.message,
          requestId: res.locals.requestId,
        },
      });
    },
  );
  return router;
}

/** A caller may pin a request to its original account, never select authority. */
function assertExpectedAccount(req: Request, accountId: string) {
  const header = req.get("x-qelvora-expected-account");
  const query = req.query.expectedAccountId;
  const headerId =
    header === undefined ? undefined : z.uuid().parse(header).toLowerCase();
  const queryId =
    query === undefined ? undefined : z.uuid().parse(query).toLowerCase();
  if (headerId && queryId && headerId !== queryId)
    throw new DomainError(
      "media_account_selector_conflict",
      "Reopen this media with your current account.",
      400,
    );
  const expected = headerId ?? queryId;
  if (expected !== undefined && expected !== accountId.toLowerCase())
    throw new DomainError(
      "media_account_changed",
      "Your account changed. Reopen this media before continuing.",
      403,
    );
}

async function streamMedia(
  req: Request,
  res: Response,
  result: { handle: FileHandle; size: number; asset: { mimeType: string } },
  assertCurrent: () => Promise<void>,
) {
  try {
    await assertCurrent();
    const range = req.headers.range;
    let start = 0;
    let end = result.size - 1;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/u.exec(range);
      if (!match || (!match[1] && !match[2])) {
        res.status(416).setHeader("Content-Range", `bytes */${result.size}`);
        res.end();
        return;
      }
      if (!match[1]) start = Math.max(0, result.size - Number(match[2]));
      else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= result.size
      ) {
        res.status(416).setHeader("Content-Range", `bytes */${result.size}`);
        res.end();
        return;
      }
      res
        .status(206)
        .setHeader("Content-Range", `bytes ${start}-${end}/${result.size}`);
    }
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Content-Type", result.asset.mimeType);
    res.setHeader("Content-Length", end - start + 1);
    const controller = new AbortController();
    let checking = false;
    // A slow or backpressured response can outlive its initial range authorization.
    // Fail closed on unavailable authority; bound the serialized checks and release them with the stream.
    const recheck = setInterval(() => {
      if (checking || controller.signal.aborted) return;
      checking = true;
      const pending = assertCurrent().finally(() => {
        checking = false;
      });
      void withDeadline(pending, 1000).catch(() => controller.abort());
    }, 1000);
    try {
      await pipeline(
        result.handle.createReadStream({ start, end, autoClose: false }),
        res,
        {
          signal: controller.signal,
        },
      );
    } finally {
      clearInterval(recheck);
      controller.abort();
    }
  } finally {
    await result.handle.close();
  }
}
