---
"corpus-map": patch
---

Family focus moves continuously on a pan over a sparse map. Each on-screen item now counts toward its family by how far inside the box it sits (`familyCounts`, a feather of 15% of the box from each edge), instead of 1 inside and 0 outside. The default `focusFloor` goes from 0.5 to 0.25, and the weight trusts the shares from 96 on-screen items of the largest family, up from 24. On a map whose families sit in separated clusters, such as corpus-cartographer's, a 2% pan no longer flips which family shows its leaves. At the near regime a second family now shows its leaves more often. A consumer that wants the old look passes `tuning={{ focusFloor: 0.5 }}`.
