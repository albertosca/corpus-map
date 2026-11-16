---
"corpus-map": patch
---

`FilterBox` now names its checkbox group with a visually hidden `<legend>` inside the `<fieldset>` instead of an `aria-label`, which HTML_CodeSniffer (WCAG technique H71) asks for; the accessible name is unchanged.
