import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { focusIsInside, restoreFocusFromPanel } from "./focus";

type MockElement = {
  focus: () => void;
  id?: string;
};

function installDocument(options: {
  panel: { contains: (node: Node | null) => boolean };
  active: MockElement;
  querySelector?: (selector: string) => MockElement | null;
  getElementById?: (id: string) => { contains: (node: Node | null) => boolean } | null;
}) {
  const state = { active: options.active as unknown as Element };

  const bindFocus = (el: MockElement | null | undefined) => {
    if (!el) return;
    el.focus = () => {
      state.active = el as unknown as Element;
    };
  };

  bindFocus(options.active);

  globalThis.document = {
    get activeElement() {
      return state.active;
    },
    querySelector(selector: string) {
      const el = options.querySelector?.(selector) ?? null;
      bindFocus(el);
      return el as Element | null;
    },
    getElementById(id: string) {
      return (options.getElementById?.(id) ?? null) as Element | null;
    },
  } as Document;
}

afterEach(() => {
  // @ts-expect-error test cleanup
  delete globalThis.document;
});

describe("focusIsInside", () => {
  it("returns true when the active element is a descendant", () => {
    const inside: MockElement = { focus: () => {} };
    const panel = { contains: (node: Node | null) => node === (inside as unknown as Node) };
    installDocument({ panel, active: inside });

    assert.equal(focusIsInside(panel as unknown as Element), true);
  });

  it("returns false when focus is elsewhere", () => {
    const inside: MockElement = { focus: () => {} };
    const outside: MockElement = { focus: () => {}, id: "outside" };
    const panel = { contains: (node: Node | null) => node === (inside as unknown as Node) };
    installDocument({ panel, active: outside });

    assert.equal(focusIsInside(panel as unknown as Element), false);
  });
});

describe("restoreFocusFromPanel", () => {
  it("focuses the first fallback outside the panel", () => {
    const inside: MockElement = { focus: () => {} };
    const fallback: MockElement = { focus: () => {}, id: "fallback" };
    const panel = { contains: (node: Node | null) => node === (inside as unknown as Node) };
    installDocument({
      panel,
      active: inside,
      querySelector: (selector) => (selector === "#fallback" ? fallback : null),
    });

    assert.equal(restoreFocusFromPanel(panel as unknown as Element, ["#fallback"]), true);
    assert.equal(document.activeElement, fallback as unknown as Element);
  });

  it("does nothing when focus is already outside the panel", () => {
    const inside: MockElement = { focus: () => {} };
    const outside: MockElement = { focus: () => {}, id: "outside" };
    const panel = { contains: (node: Node | null) => node === (inside as unknown as Node) };
    installDocument({
      panel,
      active: outside,
      querySelector: () => inside,
    });

    assert.equal(restoreFocusFromPanel(panel as unknown as Element, ["#inside"]), false);
    assert.equal(document.activeElement, outside as unknown as Element);
  });
});
