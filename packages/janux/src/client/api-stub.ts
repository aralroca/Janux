/**
 * Client stub for an api() server function (~100 bytes once bundled).
 * The compiler swaps `*.api.ts` imports for these in client bundles.
 */
export function clientApi(name: string): (input?: unknown) => Promise<unknown> {
  return async (input?: unknown) => {
    const response = await fetch(`/_janux/api/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input ?? {}),
    });
    const body: any = await response.json();

    if (!body.ok) throw new Error(body.error ?? `api ${name} failed`);

    return body.result;
  };
}
