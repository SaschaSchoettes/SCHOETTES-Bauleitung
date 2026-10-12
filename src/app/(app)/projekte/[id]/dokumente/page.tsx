import { requireProject } from "@/lib/auth";
import { getMembers, memberLabel, memberName } from "@/lib/data";
import { deleteFile, setVisibility } from "./actions";
import { FileUpload } from "@/components/FileUpload";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Notice";
import {
  STORAGE_BUCKET,
  VISIBILITY_LABELS,
  formatBytes,
  formatDate,
  type Member,
  type ProjectFile,
  type Visibility,
} from "@/lib/types";

function groupBy<T>(list: T[], key: (t: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of list) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "de"));
}

const samePlan = (a: ProjectFile, b: ProjectFile) =>
  !!a.plan_number && a.plan_number.trim().toLowerCase() === b.plan_number?.trim().toLowerCase();

export default async function DokumentePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  const { id } = await params;
  const { ok, fehler } = await searchParams;
  const { supabase, canManage, isInternal } = await requireProject(id);

  const [{ data }, members] = await Promise.all([
    supabase
      .from("project_files")
      .select("*")
      .eq("project_id", id)
      .in("kind", ["plan", "dokument"])
      .order("created_at", { ascending: false }),
    getMembers(supabase, id),
  ]);

  const files = (data ?? []) as ProjectFile[];
  const byId = new Map<string, Member>(members.map((m): [string, Member] => [m.user_id, m]));
  const tradeMembers = members.filter((m) => m.role === "gewerk");
  const memberOptions = tradeMembers.map((m) => ({ id: m.user_id, label: memberLabel(m) }));

  // Zeitlich begrenzte Links (1 Stunde)
  const urls = new Map<string, string>();
  if (files.length) {
    const { data: signed } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(
      files.map((f) => f.storage_path),
      3600,
    );
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }

  const plans = files.filter((f) => f.kind === "plan");
  const currentPlans = plans.filter((f) => !f.superseded);
  const oldPlans = plans.filter((f) => f.superseded);
  const orphanOld = oldPlans.filter((o) => !currentPlans.some((c) => samePlan(c, o)));
  const docs = files.filter((f) => f.kind === "dokument");
  const planCategories = [
    ...new Set(plans.map((f) => f.category).filter((c): c is string => !!c)),
  ].sort();

  const del = deleteFile.bind(null, id);
  const vis = setVisibility.bind(null, id);

  const visibilityBadge = (f: ProjectFile) => {
    if (f.visibility === "alle") return null;
    const who =
      f.visibility === "gewerk" && f.visible_to && byId.get(f.visible_to)
        ? `Bauherr + ${memberName(byId.get(f.visible_to)!)}`
        : VISIBILITY_LABELS[f.visibility];
    return <span className="badge badge-amber">🔒 {who}</span>;
  };

  const FileRow = ({ f, old = false }: { f: ProjectFile; old?: boolean }): React.ReactElement => {
    const url = urls.get(f.storage_path);
    const olderOfThis = !old && f.kind === "plan" ? oldPlans.filter((o) => samePlan(f, o)) : [];
    const date = f.kind === "plan" ? f.plan_date : f.doc_date;
    return (
      <article className={`card p-4 ${old ? "bg-slate-50" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className={`font-semibold ${old ? "text-slate-500 line-through" : ""}`}>{f.title}</div>
            <div className="mt-0.5 text-sm text-slate-500">
              {[
                f.plan_number && `Plan-Nr. ${f.plan_number}`,
                f.plan_index && `Index ${f.plan_index}`,
                f.kind === "dokument" && f.trade,
                date && (f.kind === "plan" ? `Stand ${formatDate(date)}` : formatDate(date)),
                formatBytes(f.size_bytes),
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
            <div className="truncate text-xs text-slate-400">
              {f.file_name} · hochgeladen {formatDate(f.created_at.slice(0, 10))}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {f.kind === "plan" &&
              (old ? (
                <span className="badge" style={{ color: "#b42318", borderColor: "#f1c4c0", background: "#fef3f2" }}>
                  Ungültig – ersetzt
                </span>
              ) : (
                <span className="badge badge-green">Gültig</span>
              ))}
            {isInternal && visibilityBadge(f)}
          </div>
        </div>

        <div className="mt-3">
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
              Öffnen
            </a>
          ) : (
            <span className="text-sm text-slate-400">Datei nicht verfügbar</span>
          )}
        </div>

        {olderOfThis.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-slate-500">Ältere Stände ({olderOfThis.length})</summary>
            <div className="mt-2 space-y-2">
              {olderOfThis.map((o) => (
                <FileRow key={o.id} f={o} old />
              ))}
            </div>
          </details>
        )}

        {canManage && (
          <details className="mt-3 border-t border-slate-100 pt-2">
            <summary className="cursor-pointer text-sm text-slate-500">Verwalten</summary>
            <form action={vis} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <input type="hidden" name="file_id" value={f.id} />
              <div>
                <label className="label">Sichtbar für</label>
                <select name="visibility" defaultValue={f.visibility} className="input">
                  {(Object.keys(VISIBILITY_LABELS) as Visibility[]).map((v) => (
                    <option key={v} value={v}>
                      {VISIBILITY_LABELS[v]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Gewerk (bei „ein Gewerk“)</label>
                <select name="visible_to" defaultValue={f.visible_to ?? ""} className="input">
                  <option value="">–</option>
                  {memberOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <SubmitButton className="btn btn-sm" pendingText="…">
                Übernehmen
              </SubmitButton>
            </form>
            <form action={del} className="mt-3">
              <input type="hidden" name="file_id" value={f.id} />
              <SubmitButton className="btn btn-sm btn-danger" pendingText="Löschen …">
                Datei löschen
              </SubmitButton>
            </form>
          </details>
        )}
      </article>
    );
  };

  return (
    <div>
      <h2 className="text-xl font-semibold">Dokumente</h2>
      <p className="mt-1 text-sm text-slate-500">
        Pläne für alle Beteiligten · Angebote und Rechnungen nur für Bauherr und das betroffene Gewerk
      </p>

      <div className="mt-4">
        <Notice ok={ok} error={fehler} />
      </div>

      <section className="mt-5">
        <h3 className="mb-2 font-semibold">Pläne</h3>
        {currentPlans.length === 0 && orphanOld.length === 0 && (
          <div className="card p-6 text-center text-slate-500">Noch keine Pläne abgelegt.</div>
        )}
        <div className="space-y-5">
          {groupBy(currentPlans, (f) => f.category || "Ohne Kategorie").map(([cat, list]) => (
            <div key={cat}>
              <h4 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">{cat}</h4>
              <div className="space-y-3">
                {list
                  .sort((a, b) =>
                    (a.plan_number ?? a.title).localeCompare(b.plan_number ?? b.title, "de", { numeric: true }),
                  )
                  .map((f) => (
                    <FileRow key={f.id} f={f} />
                  ))}
              </div>
            </div>
          ))}
          {orphanOld.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm text-slate-500">
                Ungültige Planstände ({orphanOld.length})
              </summary>
              <div className="mt-2 space-y-2">
                {orphanOld.map((o) => (
                  <FileRow key={o.id} f={o} old />
                ))}
              </div>
            </details>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h3 className="mb-2 font-semibold">Angebote, Rechnungen &amp; Sonstiges</h3>
        {docs.length === 0 && (
          <div className="card p-6 text-center text-slate-500">Keine Dokumente vorhanden oder freigegeben.</div>
        )}
        <div className="space-y-5">
          {groupBy(docs, (f) => f.category || "Sonstiges").map(([cat, list]) => (
            <div key={cat}>
              <h4 className="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">{cat}</h4>
              <div className="space-y-3">
                {list.map((f) => (
                  <FileRow key={f.id} f={f} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {canManage && (
        <details className="card mt-8 p-5" open={files.length === 0}>
          <summary className="cursor-pointer font-semibold">Hochladen</summary>
          <FileUpload projectId={id} mode="dokumente" planCategories={planCategories} members={memberOptions} />
        </details>
      )}
    </div>
  );
}
