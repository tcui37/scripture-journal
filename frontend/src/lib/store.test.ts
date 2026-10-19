import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_REFERENCE, DEFAULT_SETTINGS } from "./constants";
import { fromLegacy, toLegacy } from "./store";

describe("fromLegacy", () => {
  it("fills gaps from the defaults and keeps only open sections", () => {
    const state = fromLegacy({
      settings: { size: 14 },
      reference: { bookId: "RUT" },
      openSections: { passage: true, layout: false },
      railCollapsed: true,
      languages: ["eng", "cmn", "eng"],
    });
    assert.equal(state.settings.size, 14);
    assert.equal(state.settings.font, DEFAULT_SETTINGS.font);
    assert.equal(state.reference.bookId, "RUT");
    assert.equal(state.reference.bibleId, DEFAULT_REFERENCE.bibleId);
    assert.deepEqual(state.openSections, { passage: true });
    assert.equal(state.railPreference, true);
    assert.deepEqual(state.languages, ["eng", "cmn"]);
  });

  it("reads the single-language format from before multi-language", () => {
    assert.deepEqual(fromLegacy({ language: "kor", compareLanguage: "eng" }).languages, [
      "kor",
      "eng",
    ]);
    assert.deepEqual(fromLegacy({}).languages, ["eng"]);
    assert.equal(fromLegacy({}).railPreference, undefined);
  });
});

describe("toLegacy", () => {
  const saved = fromLegacy({ railCollapsed: false });

  it("writes the flat shape and keeps keys it does not own", () => {
    const out = toLegacy(saved, { somethingElse: 1 });
    assert.equal(out.somethingElse, 1);
    assert.equal(out.railCollapsed, false);
    assert.deepEqual(out.reference, DEFAULT_REFERENCE);
  });

  it("keeps the stored rail preference when there is no new one", () => {
    const out = toLegacy({ ...saved, railPreference: undefined }, { railCollapsed: true });
    assert.equal(out.railCollapsed, true);
  });

  it("round-trips", () => {
    const state = fromLegacy({ settings: { size: 9 }, openSections: { designs: true } });
    assert.deepEqual(fromLegacy(toLegacy(state, {})), state);
  });
});
