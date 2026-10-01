import { z } from "zod";
import { publicSchemas } from "./schemas.ts";
import * as conversation from "./conversation/contracts.ts";
import * as content from "./content.ts";
import * as studio from "./studio.ts";
import { mediaPaths } from "./media-openapi.ts";

// Aggregate owner contracts here after the core module initializes; conversation
// itself imports core schemas and cannot be imported back into that module.
const domainSchemas = Object.fromEntries(
  [
    ["Conversation", conversation],
    ["Content", content],
    ["Studio", studio],
  ].flatMap(([prefix, values]) =>
    Object.entries(values as Record<string, unknown>)
      .filter(([, schema]) => schema instanceof z.ZodType)
      .map(([name, schema]) => [
        String(prefix) + name.replace(/Schema$/u, ""),
        schema as z.ZodType,
      ]),
  ),
);

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (name: string) => ({ "application/json": { schema: ref(name) } });
const operation = (id: string, response: string, body?: string) => ({
  operationId: id,
  security: [{ PantopusSession: [] }],
  ...(body ? { requestBody: { required: true, content: json(body) } } : {}),
  responses: {
    "200": { description: "Success", content: json(response) },
    "400": { description: "Invalid request", content: json("Error") },
    "401": { description: "Session ended", content: json("Error") },
    "403": { description: "Action refused", content: json("Error") },
    "404": { description: "Unavailable object", content: json("Error") },
    "409": { description: "State changed", content: json("Error") },
    "503": { description: "Integration unavailable", content: json("Error") },
  },
});
const pair = [
  {
    in: "path",
    name: "creatorId",
    required: true,
    schema: { type: "string", format: "uuid" },
  },
  {
    in: "path",
    name: "fanId",
    required: true,
    schema: { type: "string", format: "uuid" },
  },
];
export function createOpenApi() {
  return {
    openapi: "3.1.0",
    info: {
      title: "Creator Platform API",
      version: "0.1.0",
      description:
        "Foundation contract. Private operations fail closed until the Pantopus identity adapter and runtime database are configured.",
    },
    paths: {
      "/health": { get: { ...operation("health", "Health"), security: [] } },
      "/v1/identity/capabilities": {
        get: {
          ...operation("identityCapabilities", "IdentityCapabilities"),
          security: [],
        },
      },
      "/v1/identity/continue": {
        post: {
          ...operation(
            "continueWithPantopus",
            "IdentityRedirect",
            "IdentityContinue",
          ),
          security: [],
        },
      },
      "/v1/identity/complete": {
        post: {
          ...operation(
            "completeIdentity",
            "IdentityCompletion",
            "CompleteIdentity",
          ),
          security: [],
        },
      },
      "/v1/identity/session": { get: operation("identitySession", "Session") },
      "/v1/identity/refresh": {
        post: operation("refreshSession", "SessionToken"),
      },
      "/v1/identity/logout": { post: operation("logout", "Done") },
      "/v1/identity/revoke-sessions": {
        post: operation("revokeSessions", "Done"),
      },
      "/v1/identity/fan-profile": {
        post: operation("saveFanProfile", "FanProfile", "FanProfileInput"),
      },
      "/v1/identity/creator-profile": {
        post: operation(
          "saveCreatorProfile",
          "CreatorProfile",
          "CreatorProfileInput",
        ),
      },
      "/v1/identity/{creatorId}/proof": {
        parameters: [pair[0]],
        get: operation("creatorProof", "Proof"),
        post: operation("beginCreatorProof", "Proof", "ProofInput"),
      },
      "/v1/identity/proof/{proofId}/submit": {
        parameters: [
          {
            in: "path",
            name: "proofId",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        post: operation("submitCreatorProof", "Proof", "ProofSubmit"),
      },
      "/v1/identity/passkeys": { get: operation("passkeys", "Passkeys") },
      "/v1/identity/passkeys/begin": {
        post: operation("beginPasskey", "PasskeyOptions"),
      },
      "/v1/identity/passkeys/register": {
        post: operation("registerPasskey", "Done", "PasskeyRegistration"),
      },
      "/v1/identity/passkeys/recovery": {
        post: operation("recoverPasskeys", "Done"),
      },
      "/v1/identity/passkeys/revoke": {
        post: operation("revokePasskey", "Done", "PasskeyRevocation"),
      },
      "/v1/identity/passkeys/{challengeId}/cancel": {
        parameters: [
          {
            in: "path",
            name: "challengeId",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        post: operation("cancelPasskey", "Done"),
      },
      "/v1/identity/{creatorId}/team/invite": {
        parameters: [pair[0]],
        post: operation("inviteTeamMember", "TeamInvitation", "TeamInvite"),
      },
      "/v1/identity/team/{invitationId}/accept": {
        parameters: [
          {
            in: "path",
            name: "invitationId",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        post: operation("acceptTeamInvitation", "Done"),
      },
      "/v1/identity/{creatorId}/team/{accountId}/remove": {
        parameters: [
          pair[0],
          {
            in: "path",
            name: "accountId",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        post: operation("removeTeamMember", "Done"),
      },
      "/v1/identity/signed-acts/{challengeId}/cancel": {
        parameters: [
          {
            in: "path",
            name: "challengeId",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        post: operation("cancelSignedAct", "Done"),
      },
      "/v1/identity/signed-acts/{signedActId}": {
        parameters: [
          {
            in: "path",
            name: "signedActId",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        get: {
          ...operation("publicSignature", "PublicSignature"),
          security: [],
        },
      },
      "/v1/identity/{creatorId}/signed-acts/begin": {
        parameters: [pair[0]],
        post: operation("beginSignedAct", "SignedChallenge", "BeginSignedAct"),
      },
      "/v1/identity/signed-acts/verify": {
        post: operation(
          "verifySignedAct",
          "SignedActResult",
          "VerifySignedAct",
        ),
      },
      "/v1/threads/{creatorId}/{fanId}": {
        parameters: pair,
        get: operation("readThread", "ConversationConversationTimeline"),
      },
      "/v1/threads/{creatorId}/{fanId}/messages": {
        parameters: pair,
        post: operation("sendMessage", "AcceptedMessage", "SendMessage"),
      },
      "/v1/threads/{creatorId}/{fanId}/takeover": {
        parameters: pair,
        post: operation("takeover", "Frame", "ControlCommand"),
      },
      "/v1/threads/{creatorId}/{fanId}/handback": {
        parameters: pair,
        post: operation("handback", "Frame", "ControlCommand"),
      },
      "/v1/threads/{creatorId}/{fanId}/human-replies": {
        parameters: pair,
        post: operation("sendHumanReply", "Message", "HumanReply"),
      },
      "/v1/conversations/{creatorId}/{fanId}/recordings": {
        parameters: pair,
        post: operation(
          "deliverConversationRecording",
          "ConversationConversationRecordingResult",
          "ConversationConversationRecordingInput",
        ),
      },
      ...mediaPaths,
    },
    components: {
      securitySchemes: {
        PantopusSession: {
          type: "http",
          scheme: "bearer",
          description:
            "Validated by the Pantopus identity adapter; no local account is created.",
        },
      },
      schemas: Object.fromEntries(
        Object.entries({ ...publicSchemas, ...domainSchemas }).map(
          ([name, schema]) => [
            name,
            z.toJSONSchema(schema, { target: "draft-2020-12" }),
          ],
        ),
      ),
    },
  };
}
