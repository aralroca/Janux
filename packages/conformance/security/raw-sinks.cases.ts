import { jsx } from 'janux';
import type { TreeRow } from '../support/html';

/**
 * Sinks where HTML escaping is not a defence, pinned so they are known rather
 * than discovered.
 *
 * `dangerHTML` says so in its name. `srcdoc` does not: its value *is* escaped in
 * the attribute, and the browser then un-escapes it and parses the result as an
 * HTML document in the parent's origin — so escaping is the correct way to pass
 * markup through it, and provides no protection at all.
 *
 * Both are left working on purpose. Unlike a `javascript:` URL, there is no
 * signal that separates a safe value from a hostile one, so blocking them would
 * remove a real capability rather than close a hole. What the corpus can do is
 * make the behaviour explicit.
 */
export const RAW_SINK_CASES: TreeRow[] = [
  {
    id: 'sink-dangerhtml-injects-markup-verbatim',
    src: 'janux',
    node: () => jsx('div', { dangerHTML: '<img src=x onerror=alert(1)>' }),
    expected: '<div><img src=x onerror=alert(1)></div>',
  },
  {
    id: 'sink-dangerhtml-can-emit-a-script-tag',
    src: 'janux',
    node: () => jsx('div', { dangerHTML: '<script>alert(1)</script>' }),
    expected: '<div><script>alert(1)</script></div>',
  },
  {
    id: 'sink-dangerhtml-can-close-its-own-element',
    src: 'janux',
    node: () => jsx('div', { dangerHTML: '</div><b>escaped</b>' }),
    expected: '<div></div><b>escaped</b></div>',
  },
  {
    id: 'sink-srcdoc-is-escaped-in-the-attribute-and-still-a-document',
    src: 'janux',
    node: () => jsx('iframe', { srcdoc: '<script>alert(1)</script>' }),
    expected: '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>',
  },
  {
    id: 'sink-srcdoc-quotes-are-escaped-so-it-cannot-break-out-of-the-attribute',
    src: 'janux',
    node: () => jsx('iframe', { srcdoc: '"><script>alert(1)</script>' }),
    expected: '<iframe srcdoc="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>',
  },
  {
    id: 'sink-srcdoc-is-not-a-url-attribute-so-a-scheme-is-not-blocked',
    src: 'janux',
    node: () => jsx('iframe', { srcdoc: 'javascript:alert(1)' }),
    expected: '<iframe srcdoc="javascript:alert(1)"></iframe>',
  },
];
