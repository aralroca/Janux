/**
 * Compile-time contract for the JSX event surface — no runtime, `bun run
 * typecheck` is what executes this file. Each `@ts-expect-error` is an
 * assertion: if the surface ever accepts what it must refuse, tsc fails here.
 */
import type { IntentRef } from './define/types';
import type { CSSProperties } from 'janux';
import type { JSX } from './jsx-runtime';

declare const intents: Record<string, IntentRef>;

// The style object type is reachable from the package root and the JSX namespace.
export const typedStyle: CSSProperties = { color: 'red', '--x': 1 };
export const namespacedStyle: JSX.CSSProperties = typedStyle;

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

export const acceptsStyle = [
  <div style="color:red" />,
  // Object form: typed by csstype; a number never gets a unit appended.
  <div style={{ backgroundColor: 'red', width: 10, '--x': '1px' }} />,
  <div style={undefined} />,
];

export const refusesStyle = [
  // @ts-expect-error — unknown CSS property (typo of `color`).
  <div style={{ colr: 'red' }} />,
  // @ts-expect-error — an array is not CSS text nor a style object.
  <div style={[]} />,
  // @ts-expect-error — a property value must be string | number.
  <div style={{ color: true }} />,
];

export const acceptsGlobals = [
  <div id="a" class="b" title="t" hidden aria-label="x" data-track="y" tabIndex={0} />,
  <span className="b" dir="rtl" translate="no" />,
  <script dangerHTML={'window.init()'} />,
];

export const refusesGlobals = [
  // @ts-expect-error — dangerHTML injects a string of HTML, not a node.
  <div dangerHTML={{}} />,
  // @ts-expect-error — dir has a closed set of values.
  <div dir="middle" />,
  // @ts-expect-error — aria-live has a closed set of politeness values.
  <div aria-live="loudly" />,
];

export const acceptsPerTag = [
  <input type="checkbox" checked maxLength={3} />,
  <a href="/x" target="_blank" rel="noreferrer">
    x
  </a>,
  <label for="email" />,
  <svg viewBox="0 0 16 16">
    <path d="M4 4l8 8" stroke-width={2} />
  </svg>,
  <my-widget anything="goes" onClick={intents.go} />,
];

export const refusesPerTag = [
  // @ts-expect-error — hreff is a typo of href.
  <a hreff="/x" />,
  // @ts-expect-error — checked belongs to <input>, not <a>.
  <a checked />,
  // @ts-expect-error — htmlFor is React's spelling; the attribute is `for`.
  <label htmlFor="email" />,
  // @ts-expect-error — an unknown attribute on a typed tag is refused.
  <div foo="bar" />,
  // @ts-expect-error — SVG shares the core surface, not the HTML-only globals.
  <circle enterKeyHint="go" />,
  // @ts-expect-error — reset is the form directive; it means nothing elsewhere.
  <span reset />,
];

export const acceptsBooleanish = [
  <img draggable={false} />,
  <div contentEditable={false} spellcheck={false} aria-hidden={true} />,
  <svg tabIndex={0} class="icon" role="img" aria-label="logo" />,
];

export const acceptsReviewFixes = [
  <img data-track="y" loading="lazy" onClick={intents.zoom} />,
  <feTurbulence type="fractalNoise" baseFrequency={0.4} />,
  <dialog closedby="any" />,
  <button command="show-modal" commandFor="dlg">
    open
  </button>,
  <textarea rows={3}>{'content'}</textarea>,
  <div aria-valuenow="50" aria-level={2} />,
];

export const refusesReviewFixes = [
  // @ts-expect-error — a void element has no children.
  <img dangerHTML="<b>x</b>" />,
  // @ts-expect-error — <select> has no value attribute; select with <option selected>.
  <select value="a" />,
  // @ts-expect-error — <textarea> content is its child text, not a value attribute.
  <textarea value="x" />,
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
