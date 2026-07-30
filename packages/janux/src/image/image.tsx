import type { CSSProperties } from '../jsx-attributes';
import type { JanuxNode } from '../jsx-runtime';
import { IMAGE_FORMATS, imageSrcSet, imageWidths, isOptimizable, isRemote } from './urls';

interface ImageBaseProps {
  /** Path into `public/`, e.g. `/photos/hero.jpg` — or any URL with `unoptimized`. */
  src: string;
  /** Text alternative. `alt=""` is the correct value for a decorative image, never a missing one. */
  alt: string;
  /** Layout width in CSS pixels. Also what the `srcset` candidates are chosen around. */
  width: number;
  /** Layout widths that pick from the `srcset`. Defaults to `<width>px`, right for a fixed-size image. */
  sizes?: string;
  /** Load eagerly at high priority — for the LCP image, and for nothing else on the page. */
  priority?: boolean;
  /** Link the source as-is. Required for a remote URL, since there is no local file to encode. */
  unoptimized?: boolean;
  class?: string;
  style?: CSSProperties;
}

/**
 * The box is not optional, and that is the feature: `width` plus either
 * `height` or `aspectRatio` is what makes the browser reserve space before the
 * bytes arrive, which is the difference between CLS 0 and a page that jumps.
 */
export type ImageProps = ImageBaseProps &
  ({ height: number; aspectRatio?: never } | { height?: never; aspectRatio: number | `${number}/${number}` });

/** `16/9`, or a plain number. Anything else is an author error, not a box of NaN. */
function ratioOf(value: number | string | undefined): number {
  const [width, height] = typeof value === 'number' ? [value, 1] : String(value).split('/').map(Number);
  const ratio = width! / height!;

  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new Error(`Janux <Image>: aspectRatio "${value}" is not a ratio like 16/9 or 1.5.`);
  }

  return ratio;
}

function boxOf({ width, height, aspectRatio }: ImageProps): { width: number; height: number } {
  if (height !== undefined) return { width, height };

  return { width, height: Math.round(width / ratioOf(aspectRatio)) };
}

/**
 * A source Janux cannot optimize must say so out loud. Silently linking the
 * original would mean a `<picture>` whose every candidate 404s, or a remote
 * image nobody notices is unoptimized until a Lighthouse run says so.
 */
function assertSource(src: string, unoptimized: boolean | undefined): void {
  if (isRemote(src) && !unoptimized) {
    throw new Error(`Janux <Image>: "${src}" is remote, so there is no file to optimize — pass \`unoptimized\` to link it as-is.`);
  }
  if (!isRemote(src) && !src.startsWith('/')) {
    throw new Error(`Janux <Image>: "${src}" must be an absolute path into public/, like "/hero.jpg".`);
  }
}

/** One `<source>` per modern format, most efficient first — the browser takes the first it understands. */
function formatSources(src: string, width: number, sizes: string | undefined): JanuxNode[] {
  const widths = imageWidths(width);

  return IMAGE_FORMATS.map((format) => (
    <source
      key={format}
      type={`image/${format}`}
      srcSet={imageSrcSet(src, widths, format)}
      sizes={sizes ?? `${width}px`}
    />
  ));
}

/**
 * A responsive image that costs nothing at runtime.
 *
 * The markup is the whole component: AVIF and WebP candidates the build
 * emitted, the original as the fallback every browser can take, and a reserved
 * box. There is no island, no client module and no measurement — an image has
 * nothing to hydrate, so it doesn't.
 */
export function Image(props: ImageProps): JanuxNode {
  const { src, alt, sizes, priority, unoptimized, class: className, style } = props;

  assertSource(src, unoptimized);
  const box = boxOf(props);
  const optimized = !unoptimized && !isRemote(src) && isOptimizable(src);
  const img = (
    <img
      src={src}
      alt={alt}
      width={box.width}
      height={box.height}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={priority ? 'high' : undefined}
      class={className}
      style={style}
    />
  );

  return optimized ? <picture>{formatSources(src, box.width, sizes)}{img}</picture> : img;
}
