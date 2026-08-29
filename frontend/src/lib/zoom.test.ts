import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clampZoom, formatZoomPercent, snapZoom } from "./constants";

describe("clampZoom", () => {
  it("clamps to the preview zoom range", () => {
    assert.equal(clampZoom(0.1), 0.2);
    assert.equal(clampZoom(2.5), 2);
    assert.equal(clampZoom(0.75), 0.75);
  });
});

describe("snapZoom", () => {
  it("snaps near common percentages", () => {
    assert.equal(snapZoom(0.74), 0.75);
    assert.equal(snapZoom(0.51), 0.5);
    assert.equal(snapZoom(0.33), 0.33);
  });
});

describe("formatZoomPercent", () => {
  it("rounds to whole percent", () => {
    assert.equal(formatZoomPercent(0.755), "76");
    assert.equal(formatZoomPercent(1), "100");
  });
});
