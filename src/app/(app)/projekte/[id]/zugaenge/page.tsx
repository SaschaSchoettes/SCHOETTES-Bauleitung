import { redirect } from "next/navigation";
import { requireProject } from "@/lib/auth";
import { removeMember, updateMember } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Notice";
import { AddAccessForm, ResetPasswordForm } from "./AccessForms";
import { ROLE_LABELS, ROLES, type Member } from "@/lib/types";

export default async function ZugaengePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  const { id } = await params;
  const { ok, fehler } = await searchParams;
  const { supabase, user, profile, canManage } = await requireProject(id);
  if (!canManage) redirect(`/projekte/${id}`);

  const { data } = await supabase
    .from("project_members")
    .select("project_id, user_id, role, trade, created_at, profiles(id, email, full_name, company, phone)")
    .eq("project_id", id)
    .order("role", { ascending: true });

  const members = (data ?? []) as unknown as Member[];
  const update = updateMember.bind(null, id);
  const remove = removeMember.bind(null, id);

  return (
    <div>
      <h2 className="text-xl font-semibold">Zugänge</h2>
      <p className="mt-1 text-sm text-slate-500">
        Wer sich anmelden kann und welche Rolle er im Projekt hat
      </p>

      <div className="mt-4">
        <Notice ok={ok} error={fehler} />
      </div>

      <div className="mt-5 space-y-3">
        {members.map((m) => {
          const name = m.profiles?.full_name || m.profiles?.email || "Unbekannt";
          const isSelf = m.user_id === user.id;
          return (
            <article key={m.user_id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold">
                    {name} {isSelf && <span className="text-sm font-normal text-slate-500">(Sie)</span>}
                  </div>
                  <div className="truncate text-sm text-slate-500">
                    {[m.profiles?.company, m.profiles?.email].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <span className="badge badge-blue">{ROLE_LABELS[m.role]}</span>
                  {m.trade && <span className="badge">{m.trade}</span>}
                </div>
              </div>

              {!isSelf && (
                <details className="mt-3 border-t border-slate-100 pt-2">
                  <summary className="cursor-pointer text-sm text-slate-500">Bearbeiten</summary>
                  <form action={update} className="mt-3 grid gap-3 sm:grid-cols-3 sm:items-end">
                    <input type="hidden" name="user_id" value={m.user_id} />
                    <div>
                      <label className="label">Rolle</label>
                      <select name="role" defaultValue={m.role} className="input">
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Gewerk</label>
                      <input name="trade" defaultValue={m.trade ?? ""} className="input" />
                    </div>
                    <div>
                      <SubmitButton>Speichern</SubmitButton>
                    </div>
                  </form>
                  <div className="mt-3 flex flex-wrap items-start gap-3">
                    <form action={remove}>
                      <input type="hidden" name="user_id" value={m.user_id} />
                      <SubmitButton className="btn btn-sm btn-danger" pendingText="Entferne …">
                        Aus Projekt entfernen
                      </SubmitButton>
                    </form>
                    {profile.is_admin && (
                      <ResetPasswordForm
                        projectId={id}
                        userId={m.user_id}
                        email={m.profiles?.email ?? ""}
                        name={name}
                      />
                    )}
                  </div>
                </details>
              )}
            </article>
          );
        })}
      </div>

      <section className="card mt-8 p-5">
        <h3 className="font-semibold">Neuen Zugang anlegen</h3>
        <p className="mt-1 mb-4 text-sm text-slate-500">
          Es wird ein Startpasswort erzeugt, das Sie dem Beteiligten mitteilen. Hat die Person bereits einen
          Zugang aus einem anderen Projekt, wird sie nur zugeordnet.
        </p>
        <AddAccessForm projectId={id} />
      </section>

      <section className="mt-6 text-sm text-slate-500">
        <h3 className="font-semibold text-slate-600">Rollen</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>Bauleitung:</b> pflegt alle Inhalte und Zugänge des Projekts</li>
          <li><b>Berater:</b> sieht alle Inhalte, ändert nichts</li>
          <li><b>Auftraggeber:</b> sieht die freigegebenen Inhalte</li>
          <li><b>Gewerk:</b> sieht die freigegebenen Inhalte</li>
        </ul>
      </section>
    </div>
  );
}
