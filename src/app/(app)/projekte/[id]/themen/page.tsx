import Link from "next/link";
import { requireProject } from "@/lib/auth";
import { getMembers, memberLabel, memberName } from "@/lib/data";
import { commentTopic, createTopic, decideTopic, deleteTopic, updateTopic } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Notice";
import {
  ROLE_LABELS,
  TOPIC_STATUS_LABELS,
  formatDate,
  formatDateTime,
  todayBerlin,
  type Member,
  type Topic,
  type TopicComment,
  type TopicStatus,
} from "@/lib/types";

const STATUS_BADGE: Record<TopicStatus, string> = {
  offen: "badge-amber",
  in_klaerung: "badge-blue",
  festgelegt: "badge-green",
  erledigt: "",
};

const FILTERS = [
  { key: "offen", label: "Offen & in Klärung" },
  { key: "festgelegt", label: "Festlegungen" },
  { key: "alle", label: "Alle" },
] as const;

function TopicFields({ topic, members }: { topic?: Topic; members: Member[] }) {
  return (
    <>
      <div className="sm:col-span-2">
        <label className="label">Thema *</label>
        <input name="title" required defaultValue={topic?.title ?? ""} className="input" placeholder="z. B. Dämmstärke Fassade Nordseite" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Beschreibung</label>
        <textarea name="description" rows={3} defaultValue={topic?.description ?? ""} className="input" placeholder="Worum geht es, was hängt davon ab?" />
      </div>
      <div>
        <label className="label">Betrifft Gewerk</label>
        <input name="trade" defaultValue={topic?.trade ?? ""} className="input" placeholder="z. B. Fassade / WDVS" />
      </div>
      <div>
        <label className="label">Zuständig für Klärung</label>
        <select name="responsible_id" defaultValue={topic?.responsible_id ?? ""} className="input">
          <option value="">– offen –</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {memberLabel(m)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Klären bis</label>
        <input name="due_date" type="date" defaultValue={topic?.due_date ?? ""} className="input" />
      </div>
    </>
  );
}

export default async function ThemenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; fehler?: string; filter?: string; offen?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f.key === sp.filter)?.key ?? "offen";
  const { supabase, user, canManage } = await requireProject(id);

  const [{ data: topicData }, { data: commentData }, members] = await Promise.all([
    supabase.from("topics").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("topic_comments").select("*").eq("project_id", id).order("created_at", { ascending: true }),
    getMembers(supabase, id),
  ]);

  const all = (topicData ?? []) as Topic[];
  const comments = (commentData ?? []) as TopicComment[];
  const byId = new Map<string, Member>(members.map((m): [string, Member] => [m.user_id, m]));
  const nameOf = (uid: string | null) => (uid && byId.get(uid) ? memberName(byId.get(uid)!) : "Ehemaliger Beteiligter");
  const today = todayBerlin();

  const counts = {
    offen: all.filter((t) => t.status === "offen" || t.status === "in_klaerung").length,
    festgelegt: all.filter((t) => t.status === "festgelegt").length,
    alle: all.length,
  };

  const topics = all
    .filter((t) =>
      filter === "alle"
        ? true
        : filter === "festgelegt"
          ? t.status === "festgelegt"
          : t.status === "offen" || t.status === "in_klaerung",
    )
    .sort((a, b) => {
      if (filter === "festgelegt") return (b.decided_at ?? "").localeCompare(a.decided_at ?? "");
      return (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") || b.created_at.localeCompare(a.created_at);
    });

  const create = createTopic.bind(null, id);
  const update = updateTopic.bind(null, id);
  const decide = decideTopic.bind(null, id);
  const comment = commentTopic.bind(null, id);
  const del = deleteTopic.bind(null, id);

  return (
    <div>
      <h2 className="text-xl font-semibold">Themen</h2>
      <p className="mt-1 text-sm text-slate-500">
        Offene Fragen und Festlegungen – jeder Beteiligte kann Themen anlegen und kommentieren
      </p>

      <div className="mt-4">
        <Notice ok={sp.ok} error={sp.fehler} />
      </div>

      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/projekte/${id}/themen?filter=${f.key}`}
            className={`btn btn-sm whitespace-nowrap ${filter === f.key ? "btn-primary" : ""}`}
          >
            {f.label} ({counts[f.key]})
          </Link>
        ))}
      </div>

      {topics.length === 0 && (
        <div className="card mt-5 p-6 text-center text-slate-500">
          {filter === "festgelegt" ? "Noch keine Festlegungen." : "Keine offenen Themen."}
        </div>
      )}

      <div className="mt-5 space-y-3">
        {topics.map((t) => {
          const tc = comments.filter((c) => c.topic_id === t.id);
          const overdue = t.due_date && t.due_date < today && (t.status === "offen" || t.status === "in_klaerung");
          const canEdit = canManage || t.created_by === user.id;
          return (
            <article key={t.id} id={`t-${t.id}`} className="card scroll-mt-24 p-4">
              <details open={sp.offen === t.id}>
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold">{t.title}</div>
                      <div className="mt-0.5 text-sm text-slate-500">
                        {[
                          t.trade,
                          t.responsible_id && `Zuständig: ${nameOf(t.responsible_id)}`,
                          t.due_date && `bis ${formatDate(t.due_date)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ") || " "}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {overdue && <span className="badge" style={{ color: "#b42318", borderColor: "#f1c4c0", background: "#fef3f2" }}>Überfällig</span>}
                      {tc.length > 0 && <span className="badge">💬 {tc.length}</span>}
                      <span className={`badge ${STATUS_BADGE[t.status]}`}>{TOPIC_STATUS_LABELS[t.status]}</span>
                    </div>
                  </div>
                  {t.status === "festgelegt" && t.decision && (
                    <div className="notice notice-ok mt-3 text-sm whitespace-pre-line">
                      <b>Festlegung:</b> {t.decision}
                    </div>
                  )}
                </summary>

                <div className="mt-3 space-y-4 border-t border-slate-100 pt-3">
                  {t.description && <p className="text-sm whitespace-pre-line text-slate-700">{t.description}</p>}
                  <p className="text-xs text-slate-400">
                    Angelegt von {nameOf(t.created_by)} am {formatDateTime(t.created_at)}
                    {t.decided_at && ` · festgelegt von ${nameOf(t.decided_by)} am ${formatDateTime(t.decided_at)}`}
                  </p>

                  {/* Kommentare */}
                  <div className="space-y-2">
                    {tc.map((c) => {
                      const a = byId.get(c.author_id);
                      return (
                        <div key={c.id} className="rounded-xl bg-slate-50 px-3 py-2">
                          <div className="text-xs text-slate-500">
                            <b className="text-slate-700">{nameOf(c.author_id)}</b>
                            {a && ` · ${a.trade || ROLE_LABELS[a.role]}`} · {formatDateTime(c.created_at)}
                          </div>
                          <div className="mt-0.5 text-sm whitespace-pre-wrap">{c.body}</div>
                        </div>
                      );
                    })}
                    <form action={comment} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <input type="hidden" name="topic_id" value={t.id} />
                      <textarea name="body" required rows={2} className="input" placeholder="Kommentar schreiben …" />
                      <SubmitButton className="btn btn-sm shrink-0" pendingText="…">
                        Kommentieren
                      </SubmitButton>
                    </form>
                  </div>

                  {canManage && (
                    <form action={decide} className="rounded-xl border border-slate-200 p-3">
                      <input type="hidden" name="topic_id" value={t.id} />
                      <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
                        <div>
                          <label className="label">Status</label>
                          <select name="status" defaultValue={t.status} className="input">
                            {(Object.keys(TOPIC_STATUS_LABELS) as TopicStatus[]).map((s) => (
                              <option key={s} value={s}>
                                {TOPIC_STATUS_LABELS[s]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="label">Festlegung (bei Status „Festgelegt“ Pflicht)</label>
                          <textarea name="decision" rows={2} defaultValue={t.decision ?? ""} className="input" placeholder="z. B. WDVS 160 mm, WLG 035, U = 0,20 W/(m²K)" />
                        </div>
                      </div>
                      <div className="mt-2">
                        <SubmitButton className="btn btn-sm btn-primary">Status speichern</SubmitButton>
                      </div>
                    </form>
                  )}

                  {canEdit && (
                    <details>
                      <summary className="cursor-pointer text-sm text-slate-500">Thema bearbeiten</summary>
                      <form action={update} className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input type="hidden" name="topic_id" value={t.id} />
                        <TopicFields topic={t} members={members} />
                        <div className="flex flex-wrap gap-2 sm:col-span-2">
                          <SubmitButton className="btn btn-sm">Speichern</SubmitButton>
                        </div>
                      </form>
                      {canManage && (
                        <form action={del} className="mt-3">
                          <input type="hidden" name="topic_id" value={t.id} />
                          <SubmitButton className="btn btn-sm btn-danger" pendingText="Löschen …">
                            Thema löschen
                          </SubmitButton>
                        </form>
                      )}
                    </details>
                  )}
                </div>
              </details>
            </article>
          );
        })}
      </div>

      <details className="card mt-8 p-5" open={all.length === 0}>
        <summary className="cursor-pointer font-semibold">Neues Thema</summary>
        <form action={create} className="mt-4 grid gap-3 sm:grid-cols-2">
          <TopicFields members={members} />
          <div className="sm:col-span-2">
            <SubmitButton pendingText="Anlegen …">Thema anlegen</SubmitButton>
          </div>
        </form>
      </details>
    </div>
  );
}
