---
'janux': minor
---

Hovering a link warms the route manifest as well as the page, so the first navigation after a hover no longer waits
on a manifest fetch. Prefetching waits 60ms for intent, requests at low priority, and aborts when a navigation
starts, so a pointer crossing a nav bar no longer costs a request per link.
