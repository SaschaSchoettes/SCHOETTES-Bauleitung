import { requireProject } from "@/lib/auth";
import { getMembers, memberLabel, memberName } from "@/lib/data";
import { confirmScheduleItem, deleteScheduleItem, saveScheduleItem } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Notice";
import {
  SCHEDULE_STATUS_LABELS,
  formatDate,
  formatDateTime,
  todayBerlin,
  type Member,
  type ScheduleItem,
  type ScheduleStatus,
} from "@/lib/types";

const DAY = 86_400_000;
const toTime = (d: string) => new Date(d + "T00:00:00Z").getTime();

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
        <input name="title" required defaultValue={item?.title ?? ""} className="input" placeholder="z. B. Gerüstaufbau Straßenseite" />
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
        <label className="label">Hinweis</label>
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
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  const { id } = await params;
  const { ok, fehler } = await searchParams;
  const { supabase, user, canManage } = await requireProject(id);

  const [{ data }, members] = await Promise.all([
    supabase.from("schedule_items").select("*").eq("project_id", id).order("start_date").order("end_date"),
    getMembers(supabase, id),
  ]);

  const items = (data ?? []) as ScheduleItem[];
  const byId = new Map<string, Member>(members.map((m): [string, Member] => [m.user_id, m]));
  const today = todayBerlin();

  // Zeitachse für die Balken
  const min = items.length ? Math.min(...items.map((i) => toTime(i.start_date))) : 0;
  const max = items.length ? Math.max(...items.map((i) => toTime(i.end_date))) + DAY : 1;
  const span = Math.max(max - min, DAY);
  const pos = (t: number) => Math.min(100, Math.max(0, ((t - min) / span) * 100));
  const todayPos = pos(toTime(today));
  const showToday = toTime(today) >= min && toTime(today) <= max;

  const save = saveScheduleItem.bind(null, id);
  const del = deleteScheduleItem.bind(null, id);
  const confirm = confirmScheduleItem.bind(null, id);

  const openConfirmations = items.filter((i) => i.assignee_id && !i.confirmed_at && i.status !== "erledigt").length;

  return (
    <div>
      <h2 className="text-xl font-semibold">Bauzeitenplan</h2>
      <p className="mt-1 text-sm text-slate-500">
        Terminvorgaben an die Gewerke{openConfirmations > 0 ? ` · ${openConfirmations} noch unbestätigt` : ""}
      </p>

      <div className="mt-4">
        <Notice ok={ok} error={fehler} />
      </div>

      {items.length === 0 && (
        <div className="card mt-5 p-6 text-center text-slate-500">Noch keine Vorgänge erfasst.</div>
      )}

      <div className="mt-5 space-y-3">
        {items.map((i) => {
          const assignee = i.assignee_id ? byId.get(i.assignee_id) : undefined;
          const confirmer = i.confirmed_by ? byId.get(i.confirmed_by) : undefined;
          const isAssignee = i.assignee_id === user.id;
          const running = i.start_date <= today && i.end_date >= today && i.status !== "erledigt";
          const left = pos(toTime(i.start_date));
          const width = Math.max(1.5, pos(toTime(i.end_date) + DAY) - left);
          const days = Math.round((toTime(i.end_date) - toTime(i.start_date)) / DAY) + 1;

          return (
            <article key={i.id} className={`card p-4 ${running ? "border-brand" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">{i.title}</div>
                  <div className="mt-0.5 text-sm text-slate-600">
                    {formatDate(i.start_date)} – {formatDate(i.end_date)}{" "}
                    <span className="text-slate-400">({days} {days === 1 ? "Tag" : "Tage"})</span>
                  </div>
                  <div className="text-sm text-slate-500">
                    {[i.trade, assignee && memberName(assignee)].filter(Boolean).join(" · ") || " "}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span
                    className={`badge ${i.status === "erledigt" ? "badge-green" : i.status === "laeuft" || running ? "badge-blue" : ""}`}
                  >
                    {running && i.status === "geplant" ? "Läuft" : SCHEDULE_STATUS_LABELS[i.status]}
                  </span>
                  {i.assignee_id &&
                    (i.confirmed_at ? (
                      <span className="badge badge-green">Bestätigt</span>
                    ) : (
                      <span className="badge badge-amber">Unbestätigt</span>
                    ))}
                </div>
              </div>

              {/* Balken */}
              <div className="relative mt-3 h-2 rounded-full bg-slate-100">
                <div
                  className={`absolute top-0 h-2 rounded-full ${i.status === "erledigt" ? "bg-emerald-400" : "bg-brand"}`}
                  style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                />
                {showToday && (
                  <div className="absolute -top-1 h-4 w-0.5 bg-accent" style={{ left: `${todayPos}%` }} title="Heute" />
                )}
              </div>

              {i.note && <p className="mt-2 text-sm text-slate-600">{i.note}</p>}
              {i.confirmed_at && (
                <p className="mt-2 text-xs text-slate-500">
                  Bestätigt am {formatDateTime(i.confirmed_at)}
                  {confirmer ? ` von ${memberName(confirmer)}` : ""}
                </p>
              )}

              {isAssignee && !i.confirmed_at && (
                <form action={confirm} className="mt-3">
                  <input type="hidden" name="item_id" value={i.id} />
                  <SubmitButton className="btn btn-primary btn-sm" pendingText="Bestätige …">
                    Termin bestätigen
                  </SubmitButton>
                </form>
              )}

              {canManage && (
                <details className="mt-3 border-t border-slate-100 pt-2">
                  <summary className="cursor-pointer text-sm text-slate-500">Bearbeiten</summary>
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
            </article>
          );
        })}
      </div>

      {items.length > 0 && (
        <p className="mt-3 text-xs text-slate-400">
          Balken: Lage im Gesamtzeitraum {formatDate(new Date(min).toISOString().slice(0, 10))} –{" "}
          {formatDate(new Date(max - DAY).toISOString().slice(0, 10))}
          {showToday ? " · orange Linie = heute" : ""}
        </p>
      )}

      {canManage && (
        <details className="card mt-8 p-5" open={items.length === 0}>
          <summary className="cursor-pointer font-semibold">Vorgang hinzufügen</summary>
          <ItemForm action={save} members={members} submitLabel="Vorgang anlegen" />
        </details>
      )}

      <p className="mt-6 text-xs text-slate-400">
        Die Terminvorgaben dienen der Abstimmung. Vertragsfristen ergeben sich allein aus den jeweiligen
        Verträgen (§ 5 Abs. 1 VOB/B).
      </p>
    </div>
  );
}
