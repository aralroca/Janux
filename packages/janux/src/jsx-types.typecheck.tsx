/**
 * Compile-time contract for the JSX event surface — no runtime, `bun run
 * typecheck` is what executes this file. Each `@ts-expect-error` is an
 * assertion: if the surface ever accepts what it must refuse, tsc fails here.
 */
import type { IntentRef } from './define/types';

declare const intents: Record<string, IntentRef>;

export const accepts = [
  <button onClick={intents.add}>ok</button>,
  <form onSubmit={intents.send} reset>
    <input name="q" />
  </form>,
  <li onDoubleClick={intents.open} />,
  <li onDblClick={intents.open} />,
  // Any DOM event works through the `on${string}` pattern, listed or not.
  <div onWheel={intents.zoom} onCanPlay={intents.warm} />,
  <button onClick={intents.add} data-input='{"id":"p1"}'>
    ok
  </button>,
  // .with() binds input for this control; the ref stays a valid event value.
  <button onClick={intents.add.with({ productId: 'p1' })}>ok</button>,
  <li onDoubleClick={intents.open.with({ row: 3 }).with({ from: 'list' })} />,
];

export const refuses = [
  // @ts-expect-error — a closure has no name, schema or guard.
  <button onClick={() => {}}>no</button>,
  // @ts-expect-error — the whole on* namespace is reserved for intents.
  <div onWheel="spin()" />,
  // @ts-expect-error — removed v0 syntax: bind the click by name.
  <button on={intents.add}>no</button>,
  // @ts-expect-error — removed v0 syntax: bind the submit by name.
  <form intent={intents.send} />,
  // @ts-expect-error — .with() binds an input object, not a scalar.
  <button onClick={intents.add.with('p1')}>no</button>,
];
