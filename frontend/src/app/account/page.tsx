"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Account lives in the journal sidecar — keep this route as a bookmark-friendly redirect. */
export default function AccountPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/?account=1");
  }, [router]);

  return null;
}
