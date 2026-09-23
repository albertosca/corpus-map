export interface Theme {
  territoryFill: string;
  territoryStroke: string;
  territoryLabel: string;
  territoryFont: string;
  visited: string;
  unvisited: string;
  pointRadius: number;
}

export const DEFAULT_THEME: Theme = {
  territoryFill: "rgba(120,120,140,0.10)",
  territoryStroke: "rgba(120,120,140,0.55)",
  territoryLabel: "rgba(40,40,50,0.90)",
  territoryFont: "600 14px system-ui, sans-serif",
  visited: "rgba(220,110,40,0.95)",
  unvisited: "rgba(140,140,150,0.35)",
  pointRadius: 3.5,
};
