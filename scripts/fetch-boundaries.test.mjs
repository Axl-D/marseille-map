import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COORD_DECIMALS,
  arrondissementNumber,
  arrSearchIndex,
  mosaicLines,
  nameQuartier,
  joinQuartiersToArrondissements,
  stripFeature,
  stripIrisFeature,
  validateCollections,
  validateIris,
} from "./fetch-boundaries.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const quartiersPath = join(root, "public/data/quartiers.geojson");
const arrIndexPath = join(root, "public/data/arr-index.geojson");
const fullArrPath = join(root, "data/full/arrondissements.geojson");

test("arrondissementNumber reads INSEE ref and names", () => {
  assert.equal(arrondissementNumber({ "ref:INSEE": "13209" }), "9");
  assert.equal(arrondissementNumber({ alt_name: "Marseille 01" }), "1");
  assert.equal(arrondissementNumber({ name: "Marseille 1er Arrondissement" }), "1");
});

test("joinQuartiersToArrondissements assigns containing arrondissement", () => {
  const arrondissements = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: 1,
        properties: { id: 1, arrondissement: "1", name: "1e" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 2],
              [0, 0],
            ],
          ],
        },
      },
      {
        type: "Feature",
        id: 2,
        properties: { id: 2, arrondissement: "2", name: "2e" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [2, 0],
              [4, 0],
              [4, 2],
              [2, 2],
              [2, 0],
            ],
          ],
        },
      },
    ],
  };
  const quartiers = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: 10,
        properties: { id: 10, name: "A" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0.2, 0.2],
              [0.8, 0.2],
              [0.8, 0.8],
              [0.2, 0.8],
              [0.2, 0.2],
            ],
          ],
        },
      },
      {
        type: "Feature",
        id: 11,
        properties: { id: 11, name: "B" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [2.2, 0.2],
              [2.8, 0.2],
              [2.8, 0.8],
              [2.2, 0.8],
              [2.2, 0.2],
            ],
          ],
        },
      },
    ],
  };

  const joined = joinQuartiersToArrondissements(quartiers, arrondissements);
  assert.equal(joined.features[0].properties.arrondissement, "1");
  assert.equal(joined.features[1].properties.arrondissement, "2");
});

test("stripFeature keeps id, name, admin_level, ref, osm_relation", () => {
  const stripped = stripFeature(
    {
      type: "Feature",
      id: "relation/99",
      properties: {
        "@id": "relation/99",
        name: "Belsunce",
        "name:fr": "Belsunce",
        admin_level: "10",
        "ref:INSEE": "1320101",
        wikipedia: "fr:Belsunce",
      },
      geometry: { type: "Polygon", coordinates: [] },
    },
    "10",
  );
  assert.equal(stripped.id, 99);
  assert.deepEqual(stripped.properties, {
    id: 99,
    name: "Belsunce",
    name_fr: "Belsunce",
    admin_level: "10",
    ref_insee: "1320101",
    osm_relation: 99,
  });
});

test("baked GeoJSON has 111 quartiers, 16 arrondissements, complete join", () => {
  assert.equal(existsSync(quartiersPath), true, "public/data/quartiers.geojson");
  const quartiers = JSON.parse(readFileSync(quartiersPath, "utf8"));
  const arrondissements = JSON.parse(readFileSync(fullArrPath, "utf8"));
  validateCollections(quartiers, arrondissements);
});

test("stripIrisFeature keeps code, name, type, arrondissement", () => {
  const stripped = stripIrisFeature({
    type: "Feature",
    properties: {
      CODE_IRIS: "132010101",
      NOM_IRIS: "La Bourse",
      TYP_IRIS: "A",
      INSEE_COG: "13201",
      NOM_COM: "Marseille 1er Arrondissement",
      SOURCE: "IGN",
    },
    geometry: { type: "Polygon", coordinates: [] },
  });
  assert.equal(stripped.id, 132010101);
  assert.deepEqual(stripped.properties, {
    id: 132010101,
    name: "La Bourse",
    code_iris: "132010101",
    typ_iris: "A",
    arrondissement: "1",
    quartier: "",
    quartier_insee: "1320101",
  });
});

function squarePoly(id, ring, properties) {
  return {
    type: "Feature",
    id,
    properties,
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

function lineParts(collection) {
  const parts = [];
  for (const feature of collection.features) {
    const lines =
      feature.geometry.type === "LineString"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    parts.push(...lines);
  }
  return parts;
}

function hasVerticalSegment(collection, lon) {
  for (const line of lineParts(collection)) {
    for (let i = 0; i < line.length - 1; i++) {
      if (
        Math.abs(line[i][0] - lon) < 1e-5 &&
        Math.abs(line[i + 1][0] - lon) < 1e-5
      ) {
        return true;
      }
    }
  }
  return false;
}

function lineLons(collection) {
  return lineParts(collection).flatMap((line) => line.map(([lon]) => lon));
}

test("mosaicLines keeps same-quartier shared edges as IRIS, not quartier outline", () => {
  const left = squarePoly(132010101, [
    [5.372, 43.292],
    [5.38, 43.292],
    [5.38, 43.308],
    [5.372, 43.308],
    [5.372, 43.292],
  ], { name: "La Bourse", quartier_insee: "1320101" });
  const right = squarePoly(132010102, [
    [5.38, 43.292],
    [5.388, 43.292],
    [5.388, 43.308],
    [5.38, 43.308],
    [5.38, 43.292],
  ], { name: "Thubaneau", quartier_insee: "1320101" });
  const { irisLines, quartierLines } = mosaicLines({
    type: "FeatureCollection",
    features: [left, right],
  });
  assert.ok(hasVerticalSegment(irisLines, 5.38));
  assert.equal(hasVerticalSegment(quartierLines, 5.38), false);
});

test("mosaicLines treats different-quartier shared edges as quartier borders", () => {
  const left = squarePoly(11, [
    [5.372, 43.292],
    [5.38, 43.292],
    [5.38, 43.308],
    [5.372, 43.308],
    [5.372, 43.292],
  ], { name: "L", quartier_insee: "1320101" });
  const right = squarePoly(12, [
    [5.38, 43.292],
    [5.388, 43.292],
    [5.388, 43.308],
    [5.38, 43.308],
    [5.38, 43.292],
  ], { name: "R", quartier_insee: "1320102" });
  const { irisLines, quartierLines } = mosaicLines({
    type: "FeatureCollection",
    features: [left, right],
  });
  assert.equal(irisLines.features.length, 0);
  assert.ok(quartierLines.features.length >= 1);
  assert.ok(lineLons(quartierLines).some((lon) => Math.abs(lon - 5.38) < 1e-5));
});

test("baked IRIS GeoJSON has 393 Marseille blocks and Belsunce split", () => {
  const fullPath = join(root, "data/full/iris.geojson");
  assert.equal(existsSync(fullPath), true, "data/full/iris.geojson");
  const iris = JSON.parse(readFileSync(fullPath, "utf8"));
  validateIris(iris);
  const belsunce = iris.features
    .filter((f) => f.properties.quartier === "Belsunce")
    .map((f) => f.properties.name)
    .sort();
  assert.deepEqual(belsunce, [
    "Bernard du Bois",
    "Colbert-Providence",
    "La Bourse",
    "Thubaneau",
  ]);
});

test("baked IRIS lines are internal subdividers, not quartier outlines", () => {
  const linesPath = join(root, "public/data/iris-lines.geojson");
  const qLinesPath = join(root, "public/data/quartier-lines.geojson");
  assert.equal(existsSync(linesPath), true, "public/data/iris-lines.geojson");
  assert.equal(existsSync(qLinesPath), true, "public/data/quartier-lines.geojson");
  const lines = JSON.parse(readFileSync(linesPath, "utf8"));
  const qLines = JSON.parse(readFileSync(qLinesPath, "utf8"));
  assert.ok(lines.features.length > 0);
  assert.ok(qLines.features.length > 0);
  for (const feature of [...lines.features, ...qLines.features]) {
    assert.ok(
      feature.geometry.type === "LineString" ||
        feature.geometry.type === "MultiLineString",
    );
  }

  const fullIris = JSON.parse(readFileSync(join(root, "data/full/iris.geojson"), "utf8"));
  const belsunce = {
    type: "FeatureCollection",
    features: fullIris.features.filter((f) => f.properties.quartier === "Belsunce"),
  };
  assert.equal(belsunce.features.length, 4);
  const { irisLines, quartierLines } = mosaicLines(belsunce);
  assert.ok(irisLines.features.length >= 1, "Belsunce must have IRIS internals");
  assert.ok(quartierLines.features.length >= 1, "Belsunce must have an outer outline");
});

test("nameQuartier prefers OSM ref_insee then PIP", () => {
  const geometry = {
    type: "Polygon",
    coordinates: [
      [
        [0.2, 0.2],
        [0.8, 0.2],
        [0.8, 0.8],
        [0.2, 0.8],
        [0.2, 0.2],
      ],
    ],
  };
  const osm = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "Belsunce", ref_insee: "1320101" },
        geometry,
      },
      {
        type: "Feature",
        properties: { name: "Noë", ref_insee: "" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [2, 2],
              [3, 2],
              [3, 3],
              [2, 3],
              [2, 2],
            ],
          ],
        },
      },
    ],
  };
  assert.equal(nameQuartier(geometry, "1320101", osm), "Belsunce");
  assert.equal(
    nameQuartier(osm.features[1].geometry, "9999999", osm),
    "Noë",
  );
});

test("baked quartiers come from IGN IRIS prefixes, not OSM ids", () => {
  const quartiers = JSON.parse(readFileSync(quartiersPath, "utf8"));
  validateCollections(quartiers, JSON.parse(readFileSync(fullArrPath, "utf8")));
  const belsunce = quartiers.features.find((f) => f.properties.name === "Belsunce");
  assert.ok(belsunce);
  assert.equal(String(belsunce.properties.ref_insee), "1320101");
  assert.equal(belsunce.properties.id, 1320101);
});

test("Saint-Lambert card can list IGN IRIS names", () => {
  const quartiers = JSON.parse(readFileSync(quartiersPath, "utf8"));
  const names =
    quartiers.features.find((f) => f.properties.name === "Saint-Lambert")
      ?.properties.iris_names ?? [];
  assert.ok(names.includes("Samatan"), names.join(", "));
  assert.ok(names.includes("Dellepiane"), names.join(", "));
});

function vertexCount(fc) {
  let n = 0;
  const walk = (coords) => {
    if (typeof coords[0] === "number") {
      n += 1;
      return;
    }
    for (const part of coords) walk(part);
  };
  for (const feature of fc.features) walk(feature.geometry.coordinates);
  return n;
}

function maxCoordDecimals(fc) {
  let max = 0;
  const walk = (coords) => {
    if (typeof coords[0] === "number") {
      for (const n of coords) {
        const text = String(n);
        const dot = text.indexOf(".");
        if (dot >= 0) max = Math.max(max, text.length - dot - 1);
      }
      return;
    }
    for (const part of coords) walk(part);
  };
  for (const feature of fc.features) walk(feature.geometry.coordinates);
  return max;
}

test("public overlay keeps every IGN vertex; only rounds digits", () => {
  const full = JSON.parse(readFileSync(join(root, "data/full/quartiers.geojson"), "utf8"));
  const pub = JSON.parse(readFileSync(quartiersPath, "utf8"));
  assert.equal(vertexCount(full), vertexCount(pub));
  assert.ok(maxCoordDecimals(pub) <= COORD_DECIMALS);
  assert.equal(COORD_DECIMALS, 6);
});

test("arrSearchIndex emits Point features with polygon bbox", () => {
  const index = arrSearchIndex({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { id: 1, name: "1", arrondissement: "1" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 2],
              [0, 0],
            ],
          ],
        },
      },
    ],
  });
  assert.equal(index.features.length, 1);
  assert.equal(index.features[0].geometry.type, "Point");
  assert.deepEqual(index.features[0].bbox, [0, 0, 2, 2]);
  assert.deepEqual(index.features[0].geometry.coordinates, [1, 1]);
  assert.equal(index.features[0].properties.arrondissement, "1");
});

test("client ships IRIS index and labels, not polygons", () => {
  assert.equal(existsSync(join(root, "public/data/iris.geojson")), false);
  assert.equal(existsSync(join(root, "public/data/arrondissements.geojson")), false);
  const arrIndex = JSON.parse(readFileSync(arrIndexPath, "utf8"));
  assert.equal(arrIndex.features.length, 16);
  assert.equal(arrIndex.features[0].geometry.type, "Point");
  assert.equal(arrIndex.features[0].bbox.length, 4);
  const index = JSON.parse(
    readFileSync(join(root, "public/data/iris-index.geojson"), "utf8"),
  );
  const labels = JSON.parse(
    readFileSync(join(root, "public/data/iris-labels.geojson"), "utf8"),
  );
  assert.equal(index.features.length, 393);
  assert.equal(labels.features.length, 393);
  assert.equal(labels.features[0].geometry.type, "Point");
  assert.equal(index.features[0].geometry.type, "Point");
  assert.equal(index.features[0].bbox.length, 4);
  assert.equal(
    existsSync(join(root, "public/data/quartier-labels.geojson")),
    true,
  );
  assert.equal(
    existsSync(join(root, "public/data/arrondissement-labels.geojson")),
    true,
  );
});

function metersBetween(a, b) {
  const dx = (a[0] - b[0]) * 111320 * Math.cos((43.3 * Math.PI) / 180);
  const dy = (a[1] - b[1]) * 110540;
  return Math.hypot(dx, dy);
}

test("Noailles label is not glued to Gare de l'Est", () => {
  const labels = JSON.parse(
    readFileSync(join(root, "public/data/quartier-labels.geojson"), "utf8"),
  );
  const irisLabels = JSON.parse(
    readFileSync(join(root, "public/data/iris-labels.geojson"), "utf8"),
  );
  const noailles = labels.features.find((f) => f.properties.name === "Noailles");
  const gare = irisLabels.features.find((f) => f.properties.name === "Gare de l'Est");
  assert.ok(noailles && gare);
  const m = metersBetween(noailles.geometry.coordinates, gare.geometry.coordinates);
  assert.ok(m > 50, `Noailles sat on Gare de l'Est (${m.toFixed(1)} m)`);
});

test("arrondissement 7 sits on the mainland, not Frioul", () => {
  const labels = JSON.parse(
    readFileSync(join(root, "public/data/arrondissement-labels.geojson"), "utf8"),
  );
  const n7 = labels.features.find((f) => String(f.properties.arrondissement) === "7");
  assert.ok(n7);
  assert.ok(
    n7.geometry.coordinates[0] > 5.33,
    `7 on Frioul? lng=${n7.geometry.coordinates[0]}`,
  );
});

test("arrondissement 9 is pulled toward Mazargues, not the Calanques", () => {
  const labels = JSON.parse(
    readFileSync(join(root, "public/data/arrondissement-labels.geojson"), "utf8"),
  );
  const qLabels = JSON.parse(
    readFileSync(join(root, "public/data/quartier-labels.geojson"), "utf8"),
  );
  const n9 = labels.features.find((f) => String(f.properties.arrondissement) === "9");
  const maz = qLabels.features.find((f) => f.properties.name === "Mazargues");
  assert.ok(n9 && maz);
  const calanques = [5.482029, 43.226028];
  const toMaz = metersBetween(n9.geometry.coordinates, maz.geometry.coordinates);
  const toCal = metersBetween(n9.geometry.coordinates, calanques);
  assert.ok(toMaz < toCal, `9 closer to Calanques (${toCal.toFixed(0)}m) than Mazargues (${toMaz.toFixed(0)}m)`);
});

test("data/full backup exists for rollback", () => {
  const fullQ = join(root, "data/full/quartiers.geojson");
  const fullA = join(root, "data/full/arrondissements.geojson");
  const osmPath = join(root, "data/full/osm-quartiers.geojson");
  assert.equal(existsSync(fullQ), true, "data/full/quartiers.geojson");
  assert.equal(existsSync(fullA), true, "data/full/arrondissements.geojson");
  assert.equal(existsSync(osmPath), true, "data/full/osm-quartiers.geojson");
  const full = JSON.parse(readFileSync(fullQ, "utf8"));
  const pub = JSON.parse(readFileSync(quartiersPath, "utf8"));
  const osm = JSON.parse(readFileSync(osmPath, "utf8"));
  validateCollections(full, JSON.parse(readFileSync(fullA, "utf8")));
  const belsunce = pub.features.find((f) => f.properties.name === "Belsunce");
  assert.equal(belsunce?.id, 1320101);
  assert.equal("osm_relation" in (belsunce?.properties ?? {}), false);
  assert.ok(Array.isArray(belsunce?.properties.iris_names));
  assert.ok(belsunce.properties.iris_names.includes("La Bourse"));
  assert.equal(osm.features.length, 111);
  assert.ok(
    osm.features.some((f) => f.properties.osm_relation > 1000),
    "gazetteer must keep OSM relation ids",
  );
});
