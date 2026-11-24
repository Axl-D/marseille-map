import assert from "node:assert/strict";
import { test } from "node:test";
import type { FeatureCollection, Polygon } from "geojson";
import {
  arrondissementPhrase,
  featureBbox,
  fold,
  matchLocalPlaces,
  matchLocalQuartiers,
  parseArrondissementQuery,
  renderSearchHit,
  type QuartierProps,
} from "./geocoder.ts";

const quartiers: FeatureCollection<Polygon, QuartierProps> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: 1,
      properties: {
        id: 1,
        name: "La Timone",
        name_fr: "La Timone",
        arrondissement: "5",
        osm_relation: 1,
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [5.4, 43.28],
            [5.41, 43.28],
            [5.41, 43.29],
            [5.4, 43.29],
            [5.4, 43.28],
          ],
        ],
      },
    },
    {
      type: "Feature",
      id: 2,
      properties: {
        id: 2,
        name: "Belsunce",
        name_fr: "Belsunce",
        arrondissement: "1",
        osm_relation: 2,
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [5.37, 43.29],
            [5.38, 43.29],
            [5.38, 43.3],
            [5.37, 43.3],
            [5.37, 43.29],
          ],
        ],
      },
    },
  ],
};

test("fold strips accents", () => {
  assert.equal(fold("Hôtel de Ville"), "hotel de ville");
});

test("arrondissementPhrase uses French ordinals", () => {
  assert.equal(arrondissementPhrase("1"), "1er arrondissement");
  assert.equal(arrondissementPhrase("8"), "8e arrondissement");
});

test("matchLocalQuartiers finds La Timone and Belsunce", () => {
  const timone = matchLocalQuartiers("timone", quartiers);
  assert.equal(timone.length, 1);
  assert.equal(timone[0].text, "La Timone");
  assert.equal(timone[0].properties?.quartierId, 1);

  const bel = matchLocalQuartiers("bels", quartiers);
  assert.equal(bel[0].text, "Belsunce");
});

test("parseArrondissementQuery reads ordinals and 130xx postcodes", () => {
  assert.equal(parseArrondissementQuery("13001"), "1");
  assert.equal(parseArrondissementQuery("13016"), "16");
  assert.equal(parseArrondissementQuery("1er"), "1");
  assert.equal(parseArrondissementQuery("8e"), "8");
  assert.equal(parseArrondissementQuery("8e arrondissement"), "8");
  assert.equal(parseArrondissementQuery("restaurant"), null);
  assert.equal(parseArrondissementQuery("13000"), null);
  assert.equal(parseArrondissementQuery("13017"), null);
  assert.equal(parseArrondissementQuery("17"), null);
});

test("matchLocalPlaces searches arrondissement, quartier and IRIS only", () => {
  const arrondissements = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        id: 1,
        properties: { id: 1, name: "1", arrondissement: "1" },
        geometry: quartiers.features[1].geometry,
      },
    ],
  };
  const iris = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        id: 132010101,
        properties: {
          id: 132010101,
          name: "La Bourse",
          arrondissement: "1",
          quartier: "Belsunce",
          quartier_insee: "1320101",
        },
        geometry: quartiers.features[1].geometry,
      },
    ],
  };

  const post = matchLocalPlaces("13001", { quartiers, arrondissements, iris });
  assert.equal(post[0]?.properties?.kind, "arrondissement");
  assert.equal(post[0]?.properties?.arrondissement, "1");

  const ordinal = matchLocalPlaces("1er", { quartiers, arrondissements, iris });
  assert.equal(ordinal[0]?.properties?.kind, "arrondissement");

  const irisHit = matchLocalPlaces("bourse", { quartiers, arrondissements, iris });
  assert.equal(irisHit[0]?.properties?.kind, "iris");
  assert.equal(irisHit[0]?.text, "La Bourse");

  const index = matchLocalPlaces("bourse", {
    quartiers,
    arrondissements,
    iris: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: 132010101,
          bbox: [5.37, 43.29, 5.38, 43.3],
          properties: {
            id: 132010101,
            name: "La Bourse",
            arrondissement: "1",
            quartier: "Belsunce",
            quartier_insee: "1320101",
          },
          geometry: { type: "Point", coordinates: [5.375, 43.295] },
        },
      ],
    },
  });
  assert.equal(index[0]?.properties?.kind, "iris");
  assert.deepEqual(index[0]?.bbox, [5.37, 43.29, 5.38, 43.3]);

  const none = matchLocalPlaces("pizza", { quartiers, arrondissements, iris });
  assert.equal(none.length, 0);
});

test("arrondissement search uses Point index bbox", () => {
  const hits = matchLocalPlaces("13001", {
    quartiers,
    arrondissements: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: 1,
          bbox: [5.36, 43.29, 5.39, 43.31],
          properties: { id: 1, name: "1", arrondissement: "1" },
          geometry: { type: "Point", coordinates: [5.375, 43.3] },
        },
      ],
    },
    iris: { type: "FeatureCollection", features: [] },
  });
  assert.equal(hits[0]?.properties?.kind, "arrondissement");
  assert.deepEqual(hits[0]?.bbox, [5.36, 43.29, 5.39, 43.31]);
});

test("featureBbox returns the ring extent", () => {
  const bbox = featureBbox(quartiers.features[0]);
  assert.deepEqual(bbox, [5.4, 43.28, 5.41, 43.29]);
});

test("renderSearchHit uses distinct icons per kind", () => {
  const arr = renderSearchHit({
    properties: { kind: "arrondissement" },
    place_name: "1er arrondissement",
  });
  const quartier = renderSearchHit({
    properties: { kind: "quartier" },
    place_name: "Belsunce · 1er",
  });
  const iris = renderSearchHit({
    properties: { kind: "iris" },
    place_name: "La Bourse · Belsunce",
  });
  assert.match(arr, /search-hit--arrondissement/);
  assert.match(quartier, /search-hit--quartier/);
  assert.match(iris, /search-hit--iris/);
  assert.match(arr, /<svg /);
  assert.match(quartier, /<svg /);
  assert.match(iris, /<svg /);
  assert.notEqual(arr, quartier);
  assert.notEqual(quartier, iris);
});

