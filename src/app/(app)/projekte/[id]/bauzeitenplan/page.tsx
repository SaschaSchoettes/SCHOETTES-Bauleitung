import Link from "next/link";
import { requireProject } from "@/lib/auth";
import { getMembers, memberLabel, memberName } from "@/lib/data";
import { isoWeekOf } from "@/lib/scheduleImport";
import {
  commentScheduleItem,
  confirmScheduleItem,
  deleteScheduleItem,
  saveScheduleItem,
} from "./actions";
import { ExcelImport } from "./ExcelImport";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Notice";
import {
  ROLE_LABELS,
  SCHEDULE_STATUS_LABELS,
  formatDate,
  formatDateTime,
  todayBerlin,
  type Member,
  type ScheduleComment,
  type ScheduleItem,
  type ScheduleStatus,
} from "@/lib/types";

const DAY = 86_400_000;
const WEEK_PX = 56;
const DAY_PX = WEEK_PX / 7;
const t = (d: string) => new Date(d + "T00:00:00Z").getTime();
const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => isoOf(t(d) + n * DAY);

function ItemForm({
  action,
  item,
  members,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  item?: ScheduleItem;
  members: Member[];
  submitLabel: string;
}) {
  return (
    <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
      {item && <input type="hidden" name="item_id" value={item.id} />}
      <div className="sm:col-span-2">
        <label className="label">Vorgang *</label>
        <input name="title" required defaultValue={item?.title ?? ""} className="input" placeholder="z. B. Gerüststellung" />
      </div>
      <div>
        <label className="label">Beginn *</label>
        <input name="start_date" type="date" required defaultValue={item?.start_date ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Ende *</label>
        <input name="end_date" type="date" required defaultValue={item?.end_date ?? ""} className="input" />
      </div>
      <div>
        <label className="label">Gewerk</label>
        <input name="trade" defaultValue={item?.trade ?? ""} className="input" placeholder="z. B. Dachdecker" />
      </div>
      <div>
        <label className="label">Zuständig (bestätigt den Termin)</label>
        <select name="assignee_id" defaultValue={item?.assignee_id ?? ""} className="input">
          <option value="">– niemand –</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {memberLabel(m)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Status</label>
        <select name="status" defaultValue={item?.status ?? "geplant"} className="input">
          {(Object.keys(SCHEDULE_STATUS_LABELS) as ScheduleStatus[]).map((s) => (
            <option key={s} value={s}>
              {SCHEDULE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Interner Puffer (Tage, nur intern sichtbar)</label>
        <input name="buffer_days" type="number" min={0} max={365} defaultValue={item?.buffer_days ?? 0} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Hinweis an das Gewerk</label>
        <input name="note" defaultValue={item?.note ?? ""} className="input" />
      </div>
      {item && (
        <p className="text-xs text-slate-500 sm:col-span-2">
          Wird Beginn, Ende oder Zuständigkeit geändert, muss der Termin neu bestätigt werden.
        </p>
      )}
      <div className="sm:col-span-2">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

export default async function BauzeitenplanPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; fehler?: string; ansicht?: string; offen?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, user, canManage, isInternal } = await requireProject(id);
  const internView = isInternal && sp.ansicht === "intern";

  const [{ data }, { data: commentData }, members] = await Promise.all([
    supabase
      .from("schedule_items")
      .select("*")
      .eq("project_id", id)
      .order("start_date")
      .order("sort_order")
      .order("end_date"),
    supabase.from("schedule_comments").select("*").eq("project_id", id).order("created_at"),
    getMembers(supabase, id),
  ]);

  const items = (data ?? []) as ScheduleItem[];
  const comments = (commentData ?? []) as ScheduleComment[];
  const byId = new Map<string, Member>(members.map((m): [string, Member] => [m.user_id, m]));
  const nameOf = (uid: string | null) => (uid && byId.get(uid) ? memberName(byId.get(uid)!) : "–");
  const today = todayBerlin();

  // Zeitraster in Kalenderwochen
  const endOf = (i: ScheduleItem) => (internView ? addDays(i.end_date, i.buffer_days) : i.end_date);
  let gridStart = 0;
  let weeks = 0;
  if (items.length) {
    const minStart = Math.min(...items.map((i) => t(i.start_date)));
    const maxEnd = Math.max(...items.map((i) => t(endOf(i))));
    const dow = (new Date(minStart).getUTCDay() + 6) % 7;
    gridStart = minStart - dow * DAY; // Montag
    weeks = Math.max(1, Math.ceil((maxEnd - gridStart + DAY) / (7 * DAY)));
  }
  const weekCols = Array.from({ length: weeks }, (_, w) => {
    const monday = isoOf(gridStart + w * 7 * DAY);
    return { monday, kw: isoWeekOf(monday).week };
  });
  const todayX = items.length ? ((t(today) - gridStart) / DAY) * DAY_PX : -1;
  const showToday = todayX >= 0 && todayX <= weeks * WEEK_PX;

  const save = saveScheduleItem.bind(null, id);
  const del = deleteScheduleItem.bind(null, id);
  const confirm = confirmScheduleItem.bind(null, id);
  const comment = commentScheduleItem.bind(null, id);

  const openConfirmations = items.filter((i) => i.assignee_id && !i.confirmed_at && i.status !== "erledigt").length;
  const problems = comments.filter((c) => c.is_problem);
  const base = `/projekte/${id}/bauzeitenplan`;

  const barColor = (i: ScheduleItem) =>
    i.status === "erledigt"
      ? "#94a3b8"
      : !i.assignee_id
        ? "var(--color-brand)"
        : i.confirmed_at
          ? "#059669"
          : "#f97316";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Bauzeitenplan</h2>
          <p className="mt-1 text-sm text-slate-500">
            {internView ? "Interne Planung mit Puffer" : "Vorgabe an die Gewerke"}
            {openConfirmations > 0 ? ` · ${openConfirmations} unbestätigt` : ""}
            {problems.length > 0 ? ` · ${problems.length} Terminproblem(e) gemeldet` : ""}
          </p>
        </div>
        {isInternal && (
          <div className="flex rounded-xl border border-slate-200 bg-white p-1">
            <Link href={base} className={`btn btn-sm border-0 ${!internView ? "btn-primary" : ""}`}>
              Vorgabe an Gewerke
            </Link>
            <Link href={`${base}?ansicht=intern`} className={`btn btn-sm border-0 ${internView ? "btn-primary" : ""}`}>
              Intern (mit Puffer)
            </Link>
          </div>
        )}
      </div>

      <div className="mt-4">
        <Notice ok={sp.ok} error={sp.fehler} />
      </div>

      {items.length === 0 ? (
        <div className="card mt-5 p-6 text-center text-slate-500">Noch keine Vorgänge erfasst.</div>
      ) : (
        <>
          {/* Balkenplan */}
          <div className="card mt-5 overflow-hidden">
            <div className="overflow-x-auto">
              <div style={{ width: `calc(var(--name-col) + ${weeks * WEEK_PX}px)` }} className="[--name-col:150px] sm:[--name-col:240px]">
                {/* Kopf */}
                <div className="flex border-b border-slate-200 bg-slate-50 text-[0.7rem] text-slate-500">
                  <div className="sticky left-0 z-10 shrink-0 border-r border-slate-200 bg-slate-50 px-3 py-2 font-semibold" style={{ width: "var(--name-col)" }}>
                    Vorgang
                  </div>
                  {weekCols.map((w) => (
                    <div key={w.monday} className="shrink-0 border-r border-slate-100 py-1.5 text-center" style={{ width: WEEK_PX }}>
                      <div className="font-semibold text-slate-700">KW {w.kw}</div>
                      <div>{w.monday.slice(8, 10)}.{w.monday.slice(5, 7)}.</div>
                    </div>
                  ))}
                </div>
                {/* Zeilen */}
                {items.map((i) => {
                  const left = ((t(i.start_date) - gridStart) / DAY) * DAY_PX;
                  const width = ((t(i.end_date) - t(i.start_date)) / DAY + 1) * DAY_PX;
                  const bufferW = internView ? i.buffer_days * DAY_PX : 0;
                  const hasProblem = comments.some((c) => c.item_id === i.id && c.is_problem);
                  return (
                    <div key={i.id} className="flex border-b border-slate-100 last:border-b-0">
                      <a
                        href={`#v-${i.id}`}
                        className="sticky left-0 z-10 shrink-0 border-r border-slate-200 bg-white px-3 py-2 hover:bg-slate-50"
                        style={{ width: "var(--name-col)" }}
                      >
                        <div className="truncate text-[0.8rem] font-semibold">
                          {hasProblem && <span title="Terminproblem gemeldet">⚠️ </span>}
                          {i.title}
                        </div>
                        <div className="truncate text-[0.7rem] text-slate-500">{i.trade || " "}</div>
                      </a>
                      <div className="relative shrink-0" style={{ width: weeks * WEEK_PX }}>
                        {weekCols.map((w, k) => (
                          <div key={w.monday} className="absolute top-0 bottom-0 border-r border-slate-100" style={{ left: (k + 1) * WEEK_PX - 1 }} />
                        ))}
                        {showToday && <div className="absolute top-0 bottom-0 w-0.5 bg-accent" style={{ left: todayX }} />}
                        <div
                          className="absolute top-1/2 h-4 -translate-y-1/2 rounded"
                          style={{ left, width: Math.max(width, 4), background: barColor(i) }}
                          title={`${formatDate(i.start_date)} – ${formatDate(i.end_date)}`}
                        />
                        {bufferW > 0 && (
                          <div
                            className="absolute top-1/2 h-4 -translate-y-1/2 rounded-r border border-dashed"
                            style={{
                              left: left + width,
                              width: bufferW,
                              borderColor: barColor(i),
                              background: "repeating-linear-gradient(45deg, transparent 0 4px, rgba(148,163,184,.35) 4px 8px)",
                            }}
                            title={`Puffer ${i.buffer_days} Tage`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span><span className="inline-block h-2.5 w-4 rounded align-middle" style={{ background: "#059669" }} /> bestätigt</span>
            <span><span className="inline-block h-2.5 w-4 rounded align-middle" style={{ background: "#f97316" }} /> unbestätigt</span>
            <span><span className="inline-block h-2.5 w-4 rounded align-middle bg-brand" /> ohne Zuständigen</span>
            <span><span className="inline-block h-2.5 w-4 rounded align-middle" style={{ background: "#94a3b8" }} /> erledigt</span>
            {internView && <span>schraffiert = interner Puffer</span>}
            {showToday && <span><span className="inline-block h-3 w-0.5 align-middle bg-accent" /> heute</span>}
          </div>

          {/* Details je Vorgang */}
          <h3 className="mt-8 mb-2 font-semibold">Vorgänge &amp; Notizen</h3>
          <div className="space-y-3">
            {items.map((i) => {
              const ic = comments.filter((c) => c.item_id === i.id);
              const isAssignee = i.assignee_id === user.id;
              const days = (t(i.end_date) - t(i.start_date)) / DAY + 1;
              const hasProblem = ic.some((c) => c.is_problem);
              return (
                <article key={i.id} id={`v-${i.id}`} className={`card scroll-mt-24 p-4 ${hasProblem ? "border-amber-400" : ""}`}>
                  <details open={sp.offen === i.id}>
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold">
                            {hasProblem && "⚠️ "}
                            {i.title}
                          </div>
                          <div className="text-sm text-slate-600">
                            {formatDate(i.start_date)} – {formatDate(i.end_date)}{" "}
                            <span className="text-slate-400">({days} {days === 1 ? "Tag" : "Tage"})</span>
                            {internView && i.buffer_days > 0 && (
                              <span className="text-slate-500"> · Puffer bis {formatDate(addDays(i.end_date, i.buffer_days))}</span>
                            )}
                          </div>
                          <div className="text-sm text-slate-500">
                            {[i.trade, i.assignee_id && nameOf(i.assignee_id)].filter(Boolean).join(" · ") || " "}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {ic.length > 0 && <span className="badge">💬 {ic.length}</span>}
                          <span className={`badge ${i.status === "erledigt" ? "badge-green" : i.status === "laeuft" ? "badge-blue" : ""}`}>
                            {SCHEDULE_STATUS_LABELS[i.status]}
                          </span>
                          {i.assignee_id &&
                            (i.confirmed_at ? (
                              <span className="badge badge-green">Bestätigt</span>
                            ) : (
                              <span className="badge badge-amber">Unbestätigt</span>
                            ))}
                        </div>
                      </div>
                    </summary>

                    <div className="mt-3 space-y-4 border-t border-slate-100 pt-3">
                      {i.note && <p className="notice notice-info text-sm">{i.note}</p>}
                      {i.confirmed_at && (
                        <p className="text-xs text-slate-500">
                          Bestätigt am {formatDateTime(i.confirmed_at)} von {nameOf(i.confirmed_by)}
                        </p>
                      )}

                      {isAssignee && !i.confirmed_at && (
                        <form action={confirm}>
                          <input type="hidden" name="item_id" value={i.id} />
                          <SubmitButton className="btn btn-primary btn-sm" pendingText="Bestätige …">
                            Termin bestätigen
                          </SubmitButton>
                        </form>
                      )}

                      {/* Notizen */}
                      <div className="space-y-2">
                        {ic.map((c) => {
                          const a = byId.get(c.author_id);
                          return (
                            <div
                              key={c.id}
                              className={`rounded-xl px-3 py-2 ${c.is_problem ? "border border-amber-300 bg-amber-50" : "bg-slate-50"}`}
                            >
                              <div className="text-xs text-slate-500">
                                {c.is_problem && <b className="text-amber-700">⚠️ Terminproblem · </b>}
                                <b className="text-slate-700">{nameOf(c.author_id)}</b>
                                {a && ` · ${a.trade || ROLE_LABELS[a.role]}`} · {formatDateTime(c.created_at)}
                              </div>
                              <div className="mt-0.5 text-sm whitespace-pre-wrap">{c.body}</div>
                            </div>
                          );
                        })}
                        <form action={comment} className="space-y-2">
                          <input type="hidden" name="item_id" value={i.id} />
                          <textarea name="body" required rows={2} className="input" placeholder="Notiz zu diesem Vorgang …" />
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="flex items-center gap-2 text-sm">
                              <input type="checkbox" name="is_problem" className="h-4 w-4" />
                              Terminproblem melden (z. B. Termin nicht einzuhalten)
                            </label>
                            <SubmitButton className="btn btn-sm" pendingText="…">
                              Notiz speichern
                            </SubmitButton>
                          </div>
                        </form>
                      </div>

                      {canManage && (
                        <details>
                          <summary className="cursor-pointer text-sm text-slate-500">Vorgang bearbeiten</summary>
                          <ItemForm action={save} item={i} members={members} submitLabel="Änderungen speichern" />
                          <div className="mt-3 flex flex-wrap gap-2">
                            {i.assignee_id && !i.confirmed_at && (
                              <form action={confirm}>
                                <input type="hidden" name="item_id" value={i.id} />
                                <SubmitButton className="btn btn-sm" pendingText="…">
                                  Manuell als bestätigt markieren
                                </SubmitButton>
                              </form>
                            )}
                            <form action={del}>
                              <input type="hidden" name="item_id" value={i.id} />
                              <SubmitButton className="btn btn-sm btn-danger" pendingText="Löschen …">
                                Vorgang löschen
                              </SubmitButton>
                            </form>
                          </div>
                        </details>
                      )}
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        </>
      )}

      {canManage && (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <details className="card p-5" open={items.length === 0}>
            <summary className="cursor-pointer font-semibold">Vorgang hinzufügen</summary>
            <ItemForm action={save} members={members} submitLabel="Vorgang anlegen" />
          </details>
          <details className="card p-5" open={items.length === 0}>
            <summary className="cursor-pointer font-semibold">Aus Excel importieren</summary>
            <ExcelImport projectId={id} hasItems={items.length > 0} />
          </details>
        </div>
      )}

      <p className="mt-6 text-xs text-slate-400">
        Terminvorgaben dienen der Abstimmung; Vertragsfristen ergeben sich allein aus den Verträgen (§ 5 Abs. 1
        VOB/B). Behinderungen sind dem Auftraggeber unverzüglich schriftlich anzuzeigen (§ 6 Abs. 1 VOB/B).
      </p>
    </div>
  );
}
