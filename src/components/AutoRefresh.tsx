"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Lädt die Seite in festen Abständen neu, solange sie sichtbar ist. */
export function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
