import { conversationSocketTickets } from "../modules/conversation/realtime-tickets.js";
import type { IncomingMessage, Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { IdSchema, SubscribeSchema } from "@qelvora/api";
import {
  resolveActor,
  type PantopusIdentityAdapter,
  type Actor,
} from "../modules/identity/adapter.js";
import type { AccessService, ThreadScope } from "../modules/access/scope.js";
import type { ConversationService } from "../modules/conversation/service.js";
import { requestAuthority } from "../modules/identity/request-authority.js";

export function attachRealtime(
  server: Server,
  identity: PantopusIdentityAdapter,
  access: AccessService,
  conversations: ConversationService,
  allowedOrigin: string,
  authority: {
    assertActorAllowed?: (actor: Actor) => Promise<void>;
    consumeTicket?: (ticket: string) => string;
    resolveSession?: (token: string) => Promise<{
      actor: Actor;
      sessionId: string;
      adultVerifiedAt?: string;
    }>;
    telemetry?: {
      observe(name: string, value: number): void;
      increment(name: string, amount?: number): void;
      timing(name: string, durationMs: number): void;
    };
  } = {},
) {
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 4096,
    handleProtocols: (protocols) =>
      protocols.has("pantopus-session")
        ? "pantopus-session"
        : protocols.has("qelvora-ticket")
          ? "qelvora-ticket"
          : false,
  });
  // Fixed process-level names only: no actor, thread, ticket, cursor or text.
  const report = (
    method: "observe" | "increment" | "timing",
    name: string,
    value: number,
  ) => {
    try {
      authority.telemetry?.[method](name, value);
    } catch {
      // Diagnostics never alter current-session or domain authorization.
    }
  };
  let active = 0,
    pending = 0,
    subscribed = 0,
    peakBufferedBytes = 0;
  report("observe", "realtime_connections_active", 0);
  report("observe", "realtime_subscriptions_pending", 0);
  report("observe", "realtime_subscriptions_active", 0);
  const ticketTokens = new WeakMap<IncomingMessage, string>();
  server.once("close", () => conversations.closeFrameNotifications());
  server.on("upgrade", (request, socket, head) => {
    void authenticate(request)
      .then(() => {
        if (request.url !== "/v1/realtime")
          throw new Error("Unknown realtime path");
        sockets.handleUpgrade(request, socket, head, (connection) => {
          report("increment", "realtime_connections_opened", 1);
          report("observe", "realtime_connections_active", ++active);
          const subscriptions = new Map<
            string,
            { scope: ThreadScope; cursor: number; stopListening: () => void }
          >();
          let busy = false;
          let replayPending = false;
          let subscriptionsPending = 0;
          let mutations: Promise<void> = Promise.resolve();
          connection.on("message", (data) => {
            if (++subscriptionsPending > 64) {
              report("increment", "realtime_subscription_limit_closed", 1);
              connection.close(1008, "Subscription limit");
              return;
            }
            report("observe", "realtime_subscriptions_pending", ++pending);
            mutations = mutations
              .then(async () => {
                if (connection.readyState !== WebSocket.OPEN)
                  throw new Error("Connection closed");
                const input = SubscribeSchema.parse(
                  JSON.parse(data.toString()),
                );
                if (
                  subscriptions.size >= 64 &&
                  ![...subscriptions.values()].some(
                    (s) =>
                      s.scope.creatorId === input.creatorId &&
                      s.scope.fanId === input.fanId,
                  )
                )
                  throw new Error("Subscription limit");
                const current = await authenticate(request);
                await withAuthority(current, async () => {
                  const scope = await access.openThread(
                    current.actor,
                    input.creatorId,
                    input.fanId,
                  );
                  if (connection.readyState !== WebSocket.OPEN)
                    throw new Error("Connection closed");
                  if (!subscriptions.has(scope.threadId)) {
                    subscribed++;
                    report(
                      "observe",
                      "realtime_subscriptions_active",
                      subscribed,
                    );
                  }
                  const prior = subscriptions.get(scope.threadId);
                  subscriptions.set(scope.threadId, {
                    scope,
                    cursor: input.cursor,
                    stopListening:
                      prior?.stopListening ??
                      conversations.watchFrames(scope.threadId, drain),
                  });
                  report("increment", "realtime_subscriptions_accepted", 1);
                  drain();
                });
              })
              .catch(() => {
                report("increment", "realtime_subscriptions_refused", 1);
                connection.close(1008, "Subscription refused");
              })
              .finally(() => {
                subscriptionsPending--;
                report("observe", "realtime_subscriptions_pending", --pending);
              });
          });
          const drain = () => {
            if (connection.readyState !== WebSocket.OPEN) return;
            replayPending = true;
            if (busy) return;
            replayPending = false;
            busy = true;
            const deadline = setTimeout(() => {
              if (connection.readyState !== WebSocket.OPEN) return;
              report("increment", "realtime_authority_deadline_closed", 1);
              connection.close(1008, "Reconnect with current authority");
            }, 2000);
            deadline.unref();
            const batchStart = performance.now();
            let batchStopped = false;
            void (async () => {
              const current = await authenticate(request);
              await withAuthority(current, async () => {
                for (const subscription of subscriptions.values()) {
                  // Revalidate adult eligibility and authority on every batch: revocation is not a timeout.
                  subscription.scope = await access.openThread(
                    current.actor,
                    subscription.scope.creatorId,
                    subscription.scope.fanId,
                    false,
                  );
                  const frames = await conversations.replay(
                    subscription.scope,
                    subscription.cursor,
                  );
                  // Drain a full durable page without waiting for another
                  // notification, including after a long disconnected period.
                  if (frames.length === 256) replayPending = true;
                  for (const frame of frames) {
                    if (connection.bufferedAmount > 1024 * 1024) {
                      report("increment", "realtime_backpressure_closed", 1);
                      connection.close(1013, "Reconnect with your cursor");
                      batchStopped = true;
                      return;
                    }
                    if (connection.readyState !== WebSocket.OPEN) {
                      batchStopped = true;
                      return;
                    }
                    const payload = JSON.stringify(frame);
                    const bytes = Buffer.byteLength(payload, "utf8");
                    const sendStart = performance.now();
                    report("increment", "realtime_frames_queued", 1);
                    report("increment", "realtime_bytes_queued", bytes);
                    connection.send(payload, (error) => {
                      if (error) {
                        report("increment", "realtime_send_errors", 1);
                        return;
                      }
                      report("increment", "realtime_frames_sent", 1);
                      report("increment", "realtime_bytes_sent", bytes);
                      report(
                        "timing",
                        "realtime_send_ms",
                        performance.now() - sendStart,
                      );
                    });
                    peakBufferedBytes = Math.max(
                      peakBufferedBytes,
                      connection.bufferedAmount,
                    );
                    report(
                      "observe",
                      "realtime_peak_buffered_bytes",
                      peakBufferedBytes,
                    );
                    subscription.cursor = frame.cursor;
                  }
                }
              });
            })()
              .then(() =>
                report(
                  "increment",
                  batchStopped
                    ? "realtime_batches_stopped"
                    : "realtime_batches_completed",
                  1,
                ),
              )
              .catch(() => {
                report("increment", "realtime_batches_refused", 1);
                connection.close(1008, "Conversation unavailable");
              })
              .finally(() => {
                clearTimeout(deadline);
                report(
                  "timing",
                  "realtime_batch_ms",
                  performance.now() - batchStart,
                );
                busy = false;
                if (replayPending && connection.readyState === WebSocket.OPEN)
                  queueMicrotask(drain);
              });
          };
          // Notification wakeups drive frame delivery. This bounded maintenance
          // pass revalidates idle authority and recovers a missed wakeup.
          const timer = setInterval(drain, 2000);
          timer.unref();
          connection.on("close", () => {
            clearInterval(timer);
            subscribed -= subscriptions.size;
            for (const subscription of subscriptions.values())
              subscription.stopListening();
            subscriptions.clear();
            report("observe", "realtime_subscriptions_active", subscribed);
            report("observe", "realtime_connections_active", --active);
            report("increment", "realtime_connections_closed", 1);
          });
          connection.on("error", () => {
            report("increment", "realtime_socket_errors", 1);
            clearInterval(timer);
            connection.terminate();
          });
        });
      })
      .catch(() => {
        report("increment", "realtime_upgrades_refused", 1);
        socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        socket.destroy();
      });
  });
  async function authenticate(request: IncomingMessage) {
    if (request.headers.origin && request.headers.origin !== allowedOrigin)
      throw new Error("Origin refused");
    const protocols =
      request.headers["sec-websocket-protocol"]
        ?.split(",")
        .map((value) => value.trim()) ?? [];
    const ticket = protocols[0] === "qelvora-ticket" ? protocols[1] : undefined;
    if (ticket && !ticketTokens.has(request))
      ticketTokens.set(
        request,
        (
          authority.consumeTicket ??
          ((value: string) => conversationSocketTickets.consume(value))
        )(ticket),
      );
    const token =
      ticketTokens.get(request) ??
      request.headers.authorization?.match(/^Bearer ([^\s]+)$/u)?.[1] ??
      (protocols[0] === "pantopus-session" ? protocols[1] : undefined);
    if (!token) throw new Error("Session required");
    const current = authority.resolveSession
      ? await authority.resolveSession(token)
      : { actor: await resolveActor(identity, token), sessionId: undefined };
    const expected = request.headers["x-expected-account-id"];
    if (expected && current.actor.accountId !== IdSchema.parse(expected))
      throw new Error("Account changed");
    await authority.assertActorAllowed?.(current.actor);
    return current;
  }
  function withAuthority<T>(
    current: { actor: Actor; sessionId?: string; adultVerifiedAt?: string },
    work: () => Promise<T>,
  ): Promise<T> {
    return current.sessionId
      ? requestAuthority.run(
          {
            accountId: current.actor.accountId,
            sessionId: current.sessionId,
            actor: current.actor,
            // Only the actual session resolver may provide this confirmation.
            // Older adapters without it remain unavailable at the W1 gate.
            adultVerifiedAt: current.adultVerifiedAt,
          },
          work,
        )
      : work();
  }
  return sockets;
}
