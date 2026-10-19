/**
 * The journal's own state — what is selected and how it is laid out — in one
 * store, saved to localStorage.
 *
 * Saved in the same flat `scripture-journal-v3` shape the app has always
 * written, so upgrading keeps everyone's settings. Rehydration is manual
 * (`skipHydration`): localStorage only exists after mount, and the journal
 * waits for `hydrated` before fetching so it never loads the defaults first.
 */

import { create } from "zustand";
import { persist, type PersistStorage, type StorageValue } from "zustand/middleware";

import { uniqueLanguages } from "./bibles";
import { DEFAULT_REFERENCE, DEFAULT_SETTINGS, STORAGE_KEY } from "./constants";
import type { Reference, Settings } from "./types";

export interface JournalState {
  settings: Settings;
  reference: Reference;
  languages: string[];
  /** Sidebar sections that are open; closed ones are absent. */
  openSections: Record<string, boolean>;
  /** The desktop rail preference (collapsed or not). Phones force the rail
   * closed, and that is not a preference, so only desktop state is saved. */
  railPreference: boolean | undefined;
  /** True once saved state has been read back. */
  hydrated: boolean;

  patchSettings: (patch: Partial<Settings>) => void;
  replaceSettings: (settings: Settings) => void;
  updateReference: (update: (prev: Reference) => Reference) => void;
  updateLanguages: (update: (prev: string[]) => string[]) => void;
  setSectionOpen: (id: string, open: boolean) => void;
  setRailPreference: (collapsed: boolean) => void;
}

type Saved = Pick<
  JournalState,
  "settings" | "reference" | "languages" | "openSections" | "railPreference"
>;

/** The flat object the app has always kept under STORAGE_KEY. */
interface LegacyShape {
  settings?: Partial<Settings>;
  reference?: Partial<Reference>;
  openSections?: Record<string, boolean>;
  railCollapsed?: boolean;
  languages?: string[];
  /** Before multi-language selection. */
  language?: string;
  compareLanguage?: string;
  [other: string]: unknown;
}

const onlyOpen = (sections: Record<string, boolean> = {}) =>
  Object.fromEntries(Object.entries(sections).filter(([, open]) => open));

export function fromLegacy(saved: LegacyShape): Saved {
  return {
    settings: { ...DEFAULT_SETTINGS, ...saved.settings },
    reference: { ...DEFAULT_REFERENCE, ...saved.reference },
    languages: uniqueLanguages(
      saved.languages ?? ([saved.language, saved.compareLanguage].filter(Boolean) as string[]),
    ),
    openSections: onlyOpen(saved.openSections),
    railPreference: typeof saved.railCollapsed === "boolean" ? saved.railCollapsed : undefined,
  };
}

export function toLegacy(state: Saved, existing: LegacyShape): LegacyShape {
  const { railCollapsed: _previous, ...rest } = existing;
  return {
    // Keys this version does not know about are carried over untouched.
    ...rest,
    settings: state.settings,
    reference: state.reference,
    openSections: onlyOpen(state.openSections),
    languages: state.languages,
    ...(typeof state.railPreference === "boolean"
      ? { railCollapsed: state.railPreference }
      : typeof _previous === "boolean"
        ? { railCollapsed: _previous }
        : {}),
  };
}

const read = (name: string): LegacyShape | null => {
  try {
    const raw = window.localStorage.getItem(name);
    return raw ? (JSON.parse(raw) as LegacyShape) : null;
  } catch {
    return null; // unreadable storage just means we start from the defaults
  }
};

/** zustand's persist writes on every change, hydrated or not; a write before
 * the saved state is read back would overwrite it with the defaults. */
let writesAllowed = false;

const legacyStorage: PersistStorage<Saved> = {
  getItem: (name) => {
    const saved = read(name);
    return saved ? { state: fromLegacy(saved), version: 0 } : null;
  },
  setItem: (name, value: StorageValue<Saved>) => {
    if (!writesAllowed) return;
    try {
      window.localStorage.setItem(name, JSON.stringify(toLegacy(value.state, read(name) ?? {})));
    } catch {
      // Storage may be full or blocked; the app still works without it.
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  },
};

export const useJournalStore = create<JournalState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      reference: DEFAULT_REFERENCE,
      languages: ["eng"],
      openSections: {},
      railPreference: undefined,
      hydrated: false,

      patchSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
      replaceSettings: (settings) => set({ settings }),
      updateReference: (update) =>
        set((state) => {
          const next = update(state.reference);
          return next === state.reference ? state : { reference: next };
        }),
      updateLanguages: (update) =>
        set((state) => ({ languages: uniqueLanguages(update(state.languages)) })),
      setSectionOpen: (id, open) =>
        set((state) => {
          if (open) return { openSections: { ...state.openSections, [id]: true } };
          const { [id]: _closed, ...rest } = state.openSections;
          return { openSections: rest };
        }),
      setRailPreference: (collapsed) =>
        set((state) => (state.railPreference === collapsed ? state : { railPreference: collapsed })),
    }),
    {
      name: STORAGE_KEY,
      storage: legacyStorage,
      skipHydration: true,
      partialize: (state): Saved => ({
        settings: state.settings,
        reference: state.reference,
        languages: state.languages,
        openSections: state.openSections,
        railPreference: state.railPreference,
      }),
    },
  ),
);

/** Read saved state back once, on the client. */
export async function hydrateJournalStore(): Promise<void> {
  if (useJournalStore.getState().hydrated) return;
  await useJournalStore.persist.rehydrate();
  writesAllowed = true;
  useJournalStore.setState({ hydrated: true });
}
