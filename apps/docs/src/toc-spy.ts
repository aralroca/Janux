/**
 * "On this page" scroll-spy: bolds the TOC entry of the heading currently in
 * view. One passive scroll listener for the app's lifetime; `refresh` re-reads
 * the headings on load and after every SPA navigation (`janux:navigate`).
 */
const SCROLL_LINE = 90;

let headings: HTMLElement[] = [];
let ticking = false;

function currentHeading(): HTMLElement | undefined {
  return (
    [...headings].reverse().find((el) => el.getBoundingClientRect().top <= SCROLL_LINE) ??
    headings[0]
  );
}

function highlight(): void {
  const id = currentHeading()?.id;

  document.querySelectorAll('.toc a').forEach((link) => {
    link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
  });
}

function refresh(): void {
  headings = [...document.querySelectorAll<HTMLElement>('article h2[id], article h3[id]')];
  highlight();
}

function onScroll(): void {
  if (ticking || headings.length === 0) return;
  ticking = true;
  requestAnimationFrame(() => {
    highlight();
    ticking = false;
  });
}

export function setupTocSpy(): void {
  refresh();
  document.addEventListener('janux:navigate', () => setTimeout(refresh));
  addEventListener('scroll', onScroll, { passive: true });
}
