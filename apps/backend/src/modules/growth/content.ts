import { copy } from "@qelvora/copy";
import type { SignedActCommand } from "@qelvora/api";
import type { Actor } from "../identity/adapter.js";
import type { SignedActService } from "../identity/signed-acts.js";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import type { GrowthService } from "./service.js";

/** Structural C08 port matches W5 ContentService.get. The host supplies the
 * actual service; W7 never manufactures creator or audience authority. */
export interface ContentPublicationReader {
  publicationProof?(
    actor: Actor,
    creatorId: string,
    id: string,
  ): Promise<{
    command: SignedActCommand;
    signedActId: string | null;
    mediaReady: boolean;
  } | null>;
  get(
    actor: Actor,
    creatorId: string,
    id: string,
    studio: boolean,
  ): Promise<{
    id: string;
    creatorId: string;
    version: number;
    state: string;
    authorKind: "human_creator" | "human_broadcast" | "team";
    authorLabel: string;
    signedActId: string | null;
    publishedAt: string | null;
    document: {
      kind: string;
      title: string;
      text: string;
      audience: { kind: string };
      quote: { replyId: string; consentVersion: number } | null;
      packetId: string | null;
      media?: readonly unknown[];
    };
  }>;
}

/** Bind the public part of W5's durable effect callback. Distribution,
 * source approval and recipient consent remain separate owner effects. */
export function contentPublicProjection(
  growth: GrowthService,
  content: ContentPublicationReader,
  signing: Pick<SignedActService, "publicVerification">,
) {
  return async (
    actor: Actor,
    effect: {
      id: string;
      creatorId: string;
      contentId: string;
      version: number;
      type: string;
      subjectKind?: "content" | "reply" | "thanks";
    },
  ): Promise<{ reference: string }> => {
    if (
      (effect.subjectKind && effect.subjectKind !== "content") ||
      !["published", "withdrawn"].includes(effect.type)
    )
      throw new DomainError(
        "content_effect_unconfigured",
        copy.growthErrorContentEffectUnconfigured,
        503,
      );
    // Studio read rechecks the current actor/creator/team role and denial.
    // A delayed publication effect must never project its former public body.
    let current = await content.get(
      actor,
      effect.creatorId,
      effect.contentId,
      true,
    );
    if (
      current.id !== effect.contentId ||
      current.creatorId !== effect.creatorId ||
      current.version < effect.version
    )
      throw new DomainError(
        "content_version_unavailable",
        copy.growthErrorContentVersionUnavailable,
        503,
      );
    let publicState =
      current.state === "published" &&
      current.document.audience.kind === "public" &&
      Boolean(current.publishedAt);
    if (publicState) {
      try {
        // The Studio read alone does not check quote/packet permission.
        // Use W5's normal eligibility read before copying any public body.
        current = await content.get(
          actor,
          effect.creatorId,
          effect.contentId,
          false,
        );
        if (
          current.id !== effect.contentId ||
          current.creatorId !== effect.creatorId ||
          current.version < effect.version
        )
          throw new DomainError(
            "content_version_unavailable",
            copy.growthErrorContentVersionUnavailable,
            503,
          );
        publicState =
          current.state === "published" &&
          current.document.audience.kind === "public" &&
          Boolean(current.publishedAt);
      } catch (error) {
        if (
          !(
            error instanceof DomainError && error.code === "content_unavailable"
          )
        )
          throw error;
        publicState = false;
      }
    }
    // Quote/packet retractions originate in separate fan/commerce outboxes.
    // Keep these effects pending until their current owner adapters are bound.
    if (publicState && (current.document.quote || current.document.packetId)) {
      await growth.withdrawContent(
        current.creatorId,
        current.id,
        current.version,
      );
      throw new DomainError(
        "content_retraction_adapter_required",
        copy.growthErrorContentEffectUnconfigured,
        503,
      );
    }
    let publicationHash = contentHash({
      actType: current.document.kind === "note" ? "broadcast" : "reply",
      subjectId: current.id,
      content: {
        kind: "content_publication",
        creatorId: current.creatorId,
        version: current.version,
        document: current.document,
      },
    });
    if (publicState) {
      // W5 reads the stored complete command and rechecks current processed
      // media/W6 readiness. Never reconstruct media evidence from a document.
      const proof = content.publicationProof
        ? await content.publicationProof(actor, current.creatorId, current.id)
        : null;
      if (content.publicationProof) {
        const body = proof?.command.content;
        if (
          !proof ||
          !body ||
          typeof body !== "object" ||
          Array.isArray(body) ||
          proof.command.subjectId !== current.id ||
          proof.command.actType !==
            (current.document.kind === "note" ? "broadcast" : "reply") ||
          body.kind !== "content_publication" ||
          body.creatorId !== current.creatorId ||
          body.version !== current.version ||
          body.document === undefined ||
          contentHash(body.document) !== contentHash(current.document) ||
          proof.signedActId !== current.signedActId
        ) {
          await growth.withdrawContent(
            current.creatorId,
            current.id,
            current.version,
          );
          throw new DomainError(
            "content_version_unavailable",
            copy.growthErrorContentVersionUnavailable,
            503,
          );
        }
        publicationHash = contentHash(proof.command);
      }
      if (
        (current.document.media?.length && !proof) ||
        (proof && proof.mediaReady !== true)
      ) {
        await growth.withdrawContent(
          current.creatorId,
          current.id,
          current.version,
        );
        throw new DomainError(
          "content_media_proof_adapter_required",
          copy.growthErrorContentEffectUnconfigured,
          503,
        );
      }
    }
    if (publicState && current.authorKind !== "team") {
      const signature = current.signedActId
        ? await signing.publicVerification(current.signedActId)
        : null;
      publicState =
        signature?.status === "valid" &&
        signature.contentHash === publicationHash;
    }
    if (publicState)
      await growth.projectContent({
        id: current.id,
        creatorId: current.creatorId,
        version: current.version,
        state: "published",
        audience: "public",
        title: current.document.title,
        body: current.document.text,
        authorKind: current.authorKind,
        authorLabel: current.authorLabel,
        signedActId: current.signedActId,
        publishedAt: current.publishedAt,
        // Public publication/source intent alone does not approve AI reuse.
        aiContextEligible: false,
      });
    else
      await growth.withdrawContent(
        current.creatorId,
        current.id,
        current.version,
      );
    return {
      reference: `growth-public:${current.id}:${current.version}:${publicState ? "published" : "withdrawn"}`,
    };
  };
}
