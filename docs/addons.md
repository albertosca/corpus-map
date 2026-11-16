# Add-ons

Each add-on is a separate entry point with its own file. A consumer of the map alone pays nothing for them.

| Entry | Component | Gzip ceiling | What for |
|---|---|---|---|
| `corpus-map/search` | `SearchBox` | 4.1 kB | Search by text |
| `corpus-map/assistant` | `AssistantBox` | 2.4 kB | Dialogue with your own AI |
| `corpus-map/filter` | `FilterBox` | 2.5 kB | Checkbox filter over a `meta` attribute |
| `corpus-map/theme-check` | `checkTheme` | 6.9 kB | Accessibility measurements of a theme, see [Styling](styling.md) |

The ceilings are the `sizeLimit` values in `package.json`, enforced by `npm run size`.

All of them produce ids you hand to `CorpusMap`'s `matches` prop. See [Search results on the map](usage.md#search-results-on-the-map).

## Search

```tsx
<SearchBox
  spec={spec}
  onMatches={setMatches}
  onGo={(id) => handle.current?.reveal(id)}
  onShow={() => handle.current?.revealAll(matches ?? [])}
/>
```

By default it runs a local, accent- and case-folding search over each item's label and `meta`, in the browser. It debounces the query.

To search elsewhere (a server, a worker, a vector index), pass `search: (query) => ids | Promise<ids>`.

### Ranking

`rank` orders the results:

- `"connections"` (the default) puts the items with the most edges first.
- `"alphabetical"`.
- A function `(item, { connections }) => score`, highest first.

Ties are always alphabetical. `onMatches` receives the ids best first.

A `search` that returns plain ids keeps the order it ranked them in. One that returns `{ id, score }` entries is sorted by score. A mixed answer throws and shows "Search failed".

### The results list

- The first 50 results are listed under the box, then "and N more", as a combobox.
- Arrows move. Enter or a click calls `onGo(id)` for that result, which centres the map on it. Enter without an arrow takes the first result.
- Typing never moves the view.

### Behaviour

- It keeps only the newest answer.
- It announces the count in a `role="status"`: "12 results", "No results" or "Search failed".
- It clears on Escape, on the clear button, or on a new `spec`.
- It shows a "Show on map" button when `onShow` is given.
- Its inline styles inherit the page's colour and font. `touchTargets` gives every control a 44 px target.

## Dialogue with an AI

```tsx
<AssistantBox
  spec={spec}
  ask={ask}
  selectedId={selectedId}
  view={view}
  onMatches={setMatches}
  onReveal={(ids) => handle.current?.revealAll(ids)}
  onRestore={(view) => handle.current?.setView(view)}
  onSelect={select}
/>
```

The AI is yours. There is no key or server in the library.

- `ask(request, signal)` receives `{ question, selectedId, history }`.
- It returns a promise of a whole `{ text, ids }`. There is no streaming.
- Cited ids the spec does not know are dropped.

When an answer cites items:

- They are highlighted through `onMatches`.
- They are framed once through `onReveal`, but only if the `view` you pass in is still the one the reader had when asking.
- A "Back to previous view" button then calls `onRestore` with that view.
- A reader who panned meanwhile is never moved.

`view` is what `onViewportChange` reported, or `handle.getView()` for the first fit, which is never reported.

Other behaviour:

- A newer question aborts the older.
- A new `spec` clears the dialogue.
- A rejected `ask` shows "Assistant failed".
- Pass `notice` to say on screen that the answers are not from an AI, as the demo does.

## Filter by attribute

`FilterBox` is a checkbox filter over any `meta` attribute.

Define the attribute once, outside your component. `meta` is `unknown`, so you narrow it:

```tsx
const kind: FilterAttribute = (node) => (node.meta as { kind?: string } | undefined)?.kind;

<FilterBox spec={spec} attribute={kind} onMatches={setFilterMatches} />;
```

`attribute` returns a value, a list of values, or `{ value, label }` (a bare string is both). It must be a stable reference: an arrow written inline in the render is a new function every time, and the facets are computed again.

What the box does:

- It lists every value with its item count.
- Several values can be selected at once; any of them passes.
- It reports the ids that pass through `onMatches`, or `null` while nothing is selected.
- Hand that to `CorpusMap`'s `matches` and what it excludes is dimmed, never removed.
- A new `spec` clears the selection.

To combine it with a search or an assistant answer, pass `intersectMatches(searchIds, filterIds)`. `null` means "no constraint".

`facetsOf(spec, attribute)` and `idsMatching(spec, attribute, selected)` are the pure pieces, for a UI of your own.
