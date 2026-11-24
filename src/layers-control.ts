import type { Map } from "maplibre-gl";

export type LayerToggle = {
  id: string;
  label: string;
  layerIds: string[];
  checked: boolean;
};

export const LAYERS_TITLE = "Calques";
export const ROAD_LABEL_LAYER = "highway-name-major";
export const IRIS_OUTLINE_LAYER = "iris-outline";
export const IRIS_LABEL_LAYER = "iris-label";
export const IRIS_LABEL_MIN_ZOOM = 14.5;
/** Both name layers stay up for this much zoom after IRIS appear. */
export const QUARTIER_IRIS_OVERLAP = 0.5;
/** Quartier names stay fully opaque through the overlap, then fade. */
export const QUARTIER_LABEL_FADE_START =
  IRIS_LABEL_MIN_ZOOM + QUARTIER_IRIS_OVERLAP;
export const QUARTIER_LABEL_MAX_ZOOM = QUARTIER_LABEL_FADE_START + 0.45;
/** Fetch IRIS lines/labels just before they fade in. */
export const IRIS_LOAD_ZOOM = 14.4;

const LAYERS_ICON = `<svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M9 2.2 1.8 5.8 9 9.4l7.2-3.6L9 2.2zm0 8.4L2.4 7.3 1.8 7.6 9 11.2l7.2-3.6-.6-.3L9 10.6zm0 3.2L2.4 10.5 1.8 10.8 9 14.4l7.2-3.6-.6-.3L9 13.8z"/></svg>`;

export const DEFAULT_LAYER_TOGGLES: LayerToggle[] = [
  {
    id: "arr-fills",
    label: "Arrondissements",
    layerIds: ["arrondissement-fill"],
    checked: true,
  },
  {
    id: "q-outlines",
    label: "Contours des quartiers",
    layerIds: ["quartier-outline"],
    checked: true,
  },
  {
    id: "q-names",
    label: "Noms des quartiers",
    layerIds: ["quartier-label"],
    checked: true,
  },
  {
    id: "iris",
    label: "IRIS (sous-quartiers)",
    layerIds: [IRIS_OUTLINE_LAYER, IRIS_LABEL_LAYER],
    checked: true,
  },
  {
    id: "arr-numbers",
    label: "Numéros d'arrondissement",
    layerIds: ["arrondissement-label"],
    checked: true,
  },
  {
    id: "road-names",
    label: "Noms des rues",
    layerIds: [ROAD_LABEL_LAYER],
    checked: true,
  },
];

export function setLayersVisible(
  map: Map,
  layerIds: string[],
  visible: boolean,
): void {
  const value = visible ? "visible" : "none";
  for (const id of layerIds) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, "visibility", value);
    }
  }
}

export function mountLayersControl(
  map: Map,
  container: HTMLElement,
  toggles: LayerToggle[] = DEFAULT_LAYER_TOGGLES,
): void {
  container.replaceChildren();
  container.classList.add("layers-root");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "layers-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "layers-menu");
  toggle.setAttribute("aria-label", LAYERS_TITLE);
  toggle.innerHTML = LAYERS_ICON;

  const menu = document.createElement("div");
  menu.id = "layers-menu";
  menu.className = "layers-menu panel";
  menu.hidden = true;

  const title = document.createElement("h2");
  title.textContent = LAYERS_TITLE;
  menu.append(title);

  for (const row of toggles) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = row.checked;
    input.addEventListener("change", () => {
      setLayersVisible(map, row.layerIds, input.checked);
    });
    label.append(input, document.createTextNode(row.label));
    menu.append(label);
  }

  const setOpen = (open: boolean): void => {
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    container.classList.toggle("is-open", open);
  };

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(menu.hasAttribute("hidden"));
  });
  document.addEventListener("pointerdown", (event) => {
    if (!container.contains(event.target as Node)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });

  container.append(toggle, menu);
}
