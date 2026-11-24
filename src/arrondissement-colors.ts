import type { ExpressionSpecification } from "maplibre-gl";

/** Pastels from the 16-arrondissement poster. Keys are arrondissement numbers. */
export const ARRONDISSEMENT_COLORS: Record<string, string> = {
  "1": "#f2d48a",
  "2": "#e0b85c",
  "3": "#c9b4d9",
  "4": "#e89a4a",
  "5": "#f0c49a",
  "6": "#efe07a",
  "7": "#e8d5b0",
  "8": "#e8b4c8",
  "9": "#e0c8a0",
  "10": "#f3e6c4",
  "11": "#b5d4a8",
  "12": "#b4c6e4",
  "13": "#e0b0cc",
  "14": "#f0e8b8",
  "15": "#a8b8c8",
  "16": "#f0c4b0",
};

export const ARRONDISSEMENT_FILL_FALLBACK = "#d9d0c4";

export function arrondissementColorMatch(): ExpressionSpecification {
  const expr: unknown[] = ["match", ["get", "arrondissement"]];
  for (const [num, color] of Object.entries(ARRONDISSEMENT_COLORS)) {
    expr.push(num, color);
  }
  expr.push(ARRONDISSEMENT_FILL_FALLBACK);
  return expr as ExpressionSpecification;
}
