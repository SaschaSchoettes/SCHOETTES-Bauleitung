"use client";

import { useEffect, useRef } from "react";

/** Scrollt beim Öffnen zur neuesten Nachricht. */
export function ScrollToBottom({ dep }: { dep: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "end" });
  }, [dep]);
  return <div ref={ref} />;
}
