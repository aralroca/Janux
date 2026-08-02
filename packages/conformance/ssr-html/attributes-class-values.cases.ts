import type { AttrRow } from './attributes.cases';

/**
 * `class`/`className` value coercion.
 *
 * The two names converge on one attribute; the *value* gets no framework
 * treatment at all — no clsx-style array flattening, no `{name: bool}`
 * object form (Vue normalizes both). Whatever falls out of `String(...)` is
 * what ships, pinned here so the divergence is a documented decision instead
 * of a surprise. The name mapping itself is exact and case-sensitive.
 */
export const CLASS_VALUE_CASES: AttrRow[] = [
  { id: 'classv-empty-string-is-still-rendered', src: 'janux', props: { class: '' }, expected: ' class=""' },
  { id: 'classv-null-is-omitted', src: 'janux', props: { class: null }, expected: '' },
  { id: 'classv-true-renders-a-bare-class-attribute', src: 'janux', props: { class: true }, expected: ' class' },
  { id: 'classv-classname-true-also-renders-bare', src: 'janux', props: { className: true }, expected: ' class' },
  { id: 'classv-number-zero-is-a-value', src: 'janux', props: { class: 0 }, expected: ' class="0"' },
  // Vue would join with spaces; Janux does not treat arrays as token lists.
  { id: 'classv-array-is-not-a-token-list', src: 'vue:class-normalization#array', props: { class: ['a', 'b'] }, expected: ' class="a,b"' },
  // Vue would keep only truthy keys; Janux has no object form.
  { id: 'classv-object-form-is-not-supported', src: 'vue:class-normalization#object', props: { class: { a: true, b: false } }, expected: ' class="[object Object]"' },
  { id: 'classv-duplicate-tokens-are-not-deduped', src: 'janux', props: { class: 'btn btn' }, expected: ' class="btn btn"' },
  { id: 'classv-newline-separated-tokens-survive', src: 'janux', props: { class: 'a\nb' }, expected: ' class="a\nb"' },
  // The name mapping is exact-match and case-sensitive.
  { id: 'classv-uppercase-class-is-not-the-mapped-name', src: 'janux', props: { CLASS: 'x' }, expected: ' CLASS="x"' },
  { id: 'classv-lowercase-classname-is-not-the-mapped-name', src: 'janux', props: { classname: 'x' }, expected: ' classname="x"' },
];
