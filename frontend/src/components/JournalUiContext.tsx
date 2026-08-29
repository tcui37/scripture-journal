"use client";

import { createContext, useContext } from "react";

interface JournalUiContextValue {
  accountOpen: boolean;
  toggleAccount: () => void;
  closeAccount: () => void;
}

const JournalUiContext = createContext<JournalUiContextValue | null>(null);

export function JournalUiProvider({
  value,
  children,
}: {
  value: JournalUiContextValue;
  children: React.ReactNode;
}) {
  return <JournalUiContext.Provider value={value}>{children}</JournalUiContext.Provider>;
}

export function useJournalUi(): JournalUiContextValue | null {
  return useContext(JournalUiContext);
}
