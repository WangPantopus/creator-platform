# Anthropic (Claude) as the generation provider

The model port (`AgentModel`) now has a second adapter, `AnthropicMessagesModel`
(`apps/backend/src/modules/agent/anthropic-model.ts`). OpenAI stays the default; Claude is
selected by configuration. This is the work package B6 of lane 3, done early by the integrator
because the founder asked for the switch.

## Use it day to day: the key and the gateway

The key lives in one place and one process. Nobody else, including every lane session, ever holds it.

1. **Create a key** in the Anthropic Console for this app only, with a monthly spend limit.
2. **Store it once** in the macOS Keychain from your own Terminal (the prompt is hidden; nothing
   goes to chat, git or shell history):

   ```bash
   security add-generic-password -a "$USER" -s qelvora-anthropic-key -w
   ```

   The Keychain item is named `qelvora-anthropic-key`; the environment variable the software
   reads is `ANTHROPIC_API_KEY`. They are different things: the first is where it is kept, the
   second is how it is handed to a process at launch.
3. **Start the gateway** (a Terminal tab you can watch; Ctrl-C ends it and the key with it):

   ```bash
   ANTHROPIC_API_KEY="$(security find-generic-password -a "$USER" -s qelvora-anthropic-key -w)" \
     node infra/local/model-gateway.mjs --budget-usd 20
   ```

   It listens on `127.0.0.1:56499`, forwards only the two allowed models, stops at the dollar cap
   (kept across restarts; raise it by restarting with a larger `--budget-usd`), and counts spend per
   lane: `curl -s http://127.0.0.1:56499/__stats`.
4. **Run the app on Claude**, from any worktree:

   ```bash
   node infra/local/stack.mjs up --lane N --provider anthropic --model-gateway http://127.0.0.1:56499
   ```

   Without `--model-gateway` the same command runs Claude's protocol against the free local fake.
   The stack sets every other setting itself (models, prices, the consent policy naming Anthropic
   and OpenAI), so the key is the only thing you provide.

Lanes follow the rule in the working agreement (section 3.6): the fake by default, the gateway only
for what needs real model behavior, small requests, no loops, spend reported.

## Turn it on elsewhere (a real host, not the local stack)

A deployed host has no gateway: it holds the key itself, from a secret store. Set `W2_PROVIDER=anthropic` on the host that runs generation. With it unset the host uses OpenAI,
and any other value is treated as unconfigured (no model, the host reports what is missing).

| Variable | Meaning |
| --- | --- |
| `ANTHROPIC_API_KEY` | The Claude key. Never commit it, never paste it in chat. |
| `OPENAI_API_KEY` | Still required: embeddings stay on OpenAI (Anthropic has no embedding model). |
| `W2_SMALL_MODEL` | Guards, classification, memory extraction. Recommended `claude-haiku-5-5`. |
| `W2_LARGE_MODEL` | The reply. Recommended `claude-sonnet-5-5`. |
| `W2_EMBEDDING_MODEL` | The OpenAI embedding model id. |
| `W2_PROVIDER_POLICY_REFERENCE` | Same meaning as today. |
| `W2_MODEL_RATES_JSON` | Prices by model id, in micro-dollars per million tokens (below). Without them the host reports "provider rates" as missing. |
| `W2_ANTHROPIC_EFFORT` | `low` (default), `medium` or `high`. Lower is faster and cheaper; measure before raising. |

Example rates, from the model table cached 2026-10-06 (check the pricing page before relying on
them; cache writes are the five-minute rate, 1.25 times input):

```json
{
  "claude-haiku-5-5": { "inputMicrosPerMillion": 100000, "outputMicrosPerMillion": 500000, "cachedInputMicrosPerMillion": 10000, "cacheWriteMicrosPerMillion": 125000 },
  "claude-sonnet-5-5": { "inputMicrosPerMillion": 2000000, "outputMicrosPerMillion": 10000000, "cachedInputMicrosPerMillion": 200000, "cacheWriteMicrosPerMillion": 2500000 },
  "<the OpenAI embedding model id>": { "inputMicrosPerMillion": 0, "outputMicrosPerMillion": 0 }
}
```

Put the real embedding price in that last row.

## What to know before real creators publish

- **A new engine fingerprint.** A published AI version is bound to its provider configuration by
  fingerprint. Switching provider (or changing a model id, the effort or the policy reference)
  changes it, so anything published under OpenAI must be republished. Switch before the first real
  creator publishes, as planned.
- **Two processors.** Claude writes the replies and OpenAI embeds the fan's message for retrieval,
  so fan text reaches both. The consent policy file (`W3_PROVIDER_POLICY_FILE`) must name both. The
  development gate now accepts one or two providers named OpenAI or Anthropic; the production
  consent text and privacy label are lane 1's work (1.9 and B7). Using one processor for both jobs
  needs a different embedding model, which is an open decision.
- **Refusals.** Claude can decline a request (`stop_reason: refusal`). The adapter keeps the usage,
  delivers nothing, and reports `provider_refused`. Server-side fallback is not enabled: Haiku 5.5
  has none, and a different model answering a declined fan message needs the guard's review first.

## Known follow-ups (not in this change)

- Guard revision 15 (word boundaries, distress-safe fallback) is still lane 3 B1.
- Time to the first sentence has not been measured against the real API yet: run the live check
  below, then decide whether to turn thinking off (`between_tools` on Sonnet 5.5).
- Structured schemas compile on first use (a one-time delay per schema); a warm-up at start would
  hide it.
- A non-success response before any output is still recorded as an unknown cost, as with OpenAI;
  lane 3 A6 fixes that for both adapters.
- Context size is estimated (bytes over three), not counted by the provider.

## Verify it

Offline, against fake provider servers (no key needed):

```bash
(cd apps/backend && pnpm exec tsx ../../tests/scenarios/integrator/anthropic-adapter.mts)
```

Live, with the key passed from the macOS Keychain (about a dozen small requests; it prints
latency, tokens and cost only):

```bash
ANTHROPIC_API_KEY="$(security find-generic-password -a "$USER" -s qelvora-anthropic-key -w)" \
  sh -c 'cd apps/backend && pnpm exec tsx ../../tests/scenarios/integrator/anthropic-live.mts'
```
