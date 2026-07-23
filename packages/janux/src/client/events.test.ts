import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { component, intent } from '../define/factories';
import { jsx } from '../jsx-runtime';
import { bool, schema, str } from '../schema';
import { renderToString } from '../render/server';
import { boot, type JanuxClient } from './boot';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const commits: string[] = [];

const search = component({
  name: 'search',
  state: schema({ q: str().default(''), lastKey: str().default(''), focused: bool().default(false) }),
  intents: {
    setQ: intent({
      input: schema({ value: str() }),
      run: ({ state, input }) => {
        commits.push(input.value as string);
        state.q = input.value;
      },
    }),
    onKey: intent({
      input: schema({ key: str() }),
      run: ({ state, input }) => (state.lastKey = input.key),
    }),
    setFocused: intent({
      input: schema({ focused: bool().default(true) }),
      run: ({ state, input }) => (state.focused = input.focused),
    }),
  },
  view: ({ state, intents }: any) =>
    jsx('div', {
      children: [
        jsx('input', {
          class: 'q',
          value: state.q,
          onInput: intents.setQ,
          onKeyDown: intents.onKey,
          onFocus: intents.setFocused,
        }),
        jsx('output', { children: `q=${state.q} key=${state.lastKey}` }),
      ],
    }),
});

async function serveAndBoot(): Promise<JanuxClient> {
  const { html, snapshots } = await renderToString(jsx(search as any, {}), {});
  const scripts = snapshots
    .map(
      (snap) =>
        `<script type="application/janux+state" data-uri="${snap.uri}">${JSON.stringify({ state: snap.state, sources: snap.sources ?? {} })}</script>`,
    )
    .join('');

  document.body.innerHTML = html + scripts;

  return boot({ defs: [search] });
}

function fireInput(el: HTMLInputElement, value: string, isComposing = false): void {
  el.value = value;
  const event = new Event('input', { bubbles: true });

  Object.defineProperty(event, 'isComposing', { value: isComposing });
  el.dispatchEvent(event);
}

describe('rich delegated events', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    commits.length = 0;
  });

  it('SSR emits data-jxe-* markers instead of eager listeners', async () => {
    const { html } = await renderToString(jsx(search as any, {}), {});

    expect(html).toContain('data-jxe-input="search#default:setQ"');
    expect(html).toContain('data-jxe-keydown="search#default:onKey"');
    expect(html).toContain('data-jxe-focusin="search#default:setFocused"');
  });

  it('onInput resolves to the intent with { value } from the control', async () => {
    const client = await serveAndBoot();
    const input = document.querySelector('.q') as HTMLInputElement;

    fireInput(input, 'didit');
    await client.settled();
    expect(document.querySelector('output')!.textContent).toContain('q=didit');
  });

  it('suppresses input events mid-IME-composition and flushes on compositionend', async () => {
    const client = await serveAndBoot();
    const input = document.querySelector('.q') as HTMLInputElement;

    fireInput(input, 'にほ', true);
    await client.settled();
    expect(document.querySelector('output')!.textContent).toContain('q= ');

    const end = new Event('compositionend', { bubbles: true });

    input.value = 'にほん';
    input.dispatchEvent(end);
    await client.settled();
    expect(document.querySelector('output')!.textContent).toContain('q=にほん');
  });

  it('WebKit-order IME (compositionend then input) commits exactly once', async () => {
    const client = await serveAndBoot();
    const input = document.querySelector('.q') as HTMLInputElement;

    input.value = 'にほん';
    input.dispatchEvent(new Event('compositionend', { bubbles: true }));
    await client.settled();
    fireInput(input, 'にほん');
    await client.settled();
    expect(commits).toEqual(['にほん']);
  });

  it('onKeyDown delivers keyboard facts to the intent', async () => {
    const client = await serveAndBoot();
    const input = document.querySelector('.q') as HTMLInputElement;

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await client.settled();
    expect(document.querySelector('output')!.textContent).toContain('key=Enter');
  });

  it('controlled input: agent-driven state change writes the DOM value when unfocused', async () => {
    const client = await serveAndBoot();
    const input = document.querySelector('.q') as HTMLInputElement;

    fireInput(input, 'x');
    await client.settled();
    await client.call('search.setQ', { value: 'from-agent' });
    await client.settled();
    expect(input.value).toBe('from-agent');
  });
});
