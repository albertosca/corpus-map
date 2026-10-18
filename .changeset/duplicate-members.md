---
"corpus-map": patch
---

`validateSpec` now rejects a node listed twice in one territory's `members`, which it used to accept and silently dedupe.
