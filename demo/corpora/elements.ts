import type { MapNode, MapSpec, NodeState, Territory } from "corpus-map";

/**
 * The periodic table, hydrogen through xenon (atomic numbers 1-54), placed by
 * group (x) and period (y). Territories are the standard chemical blocks,
 * under two declared families (`parent`): metals and nonmetals, with the
 * metalloids between them standing alone. It is the gallery's one corpus with
 * named families, as opposed to derived groups.
 */

interface ElementSeed {
  id: string;
  symbol: string;
  name: string;
  atomicNumber: number;
  group: number;
  period: number;
}

const ELEMENTS: ElementSeed[] = [
  { id: "h", symbol: "H", name: "Hydrogen", atomicNumber: 1, group: 1, period: 1 },
  { id: "he", symbol: "He", name: "Helium", atomicNumber: 2, group: 18, period: 1 },
  { id: "li", symbol: "Li", name: "Lithium", atomicNumber: 3, group: 1, period: 2 },
  { id: "be", symbol: "Be", name: "Beryllium", atomicNumber: 4, group: 2, period: 2 },
  { id: "b", symbol: "B", name: "Boron", atomicNumber: 5, group: 13, period: 2 },
  { id: "c", symbol: "C", name: "Carbon", atomicNumber: 6, group: 14, period: 2 },
  { id: "n", symbol: "N", name: "Nitrogen", atomicNumber: 7, group: 15, period: 2 },
  { id: "o", symbol: "O", name: "Oxygen", atomicNumber: 8, group: 16, period: 2 },
  { id: "f", symbol: "F", name: "Fluorine", atomicNumber: 9, group: 17, period: 2 },
  { id: "ne", symbol: "Ne", name: "Neon", atomicNumber: 10, group: 18, period: 2 },
  { id: "na", symbol: "Na", name: "Sodium", atomicNumber: 11, group: 1, period: 3 },
  { id: "mg", symbol: "Mg", name: "Magnesium", atomicNumber: 12, group: 2, period: 3 },
  { id: "al", symbol: "Al", name: "Aluminium", atomicNumber: 13, group: 13, period: 3 },
  { id: "si", symbol: "Si", name: "Silicon", atomicNumber: 14, group: 14, period: 3 },
  { id: "p", symbol: "P", name: "Phosphorus", atomicNumber: 15, group: 15, period: 3 },
  { id: "s", symbol: "S", name: "Sulfur", atomicNumber: 16, group: 16, period: 3 },
  { id: "cl", symbol: "Cl", name: "Chlorine", atomicNumber: 17, group: 17, period: 3 },
  { id: "ar", symbol: "Ar", name: "Argon", atomicNumber: 18, group: 18, period: 3 },
  { id: "k", symbol: "K", name: "Potassium", atomicNumber: 19, group: 1, period: 4 },
  { id: "ca", symbol: "Ca", name: "Calcium", atomicNumber: 20, group: 2, period: 4 },
  { id: "sc", symbol: "Sc", name: "Scandium", atomicNumber: 21, group: 3, period: 4 },
  { id: "ti", symbol: "Ti", name: "Titanium", atomicNumber: 22, group: 4, period: 4 },
  { id: "v", symbol: "V", name: "Vanadium", atomicNumber: 23, group: 5, period: 4 },
  { id: "cr", symbol: "Cr", name: "Chromium", atomicNumber: 24, group: 6, period: 4 },
  { id: "mn", symbol: "Mn", name: "Manganese", atomicNumber: 25, group: 7, period: 4 },
  { id: "fe", symbol: "Fe", name: "Iron", atomicNumber: 26, group: 8, period: 4 },
  { id: "co", symbol: "Co", name: "Cobalt", atomicNumber: 27, group: 9, period: 4 },
  { id: "ni", symbol: "Ni", name: "Nickel", atomicNumber: 28, group: 10, period: 4 },
  { id: "cu", symbol: "Cu", name: "Copper", atomicNumber: 29, group: 11, period: 4 },
  { id: "zn", symbol: "Zn", name: "Zinc", atomicNumber: 30, group: 12, period: 4 },
  { id: "ga", symbol: "Ga", name: "Gallium", atomicNumber: 31, group: 13, period: 4 },
  { id: "ge", symbol: "Ge", name: "Germanium", atomicNumber: 32, group: 14, period: 4 },
  { id: "as", symbol: "As", name: "Arsenic", atomicNumber: 33, group: 15, period: 4 },
  { id: "se", symbol: "Se", name: "Selenium", atomicNumber: 34, group: 16, period: 4 },
  { id: "br", symbol: "Br", name: "Bromine", atomicNumber: 35, group: 17, period: 4 },
  { id: "kr", symbol: "Kr", name: "Krypton", atomicNumber: 36, group: 18, period: 4 },
  { id: "rb", symbol: "Rb", name: "Rubidium", atomicNumber: 37, group: 1, period: 5 },
  { id: "sr", symbol: "Sr", name: "Strontium", atomicNumber: 38, group: 2, period: 5 },
  { id: "y", symbol: "Y", name: "Yttrium", atomicNumber: 39, group: 3, period: 5 },
  { id: "zr", symbol: "Zr", name: "Zirconium", atomicNumber: 40, group: 4, period: 5 },
  { id: "nb", symbol: "Nb", name: "Niobium", atomicNumber: 41, group: 5, period: 5 },
  { id: "mo", symbol: "Mo", name: "Molybdenum", atomicNumber: 42, group: 6, period: 5 },
  { id: "tc", symbol: "Tc", name: "Technetium", atomicNumber: 43, group: 7, period: 5 },
  { id: "ru", symbol: "Ru", name: "Ruthenium", atomicNumber: 44, group: 8, period: 5 },
  { id: "rh", symbol: "Rh", name: "Rhodium", atomicNumber: 45, group: 9, period: 5 },
  { id: "pd", symbol: "Pd", name: "Palladium", atomicNumber: 46, group: 10, period: 5 },
  { id: "ag", symbol: "Ag", name: "Silver", atomicNumber: 47, group: 11, period: 5 },
  { id: "cd", symbol: "Cd", name: "Cadmium", atomicNumber: 48, group: 12, period: 5 },
  { id: "in", symbol: "In", name: "Indium", atomicNumber: 49, group: 13, period: 5 },
  { id: "sn", symbol: "Sn", name: "Tin", atomicNumber: 50, group: 14, period: 5 },
  { id: "sb", symbol: "Sb", name: "Antimony", atomicNumber: 51, group: 15, period: 5 },
  { id: "te", symbol: "Te", name: "Tellurium", atomicNumber: 52, group: 16, period: 5 },
  { id: "i", symbol: "I", name: "Iodine", atomicNumber: 53, group: 17, period: 5 },
  { id: "xe", symbol: "Xe", name: "Xenon", atomicNumber: 54, group: 18, period: 5 },
];

const TERRITORY_MEMBERS: Record<string, string[]> = {
  "alkali-metals": ["li", "na", "k", "rb"],
  "alkaline-earth": ["be", "mg", "ca", "sr"],
  "transition-metals": [
    "sc",
    "ti",
    "v",
    "cr",
    "mn",
    "fe",
    "co",
    "ni",
    "cu",
    "zn",
    "y",
    "zr",
    "nb",
    "mo",
    "tc",
    "ru",
    "rh",
    "pd",
    "ag",
    "cd",
  ],
  "post-transition": ["al", "ga", "in", "sn"],
  metalloids: ["b", "si", "ge", "as", "sb", "te"],
  nonmetals: ["h", "c", "n", "o", "p", "s", "se"],
  halogens: ["f", "cl", "br", "i"],
  "noble-gases": ["he", "ne", "ar", "kr", "xe"],
};

const TERRITORY_NAMES: Record<string, string> = {
  "alkali-metals": "Alkali Metals",
  "alkaline-earth": "Alkaline Earth Metals",
  "transition-metals": "Transition Metals",
  "post-transition": "Post-Transition Metals",
  metalloids: "Metalloids",
  nonmetals: "Reactive Nonmetals",
  halogens: "Halogens",
  "noble-gases": "Noble Gases",
};

// Each family's children; a parent lists no members of its own (spec slice E §3).
// The `family-` prefix keeps them apart from the leaf `nonmetals`.
const FAMILY_CHILDREN: Record<string, string[]> = {
  "family-metals": ["alkali-metals", "alkaline-earth", "transition-metals", "post-transition"],
  "family-nonmetals": ["nonmetals", "halogens", "noble-gases"],
};

const FAMILY_NAMES: Record<string, string> = {
  "family-metals": "Metals",
  "family-nonmetals": "Nonmetals",
};

const VISITED_IDS = new Set(["h", "o", "fe", "ag", "xe"]);

function elementById(id: string): ElementSeed {
  const found = ELEMENTS.find((element) => element.id === id);
  if (!found) throw new Error(`unknown element id ${id}`);
  return found;
}

function centroidOf(memberIds: string[]): [number, number] {
  const members = memberIds.map(elementById);
  const meanGroup = members.reduce((sum, element) => sum + element.group, 0) / members.length;
  const meanPeriod = members.reduce((sum, element) => sum + element.period, 0) / members.length;
  return [meanGroup, meanPeriod];
}

const territoryOf = new Map<string, string>();
for (const [territoryId, memberIds] of Object.entries(TERRITORY_MEMBERS)) {
  for (const memberId of memberIds) territoryOf.set(memberId, territoryId);
}

const familyOf = new Map<string, string>();
for (const [familyId, childIds] of Object.entries(FAMILY_CHILDREN)) {
  for (const childId of childIds) familyOf.set(childId, familyId);
}

const leaves: Territory[] = Object.entries(TERRITORY_MEMBERS).map(([id, members]) => {
  const parent = familyOf.get(id);
  return {
    id,
    name: TERRITORY_NAMES[id] ?? id,
    members,
    centroid: centroidOf(members),
    ...(parent === undefined ? {} : { parent }),
  };
});

// Families come after the leaves, so the spec's first territory is still a block.
const families: Territory[] = Object.entries(FAMILY_CHILDREN).map(([id, childIds]) => ({
  id,
  name: FAMILY_NAMES[id] ?? id,
  members: [],
  centroid: centroidOf(childIds.flatMap((childId) => TERRITORY_MEMBERS[childId] ?? [])),
}));

const territories: Territory[] = [...leaves, ...families];

const nodes: MapNode[] = ELEMENTS.map((seed) => {
  const state: NodeState | undefined = VISITED_IDS.has(seed.id) ? "visited" : undefined;
  return {
    id: seed.id,
    label: seed.symbol,
    x: seed.group,
    y: seed.period,
    territory: territoryOf.get(seed.id) ?? null,
    ...(state ? { state } : {}),
    meta: { name: seed.name, atomicNumber: seed.atomicNumber },
  };
});

export const elementsSpec: MapSpec = {
  version: "1",
  territories,
  nodes,
};
