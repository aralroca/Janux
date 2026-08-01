import { jsx } from 'janux';
import type { TreeRow } from '../support/html';

/**
 * The executable-URL guard observed from the outside: what an element looks
 * like once its poisoned attribute is gone. `security/urls.cases.ts` asserts
 * the attribute level; these rows pin that the element itself survives —
 * children intact, siblings intact, markers intact — because dropping the
 * node (or throwing) would turn a defused attack into a denial of service.
 */
const u = 'javascript:alert(1)';

export const URL_INTEGRATION_CASES: TreeRow[] = [
  { id: 'elurl-anchor-keeps-its-text-without-the-href', src: 'react:UntrustedURL#anchor', node: () => jsx('a', { href: u, children: 'x' }), expected: '<a>x</a>' },
  { id: 'elurl-img-still-self-closes', src: 'react:UntrustedURL#img-src', node: () => jsx('img', { src: u }), expected: '<img/>' },
  { id: 'elurl-iframe-loses-only-its-src', src: 'janux', node: () => jsx('iframe', { src: u, title: 'frame' }), expected: '<iframe title="frame"></iframe>' },
  { id: 'elurl-form-keeps-its-method-without-the-action', src: 'janux', node: () => jsx('form', { method: 'post', action: u }), expected: '<form method="post"></form>' },
  { id: 'elurl-script-keeps-no-source', src: 'janux', node: () => jsx('script', { src: u }), expected: '<script></script>' },
  { id: 'elurl-embed-still-self-closes', src: 'janux', node: () => jsx('embed', { src: u, type: 'image/svg+xml' }), expected: '<embed type="image/svg+xml"/>' },
  { id: 'elurl-object-loses-its-data', src: 'janux', node: () => jsx('object', { data: u, children: 'fallback' }), expected: '<object>fallback</object>' },
  { id: 'elurl-video-loses-its-poster', src: 'janux', node: () => jsx('video', { poster: u, controls: true }), expected: '<video controls></video>' },
  { id: 'elurl-audio-loses-its-src', src: 'janux', node: () => jsx('audio', { src: u }), expected: '<audio></audio>' },
  { id: 'elurl-track-loses-its-src', src: 'janux', node: () => jsx('track', { kind: 'captions', src: u }), expected: '<track kind="captions"/>' },
  { id: 'elurl-anchor-ping-is-blocked-while-href-survives', src: 'janux', node: () => jsx('a', { href: '/ok', ping: u, children: 'x' }), expected: '<a href="/ok">x</a>' },
  { id: 'elurl-blockquote-cite-is-blocked', src: 'janux', node: () => jsx('blockquote', { cite: u, children: 'q' }), expected: '<blockquote>q</blockquote>' },
  { id: 'elurl-td-legacy-background-is-blocked', src: 'janux', node: () => jsx('td', { background: u, children: 'x' }), expected: '<td>x</td>' },
  { id: 'elurl-button-formaction-is-blocked', src: 'janux', node: () => jsx('button', { formaction: u, children: 'Pay' }), expected: '<button>Pay</button>' },
  { id: 'elurl-input-camel-formaction-is-blocked', src: 'janux', node: () => jsx('input', { type: 'submit', formAction: u }), expected: '<input type="submit"/>' },
  { id: 'elurl-anchor-keeps-its-intent-marker', src: 'janux', node: () => jsx('a', { href: u, onClick: { $intent: { component: 'nav', name: 'go' } }, children: 'x' }), expected: '<a data-jxa="nav:go">x</a>' },
  { id: 'elurl-mailto-with-query-is-escaped-not-blocked', src: 'janux', node: () => jsx('a', { href: 'mailto:a@b.com?subject=hi&body=x', children: 'mail' }), expected: '<a href="mailto:a@b.com?subject=hi&amp;body=x">mail</a>' },
  { id: 'elurl-only-the-poisoned-sibling-attribute-is-dropped', src: 'janux', node: () => jsx('a', { id: 'l1', href: u, class: 'c', children: 'x' }), expected: '<a id="l1" class="c">x</a>' },
];
