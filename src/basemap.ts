export const OPENFREEMAP_ORIGIN = "https://tiles.openfreemap.org";
export const BASEMAP_PREFIX = "/basemap";
export const STYLE_URL = `${BASEMAP_PREFIX}/styles/positron`;

/** Brave Shields blocks tiles.openfreemap.org (ERR_BLOCKED_BY_CLIENT). Same-origin proxy. */
export function rewriteOpenFreeMapUrl(url: string): string {
  if (!url.startsWith(OPENFREEMAP_ORIGIN)) return url;
  return BASEMAP_PREFIX + url.slice(OPENFREEMAP_ORIGIN.length);
}
