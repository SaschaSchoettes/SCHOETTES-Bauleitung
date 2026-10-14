import { requireProject } from "@/lib/auth";
import { getMembers, memberName } from "@/lib/data";
import {
  commentStep,
  decideTopic,
  deleteStep,
  deleteTopic,
  insertTemplate,
  moveStep,
  postTopic,
  replyTopic,
  saveStep,
  setStepStatus,
} from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Notice";
import {
  ROLE_LABELS,
  formatDate,
  formatDateTime,
  type Member,
  type ProjectStep,
  type StepComment,
  type Topic,
  type TopicComment,
} from "@/lib/types";

const DAY = 86_400_000;

function daysSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY));
}

function ageLabel(iso: string) {
  const d = daysSince(iso);
  const text = d === 0 ? "seit heute" : d === 1 ? "seit 1 Tag" : `seit ${d} Tagen`;
  const color = d > 14 ? "#b42318" : d >= 7 ? "#b54708" : "#067647";
  const dot = d > 14 ? "🔴" : d >= 7 ? "🟡" : "🟢";
  return { text, color, dot };
}

export default async function ProjektstandPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; fehler?: string; offen?: string; alle?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, canManage } = await requireProject(id);

  const [{ data: stepData }, { data: scData }, { data: topicData }, { data: tcData }, members] = await Promise.all([
    supabase.from("project_steps").select("*").eq("project_id", id).order("position").order("created_at"),
    supabase.from("step_comments").select("*").eq("project_id", id).order("created_at"),
    supabase.from("topics").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("topic_comments").select("*").eq("project_id", id).order("created_at"),
    getMembers(supabase, id),
  ]);

  const steps = (stepData ?? []) as ProjectStep[];
  const stepComments = (scData ?? []) as StepComment[];
  const topics = (topicData ?? []) as Topic[];
  const topicComments = (tcData ?? []) as TopicComment[];
  const byId = new Map<string, Member>(members.map((m): [string, Member] => [m.user_id, m]));
  const who = (uid: string | null) => {
    const m = uid ? byId.get(uid) : undefined;
    return m ? `${memberName(m)} · ${m.trade || ROLE_LABELS[m.role]}` : "Ehemaliger Beteiligter";
  };

  // Erledigte Schritte am Anfang einklappen, wenn es viele sind
  const firstOpen = steps.findIndex((s) => s.status !== "erledigt");
  const doneBefore = firstOpen > 0 ? firstOpen : firstOpen === -1 ? steps.length : 0;
  const hideDone = doneBefore > 3 && sp.alle !== "1";
  const visibleSteps = hideDone ? steps.slice(doneBefore - 1) : steps;

  const openTopics = topics.filter((t) => t.status === "offen" || t.status === "in_klaerung");
  const decisions = topics.filter((t) => t.status === "festgelegt");
  const closed = topics.filter((t) => t.status === "erledigt");

  const save = saveStep.bind(null, id);
  const setStatus = setStepStatus.bind(null, id);
  const move = moveStep.bind(null, id);
  const delStep = deleteStep.bind(null, id);
  const template = insertTemplate.bind(null, id);
  const commentS = commentStep.bind(null, id);
  const post = postTopic.bind(null, id);
  const reply = replyTopic.bind(null, id);
  const decide = decideTopic.bind(null, id);
  const delTopic = deleteTopic.bind(null, id);

  const TopicCard = ({ t }: { t: Topic }): React.ReactElement => {
    const replies = topicComments.filter((c) => c.topic_id === t.id);
    const anchor = `t-${t.id}`;
    return (
      <article id={anchor} className="card scroll-mt-24 p-4">
        <div className="text-xs text-slate-500">
          {who(t.created_by)} · {formatDateTime(t.created_at)}
        </div>
        <div className="mt-1 font-semibold whitespace-pre-wrap">{t.title}</div>
        {t.description && <p className="mt-0.5 text-sm whitespace-pre-wrap text-slate-700">{t.description}</p>}

        {t.status === "festgelegt" && t.decision && (
          <div className="notice notice-ok mt-3 text-sm whitespace-pre-wrap">
            <b>✓ Festgelegt{t.decided_at ? ` am ${formatDate(t.decided_at.slice(0, 10))}` : ""}:</b> {t.decision}
          </div>
        )}

        {replies.length > 0 && (
          <div className="mt-3 space-y-2 border-l-2 border-slate-200 pl-3">
            {replies.map((c) => (
              <div key={c.id}>
                <div className="text-xs text-slate-500">
                  {who(c.author_id)} · {formatDateTime(c.created_at)}
                </div>
                <div className="text-sm whitespace-pre-wrap">{c.body}</div>
              </div>
            ))}
          </div>
        )}

        <details className="mt-3" open={sp.offen === anchor}>
          <summary className="cursor-pointer text-sm text-slate-500">
            Antworten{canManage ? " / festlegen" : ""}
          </summary>
          <form action={reply} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
            <input type="hidden" name="topic_id" value={t.id} />
            <textarea name="body" required rows={2} className="input" placeholder="Antwort …" />
            <SubmitButton className="btn btn-sm shrink-0" pendingText="…">
              Antworten
            </SubmitButton>
          </form>
          {canManage && (
            <form action={decide} className="mt-3 space-y-2">
              <input type="hidden" name="topic_id" value={t.id} />
              <textarea
                name="decision"
                rows={2}
                defaultValue={t.decision ?? ""}
                className="input"
                placeholder="Festlegung, z. B. WDVS 160 mm, WLG 035"
              />
              <div className="flex flex-wrap gap-2">
                <button name="action" value="festlegen" className="btn btn-sm btn-primary">
                  Als Festlegung speichern
                </button>
                {t.status !== "erledigt" && (
                  <button name="action" value="erledigt" className="btn btn-sm">
                    Erledigt / schließen
                  </button>
                )}
                {t.status !== "offen" && (
                  <button name="action" value="offen" className="btn btn-sm">
                    Wieder öffnen
                  </button>
                )}
              </div>
            </form>
          )}
          {canManage && (
            <form action={delTopic} className="mt-3">
              <input type="hidden" name="topic_id" value={t.id} />
              <SubmitButton className="btn btn-sm btn-danger" pendingText="…">
                Löschen
              </SubmitButton>
            </form>
          )}
        </details>
      </article>
    );
  };

  return (
    <div>
      <h2 className="text-xl font-semibold">Projektstand</h2>
      <p className="mt-1 text-sm text-slate-500">Wo steht das Projekt, wer ist am Zug – und was ist festgelegt</p>

      <div className="mt-4">
        <Notice ok={sp.ok} error={sp.fehler} />
      </div>

      {/* ----------------------------- Schrittkette ----------------------------- */}
      <section className="card mt-5 p-5">
        {steps.length === 0 && (
          <div className="py-4 text-center text-slate-500">
            <p>Noch keine Schritte.</p>
            {canManage && (
              <form action={template} className="mt-3">
                <SubmitButton className="btn btn-sm" pendingText="…">
                  Typische Abfolge einer Sanierung einfügen
                </SubmitButton>
              </form>
            )}
          </div>
        )}

        {hideDone && (
          <a href={`?alle=1`} className="mb-3 block text-sm text-slate-500 hover:underline">
            ✓ {doneBefore - 1} weitere erledigte Schritte anzeigen
          </a>
        )}

        <ol className="relative">
          {visibleSteps.map((s, idx) => {
            const isLast = idx === visibleSteps.length - 1;
            const comments = stepComments.filter((c) => c.step_id === s.id);
            const anchor = `s-${s.id}`;
            const age = ageLabel(s.status_since);
            const prev = visibleSteps[idx - 1];
            const waitingOn = s.status === "offen" && prev && prev.status !== "erledigt" ? prev.title : null;
            return (
              <li key={s.id} id={anchor} className="relative scroll-mt-24 pb-5 pl-9 last:pb-0">
                {!isLast && (
                  <span
                    className={`absolute top-6 bottom-0 left-[11px] w-0.5 ${s.status === "erledigt" ? "bg-emerald-300" : "bg-slate-200"}`}
                  />
                )}
                <span
                  className={`absolute top-0.5 left-0 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    s.status === "erledigt"
                      ? "bg-emerald-500 text-white"
                      : s.status === "aktuell"
                        ? "bg-petrol text-white ring-4 ring-cyan-100"
                        : "border-2 border-slate-300 bg-white"
                  }`}
                >
                  {s.status === "erledigt" ? "✓" : ""}
                </span>

                <div className={s.status === "aktuell" ? "rounded-xl bg-brand-soft px-3 py-2" : ""}>
                  {s.status === "aktuell" && (
                    <div className="text-xs font-bold tracking-wide text-petrol uppercase">Jetzt</div>
                  )}
                  <div className={`font-semibold ${s.status === "erledigt" ? "text-slate-500" : ""}`}>{s.title}</div>
                  <div className="text-sm text-slate-600">
                    {s.status === "erledigt" ? (
                      <span>erledigt {s.done_at ? `am ${formatDate(s.done_at.slice(0, 10))}` : ""}</span>
                    ) : (
                      <>
                        {s.ball_at && (
                          <span>
                            Ball: <b>{s.ball_at}</b>
                          </span>
                        )}
                        {s.status === "aktuell" && (
                          <span style={{ color: age.color }}>
                            {s.ball_at ? " · " : ""}
                            {age.dot} {age.text}
                          </span>
                        )}
                        {waitingOn && <span className="text-slate-500"> · wartet auf: {waitingOn}</span>}
                      </>
                    )}
                  </div>
                  {s.note && <p className="mt-1 text-sm whitespace-pre-wrap text-slate-700">{s.note}</p>}

                  {comments.length > 0 && (
                    <div className="mt-2 space-y-1.5 border-l-2 border-slate-200 pl-3">
                      {comments.map((c) => (
                        <div key={c.id}>
                          <div className="text-xs text-slate-500">
                            {who(c.author_id)} · {formatDateTime(c.created_at)}
                          </div>
                          <div className="text-sm whitespace-pre-wrap">{c.body}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <details className="mt-1.5" open={sp.offen === anchor}>
                    <summary className="cursor-pointer text-xs text-slate-500">
                      Notiz{canManage ? " · bearbeiten" : ""}
                    </summary>
                    <form action={commentS} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                      <input type="hidden" name="step_id" value={s.id} />
                      <textarea name="body" required rows={2} className="input" placeholder="Notiz zu diesem Schritt …" />
                      <SubmitButton className="btn btn-sm shrink-0" pendingText="…">
                        Speichern
                      </SubmitButton>
                    </form>

                    {canManage && (
                      <div className="mt-3 space-y-3 rounded-xl border border-slate-200 p-3">
                        <div className="flex flex-wrap gap-2">
                          {(["offen", "aktuell", "erledigt"] as const)
                            .filter((st) => st !== s.status)
                            .map((st) => (
                              <form key={st} action={setStatus}>
                                <input type="hidden" name="step_id" value={s.id} />
                                <input type="hidden" name="status" value={st} />
                                <SubmitButton
                                  className={`btn btn-sm ${st === "erledigt" ? "btn-primary" : ""}`}
                                  pendingText="…"
                                >
                                  {st === "erledigt" ? "✓ Erledigt" : st === "aktuell" ? "▶ Jetzt dran" : "Zurück auf offen"}
                                </SubmitButton>
                              </form>
                            ))}
                          <form action={move}>
                            <input type="hidden" name="step_id" value={s.id} />
                            <input type="hidden" name="dir" value="up" />
                            <button className="btn btn-sm" title="nach oben">↑</button>
                          </form>
                          <form action={move}>
                            <input type="hidden" name="step_id" value={s.id} />
                            <input type="hidden" name="dir" value="down" />
                            <button className="btn btn-sm" title="nach unten">↓</button>
                          </form>
                        </div>
                        <form action={save} className="grid gap-2 sm:grid-cols-2">
                          <input type="hidden" name="step_id" value={s.id} />
                          <input type="hidden" name="status" value={s.status} />
                          <input name="title" required defaultValue={s.title} className="input" placeholder="Schritt" />
                          <input name="ball_at" defaultValue={s.ball_at ?? ""} className="input" placeholder="Ball liegt bei …" />
                          <textarea name="note" rows={2} defaultValue={s.note ?? ""} className="input sm:col-span-2" placeholder="Hinweis (für alle sichtbar)" />
                          <div className="flex flex-wrap gap-2 sm:col-span-2">
                            <SubmitButton className="btn btn-sm">Speichern</SubmitButton>
                          </div>
                        </form>
                        <form action={delStep}>
                          <input type="hidden" name="step_id" value={s.id} />
                          <SubmitButton className="btn btn-sm btn-danger" pendingText="…">
                            Schritt löschen
                          </SubmitButton>
                        </form>
                      </div>
                    )}
                  </details>
                </div>
              </li>
            );
          })}
        </ol>

        {canManage && (
          <details className="mt-4 border-t border-slate-100 pt-3">
            <summary className="cursor-pointer text-sm font-semibold">+ Schritt hinzufügen</summary>
            <form action={save} className="mt-3 grid gap-2 sm:grid-cols-[1fr_200px_150px_auto] sm:items-end">
              <input name="title" required className="input" placeholder="z. B. Statiker beauftragen" />
              <input name="ball_at" className="input" placeholder="Ball liegt bei …" />
              <select name="status" defaultValue="offen" className="input">
                <option value="offen">offen</option>
                <option value="aktuell">jetzt dran</option>
                <option value="erledigt">erledigt</option>
              </select>
              <SubmitButton className="btn btn-primary">Hinzufügen</SubmitButton>
            </form>
          </details>
        )}
      </section>

      {/* ------------------------- Themen & Festlegungen ------------------------- */}
      <section className="mt-8">
        <h3 className="font-semibold">Themen &amp; Festlegungen</h3>
        <p className="text-sm text-slate-500">Fragen, Hinweise, Entscheidungen – jeder kann schreiben und antworten</p>

        <form action={post} className="card mt-3 p-3">
          <textarea
            name="text"
            required
            rows={3}
            className="input"
            placeholder={"Neues Thema … (erste Zeile = Überschrift)\nz. B. Energieberater hat Arbeit abgeschlossen – Dämmstärken festlegen"}
          />
          <div className="mt-2 flex justify-end">
            <SubmitButton pendingText="…">Eintragen</SubmitButton>
          </div>
        </form>

        {openTopics.length > 0 && (
          <>
            <h4 className="mt-6 mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Offen ({openTopics.length})
            </h4>
            <div className="space-y-3">
              {openTopics.map((t) => (
                <TopicCard key={t.id} t={t} />
              ))}
            </div>
          </>
        )}

        {decisions.length > 0 && (
          <>
            <h4 className="mt-6 mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Festlegungen ({decisions.length})
            </h4>
            <div className="space-y-3">
              {decisions
                .sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""))
                .map((t) => (
                  <TopicCard key={t.id} t={t} />
                ))}
            </div>
          </>
        )}

        {closed.length > 0 && (
          <details className="mt-6">
            <summary className="cursor-pointer text-sm text-slate-500">Erledigt ({closed.length})</summary>
            <div className="mt-2 space-y-3">
              {closed.map((t) => (
                <TopicCard key={t.id} t={t} />
              ))}
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
