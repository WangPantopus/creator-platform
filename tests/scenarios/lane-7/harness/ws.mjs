// Just enough RFC 6455 for the apps' live thread connection: the handshake,
// text frames both ways, ping/pong and close. No dependencies.
import { createHash } from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function frame(opcode, payload) {
  const length = payload.length;
  const header =
    length < 126
      ? Buffer.from([0x80 | opcode, length])
      : length < 65536
        ? Buffer.from([0x80 | opcode, 126, length >> 8, length & 255])
        : Buffer.concat([
            Buffer.from([0x80 | opcode, 127]),
            Buffer.alloc(4),
            Buffer.from(
              [length >>> 24, length >>> 16, length >>> 8, length].map(
                (v) => v & 255,
              ),
            ),
          ]);
  return Buffer.concat([header, payload]);
}

export class Connection {
  onMessage = () => {};
  onClose = () => {};
  closed = false;
  #buffer = Buffer.alloc(0);
  #fragments = [];
  constructor(socket) {
    this.socket = socket;
    socket.on("data", (chunk) => this.#read(chunk));
    // An app process can disappear without sending a WebSocket close frame.
    // Upgraded HTTP sockets may remain half-open after the peer's TCP FIN.
    socket.on("end", () => {
      socket.end();
      this.#finish();
    });
    socket.on("close", () => this.#finish());
    socket.on("error", () => this.#finish());
  }
  send(text) {
    if (!this.closed) this.socket.write(frame(1, Buffer.from(text, "utf8")));
  }
  close(code = 1000, reason = "") {
    if (this.closed) return;
    const body = Buffer.concat([
      Buffer.from([code >> 8, code & 255]),
      Buffer.from(reason),
    ]);
    this.socket.write(frame(8, body));
    this.socket.end();
    this.#finish();
  }
  #finish() {
    if (this.closed) return;
    this.closed = true;
    this.onClose();
  }
  #read(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    for (;;) {
      const b = this.#buffer;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0;
      const opcode = b[0] & 15;
      const masked = (b[1] & 0x80) !== 0;
      let length = b[1] & 127;
      let offset = 2;
      if (length === 126) {
        if (b.length < 4) return;
        length = b.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (b.length < 10) return;
        length = Number(b.readBigUInt64BE(2));
        offset = 10;
      }
      const maskOffset = offset;
      if (masked) offset += 4;
      if (b.length < offset + length) return;
      const payload = Buffer.from(b.subarray(offset, offset + length));
      if (masked)
        for (let i = 0; i < payload.length; i += 1)
          payload[i] ^= b[maskOffset + (i % 4)];
      this.#buffer = b.subarray(offset + length);
      if (opcode === 8) return this.close(1000);
      if (opcode === 9) this.socket.write(frame(10, payload));
      else if (opcode === 1 || opcode === 0) {
        this.#fragments.push(payload);
        if (fin) {
          const text = Buffer.concat(this.#fragments).toString("utf8");
          this.#fragments = [];
          this.onMessage(text);
        }
      }
    }
  }
}

/** Completes the handshake and returns the open connection. */
export function accept(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (!key || String(req.headers.upgrade).toLowerCase() !== "websocket") {
    socket.destroy();
    return null;
  }
  const answer = createHash("sha1")
    .update(key + GUID)
    .digest("base64");
  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${answer}`,
      "",
      "",
    ].join("\r\n"),
  );
  return new Connection(socket);
}
