# parseDuration

```ts
import { parseDuration } from 'janux';

parseDuration('300ms');   // 300
parseDuration('2s');      // 2000
parseDuration('5m');      // 300000
parseDuration('1.5h');    // 5400000
```

`parseDuration(input: string): number` — turns a duration string into milliseconds. It's the parser behind every duration field in Janux, so `debounce: '300ms'` and `every('5m')` accept exactly this grammar and nothing else.

| Unit | Meaning |
|---|---|
| `ms` | milliseconds |
| `s` | seconds |
| `m` | minutes |
| `h` | hours |

The number may be fractional (`'1.5h'`, `'0.5s'`); the unit is required and must be one of the four above.

## It throws on anything else

There is no silent fallback — a typo throws instead of turning into a surprise interval. `every('5min')` fails where you wrote it; a bad `debounce` fails when the component attaches (that's when effects start):

```ts
parseDuration('5');       // throws: invalid duration "5" (use e.g. 300ms, 2s, 5m, 1h)
parseDuration('5min');    // throws — the unit is `m`
parseDuration('-5m');     // throws — durations are positive
```

## Where durations appear

```ts
effect({ debounce: '300ms', run: ({ state }) => save(state) })   // effect debounce
source({ query: fetchStock, refresh: every('5m') })              // source polling
```

You rarely call `parseDuration` yourself; import it when you're building your own helper that should accept the same strings the rest of the framework does.

Related: [`every`](/docs/reference/every) · [Sources, effects and events](/docs/guide/sources-effects-events)
