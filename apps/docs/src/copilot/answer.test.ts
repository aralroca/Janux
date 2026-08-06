import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, describe, expect, it } from 'bun:test';

GlobalRegistrator.register({ url: 'https://janux.build/' });

const { askStream, stripThink } = await import('./answer');

afterAll(() => GlobalRegistrator.unregister());

/** A copilot whose run emits exactly these chunks. */
function streamOf(chunks: unknown[]): any {
  return {
    stream: () =>
      new ReadableStream({
        start(controller) {
          chunks.forEach((chunk) => controller.enqueue(chunk));
          controller.close();
        },
      }),
  };
}

const silent = { onText: () => undefined, onTool: () => undefined };

describe('askStream', () => {
  it('reports a transport failure as a failure, not as a gap in the docs', async () => {
    const answer = await askStream(
      streamOf([{ type: 'start' }, { type: 'error', errorText: 'janux: /_janux/llm returned 429' }]),
      silent,
    );

    expect(answer.outcome).toBe('failed');
    expect(answer.text).toContain('429');
    expect(answer.text).not.toContain('could not find an answer');
  });

  it('shows a refusal in the mount\'s own words, with its variable names intact', async () => {
    const message =
      'No model configured. Set JANUX_MODEL="provider/model" or one provider API key (OPENROUTER_API_KEY).';
    const answer = await askStream(streamOf([{ type: 'error', errorText: `Error: ${message}` }]), silent);

    // No preamble, no code block, and markdown must not eat the underscores.
    expect(answer.html).toContain('JANUX_MODEL');
    expect(answer.html).toContain('OPENROUTER_API_KEY');
    expect(answer.html).not.toContain('Error:');
    expect(answer.html).not.toContain('<em>');
  });

  it('marks a stopped run as stopped, keeping whatever had arrived', async () => {
    const answer = await askStream(
      streamOf([
        { type: 'text-delta', delta: 'An intent is' },
        { type: 'abort' },
      ]),
      silent,
    );

    expect(answer.outcome).toBe('stopped');
    expect(answer.text).toBe('An intent is\n\n*(stopped)*');
  });

  it('never claims the docs lack an answer just because the user pressed stop', async () => {
    const answer = await askStream(streamOf([{ type: 'abort' }]), silent);

    expect(answer.text).toBe('*(stopped)*');
  });

  it('hides the model reasoning while it streams, not only at the end', async () => {
    const painted: string[] = [];
    const answer = await askStream(
      streamOf([
        { type: 'text-delta', delta: '<think>searching the' },
        { type: 'text-delta', delta: ' docs</think>Islands' },
        { type: 'text-delta', delta: ' resume lazily.' },
      ]),
      { onText: (markdown) => painted.push(markdown), onTool: () => undefined },
    );

    expect(painted.every((text) => !text.includes('think'))).toBe(true);
    expect(painted.every((text) => !text.includes('searching'))).toBe(true);
    expect(answer.text).toBe('Islands resume lazily.');
    expect(answer.outcome).toBe('answered');
  });

  it('falls back to "not in the docs" only for an empty, successful run', async () => {
    const answer = await askStream(streamOf([{ type: 'start' }, { type: 'finish' }]), silent);

    expect(answer.outcome).toBe('answered');
    expect(answer.text).toContain('could not find an answer');
  });

  it('keeps each turn its own paragraph', async () => {
    const answer = await askStream(
      streamOf([
        { type: 'text-start', id: 't0' },
        { type: 'text-delta', delta: 'Let me look that up in the guards page' },
        { type: 'text-end', id: 't0' },
        { type: 'text-start', id: 't0' },
        { type: 'text-delta', delta: 'An intent is a named action.' },
      ]),
      silent,
    );

    expect(answer.text).toBe('Let me look that up in the guards page\n\nAn intent is a named action.');
    expect(answer.html).toContain('</p>');
  });

  it('drops a guess the tool went on to disprove', async () => {
    const answer = await askStream(
      streamOf([
        { type: 'text-start', id: 't0' },
        { type: 'text-delta', delta: 'The counter is back to zero.' },
        { type: 'text-end', id: 't0' },
        // No `tool-input-available`: several providers only ever send the output.
        { type: 'tool-output-available', toolCallId: 'c1', output: { approved: true } },
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', delta: 'You approved it, so it ran: count is 0.' },
      ]),
      silent,
    );

    // Both sentences used to stay, the wrong one first — the reader got to read
    // the model contradicting itself about what it had just done.
    expect(answer.text).toBe('You approved it, so it ran: count is 0.');
  });

  it('keeps the narration when the run ends before answering', async () => {
    const answer = await askStream(
      streamOf([
        { type: 'text-start', id: 't0' },
        { type: 'text-delta', delta: 'Calling the reset tool now.' },
        { type: 'tool-input-available', toolName: 'playground_counter_reset' },
      ]),
      silent,
    );

    expect(answer.text).toBe('Calling the reset tool now.');
  });

  it('announces the tool that is running', async () => {
    const tools: string[] = [];

    await askStream(
      streamOf([{ type: 'tool-input-available', toolName: 'search_docs' }, { type: 'text-delta', delta: 'ok' }]),
      { onText: () => undefined, onTool: (name) => tools.push(name) },
    );

    expect(tools).toEqual(['search_docs']);
  });
});

describe('stripThink', () => {
  it('removes closed think blocks', () => {
    expect(stripThink('<think>\nplanning…\n</think>\n\nThe answer.')).toBe('The answer.');
  });

  it('removes an unclosed trailing think block (truncated generation)', () => {
    expect(stripThink('Partial answer.\n<think>ran out of tok')).toBe('Partial answer.');
  });

  it('leaves plain text untouched', () => {
    expect(stripThink('Just an answer.')).toBe('Just an answer.');
  });
});
