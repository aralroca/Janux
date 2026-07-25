import type { Case } from '../support/case';

/**
 * Executable URL schemes in URL-bearing attributes.
 *
 * Escaping cannot help here: `javascript:alert(1)` contains nothing an HTML
 * escaper would touch, yet following the link runs it. Janux is agent-native, so
 * this is not only a "don't interpolate user input" problem — a tool call can
 * write a URL into state and a human clicks it later, and guards gate which
 * intent may run rather than what the value it stores says.
 *
 * Payloads follow `react:ReactDOMServerIntegrationUntrustedURL` plus the
 * obfuscations browsers are known to tolerate (case, embedded control
 * characters, leading whitespace).
 */
export interface UrlCase {
  attr: string;
  value: string;
  /** Whether the attribute must survive into the markup. */
  allowed: boolean;
}

export type UrlRow = Case<UrlCase>;

/** Every attribute the browser resolves as a URL. */
const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'poster', 'cite', 'data', 'ping', 'background'];

const BLOCKED = [
  ['plain', 'javascript:alert(1)'],
  ['uppercase', 'JAVASCRIPT:alert(1)'],
  ['mixed-case', 'JaVaScRiPt:alert(1)'],
  ['leading-space', ' javascript:alert(1)'],
  ['leading-tab', '\tjavascript:alert(1)'],
  ['leading-newline', '\njavascript:alert(1)'],
  ['leading-cr', '\rjavascript:alert(1)'],
  ['leading-nul', '\u0000javascript:alert(1)'],
  ['embedded-tab', 'java\tscript:alert(1)'],
  ['embedded-newline', 'java\nscript:alert(1)'],
  ['embedded-nul', 'java\u0000script:alert(1)'],
  ['embedded-vertical-tab', 'java\u000Bscript:alert(1)'],
  ['embedded-form-feed', 'java\u000Cscript:alert(1)'],
  ['vbscript', 'vbscript:msgbox(1)'],
  ['livescript', 'livescript:alert(1)'],
  ['mocha', 'mocha:alert(1)'],
  ['data-html', 'data:text/html,<script>alert(1)</script>'],
  ['data-html-base64', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
  ['data-svg', 'data:image/svg+xml,<svg onload="alert(1)"/>'],
  ['data-xhtml', 'data:application/xhtml+xml,<html/>'],
  ['data-xml', 'data:text/xml,<x/>'],
] as const;

const ALLOWED = [
  ['relative-root', '/ok'],
  ['relative-path', 'ok/page'],
  ['absolute-https', 'https://example.com/x'],
  ['absolute-http', 'http://example.com/x'],
  ['protocol-relative', '//example.com/x'],
  ['hash-only', '#section'],
  ['query-only', '?q=1'],
  ['mailto', 'mailto:a@b.com'],
  ['tel', 'tel:+34600000000'],
  ['data-png', 'data:image/png;base64,iVBORw0KGgo='],
  ['data-plain-text', 'data:text/plain,hello'],
  ['blob', 'blob:https://example.com/uuid'],
  ['empty', ''],
  ['scheme-word-inside-a-path', '/docs/javascript:guide'],
  ['query-mentioning-the-scheme', '/search?q=javascript:alert(1)'],
  ['hash-mentioning-the-scheme', '/page#javascript:alert(1)'],
] as const;

/**
 * The cross product is the point: each attribute is a separate code path in
 * `propToAttr`, and a payload blocked in `href` but not in `formaction` is
 * exactly the kind of hole a partial fix leaves behind.
 */
export const URL_SCHEME_CASES: UrlRow[] = URL_ATTRS.flatMap((attr) => [
  ...BLOCKED.map(([label, value]) => ({
    id: `url-${attr}-blocks-${label}`,
    src: 'react:UntrustedURL#javascript-protocol',
    attr,
    value,
    allowed: false,
  })),
  ...ALLOWED.map(([label, value]) => ({
    id: `url-${attr}-allows-${label}`,
    src: 'react:UntrustedURL#safe-url',
    attr,
    value,
    allowed: true,
  })),
]);
