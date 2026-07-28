/**
 * Browser side of streaming suspense. The server serializes `unsuspense` into
 * the first completion chunk (`UNSUSPENSE_RUNTIME`, ~0.7 KB unminified, no
 * extra request), and every boundary chunk then calls `jx$u(key, currentScript)`.
 *
 * The pending set is the piece that makes nesting work: a boundary whose host
 * still sits inside another boundary's inert `<template>` cannot swap yet, so
 * it stays queued and every later call sweeps the whole set — the call that
 * reveals the outer boundary is the one that completes the inner. The call
 * script removes itself unconditionally: an executed-but-pending call must not
 * survive in the DOM, or the navigation diff would morph the next page's call
 * into it in place and never execute the swap.
 */
export function unsuspense(key: string, script?: { remove(): void } | null): void {
  const pending: Set<string> = ((self as any).jx$p ??= new Set());
  let swapped = true;

  script?.remove();
  pending.add(key);
  // To a fixpoint, not one pass: swapping an outer boundary is what brings an
  // inner boundary's host into the DOM, and the inner may already have been
  // visited this sweep.
  while (swapped) {
    swapped = false;
    [...pending].forEach((id) => {
      const template = document.getElementById(`jxu:${id}`) as HTMLTemplateElement | null;
      const host = document.querySelector(`janux-island[data-jx="${id}"][data-jx-pending]`);

      if (!template) {
        // Navigated away, or a diff already applied the content: stale entry.
        pending.delete(id);
      } else if (host) {
        host.replaceChildren(template.content);
        host.removeAttribute('data-jx-pending');
        template.remove();
        pending.delete(id);
        swapped = true;
        // The runtime may already be booted (it ships before the boundary
        // chunks): let it mount whatever the swap just revealed.
        document.dispatchEvent(new CustomEvent('janux:unsuspense', { detail: id }));
      }
    });
  }
}

/** Self-contained: the function body only touches `self` and `document`. */
export const UNSUSPENSE_RUNTIME = `self.jx$u=${unsuspense.toString()};`;
