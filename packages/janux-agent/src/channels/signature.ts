/**
 * What it takes to trust an inbound webhook, with WebCrypto and nothing else.
 *
 * Slack signs with HMAC-SHA256 and Discord with Ed25519; both are in the
 * platform, so neither adapter needs a vendor SDK — which is the whole reason
 * channels can ship in core without dragging a dependency in behind them.
 */

const encoder = new TextEncoder();

export function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Lowercase hex → bytes. Junk yields an empty array, which never verifies. */
export function fromHex(value: string): Uint8Array<ArrayBuffer> {
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(value)) return new Uint8Array();

  return Uint8Array.from(value.match(/../g)!, (byte) => parseInt(byte, 16));
}

/**
 * Compares without leaking where the first difference is. `reduce` rather than
 * `every` on purpose: a short-circuiting comparison is the timing side channel
 * this function exists to close.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;

  return [...a].reduce((diff, char, index) => diff | (char.charCodeAt(0) ^ b.charCodeAt(index)), 0) === 0;
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

/** Ed25519 over `timestamp + body`. A malformed key or signature is a failed check, never a throw. */
export async function verifyEd25519(publicKey: string, signature: string, message: string): Promise<boolean> {
  const key = fromHex(publicKey);
  const bytes = fromHex(signature);

  if (key.length === 0 || bytes.length === 0) return false;

  return crypto.subtle
    .importKey('raw', key, { name: 'Ed25519' }, false, ['verify'])
    .then((imported) => crypto.subtle.verify({ name: 'Ed25519' }, imported, bytes, encoder.encode(message)))
    .catch(() => false);
}

/** A refusal the transport can read, in the shape every channel answers with. */
export function refuse(status: number, error: string): Response {
  return Response.json({ error }, { status });
}
