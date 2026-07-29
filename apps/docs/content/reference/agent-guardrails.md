# Agent guardrails — input processors

Every turn's messages pass through a processor chain before they reach the model. Each processor can rewrite the turn or abort it. Guide: [The agent and your copilot](/docs/guide/agent-and-copilot).

```ts
import {
  runProcessors, unicodeNormalizer, historyTokenBudget, piiFilter, injectionGuard, approxTokens,
} from '@janux/agent';

export default defineAgent({
  harness: {
    processors: [unicodeNormalizer(), piiFilter(), historyTokenBudget(120_000)],
  },
});
```

## The contract

```ts
interface InputProcessor {
  name: string;
  run(turn: TurnContext): TurnContext | Promise<TurnContext>;
}

interface TurnContext {
  messages: TurnMessage[];
  aborted?: { reason: string };
}
```

`runProcessors(processors, turn)` runs them **in order and short-circuits**: the first processor that returns an `aborted` turn stops the chain, so a blocking guard is never undone by a later step. Order matters — normalize before you classify, filter before you budget.

## The refusal, and refusalMessage

When the chain aborts, the agent answers `{ type: 'refusal', reason, message }` without ever calling the model. `reason` is the processor's typed code (`prompt_injection`); `message` is the human-readable reply a UI can show as-is. Configure it next to the processors:

```ts
export default defineAgent({
  harness: {
    processors: [unicodeNormalizer(), injectionGuard(classify)],
    refusalMessage: 'I can’t help with that. Ask me about your workspace instead.',
  },
});
```

`refusalMessage` is a string or a `(reason) => string` factory when different guards deserve different replies. Default: `"I can't help with that request."`.

## unicodeNormalizer()

NFKC-normalizes text and strips zero-width and bidi control characters. Those are the classic smuggling vector: invisible codepoints that a model reads but a human reviewer never sees. Put it **first**, so every later processor sees the same text the model will.

## piiFilter()

Masks known PII patterns in message text before the turn leaves your process — the difference between "we don't log PII" and "PII never reaches the provider". Non-string content is passed through untouched.

## historyTokenBudget(maxInputTokens)

Caps the turn by an approximate token budget, dropping the **oldest non-system** messages first. It never drops the system prompt and never drops the newest user turn — so a long conversation degrades by forgetting the middle, not by losing its instructions or the question just asked.

```ts
historyTokenBudget(120_000)
```

Pair it with `memory.lastMessages`: that's a *message* window, this is a *token* ceiling. Long messages blow a message window; this catches them.

## injectionGuard(classify, mode?)

```ts
injectionGuard(async (text) => (await isSuspicious(text)) ? 'suspicious' : 'ok', 'block')
```

Runs your classifier over the **latest user message** and, on `'suspicious'`, either aborts the turn (`mode: 'block'`, the default) or lets it through for logging (`mode: 'warn'`). The classifier is yours — a regex set, a small local model, a hosted moderation call — because what counts as an injection depends on what your tools can do.

Start in `warn` while you tune the classifier against real traffic; flip to `block` once the false-positive rate is acceptable. A `confirm` guard on the dangerous intents is the belt to this braces: even a turn that slips through can't act unattended ([intents and guards](/docs/guide/intents-and-guards)).

## approxTokens(text)

`text.length / 4`, rounded up — the estimator `historyTokenBudget` uses. Deliberately cheap and provider-agnostic: no tokenizer download, no per-model table, and it errs high enough to keep you under a real limit. Import it when your own processor needs to size a message the same way.

## Writing your own

```ts
const dropToolNoise: InputProcessor = {
  name: 'drop-tool-noise',
  run: (turn) => ({ ...turn, messages: turn.messages.filter((m) => m.role !== 'tool') }),
};
```

Return a **new** turn rather than mutating the one you were given, and set `aborted: { reason }` to stop the chain.

Related: [The agent and your copilot](/docs/guide/agent-and-copilot) · [Intents and guards](/docs/guide/intents-and-guards) · [Agent memory](/docs/reference/agent-memory)
