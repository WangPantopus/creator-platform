import type {
  CallRole,
  ConnectedInterval,
} from "../../../../../packages/api/src/session.js";

/** Managed media transport. Participant history must be genuine, complete provider evidence. */
export interface CallProvider {
  readonly name: string;
  readonly supportsSingleUseAdmission: boolean;
  ensureRoom(input: {
    roomId: string;
    endAt: string;
    recording: false;
  }): Promise<void>;
  token(input: {
    roomId: string;
    accountId: string;
    role: CallRole;
    nonce: string;
    expiresAt: string;
    camera: boolean;
  }): Promise<{ token: string; url: string }>;
  closeRoom(roomId: string): Promise<void>;
  state(roomId: string): Promise<{
    presentAccountIds: string[];
    recording: boolean;
    closed: boolean;
  }>;
  history(roomId: string): Promise<{
    complete: boolean;
    closed: boolean;
    reference: string;
    participants: Array<{ accountId: string; intervals: ConnectedInterval[] }>;
  }>;
  setRecording(
    roomId: string,
    enabled: boolean,
    idempotencyKey: string,
  ): Promise<{ recording: boolean }>;
  deleteRecording(roomId: string, idempotencyKey: string): Promise<void>;
}
export class UnavailableCallProvider implements CallProvider {
  readonly name = "unconfigured";
  readonly supportsSingleUseAdmission = false;
  private unavailable(): never {
    throw new Error("call_provider_unconfigured");
  }
  async ensureRoom(): Promise<void> {
    this.unavailable();
  }
  async token(): Promise<{ token: string; url: string }> {
    return this.unavailable();
  }
  async closeRoom(): Promise<void> {
    this.unavailable();
  }
  async state(): Promise<{
    presentAccountIds: string[];
    recording: boolean;
    closed: boolean;
  }> {
    return this.unavailable();
  }
  async history(): ReturnType<CallProvider["history"]> {
    return this.unavailable();
  }
  async setRecording(): Promise<{ recording: boolean }> {
    return this.unavailable();
  }
  async deleteRecording(): Promise<void> {
    this.unavailable();
  }
}
