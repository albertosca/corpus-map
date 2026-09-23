import type { MapNode, MapSpec, Territory } from "corpus-map";

/**
 * Bright stars placed by right ascension (x, hours 0-24) and declination
 * (y, degrees -90..90). Territories are constellations. A handful of stars
 * are left unassigned (`territory: null`) and omitted from every `members`
 * list, so the unassigned path is exercised by the shipped demo too.
 */

interface StarSeed {
  id: string;
  name: string;
  ra: number;
  dec: number;
  magnitude: number;
  constellation: string;
}

const ASSIGNED_STARS: StarSeed[] = [
  // Orion
  { id: "betelgeuse", name: "Betelgeuse", ra: 5.9195, dec: 7.407, magnitude: 0.42, constellation: "Orion" },
  { id: "rigel", name: "Rigel", ra: 5.2423, dec: -8.202, magnitude: 0.13, constellation: "Orion" },
  { id: "bellatrix", name: "Bellatrix", ra: 5.4188, dec: 6.35, magnitude: 1.64, constellation: "Orion" },
  { id: "mintaka", name: "Mintaka", ra: 5.5334, dec: -0.299, magnitude: 2.23, constellation: "Orion" },
  { id: "alnilam", name: "Alnilam", ra: 5.6036, dec: -1.202, magnitude: 1.69, constellation: "Orion" },
  { id: "alnitak", name: "Alnitak", ra: 5.6793, dec: -1.943, magnitude: 1.88, constellation: "Orion" },
  { id: "saiph", name: "Saiph", ra: 5.7959, dec: -9.67, magnitude: 2.09, constellation: "Orion" },
  // Ursa Major (the Big Dipper)
  { id: "dubhe", name: "Dubhe", ra: 11.0621, dec: 61.751, magnitude: 1.79, constellation: "Ursa Major" },
  { id: "merak", name: "Merak", ra: 11.0307, dec: 56.382, magnitude: 2.37, constellation: "Ursa Major" },
  { id: "phecda", name: "Phecda", ra: 11.8972, dec: 53.695, magnitude: 2.44, constellation: "Ursa Major" },
  { id: "megrez", name: "Megrez", ra: 12.257, dec: 57.033, magnitude: 3.32, constellation: "Ursa Major" },
  { id: "alioth", name: "Alioth", ra: 12.9005, dec: 55.96, magnitude: 1.77, constellation: "Ursa Major" },
  { id: "mizar", name: "Mizar", ra: 13.3988, dec: 54.925, magnitude: 2.23, constellation: "Ursa Major" },
  { id: "alkaid", name: "Alkaid", ra: 13.7923, dec: 49.313, magnitude: 1.86, constellation: "Ursa Major" },
  // Scorpius
  { id: "antares", name: "Antares", ra: 16.4901, dec: -26.432, magnitude: 0.96, constellation: "Scorpius" },
  { id: "shaula", name: "Shaula", ra: 17.5601, dec: -37.104, magnitude: 1.63, constellation: "Scorpius" },
  { id: "sargas", name: "Sargas", ra: 17.622, dec: -42.998, magnitude: 1.87, constellation: "Scorpius" },
  { id: "dschubba", name: "Dschubba", ra: 16.0056, dec: -22.622, magnitude: 2.29, constellation: "Scorpius" },
  { id: "pi-scorpii", name: "Pi Scorpii", ra: 15.9788, dec: -26.114, magnitude: 2.89, constellation: "Scorpius" },
  // Crux (the Southern Cross)
  { id: "acrux", name: "Acrux", ra: 12.4433, dec: -63.099, magnitude: 0.77, constellation: "Crux" },
  { id: "mimosa", name: "Mimosa", ra: 12.7953, dec: -59.689, magnitude: 1.25, constellation: "Crux" },
  { id: "gacrux", name: "Gacrux", ra: 12.5194, dec: -57.113, magnitude: 1.63, constellation: "Crux" },
  { id: "delta-crucis", name: "Delta Crucis", ra: 12.2522, dec: -58.749, magnitude: 2.79, constellation: "Crux" },
  // Cassiopeia
  { id: "schedar", name: "Schedar", ra: 0.6751, dec: 56.537, magnitude: 2.24, constellation: "Cassiopeia" },
  { id: "caph", name: "Caph", ra: 0.153, dec: 59.15, magnitude: 2.28, constellation: "Cassiopeia" },
  {
    id: "gamma-cassiopeiae",
    name: "Gamma Cassiopeiae",
    ra: 0.9451,
    dec: 60.717,
    magnitude: 2.47,
    constellation: "Cassiopeia",
  },
  { id: "ruchbah", name: "Ruchbah", ra: 1.4304, dec: 60.235, magnitude: 2.68, constellation: "Cassiopeia" },
  { id: "segin", name: "Segin", ra: 1.9066, dec: 63.67, magnitude: 3.35, constellation: "Cassiopeia" },
  // Leo
  { id: "regulus", name: "Regulus", ra: 10.1395, dec: 11.967, magnitude: 1.36, constellation: "Leo" },
  { id: "denebola", name: "Denebola", ra: 11.8177, dec: 14.572, magnitude: 2.14, constellation: "Leo" },
  { id: "algieba", name: "Algieba", ra: 10.3327, dec: 19.842, magnitude: 2.01, constellation: "Leo" },
  { id: "zosma", name: "Zosma", ra: 11.2351, dec: 20.524, magnitude: 2.56, constellation: "Leo" },
];

// Bright stars whose home constellations are not represented as territories
// here, left unassigned on purpose.
const UNASSIGNED_STARS: StarSeed[] = [
  { id: "sirius", name: "Sirius", ra: 6.7525, dec: -16.716, magnitude: -1.46, constellation: "Canis Major" },
  { id: "vega", name: "Vega", ra: 18.6156, dec: 38.784, magnitude: 0.03, constellation: "Lyra" },
  { id: "capella", name: "Capella", ra: 5.2782, dec: 45.998, magnitude: 0.08, constellation: "Auriga" },
  { id: "arcturus", name: "Arcturus", ra: 14.261, dec: 19.182, magnitude: -0.05, constellation: "Bootes" },
  { id: "polaris", name: "Polaris", ra: 2.5303, dec: 89.264, magnitude: 1.98, constellation: "Ursa Minor" },
];

const ALL_STARS: StarSeed[] = [...ASSIGNED_STARS, ...UNASSIGNED_STARS];

const TERRITORY_MEMBERS: Record<string, string[]> = ASSIGNED_STARS.reduce<Record<string, string[]>>((acc, star) => {
  const list = acc[star.constellation] ?? [];
  list.push(star.id);
  acc[star.constellation] = list;
  return acc;
}, {});

function starById(id: string): StarSeed {
  const found = ALL_STARS.find((s) => s.id === id);
  if (!found) throw new Error(`unknown star id ${id}`);
  return found;
}

function centroidOf(memberIds: string[]): [number, number] {
  const members = memberIds.map(starById);
  const x = members.reduce((sum, s) => sum + s.ra, 0) / members.length;
  const y = members.reduce((sum, s) => sum + s.dec, 0) / members.length;
  return [x, y];
}

const territoryOf = new Map<string, string>();
for (const [constellation, memberIds] of Object.entries(TERRITORY_MEMBERS)) {
  for (const memberId of memberIds) territoryOf.set(memberId, constellation);
}

const territories: Territory[] = Object.entries(TERRITORY_MEMBERS).map(([id, members]) => ({
  id,
  name: id,
  members,
  centroid: centroidOf(members),
}));

const nodes: MapNode[] = ALL_STARS.map((star) => ({
  id: star.id,
  label: star.name,
  x: star.ra,
  y: star.dec,
  territory: territoryOf.get(star.id) ?? null,
  meta: { constellation: star.constellation, magnitude: star.magnitude },
}));

export const constellationsSpec: MapSpec = {
  version: "1",
  territories,
  nodes,
};
