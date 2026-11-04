---
"corpus-map": minor
---

Add `corpus-map/filter`, an opt-in checkbox filter over any `meta` attribute. `FilterBox` reports the ids that pass through `onMatches`, to hand to `CorpusMap`'s `matches`; `facetsOf`, `idsMatching` and `intersectMatches` are the pure pieces under it, so a filter and a search compose by intersection. The main entry is unchanged.
