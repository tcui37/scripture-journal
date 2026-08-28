import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  NARROW_UI_MAX_PX,
  PREVIEW_GUTTER_NARROW,
  PREVIEW_GUTTER_WIDE,
  fitPreviewScale,
  isNarrowWidth,
  narrowUiQuery,
  previewGutter,
  startRailCollapsed,
} from "./layout";

describe("isNarrowWidth", () => {
  it("treats a phone width as narrow", () => {
    assert.equal(isNarrowWidth(390), true);
    assert.equal(isNarrowWidth(NARROW_UI_MAX_PX), true);
  });

  it("treats desktop widths as wide", () => {
    assert.equal(isNarrowWidth(NARROW_UI_MAX_PX + 1), false);
    assert.equal(isNarrowWidth(1280), false);
  });
});

describe("previewGutter", () => {
  it("uses a tight gutter on a phone so the sheet can scale up", () => {
    assert.equal(previewGutter(390), PREVIEW_GUTTER_NARROW);
  });

  it("keeps the desktop gutter on a wide pane", () => {
    assert.equal(previewGutter(1100), PREVIEW_GUTTER_WIDE);
  });
});

describe("fitPreviewScale", () => {
  it("fits a Letter sheet on an iPhone-sized pane", () => {
    const scale = fitPreviewScale(390, 816);
    assert.ok(scale >= 0.2);
    assert.ok(scale < 1);
    assert.ok(scale * 816 <= 390);
  });

  it("does not upscale past 100% on a wide desk", () => {
    assert.equal(fitPreviewScale(1400, 816), 1);
  });

  it("floors at 20% for a huge sheet in a tiny pane", () => {
    assert.equal(fitPreviewScale(200, 2000), 0.2);
  });

  it("guards against empty geometry", () => {
    assert.equal(fitPreviewScale(390, 0), 1);
    assert.equal(fitPreviewScale(10, 816), 0.2);
  });
});

describe("startRailCollapsed", () => {
  it("closes the rail on a phone so the preview is visible", () => {
    assert.equal(startRailCollapsed(true, false, false), true);
    assert.equal(startRailCollapsed(true, false, true), true);
  });

  it("opens the rail on a phone when Files is requested", () => {
    assert.equal(startRailCollapsed(true, true, true), false);
  });

  it("honours stored desktop collapse", () => {
    assert.equal(startRailCollapsed(false, false, true), true);
    assert.equal(startRailCollapsed(false, false, false), false);
    assert.equal(startRailCollapsed(false, false), false);
  });
});

describe("narrowUiQuery", () => {
  it("matches the CSS breakpoint", () => {
    assert.equal(narrowUiQuery(), `(max-width: ${NARROW_UI_MAX_PX}px)`);
  });
});
