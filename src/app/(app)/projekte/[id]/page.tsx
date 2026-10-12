import Link from "next/link";
import { requireProject } from "@/lib/auth";
import { ROLE_LABELS, STATUS_LABELS, formatDate } from "@/lib/types";

export default async function UebersichtPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, project, role, canManage } = await requireProject(id);
  const base = `/projekte/${id}`;

  const [{ count: contactCount }, { count: memberCount }] = await Promise.all([
    supabase.from("project_contacts").select("id", { count: "exact", head: true }).eq("project_id", id),
    supabase.from("project_members").select("user_id", { count: "exact", head: true }).eq("project_id", id),
  ]);

  const address = [project.street, project.zip_city].filter(Boolean).join(", ");

  const tiles = [
    { href: `${base}/kontakte`, title: "Kontakte", text: `${contactCount ?? 0} Einträge`, icon: "☎" },
    { href: `${base}/stammdaten`, title: "Stammdaten", text: "Projektdaten", icon: "⚙" },
    ...(canManage
      ? [{ href: `${base}/zugaenge`, title: "Zugänge", text: `${memberCount ?? 0} Beteiligte mit Login`, icon: "🔑" }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${project.status === "aktiv" ? "badge-green" : ""}`}>
            {STATUS_LABELS[project.status]}
          </span>
          {role && <span className="badge badge-blue">Ihre Rolle: {ROLE_LABELS[role]}</span>}
        </div>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Adresse</dt>
            <dd className="font-medium">
              {address ? (
                <a
                  className="underline decoration-slate-300 underline-offset-2"
                  href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {address}
                </a>
              ) : (
                "–"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Auftraggeber</dt>
            <dd className="font-medium">{project.client_name || "–"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-slate-500">Maßnahme</dt>
            <dd className="font-medium whitespace-pre-line">{project.measure || "–"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Bauzeit</dt>
            <dd className="font-medium">
              {project.start_date || project.end_date
                ? `${formatDate(project.start_date)} – ${formatDate(project.end_date)}`
                : "–"}
            </dd>
          </div>
        </dl>
        {project.notes && (
          <div className="notice notice-info mt-4 text-sm whitespace-pre-line">
            <b>Hinweise:</b> {project.notes}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold text-slate-500">Schnellzugriff</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {tiles.map((t) => (
            <Link key={t.href} href={t.href} className="card flex items-center gap-3 p-4 transition hover:border-brand">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-lg text-brand">
                {t.icon}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{t.title}</span>
                <span className="block truncate text-xs text-slate-500">{t.text}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
