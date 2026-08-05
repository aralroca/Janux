/**
 * MCP 2026-07-28 "modern era" helpers (SEP-2575): per-request version gate,
 * mirrored-header validation and result decoration. Legacy requests (any
 * pre-2026 version, or no version at all) bypass the gate untouched — the
 * endpoint is dual-era and keeps the `initialize` handshake for old clients.
 */

export const SUPPORTED_VERSIONS = ['2026-07-28', '2025-06-18'];

const MODERN_FLOOR = '2026-07-28';
const META = 'io.modelcontextprotocol/';
/** Methods whose Mcp-Name header mirrors a body field. */
const NAMED_FIELD: Record<string, string> = { 'tools/call': 'name', 'resources/read': 'uri' };
const CACHEABLE = new Set(['server/discover', 'tools/list', 'resources/list', 'resources/read']);
const CACHE_TTL_MS = 60_000;

export interface RpcShape {
  method: string;
  params?: any;
}

export interface ModernError {
  code: number;
  message: string;
  data?: unknown;
}

/** undefined → proceed (legacy or valid modern); otherwise answer 400 with this error. */
export function modernGate(rpc: RpcShape, headers: Headers): ModernError | undefined {
  const requested = headers.get('mcp-protocol-version') ?? rpc.params?._meta?.[`${META}protocolVersion`];

  if (!requested || requested < MODERN_FLOOR) return undefined;
  if (!SUPPORTED_VERSIONS.includes(requested)) {
    return { code: -32022, message: 'Unsupported protocol version', data: { supported: SUPPORTED_VERSIONS, requested } };
  }

  return headerMismatch(rpc, headers);
}

function headerMismatch(rpc: RpcShape, headers: Headers): ModernError | undefined {
  const namedField = NAMED_FIELD[rpc.method];
  const mismatch =
    headers.get('mcp-protocol-version') !== rpc.params?._meta?.[`${META}protocolVersion`] ||
    headers.get('mcp-method') !== rpc.method ||
    (namedField !== undefined && decodeSentinel(headers.get('mcp-name')) !== rpc.params?.[namedField]);

  return mismatch ? { code: -32020, message: 'Header mismatch' } : undefined;
}

/** `=?base64?{utf8}?=` — the value encoding for header-unsafe Mcp-Name values. */
function decodeSentinel(value: string | null): string | null {
  const encoded = value?.match(/^=\?base64\?(.+)\?=$/)?.[1];

  if (!encoded) return value;
  try {
    const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));

    return new TextDecoder().decode(bytes);
  } catch {
    // Malformed base64 must reject as a mismatch (400), never crash the request.
    return null;
  }
}

/** Whether this request is speaking the modern era at all — the gate has already agreed it is consistent. */
export function isModern(rpc: RpcShape, headers: Headers): boolean {
  const requested = headers.get('mcp-protocol-version') ?? rpc.params?._meta?.[`${META}protocolVersion`];

  return typeof requested === 'string' && requested >= MODERN_FLOOR;
}

/**
 * `subscribe` is advertised here and nowhere else: `subscriptions/listen` is a
 * 2026-07-28 method, and the legacy `initialize` next door must keep answering
 * with the capabilities that era can actually use — it never had this one, and
 * `resources/subscribe` is not implemented.
 */
export function discoverResult(): Record<string, unknown> {
  return { supportedVersions: SUPPORTED_VERSIONS, capabilities: { tools: {}, resources: { subscribe: true } } };
}

/** serverInfo on every result (SHOULD) + the mandatory CacheableResult fields. */
export function decorateResult(
  method: string,
  result: Record<string, unknown>,
  serverName: string,
  isPrivate: boolean,
): Record<string, unknown> {
  const cacheable = CACHEABLE.has(method)
    ? { ttlMs: CACHE_TTL_MS, cacheScope: isPrivate ? 'private' : 'public' }
    : undefined;

  return {
    ...result,
    ...cacheable,
    // `complete` unless the handler already said otherwise: an `input_required`
    // answer overwritten here would tell the client the call was done.
    resultType: result.resultType ?? 'complete',
    _meta: { [`${META}serverInfo`]: { name: serverName, version: '1' } },
  };
}
