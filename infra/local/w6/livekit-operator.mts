/** Disposable, labelled transport operator. It never mounts in the product,
 * creates a canonical call/Actor, signs an act, settles money or invents history. */
import { createRequire } from "node:module";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, chmod } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import express from "../../../apps/backend/node_modules/express/index.js";
import {
  AccessToken,
  RoomServiceClient,
} from "../../../apps/backend/node_modules/livekit-server-sdk/dist/index.js";
import {
  liveKitWebhookRouter,
  consumeLiveKitCallbackProof,
} from "../../../apps/backend/src/modules/session/livekit.js";

const directory = process.argv[2];
if (
  process.env.NODE_ENV !== "development" ||
  !directory ||
  !path.isAbsolute(directory)
)
  throw new Error("Explicit private development configuration is required.");
const config = JSON.parse(
  await readFile(path.join(directory, "configuration.json"), "utf8"),
);
const credentials = JSON.parse(await readFile(config.secrets, "utf8"));
const origin = "http://localhost:3106";
const gate = randomBytes(32).toString("hex");
const db = new DatabaseSync(path.join(directory, "operator.sqlite"));
await chmod(path.join(directory, "operator.sqlite"), 0o600);
db.exec(`PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS room_binding(name TEXT PRIMARY KEY, sid TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS admission(identity TEXT PRIMARY KEY, room TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS callback(id TEXT PRIMARY KEY, sha256 TEXT NOT NULL, event TEXT NOT NULL, room_sid TEXT NOT NULL, received_at TEXT NOT NULL, complete_history INTEGER NOT NULL DEFAULT 0 CHECK(complete_history=0));`);
const rooms = new RoomServiceClient(
  config.apiURL,
  credentials.apiKey,
  credentials.apiSecret,
  { requestTimeout: 5, failover: false },
);
const application = express();
application.disable("x-powered-by");
application.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
application.use(
  "/provider-webhook",
  liveKitWebhookRouter({
    config: { mode: "self-hosted-development", ...config, ...credentials },
    journal: {
      async ingest(event, sha256, proof) {
        consumeLiveKitCallbackProof(proof, event, sha256, credentials.apiKey);
        if (
          !event.room?.sid ||
          !db
            .prepare("SELECT 1 FROM room_binding WHERE sid=?")
            .get(event.room.sid)
        )
          throw new Error("Actual room SID is not bound.");
        if (
          event.participant?.identity &&
          !db
            .prepare(
              "SELECT 1 FROM admission a JOIN room_binding r ON r.name=a.room WHERE a.identity=? AND r.sid=?",
            )
            .get(event.participant.identity, event.room.sid)
        )
          throw new Error("Actual issued identity is not bound.");
        const existing = db
          .prepare("SELECT sha256 FROM callback WHERE id=?")
          .get(event.id);
        if (existing) {
          if (existing.sha256 !== sha256)
            throw new Error("Callback body conflict.");
          return "duplicate";
        }
        db.prepare(
          "INSERT INTO callback(id,sha256,event,room_sid,received_at) VALUES(?,?,?,?,?)",
        ).run(
          event.id,
          sha256,
          event.event,
          event.room.sid,
          new Date().toISOString(),
        );
        return "stored";
      },
    },
  }),
);
application.get("/", async (_req, res) => {
  res.setHeader(
    "Set-Cookie",
    `w6_operator=${gate}; HttpOnly; SameSite=Strict; Path=/`,
  );
  res
    .type("html")
    .send(
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>W6 development transport</title><style>body{font:18px system-ui;max-width:720px;margin:32px auto;padding:16px}button{font:inherit;padding:12px;margin:8px}pre{white-space:pre-wrap}video{width:100%}</style><h1>W6 development transport</h1><p>Self-hosted SDK operation. No paid call, human audio, settlement or complete history is accepted.</p><button id="create">Create a development room</button><button id="join">Join transport only</button><button id="microphone">Connect actual microphone adapter</button><button id="disconnect">Disconnect</button><button id="replay">Replay last JWT</button><button id="delete">Delete room</button><button id="state">Inspect provider and journal</button><pre id="output" role="status"></pre><video id="remote" autoplay playsinline></video><script type="module" src="/operator.js"></script></html>`,
    );
});
const require = createRequire(import.meta.url);
const { build } = require("../../../apps/backend/node_modules/esbuild");
const built = await build({
  stdin: {
    contents: `import {Room} from './apps/web/node_modules/livekit-client/dist/livekit-client.esm.mjs';
import {LiveKitWebCallTransport} from './apps/web/features/calls/livekit.ts';
let roomName, admission, transport, raw; const output = document.getElementById('output');
const report = value => { output.textContent = JSON.stringify(value, null, 2); };
const request = async (path, body) => { const result=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body??{})}); const value=await result.json(); if(!result.ok) throw new Error(value.error??'operation_failed'); return value; };
const run = fn => async () => { try { await fn(); } catch(error) { report({error:error.name+': '+error.message}); } };
document.getElementById('create').onclick=run(async()=>{const result=await request('/room');roomName=result.room;report(result);});
document.getElementById('join').onclick=run(async()=>{admission=await request('/admission',{room:roomName}); raw=new Room();raw.on('disconnected',()=>report({state:'disconnected'}));await raw.connect(admission.url,admission.token);report({state:raw.state,room:roomName,identity:raw.localParticipant.identity,qualification:'transport only; no human media'});});
document.getElementById('microphone').onclick=run(async()=>{admission=await request('/admission',{room:roomName});transport=new LiveKitWebCallTransport();await transport.connect({token:admission.token,url:admission.url,microphone:null,camera:false,onRemote:stream=>document.getElementById('remote').srcObject=stream,onState:state=>report({state})});report({state:'connected',qualification:'actual microphone adapter; no canonical call'});});
document.getElementById('disconnect').onclick=run(async()=>{await transport?.disconnect();await raw?.disconnect();report({state:'disconnected'});});
document.getElementById('replay').onclick=run(async()=>{const replay=new Room();raw=replay;await replay.connect(admission.url,admission.token);report({state:replay.state,identity:replay.localParticipant.identity,replayAccepted:true});});
document.getElementById('delete').onclick=run(async()=>report(await request('/delete',{room:roomName})));
document.getElementById('state').onclick=run(async()=>report(await request('/state',{room:roomName})));
`,
    resolveDir: process.cwd(),
    sourcefile: "w6-livekit-operator.ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  define: { "process.env.NODE_ENV": '"development"' },
  sourcemap: false,
});
application.get("/operator.js", (_req, res) =>
  res
    .type("application/javascript")
    .send(Buffer.from(built.outputFiles[0]!.contents)),
);
application.use(express.json({ limit: "4kb" }));
application.use((req, res, next) => {
  if (
    req.get("Origin") !== origin ||
    req.get("Cookie") !== `w6_operator=${gate}`
  ) {
    res.status(403).json({ error: "operator_origin_required" });
    return;
  }
  next();
});
application.post("/room", async (_req, res) => {
  const room = `w6-development-${randomUUID()}`;
  const result = await rooms.createRoom({
    name: room,
    maxParticipants: 2,
    emptyTimeout: 300,
    departureTimeout: 180,
  });
  if (result.activeRecording) throw new Error("Unexpected recording.");
  db.prepare("INSERT INTO room_binding VALUES(?,?,?)").run(
    room,
    result.sid,
    new Date().toISOString(),
  );
  res.json({
    room,
    sid: result.sid,
    recording: result.activeRecording,
    developmentOnly: true,
  });
});
application.post("/admission", async (req, res) => {
  const room = req.body.room;
  if (
    typeof room !== "string" ||
    !db.prepare("SELECT 1 FROM room_binding WHERE name=?").get(room)
  )
    throw new Error("Create a current development room.");
  const identity = randomUUID();
  db.prepare("INSERT INTO admission VALUES(?,?,?)").run(
    identity,
    room,
    new Date().toISOString(),
  );
  const token = new AccessToken(credentials.apiKey, credentials.apiSecret, {
    identity,
    ttl: 30,
  });
  token.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  });
  res.json({ token: await token.toJwt(), url: config.websocketURL });
});
application.post("/delete", async (req, res) => {
  const room = req.body.room;
  if (
    typeof room !== "string" ||
    !db.prepare("SELECT 1 FROM room_binding WHERE name=?").get(room)
  )
    throw new Error("Unknown development room.");
  await rooms.deleteRoom(room);
  res.json({
    roomAbsent: (await rooms.listRooms([room])).length === 0,
    credentialRevocationConfirmed: false,
  });
});
application.post("/state", async (req, res) => {
  const room = req.body.room;
  if (
    typeof room !== "string" ||
    !db.prepare("SELECT 1 FROM room_binding WHERE name=?").get(room)
  )
    throw new Error("Unknown development room.");
  const current = await rooms.listRooms([room]);
  res.json({
    rooms: current.map((r) => ({
      sid: r.sid,
      name: r.name,
      numParticipants: r.numParticipants,
      activeRecording: r.activeRecording,
    })),
    participants: current.length
      ? (await rooms.listParticipants(room)).map((p) => ({
          sid: p.sid,
          identity: p.identity,
          state: p.state,
          tracks: p.tracks.map((t) => ({
            type: t.type,
            source: t.source,
            muted: t.muted,
          })),
        }))
      : [],
    callbacks: db
      .prepare(
        "SELECT id,event,room_sid,complete_history FROM callback WHERE room_sid=(SELECT sid FROM room_binding WHERE name=?) ORDER BY received_at LIMIT 200",
      )
      .all(room),
    historyComplete: false,
  });
});
application.use(
  (
    _error: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => res.status(503).json({ error: "development_operation_unavailable" }),
);
const server = application.listen(3106, "127.0.0.1", () =>
  console.log(
    "Labelled W6 development transport operator: http://localhost:3106",
  ),
);
const stop = () =>
  server.close(() => {
    db.close();
    process.exit(0);
  });
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
