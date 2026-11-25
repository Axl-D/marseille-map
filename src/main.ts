import "@fontsource/ibm-plex-sans/latin-400.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "@maplibre/maplibre-gl-geocoder/dist/maplibre-gl-geocoder.css";
import "./style.css";
import {
  AttributionControl,
  GeolocateControl,
  Map as MlMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
} from "maplibre-gl";
import type { ExpressionSpecification, GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";
import type {
  FeatureCollection,
  LineString,
  MultiLineString,
  MultiPolygon,
  Point,
  Polygon,
} from "geojson";
import maplibreWorker from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { arrondissementColorMatch } from "./arrondissement-colors.ts";
import {
  arrondissementPhrase,
  createGeocoder,
  featureBbox,
  FIT_ARR,
  FIT_IRIS,
  FIT_QUARTIER,
  type ArrProps,
  type IrisProps,
  type QuartierFeature,
  type QuartierProps,
} from "./geocoder.ts";
import type { LabelProps } from "./inland-label.ts";
import {
  hoverLeave,
  hoverMove,
  pinQuartier,
  unpin,
  type PanelState,
} from "./hover-state.ts";
import {
  IRIS_LABEL_LAYER,
  IRIS_LABEL_MIN_ZOOM,
  IRIS_LOAD_ZOOM,
  IRIS_OUTLINE_LAYER,
  QUARTIER_LABEL_FADE_START,
  QUARTIER_LABEL_MAX_ZOOM,
  mountLayersControl,
  ROAD_LABEL_LAYER,
} from "./layers-control.ts";
import { STYLE_URL, rewriteOpenFreeMapUrl } from "./basemap.ts";
import { MAP_MAX_BOUNDS, minZoomToFitBounds } from "./map-bounds.ts";

setWorkerUrl(maplibreWorker);

type QuartierCollection = FeatureCollection<Polygon | MultiPolygon, QuartierProps>;
type LabelCollection = FeatureCollection<Point, LabelProps>;
type IrisLineCollection = FeatureCollection<LineString | MultiLineString>;
type ArrIndex = FeatureCollection<Point, ArrProps>;
const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

const LABEL_FONT = ["Noto Sans Regular"];
const OUR_SYMBOLS = new Set([
  "arrondissement-label",
  "quartier-label",
  IRIS_LABEL_LAYER,
  ROAD_LABEL_LAYER,
]);
const PAPER_RGB = "247, 242, 234";
const ROAD_LABEL_MIN_ZOOM = 13.8;
const ROAD_LABEL_OPAQUE_ZOOM = 14.35;
const IRIS_LABEL_OPAQUE_ZOOM = 14.95;
/** Names start at 12; numbers gone at 13.1 (overlap 0.1 shorter than 12–13.2). */
const QUARTIER_LABEL_MIN_ZOOM = 12;
const QUARTIER_LABEL_OPAQUE_ZOOM = 12.45;
const ARR_LABEL_FADE_START = 12.65;
const ARR_LABEL_FADE_END = 13.1;
const ARR_LABEL_MAX_ZOOM = 13.15;

const FR_LOCALE = {
  "AttributionControl.ToggleAttribution": "Afficher les attributions",
  "GeolocateControl.FindMyLocation": "Trouver ma position",
  "GeolocateControl.LocationNotAvailable": "Position indisponible",
  "Map.Title": "Carte",
  "NavigationControl.ZoomIn": "Zoom avant",
  "NavigationControl.ZoomOut": "Zoom arrière",
};

function zoomOpacity(
  fromZoom: number,
  fromAlpha: number,
  toZoom: number,
  toAlpha: number,
): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    fromZoom,
    fromAlpha,
    toZoom,
    toAlpha,
  ];
}

function zoomHalo(
  fromZoom: number,
  fromAlpha: number,
  toZoom: number,
  toAlpha: number,
): ExpressionSpecification {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    fromZoom,
    `rgba(${PAPER_RGB}, ${fromAlpha})`,
    toZoom,
    `rgba(${PAPER_RGB}, ${toAlpha})`,
  ];
}

let panelState: PanelState = { pinned: null, shown: null };
let irisLoaded = false;
const quartierById = new Map<number, QuartierFeature>();

const panel = {
  root: document.querySelector<HTMLElement>("#info-panel"),
  name: document.querySelector<HTMLElement>("#info-name"),
  arr: document.querySelector<HTMLElement>("#info-arr"),
  iris: document.querySelector<HTMLElement>("#info-iris"),
};

function hideBasemapSymbols(map: MlMap): void {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type === "symbol" && !OUR_SYMBOLS.has(layer.id)) {
      map.setLayoutProperty(layer.id, "visibility", "none");
    }
  }
}

/** White Positron majors (primary / secondary / tertiary / trunk), quiet grey, high zoom. */
function styleRoadLabels(map: MlMap): void {
  if (!map.getLayer(ROAD_LABEL_LAYER)) return;
  map.setLayerZoomRange(ROAD_LABEL_LAYER, ROAD_LABEL_MIN_ZOOM, 24);
  map.setLayoutProperty(ROAD_LABEL_LAYER, "text-field", [
    "coalesce",
    ["get", "name"],
    ["get", "name:latin"],
  ]);
  map.setLayoutProperty(ROAD_LABEL_LAYER, "text-size", [
    "interpolate",
    ["linear"],
    ["zoom"],
    ROAD_LABEL_MIN_ZOOM,
    10,
    16,
    11.5,
  ]);
  map.setLayoutProperty(ROAD_LABEL_LAYER, "text-padding", 3);
  map.setPaintProperty(ROAD_LABEL_LAYER, "text-color", "#7a7570");
  map.setPaintProperty(
    ROAD_LABEL_LAYER,
    "text-halo-color",
    "rgba(255, 255, 255, 0.7)",
  );
  map.setPaintProperty(ROAD_LABEL_LAYER, "text-halo-width", 0.55);
  map.setPaintProperty(ROAD_LABEL_LAYER, "text-halo-blur", 0.2);
  map.setPaintProperty(
    ROAD_LABEL_LAYER,
    "text-opacity",
    zoomOpacity(ROAD_LABEL_MIN_ZOOM, 0.18, ROAD_LABEL_OPAQUE_ZOOM, 0.7),
  );
}

function restackLabels(map: MlMap): void {
  if (map.getLayer("quartier-label")) map.moveLayer("quartier-label");
  if (map.getLayer(IRIS_LABEL_LAYER)) map.moveLayer(IRIS_LABEL_LAYER);
  if (map.getLayer(ROAD_LABEL_LAYER)) map.moveLayer(ROAD_LABEL_LAYER);
}

function collapseAttribution(): void {
  const el = document.querySelector(".maplibregl-ctrl-attrib");
  el?.classList.remove("maplibregl-compact-show");
  el?.removeAttribute("open");
}

function showPanel(feature: QuartierFeature | null): void {
  if (!panel.root || !panel.name || !panel.arr || !panel.iris) return;
  if (!feature) {
    panel.root.hidden = true;
    return;
  }
  panel.name.textContent = feature.properties.name;
  panel.arr.textContent = arrondissementPhrase(feature.properties.arrondissement);
  const names = feature.properties.iris_names ?? [];
  panel.iris.replaceChildren(
    ...names.map((name) => {
      const item = document.createElement("li");
      item.textContent = name;
      return item;
    }),
  );
  panel.iris.hidden = names.length === 0;
  panel.root.hidden = false;
}

function fitQuartier(map: MlMap, id: number): void {
  const feature = quartierById.get(id);
  if (!feature) return;
  const [w, s, east, n] = featureBbox(feature);
  map.fitBounds(
    [
      [w, s],
      [east, n],
    ],
    FIT_QUARTIER,
  );
}

function addLayers(
  map: MlMap,
  q: QuartierCollection,
  quartierLabels: LabelCollection,
  arrLabels: LabelCollection,
  quartierLines: IrisLineCollection,
): void {
  map.addSource("quartiers", { type: "geojson", data: q, promoteId: "id" });
  map.addSource("arrondissement-labels", {
    type: "geojson",
    data: arrLabels,
  });
  map.addSource("quartier-labels", {
    type: "geojson",
    data: quartierLabels,
  });
  map.addSource("iris-lines", { type: "geojson", data: EMPTY_FC });
  map.addSource("quartier-lines", { type: "geojson", data: quartierLines });
  map.addSource("iris-labels", { type: "geojson", data: EMPTY_FC });

  map.addLayer({
    id: "arrondissement-fill",
    type: "fill",
    source: "quartiers",
    paint: {
      "fill-color": arrondissementColorMatch(),
      "fill-opacity": 0.55,
    },
  });
  map.addLayer({
    id: "quartier-fill",
    type: "fill",
    source: "quartiers",
    paint: {
      "fill-color": "#1a1a1a",
      "fill-opacity": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        0.16,
        0,
      ],
    },
  });
  map.addLayer({
    id: IRIS_OUTLINE_LAYER,
    type: "line",
    source: "iris-lines",
    minzoom: IRIS_LABEL_MIN_ZOOM,
    paint: {
      "line-color": "#6a6470",
      "line-width": 0.55,
      "line-opacity": zoomOpacity(
        IRIS_LABEL_MIN_ZOOM,
        0.08,
        IRIS_LABEL_OPAQUE_ZOOM,
        0.55,
      ),
    },
  });
  map.addLayer({
    id: "quartier-outline",
    type: "line",
    source: "quartier-lines",
    paint: {
      "line-color": "#4a4450",
      "line-width": 0.85,
      "line-opacity": 0.85,
    },
  });
  map.addLayer({
    id: "arrondissement-label",
    type: "symbol",
    source: "arrondissement-labels",
    minzoom: 10,
    maxzoom: ARR_LABEL_MAX_ZOOM,
    layout: {
      "text-field": ["get", "arrondissement"],
      "text-font": LABEL_FONT,
      "text-size": 22,
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": "#2a2430",
      "text-opacity": zoomOpacity(ARR_LABEL_FADE_START, 1, ARR_LABEL_FADE_END, 0),
      "text-halo-color": zoomHalo(ARR_LABEL_FADE_START, 1, ARR_LABEL_FADE_END, 0),
      "text-halo-width": 1.6,
    },
  });
  map.addLayer({
    id: "quartier-label",
    type: "symbol",
    source: "quartier-labels",
    minzoom: QUARTIER_LABEL_MIN_ZOOM,
    maxzoom: QUARTIER_LABEL_MAX_ZOOM,
    layout: {
      "text-field": ["get", "name"],
      "text-font": LABEL_FONT,
      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        QUARTIER_LABEL_MIN_ZOOM,
        10,
        15,
        13,
      ],
      "text-padding": 4,
      "text-optional": true,
    },
    paint: {
      "text-color": "#2a2430",
      "text-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        QUARTIER_LABEL_MIN_ZOOM,
        0.2,
        QUARTIER_LABEL_OPAQUE_ZOOM,
        1,
        QUARTIER_LABEL_FADE_START,
        1,
        QUARTIER_LABEL_MAX_ZOOM,
        0,
      ],
      "text-halo-color": [
        "interpolate",
        ["linear"],
        ["zoom"],
        QUARTIER_LABEL_MIN_ZOOM,
        `rgba(${PAPER_RGB}, 0.2)`,
        QUARTIER_LABEL_OPAQUE_ZOOM,
        `rgba(${PAPER_RGB}, 1)`,
        QUARTIER_LABEL_FADE_START,
        `rgba(${PAPER_RGB}, 1)`,
        QUARTIER_LABEL_MAX_ZOOM,
        `rgba(${PAPER_RGB}, 0)`,
      ],
      "text-halo-width": 1.4,
    },
  });
  map.addLayer({
    id: IRIS_LABEL_LAYER,
    type: "symbol",
    source: "iris-labels",
    minzoom: IRIS_LABEL_MIN_ZOOM,
    layout: {
      "text-field": ["get", "name"],
      "text-font": LABEL_FONT,
      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        IRIS_LABEL_MIN_ZOOM,
        10,
        16,
        11.5,
      ],
      "text-padding": 3,
      "text-optional": true,
    },
    paint: {
      "text-color": "#3d3842",
      "text-opacity": zoomOpacity(
        IRIS_LABEL_MIN_ZOOM,
        0.18,
        IRIS_LABEL_OPAQUE_ZOOM,
        0.92,
      ),
      "text-halo-color": zoomHalo(
        IRIS_LABEL_MIN_ZOOM,
        0.18,
        IRIS_LABEL_OPAQUE_ZOOM,
        0.95,
      ),
      "text-halo-width": 1.35,
    },
  });
  restackLabels(map);
}

function applyPanel(map: MlMap, next: PanelState): void {
  const prev = panelState.shown;
  if (prev === next.shown && panelState.pinned === next.pinned) {
    panelState = next;
    return;
  }
  if (prev !== null && prev !== next.shown) {
    map.setFeatureState({ source: "quartiers", id: prev }, { hover: false });
  }
  panelState = next;
  if (next.shown !== null) {
    map.setFeatureState({ source: "quartiers", id: next.shown }, { hover: true });
  }
  showPanel(next.shown === null ? null : (quartierById.get(next.shown) ?? null));
}

function bindPointer(map: MlMap): void {
  map.on("mousemove", "quartier-fill", (e: MapLayerMouseEvent) => {
    map.getCanvas().style.cursor = "pointer";
    const id = e.features?.[0]?.id;
    if (typeof id === "number") applyPanel(map, hoverMove(panelState, id));
  });
  map.on("mouseleave", "quartier-fill", () => {
    map.getCanvas().style.cursor = "";
    applyPanel(map, hoverLeave(panelState));
  });
  map.on("click", (e) => {
    const id = map.queryRenderedFeatures(e.point, { layers: ["quartier-fill"] })[0]
      ?.id;
    if (typeof id === "number") {
      applyPanel(map, pinQuartier(id));
      fitQuartier(map, id);
    } else {
      applyPanel(map, unpin());
    }
  });
}

async function ensureIris(map: MlMap): Promise<void> {
  if (irisLoaded) return;
  irisLoaded = true;
  const [irisLines, irisLabels] = await Promise.all([
    loadJson<IrisLineCollection>("/data/iris-lines.geojson"),
    loadJson<LabelCollection>("/data/iris-labels.geojson"),
  ]);
  const lines = map.getSource("iris-lines");
  const labels = map.getSource("iris-labels");
  if (lines) (lines as GeoJSONSource).setData(irisLines);
  if (labels) (labels as GeoJSONSource).setData(irisLabels);
}

async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} missing`);
  return response.json();
}

function lockMinZoom(map: MlMap, shouldResize = false): void {
  if (shouldResize) map.resize();
  const box = map.getContainer();
  const fitted = map.cameraForBounds(MAP_MAX_BOUNDS, { padding: 0 });
  const minZoom =
    fitted?.zoom ??
    minZoomToFitBounds(MAP_MAX_BOUNDS, box.clientWidth, box.clientHeight);
  map.setMinZoom(minZoom);
  if (map.getZoom() < minZoom) map.setZoom(minZoom);
}

async function boot(): Promise<void> {
  const map = new MlMap({
    container: "map",
    style: STYLE_URL,
    center: [5.38, 43.296],
    zoom: 11.2,
    minZoom: 10,
    maxZoom: 16,
    maxBounds: MAP_MAX_BOUNDS,
    hash: true,
    locale: FR_LOCALE,
    attributionControl: false,
    transformRequest: (url) => ({ url: rewriteOpenFreeMapUrl(url) }),
  });

  map.addControl(new AttributionControl({ compact: true }), "bottom-right");
  collapseAttribution();
  map.addControl(new NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new ScaleControl({ maxWidth: 120 }), "bottom-left");
  map.addControl(
    new GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
    }),
    "top-right",
  );

  map.on("load", () => lockMinZoom(map, true));
  map.on("resize", () => lockMinZoom(map));
  window.addEventListener("pageshow", () => lockMinZoom(map, true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") lockMinZoom(map, true);
  });
  map.getCanvas().addEventListener("webglcontextrestored", () =>
    lockMinZoom(map, true),
  );

  const onStyleReady = async (): Promise<void> => {
    hideBasemapSymbols(map);
    styleRoadLabels(map);
    collapseAttribution();
    if (map.getSource("quartiers")) return;

    const [q, quartierLines, quartierLabels, arrLabels, irisIndex, arrIndex] =
      await Promise.all([
        loadJson<QuartierCollection>("/data/quartiers.geojson"),
        loadJson<IrisLineCollection>("/data/quartier-lines.geojson"),
        loadJson<LabelCollection>("/data/quartier-labels.geojson"),
        loadJson<LabelCollection>("/data/arrondissement-labels.geojson"),
        loadJson<FeatureCollection<Point, IrisProps>>("/data/iris-index.geojson"),
        loadJson<ArrIndex>("/data/arr-index.geojson"),
      ]);
    quartierById.clear();
    for (const feature of q.features) {
      quartierById.set(feature.properties.id, feature);
    }
    addLayers(map, q, quartierLabels, arrLabels, quartierLines);
    bindPointer(map);
    if (map.getZoom() >= IRIS_LOAD_ZOOM) void ensureIris(map);
    map.on("zoomend", () => {
      if (map.getZoom() >= IRIS_LOAD_ZOOM) void ensureIris(map);
    });

    const layers = document.querySelector<HTMLElement>("#layers-panel");
    if (layers) mountLayersControl(map, layers);

    const geocoder = createGeocoder(q, arrIndex, irisIndex);
    map.addControl(geocoder, "top-left");
    const search = document.querySelector<HTMLInputElement>(
      ".maplibregl-ctrl-geocoder--input",
    );
    if (search) search.type = "text";
    document
      .querySelector(".maplibregl-ctrl-geocoder--button")
      ?.setAttribute("aria-label", "Effacer");
    geocoder.on("result", (event) => {
      const result = event.result;
      const props = (result.properties ?? {}) as {
        kind?: string;
        quartierId?: number;
      };
      const bbox = result.bbox;
      const kind = props.kind;
      const fit =
        kind === "arrondissement"
          ? FIT_ARR
          : kind === "iris"
            ? FIT_IRIS
            : FIT_QUARTIER;
      if (bbox) {
        map.fitBounds(
          [
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]],
          ],
          fit,
        );
      }
      const id = props.quartierId;
      if (kind === "iris") void ensureIris(map);
      if ((kind === "quartier" || kind === "iris") && typeof id === "number") {
        applyPanel(map, pinQuartier(id));
      } else {
        applyPanel(map, unpin());
      }
    });
  };

  map.on("style.load", () => {
    void onStyleReady();
  });
  map.once("idle", () => {
    hideBasemapSymbols(map);
    styleRoadLabels(map);
    restackLabels(map);
    collapseAttribution();
  });
}

void boot();
