/** Escaping shared by the HTML shell and the head tags it embeds. */

export function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function safeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * The CSP nonce attribute for an inline tag, or nothing when the app does not
 * use CSP — which is what keeps an unconfigured app's HTML byte-identical.
 *
 * Mirrored in the renderer's render/html.ts, which escapes with `escapeHtml`.
 */
export function nonceAttr(nonce: string | undefined): string {
  return nonce ? ` nonce="${safeAttr(nonce)}"` : '';
}
