"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Files live in the left rail — keep this route as a bookmark-friendly redirect. */
export default function FilesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/?files=1");
  }, [router]);

  return null;
}
