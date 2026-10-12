import { requireProject } from "@/lib/auth";
import { deleteFile, setVisibility } from "./actions";
import { UploadForm } from "./UploadForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Notice";
import { STORAGE_BUCKET, formatBytes, formatDate, type ProjectFile } from "@/lib/types";

function groupBy<T>(list: T[], key: (t: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of list) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "de"));
}

export default async function PlaenePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  const { id } = await params;
  const { ok, fehler } = await searchParams;
  const { supabase, canManage } = await requireProject(id);

  const { data } = await supabase
    .from("project_files")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  const files = (data ?? []) as ProjectFile[];

  // Zeitlich begrenzte Download-Links (1 Stunde)
  const urls = new Map<string, string>();
  if (files.length) {
    const { data: signed } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrls(
        files.map((f) => f.storage_path),
        3600,
      );
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }

  const plans = files.filter((f) => f.kind === "plan");
  const currentPlans = plans.filter((f) => !f.superseded);
  const oldPlans = plans.filter((f) => f.superseded);
  const docs = files.filter((f) => f.kind === "dokument");
  const categories = [...new Set(files.map((f) => f.category).filter((c): c is string => !!c))].sort();

  const del = deleteFile.bind(null, id);
  const vis = setVisibility.bind(null, id);

  const FileRow = ({ f, old = false }: { f: ProjectFile; old?: boolean }): React.ReactElement => {
    const url = urls.get(f.storage_path);
    const olderOfThis = !old && f.plan_number
      ? oldPlans.filter((o) => o.plan_number?.trim().toLowerCase() === f.plan_number?.trim().toLowerCase())
      : [];
    return (
      <article className={`card p-4 ${old ? "bg-slate-50" : ""}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className={`font-semibold ${old ? "text-slate-500 line-through" : ""}`}>{f.title}</div>
            <div className="mt-0.5 text-sm text-slate-500">
              {[
                f.plan_number && `Plan-Nr. ${f.plan_number}`,
                f.plan_index && `Index ${f.plan_index}`,
                f.plan_date && `Stand ${formatDate(f.plan_date)}`,
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
            {f.visibility === "intern" && <span className="badge badge-amber">Nur intern</span>}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
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
            <summary className="cursor-pointer text-sm text-slate-500">
              Ältere Stände ({olderOfThis.length})
            </summary>
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
            <div className="mt-3 flex flex-wrap gap-2">
              <form action={vis}>
                <input type="hidden" name="file_id" value={f.id} />
                <input type="hidden" name="visibility" value={f.visibility === "intern" ? "alle" : "intern"} />
                <SubmitButton className="btn btn-sm" pendingText="…">
                  {f.visibility === "intern" ? "Für alle freigeben" : "Nur intern anzeigen"}
                </SubmitButton>
              </form>
              <form action={del}>
                <input type="hidden" name="file_id" value={f.id} />
                <SubmitButton className="btn btn-sm btn-danger" pendingText="Löschen …">
                  Löschen
                </SubmitButton>
              </form>
            </div>
          </details>
        )}
      </article>
    );
  };

  // Ältere Stände ohne gültigen Nachfolger in der Liste (z. B. wenn der neue Stand intern ist)
  const orphanOld = oldPlans.filter(
    (o) =>
      !currentPlans.some(
        (c) => c.plan_number && c.plan_number.trim().toLowerCase() === o.plan_number?.trim().toLowerCase(),
      ),
  );

  return (
    <div>
      <h2 className="text-xl font-semibold">Pläne &amp; Dokumente</h2>
      <p className="mt-1 text-sm text-slate-500">Nur der jeweils gültige Planstand ist hervorgehoben</p>

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
                  .sort((a, b) => (a.plan_number ?? a.title).localeCompare(b.plan_number ?? b.title, "de", { numeric: true }))
                  .map((f) => (
                    <FileRow key={f.id} f={f} />
                  ))}
              </div>
            </div>
          ))}
          {orphanOld.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm text-slate-500">Ungültige Planstände ({orphanOld.length})</summary>
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
        <h3 className="mb-2 font-semibold">Dokumente</h3>
        {docs.length === 0 && <div className="card p-6 text-center text-slate-500">Noch keine Dokumente abgelegt.</div>}
        <div className="space-y-5">
          {groupBy(docs, (f) => f.category || "Ohne Kategorie").map(([cat, list]) => (
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
          <UploadForm projectId={id} categories={categories} />
        </details>
      )}
    </div>
  );
}
