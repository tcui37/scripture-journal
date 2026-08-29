import { Suspense } from "react";

import JournalApp from "@/components/JournalApp";
import LibraryProvider from "@/components/LibraryProvider";

export default function Home() {
  return (
    <Suspense>
      <LibraryProvider>
        <JournalApp />
      </LibraryProvider>
    </Suspense>
  );
}
