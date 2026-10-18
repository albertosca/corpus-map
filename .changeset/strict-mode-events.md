---
"corpus-map": patch
---

`onRegimeChange` and `onViewChange` no longer fire twice on mount under React's `<StrictMode>` in development, and `onRegimeChange` no longer re-fires when the map's box collapses to zero and comes back with the same regime. The `spec` prop's documentation now states that it must be referentially stable.
