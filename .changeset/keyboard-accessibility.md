---
"corpus-map": minor
---

Keyboard and screen-reader access (spec 2026-10-20): the map surface is a focusable region (`label` prop, `focus()` handle) with arrow/+/-/0/Esc keys and a settled-count announcement; the accessible tree lists territories under group headings with a live "Unassigned" control and "Back to overview"; legend group headers become headings; new `headingLevel` prop (2–6; `null` from JavaScript throws like any other invalid level). A blank `label` keeps the default name. Behaviour change: territory buttons in the accessible tree are now named "Name, N items" instead of "Name (N)".
