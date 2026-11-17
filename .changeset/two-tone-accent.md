---
"corpus-map": minor
---

The default look is now two tones and one accent. `Theme.tones` names eight colour roles (`ground`, `surface`, `secondBase`, `ink`, `muted`, `accent`, `onAccent`, `accentText`) that restyle the whole map; `ThemeInput.base: "dark"` starts from the dark theme; `DEFAULT_TONES` and `DARK_TONES` are exported. Territories are painted with four slate tone steps instead of eight hues, the selected item is a filled accent dot, and `checkTheme` takes `tones.ground` as the default page and gains an `accent` metric. Explicit theme fields still win over roles. `recipes-*` consumers that pass `DEFAULT_THEME` see the new look on their next bump. `Theme` gains a required `tones` field, so a full `Theme` built by hand needs it: spread `DEFAULT_THEME` or build it with `resolveTheme`.
