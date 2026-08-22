import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { printFilename } from "./filename";

const ref = {
  startChapter: "3",
  startVerse: "16",
  endChapter: "3",
  endVerse: "17",
};

describe("printFilename", () => {
  it("uses the book_ChN:v-ChN:v pattern", () => {
    assert.equal(printFilename("John", ref), "John_Ch3:16-Ch3:17");
  });

  it("underscores spaces and keeps CJK letters", () => {
    assert.equal(printFilename("1 John", ref), "1_John_Ch3:16-Ch3:17");
    assert.equal(printFilename("約翰福音", ref), "約翰福音_Ch3:16-Ch3:17");
  });

  it("strips punctuation that is not safe in a filename", () => {
    assert.equal(printFilename("John (ESV)", ref), "John_ESV_Ch3:16-Ch3:17");
  });

  it("spans chapters in the same pattern", () => {
    assert.equal(
      printFilename("John", { ...ref, endChapter: "4", endVerse: "2" }),
      "John_Ch3:16-Ch4:2",
    );
  });
});
