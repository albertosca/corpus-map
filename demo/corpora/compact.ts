import { withExpandedEdges } from "./edges";

/** Where an arXiv paper's abstract page lives; the id is appended as it is. */
export const ARXIV_ABS_URL_PREFIX = "https://arxiv.org/abs/";

// `YYMM.NNNN` (2007-2014) or `YYMM.NNNNN` (2015 on).
const NEW_STYLE = /^(\d{2})\d{2}\.\d{4,5}$/;
// `archive[.XX]/YYMMNNN`, 1991-2007.
const OLD_STYLE = /^[a-z-]+(?:\.[A-Z]{2})?\/(\d{2})\d{5}$/;
// Old-style ids started in 1991, so a two-digit year from 91 up is the 1900s.
const FIRST_OLD_STYLE_YEAR = 91;

/**
 * The year an arXiv id was registered, read from its `YY` digits; undefined
 * for anything that is not an arXiv id (a version suffix included). The
 * pipeline refuses a paper whose publication year differs from this, so the
 * arXiv payload can leave the year out (`pipeline/arxiv/.../export.py`).
 */
export function yearOfArxivId(id: string): number | undefined {
  const newStyle = NEW_STYLE.exec(id);
  if (newStyle) return 2000 + Number(newStyle[1]);
  const oldStyle = OLD_STYLE.exec(id);
  if (!oldStyle) return undefined;
  const twoDigits = Number(oldStyle[1]);
  return twoDigits >= FIRST_OLD_STYLE_YEAR ? 1900 + twoDigits : 2000 + twoDigits;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrays(body: unknown): { territories: unknown[]; nodes: unknown[] } | undefined {
  if (!isRecord(body)) return undefined;
  const { territories, nodes } = body;
  return Array.isArray(territories) && Array.isArray(nodes) ? { territories, nodes } : undefined;
}

/**
 * `body` with each territory that ships without `members` given the ids of
 * the nodes that name it, in node order: the arXiv payload leaves the list
 * out, since every node already names its territory. Anything else comes back
 * as it was, for `validateSpec` to report.
 */
export function withDerivedMembers(body: unknown): unknown {
  const parts = arrays(body);
  if (!parts) return body;
  const idsByTerritory = new Map<unknown, unknown[]>();
  for (const node of parts.nodes) {
    if (!isRecord(node)) continue;
    const ids = idsByTerritory.get(node.territory) ?? [];
    ids.push(node.id);
    idsByTerritory.set(node.territory, ids);
  }
  const territories = parts.territories.map((territory) =>
    isRecord(territory) && !("members" in territory)
      ? { ...territory, members: idsByTerritory.get(territory.id) ?? [] }
      : territory,
  );
  return { ...(body as Record<string, unknown>), territories };
}

/** A paper's arXiv category, as the card and the drawer show it. */
export interface ArxivCategory {
  id: string;
  name: string;
}

/** The body's `categories` table, keeping only well-formed `{ id, name }` entries in place. */
function categoryTable(categories: unknown): Array<ArxivCategory | undefined> {
  if (!Array.isArray(categories)) return [];
  return categories.map((entry: unknown) =>
    isRecord(entry) && typeof entry.id === "string" && typeof entry.name === "string"
      ? { id: entry.id, name: entry.name }
      : undefined,
  );
}

/**
 * `body` with each node that ships without `meta` given `{ year, url }` from
 * its arXiv id (`yearOfArxivId`, `ARXIV_ABS_URL_PREFIX`) and `category` from
 * its `category` index into the body's `categories` table; a node whose id is
 * not arXiv's gets no year or url, and an index that names no table entry
 * gets no category. The index and the table are stripped either way, since
 * the spec has no place for them.
 */
export function withArxivMeta(body: unknown): unknown {
  if (!isRecord(body) || !Array.isArray(body.nodes)) return body;
  const table = categoryTable(body.categories);
  const nodes = body.nodes.map((node: unknown) => {
    if (!isRecord(node)) return node;
    const { category: index, ...rest } = node;
    if ("meta" in node || typeof node.id !== "string") return "category" in node ? rest : node;
    const year = yearOfArxivId(node.id);
    const category = typeof index === "number" && Number.isInteger(index) ? table[index] : undefined;
    const meta = {
      ...(year === undefined ? {} : { year, url: `${ARXIV_ABS_URL_PREFIX}${node.id}` }),
      ...(category === undefined ? {} : { category }),
    };
    return Object.keys(meta).length === 0 ? rest : { ...rest, meta };
  });
  const { categories: _categories, ...withoutTable } = body;
  return { ...withoutTable, nodes };
}

/**
 * The arXiv payload as `validateSpec` expects it: edges, territory members
 * and node meta all ship derivable and are rebuilt here (README "The demo"),
 * which keeps the fetched file about 30% smaller.
 */
export function withExpandedArxiv(body: unknown): unknown {
  return withArxivMeta(withDerivedMembers(withExpandedEdges(body)));
}
