"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export type Tab = { href: string; label: string; also?: string[] };

export function ProjectTabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  // Aktiven Reiter auf dem Handy in den sichtbaren Bereich scrollen
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  // Längster passender Pfad gewinnt (Übersicht = Basis-Pfad)
  const matches = (p: string) => pathname === p || pathname.startsWith(p + "/");
  const active =
    tabs.find((t) => (t.also ?? []).some(matches)) ??
    tabs.filter((t) => matches(t.href)).sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <nav className="no-scrollbar -mx-4 overflow-x-auto border-b border-slate-200 px-4">
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => {
          const isActive = active?.href === t.href;
          return (
            <li key={t.href}>
              <Link
                ref={isActive ? activeRef : undefined}
                href={t.href}
                className={`block border-b-2 px-3 py-3 text-[0.95rem] whitespace-nowrap ${
                  isActive
                    ? "border-brand font-semibold text-brand"
                    : "border-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
