import { requireProject } from "@/lib/auth";
import { deleteStep, insertTemplate, moveStep, saveStep, setStepStatus } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Notice";
import type { ProjectStep } from "@/lib/types";

export default async function ProjektstandPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; fehler?: string; offen?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, canManage } = await requireProject(id);

  const { data } = await supabase
    .from("project_steps")
    .select("*")
    .eq("project_id", id)
    .order("position")
    .order("created_at");
  const steps = (data ?? []) as ProjectStep[];

  const save = saveStep.bind(null, id);
  const setStatus = setStepStatus.bind(null, id);
  const move = moveStep.bind(null, id);
  const del = deleteStep.bind(null, id);
  const template = insertTemplate.bind(null, id);

  const doneCount = steps.filter((s) => s.status === "erledigt").length;

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="text-xl font-semibold">Projektstand</h2>
      <p className="mt-1 text-sm text-slate-500">
        {steps.length ? `${doneCount} von ${steps.length} Schritten erledigt` : "Wo steht das Projekt"}
      </p>

      <div className="mt-4">
        <Notice ok={sp.ok} error={sp.fehler} />
      </div>

      <section className="card mt-5 px-5 py-6">
        {steps.length === 0 && (
          <div className="text-center text-slate-500">
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

        <ol>
          {steps.map((s, idx) => {
            const isLast = idx === steps.length - 1;
            const isDone = s.status === "erledigt";
            const isNow = s.status === "aktuell";
            const anchor = `s-${s.id}`;
            return (
              <li key={s.id} id={anchor} className="relative scroll-mt-24 pb-6 pl-10 last:pb-0">
                {/* Verbindungslinie */}
                {!isLast && <span className="absolute top-5 bottom-0 left-[9px] w-0.5 bg-slate-900" />}
                {/* Kreis: gefüllt = erledigt, leer = offen */}
                <span
                  className={`absolute top-0.5 left-0 h-5 w-5 rounded-full border-2 border-slate-900 ${
                    isDone ? "bg-slate-900" : "bg-white"
                  }`}
                />

                <div className={`leading-snug ${isNow ? "font-bold" : isDone ? "text-slate-500" : ""}`}>
                  {s.title}
                  {isNow && <span className="ml-2 text-sm font-normal">← aktuell</span>}
                </div>
                {s.note && <p className="mt-0.5 text-sm whitespace-pre-wrap text-slate-600">{s.note}</p>}

                {canManage && (
                  <details className="mt-1" open={sp.offen === anchor}>
                    <summary className="cursor-pointer text-xs text-slate-400">bearbeiten</summary>
                    <div className="mt-2 space-y-2 rounded-xl border border-slate-200 p-3">
                      <div className="flex flex-wrap gap-2">
                        {(["erledigt", "aktuell", "offen"] as const)
                          .filter((st) => st !== s.status)
                          .map((st) => (
                            <form key={st} action={setStatus}>
                              <input type="hidden" name="step_id" value={s.id} />
                              <input type="hidden" name="status" value={st} />
                              <SubmitButton className="btn btn-sm" pendingText="…">
                                {st === "erledigt" ? "● erledigt" : st === "aktuell" ? "← aktuell" : "○ offen"}
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
                      <form action={save} className="space-y-2">
                        <input type="hidden" name="step_id" value={s.id} />
                        <input type="hidden" name="status" value={s.status} />
                        <input name="title" required defaultValue={s.title} className="input" />
                        <input name="note" defaultValue={s.note ?? ""} className="input" placeholder="Zusatz (optional)" />
                        <div className="flex flex-wrap gap-2">
                          <SubmitButton className="btn btn-sm">Speichern</SubmitButton>
                        </div>
                      </form>
                      <form action={del}>
                        <input type="hidden" name="step_id" value={s.id} />
                        <SubmitButton className="btn btn-sm btn-danger" pendingText="…">
                          Löschen
                        </SubmitButton>
                      </form>
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ol>

        {canManage && (
          <form action={save} className="mt-6 flex gap-2 border-t border-slate-100 pt-4">
            <input type="hidden" name="status" value="offen" />
            <input name="title" required className="input" placeholder="Schritt hinzufügen …" />
            <SubmitButton className="btn shrink-0">+</SubmitButton>
          </form>
        )}
      </section>
    </div>
  );
}
