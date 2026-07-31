---
'janux': minor
---

`foreign()` maps React callback props onto intents, keeps portals alive across a navigation, and hands React plain
data so a foreign component cannot capture a live state proxy. State identity is stable across re-renders, which is
what data grids, charts and virtualization libraries assume.
