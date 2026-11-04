import type { FilterAttribute } from "corpus-map/filter";

/** A paper's arXiv category as the pipeline keeps it in `meta` (`compact.ts`): the id is the value, "id: name" the label. */
export const arxivCategory: FilterAttribute = (node) => {
  const meta = node.meta;
  if (typeof meta !== "object" || meta === null || !("category" in meta)) return undefined;
  const { category } = meta;
  if (typeof category !== "object" || category === null || !("id" in category) || !("name" in category)) {
    return undefined;
  }
  if (typeof category.id !== "string" || typeof category.name !== "string") return undefined;
  return { value: category.id, label: `${category.id}: ${category.name}` };
};
