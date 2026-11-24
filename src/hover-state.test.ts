import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hoverLeave,
  hoverMove,
  pinQuartier,
  unpin,
  type PanelState,
} from "./hover-state.ts";

const empty: PanelState = { pinned: null, shown: null };

test("hoverMove shows quartier without pinning", () => {
  const next = hoverMove(empty, 1320101);
  assert.deepEqual(next, { pinned: null, shown: 1320101 });
});

test("hoverLeave restores pin, or hides if none", () => {
  assert.deepEqual(hoverLeave({ pinned: null, shown: 1 }), {
    pinned: null,
    shown: null,
  });
  assert.deepEqual(hoverLeave({ pinned: 7, shown: 3 }), {
    pinned: 7,
    shown: 7,
  });
});

test("pinQuartier sticks after leave; unpin clears", () => {
  const pinned = pinQuartier(1320706);
  assert.deepEqual(pinned, { pinned: 1320706, shown: 1320706 });
  assert.deepEqual(hoverLeave(hoverMove(pinned, 99)), {
    pinned: 1320706,
    shown: 1320706,
  });
  assert.deepEqual(unpin(), empty);
});
