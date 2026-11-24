import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  IRIS_URL,
  bakeFromIris,
  writeIgnBake,
} from "./fetch-boundaries.mjs";

export async function fetchIrisGeojson(url = IRIS_URL) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "marseille-map/0.1 (IRIS overlay; IGN/INSEE via Cartiflette)",
    },
  });
  if (!response.ok) {
    throw new Error(`IRIS ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function loadOsmNames(rootDir) {
  const osmPath = join(rootDir, "data/full/osm-quartiers.geojson");
  const legacyPath = join(rootDir, "data/full/quartiers.geojson");
  if (!existsSync(osmPath) && existsSync(legacyPath)) {
    copyFileSync(legacyPath, osmPath);
  }
  if (!existsSync(osmPath)) {
    throw new Error("missing data/full/osm-quartiers.geojson (OSM names gazetteer)");
  }
  return JSON.parse(readFileSync(osmPath, "utf8"));
}

async function main() {
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
  const fromFile = process.argv[2];
  const raw = fromFile
    ? JSON.parse(readFileSync(fromFile, "utf8"))
    : await fetchIrisGeojson();
  const osm = loadOsmNames(rootDir);
  const baked = bakeFromIris(raw, osm);
  writeIgnBake(baked, rootDir);
  console.log(
    `wrote ${baked.iris.features.length} IRIS, ${baked.quartiers.features.length} quartiers, ${baked.arrondissements.features.length} arrondissements`,
  );
}

const invoked = fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
