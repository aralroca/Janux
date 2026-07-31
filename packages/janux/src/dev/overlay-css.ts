/**
 * The overlay's styles. Dev only, and scoped inside a shadow root — the app's
 * stylesheet must not be able to restyle the panel that reports the app's own
 * failure, and the panel must not leak a single rule back into the page.
 */
export const OVERLAY_CSS = `
:host {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: block;
  background: rgb(9 11 16 / 0.82);
  backdrop-filter: blur(3px);
  font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #e8ecf4;
  overflow: auto;
}
section {
  max-width: 60rem;
  margin: 6vh auto;
  padding: 1.25rem 1.5rem 1.75rem;
  border: 1px solid #2b3242;
  border-left: 4px solid #ff5c68;
  border-radius: 10px;
  background: #12151d;
  box-shadow: 0 24px 64px rgb(0 0 0 / 0.5);
}
header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}
h1 {
  flex: 1;
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #ff8f97;
  word-break: break-word;
}
h2 {
  margin: 1.5rem 0 0.5rem;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: #7c879e;
}
.badge {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: #ff5c68;
  color: #12151d;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
[data-jx-count] {
  padding: 0.15rem 0.5rem;
  border: 1px solid #2b3242;
  border-radius: 999px;
  color: #9aa6bf;
  font-size: 0.7rem;
  white-space: nowrap;
}
button {
  padding: 0.2rem 0.5rem;
  border: 1px solid #2b3242;
  border-radius: 6px;
  background: none;
  color: #9aa6bf;
  font: inherit;
  cursor: pointer;
}
button:hover { color: #e8ecf4; border-color: #4a5468; }
table { width: 100%; border-collapse: collapse; }
th, td {
  padding: 0.3rem 0 0.3rem 0;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid #1c212c;
}
th {
  width: 6.5rem;
  font-weight: 500;
  color: #7c879e;
}
td { color: #cfd7e6; word-break: break-word; }
.note {
  margin: 0.75rem 0 0;
  padding: 0.6rem 0.75rem;
  border-radius: 6px;
  background: #191d27;
  color: #9aa6bf;
}
pre {
  margin: 0;
  padding: 0.75rem;
  border-radius: 6px;
  background: #0c0e14;
  color: #9aa6bf;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-x: auto;
}
`;
