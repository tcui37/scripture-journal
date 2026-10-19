"use client";

import { QueryClientProvider } from "@tanstack/react-query";

import { queryClient } from "@/lib/queries";

/** The app's one query cache — shared with non-React callers in lib/. */
export default function QueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
