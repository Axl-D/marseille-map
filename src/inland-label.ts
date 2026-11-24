import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";

export type LabelProps = {
  id: number;
  name: string;
  arrondissement?: string;
};

export function ringArea(ring: number[][]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(area);
}

export function pointInRing(
  point: [number, number],
  ring: number[][],
): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (
      yi > y !== yj > y &&
      yj !== yi &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointInPolygon(
  point: [number, number],
  rings: number[][][],
): boolean {
  if (!rings[0] || !pointInRing(point, rings[0])) return false;
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(point, rings[i])) return false;
  }
  return true;
}

export function largestPolygonRings(
  feature: Feature<Polygon | MultiPolygon>,
): number[][][] {
  const parts = polygonParts(feature);
  let best = parts[0] ?? [];
  let bestArea = -1;
  for (const polygon of parts) {
    const area = ringArea(polygon[0] ?? []);
    if (area > bestArea) {
      bestArea = area;
      best = polygon;
    }
  }
  return best;
}

function polygonParts(
  feature: Feature<Polygon | MultiPolygon>,
): number[][][][] {
  return feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;
}

function partBbox(rings: number[][][]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of rings[0] ?? []) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function bboxesTouch(
  a: [number, number, number, number],
  b: [number, number, number, number],
  pad = 1e-4,
): boolean {
  return (
    a[0] <= b[2] + pad &&
    b[0] <= a[2] + pad &&
    a[1] <= b[3] + pad &&
    b[1] <= a[3] + pad
  );
}

function clusterArea(parts: number[][][][]): number {
  let area = 0;
  for (const rings of parts) area += ringArea(rings[0] ?? []);
  return area;
}

function connectedClusters(parts: number[][][][]): number[][][][][] {
  const parent = parts.map((_, i) => i);
  const find = (i: number): number =>
    parent[i] === i ? i : (parent[i] = find(parent[i]));
  const boxes = parts.map(partBbox);
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (!bboxesTouch(boxes[i], boxes[j])) continue;
      const a = find(i);
      const b = find(j);
      if (a !== b) parent[a] = b;
    }
  }
  const groups = new Map<number, number[][][][]>();
  for (let i = 0; i < parts.length; i++) {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(parts[i]);
    else groups.set(root, [parts[i]]);
  }
  return [...groups.values()].sort((a, b) => clusterArea(b) - clusterArea(a));
}

export function mainLandParts(
  feature: Feature<Polygon | MultiPolygon>,
): number[][][][] {
  const parts = polygonParts(feature);
  if (parts.length <= 1) return parts;
  return connectedClusters(parts)[0] ?? parts;
}

function pointInAnyPolygon(
  point: [number, number],
  parts: number[][][][],
): boolean {
  return parts.some((rings) => pointInPolygon(point, rings));
}

function shoelaceCentroid(ring: number[][]): [number, number] {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (twiceArea === 0) {
    const n = Math.max(ring.length - 1, 1);
    let x = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
      x += ring[i][0];
      y += ring[i][1];
    }
    return [x / n, y / n];
  }
  return [cx / (3 * twiceArea), cy / (3 * twiceArea)];
}

function areaWeightedCentroid(parts: number[][][][]): [number, number] {
  let areaSum = 0;
  let cx = 0;
  let cy = 0;
  for (const rings of parts) {
    const outer = rings[0] ?? [];
    const area = ringArea(outer);
    if (!area) continue;
    const [x, y] = shoelaceCentroid(outer);
    areaSum += area;
    cx += x * area;
    cy += y * area;
  }
  if (!areaSum) return [0, 0];
  return [cx / areaSum, cy / areaSum];
}

function gridMeanInsideParts(
  parts: number[][][][],
  steps: number,
): [number, number] | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rings of parts) {
    for (const [x, y] of rings[0] ?? []) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return null;

  const dx = (maxX - minX) / steps;
  const dy = (maxY - minY) / steps;
  let sx = 0;
  let sy = 0;
  let n = 0;
  const samples: [number, number][] = [];
  for (let i = 1; i < steps; i++) {
    for (let j = 1; j < steps; j++) {
      const p: [number, number] = [minX + dx * i, minY + dy * j];
      if (!pointInAnyPolygon(p, parts)) continue;
      samples.push(p);
      sx += p[0];
      sy += p[1];
      n++;
    }
  }
  if (!n) return null;

  const avg: [number, number] = [sx / n, sy / n];
  if (pointInAnyPolygon(avg, parts)) return avg;

  let best = samples[0];
  let bestD = Infinity;
  for (const p of samples) {
    const d = (p[0] - avg[0]) ** 2 + (p[1] - avg[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export function inlandLabelPoint(
  feature: Feature<Polygon | MultiPolygon>,
  steps = 20,
): [number, number] {
  const main = mainLandParts(feature);
  if (!main.length) return [0, 0];

  const centroid = areaWeightedCentroid(main);
  if (pointInAnyPolygon(centroid, main)) return centroid;

  return gridMeanInsideParts(main, steps) ?? centroid;
}

export function pullLabelPoint(
  feature: Feature<Polygon | MultiPolygon>,
  toward: [number, number],
  t: number,
): [number, number] {
  const origin = inlandLabelPoint(feature);
  const mixed: [number, number] = [
    origin[0] + (toward[0] - origin[0]) * t,
    origin[1] + (toward[1] - origin[1]) * t,
  ];
  return pointInAnyPolygon(mixed, mainLandParts(feature)) ? mixed : origin;
}

export function inlandLabelPoints(
  collection: FeatureCollection<Polygon | MultiPolygon>,
  bias?: Record<string, { toward: [number, number]; t: number }>,
): FeatureCollection<Point, LabelProps> {
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) => {
      const arrKey = feature.properties?.arrondissement as string | undefined;
      const pull = arrKey ? bias?.[arrKey] : undefined;
      const coordinates = pull
        ? pullLabelPoint(feature, pull.toward, pull.t)
        : inlandLabelPoint(feature);
      return {
        type: "Feature" as const,
        id: feature.properties?.id,
        properties: {
          id: feature.properties?.id,
          name: feature.properties?.name,
          arrondissement: feature.properties?.arrondissement,
        },
        geometry: { type: "Point" as const, coordinates },
      };
    }),
  };
}
