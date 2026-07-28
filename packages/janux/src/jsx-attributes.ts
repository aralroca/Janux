import type * as CSS from 'csstype';

/**
 * The shape of a `style={{…}}` object: every CSS property (camelCased, from
 * csstype) plus `--*` custom properties, which keep their casing.
 *
 * Unlike React, a bare number is never given a unit: `{ width: 10 }` renders
 * `width:10`, not `width:10px`. The guess is wrong for `lineHeight`, `flex`,
 * `zIndex`, `opacity` and every unitless property, so Janux asks for the unit
 * instead of maintaining a list of exceptions.
 *
 * Example:
 *
 * ```tsx
 * <div style={{ backgroundColor: 'red', width: '10px', '--accent': '#06f' }} />
 * ```
 */
export interface CSSProperties extends CSS.Properties<string | number> {
  [key: `--${string}`]: string | number | undefined;
}
