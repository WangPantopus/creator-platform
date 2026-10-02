import { copy } from "@qelvora/copy";
import { SignedActCommandSchema, type SignedActCommand } from "@qelvora/api";
import type { Actor } from "../identity/adapter.js";
import type { SignedActService } from "../identity/signed-acts.js";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import type { GrowthService } from "./service.js";

interface ContentPublicationView {
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
}

/** Structural C08 publisher port. The current view and stored evidence come
 * from W5's same owner transaction, never from a fan read or grant. */
export interface ContentPublicationReader {
  publicationProof?(
    actor: Actor,
    creatorId: string,
    id: string,
  ): Promise<{
    view: ContentPublicationView;
    command: SignedActCommand;
    signedActId: string | null;
    mediaReady: boolean;
  } | null>;
  get(
    actor: Actor,
    creatorId: string,
    id: string,
    studio: boolean,
  ): Promise<ContentPublicationView>;
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
    if (publicState) {
      // W5 reads the stored complete command and rechecks current processed
      // media/W6 readiness. Never reconstruct media evidence from a document.
      let proof;
      try {
        proof = content.publicationProof
          ? await content.publicationProof(actor, current.creatorId, current.id)
          : null;
      } catch (error) {
        await growth.withdrawContent(
          current.creatorId,
          current.id,
          current.version,
        );
        throw error;
      }
      if (
        !proof?.view ||
        proof.view.id !== effect.contentId ||
        proof.view.creatorId !== effect.creatorId ||
        proof.view.version < current.version ||
        proof.view.version < effect.version
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
      // Use the exact view returned beside the stored command. W5 has already
      // rechecked publisher, current source and media custody on that client.
      current = proof.view;
      publicState =
        current.state === "published" &&
        current.document.audience.kind === "public" &&
        Boolean(current.publishedAt);
      if (!publicState) {
        await growth.withdrawContent(
          current.creatorId,
          current.id,
          current.version,
        );
        return {
          reference: `growth-public:${current.id}:${current.version}:withdrawn`,
        };
      }
      // A correction between the initial Studio read and owner proof may have
      // changed its source. Never project it without current retraction hooks.
      if (current.document.quote || current.document.packetId) {
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
      const command = SignedActCommandSchema.safeParse(proof?.command);
      {
        const body = command.success ? command.data.content : null;
        if (
          !proof ||
          !command.success ||
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
      }
      if (proof.mediaReady !== true) {
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
      if (current.authorKind !== "team") {
        let signature;
        try {
          signature = current.signedActId
            ? await signing.publicVerification(current.signedActId)
            : null;
        } catch (error) {
          await growth.withdrawContent(
            current.creatorId,
            current.id,
            current.version,
          );
          throw error;
        }
        if (
          signature?.status !== "valid" ||
          signature.contentHash !== contentHash(proof.command)
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
      }
    }
    if (publicState) {
      const projection = await growth.projectContent({
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
      // An erasure fence or a same/newer withdrawal wins under W7's lock.
      // A no-op must not complete W5's public-distribution effect as published.
      if (!projection.published)
        throw new DomainError(
          "content_version_unavailable",
          copy.growthErrorContentVersionUnavailable,
          503,
        );
    } else
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
