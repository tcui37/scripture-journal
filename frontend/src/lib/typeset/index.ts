/**
 * The typesetter: a passage and page settings in, printable sheets out.
 *
 *   passage ─▶ blocks (blocks.ts) ─▶ paginate (paginate.ts) ─▶ sheet HTML (render.ts)
 *
 * Plain functions with no React, so the preview, print and the library's page
 * counts all share it. The only browser dependency is the `Measurer`, which
 * renders candidate markup off-screen to learn its height; the browser tests
 * in e2e/layout.spec.ts check the whole pipeline in real Chrome.
 */

export * from "./blocks";
export * from "./pages";
export * from "./paginate";
export * from "./parallel";
export * from "./render";
