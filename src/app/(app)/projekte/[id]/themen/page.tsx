import { requireProject } from "@/lib/auth";
import { getMembers, memberName } from "@/lib/data";
import { decideTopic, deleteTopic, postTopic, replyTopic } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Notice";
import { ROLE_LABELS, formatDate, formatDateTime, type Member, type Topic, type TopicComment } from "@/lib/types";

export default async function ThemenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; fehler?: string; offen?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, canManage } = await requireProject(id);

  const [{ data: topicData }, { data: tcData }, members] = await Promise.all([
    supabase.from("topics").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("topic_comments").select("*").eq("project_id", id).order("created_at"),
    getMembers(supabase, id),
  ]);

  const topics = (topicData ?? []) as Topic[];
  const comments = (tcData ?? []) as TopicComment[];
  const byId = new Map<string, Member>(members.map((m): [string, Member] => [m.user_id, m]));
  const who = (uid: string | null) => {
    const m = uid ? byId.get(uid) : undefined;
    return m ? `${memberName(m)} · ${m.trade || ROLE_LABELS[m.role]}` : "Ehemaliger Beteiligter";
  };

  const decisions = topics
    .filter((t) => t.status === "festgelegt")
    .sort((a, b) => (b.decided_at ?? "").localeCompare(a.decided_at ?? ""));
  const open = topics.filter((t) => t.status === "offen" || t.status === "in_klaerung");
  const closed = topics.filter((t) => t.status === "erledigt");

  const post = postTopic.bind(null, id);
  const reply = replyTopic.bind(null, id);
  const decide = decideTopic.bind(null, id);
  const del = deleteTopic.bind(null, id);

  const TopicCard = ({ t }: { t: Topic }): React.ReactElement => {
    const replies = comments.filter((c) => c.topic_id === t.id);
    const anchor = `t-${t.id}`;
    return (
      <article id={anchor} className="card scroll-mt-24 p-4">
        <div className="text-xs text-slate-500">
          {who(t.created_by)} · {formatDateTime(t.created_at)}
        </div>
        <div className="mt-1 font-semibold whitespace-pre-wrap">{t.title}</div>
        {t.description && <p className="mt-0.5 text-sm whitespace-pre-wrap text-slate-700">{t.description}</p>}

        {t.status === "festgelegt" && t.decision && (
          <div className="mt-3 rounded-lg border-l-4 border-slate-900 bg-slate-50 px-3 py-2 text-sm whitespace-pre-wrap">
            <b>Festgelegt{t.decided_at ? ` am ${formatDate(t.decided_at.slice(0, 10))}` : ""}:</b> {t.decision}
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
                    Schließen
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
            <form action={del} className="mt-3">
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
    <div className="mx-auto max-w-3xl">
      <h2 className="text-xl font-semibold">Festlegungen / Themen</h2>
      <p className="mt-1 text-sm text-slate-500">Fragen, Hinweise, Entscheidungen – jeder kann schreiben und antworten</p>

      <div className="mt-4">
        <Notice ok={sp.ok} error={sp.fehler} />
      </div>

      <form action={post} className="card mt-4 p-3">
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

      {open.length > 0 && (
        <>
          <h3 className="mt-6 mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Offen ({open.length})</h3>
          <div className="space-y-3">
            {open.map((t) => (
              <TopicCard key={t.id} t={t} />
            ))}
          </div>
        </>
      )}

      {decisions.length > 0 && (
        <>
          <h3 className="mt-6 mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Festlegungen ({decisions.length})
          </h3>
          <div className="space-y-3">
            {decisions.map((t) => (
              <TopicCard key={t.id} t={t} />
            ))}
          </div>
        </>
      )}

      {closed.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-slate-500">Geschlossen ({closed.length})</summary>
          <div className="mt-2 space-y-3">
            {closed.map((t) => (
              <TopicCard key={t.id} t={t} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
