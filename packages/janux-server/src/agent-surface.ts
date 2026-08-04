import { type Ctx, type GuardValue } from 'janux';
import { resolveApiGuard, type ApiTool } from './api';

/**
 * What every hosted agent endpoint shares: who may connect, and what they may
 * be told exists.
 *
 * `/_janux/mcp` and `/_janux/a2a` are two protocols over one app. If each
 * carried its own copy of "which tools does this caller see" or "is this token
 * good", the cheaper copy would eventually be the way in — an agent speaking
 * the protocol nobody hardened would hold more authority than one speaking the
 * other. There is one copy, here, and both endpoints call it.
 */

export interface HostedAuth {
  /** Verifies a bearer token; null → 401 with WWW-Authenticate. */
  verify(token: string, req: Request): Promise<unknown | null> | unknown | null;
  /** Advertised in WWW-Authenticate resource metadata. */
  resourceMetadataUrl?: string;
}

/**
 * What this caller may be told exists — the same answer `apiManifestTools`
 * gives the app's own pages.
 *
 * Listing every tool and refusing the forbidden ones at call time is not a
 * gate: the name, the description and the input schema of a tool an agent may
 * never call were handed to it anyway, which is exactly what `forbidden`
 * exists to prevent. The guard is resolved once per listing, like
 * `apiManifestTools` and `toolsFor` do it, so a guard that answers differently
 * on each call cannot pass the filter and then be advertised as forbidden.
 */
export function callableTools(tools: ApiTool[], ctx: Ctx): { tool: ApiTool; guard: GuardValue }[] {
  return tools
    .map((tool) => ({ tool, guard: resolveApiGuard(tool, ctx, 'agent') }))
    .filter(({ guard }) => guard !== 'forbidden');
}

/** The 401 an unauthenticated caller gets, whichever protocol it was speaking. */
export function unauthorized(realm: string, auth?: HostedAuth): Response {
  const metadata = auth?.resourceMetadataUrl ? `, resource_metadata="${auth.resourceMetadataUrl}"` : '';

  return new Response(null, {
    status: 401,
    headers: { 'www-authenticate': `Bearer realm="${realm}"${metadata}` },
  });
}

/**
 * The bearer check itself: absent config ⇒ open, a bad token ⇒ the 401, a good
 * one ⇒ the verified identity lands on the ctx the pipeline will see.
 */
export async function refuseUnauthenticated(req: Request, ctx: Ctx, realm: string, auth?: HostedAuth): Promise<Response | undefined> {
  if (!auth) return undefined;
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const identity = token ? await auth.verify(token, req) : null;

  if (!identity) return unauthorized(realm, auth);
  // `mcpIdentity` whichever protocol verified it: the name is documented and
  // apps read it in `ctxFor`, so A2A joins it rather than minting a second key
  // that would have to be checked separately by every app that scopes on it.
  (ctx as any).mcpIdentity = identity;

  return undefined;
}
