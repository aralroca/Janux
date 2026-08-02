import { describe, expect } from 'bun:test';
import { jsx } from 'janux';
import { runCases } from '../support/scenario';
import { act, captureWarns, island, render, type Intents } from './harness';
import { MARKER_WIRE_CASES, type WireRow } from './markers-wire.cases';

/** The attributes of the first `<tag …>` in `html` — everything the marker rules produced. */
function attrsOf(html: string, tag: string): string {
  const match = new RegExp(`<${tag}([^>]*?)/?>`).exec(html);

  if (!match) throw new Error(`no <${tag}> in ${html}`);

  return match[1]!;
}

async function renderRow(row: WireRow): Promise<{ attrs: string; warns: string[] }> {
  const tag = row.tag ?? 'b';
  const warns = captureWarns();
  const def = island({
    intents: { go: act({ run: () => undefined }), other: act({ run: () => undefined }) },
    view: ({ intents }) => jsx(tag, row.props(intents as unknown as Intents)),
  });
  const html = await render(def);

  return { attrs: attrsOf(html, tag), warns: warns.taken() };
}

describe('event marker wire format conformance', () => {
  runCases(MARKER_WIRE_CASES, async (row) => {
    const { attrs, warns } = await renderRow(row);

    expect(attrs).toBe(row.expected);
    expect(warns).toEqual(row.warns ?? []);
  });
});
