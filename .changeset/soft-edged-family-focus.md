---
"corpus-map": minor
---

Family focus moves continuously on a pan over a sparse map. Each on-screen item now counts toward its family by how far inside the box it sits (`familyCounts`, a feather of 15% of the box from each edge), instead of 1 inside and 0 outside. The default `focusFloor` goes from 0.5 to 0.25, and the number of on-screen items of the largest family the weight needs before it trusts the shares now grows with the corpus, from 24 (as before) up to 96 for a corpus of about 7,700 items or more. On a map whose families sit in separated clusters, such as corpus-cartographer's, a 2% pan toward a neighbouring family no longer flips which family shows its leaves; a pan in some other directions can still move a weight by more than half. At the near regime a second family now shows its leaves more often. A consumer that wants the old look passes `tuning={{ focusFloor: 0.5 }}`.
