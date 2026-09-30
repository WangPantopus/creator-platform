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
          "Recording is unavailable in this browser. Use a supported browser over HTTPS.",
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
        throw new Error("This browser cannot produce a supported recording.");
      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 96_000,
      });
      this.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (generation === this.generation && event.data.size)
          this.chunks.push(event.data);
      };
      recorder.onstop = () => {
        if (generation !== this.generation) return;
        const durationMs = Math.min(
          this.maxDurationMs,
          Math.round(this.elapsed),
        );
        const blob = new Blob(this.chunks, { type: mimeType.split(";")[0] });
        this.release();
        this.publish({
          state: blob.size && durationMs > 0 ? "preview" : "failed",
          blob: blob.size ? blob : null,
          durationMs,
          reason: blob.size
            ? this.snapshot.reason
            : "No audio was recorded. Try again.",
        });
      };
      recorder.onerror = () => {
        this.publish({
          reason:
            "Recording was interrupted. Preview what was saved or record again.",
        });
        this.stop();
      };
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          this.publish({
            reason:
              "The microphone was disconnected. Preview what was saved or record again.",
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
      this.release();
      if (generation !== this.generation) return;
      const denied =
        error instanceof DOMException &&
        ["NotAllowedError", "SecurityError"].includes(error.name);
      this.publish({
        state: denied ? "denied" : "failed",
        reason: denied
          ? "Microphone access is off. Allow it in your browser settings, then try again."
          : error instanceof Error
            ? error.message
            : "The microphone is unavailable.",
      });
    }
  }
  pause(interrupted = false) {
    if (this.recorder?.state !== "recording") return;
    this.elapsed = this.duration();
    this.recorder.pause();
    this.publish({
      state: "paused",
      durationMs: this.elapsed,
      reason: interrupted
        ? "Recording paused while you left this screen. Resume or preview it."
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
    this.elapsed = 0;
    this.publish({ state: "idle", durationMs: 0, blob: null, reason: null });
  }
}
