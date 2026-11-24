import assert from "node:assert/strict";
import { test } from "node:test";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { QuartierProps } from "./geocoder.ts";
import {
  inlandLabelPoint,
  inlandLabelPoints,
  pointInPolygon,
  pullLabelPoint,
} from "./inland-label.ts";

const props = (
  name: string,
  arrondissement: string,
  id: number,
): QuartierProps => ({
  id,
  name,
  name_fr: name,
  arrondissement,
  osm_relation: id,
});

test("inlandLabelPoint uses area centroid of a simple polygon", () => {
  const feature: Feature<Polygon, QuartierProps> = {
    type: "Feature",
    properties: props("Square", "1", 0),
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [4, 2],
          [0, 2],
          [0, 0],
        ],
      ],
    },
  };
  const [x, y] = inlandLabelPoint(feature);
  assert.ok(Math.abs(x - 2) < 1e-9, `x=${x}`);
  assert.ok(Math.abs(y - 1) < 1e-9, `y=${y}`);
});

test("inlandLabelPoint ignores island parts", () => {
  const feature: Feature<MultiPolygon, QuartierProps> = {
    type: "Feature",
    properties: props("Endoume", "7", 1),
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [5.3, 43.26],
            [5.31, 43.26],
            [5.31, 43.27],
            [5.3, 43.27],
            [5.3, 43.26],
          ],
        ],
        [
          [
            [5.35, 43.28],
            [5.39, 43.28],
            [5.39, 43.32],
            [5.35, 43.32],
            [5.35, 43.28],
          ],
        ],
      ],
    },
  };
  const [lng, lat] = inlandLabelPoint(feature);
  assert.ok(lng > 5.34 && lng < 5.4);
  assert.ok(lat > 43.28 && lat < 43.32);
});

test("inlandLabelPoint stays inside a C-shaped coastal polygon", () => {
  const feature: Feature<Polygon, QuartierProps> = {
    type: "Feature",
    properties: props("9e", "9", 9),
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
          [0, 3],
          [3, 3],
          [3, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    },
  };
  const point = inlandLabelPoint(feature);
  assert.equal(pointInPolygon(point, feature.geometry.coordinates), true);
  assert.ok(point[0] > 2.4, `expected inland x, got ${point[0]}`);
});

test("pullLabelPoint moves toward a target while staying inside", () => {
  const feature: Feature<Polygon, QuartierProps> = {
    type: "Feature",
    properties: props("9e", "9", 9),
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    },
  };
  const origin = inlandLabelPoint(feature);
  const pulled = pullLabelPoint(feature, [2, 8], 0.6);
  assert.equal(pointInPolygon(pulled, feature.geometry.coordinates), true);
  assert.ok(pulled[1] > origin[1], `expected north of centroid, got ${pulled}`);
  assert.ok(pulled[0] < origin[0], `expected west of centroid, got ${pulled}`);
});

test("inlandLabelPoint uses the whole mosaic, not the largest IRIS", () => {
  const feature: Feature<MultiPolygon, QuartierProps> = {
    type: "Feature",
    properties: props("Noailles", "1", 1320103),
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0],
          ],
        ],
        [
          [
            [1, 0],
            [2, 0],
            [2, 1],
            [1, 1],
            [1, 0],
          ],
        ],
        [
          [
            [2, 0],
            [4, 0],
            [4, 2],
            [2, 2],
            [2, 0],
          ],
        ],
      ],
    },
  };
  const [x, y] = inlandLabelPoint(feature);
  assert.ok(x < 2.7, `mosaic center, not largest IRIS at x=3; got ${x},${y}`);
  assert.ok(x > 1.8, `expected east of the small pair, got ${x}`);
});

test("inlandLabelPoint prefers the mainland cluster over a larger island", () => {
  const square = (x: number, y: number, s: number): number[][][] => [
    [
      [x, y],
      [x + s, y],
      [x + s, y + s],
      [x, y + s],
      [x, y],
    ],
  ];
  const feature: Feature<MultiPolygon, QuartierProps> = {
    type: "Feature",
    properties: props("7e", "7", 7),
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        square(0, 0, 1),
        square(1, 0, 1),
        square(2, 0, 1),
        square(3, 0, 1),
        square(4, 0, 1),
        square(20, 20, 2),
      ],
    },
  };
  const [x, y] = inlandLabelPoint(feature);
  assert.ok(x < 6, `mainland cluster, not Frioul-sized island; got ${x},${y}`);
  assert.ok(y < 2, `mainland latitude, got ${y}`);
});

test("pullLabelPoint may land in a connected neighbour part", () => {
  const feature: Feature<MultiPolygon, QuartierProps> = {
    type: "Feature",
    properties: props("9e", "9", 9),
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0],
          ],
        ],
        [
          [
            [2, 0],
            [6, 0],
            [6, 4],
            [2, 4],
            [2, 0],
          ],
        ],
      ],
    },
  };
  const pulled = pullLabelPoint(feature, [1, 1], 0.9);
  assert.ok(pulled[0] < 2.5, `should enter the smaller western part, got ${pulled}`);
});

test("inlandLabelPoints emits one point per feature", () => {
  const points = inlandLabelPoints({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: props("Endoume", "7", 11),
        geometry: {
          type: "MultiPolygon",
          coordinates: [
            [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
                [0, 0],
              ],
            ],
            [
              [
                [3, 3],
                [3.1, 3],
                [3.1, 3.1],
                [3, 3.1],
                [3, 3],
              ],
            ],
            [
              [
                [4, 4],
                [4.1, 4],
                [4.1, 4.1],
                [4, 4.1],
                [4, 4],
              ],
            ],
          ],
        },
      },
    ],
  });
  assert.equal(points.features.length, 1);
  assert.equal(points.features[0].geometry.type, "Point");
  assert.equal(points.features[0].properties?.name, "Endoume");
});
