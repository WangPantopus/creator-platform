export interface WebCallTransport {
  connect(input: {
    token: string;
    url: string;
    microphone: MediaStream | null;
    camera: boolean;
    onRemote: (stream: MediaStream) => void;
    onState: (state: "connected" | "reconnecting" | "disconnected") => void;
  }): Promise<void>;
  microphone(enabled: boolean): Promise<void>;
  camera(enabled: boolean): Promise<void>;
  disconnect(): Promise<void>;
}
/** W6's approved SDK adapter registers here after C06/C07 and provider configuration are agreed. */
let createTransport: (() => WebCallTransport) | undefined;
export function registerWebCallTransport(factory: () => WebCallTransport) {
  createTransport = factory;
}
export function webCallTransport() {
  return createTransport?.() ?? null;
}
