// Loaded with `node --import` into the local development backend only. It
// sends the backend's calls to each model provider's host to a local edge on
// loopback: the permissive fake (model.mjs) or, for Claude, the fake or the
// capped gateway (model-gateway.mjs). Nothing else is rewritten, and it refuses
// to load unless this is an explicit loopback development process, so it can
// never redirect a real deployment.
//
//   QELVORA_FAKE_MODEL_URL         edge for api.openai.com
//   QELVORA_ANTHROPIC_EDGE_URL     edge for api.anthropic.com; may carry a path
//                                  prefix such as /lane/3 (the gateway's accounting)
const hosts = {
  "api.openai.com": process.env.QELVORA_FAKE_MODEL_URL,
  "api.anthropic.com": process.env.QELVORA_ANTHROPIC_EDGE_URL,
};
const edges = new Map();
for (const [host, value] of Object.entries(hosts)) {
  if (!value) continue;
  const destination = new URL(value);
  if (
    process.env.NODE_ENV !== "development" ||
    !["127.0.0.1", "localhost"].includes(destination.hostname)
  )
    throw new Error(
      "The model edge needs NODE_ENV=development and a loopback target.",
    );
  edges.set(host, destination);
}
if (edges.size) {
  const real = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    const original =
      typeof input === "string" || input instanceof URL ? input : input.url;
    const url = new URL(original);
    const destination = edges.get(url.hostname);
    if (!destination) return real(input, init);
    const prefix = destination.pathname.replace(/\/$/u, "");
    const redirected = new URL(
      prefix + url.pathname + url.search,
      destination.origin,
    );
    return real(
      typeof input === "string" || input instanceof URL
        ? redirected
        : new Request(redirected, input),
      init,
    );
  };
  for (const [host, destination] of edges)
    process.stdout.write(
      `Model edge: ${host} calls go to ${destination.origin}${destination.pathname.replace(/\/$/u, "")}.\n`,
    );
}
