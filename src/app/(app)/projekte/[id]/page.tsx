import Link from "next/link";
import { requireProject } from "@/lib/auth";
import { getUnread } from "@/lib/data";
import {
  ROLE_LABELS,
  STATUS_LABELS,
  formatDate,
  todayBerlin,
  type ProjectStep,
  type ScheduleItem,
  type Topic,
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

  const [
    { count: contactCount },
    { count: memberCount },
    { count: planCount },
    { data: sched },
    unread,
    { data: topicData },
    { data: lastVisit },
    { data: stepData },
  ] = await Promise.all([
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
      supabase
        .from("topics")
        .select("id, title, status, due_date, decision, decided_at")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("site_visits")
        .select("visit_date, title")
        .eq("project_id", id)
        .order("visit_date", { ascending: false })
        .limit(1),
      supabase
        .from("project_steps")
        .select("id, title, ball_at, status, status_since")
        .eq("project_id", id)
        .eq("status", "aktuell")
        .order("position"),
    ]);

  type StepLite = Pick<ProjectStep, "id" | "title" | "ball_at" | "status" | "status_since">;
  const currentSteps = (stepData ?? []) as StepLite[];

  type TopicLite = Pick<Topic, "id" | "title" | "status" | "due_date" | "decision" | "decided_at">;
  const topicList = (topicData ?? []) as TopicLite[];
  const openTopics = topicList.filter((x) => x.status === "offen" || x.status === "in_klaerung");
  const latestDecisions = topicList
    .filter((x) => x.status === "festgelegt" && x.decided_at)
    .sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""))
    .slice(0, 3);
  const visit = ((lastVisit ?? []) as { visit_date: string; title: string | null }[])[0];

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
    { href: `${base}/projektstand`, title: "Projektstand", text: currentSteps.length ? currentSteps.map((s) => s.title).join(", ") : `${openTopics.length} offene Themen`, icon: "◎" },
    {
      href: `${base}/kommunikation`,
      title: "Kommunikation",
      text: unread.total ? `${unread.total} ungelesen` : "Keine neuen Nachrichten",
      icon: "✉",
    },
    { href: `${base}/bauzeitenplan`, title: "Bauzeitenplan", text: `${running.length} laufend`, icon: "▤" },
    { href: `${base}/dokumente`, title: "Dokumente", text: `${planCount ?? 0} gültige Pläne`, icon: "▦" },
    { href: `${base}/kontakte`, title: "Kontakte", text: `${contactCount ?? 0} Einträge`, icon: "☎" },
    {
      href: `${base}/protokolle`,
      title: "Protokolle",
      text: visit ? `Letzter Ortstermin ${formatDate(visit.visit_date)}` : "Noch keine",
      icon: "✎",
    },
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
      {currentSteps.length > 0 && (
        <Link href={`${base}/projektstand`} className="card block border-petrol p-4 transition hover:bg-brand-soft">
          <div className="text-xs font-bold tracking-wide text-petrol uppercase">Projektstand – jetzt</div>
          <ul className="mt-1 space-y-1">
            {currentSteps.map((s) => {
              const d = Math.max(0, Math.floor((Date.now() - new Date(s.status_since).getTime()) / 86_400_000));
              return (
                <li key={s.id}>
                  <span className="font-semibold">{s.title}</span>
                  <span className="text-sm text-slate-600">
                    {s.ball_at ? ` · Ball: ${s.ball_at}` : ""} · {d === 0 ? "seit heute" : d === 1 ? "seit 1 Tag" : `seit ${d} Tagen`}
                  </span>
                </li>
              );
            })}
          </ul>
        </Link>
      )}

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

      {(openTopics.length > 0 || latestDecisions.length > 0) && (
        <section className="grid gap-4 md:grid-cols-2">
          <div className="card p-4">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Offene Themen</h3>
            {openTopics.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Keine.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-sm">
                {openTopics.slice(0, 5).map((x) => (
                  <li key={x.id}>
                    <Link href={`${base}/projektstand?offen=t-${x.id}#t-${x.id}`} className="hover:underline">
                      {x.title}
                    </Link>
                    {x.due_date && (
                      <span className={x.due_date < today ? "text-red-700" : "text-slate-500"}>
                        {" "}· bis {formatDate(x.due_date)}
                      </span>
                    )}
                  </li>
                ))}
                {openTopics.length > 5 && (
                  <li>
                    <Link href={`${base}/projektstand`} className="text-slate-500 hover:underline">
                      + {openTopics.length - 5} weitere
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </div>
          <div className="card p-4">
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Neueste Festlegungen</h3>
            {latestDecisions.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Noch keine.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {latestDecisions.map((x) => (
                  <li key={x.id}>
                    <Link href={`${base}/projektstand?offen=t-${x.id}#t-${x.id}`} className="font-medium hover:underline">
                      {x.title}
                    </Link>
                    <div className="line-clamp-2 text-slate-600">{x.decision}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

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
