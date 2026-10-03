"use client";
import type { Room, RemoteTrack } from "livekit-client";
import type { WebCallTransport } from "./transport";

/** SDK transport only. Registration requires the configured, approved host;
 * importing this file never enables a call or supplies admission authority. */
export class LiveKitWebCallTransport implements WebCallTransport {
  private room: Room | null = null;
  private epoch = 0;
  private cameraAllowed = false;
  private remote = new Map<string, RemoteTrack>();

  async connect(input: Parameters<WebCallTransport["connect"]>[0]) {
    if (this.room) throw new Error("call_transport_busy");
    const url = new URL(input.url);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "wss:" &&
        !(
          process.env.NODE_ENV === "development" &&
          loopback &&
          url.protocol === "ws:"
        )) ||
      !input.token ||
      input.token.length > 16384
    )
      throw new Error("call_transport_configuration_invalid");
    const epoch = ++this.epoch;
    // The SDK is downloaded only after a genuine admission and a user action.
    const { Room, RoomEvent, ConnectionState, Track } = await import(
      "livekit-client"
    );
    if (epoch !== this.epoch)
      throw new DOMException("Call cancelled", "AbortError");
    const room = new Room({ adaptiveStream: true, dynacast: true });
    this.room = room;
    this.cameraAllowed = input.camera;
    const current = () => epoch === this.epoch && this.room === room;
    const remoteChanged = () => {
      if (current())
        input.onRemote(
          new MediaStream(
            [...this.remote.values()].map((track) => track.mediaStreamTrack),
          ),
        );
    };
    room.on(RoomEvent.TrackSubscribed, (track, publication) => {
      if (!current()) return;
      this.remote.set(publication.trackSid, track);
      remoteChanged();
    });
    room.on(RoomEvent.TrackUnsubscribed, (_track, publication) => {
      if (!current()) return;
      this.remote.delete(publication.trackSid);
      remoteChanged();
    });
    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (!current()) return;
      if (state === ConnectionState.Connected) input.onState("connected");
      else if (
        state === ConnectionState.Reconnecting ||
        state === ConnectionState.SignalReconnecting
      )
        input.onState("reconnecting");
      else if (state === ConnectionState.Disconnected) {
        this.remote.clear();
        remoteChanged();
        input.onState("disconnected");
      }
    });
    try {
      await room.connect(input.url, input.token, { autoSubscribe: true });
      if (!current()) throw new DOMException("Call cancelled", "AbortError");
      // Reuse the actual permission preview instead of opening a second device.
      if (input.microphone) {
        const microphone = input.microphone
          .getAudioTracks()
          .find((track) => track.readyState === "live");
        if (!microphone) throw new Error("call_microphone_unavailable");
        await room.localParticipant.publishTrack(microphone, {
          source: Track.Source.Microphone,
        });
        if (input.camera) {
          const camera = input.microphone
            .getVideoTracks()
            .find((track) => track.readyState === "live");
          if (!camera) throw new Error("call_camera_unavailable");
          await room.localParticipant.publishTrack(camera, {
            source: Track.Source.Camera,
          });
        }
      } else {
        await room.localParticipant.setMicrophoneEnabled(true);
        if (input.camera) await room.localParticipant.setCameraEnabled(true);
      }
      if (!current()) throw new DOMException("Call cancelled", "AbortError");
      await room.startAudio();
    } catch (error) {
      if (this.room === room) await this.disconnect();
      else await room.disconnect(true);
      throw error;
    }
  }
  async microphone(enabled: boolean) {
    const room = this.room;
    if (!room) throw new Error("call_transport_disconnected");
    await room.localParticipant.setMicrophoneEnabled(enabled);
  }
  async camera(enabled: boolean) {
    const room = this.room;
    if (!room || !this.cameraAllowed)
      throw new Error("call_camera_unavailable");
    await room.localParticipant.setCameraEnabled(enabled);
  }
  async disconnect() {
    this.epoch++;
    const room = this.room;
    this.room = null;
    this.remote.clear();
    this.cameraAllowed = false;
    if (room) {
      room.removeAllListeners();
      await room.disconnect(true);
    }
  }
}
