/** W6 creator-object paths. W1 composes these into the canonical OpenAPI and clients. */
import { CreatorMediaPurposeSchema } from "./media.ts";
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (name: string) => ({ "application/json": { schema: ref(name) } });
const path = (name: string) => ({
  in: "path",
  name,
  required: true,
  schema: { type: "string", format: "uuid" },
});
const errors = Object.fromEntries(
  [400, 401, 403, 404, 409, 503].map((status) => [
    status,
    {
      description: "Request refused or integration unavailable",
      content: json("Error"),
    },
  ]),
);
const operation = (operationId: string, response: string, body?: string) => ({
  operationId,
  security: [{ PantopusSession: [] }],
  ...(body ? { requestBody: { required: true, content: json(body) } } : {}),
  responses: {
    "200": { description: "Success", content: json(response) },
    ...errors,
  },
});
const binary = {
  "application/octet-stream": { schema: { type: "string", format: "binary" } },
};
const playback = (operationId: string) => ({
  operationId,
  description:
    "Serve the exact playbackFile variant, SHA-256 and byte count pinned by the current playback ticket. This file can differ from the immutable processed signing tuple.",
  security: [{ PantopusSession: [] }],
  parameters: [
    {
      in: "query",
      name: "ticket",
      required: true,
      schema: { type: "string", maxLength: 2048 },
    },
    {
      in: "header",
      name: "Range",
      required: false,
      schema: { type: "string" },
    },
  ],
  responses: {
    "200": { description: "Authorized current media bytes", content: binary },
    "206": { description: "Authorized current byte range", content: binary },
    "416": { description: "Unsatisfiable single byte range" },
    ...errors,
  },
});
const owner = [path("creatorId"), path("assetId")];
const expectedAccountHeader = {
  in: "header",
  name: "x-qelvora-expected-account",
  required: false,
  description:
    "Pin to the original account. Must match the actual current session; never grants authority.",
  schema: { type: "string", format: "uuid" },
};
const expectedAccountQuery = {
  in: "query",
  name: "expectedAccountId",
  required: false,
  description:
    "Account pin for media elements. Must match the actual session and any account header.",
  schema: { type: "string", format: "uuid" },
};
const fan = [path("creatorId"), path("fanId"), path("assetId")];
const creator = "/v1/w6/creators/{creatorId}/media";
const thread = "/v1/w6/threads/{creatorId}/{fanId}/creator-media";
const audience = "/v1/w6/creators/{creatorId}/audience-media";
const call = "/v1/w6/threads/{creatorId}/{fanId}/calls/{sessionId}";
const callParameters = [
  path("creatorId"),
  path("fanId"),
  path("sessionId"),
  expectedAccountHeader,
];
const offers = "/v1/w6/threads/{creatorId}/{fanId}/call-offers";
export const mediaPaths = {
  "/v1/w6/capabilities": {
    get: {
      ...operation("readMediaCapabilities", "MediaCapabilities"),
      security: [],
      description:
        "Public service composition state only. These flags grant no media, call, publication or account authority.",
    },
  },
  [call]: {
    parameters: callParameters,
    get: operation("readCallSession", "CallCallSession"),
  },
  [`${call}/join`]: {
    parameters: callParameters,
    post: operation("joinCallSession", "CallCallAdmission"),
  },
  [`${call}/consent`]: {
    parameters: callParameters,
    post: operation("setCallConsent", "CallCallSession", "CallConsentCommand"),
  },
  [`${call}/end`]: {
    parameters: callParameters,
    post: operation("endCallSession", "CallCallSession", "CallEndCall"),
  },
  [`${call}/summary-note`]: {
    parameters: callParameters,
    post: operation(
      "saveCallSummaryNote",
      "CallCallSession",
      "CallCallSummaryNote",
    ),
  },
  [`${call}/delete-summary`]: {
    parameters: callParameters,
    post: operation("deleteCallSummary", "CallCallSession", "CallCallRevision"),
  },
  [`${call}/cancel`]: {
    parameters: callParameters,
    post: operation("cancelCallSession", "CallCallSession", "CallCallRevision"),
  },
  [offers]: {
    parameters: [path("creatorId"), path("fanId"), expectedAccountHeader],
    get: operation("readCallOffers", "CallCallOffers"),
  },
  [`${offers}/{offerId}/select`]: {
    parameters: [
      path("creatorId"),
      path("fanId"),
      path("offerId"),
      expectedAccountHeader,
    ],
    post: operation("selectCallOffer", "CallCallSession", "CallSelectTime"),
  },
  "/v1/w6/calls/{sessionId}/route": {
    parameters: [path("sessionId"), expectedAccountHeader],
    get: {
      ...operation("readAccountCallRoute", "CallCallRoute"),
      description:
        "Resolve one exact call for the actual current account after held session, restoration, participant denial, Access and current captured-booking checks. Returns navigation IDs only, with no call admission, provider, worker or financial authority. Unconfigured purposes stay unavailable.",
    },
  },
  "/v1/w6/threads/{creatorId}/{fanId}/calls/{sessionId}/redeem": {
    parameters: [
      path("creatorId"),
      path("fanId"),
      path("sessionId"),
      expectedAccountHeader,
    ],
    post: {
      ...operation(
        "redeemCallAdmission",
        "CallAdmissionReceipt",
        "CallAdmissionRedemption",
      ),
      description:
        "Consume the actual unused, unexpired admission nonce for this call and current authenticated account before connecting transport. Ended calls and invalid or reused admission are refused with the current service's 403 error. This receipt does not establish single-use provider-token enforcement.",
    },
  },
  "/v1/w6/creators/{creatorId}/media-policy": {
    parameters: [path("creatorId")],
    get: {
      ...operation("readCreatorMediaPolicy", "MediaCreatorMediaPolicyView"),
      parameters: [
        {
          in: "query",
          name: "objectId",
          required: true,
          schema: { type: "string", format: "uuid" },
        },
        {
          in: "query",
          name: "purpose",
          required: true,
          schema: {
            type: "string",
            enum: CreatorMediaPurposeSchema.options,
          },
        },
      ],
    },
  },
  [`${audience}/{assetId}`]: {
    parameters: [...owner, expectedAccountHeader],
    get: operation("readAudienceCreatorMedia", "MediaCreatorMediaAsset"),
  },
  [`${audience}/{assetId}/playback`]: {
    parameters: [...owner, expectedAccountHeader],
    post: operation(
      "audienceCreatorMediaPlayback",
      "MediaCreatorMediaPlaybackTicket",
    ),
  },
  [`${audience}/{assetId}/play`]: {
    parameters: owner,
    get: {
      ...playback("playAudienceCreatorMedia"),
      parameters: [
        ...playback("playAudienceCreatorMedia").parameters,
        expectedAccountHeader,
        expectedAccountQuery,
      ],
    },
  },
  "/v1/w6/creators/{creatorId}/call-availability": {
    parameters: [path("creatorId"), expectedAccountHeader],
    get: operation("readCreatorCallAvailability", "CallAvailabilityView"),
    put: operation(
      "saveCreatorCallAvailability",
      "CallAvailability",
      "CallAvailabilityCommand",
    ),
  },
  [creator]: {
    parameters: [path("creatorId")],
    post: {
      ...operation(
        "beginCreatorMedia",
        "MediaCreatorMediaUploadTicket",
        "MediaCreatorMediaUploadRequest",
      ),
      responses: {
        "201": {
          description: "Upload allocated or recovered",
          content: json("MediaCreatorMediaUploadTicket"),
        },
        ...errors,
      },
    },
  },
  [`${creator}/{assetId}`]: {
    parameters: owner,
    get: operation("readCreatorMedia", "MediaCreatorMediaAsset"),
    delete: {
      ...operation("revokeCreatorMedia", "MediaMediaRevocation"),
      responses: {
        "202": {
          description: "Access revoked; deletion pending",
          content: json("MediaMediaRevocation"),
        },
        ...errors,
      },
    },
  },
  [`${creator}/{assetId}/resume`]: {
    parameters: owner,
    post: operation("resumeCreatorMedia", "MediaCreatorMediaUploadTicket"),
  },
  [`${creator}/{assetId}/upload`]: {
    parameters: owner,
    put: {
      ...operation("uploadCreatorMediaChunk", "MediaCreatorMediaAsset"),
      parameters: [
        {
          in: "query",
          name: "ticket",
          required: true,
          schema: { type: "string", maxLength: 2048 },
        },
        {
          in: "header",
          name: "Upload-Offset",
          required: true,
          schema: { type: "integer", minimum: 0 },
        },
      ],
      requestBody: { required: true, content: binary },
    },
  },
  [`${creator}/{assetId}/finish`]: {
    parameters: owner,
    post: operation("finishCreatorMedia", "MediaCreatorMediaAsset"),
  },
  [`${creator}/{assetId}/playback`]: {
    parameters: owner,
    post: operation("creatorMediaPlayback", "MediaCreatorMediaPlaybackTicket"),
  },
  [`${creator}/{assetId}/play`]: {
    parameters: owner,
    get: playback("playCreatorMedia"),
  },
  [`${thread}/{assetId}`]: {
    parameters: fan,
    get: operation("readFanCreatorMedia", "MediaCreatorMediaAsset"),
  },
  [`${thread}/{assetId}/playback`]: {
    parameters: fan,
    post: operation(
      "fanCreatorMediaPlayback",
      "MediaCreatorMediaPlaybackTicket",
    ),
  },
  [`${thread}/{assetId}/play`]: {
    parameters: fan,
    get: playback("playFanCreatorMedia"),
  },
};
