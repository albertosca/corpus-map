---
"corpus-map": minor
---

`resolveTuning` and `resolveThresholds` are now exported from the package's own public door (they were already reachable as internal declarations, but never through `src/index.ts`). Both validate and default their input the same way `CorpusMap` already does internally, throwing a `RangeError` naming the offending field on an invalid value — useful for a consumer that wants to validate a `tuning`/`thresholds` value before handing it to `CorpusMap`, the way the demo's new hidden tuning panel does.
