/**
 * The group's own sub-shell: `(marketing)` never shows up in the URL, but its
 * layout wraps everything inside the directory — /about and /pricing share
 * this banner without sharing a URL prefix.
 */
export default function MarketingLayout({ children }: { children: unknown }) {
  return (
    <div class="marketing" data-shell="marketing">
      <p class="banner">From the marketing team — the URL says nothing about us.</p>
      {children}
    </div>
  );
}
