---
'@janux/server': minor
'janux': minor
'@janux/vite': patch
---

Strict CSP: `csp: true` mints a nonce per request and stamps it on every inline script and style the framework
emits — resume payload, island map, runtime, speculation rules, query hydration, suspense boundary swaps, inlined
CSS, JSON-LD, `meta.head` and `<script>`/`<style>` written in JSX — then sends
`script-src 'nonce-…' 'strict-dynamic'; object-src 'none'; base-uri 'none'`. No code path uses `eval` or
`new Function`, so `'unsafe-eval'` is never needed, and an app that does not configure `csp` gets byte-identical
HTML.

SPA navigation is where this is easy to get wrong: re-creating the scripts a navigated page brings is what gives
them a valid nonce, so doing it indiscriminately would launder an injected `<script>` into an executed one. The
response states its own nonce in `x-janux-nonce`, out of reach of its own markup, and only tags already carrying
that value are re-stamped. Nonces are validated against the CSP `base64-value` grammar, and a nonced document is
never kept in the shared response cache — a stored nonce is one every later visitor would share.
