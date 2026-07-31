/**
 * The CSP nonce this document was served with.
 *
 * It is captured once, at boot, and never re-read — which is the whole point.
 * Every response carries a FRESH nonce, but the policy governing the live
 * document is the one that arrived with it, so a script or style the navigation
 * diff brings in carries a value this document's CSP does not accept. The
 * runtime therefore stamps its own captured nonce on anything it (re-)creates
 * instead of trusting the markup it was handed.
 *
 * `.nonce` before `getAttribute('nonce')`: browsers blank the content attribute
 * once the element is parsed (nonce hiding) so injected markup cannot scrape it
 * back out of the DOM, and only the IDL property still holds the real value.
 * The attribute is the fallback for DOMs that do not implement that property.
 */

let captured = '';

/** Called by `boot()` before anything can navigate. */
export function captureNonce(doc: Document = document): void {
  const source = doc.querySelector<HTMLScriptElement>('script[nonce]');

  captured = source?.nonce || source?.getAttribute('nonce') || '';
}

/** Empty for an app that does not use CSP. */
export function currentNonce(): string {
  return captured;
}

/**
 * Stamps this document's nonce on a tag the runtime created — a re-run script,
 * the narrowed speculation rules, the agent-glow stylesheet. A no-op without
 * CSP, so an app that does not use it gets the same DOM it always did.
 *
 * `setAttribute`, not `.nonce`: the IDL property is not implemented by every
 * DOM the suite runs on, and the attribute is what browsers read into the
 * internal slot when the element is inserted.
 */
export function applyNonce(el: Element): void {
  if (captured) el.setAttribute('nonce', captured);
}
