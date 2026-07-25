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

export function setupScoresVideo(): void {
  const video = document.querySelector<HTMLVideoElement>('.scores-video video');

  if (!video) return;
  const stillness = matchMedia('(prefers-reduced-motion: reduce)');
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  const apply = (): void => playMatching(video, stillness.matches, prefersDark(scheme));

  apply();
  stillness.addEventListener('change', apply);
  scheme.addEventListener('change', apply);
  // The theme toggle writes body[data-theme]; the recording follows it.
  new MutationObserver(apply).observe(document.body, { attributeFilter: ['data-theme'] });
}
