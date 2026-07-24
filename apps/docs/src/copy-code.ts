const RESET_MS = 1500;

/** One delegated listener: any `.copy-code` button copies its sibling block's text. */
export function setupCopyCode(): void {
  document.addEventListener('click', function copyCode(event) {
    const button = (event.target as Element | null)?.closest?.('button.copy-code');

    if (!(button instanceof HTMLButtonElement)) return;
    const text = button.parentElement?.querySelector('pre')?.textContent ?? '';

    navigator.clipboard.writeText(text).then(() => flashCopied(button)).catch(console.error);
  });
}

function flashCopied(button: HTMLButtonElement): void {
  const iconOnly = button.querySelector('svg') !== null;

  button.classList.add('copied');
  if (!iconOnly) button.textContent = 'Copied';
  setTimeout(function resetCopyLabel() {
    button.classList.remove('copied');
    if (!iconOnly) button.textContent = 'Copy';
  }, RESET_MS);
}
