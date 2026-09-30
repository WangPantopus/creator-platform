import { z } from "zod";
import type {
  Audience,
  SourceInput,
} from "../../../../../packages/api/src/agent/contracts.js";
import type { CreatorScope } from "../agent/repository.js";
import { DomainError, invariant } from "../../core/errors.js";

export interface YouTubeAuthorization {
  accessToken(scope: CreatorScope): Promise<{
    token: string;
    consentReference: string;
    reusePolicyReference: string;
    refreshBy: string;
  }>;
}
const issued = new WeakSet<object>();
export type AuthorizedCaption = Readonly<{
  creatorId: string;
  accountId: string;
  source: SourceInput;
  connectorConsent: string;
  reusePolicyReference: string;
  refreshBy: string;
}>;
export function assertAuthorizedCaption(
  value: AuthorizedCaption,
  scope: CreatorScope,
) {
  invariant(
    issued.has(value) &&
      value.creatorId === scope.creatorId &&
      value.accountId === scope.accountId &&
      Date.parse(value.refreshBy) > Date.now(),
    "connector_authority_required",
    "Only a connected authorized caption import may use this source origin.",
  );
}
function videoId(reference: string) {
  if (/^[\w-]{11}$/u.test(reference)) return reference;
  let url: URL;
  try {
    url = new URL(reference);
  } catch {
    throw new DomainError(
      "youtube_url_invalid",
      "Use an authorized YouTube video reference.",
      400,
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !["youtube.com", "www.youtube.com", "youtu.be"].includes(url.hostname)
  )
    throw new DomainError(
      "youtube_url_invalid",
      "Use a YouTube video link; arbitrary URLs cannot be fetched.",
      400,
    );
  const id =
    url.hostname === "youtu.be"
      ? url.pathname.slice(1)
      : url.pathname === "/watch"
        ? url.searchParams.get("v")
        : url.pathname.startsWith("/shorts/")
          ? url.pathname.split("/")[2]
          : null;
  if (!id || !/^[\w-]{11}$/u.test(id))
    throw new DomainError(
      "youtube_url_invalid",
      "This link does not identify a YouTube video.",
      400,
    );
  return id;
}
async function boundedResponse(response: Response) {
  if (!response.body)
    throw new DomainError(
      "connector_response_empty",
      "The caption response is empty.",
      503,
    );
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 1_000_000)
        throw new DomainError(
          "source_large",
          "The caption exceeds the 1 MB import limit.",
          413,
        );
      parts.push(chunk.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts));
}
export class YouTubeCaptionConnector {
  constructor(private readonly authorization: YouTubeAuthorization) {}
  private async get(
    token: string,
    path: string,
    parameters: Record<string, string>,
    signal: AbortSignal,
  ) {
    // User links become identifiers only. Credentials never go to user hosts or redirects.
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    for (const [key, value] of Object.entries(parameters))
      url.searchParams.set(key, value);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      redirect: "error",
    });
    if (!response.ok)
      throw new DomainError(
        response.status === 401 || response.status === 403
          ? "connector_access_revoked"
          : "caption_unavailable",
        response.status === 401 || response.status === 403
          ? "Reconnect YouTube and confirm video edit permission before retrying."
          : "The selected caption is unavailable; no source was approved.",
        503,
      );
    return boundedResponse(response);
  }
  async import(
    scope: CreatorScope,
    input: {
      reference: string;
      captionId?: string;
      audience: Audience;
      rightsEvidence: string;
    },
    signal: AbortSignal,
  ): Promise<AuthorizedCaption> {
    const id = videoId(input.reference);
    const auth = await this.authorization.accessToken(scope);
    invariant(
      auth.consentReference &&
        auth.reusePolicyReference &&
        Date.parse(auth.refreshBy) > Date.now(),
      "connector_reuse_not_approved",
      "Approved connector consent and fan-facing caption reuse policy are required.",
    );
    const channels = z
      .object({ items: z.array(z.object({ id: z.string() })) })
      .parse(
        JSON.parse(
          await this.get(
            auth.token,
            "channels",
            { part: "id", mine: "true" },
            signal,
          ),
        ),
      );
    const videos = z
      .object({
        items: z.array(
          z.object({
            id: z.string(),
            snippet: z.object({ title: z.string(), channelId: z.string() }),
            status: z.object({ privacyStatus: z.string() }),
          }),
        ),
      })
      .parse(
        JSON.parse(
          await this.get(
            auth.token,
            "videos",
            { part: "snippet,status", id },
            signal,
          ),
        ),
      );
    const video = videos.items[0];
    invariant(
      video &&
        channels.items.some(
          (channel) => channel.id === video.snippet.channelId,
        ),
      "video_not_owned",
      "Only your own authorized channel’s captions may be imported.",
    );
    if (input.audience.kind === "public")
      invariant(
        video.status.privacyStatus === "public",
        "caption_private",
        "Private video captions cannot become a public source.",
      );
    const tracks = z
      .object({
        items: z.array(
          z.object({
            id: z.string(),
            snippet: z.object({
              language: z.string(),
              isDraft: z.boolean(),
              status: z.string(),
              lastUpdated: z.string(),
              trackKind: z.string(),
            }),
          }),
        ),
      })
      .parse(
        JSON.parse(
          await this.get(
            auth.token,
            "captions",
            { part: "snippet", videoId: id },
            signal,
          ),
        ),
      );
    const track = tracks.items.find(
      (t) =>
        (!input.captionId || t.id === input.captionId) &&
        !t.snippet.isDraft &&
        t.snippet.status === "serving",
    );
    invariant(
      track,
      "caption_unavailable",
      "Select a serving, non-draft caption track.",
    );
    const vtt = await this.get(
      auth.token,
      `captions/${encodeURIComponent(track.id)}`,
      { tfmt: "vtt" },
      signal,
    );
    // Keep timestamps in stored source text for precise passage provenance; reject empty/damaged captions.
    invariant(
      vtt.startsWith("WEBVTT") && vtt.trim().length > 20,
      "caption_damaged",
      "The caption file is not valid WebVTT.",
    );
    const expiry = new Date(
      Math.min(Date.parse(auth.refreshBy), Date.now() + 30 * 86400000),
    ).toISOString();
    const result = Object.freeze({
      creatorId: scope.creatorId,
      accountId: scope.accountId,
      source: {
        title: video.snippet.title,
        text: vtt,
        origin: "youtube_caption" as const,
        originReference: JSON.stringify({
          videoId: id,
          captionId: track.id,
          channelId: video.snippet.channelId,
          language: track.snippet.language,
          lastUpdated: track.snippet.lastUpdated,
          trackKind: track.snippet.trackKind,
        }),
        audience: input.audience,
        rightsEvidence: input.rightsEvidence,
        expiresAt: expiry,
      },
      connectorConsent: auth.consentReference,
      reusePolicyReference: auth.reusePolicyReference,
      refreshBy: expiry,
    });
    issued.add(result);
    return result;
  }
}
