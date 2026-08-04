import { applyEdits, collect, parseModule, spanOf, type SpanEdit } from '../ast';
import { SOURCE_FILE, type Codemod, type CodemodInput, type CodemodResult } from '../types';

/**
 * 0.5.0 removed `on=` and `intent=`: events bind by name now, which
 * generalized a two-attribute allowlist to every event. Both spellings bound an
 * intent ref, so the translation is exact — `on=` was always the click and
 * `intent=` was always the submit.
 *
 * Only the attribute *name* is rewritten. `data-input` still works and still
 * wins over `.with()`, so folding one into the other would be a second,
 * unasked-for change with a behavioural difference hiding in it.
 */

/** The removed attribute → the event it always meant. */
const EVENT_BY_ATTRIBUTE: Record<string, string> = { on: 'onClick', intent: 'onSubmit' };

/**
 * The identifier a member/call chain starts from: `intents.toggle.with({id})`
 * → `intents`. This is the whole safety argument for the rename. `on` is also
 * an ordinary prop name — a React `<Switch on={...}>` mounted through
 * `foreign()` is not an event binding, and renaming it would break a working
 * app to fix one that was already broken.
 */
function rootName(expression: any): string | undefined {
  if (expression?.type === 'Identifier') return expression.value;
  if (expression?.type === 'MemberExpression') return rootName(expression.object);
  if (expression?.type === 'CallExpression') return rootName(expression.callee);
  if (expression?.type === 'ParenthesisExpression') return rootName(expression.expression);

  return undefined;
}

/** The event name this attribute should carry, or nothing when it is not one of ours. */
function renamedTo(element: any, attribute: any): string | undefined {
  const event = EVENT_BY_ATTRIBUTE[attribute.name?.value as string];

  if (!event || attribute.value?.type !== 'JSXExpressionContainer') return undefined;
  // A `<form intent={...}>` is unambiguous even when the ref reaches it through
  // a prop or a local, which is how layouts and shared form components wrote it.
  const bound = rootName(attribute.value.expression) === 'intents' || (event === 'onSubmit' && element.name?.value === 'form');

  return bound ? event : undefined;
}

/** The name-span rewrites one opening tag needs. */
function renamesIn(element: any, base: number): SpanEdit[] {
  return (element.attributes ?? []).flatMap((attribute: any) => {
    const event = renamedTo(element, attribute);

    return event ? [{ ...spanOf(attribute.name, base), text: event }] : [];
  });
}

export const eventsByName: Codemod = {
  id: '0.5.0/events-by-name',
  since: '0.5.0',
  title: 'Bind events by name',
  description: '`on={intents.x}` becomes `onClick`, and `<form intent={intents.x}>` becomes `onSubmit`.',
  appliesTo: (file: string) => SOURCE_FILE.test(file),
  run({ code, file }: CodemodInput): CodemodResult {
    const parsed = parseModule(code, file);

    if (!parsed) return {};
    const edits = collect(parsed.module, 'JSXOpeningElement').flatMap((element) => renamesIn(element, parsed.base));

    return edits.length > 0 ? { code: applyEdits(code, edits) } : {};
  },
};
