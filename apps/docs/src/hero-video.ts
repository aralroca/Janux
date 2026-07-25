/**
 * The home demo autoplays in a loop, which is motion the visitor didn't ask for.
 * Native `controls` is what makes it stoppable (WCAG 2.2.2); this is the other
 * half: someone who set "reduce motion" gets the poster and a paused video, and
 * gets it the moment they change the setting too.
 */
export function setupHeroVideo(): void {
  const video = document.querySelector<HTMLVideoElement>('.demo video');

  if (!video) return;
  const stillness = matchMedia('(prefers-reduced-motion: reduce)');
  const apply = (): void => {
    if (stillness.matches) video.pause();
  };

  apply();
  stillness.addEventListener('change', apply);
}
