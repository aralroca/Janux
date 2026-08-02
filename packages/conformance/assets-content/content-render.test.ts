import { describe, expect } from 'bun:test';
import { render } from '../../janux-content/src/render';
import { jsx } from '../../janux/src/jsx-runtime';
import { renderToString } from '../../janux/src/render/server';
import { runCases } from '../support/scenario';
import { RENDER_CASES, RENDER_ERROR_CASES } from './content-render.cases';

/** The two scopes a row may ask for: a component to mount, or an element to override. */
const SCOPES = {
  widget: { Widget: (props: Record<string, unknown>) => jsx('span', { class: 'w', children: props.name }) },
  h2: { h2: (props: Record<string, unknown>) => jsx('h2', { ...props, class: 'custom' }) },
};

/** Bodies are keyed by `format:body`, so a unique marker keeps rows from sharing a compilation. */
const file = (id: string, format: string) => `/virtual/${id}.${format}`;

describe('content rendering', () =>
  runCases(RENDER_CASES, async (row) => {
    const { Content, headings } = await render(
      { body: row.body, format: row.format, file: file(row.id, row.format) },
      { components: row.components ? SCOPES[row.components] : undefined },
    );
    const { html } = await renderToString(Content());

    expect(html).toBe(row.expected);
    expect(headings).toEqual(row.headings ?? []);
  }));

describe('content compile failures', () =>
  runCases(RENDER_ERROR_CASES, async (row) => {
    const attempt = async () => {
      const { Content } = await render(
        { body: row.body, format: row.format, file: file(row.id, row.format) },
        { components: row.components ? SCOPES[row.components] : undefined },
      );

      await renderToString(Content());
    };

    expect(attempt()).rejects.toThrow(row.expected);
  }));
