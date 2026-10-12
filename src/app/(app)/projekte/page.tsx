import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createProject } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Notice";
import { ROLE_LABELS, STATUS_LABELS, type Project, type Role } from "@/lib/types";

export default async function ProjektePage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string }>;
}) {
  const { fehler } = await searchParams;
  const { supabase, user, profile } = await requireUser();

  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });

  const { data: memberships } = await supabase
    .from("project_members")
    .select("project_id, role")
    .eq("user_id", user.id);

  const roleByProject = new Map<string, Role>(
    (memberships ?? []).map((m: { project_id: string; role: Role }) => [m.project_id, m.role]),
  );

  const list = (projects ?? []) as Project[];
  const greeting = profile.full_name ? `Guten Tag, ${profile.full_name}` : "Guten Tag";

  return (
    <div>
      <h1 className="text-2xl font-semibold">{greeting}</h1>
      <p className="mt-1 text-slate-500">Ihre Projekte</p>

      <div className="mt-6 space-y-3">
        {list.length === 0 && (
          <div className="card p-6 text-center text-slate-500">
            Ihnen ist noch kein Projekt zugeordnet.
          </div>
        )}
        {list.map((p) => {
          const role = roleByProject.get(p.id);
          return (
            <Link
              key={p.id}
              href={`/projekte/${p.id}`}
              className="card flex items-start justify-between gap-4 p-5 transition hover:border-brand"
            >
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold">{p.name}</div>
                <div className="mt-1 text-sm text-slate-500">
                  {[p.number && `Nr. ${p.number}`, p.zip_city].filter(Boolean).join(" · ") || "–"}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className={`badge ${p.status === "aktiv" ? "badge-green" : ""}`}>
                  {STATUS_LABELS[p.status]}
                </span>
                {role && <span className="badge badge-blue">{ROLE_LABELS[role]}</span>}
              </div>
            </Link>
          );
        })}
      </div>

      {profile.is_admin && (
        <details className="card mt-8 p-5">
          <summary className="cursor-pointer font-semibold">Neues Projekt anlegen</summary>
          <form action={createProject} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="number">Projektnummer</label>
              <input id="number" name="number" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="name">Bezeichnung *</label>
              <input id="name" name="name" required className="input" placeholder="z. B. Musterstraße 12" />
            </div>
            <div>
              <label className="label" htmlFor="street">Straße, Hausnummer</label>
              <input id="street" name="street" className="input" />
            </div>
            <div>
              <label className="label" htmlFor="zip_city">PLZ, Ort</label>
              <input id="zip_city" name="zip_city" className="input" />
            </div>
            <div className="sm:col-span-2">
              <Notice error={fehler} />
              <div className="mt-2">
                <SubmitButton pendingText="Anlegen …">Projekt anlegen</SubmitButton>
              </div>
            </div>
          </form>
        </details>
      )}
    </div>
  );
}
