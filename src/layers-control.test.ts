import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_LAYER_TOGGLES,
  IRIS_LABEL_LAYER,
  IRIS_LABEL_MIN_ZOOM,
  IRIS_LOAD_ZOOM,
  IRIS_OUTLINE_LAYER,
  QUARTIER_LABEL_FADE_START,
  QUARTIER_LABEL_MAX_ZOOM,
  ROAD_LABEL_LAYER,
  setLayersVisible,
} from "./layers-control.ts";

test("DEFAULT_LAYER_TOGGLES includes road names on the major highway layer", () => {
  const roads = DEFAULT_LAYER_TOGGLES.find((row) => row.id === "road-names");
  assert.ok(roads);
  assert.equal(roads?.label, "Noms des rues");
  assert.deepEqual(roads?.layerIds, [ROAD_LABEL_LAYER]);
  assert.equal(ROAD_LABEL_LAYER, "highway-name-major");
});

test("DEFAULT_LAYER_TOGGLES includes IRIS outlines and labels", () => {
  const iris = DEFAULT_LAYER_TOGGLES.find((row) => row.id === "iris");
  assert.ok(iris);
  assert.equal(iris?.label, "IRIS (sous-quartiers)");
  assert.deepEqual(iris?.layerIds, [IRIS_OUTLINE_LAYER, IRIS_LABEL_LAYER]);
  assert.ok(IRIS_LOAD_ZOOM < 14.5);
});

test("quartier names overlap IRIS names by 0.5 zoom, then fade out", () => {
  assert.equal(QUARTIER_LABEL_FADE_START - IRIS_LABEL_MIN_ZOOM, 0.5);
  assert.ok(QUARTIER_LABEL_MAX_ZOOM > QUARTIER_LABEL_FADE_START);
  assert.ok(IRIS_LOAD_ZOOM < IRIS_LABEL_MIN_ZOOM);
});

test("DEFAULT_LAYER_TOGGLES covers fills, outlines, names, IRIS, roads", () => {
  const ids = DEFAULT_LAYER_TOGGLES.map((row) => row.id);
  assert.deepEqual(ids, [
    "arr-fills",
    "q-outlines",
    "q-names",
    "iris",
    "arr-numbers",
    "road-names",
  ]);
  assert.equal(new Set(ids).size, ids.length);
  const layers = DEFAULT_LAYER_TOGGLES.flatMap((row) => row.layerIds);
  assert.ok(layers.includes("quartier-outline"));
  assert.ok(layers.includes("arrondissement-fill"));
});

test("setLayersVisible hides and shows existing layers only", () => {
  const calls: [string, string, string][] = [];
  const map = {
    getLayer: (id: string) => (id === "missing" ? undefined : { id }),
    setLayoutProperty: (id: string, key: string, value: string) => {
      calls.push([id, key, value]);
    },
  };
  setLayersVisible(map as never, ["quartier-outline", "missing"], false);
  assert.deepEqual(calls, [["quartier-outline", "visibility", "none"]]);
  setLayersVisible(map as never, ["quartier-outline"], true);
  assert.deepEqual(calls[1], ["quartier-outline", "visibility", "visible"]);
});
