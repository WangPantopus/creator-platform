// Loaded with `node --import` into lane 4's development backend only (the
// stack's NODE_OPTIONS, set by tests/scenarios/lane-4/stack.mjs). It sends the
// backend's Stripe API calls to the lane 4 fake processor on loopback, so the
// backend's real Stripe adapter runs against fake-stripe.mjs. Nothing else is
// rewritten, and it refuses to load unless this is an explicit loopback
// development process holding a sandbox-shaped key, so it can never redirect a
// real deployment.
//
//   QELVORA_FAKE_STRIPE_URL   edge for api.stripe.com, e.g. http://127.0.0.1:56444
import http from "node:http";
import https from "node:https";

const value = process.env.QELVORA_FAKE_STRIPE_URL;
if (value) {
  const destination = new URL(value);
  if (
    process.env.NODE_ENV !== "development" ||
    destination.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(destination.hostname) ||
    !process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
  )
    throw new Error(
      "The Stripe edge needs NODE_ENV=development, a sandbox key and a loopback target.",
    );
  const agent = new http.Agent({ keepAlive: true });
  const original = https.request;
  // The Stripe SDK's Node client calls https.request(options, callback) with a
  // host option; only that host is sent to the fake, over plain HTTP.
  https.request = function request(options, ...rest) {
    if (
      options &&
      typeof options === "object" &&
      !(options instanceof URL) &&
      (options.host ?? options.hostname) === "api.stripe.com"
    ) {
      const { agent: _https, ciphers: _ciphers, ...plain } = options;
      void _https;
      void _ciphers;
      const request = http.request(
        {
          ...plain,
          protocol: "http:",
          host: destination.hostname,
          hostname: destination.hostname,
          port: Number(destination.port),
          agent,
        },
        ...rest,
      );
      // The SDK writes its body once the TLS handshake ends ("secureConnect").
      // A plain loopback socket has no handshake, so announce it on connect.
      request.once("socket", (socket) => {
        if (socket.connecting)
          socket.once("connect", () => socket.emit("secureConnect"));
      });
      return request;
    }
    return original.call(this, options, ...rest);
  };
  process.stdout.write(
    `Stripe edge: api.stripe.com calls go to ${destination.origin}.\n`,
  );
}
