import type { Matcher, Route } from './router';

/**
 * A malformed percent-escape cannot be a valid param value, so the segment
 * simply does not match. `decodeURIComponent` throws on `/%`, `/%zz` and any
 * truncated multi-byte escape — reachable by any client, so letting it escape
 * turns a 404 into a 500.
 */
function decodeSegment(raw: string): string | undefined {
  try {
    return decodeURIComponent(raw);
  } catch {
    return undefined;
  }
}

/**
 * Params from the leading fixed segments, or `undefined` if any refuses.
 *
 * Static segments compare raw, so they never pay for a decode — and a malformed
 * escape elsewhere in the path cannot fail a static route that never looked at it.
 */
function fixedParams(
  route: Route,
  pathSegments: string[],
  fixed: number,
  matchers: Record<string, Matcher>,
): Record<string, string> | undefined {
  // Null prototype: `[__proto__].tsx` is a legal route file, and assigning to
  // `params['__proto__']` on a plain object hits the prototype setter instead
  // of creating the key — the param silently vanished.
  const params: Record<string, string> = Object.create(null);

  for (let index = 0; index < fixed; index += 1) {
    const segment = route.segments[index]!;

    if (segment.kind === 'static') {
      if (segment.raw !== pathSegments[index]) return undefined;
      continue;
    }
    const value = decodeSegment(pathSegments[index]!);

    if (value === undefined) return undefined;
    if (segment.kind === 'typed' && !matchers[segment.matcher!]?.(value)) return undefined;
    params[segment.name!] = value;
  }

  return params;
}

/** The joined tail for a rest segment, or `undefined` if any part refuses to decode. */
function restParam(pathSegments: string[], fixed: number): string | undefined {
  const rest = pathSegments.slice(fixed).map(decodeSegment);

  return rest.includes(undefined) ? undefined : rest.join('/');
}

export function matchRoute(
  route: Route,
  pathSegments: string[],
  matchers: Record<string, Matcher>,
): Record<string, string> | undefined {
  const { segments } = route;
  const last = segments[segments.length - 1];
  const isRest = last?.kind === 'catchall' || last?.kind === 'optional';
  const fixed = isRest ? segments.length - 1 : segments.length;
  const minLength = last?.kind === 'catchall' ? fixed + 1 : fixed;

  if (isRest ? pathSegments.length < minLength : pathSegments.length !== fixed) return undefined;
  const params = fixedParams(route, pathSegments, fixed, matchers);

  if (!params || !isRest) return params;
  const rest = restParam(pathSegments, fixed);

  return rest === undefined ? undefined : { ...params, [last!.name!]: rest };
}
