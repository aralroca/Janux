/**
 * The devtools panel styles. Dev only, and scoped inside a shadow root — the
 * app's stylesheet cannot restyle the panel, and the panel leaks no rule back.
 * Every interactive element keeps a visible focus ring: this is a keyboard
 * tool first.
 */
export const DEVTOOLS_CSS = `
:host {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 2147483646;
  display: block;
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #e8ecf4;
  pointer-events: none;
}
* { box-sizing: border-box; }
button {
  font: inherit;
  color: inherit;
  background: #1a1f2b;
  border: 1px solid #2b3242;
  border-radius: 6px;
  padding: 0.25rem 0.6rem;
  cursor: pointer;
  pointer-events: auto;
}
button:hover { background: #232a3a; }
button:focus-visible { outline: 2px solid #7aa2ff; outline-offset: 1px; }
[data-jxdt-toggle] {
  position: absolute;
  bottom: 0.75rem;
  left: 0.75rem;
  color: #9db4e8;
}
section {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  height: min(45vh, 26rem);
  display: flex;
  flex-direction: column;
  border-top: 1px solid #2b3242;
  background: #12151d;
  box-shadow: 0 -16px 48px rgb(0 0 0 / 0.45);
  pointer-events: auto;
}
header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #2b3242;
}
[role='tablist'] { display: flex; gap: 0.35rem; flex: 1; }
[role='tab'] { border-color: transparent; background: none; color: #9aa7bd; }
[role='tab'][aria-selected='true'] { background: #232a3a; color: #e8ecf4; border-color: #2b3242; }
.content { flex: 1; overflow: auto; padding: 0.75rem; }
.empty { color: #9aa7bd; margin: 0.25rem 0; }
.split { display: grid; grid-template-columns: minmax(14rem, 1fr) 2fr; gap: 1rem; }
.tree, .tree ul { list-style: none; margin: 0; padding-left: 0.9rem; }
.tree { padding-left: 0; }
.tree button { display: inline-flex; gap: 0.4rem; border-color: transparent; background: none; }
.tree button[aria-current='true'] { border-color: #2b3242; background: #232a3a; }
.tree small { color: #9aa7bd; }
.tree em, h2 em { font-style: normal; color: #86d99c; }
h2, h3 { margin: 0.5rem 0 0.35rem; font-size: 0.8rem; font-weight: 600; color: #9db4e8; }
pre {
  margin: 0.25rem 0;
  padding: 0.5rem;
  background: #0d1017;
  border: 1px solid #232a3a;
  border-radius: 6px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 0.3rem 0.5rem; border-bottom: 1px solid #232a3a; vertical-align: top; }
th { color: #9aa7bd; font-weight: 500; }
[data-jxdt-status='error'] td { color: #ff8f97; }
[data-jxdt-status='proposed'] td { color: #f2c66d; }
[data-jxdt-diff-changed] td { background: rgb(122 162 255 / 0.12); }
[data-jxdt-diff-changed] td:nth-child(2) { color: #ff8f97; }
[data-jxdt-diff-changed] td:nth-child(3) { color: #86d99c; }
.gone { color: #9aa7bd; }
ul { margin: 0.25rem 0; padding-left: 1.1rem; }
code { color: #cdd8ef; }
`;
