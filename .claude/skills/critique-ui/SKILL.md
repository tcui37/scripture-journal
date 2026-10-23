---
name: critique-ui
description: Critique the design of the Scripture Journal frontend straight from the codebase — usability, visual hierarchy, consistency, and responsiveness. Use when asked to "critique the UI", "review the app's design", or run /critique-ui, optionally scoped to one screen or component.
argument-hint: "[screen or component, e.g. login, Sidebar, files] (default: whole app)"
---

# Critique the app's design from code

Scope: $ARGUMENTS (if empty, review the whole app).

## 1. Load the critique framework

Invoke the `design:design-critique` skill and use its structure and criteria for the review. If it isn't available, critique on: first impression, usability, visual hierarchy, consistency, accessibility basics, and responsive behaviour.

## 2. Gather the design from code

The UI lives in `frontend/` (Next.js app router, plain CSS, no component library):

- Design tokens and styles: `frontend/src/app/globals.css`, which holds all colours, type, spacing, and breakpoints. Read it first.
- Screens: `frontend/src/app/*/page.tsx` (`/`, `/login`, `/signup`, `/files`, `/account`) and `frontend/src/app/layout.tsx`.
- Components: `frontend/src/components/`. The main surface is `JournalApp.tsx` with `Sidebar.tsx`, `PageStack.tsx`, `AppNav.tsx`, and the `*Panel.tsx` files.

When a scope is given, read the matching page or component plus everything it renders and the CSS classes it uses. Map class names back to `globals.css` so you judge the real styling, not just the markup.

## 3. Look at it rendered when you can

If the dev server can be started (`npm run dev` in `frontend/`) and a browser tool is available, screenshot the scoped screens at desktop width and at about 390px mobile width, and base visual judgments on them. If you can't, say that the critique is code-only and that visual claims are inferred.

## 4. What to look for in the code

- Hard-coded colours, sizes, or spacing that bypass the tokens in `globals.css`.
- The same kind of control (buttons, inputs, toggles, panels) styled differently in different places.
- Missing hover, focus-visible, disabled, loading, empty, and error states.
- Problems at mobile width: overflow, tap targets under 44px, and fixed widths.
- Hierarchy: whether the primary action on each screen is obvious, and whether headings and labels follow a consistent scale.
- Copy: labels, empty states, and error messages that are unclear or inconsistent.

## 5. Report

Follow the design-critique output format. Cite every finding as a clickable `path:line` link and rank by impact (critical, then moderate, then minor). End with the top 3 fixes worth doing first. Don't edit any files unless the user asks for fixes after the review.
