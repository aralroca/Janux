import { describe, expect, it } from 'bun:test';
import { eventsByName } from './events-by-name';

const run = (code: string, file = 'src/components/Widget.tsx') => eventsByName.run({ code, file }).code;

describe('0.5.0/events-by-name', () => {
  it('is the codemod for the release that removed the old attributes', () => {
    expect(eventsByName.since).toBe('0.5.0');
  });

  it('renames `on={intents.x}` to `onClick`', () => {
    expect(run('const a = <button on={intents.add}>+</button>;\n')).toBe('const a = <button onClick={intents.add}>+</button>;\n');
  });

  it('renames `intent={intents.x}` on a form to `onSubmit`', () => {
    expect(run('const a = <form intent={intents.send} reset />;\n')).toBe('const a = <form onSubmit={intents.send} reset />;\n');
  });

  it('follows a member/call chain to its root, so a bound ref migrates too', () => {
    expect(run('const a = <button on={intents.toggle.with({ id })} />;\n')).toBe(
      'const a = <button onClick={intents.toggle.with({ id })} />;\n',
    );
  });

  it('touches only the attribute name — `data-input` and every other attribute are left alone', () => {
    const code = `const a = <button class="x" on={intents.add} data-input={JSON.stringify({ id })}>+</button>;\n`;

    expect(run(code)).toBe(`const a = <button class="x" onClick={intents.add} data-input={JSON.stringify({ id })}>+</button>;\n`);
  });

  it('leaves an `on` prop that is not an intent alone — a foreign component owns its own props', () => {
    expect(run('const a = <Switch on={state.enabled} />;\n')).toBeUndefined();
  });

  it('leaves `intent` on a non-form element that is not an intent ref alone', () => {
    expect(run('const a = <Row intent={props.intent} />;\n')).toBeUndefined();
  });

  it('reports nothing to do on already-migrated source, so a second run is a no-op', () => {
    expect(run('const a = <button onClick={intents.add}>+</button>;\n')).toBeUndefined();
  });

  it('edits by byte offset, so a multi-byte character above the attribute does not shift it', () => {
    const code = `const label = '→ añadir';\nconst a = <button on={intents.add}>{label}</button>;\n`;

    expect(run(code)).toBe(`const label = '→ añadir';\nconst a = <button onClick={intents.add}>{label}</button>;\n`);
  });

  it('applies to source files and skips everything else', () => {
    expect(eventsByName.appliesTo('src/a.tsx')).toBe(true);
    expect(eventsByName.appliesTo('src/a.ts')).toBe(true);
    expect(eventsByName.appliesTo('src/a.css')).toBe(false);
  });
});
