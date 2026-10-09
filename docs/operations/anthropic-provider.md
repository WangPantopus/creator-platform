# Anthropic (Claude) as the generation provider

The model port (`AgentModel`) now has a second adapter, `AnthropicMessagesModel`
(`apps/backend/src/modules/agent/anthropic-model.ts`). OpenAI stays the default; Claude is
selected by configuration. This is the work package B6 of lane 3, done early by the integrator
because the founder asked for the switch.

## Turn it on

Set `W2_PROVIDER=anthropic` on the host that runs generation. With it unset the host uses OpenAI,
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
