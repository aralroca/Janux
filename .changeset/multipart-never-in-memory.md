---
'@janux/server': minor
---

A multipart body no longer has to fit in memory: `spoolMultipart()` streams parts to disk as they arrive, enforcing
the size limit inside the read loop rather than after it. A 4 GB upload now peaks at ~71 MB of RSS instead of
holding the whole body.
