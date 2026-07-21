import tailwindcss from '@tailwindcss/postcss';

/**
 * Tailwind CSS v4 for Janux, zero config:
 *
 *   bun add @janux/tailwind
 *   // src/styles.css
 *   @import "@janux/tailwind";
 *
 * The Janux CLI auto-detects this package and wires the official
 * @tailwindcss/postcss plugin into dev and build. The postcss pipeline
 * processes every CSS request — including the directly-linked
 * src/styles.css convention — so it works for 0-JS static apps too.
 * There is no vite.config in a Janux app: installing the package IS
 * the configuration.
 */
export default function janusTailwind() {
  return tailwindcss();
}
