/**
 * The Lighthouse recording exists twice, once per theme, but only one of them is
 * ever fetched: the element carries both URLs and gets handed the matching one.
 *
 * Two `<video>`s toggled with CSS was the obvious version and the wrong one — a
 * `display: none` video still downloads its poster and metadata, so the home page
 * paid for both themes. The still frame is the container's CSS background, which
 * the cascade resolves to a single image, and this hands the one element its
 * source. So: no JavaScript, or reduced motion, and the still is all there is.
 */

function matchingSource(video: HTMLVideoElement, dark: boolean): string | undefined {
  return dark ? video.dataset.dark : video.dataset.light;
}

function prefersDark(scheme: MediaQueryList): boolean {
  return (document.body.dataset.theme ?? (scheme.matches ? 'dark' : 'light')) === 'dark';
}

function playMatching(video: HTMLVideoElement, still: boolean, dark: boolean): void {
  if (still) {
    video.pause();

    return;
  }
  const source = matchingSource(video, dark);

  if (!source || video.currentSrc.endsWith(source)) return;
  video.src = source;
  // Autoplay can be refused (a data-saver setting, an engine policy). The still
  // stays on screen, which is the same outcome as reduced motion.
  video.play().catch(() => {});
}

const stillness = matchMedia('(prefers-reduced-motion: reduce)');
const scheme = matchMedia('(prefers-color-scheme: dark)');

/** Re-armed per page: an SPA navigation installs a fresh element via the DOM diff. */
function arm(): void {
  const video = document.querySelector<HTMLVideoElement>('.scores-video video');

  if (!video) return;
  const apply = (): void => playMatching(video, stillness.matches, prefersDark(scheme));

  apply();
  // The theme toggle writes body[data-theme]; the recording follows it. Scoped to
  // this element, so it stops mattering once the diff drops it.
  new MutationObserver(apply).observe(document.body, { attributeFilter: ['data-theme'] });
  stillness.addEventListener('change', apply, { signal: pageLife() });
  scheme.addEventListener('change', apply, { signal: pageLife() });
}

let leaving: AbortController | undefined;

/** A signal that fires when this page goes away, so the media listeners go with it. */
function pageLife(): AbortSignal {
  leaving ??= new AbortController();

  return leaving.signal;
}

export function setupScoresVideo(): void {
  arm();
  // Same shape as toc-spy and the search island: the home page can be arrived at
  // by client-side navigation, in which case nothing above has run for it yet.
  // Only the `after` phase — before it, the element in the document is the old one.
  document.addEventListener('janux:navigate', (event) => {
    if ((event as CustomEvent).detail?.phase !== 'after') return;
    leaving?.abort();
    leaving = undefined;
    arm();
  });
}
