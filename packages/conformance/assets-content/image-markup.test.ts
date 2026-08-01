import { describe, expect } from 'bun:test';
import { Image } from '../../janux/src/image/image';
import { jsx } from '../../janux/src/jsx-runtime';
import { renderToString } from '../../janux/src/render/server';
import { runCases } from '../support/scenario';
import { IMAGE_MARKUP_CASES } from './image-markup.cases';

describe('<Image> markup', () =>
  runCases(IMAGE_MARKUP_CASES, async (row) => {
    const { html } = await renderToString(jsx(Image, { ...row.props } as Record<string, unknown>));

    expect(html).toBe(row.expected);
  }));
