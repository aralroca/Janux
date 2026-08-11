---
"@janux/vercel": patch
---

The Vercel function no longer carries the browser's payload.

`dist/client` holds everything the build emitted — hashed chunks and `public/` copied in whole — and all of it is already on the CDN as `static/`. The function now carries only the slice the server reads back at boot: the top-level manifests (`styles.css`, `islands.json`, `client.js`, a built `sw.js`) and the framework's `_janux/` assets. A media-heavy app whose `public/` alone exceeds the platform's 250MB function ceiling deploys where it previously could not.
