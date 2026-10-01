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
    resolveSession?: (
      token: string,
    ) => Promise<{ actor: Actor; sessionId: string }>;
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
  const ticketTokens = new WeakMap<IncomingMessage, string>();
  server.on("upgrade", (request, socket, head) => {
    void authenticate(request)
      .then(() => {
        if (request.url !== "/v1/realtime")
          throw new Error("Unknown realtime path");
        sockets.handleUpgrade(request, socket, head, (connection) => {
          const subscriptions = new Map<
            string,
            { scope: ThreadScope; cursor: number }
          >();
          let busy = false;
          let subscriptionsPending = 0;
          let mutations: Promise<void> = Promise.resolve();
          connection.on("message", (data) => {
            if (++subscriptionsPending > 64) {
              connection.close(1008, "Subscription limit");
              return;
            }
            mutations = mutations
              .then(async () => {
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
                  subscriptions.set(scope.threadId, {
                    scope,
                    cursor: input.cursor,
                  });
                });
              })
              .catch(() => connection.close(1008, "Subscription refused"))
              .finally(() => subscriptionsPending--);
          });
          const timer = setInterval(() => {
            if (busy || connection.readyState !== WebSocket.OPEN) return;
            busy = true;
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
                  for (const frame of await conversations.replay(
                    subscription.scope,
                    subscription.cursor,
                  )) {
                    if (connection.bufferedAmount > 1024 * 1024) {
                      connection.close(1013, "Reconnect with your cursor");
                      return;
                    }
                    connection.send(JSON.stringify(frame));
                    subscription.cursor = frame.cursor;
                  }
                }
              });
            })()
              .catch(() => connection.close(1008, "Conversation unavailable"))
              .finally(() => {
                busy = false;
              });
          }, 100);
          connection.on("close", () => clearInterval(timer));
          connection.on("error", () => {
            clearInterval(timer);
            connection.terminate();
          });
        });
      })
      .catch(() => {
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
    current: { actor: Actor; sessionId?: string },
    work: () => Promise<T>,
  ): Promise<T> {
    return current.sessionId
      ? requestAuthority.run(
          { accountId: current.actor.accountId, sessionId: current.sessionId },
          work,
        )
      : work();
  }
  return sockets;
}
