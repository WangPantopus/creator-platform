import { copy } from "@qelvora/copy";
export type RecordingState =
  | "idle"
  | "requesting"
  | "recording"
  | "paused"
  | "preview"
  | "denied"
  | "failed";
export type RecordingSnapshot = {
  state: RecordingState;
  durationMs: number;
  blob: Blob | null;
  reason: string | null;
};
/** Browser recording is private until an explicit upload. Permission is requested only on user action. */
export class VoiceRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private recordedBytes = 0;
  private activeAt = 0;
  private elapsed = 0;
  private generation = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private snapshot: RecordingSnapshot = {
    state: "idle",
    durationMs: 0,
    blob: null,
    reason: null,
  };
  constructor(
    private readonly maxDurationMs: number,
    private readonly emit: (state: RecordingSnapshot) => void,
  ) {}
  private publish(state: Partial<RecordingSnapshot>) {
    this.snapshot = { ...this.snapshot, ...state };
    this.emit(this.snapshot);
  }
  private duration() {
    return (
      this.elapsed +
      (this.snapshot.state === "recording"
        ? performance.now() - this.activeAt
        : 0)
    );
  }
  async start() {
    this.discard();
    const generation = this.generation;
    this.publish({ state: "requesting" });
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          copy.w6RecordingIsUnavailableInThisBrowserUseASupportedBrowser,
        );
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType)
        throw new Error(copy.w6ThisBrowserCannotProduceASupportedRecording);
      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 96_000,
      });
      this.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (generation !== this.generation || !event.data.size) return;
        if (event.data.size > 268_435_456 - this.recordedBytes) {
          this.discard();
          this.publish({
            state: "failed",
            reason: copy.w6ThisRecordingReachedTheFileLimitRecordAShorterClip,
          });
          return;
        }
        this.recordedBytes += event.data.size;
        this.chunks.push(event.data);
      };
      recorder.onstop = () => {
        if (generation !== this.generation) return;
        const durationMs = Math.min(
          this.maxDurationMs,
          Math.round(this.elapsed),
        );
        const blob = new Blob(this.chunks, { type: mimeType.split(";")[0] });
        this.chunks = [];
        this.recordedBytes = 0;
        this.release();
        this.publish({
          state: blob.size && durationMs > 0 ? "preview" : "failed",
          blob: blob.size ? blob : null,
          durationMs,
          reason: blob.size
            ? this.snapshot.reason
            : copy.w6NoAudioWasRecordedTryAgain,
        });
      };
      recorder.onerror = () => {
        if (generation !== this.generation) return;
        this.publish({
          reason:
            copy.w6RecordingWasInterruptedPreviewWhatWasSavedOrRecordAgain,
        });
        this.stop();
      };
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (generation !== this.generation) return;
          this.publish({
            reason:
              copy.w6TheMicrophoneWasDisconnectedPreviewWhatWasSavedOrRecord,
          });
          this.stop();
        };
      });
      recorder.start(250);
      this.activeAt = performance.now();
      this.publish({ state: "recording", reason: null });
      this.timer = setInterval(() => {
        const durationMs = this.duration();
        this.publish({ durationMs: Math.min(durationMs, this.maxDurationMs) });
        if (durationMs >= this.maxDurationMs) this.stop();
      }, 100);
    } catch (error) {
      if (generation !== this.generation) return;
      this.release();
      const denied =
        error instanceof DOMException &&
        ["NotAllowedError", "SecurityError"].includes(error.name);
      this.publish({
        state: denied ? "denied" : "failed",
        reason: denied
          ? copy.w6MicrophoneAccessIsOffAllowItInYourBrowserSettings
          : error instanceof Error
            ? error.message
            : copy.w6TheMicrophoneIsUnavailable,
      });
    }
  }
  pause(interrupted = false) {
    if (interrupted && this.snapshot.state === "requesting") {
      // A late permission response must not start capture on a hidden screen.
      // The existing start generation fence stops any subsequently issued stream.
      this.generation++;
      this.release();
      this.publish({
        state: "idle",
        reason:
          copy.w6MicrophoneRequestCancelledWhileYouLeftThisScreenRecordWhen,
      });
      return;
    }
    if (this.recorder?.state !== "recording") return;
    this.elapsed = this.duration();
    this.recorder.pause();
    this.publish({
      state: "paused",
      durationMs: this.elapsed,
      reason: interrupted
        ? copy.w6RecordingPausedWhileYouLeftThisScreenResumeOrPreview
        : null,
    });
  }
  resume() {
    if (this.recorder?.state !== "paused") return;
    this.recorder.resume();
    this.activeAt = performance.now();
    this.publish({ state: "recording", reason: null });
  }
  stop() {
    if (!this.recorder || this.recorder.state === "inactive") return;
    this.elapsed = this.duration();
    this.recorder.stop();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  private release() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    this.stream = null;
  }
  discard() {
    this.generation++;
    if (this.recorder && this.recorder.state !== "inactive")
      this.recorder.stop();
    this.recorder = null;
    this.release();
    this.chunks = [];
    this.recordedBytes = 0;
    this.elapsed = 0;
    this.publish({ state: "idle", durationMs: 0, blob: null, reason: null });
  }
}
