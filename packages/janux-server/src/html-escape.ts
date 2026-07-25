/** Escaping shared by the HTML shell and the head tags it embeds. */

export function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function safeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
