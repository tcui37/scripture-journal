import { Suspense } from "react";

import JournalApp from "@/components/JournalApp";

export default function Home() {
  return (
    <Suspense>
      <JournalApp />
    </Suspense>
  );
}
