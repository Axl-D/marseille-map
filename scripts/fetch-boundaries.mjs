import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import pointOnFeature from "@turf/point-on-feature";
import { inlandLabelPoint, inlandLabelPoints } from "../src/inland-label.ts";

const require = createRequire(import.meta.url);
const osmtogeojson = require("osmtogeojson");

export const QUARTIER_PARENT = 11176262;
export const ARRONDISSEMENT_PARENT = 11176261;
export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
/** 6 decimals ≈ 11 cm ≈ 0.06 px at z16. Same vertices, shorter JSON digits. */
export const COORD_DECIMALS = 6;
export const MARSEILLE_IRIS_COUNT = 393;
export const IRIS_URL =
  "https://cartiflette-api.lab.sspcloud.fr/v1/geojson?year=2025&borders=IRIS&filter_by=COMMUNE&values=13055&simplification=0";

const OVERPASS_QUERY = `[out:json][timeout:180];
(
  relation(${QUARTIER_PARENT});
  relation(${ARRONDISSEMENT_PARENT});
);
rel(r);
out geom;
`;

export function osmRelationId(feature) {
  const raw =
    feature.properties?.osm_relation ??
    feature.properties?.["@id"] ??
    feature.id;
  if (typeof raw === "number") return raw;
  const match = String(raw).match(/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

export function arrondissementNumber(props = {}) {
  const insee = String(props["ref:INSEE"] ?? props.ref_insee ?? "");
  const inseeMatch = insee.match(/^132(\d{2})$/);
  if (inseeMatch) return String(Number(inseeMatch[1]));

  const alt = String(props.alt_name ?? "");
  const altMatch = alt.match(/Marseille\s*0?(\d+)/i);
  if (altMatch) return String(Number(altMatch[1]));

  const name = String(props.name ?? props["name:fr"] ?? "");
  const nameMatch = name.match(/(\d+)/);
  if (nameMatch) return String(Number(nameMatch[1]));

  return null;
}

export function stripFeature(feature, adminLevel) {
  const id = osmRelationId(feature);
  const props = feature.properties ?? {};
  return {
    type: "Feature",
    id,
    properties: {
      id,
      name: props.name ?? props["name:fr"] ?? "",
      name_fr: props["name:fr"] ?? props.name ?? "",
      admin_level: String(adminLevel),
      ref_insee: props["ref:INSEE"] ?? props.ref_insee ?? "",
      osm_relation: id,
    },
    geometry: feature.geometry,
  };
}

function isPolygonFeature(feature) {
  const type = feature?.geometry?.type;
  return type === "Polygon" || type === "MultiPolygon";
}

export function splitCollections(geojson) {
  const quartiers = [];
  const arrondissements = [];

  for (const feature of geojson.features ?? []) {
    if (!isPolygonFeature(feature)) continue;
    const level = String(feature.properties?.admin_level ?? "");
    if (level === "10") {
      quartiers.push(stripFeature(feature, "10"));
    } else if (level === "9") {
      const stripped = stripFeature(feature, "9");
      stripped.properties.arrondissement = arrondissementNumber(feature.properties);
      arrondissements.push(stripped);
    }
  }

  return {
    quartiers: { type: "FeatureCollection", features: quartiers },
    arrondissements: { type: "FeatureCollection", features: arrondissements },
  };
}

function containingArrondissement(point, arrondissements) {
  for (const feature of arrondissements.features) {
    if (booleanPointInPolygon(point, feature)) {
      return feature.properties.arrondissement;
    }
  }
  return null;
}

export function joinQuartiersToArrondissements(quartiers, arrondissements) {
  return {
    type: "FeatureCollection",
    features: quartiers.features.map((quartier) => {
      const point = pointOnFeature(quartier);
      const arrondissement = containingArrondissement(point, arrondissements);
      return {
        ...quartier,
        properties: {
          ...quartier.properties,
          arrondissement,
        },
      };
    }),
  };
}

export function validateCollections(quartiers, arrondissements) {
  if (arrondissements.features.length !== 16) {
    throw new Error(`expected 16 arrondissements, got ${arrondissements.features.length}`);
  }
  if (quartiers.features.length !== 111) {
    throw new Error(`expected 111 quartiers, got ${quartiers.features.length}`);
  }

  const arrNums = new Set(
    arrondissements.features.map((f) => f.properties.arrondissement),
  );
  if (arrNums.size !== 16) {
    throw new Error(`arrondissement numbers not unique: ${[...arrNums].join(",")}`);
  }
  for (let n = 1; n <= 16; n++) {
    if (!arrNums.has(String(n))) {
      throw new Error(`missing arrondissement ${n}`);
    }
  }

  const missing = quartiers.features.filter((f) => {
    const n = Number(f.properties.arrondissement);
    return !Number.isInteger(n) || n < 1 || n > 16;
  });
  if (missing.length) {
    const names = missing.map((f) => f.properties.name || f.id).join(", ");
    throw new Error(`${missing.length} quartiers missing arrondissement: ${names}`);
  }
}

export async function fetchOverpass(query = OVERPASS_QUERY, url = OVERPASS_URL) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "marseille-map/0.1 (local overlay; https://www.openstreetmap.org)",
    },
    body: new URLSearchParams({ data: query }),
  });
  if (!response.ok) {
    throw new Error(`Overpass ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

export function bakeFromOsm(osm) {
  const geojson = osmtogeojson(osm);
  const split = splitCollections(geojson);
  const quartiers = joinQuartiersToArrondissements(
    split.quartiers,
    split.arrondissements,
  );
  validateCollections(quartiers, split.arrondissements);
  return { quartiers, arrondissements: split.arrondissements };
}

export function roundGeometry(geometry, decimals = COORD_DECIMALS) {
  if (!geometry?.coordinates) return geometry;
  const f = 10 ** decimals;
  const round = (coords) => {
    if (typeof coords[0] === "number") {
      return [Math.round(coords[0] * f) / f, Math.round(coords[1] * f) / f];
    }
    return coords.map(round);
  };
  return { ...geometry, coordinates: round(geometry.coordinates) };
}

export function roundCollection(collection, decimals = COORD_DECIMALS) {
  const f = 10 ** decimals;
  const roundN = (n) => Math.round(n * f) / f;
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) => {
      const next = {
        ...feature,
        geometry: roundGeometry(feature.geometry, decimals),
      };
      if (feature.bbox) next.bbox = feature.bbox.map(roundN);
      return next;
    }),
  };
}

export function featureExtent(feature) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const geometry = feature?.geometry;
  const walk = (coords) => {
    if (typeof coords[0] === "number") {
      const x = coords[0];
      const y = coords[1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      return;
    }
    for (const part of coords) walk(part);
  };
  if (geometry?.coordinates) walk(geometry.coordinates);
  return [minX, minY, maxX, maxY];
}

export function irisSearchIndex(iris) {
  return {
    type: "FeatureCollection",
    features: iris.features.map((feature) => {
      const bbox = featureExtent(feature);
      return {
        type: "Feature",
        id: feature.properties.id,
        bbox,
        properties: {
          id: feature.properties.id,
          name: feature.properties.name,
          arrondissement: feature.properties.arrondissement,
          quartier: feature.properties.quartier,
          quartier_insee: feature.properties.quartier_insee,
        },
        geometry: {
          type: "Point",
          coordinates: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
        },
      };
    }),
  };
}

export function arrSearchIndex(arrondissements) {
  return {
    type: "FeatureCollection",
    features: arrondissements.features.map((feature) => {
      const bbox = featureExtent(feature);
      const n = feature.properties.arrondissement;
      return {
        type: "Feature",
        id: feature.properties.id,
        bbox,
        properties: {
          id: feature.properties.id,
          name: n,
          arrondissement: n,
        },
        geometry: {
          type: "Point",
          coordinates: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
        },
      };
    }),
  };
}

export function stripIrisFeature(feature) {
  const props = feature.properties ?? {};
  const code = String(props.CODE_IRIS ?? props.code_iris ?? "");
  const id = Number(code);
  const cog = String(props.INSEE_COG ?? "");
  return {
    type: "Feature",
    id,
    properties: {
      id,
      name: props.NOM_IRIS ?? props.name ?? "",
      code_iris: code,
      typ_iris: props.TYP_IRIS ?? props.typ_iris ?? "",
      arrondissement: arrondissementNumber({ "ref:INSEE": cog }) ?? "",
      quartier: "",
      quartier_insee: code.slice(0, 7),
    },
    geometry: feature.geometry,
  };
}

function allRings(feature) {
  const geometry = feature?.geometry;
  if (geometry?.type === "Polygon") return geometry.coordinates ?? [];
  if (geometry?.type === "MultiPolygon") {
    return (geometry.coordinates ?? []).flat();
  }
  return [];
}

function quantize(value, decimals = 6) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function segmentKey(a, b, decimals = 6) {
  let ax = quantize(a[0], decimals);
  let ay = quantize(a[1], decimals);
  let bx = quantize(b[0], decimals);
  let by = quantize(b[1], decimals);
  if (ax > bx || (ax === bx && ay > by)) {
    [ax, ay, bx, by] = [bx, by, ax, ay];
  }
  return `${ax},${ay}|${bx},${by}`;
}

function pointKey(coord) {
  return `${quantize(coord[0])},${quantize(coord[1])}`;
}

function stitchSegments(segments) {
  const adj = new Map();
  const coordOf = new Map();
  const addEdge = (from, to, toCoord) => {
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from).push({ to, coord: toCoord, used: false });
  };
  for (const { a, b } of segments) {
    const ka = pointKey(a);
    const kb = pointKey(b);
    if (ka === kb) continue;
    coordOf.set(ka, a);
    coordOf.set(kb, b);
    addEdge(ka, kb, b);
    addEdge(kb, ka, a);
  }

  const markReverse = (from, to) => {
    const edge = (adj.get(from) ?? []).find((e) => e.to === to && !e.used);
    if (edge) edge.used = true;
  };

  const walk = (startKey) => {
    const start = coordOf.get(startKey);
    const line = start ? [start] : [];
    let key = startKey;
    while (true) {
      const next = (adj.get(key) ?? []).find((e) => !e.used);
      if (!next) break;
      next.used = true;
      markReverse(next.to, key);
      line.push(next.coord);
      key = next.to;
    }
    return line;
  };

  const lines = [];
  const odd = [];
  for (const [key, edges] of adj) {
    if (edges.length % 2 === 1) odd.push(key);
  }
  for (const key of odd) {
    if ((adj.get(key) ?? []).some((e) => !e.used)) {
      const line = walk(key);
      if (line.length >= 2) lines.push(line);
    }
  }
  for (const key of adj.keys()) {
    if ((adj.get(key) ?? []).some((e) => !e.used)) {
      const line = walk(key);
      if (line.length >= 2) lines.push(line);
    }
  }
  return lines;
}

function lineCollection(segments) {
  return {
    type: "FeatureCollection",
    features: stitchSegments(segments).map((coordinates, i) => ({
      type: "Feature",
      id: i + 1,
      properties: { id: i + 1 },
      geometry: { type: "LineString", coordinates },
    })),
  };
}

export function mosaicLines(iris) {
  const counts = new Map();
  for (const feature of iris.features ?? []) {
    const code = String(feature.properties?.quartier_insee ?? "");
    for (const ring of allRings(feature)) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i];
        const b = ring[i + 1];
        if (a[0] === b[0] && a[1] === b[1]) continue;
        const key = segmentKey(a, b);
        let rec = counts.get(key);
        if (!rec) {
          rec = { count: 0, a, b, quartiers: new Set() };
          counts.set(key, rec);
        }
        rec.count += 1;
        if (code) rec.quartiers.add(code);
      }
    }
  }

  const irisSegs = [];
  const quartierSegs = [];
  for (const seg of counts.values()) {
    const inner = seg.count >= 2 && seg.quartiers.size === 1;
    if (inner) irisSegs.push(seg);
    else quartierSegs.push(seg);
  }

  return {
    irisLines: lineCollection(irisSegs),
    quartierLines: lineCollection(quartierSegs),
  };
}

export function asMultiPolygon(features) {
  const coordinates = [];
  for (const feature of features) {
    const geometry = feature?.geometry;
    if (geometry?.type === "Polygon") coordinates.push(geometry.coordinates);
    else if (geometry?.type === "MultiPolygon") {
      coordinates.push(...geometry.coordinates);
    }
  }
  if (coordinates.length === 1) {
    return { type: "Polygon", coordinates: coordinates[0] };
  }
  return { type: "MultiPolygon", coordinates };
}

function majorityIrisQuartierName(members) {
  const counts = new Map();
  for (const feature of members) {
    const name = String(feature.properties?.quartier ?? "").trim();
    if (!name || /^\d+$/.test(name)) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}

export function nameQuartier(geometry, code, osmQuartiers) {
  for (const quartier of osmQuartiers?.features ?? []) {
    if (String(quartier.properties?.ref_insee ?? "") === code) {
      return quartier.properties.name;
    }
  }
  const host = { type: "Feature", properties: {}, geometry };
  try {
    const point = pointOnFeature(host);
    for (const quartier of osmQuartiers?.features ?? []) {
      if (booleanPointInPolygon(point, quartier)) {
        return quartier.properties.name;
      }
    }
  } catch {
    /* empty geometry */
  }
  return code;
}

function asIrisFeature(feature) {
  if (feature.properties?.code_iris) {
    const code = String(feature.properties.code_iris);
    return {
      ...feature,
      id: feature.id ?? Number(code),
      properties: {
        ...feature.properties,
        id: feature.properties.id ?? Number(code),
        quartier_insee:
          feature.properties.quartier_insee || code.slice(0, 7),
        quartier: feature.properties.quartier ?? "",
      },
    };
  }
  return stripIrisFeature(feature);
}

export function bakeFromIris(raw, osmQuartiers) {
  const iris = {
    type: "FeatureCollection",
    features: (raw.features ?? [])
      .filter(isPolygonFeature)
      .map(asIrisFeature)
      .filter((feature) =>
        String(feature.properties?.code_iris ?? "").startsWith("132"),
      ),
  };

  const byCode = new Map();
  for (const feature of iris.features) {
    const code = feature.properties.quartier_insee;
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(feature);
  }

  const quartiers = { type: "FeatureCollection", features: [] };
  for (const [code, members] of [...byCode.entries()].sort()) {
    const geometry = asMultiPolygon(members);
    const name =
      majorityIrisQuartierName(members) ||
      nameQuartier(geometry, code, osmQuartiers);
    const arrondissement = members[0].properties.arrondissement;
    const id = Number(code);
    quartiers.features.push({
      type: "Feature",
      id,
      properties: {
        id,
        name,
        name_fr: name,
        arrondissement,
        ref_insee: code,
        iris_names: members
          .map((row) => row.properties.name)
          .sort((a, b) => a.localeCompare(b, "fr")),
      },
      geometry,
    });
  }

  const nameByCode = new Map(
    quartiers.features.map((feature) => [
      feature.properties.ref_insee,
      feature.properties.name,
    ]),
  );
  for (const feature of iris.features) {
    feature.properties.quartier =
      nameByCode.get(feature.properties.quartier_insee) ??
      feature.properties.quartier;
  }

  const byArr = new Map();
  for (const feature of iris.features) {
    const n = feature.properties.arrondissement;
    if (!byArr.has(n)) byArr.set(n, []);
    byArr.get(n).push(feature);
  }
  const arrondissements = {
    type: "FeatureCollection",
    features: [...byArr.entries()]
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([n, members]) => ({
        type: "Feature",
        id: Number(n),
        properties: {
          id: Number(n),
          name: n,
          name_fr: n,
          arrondissement: n,
          admin_level: "9",
          ref_insee: `132${String(n).padStart(2, "0")}`,
        },
        geometry: asMultiPolygon(members),
      })),
  };

  const { irisLines, quartierLines } = mosaicLines(iris);
  validateCollections(quartiers, arrondissements);
  validateIris(iris);
  return { iris, quartiers, arrondissements, irisLines, quartierLines };
}

export function validateIris(iris) {
  if (iris.features.length !== MARSEILLE_IRIS_COUNT) {
    throw new Error(`expected ${MARSEILLE_IRIS_COUNT} IRIS, got ${iris.features.length}`);
  }
  const missing = iris.features.filter((f) => !f.properties?.name || !f.properties?.quartier);
  if (missing.length) {
    const names = missing
      .slice(0, 8)
      .map((f) => f.properties?.name || f.properties?.code_iris || f.id)
      .join(", ");
    throw new Error(`${missing.length} IRIS missing name or quartier: ${names}`);
  }
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data));
}

function arrLabelBias(quartiers) {
  const mazargues = quartiers.features.find(
    (feature) => feature.properties.name === "Mazargues",
  );
  if (!mazargues) return undefined;
  return { "9": { toward: inlandLabelPoint(mazargues), t: 0.6 } };
}

export function writeIgnBake(baked, rootDir) {
  const fullDir = join(rootDir, "data", "full");
  const dataDir = join(rootDir, "public", "data");
  mkdirSync(fullDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });

  const quartierLabels = inlandLabelPoints(baked.quartiers);
  const arrLabels = inlandLabelPoints(
    baked.arrondissements,
    arrLabelBias(baked.quartiers),
  );
  const irisLabels = inlandLabelPoints(baked.iris);
  const irisIndex = irisSearchIndex(baked.iris);
  const arrIndex = arrSearchIndex(baked.arrondissements);

  writeJson(join(fullDir, "quartiers.geojson"), baked.quartiers);
  writeJson(join(fullDir, "arrondissements.geojson"), baked.arrondissements);
  writeJson(join(fullDir, "iris.geojson"), baked.iris);
  writeJson(join(fullDir, "iris-lines.geojson"), baked.irisLines);
  writeJson(join(fullDir, "quartier-lines.geojson"), baked.quartierLines);
  writeJson(join(fullDir, "quartier-labels.geojson"), quartierLabels);
  writeJson(join(fullDir, "arrondissement-labels.geojson"), arrLabels);
  writeJson(join(fullDir, "iris-labels.geojson"), irisLabels);
  writeJson(join(fullDir, "iris-index.geojson"), irisIndex);
  writeJson(join(fullDir, "arr-index.geojson"), arrIndex);

  writeJson(join(dataDir, "quartiers.geojson"), roundCollection(baked.quartiers));
  writeJson(join(dataDir, "iris-lines.geojson"), roundCollection(baked.irisLines));
  writeJson(
    join(dataDir, "quartier-lines.geojson"),
    roundCollection(baked.quartierLines),
  );
  writeJson(join(dataDir, "quartier-labels.geojson"), roundCollection(quartierLabels));
  writeJson(
    join(dataDir, "arrondissement-labels.geojson"),
    roundCollection(arrLabels),
  );
  writeJson(join(dataDir, "iris-labels.geojson"), roundCollection(irisLabels));
  writeJson(join(dataDir, "iris-index.geojson"), roundCollection(irisIndex));
  writeJson(join(dataDir, "arr-index.geojson"), roundCollection(arrIndex));

  const staleIris = join(dataDir, "iris.geojson");
  if (existsSync(staleIris)) unlinkSync(staleIris);
  const staleArr = join(dataDir, "arrondissements.geojson");
  if (existsSync(staleArr)) unlinkSync(staleArr);
}

export function writeOsmGazetteer(quartiers, rootDir) {
  const fullDir = join(rootDir, "data", "full");
  mkdirSync(fullDir, { recursive: true });
  writeJson(join(fullDir, "osm-quartiers.geojson"), quartiers);
}

async function main() {
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  const osm = await fetchOverpass();
  const { quartiers } = bakeFromOsm(osm);
  writeOsmGazetteer(quartiers, rootDir);
  console.log(`wrote OSM name gazetteer (${quartiers.features.length} quartiers)`);
}

const invoked = fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
