/**
 * Wire level of the outbound MCP client: one JSON-RPC message per POST, in
 * either era — modern (2026-07-28 per-request `_meta` + mirrored `Mcp-*`
 * headers, SEP-2575/2243) or legacy (bare params, `initialize`-negotiated).
 */

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface WireOptions {
  url: string;
  token?: string;
  fetchImpl?: FetchLike;
}

export interface RpcInit {
  modern: boolean;
  paramHeaders?: Record<string, string>;
}

export const MODERN_VERSION = '2026-07-28';
export const CLIENT_INFO = { name: 'janux-agent', version: '1' };

const META = 'io.modelcontextprotocol/';
/** Modern-era JSON-RPC errors: HeaderMismatch, UnsupportedProtocolVersion. */
const MODERN_CODES = new Set([-32020, -32022]);

let rpcSeq = 0;

export async function rpc(options: WireOptions, method: string, params: unknown, init: RpcInit): Promise<any> {
  const doFetch: FetchLike = options.fetchImpl ?? ((url, request) => fetch(url, request));
  const response = await doFetch(options.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(init.modern ? { ...modernHeaders(method, params), ...init.paramHeaders } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: (rpcSeq += 1),
      method,
      params: init.modern ? modernParams(params) : params,
    }),
  });

  if (!response.ok) throw await httpError(response);
  const type = response.headers.get('content-type') ?? '';
  const payload = type.includes('text/event-stream') ? parseSseJson(await response.text()) : await response.json();

  if (payload?.error) throw new Error(`mcp_error_${payload.error.code}: ${payload.error.message}`);

  return payload?.result;
}

function modernHeaders(method: string, params: unknown): Record<string, string> {
  const name = method === 'tools/call' ? (params as { name?: string })?.name : undefined;

  return {
    'mcp-protocol-version': MODERN_VERSION,
    'mcp-method': method,
    ...(name ? { 'mcp-name': encodeHeaderValue(name) } : {}),
  };
}

function modernParams(params: unknown): Record<string, unknown> {
  return {
    ...((params as Record<string, unknown>) ?? {}),
    _meta: {
      [`${META}protocolVersion`]: MODERN_VERSION,
      [`${META}clientInfo`]: CLIENT_INFO,
      [`${META}clientCapabilities`]: {},
    },
  };
}

/** Value encoding: plain ASCII as-is, anything unsafe as `=?base64?{utf8}?=`. */
export function encodeHeaderValue(value: unknown): string {
  const text = String(value);
  const safe = /^[\x21-\x7e]([\x20-\x7e]*[\x21-\x7e])?$/.test(text) && !text.startsWith('=?');

  if (safe) return text;

  return `=?base64?${btoa(String.fromCharCode(...new TextEncoder().encode(text)))}?=`;
}

async function httpError(response: Response): Promise<Error> {
  const payload = await response.json().catch(() => undefined);
  const error = new Error(`mcp_http_${response.status}`) as Error & { status: number; rpcCode?: number };

  error.status = response.status;
  error.rpcCode = payload?.error?.code;

  return error;
}

/** A 400 whose body is not a recognized modern error identifies a legacy server. */
export function isLegacySignal(error: unknown): boolean {
  const { status, rpcCode } = error as { status?: number; rpcCode?: number };

  return status === 400 && !MODERN_CODES.has(rpcCode ?? 0);
}

/** Streamable-HTTP servers may answer a single JSON-RPC response as one SSE event. */
function parseSseJson(text: string): any {
  const data = text
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('');

  return data ? JSON.parse(data) : undefined;
}
