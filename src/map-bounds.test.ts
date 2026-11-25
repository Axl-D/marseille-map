import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAP_MAX_BOUNDS, minZoomToFitBounds } from "./map-bounds.ts";

describe("minZoomToFitBounds", () => {
  it("is above 10 on a 1920×1080 desktop so zoom 10 cannot letterbox", () => {
    const z = minZoomToFitBounds(MAP_MAX_BOUNDS, 1920, 1080);
    assert.ok(z > 10.5, `expected > 10.5, got ${z}`);
    assert.ok(z < 11.5, `expected < 11.5, got ${z}`);
  });

  it("allows more zoom-out on a narrow phone", () => {
    const desktop = minZoomToFitBounds(MAP_MAX_BOUNDS, 1920, 1080);
    const phone = minZoomToFitBounds(MAP_MAX_BOUNDS, 390, 844);
    assert.ok(phone < desktop);
    assert.ok(phone > 9);
  });

  it("returns the floor fallback when the container has no size yet", () => {
    assert.equal(minZoomToFitBounds(MAP_MAX_BOUNDS, 0, 800), 10);
  });
});
