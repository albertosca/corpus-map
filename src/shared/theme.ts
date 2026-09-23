import type { LabelClass } from "../labels/placement";

export interface Theme {
  territoryFill: string;
  territoryStroke: string;
  territoryLabel: string;
  territoryFonts: Record<LabelClass, string>;
  cardBackground: string;
  cardBorder: string;
  hoverBackground: string;
  hoverText: string;
  visited: string;
  unvisited: string;
  pointRadius: number;
}

export const DEFAULT_THEME: Theme = {
  territoryFill: "rgba(120,120,140,0.10)",
  territoryStroke: "rgba(120,120,140,0.55)",
  territoryLabel: "rgba(40,40,50,0.90)",
  territoryFonts: {
    large: "700 20px system-ui, sans-serif",
    medium: "600 15px system-ui, sans-serif",
    small: "500 12px system-ui, sans-serif",
  },
  cardBackground: "rgba(255,255,255,0.96)",
  cardBorder: "rgba(120,120,140,0.45)",
  hoverBackground: "rgba(30,30,40,0.92)",
  hoverText: "#ffffff",
  visited: "rgba(220,110,40,0.95)",
  unvisited: "rgba(140,140,150,0.35)",
  pointRadius: 3.5,
};
