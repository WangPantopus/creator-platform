import type { ModelProposalSchema } from "@qelvora/api";
import type { z } from "zod";
import type { ThreadScope } from "../access/scope.js";

export interface ModelProvider {
  readonly processorName: string;
  stream(input: {
    context: readonly string[];
    route: "small" | "large";
    signal: AbortSignal;
  }): AsyncIterable<z.input<typeof ModelProposalSchema>>;
}
export interface GuardrailProvider {
  checkSentence(input: {
    scope: ThreadScope;
    text: string;
    citations: readonly string[];
  }): Promise<{ allowed: boolean; category?: string }>;
}
export interface PaymentProvider {
  authorize(input: {
    amountMinor: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<{
    reference: string;
    state: "requires_action" | "requires_capture" | "declined" | "unknown";
    captureBefore: Date | null;
  }>;
  capture(reference: string, idempotencyKey: string): Promise<void>;
  release(reference: string, idempotencyKey: string): Promise<void>;
  refund(
    reference: string,
    amountMinor: number,
    idempotencyKey: string,
  ): Promise<void>;
  fetchCurrent(reference: string): Promise<unknown>;
}
export interface CallProvider {
  createRoom(idempotencyKey: string): Promise<{ roomId: string }>;
  participants(
    roomId: string,
  ): Promise<readonly { accountId: string; connected: boolean }[]>;
  closeRoom(roomId: string, idempotencyKey: string): Promise<void>;
}
export interface VoiceProvider {
  readonly processorName: string;
  render(input: {
    voiceAssetId: string;
    text: string;
    idempotencyKey: string;
  }): Promise<Uint8Array>;
}
