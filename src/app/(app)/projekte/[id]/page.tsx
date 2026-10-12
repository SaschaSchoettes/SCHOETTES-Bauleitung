import Link from "next/link";
import { requireProject } from "@/lib/auth";
import { getUnread } from "@/lib/data";
import {
  ROLE_LABELS,
  STATUS_LABELS,
  formatDate,
  todayBerlin,
  type ScheduleItem,
} from "@/lib/types";

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function UebersichtPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, project, role, canManage } = await requireProject(id);
  const base = `/projekte/${id}`;
  const today = todayBerlin();
  const in14 = addDays(today, 14);

  const [{ count: contactCount }, { count: memberCount }, { count: planCount }, { data: sched }, unread] =
    await Promise.all([
      supabase.from("project_contacts").select("id", { count: "exact", head: true }).eq("project_id", id),
      supabase.from("project_members").select("user_id", { count: "exact", head: true }).eq("project_id", id),
      supabase
        .from("project_files")
        .select("id", { count: "exact", head: true })
        .eq("project_id", id)
        .eq("kind", "plan")
        .eq("superseded", false),
      supabase
        .from("schedule_items")
        .select("*")
        .eq("project_id", id)
        .neq("status", "erledigt")
        .lte("start_date", in14)
        .gte("end_date", today)
        .order("start_date"),
      getUnread(supabase, id, user.id),
    ]);

  const items = (sched ?? []) as ScheduleItem[];
  const running = items.filter((i) => i.start_date <= today);
  const upcoming = items.filter((i) => i.start_date > today);
  const myOpen = items.filter((i) => i.assignee_id === user.id && !i.confirmed_at);

  const address = [project.street, project.zip_city].filter(Boolean).join(", ");
  const todayLabel = new Date().toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });

  const tiles = [
    { href: `${base}/bauzeitenplan`, title: "Bauzeitenplan", text: `${running.length} laufend`, icon: "▤" },
    { href: `${base}/plaene`, title: "Pläne", text: `${planCount ?? 0} gültige Pläne`, icon: "▦" },
    {
      href: `${base}/kommunikation`,
      title: "Kommunikation",
      text: unread.total ? `${unread.total} ungelesen` : "Keine neuen Nachrichten",
      icon: "✉",
    },
    { href: `${base}/kontakte`, title: "Kontakte", text: `${contactCount ?? 0} Einträge`, icon: "☎" },
    { href: `${base}/stammdaten`, title: "Stammdaten", text: "Projektdaten", icon: "⚙" },
    ...(canManage
      ? [{ href: `${base}/zugaenge`, title: "Zugänge", text: `${memberCount ?? 0} mit Login`, icon: "🔑" }]
      : []),
  ];

  const ItemLine = ({ i }: { i: ScheduleItem }) => (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <div className="font-medium">{i.title}</div>
        <div className="text-sm text-slate-500">
          {formatDate(i.start_date)} – {formatDate(i.end_date)}
          {i.trade ? ` · ${i.trade}` : ""}
        </div>
      </div>
      {i.assignee_id &&
        (i.confirmed_at ? (
          <span className="badge badge-green">Bestätigt</span>
        ) : (
          <span className="badge badge-amber">Unbestätigt</span>
        ))}
    </li>
  );

  return (
    <div className="space-y-6">
      {myOpen.length > 0 && (
        <Link href={`${base}/bauzeitenplan`} className="notice notice-info block">
          <b>Bitte bestätigen:</b> {myOpen.length === 1 ? "1 Termin wartet" : `${myOpen.length} Termine warten`} auf
          Ihre Bestätigung →
        </Link>
      )}

      <section>
        <h2 className="text-xl font-semibold">Was ist dran</h2>
        <p className="text-sm text-slate-500">{todayLabel}</p>
        <div className="card mt-3 px-4 py-1">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">In den nächsten 14 Tagen steht kein Vorgang an.</p>
          ) : (
            <>
              {running.length > 0 && (
                <>
                  <h3 className="pt-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">Heute aktiv</h3>
                  <ul className="divide-y divide-slate-100">
                    {running.map((i) => (
                      <ItemLine key={i.id} i={i} />
                    ))}
                  </ul>
                </>
              )}
              {upcoming.length > 0 && (
                <>
                  <h3 className="pt-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                    Nächste 14 Tage
                  </h3>
                  <ul className="divide-y divide-slate-100">
                    {upcoming.map((i) => (
                      <ItemLine key={i.id} i={i} />
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
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
    </div>
  );
}
