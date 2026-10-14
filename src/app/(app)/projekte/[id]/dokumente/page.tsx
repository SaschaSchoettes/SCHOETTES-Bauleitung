import { requireProject } from "@/lib/auth";
import { getMembers, memberLabel, memberName } from "@/lib/data";
import Link from "next/link";
import {
  createFolder,
  deleteFile,
  deleteFolder,
  insertTradeFolders,
  moveFile,
  renameFolder,
  setVisibility,
} from "./actions";
import { FileUpload } from "@/components/FileUpload";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Notice";
import {
  STORAGE_BUCKET,
  VISIBILITY_LABELS,
  formatBytes,
  formatDate,
  type DocFolder,
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
  searchParams: Promise<{ ok?: string; fehler?: string; ordner?: string }>;
}) {
  const { id } = await params;
  const { ok, fehler, ordner } = await searchParams;
  const { supabase, canManage, isInternal } = await requireProject(id);

  const [{ data }, members, { data: folderData }] = await Promise.all([
    supabase
      .from("project_files")
      .select("*")
      .eq("project_id", id)
      .in("kind", ["plan", "dokument"])
      .order("created_at", { ascending: false }),
    getMembers(supabase, id),
    supabase.from("doc_folders").select("*").eq("project_id", id).order("name"),
  ]);

  const folders = (folderData ?? []) as DocFolder[];
  const folderById = new Map<string, DocFolder>(folders.map((f): [string, DocFolder] => [f.id, f]));
  const current = ordner && folderById.has(ordner) ? folderById.get(ordner)! : null;
  const pathTo = (fid: string | null): DocFolder[] => {
    const out: DocFolder[] = [];
    let f = fid ? folderById.get(fid) : undefined;
    while (f && out.length < 20) {
      out.unshift(f);
      f = f.parent_id ? folderById.get(f.parent_id) : undefined;
    }
    return out;
  };
  const breadcrumb = pathTo(current?.id ?? null);
  const folderLabel = (fid: string | null) => (fid ? pathTo(fid).map((f) => f.name).join(" / ") : "oberste Ebene");

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
  const subfolders = folders
    .filter((f) => (f.parent_id ?? null) === (current?.id ?? null))
    .sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true }));
  const docsHere = docs.filter((f) => (f.folder_id ?? null) === (current?.id ?? null));
  // Anzahl Dateien je Ordner inkl. Unterordner
  const countIn = (fid: string): number => {
    const own = docs.filter((d) => d.folder_id === fid).length;
    return own + folders.filter((f) => f.parent_id === fid).reduce((n, f) => n + countIn(f.id), 0);
  };
  const allFolderOptions = folders
    .map((f) => ({ id: f.id, label: folderLabel(f.id) }))
    .sort((a, b) => a.label.localeCompare(b.label, "de", { numeric: true }));
  const base = `/projekte/${id}/dokumente`;
  const newFolder = createFolder.bind(null, id);
  const rename = renameFolder.bind(null, id);
  const delFolder = deleteFolder.bind(null, id);
  const tradeTemplate = insertTradeFolders.bind(null, id);
  const move = moveFile.bind(null, id);
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
              <input type="hidden" name="ordner" value={current?.id ?? ""} />
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
            {f.kind === "dokument" && (
              <form action={move} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <input type="hidden" name="file_id" value={f.id} />
                <input type="hidden" name="ordner" value={current?.id ?? ""} />
                <div className="flex-1">
                  <label className="label">Verschieben nach</label>
                  <select name="target" defaultValue={f.folder_id ?? ""} className="input">
                    <option value="">Dokumente (oberste Ebene)</option>
                    {allFolderOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <SubmitButton className="btn btn-sm shrink-0" pendingText="…">
                  Verschieben
                </SubmitButton>
              </form>
            )}
            <form action={del} className="mt-3">
              <input type="hidden" name="file_id" value={f.id} />
              <input type="hidden" name="ordner" value={current?.id ?? ""} />
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

        {/* Pfad */}
        <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm">
          <Link href={base} className={current ? "text-slate-500 hover:underline" : "font-semibold"}>
            📁 Dokumente
          </Link>
          {breadcrumb.map((f, i) => (
            <span key={f.id} className="flex items-center gap-1">
              <span className="text-slate-400">›</span>
              {i === breadcrumb.length - 1 ? (
                <span className="font-semibold">{f.name}</span>
              ) : (
                <Link href={`${base}?ordner=${f.id}`} className="text-slate-500 hover:underline">
                  {f.name}
                </Link>
              )}
            </span>
          ))}
        </nav>

        <div className="card divide-y divide-slate-100">
          {current && (
            <Link
              href={current.parent_id ? `${base}?ordner=${current.parent_id}` : base}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-500 hover:bg-slate-50"
            >
              ↩ eine Ebene höher
            </Link>
          )}
          {subfolders.map((f) => {
            const n = countIn(f.id);
            return (
              <Link
                key={f.id}
                href={`${base}?ordner=${f.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="text-lg">📁</span>
                  <span className="truncate font-medium">{f.name}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  {n ? `${n} ${n === 1 ? "Datei" : "Dateien"}` : "leer"} ›
                </span>
              </Link>
            );
          })}
          {subfolders.length === 0 && docsHere.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-slate-500">
              {current ? "Dieser Ordner ist leer." : "Noch keine Ordner oder Dokumente."}
            </div>
          )}
        </div>

        {docsHere.length > 0 && (
          <div className="mt-4 space-y-5">
            {groupBy(docsHere, (f) => f.category || "Sonstiges").map(([cat, list]) => (
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
        )}

        {canManage && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <details className="card p-5" open={docs.length === 0 && folders.length > 0}>
              <summary className="cursor-pointer font-semibold">Dokument hier ablegen</summary>
              <FileUpload
                key={current?.id ?? "root"}
                projectId={id}
                mode="dokumente"
                initialKind="dokument"
                members={memberOptions}
                folderId={current?.id ?? null}
                folderLabel={current ? folderLabel(current.id) : null}
              />
            </details>
            <details className="card p-5" open={folders.length === 0}>
              <summary className="cursor-pointer font-semibold">Ordner</summary>
              <form action={newFolder} className="mt-3 flex gap-2">
                <input type="hidden" name="ordner" value={current?.id ?? ""} />
                <input name="name" required className="input" placeholder={current ? `Unterordner in „${current.name}“` : "Neuer Ordner"} />
                <SubmitButton className="btn shrink-0">Anlegen</SubmitButton>
              </form>
              {!current && folders.length === 0 && (
                <form action={tradeTemplate} className="mt-3">
                  <SubmitButton className="btn btn-sm" pendingText="…">
                    Vorlage einfügen: Gewerke (Abbruch, Aufzug, Dach … Zimmerer) + Allgemein
                  </SubmitButton>
                </form>
              )}
              {current && (
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                  <form action={rename} className="flex gap-2">
                    <input type="hidden" name="folder_id" value={current.id} />
                    <input type="hidden" name="ordner" value={current.id} />
                    <input name="name" required defaultValue={current.name} className="input" />
                    <SubmitButton className="btn btn-sm shrink-0">Umbenennen</SubmitButton>
                  </form>
                  <form action={delFolder}>
                    <input type="hidden" name="folder_id" value={current.id} />
                    <input type="hidden" name="parent_id" value={current.parent_id ?? ""} />
                    <SubmitButton className="btn btn-sm btn-danger" pendingText="…">
                      Ordner „{current.name}“ löschen (nur wenn leer)
                    </SubmitButton>
                  </form>
                </div>
              )}
            </details>
          </div>
        )}
      </section>

      {canManage && (
        <details className="card mt-8 p-5" open={files.length === 0}>
          <summary className="cursor-pointer font-semibold">Plan hochladen</summary>
          <FileUpload projectId={id} mode="dokumente" planCategories={planCategories} members={memberOptions} />
        </details>
      )}
    </div>
  );
}
