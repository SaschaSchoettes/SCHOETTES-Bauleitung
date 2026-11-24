import Link from "next/link";

/** Pfadzeile „Projektraum › …“ für die festen Ordner (Bauzeitenplan, Protokolle …). */
export function RaumPfad({
  projectId,
  items,
}: {
  projectId: string;
  items: { label: string; href?: string }[];
}) {
  return (
    <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm">
      <Link href={`/projekte/${projectId}/dokumente`} className="text-slate-500 hover:underline">
        📁 Projektraum
      </Link>
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="text-slate-400">›</span>
          {it.href ? (
            <Link href={it.href} className="text-slate-500 hover:underline">
              {it.label}
            </Link>
          ) : (
            <span className="font-semibold">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
