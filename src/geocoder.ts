import MaplibreGeocoder, {
  type CarmenGeojsonFeature,
  type MaplibreGeocoderApi,
  type MaplibreGeocoderApiConfig,
  type MaplibreGeocoderFeatureResults,
} from "@maplibre/maplibre-gl-geocoder";
import * as maplibregl from "maplibre-gl";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";

export const MARSEILLE_BBOX: [number, number, number, number] = [
  5.22, 43.17, 5.53, 43.4,
];

export const FIT_QUARTIER = {
  padding: 48,
  maxZoom: 15,
  duration: 600,
} as const;

export const FIT_ARR = {
  padding: 40,
  maxZoom: 12.6,
  duration: 600,
} as const;

export const FIT_IRIS = {
  padding: 48,
  maxZoom: 16,
  duration: 600,
} as const;

export type SearchKind = "arrondissement" | "quartier" | "iris";

export type QuartierProps = {
  id: number;
  name: string;
  name_fr: string;
  arrondissement: string;
  osm_relation?: number;
  ref_insee?: string;
  iris_names?: string[];
};

export type IrisProps = {
  id: number;
  name: string;
  arrondissement: string;
  quartier?: string;
  quartier_insee?: string;
};

export type IrisSearchFeature = Feature<
  Point | Polygon | MultiPolygon,
  IrisProps
> & {
  bbox?: [number, number, number, number];
};

export type QuartierFeature = Feature<Polygon | MultiPolygon, QuartierProps>;

export type ArrProps = {
  id: number;
  name: string;
  arrondissement: string;
};

export type SearchGeometry = Point | Polygon | MultiPolygon;

const KIND_RANK: Record<SearchKind, number> = {
  arrondissement: 0,
  quartier: 1,
  iris: 2,
};

export function arrondissementPhrase(n: string): string {
  return n === "1" ? "1er arrondissement" : `${n}e arrondissement`;
}

export function arrondissementShort(n: string): string {
  return n === "1" ? "1er" : `${n}e`;
}

export function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function parseArrondissementQuery(query: string): string | null {
  const f = fold(query).replace(/\s+/g, " ");
  const post = f.match(/^130(0[1-9]|1[0-6])$/);
  if (post) return String(Number(post[1]));
  const ord = f.match(/^0?(\d{1,2})(?:er|e)?(?:\s*arr(?:ondissement)?)?$/);
  if (ord) {
    const n = Number(ord[1]);
    if (n >= 1 && n <= 16) return String(n);
  }
  return null;
}

export function featureBbox(
  feature: Feature<Polygon | MultiPolygon>,
): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const rings =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  for (const polygon of rings) {
    for (const ring of polygon) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return [minX, minY, maxX, maxY];
}

function scoreName(name: string, needle: string): number {
  const folded = fold(name);
  if (folded === needle) return 3;
  if (folded.startsWith(needle)) return 2;
  if (folded.includes(needle)) return 1;
  return 0;
}

export function recordBbox(feature: Feature): [number, number, number, number] {
  if (feature.bbox && feature.bbox.length >= 4) {
    return [feature.bbox[0], feature.bbox[1], feature.bbox[2], feature.bbox[3]];
  }
  if (feature.geometry.type === "Point") {
    const [x, y] = feature.geometry.coordinates;
    return [x, y, x, y];
  }
  return featureBbox(feature as Feature<Polygon | MultiPolygon>);
}

function carmenFrom(
  feature: Feature,
  text: string,
  placeName: string,
  kind: SearchKind,
  extra: Record<string, string | number | undefined>,
  score: number,
): { score: number; kind: SearchKind; text: string; carmen: CarmenGeojsonFeature } {
  const bbox = recordBbox(feature);
  const center: [number, number] = [
    (bbox[0] + bbox[2]) / 2,
    (bbox[1] + bbox[3]) / 2,
  ];
  return {
    score,
    kind,
    text,
    carmen: {
      type: "Feature",
      geometry: { type: "Point", coordinates: center },
      properties: { kind, ...extra },
      place_name: placeName,
      text,
      place_type: [kind],
      center,
      bbox,
    },
  };
}

export function matchLocalQuartiers(
  query: string,
  quartiers: FeatureCollection<Polygon | MultiPolygon, QuartierProps>,
  limit = 5,
): CarmenGeojsonFeature[] {
  return matchLocalPlaces(query, { quartiers, arrondissements: { type: "FeatureCollection", features: [] }, iris: { type: "FeatureCollection", features: [] } }, limit)
    .filter((hit) => hit.properties?.kind === "quartier");
}

export function matchLocalPlaces(
  query: string,
  sources: {
    quartiers: FeatureCollection<Polygon | MultiPolygon, QuartierProps>;
    arrondissements: FeatureCollection<SearchGeometry, ArrProps>;
    iris: FeatureCollection<Point | Polygon | MultiPolygon, IrisProps>;
  },
  limit = 8,
): CarmenGeojsonFeature[] {
  const needle = fold(query);
  if (!needle) return [];
  const hits: ReturnType<typeof carmenFrom>[] = [];

  const arrN = parseArrondissementQuery(query);
  if (arrN) {
    const feature = sources.arrondissements.features.find(
      (row) => row.properties.arrondissement === arrN,
    );
    if (feature) {
      const phrase = arrondissementPhrase(arrN);
      hits.push(
        carmenFrom(feature, phrase, phrase, "arrondissement", { arrondissement: arrN }, 4),
      );
    }
  } else if (needle.length >= 2) {
    for (const feature of sources.arrondissements.features) {
      const phrase = arrondissementPhrase(feature.properties.arrondissement);
      const score = scoreName(phrase, needle);
      if (score) {
        hits.push(
          carmenFrom(feature, phrase, phrase, "arrondissement", {
            arrondissement: feature.properties.arrondissement,
          }, score),
        );
      }
    }
  }

  if (needle.length >= 2) {
    for (const feature of sources.quartiers.features) {
      const name = feature.properties.name || feature.properties.name_fr;
      const score = scoreName(name, needle);
      if (!score) continue;
      const short = arrondissementShort(feature.properties.arrondissement);
      hits.push(
        carmenFrom(feature, name, `${name} · ${short}`, "quartier", {
          quartierId: feature.properties.id,
          arrondissement: feature.properties.arrondissement,
        }, score),
      );
    }
    for (const feature of sources.iris.features) {
      const name = feature.properties.name;
      const score = scoreName(name, needle);
      if (!score) continue;
      const quartier = feature.properties.quartier ?? "";
      hits.push(
        carmenFrom(feature, name, quartier ? `${name} · ${quartier}` : name, "iris", {
          quartierId: Number(feature.properties.quartier_insee ?? 0),
          irisId: feature.properties.id,
          arrondissement: feature.properties.arrondissement,
        }, score),
      );
    }
  }

  return hits
    .sort(
      (a, b) =>
        b.score - a.score ||
        KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
        a.text.localeCompare(b.text, "fr"),
    )
    .slice(0, limit)
    .map((row) => row.carmen);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SEARCH_ICONS: Record<SearchKind, string> = {
  arrondissement: `<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><rect x="1" y="1" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M7 1v12M1 7h12" stroke="currentColor" stroke-width="1.2"/></svg>`,
  quartier: `<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><rect x="2" y="2" width="10" height="10" rx="2.5" fill="currentColor"/></svg>`,
  iris: `<svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><rect x="1.5" y="1.5" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="5" y="5" width="4" height="4" rx="0.6" fill="currentColor"/></svg>`,
};

export function renderSearchHit(
  item: {
    properties?: { kind?: SearchKind } | null;
    place_name?: string;
    text?: string;
  },
): string {
  const kind = item.properties?.kind ?? "quartier";
  const label = item.place_name ?? item.text ?? "";
  return `<div class="search-hit search-hit--${kind}"><span class="search-hit-icon">${SEARCH_ICONS[kind] ?? SEARCH_ICONS.quartier}</span><span class="search-hit-label">${escapeHtml(label)}</span></div>`;
}

export function createGeocoderApi(
  quartiers: FeatureCollection<Polygon | MultiPolygon, QuartierProps>,
  arrondissements: FeatureCollection<SearchGeometry, ArrProps>,
  iris: FeatureCollection<SearchGeometry, IrisProps>,
): MaplibreGeocoderApi {
  return {
    forwardGeocode: async (
      config: MaplibreGeocoderApiConfig,
    ): Promise<MaplibreGeocoderFeatureResults> => {
      const query = String(config.query ?? "").trim();
      const features = matchLocalPlaces(query, { quartiers, arrondissements, iris });
      return { type: "FeatureCollection", features };
    },
  };
}

export function createGeocoder(
  quartiers: FeatureCollection<Polygon | MultiPolygon, QuartierProps>,
  arrondissements: FeatureCollection<SearchGeometry, ArrProps>,
  iris: FeatureCollection<SearchGeometry, IrisProps>,
): MaplibreGeocoder {
  return new MaplibreGeocoder(createGeocoderApi(quartiers, arrondissements, iris), {
    maplibregl,
    placeholder: "Quartier, IRIS, arrondissement…",
    language: "fr",
    marker: false,
    showResultMarkers: false,
    showResultsWhileTyping: true,
    minLength: 1,
    debounceSearch: 80,
    enableEventLogging: false,
    flyTo: false,
    zoom: 14,
    render: renderSearchHit,
  });
}
