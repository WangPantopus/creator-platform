// Loaded with `node --import` into the local development backend only. It
// sends the backend's calls to the model provider's host to the local fake
// (model.mjs). Nothing else is rewritten, and it refuses to load unless this is
// an explicit loopback development process, so it can never redirect a real
// deployment.
const target = process.env.QELVORA_FAKE_MODEL_URL;
if (target) {
  const destination = new URL(target);
  if (
    process.env.NODE_ENV !== "development" ||
    !["127.0.0.1", "localhost"].includes(destination.hostname)
  )
    throw new Error(
      "The fake model edge needs NODE_ENV=development and a loopback target.",
    );
  const providerHost = "api.openai.com";
  const real = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    const original =
      typeof input === "string" || input instanceof URL ? input : input.url;
    const url = new URL(original);
    if (url.hostname !== providerHost) return real(input, init);
    const redirected = new URL(url.pathname + url.search, destination);
    return real(
      typeof input === "string" || input instanceof URL
        ? redirected
        : new Request(redirected, input),
      init,
    );
  };
  process.stdout.write(
    `Model edge: ${providerHost} calls go to the local fake at ${destination.origin}.\n`,
  );
}
