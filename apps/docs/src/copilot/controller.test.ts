import { describe, expect, it } from 'bun:test';
import { NAV_INTENT, renderMarkdown, stripThink } from './controller';

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

describe('NAV_INTENT', () => {
  it('matches explicit navigation requests in Spanish and English', () => {
    ['navega a CLI and deployment', 'abre la página de schema', 'go to the tutorial', 'llévame a recipes'].forEach(
      (question) => expect(NAV_INTENT.test(question)).toBe(true),
    );
  });

  it('does not match plain questions, even ones mentioning navigation verbs', () => {
    [
      'How do I define api()?',
      '¿Qué es un island?',
      'show me an example of api()',
      'what happens when I open the panel?',
      'does SPA go to the server on navigation?',
    ].forEach((question) => expect(NAV_INTENT.test(question)).toBe(false));
  });
});

describe('renderMarkdown', () => {
  it('renders bold, code and tables as HTML', () => {
    const html = renderMarkdown('**Bold** and `api()`\n\n| a | b |\n| - | - |\n| 1 | 2 |');

    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<code>api()</code>');
    expect(html).toContain('<table>');
  });

  it('strips scripts, event handlers and javascript: urls', () => {
    const html = renderMarkdown('hi <script>alert(1)</script> <a href="javascript:x" onclick="y()">link</a>');

    expect(html).not.toContain('<script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');
  });
});
