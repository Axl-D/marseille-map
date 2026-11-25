import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BASEMAP_PREFIX,
  OPENFREEMAP_ORIGIN,
  STYLE_URL,
  rewriteOpenFreeMapUrl,
} from "./basemap.ts";

describe("rewriteOpenFreeMapUrl", () => {
  it("rewrites OpenFreeMap tiles to same-origin /basemap", () => {
    assert.equal(
      rewriteOpenFreeMapUrl(`${OPENFREEMAP_ORIGIN}/planet`),
      `${BASEMAP_PREFIX}/planet`,
    );
    assert.equal(
      rewriteOpenFreeMapUrl(`${OPENFREEMAP_ORIGIN}/styles/positron`),
      `${BASEMAP_PREFIX}/styles/positron`,
    );
  });

  it("leaves overlay and other hosts alone", () => {
    assert.equal(rewriteOpenFreeMapUrl("/data/quartiers.geojson"), "/data/quartiers.geojson");
    assert.equal(
      rewriteOpenFreeMapUrl("https://example.com/tile"),
      "https://example.com/tile",
    );
  });

  it("points the style at the same-origin proxy", () => {
    assert.equal(STYLE_URL, `${BASEMAP_PREFIX}/styles/positron`);
  });
});
