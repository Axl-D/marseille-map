/** Camera maxBounds: slightly outside the overlay so coast/islands stay in frame. */
export const MAP_MAX_BOUNDS: [[number, number], [number, number]] = [
  [5.18, 43.14],
  [5.58, 43.43],
];

const TILE_SIZE = 512;

function lngToX(lng: number): number {
  return (lng + 180) / 360;
}

function latToY(lat: number): number {
  const sin = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - (0.25 * Math.log((1 + sin) / (1 - sin))) / Math.PI;
  return Math.min(1, Math.max(0, y));
}

/** Lowest zoom where `bounds` still fill `width`×`height` (MapLibre tileSize 512). */
export function minZoomToFitBounds(
  bounds: [[number, number], [number, number]],
  width: number,
  height: number,
): number {
  if (width <= 0 || height <= 0) return 10;
  const [[west, south], [east, north]] = bounds;
  const dx = Math.abs(lngToX(east) - lngToX(west));
  const dy = Math.abs(latToY(south) - latToY(north));
  const zoomX = Math.log2(width / (TILE_SIZE * dx));
  const zoomY = Math.log2(height / (TILE_SIZE * dy));
  return Math.min(zoomX, zoomY);
}
