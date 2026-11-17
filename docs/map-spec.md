# The map spec

The library is agnostic about domain exactly to the extent that this contract is well defined. `validateSpec` checks it and throws a `SpecError` naming the path of the first problem.

```jsonc
{
  "version": "1",
  "territories": [
    {
      "id": "t1",
      "name": "Alkali metals",
      "members": ["n1", "n2"],
      "centroid": [12.4, -3.1],
      "boundary": [[10.0, -5.0], [14.2, -4.8]], // optional
      "parent": "metals"                         // optional: another territory's id; that parent lists "members": []
    }
  ],
  "nodes": [
    {
      "id": "n1",
      "label": "Lithium",
      "x": 12.1,
      "y": -3.4,
      "territory": "t1",
      "state": "visited",                        // "visited" | "unvisited"
      "badges": ["stable"],                       // opaque strings, styled by the consumer
      "meta": { "symbol": "Li", "atomicNumber": 3 } // opaque; the renderer NEVER interprets this
    }
  ],
  "edges": [                                     // optional
    { "source": "n1", "target": "n2", "weight": 0.9, "reason": "same group" }
  ]
}
```

## Rules

### Nodes

- **`meta` is opaque.** The renderer passes it straight through to your card component and never reads inside it.
- **`territory` may be `null`.** A node with no territory is normal (noise points from density-based clustering, for example), not an error, and it still renders.
- **`state: "visited"` also reads from far away.**
  - A territory's fill gets fuller the larger its visited share: nearest quarter, from today's alpha up to 1.5 times it. A spec with no visited node looks exactly as before.
  - A family's share is taken over its leaves.
  - The territory button in the accessible tree adds "N of M visited".
  - The boost fades out as the points are drawn, because the palette's points keep 3:1 contrast over a fill only up to about 0.166 (dark) or 0.168 (light).

### Territories

- **`boundary` is optional.** Without one, the renderer computes a hull from the members' coordinates. When present, the producer's boundary wins.
- **Membership is declared twice and must agree.** Every node with a `territory` is listed in that territory's `members`, and every member's node points back at that territory. `validateSpec` rejects a spec where the two disagree, naming the path.
- **`parent` nests territories two levels deep.**
  - A parent is any territory another one names as `parent`. It lists no members of its own: its members are its children's.
  - A parent cannot itself have a parent. Nodes belong to leaves only.
  - `parent` and `group` cannot be mixed in one spec.
  - With parents, far views read as families (a palette colour per family, each child a lighter or darker tint of it) and near views as the leaves.
- **Territory identity must bind to the centroid or to the member set, never to a cluster index.** Clustering the same input with a different seed returns the same partition under different integer labels. A producer that names territories by cluster number silently renames them on every recomputation, and the map the user learned stops existing.

### Edges

- Edges are undirected links between two different, existing nodes, at most one per pair.
- `weight` is a finite number `>= 0`: heavier edges draw first and thicker.
- `reason` is a non-empty string, shown in the related list.

What the map does with them:

- It draws the first `tuning.edgesPerNode` edges of the hovered and the selected item.
- At mid and near, it marks the selected item's off-screen neighbours at the box edge, and lists its related items in the accessible tree (those not in a dimmed territory). A neighbour whose line never crosses the visible box gets no marker.
- `relatedItems(spec, id)` gives the same list to a consumer. It indexes the edges and ids once per spec object, so asking for many ids is cheap. Pass a new spec object after changing edges or nodes: a spec mutated in place keeps its old index.

## Naming derived groups with an LLM

Without `group` or `parent`, a corpus of 10 to 400 territories gets groups derived from its geometry, named provisionally after the largest member plus a count ("Machine Learning +10").

`tools/group-names/` is a maintainer tool, outside the package. It asks Claude to name those groups from their members and a sample of their items' labels, and writes the names to a small file you commit and review like any other data:

```sh
export ANTHROPIC_API_KEY=...   # or: set -a; source ~/.config/anthropic/api.env; set +a
bun tools/group-names/main.ts corpus.json corpus.groups.json [--model claude-opus-5-5]
```

Each name is checked before anything is written: at most 24 characters, distinct, never "Other". A run that fails writes nothing.

To apply the file when the corpus loads:

- `withGroupNames(body, file)` writes `group` onto every territory. It leaves the body untouched when the file is stale (the corpus no longer derives exactly those groups, or a name breaks a rule).
- `staleGroups(spec, file)` lists what changed after the corpus is re-exported, so a test can fail on stale names.

Both live in this repository's `tools/group-names/` (`groupNamesFile.ts` and `stale.ts`), not in the npm package. Copy them, or write `group` into your corpus directly.

The tool runs offline, once, never in the browser. A key in a browser is a leaked key, and the same corpus would render different names on two visits.
