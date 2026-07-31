---
'@janux/server': patch
'@janux/agent': patch
'@janux/cli': patch
---

The invocation pipeline refuses cross-site calls, closing a CSRF hole that reached intents and `api()` over both
`POST` and `GET` — schema defaults meant an `<img src>` could invoke a handler. The check is on `Sec-Fetch-Site`
and treats only `same-origin` as safe: Chrome reports two localhost ports as `same-site`, so accepting that would
have let the real attack through.
