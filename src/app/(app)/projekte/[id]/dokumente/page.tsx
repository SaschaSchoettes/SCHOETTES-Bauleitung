import Link from "next/link";
import { requireProject } from "@/lib/auth";
import { getMembers, memberLabel, memberName } from "@/lib/data";
import {
  createFolder,
  deleteFile,
  deleteFolder,
  insertTradeFolders,
  renameFolder,
  saveShares,
  updateFile,
} from "./actions";
import { RaumUpload } from "@/components/RaumUpload";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Notice";
import {
  INTERNAL_ROLES,
  ROLE_LABELS,
  STORAGE_BUCKET,
  formatBytes,
  formatDate,
  type DocFolder,
  type FolderShare,
  type Member,
  type ProjectFile,
} from "@/lib/types";

const fileIcon = (f: ProjectFile) => {
  const n = f.file_name.toLowerCase();
  if (f.kind === "plan") return "📐";
  if (n.endsWith(".pdf")) return "📄";
  if (/\.(png|jpe?g|gif|webp|heic)$/.test(n)) return "🖼️";
  if (/\.(xlsx?|csv)$/.test(n)) return "📊";
  if (/\.(docx?)$/.test(n)) return "📝";
  if (/\.(dwg|dxf)$/.test(n)) return "📐";
  return "📎";
};

const samePlan = (a: ProjectFile, b: ProjectFile) =>
  !!a.plan_number && a.plan_number.trim().toLowerCase() === b.plan_number?.trim().toLowerCase();

export default async function ProjektraumPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; fehler?: string; ordner?: string; q?: string; freigabe?: string; alte?: string }>;
}) {
  const { id } = await params;
  const { ok, fehler, ordner, q, freigabe, alte } = await searchParams;
  const { supabase, user, canManage, isInternal } = await requireProject(id);

  const [{ data: fileData }, members, { data: folderData }, { data: shareData }] = await Promise.all([
    supabase
      .from("project_files")
      .select("*")
      .eq("project_id", id)
      .in("kind", ["plan", "dokument"])
      .order("created_at", { ascending: false }),
    getMembers(supabase, id),
    supabase.from("doc_folders").select("*").eq("project_id", id).order("name"),
    supabase.from("folder_shares").select("folder_id, user_id, can_upload"),
  ]);

  const folders = (folderData ?? []) as DocFolder[];
  const files = (fileData ?? []) as ProjectFile[];
  const shares = (shareData ?? []) as FolderShare[];
  const folderById = new Map<string, DocFolder>(folders.map((f): [string, DocFolder] => [f.id, f]));
  const byId = new Map<string, Member>(members.map((m): [string, Member] => [m.user_id, m]));
  const current = ordner && folderById.has(ordner) ? folderById.get(ordner)! : null;

  const pathTo = (fid: string | null): DocFolder[] => {
    const out: DocFolder[] = [];
    let f = fid ? folderById.get(fid) : undefined;
    while (f && out.length < 30) {
      out.unshift(f);
      f = f.parent_id ? folderById.get(f.parent_id) : undefined;
    }
    return out;
  };
  const folderLabel = (fid: string | null) =>
    fid ? ["Projektraum", ...pathTo(fid).map((f) => f.name)].join(" / ") : "Projektraum";

  const [{ data: canUploadHere }, { data: canOpen }] = await Promise.all([
    supabase.rpc("can_upload_to", { p_project: id, p_folder: current?.id ?? null }),
    current ? supabase.rpc("can_open_folder", { p_folder: current.id }) : Promise.resolve({ data: true }),
  ]);

  // ---- Freigaben (für interne Rollen vollständig sichtbar) ----
  const external = members.filter((m) => !INTERNAL_ROLES.includes(m.role));
  type Access = { all: boolean; allVia: DocFolder | null; users: Map<string, { upload: boolean; via: DocFolder }> };
  const accessOf = (fid: string, onlyAncestors = false): Access => {
    const chain = pathTo(fid);
    if (onlyAncestors) chain.pop();
    const res: Access = { all: false, allVia: null, users: new Map() };
    for (const f of chain) {
      if (f.share_all && !res.all) {
        res.all = true;
        res.allVia = f;
      }
      for (const s of shares.filter((x) => x.folder_id === f.id)) {
        const prev = res.users.get(s.user_id);
        if (!prev || (!prev.upload && s.can_upload)) res.users.set(s.user_id, { upload: s.can_upload || !!prev?.upload, via: f });
      }
    }
    return res;
  };
  const accessSummary = (fid: string) => {
    const a = accessOf(fid);
    const names = [...a.users.keys()].filter((u) => byId.has(u)).map((u) => memberName(byId.get(u)!));
    if (a.all) return { text: "Alle Beteiligten", tone: "badge-green" };
    if (names.length === 0) return { text: "nur intern", tone: "badge-amber" };
    return { text: names.length <= 2 ? names.join(", ") : `${names.length} Personen`, tone: "badge-blue" };
  };

  // ---- Inhalte ----
  const query = (q ?? "").trim().toLowerCase();
  const subfolders = query
    ? []
    : folders
        .filter((f) => (f.parent_id ?? null) === (current?.id ?? null))
        .sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true }));
  const here = query
    ? files.filter((f) => `${f.title} ${f.file_name} ${f.plan_number ?? ""}`.toLowerCase().includes(query))
    : files.filter((f) => (f.folder_id ?? null) === (current?.id ?? null));
  const validHere = here
    .filter((f) => !f.superseded)
    .sort((a, b) =>
      (a.plan_number ?? a.title).localeCompare(b.plan_number ?? b.title, "de", { numeric: true }),
    );
  const oldHere = here.filter((f) => f.superseded);
  const shown = alte ? [...validHere, ...oldHere] : validHere;

  const countIn = (fid: string): number =>
    files.filter((d) => d.folder_id === fid && !d.superseded).length +
    folders.filter((f) => f.parent_id === fid).reduce((n, f) => n + countIn(f.id), 0);

  const urls = new Map<string, string>();
  if (shown.length) {
    const { data: signed } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(
      shown.map((f) => f.storage_path),
      3600,
    );
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }

  const base = `/projekte/${id}/dokumente`;
  const here_ = current ? `${base}?ordner=${current.id}` : base;
  const withParam = (p: string) => `${here_}${here_.includes("?") ? "&" : "?"}${p}`;
  const moveTargets = folders
    .map((f) => ({ id: f.id, label: folderLabel(f.id) }))
    .sort((a, b) => a.label.localeCompare(b.label, "de", { numeric: true }));

  const specials = [
    { href: `/projekte/${id}/bauzeitenplan`, icon: "📅", name: "Bauzeitenplan" },
    { href: `/projekte/${id}/protokolle`, icon: "📝", name: "Protokolle & Ortstermine" },
    { href: `/projekte/${id}/kontakte`, icon: "👥", name: "Kontakte" },
    { href: `/projekte/${id}/stammdaten`, icon: "🏠", name: "Projektdaten", note: "Adresse, Rechnungsanschrift" },
  ];

  const rowCls = "grid grid-cols-[2rem_1fr_auto] items-center gap-x-3 px-4 py-2.5 sm:grid-cols-[2rem_1fr_7rem_10rem_5rem_2rem]";

  const FileRow = ({ f }: { f: ProjectFile }) => {
    const url = urls.get(f.storage_path);
    const mine = f.uploaded_by === user.id;
    const canEdit = canManage || mine;
    const uploader = f.uploaded_by && byId.get(f.uploaded_by) ? memberName(byId.get(f.uploaded_by)!) : "";
    const older = !f.superseded && f.kind === "plan" ? oldHere.filter((o) => samePlan(f, o)).length : 0;
    return (
      <div className={`${rowCls} ${f.superseded ? "bg-slate-50" : ""}`}>
        <span className="text-lg">{fileIcon(f)}</span>
        <div className="min-w-0">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={`block truncate font-medium hover:underline ${f.superseded ? "text-slate-400 line-through" : ""}`}
            >
              {f.title}
            </a>
          ) : (
            <span className="block truncate font-medium text-slate-400">{f.title}</span>
          )}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            {f.kind === "plan" && f.plan_number && <span>Nr. {f.plan_number}</span>}
            {f.kind === "plan" && f.plan_index && <span>Index {f.plan_index}</span>}
            {f.kind === "plan" &&
              (f.superseded ? (
                <span className="badge" style={{ color: "#b42318", borderColor: "#f1c4c0", background: "#fef3f2" }}>
                  ungültig
                </span>
              ) : (
                <span className="badge badge-green">gültig</span>
              ))}
            {older > 0 && <span>· {older} ältere Stände</span>}
            {f.visibility === "intern" && <span className="badge badge-amber">🔒 nur intern</span>}
            {query && <span>· {folderLabel(f.folder_id)}</span>}
            <span className="sm:hidden">
              · {formatDate(f.created_at.slice(0, 10))} {uploader && `· ${uploader}`}
            </span>
          </div>
        </div>
        <span className="hidden text-sm text-slate-500 sm:block">{formatDate(f.created_at.slice(0, 10))}</span>
        <span className="hidden truncate text-sm text-slate-500 sm:block">{uploader}</span>
        <span className="hidden text-right text-sm text-slate-500 sm:block">{formatBytes(f.size_bytes)}</span>
        {canEdit ? (
          <details className="relative">
            <summary className="cursor-pointer list-none px-1 text-center text-slate-500 hover:text-slate-900">⋯</summary>
            <div className="card absolute right-0 z-20 mt-1 w-72 space-y-3 p-4 shadow-lg">
              <form action={updateFile.bind(null, id)} className="space-y-2">
                <input type="hidden" name="file_id" value={f.id} />
                <input type="hidden" name="ordner" value={current?.id ?? ""} />
                <div>
                  <label className="label">Name</label>
                  <input name="title" defaultValue={f.title} required className="input" />
                </div>
                <div>
                  <label className="label">Ordner</label>
                  <select name="target" defaultValue={f.folder_id ?? ""} className="input">
                    <option value="">Projektraum (oberste Ebene)</option>
                    {moveTargets.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label.replace(/^Projektraum \/ /, "")}
                      </option>
                    ))}
                  </select>
                </div>
                {canManage && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="intern" defaultChecked={f.visibility === "intern"} className="h-4 w-4" />
                    Nur intern
                  </label>
                )}
                <SubmitButton className="btn btn-sm" pendingText="…">
                  Speichern
                </SubmitButton>
              </form>
              <form action={deleteFile.bind(null, id)} className="border-t border-slate-100 pt-3">
                <input type="hidden" name="file_id" value={f.id} />
                <input type="hidden" name="ordner" value={current?.id ?? ""} />
                <SubmitButton className="btn btn-sm btn-danger" pendingText="Löschen …">
                  Datei löschen
                </SubmitButton>
              </form>
            </div>
          </details>
        ) : (
          <span className="hidden sm:block" />
        )}
      </div>
    );
  };

  const inherited = current ? accessOf(current.id, true) : null;
  const ownShares = current ? new Map(shares.filter((s) => s.folder_id === current.id).map((s) => [s.user_id, s])) : new Map();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Pfad */}
        <nav className="flex flex-wrap items-center gap-1 text-lg">
          <Link href={base} className={current || query ? "text-slate-500 hover:underline" : "font-semibold"}>
            📁 Projektraum
          </Link>
          {pathTo(current?.id ?? null).map((f, i, arr) => (
            <span key={f.id} className="flex items-center gap-1">
              <span className="text-slate-400">›</span>
              {i === arr.length - 1 && !query ? (
                <span className="font-semibold">{f.name}</span>
              ) : (
                <Link href={`${base}?ordner=${f.id}`} className="text-slate-500 hover:underline">
                  {f.name}
                </Link>
              )}
            </span>
          ))}
          {query && (
            <span className="flex items-center gap-1">
              <span className="text-slate-400">›</span>
              <span className="font-semibold">Suche „{q}“</span>
            </span>
          )}
        </nav>
        <form action={base} className="flex gap-2">
          <input name="q" defaultValue={q ?? ""} placeholder="Dateien suchen …" className="input w-48 py-1.5 text-sm" />
        </form>
      </div>

      {current && isInternal && (
        <div className="mt-2 text-sm text-slate-500">
          Zugriff: <span className={`badge ${accessSummary(current.id).tone}`}>{accessSummary(current.id).text}</span>
          {" "}+ Bauleitung / Baubegleitung / Berater
        </div>
      )}

      <div className="mt-4">
        <Notice ok={ok} error={fehler} />
      </div>

      {current && !canOpen && (
        <p className="notice notice-info mt-4 text-sm">
          Dieser Ordner ist für Sie nur als Weg zu freigegebenen Unterordnern sichtbar.
        </p>
      )}

      {/* Liste */}
      <div className="card mt-4 divide-y divide-slate-100 overflow-visible">
        <div className={`${rowCls} hidden text-xs font-semibold tracking-wide text-slate-400 uppercase sm:grid`}>
          <span />
          <span>Name</span>
          <span>Geändert</span>
          <span>Von</span>
          <span className="text-right">Größe</span>
          <span />
        </div>

        {current && !query && (
          <Link href={current.parent_id ? `${base}?ordner=${current.parent_id}` : base} className={`${rowCls} text-sm text-slate-500 hover:bg-slate-50`}>
            <span>↩</span>
            <span>eine Ebene höher</span>
          </Link>
        )}

        {!current &&
          !query &&
          specials.map((s) => (
            <Link key={s.href} href={s.href} className={`${rowCls} hover:bg-slate-50`}>
              <span className="text-lg">{s.icon}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{s.name}</span>
                {s.note && <span className="block text-xs text-slate-500">{s.note}</span>}
              </span>
              <span className="text-xs text-slate-400 sm:col-span-4 sm:text-right">›</span>
            </Link>
          ))}

        {subfolders.map((f) => {
          const n = countIn(f.id);
          const acc = isInternal ? accessSummary(f.id) : null;
          return (
            <Link key={f.id} href={`${base}?ordner=${f.id}`} className={`${rowCls} hover:bg-slate-50`}>
              <span className="text-lg">📁</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{f.name}</span>
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  {n ? `${n} ${n === 1 ? "Datei" : "Dateien"}` : "leer"}
                  {acc && <span className={`badge ${acc.tone}`}>👥 {acc.text}</span>}
                </span>
              </span>
              <span className="text-xs text-slate-400 sm:col-span-4 sm:text-right">›</span>
            </Link>
          );
        })}

        {shown.map((f) => (
          <FileRow key={f.id} f={f} />
        ))}

        {subfolders.length === 0 && shown.length === 0 && (current || query) && (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            {query ? "Keine Dateien gefunden." : "Dieser Ordner ist leer."}
          </div>
        )}
      </div>

      {!query && oldHere.length > 0 && (
        <div className="mt-2 text-sm">
          <Link href={alte ? here_ : withParam("alte=1")} className="text-slate-500 hover:underline">
            {alte ? "Ungültige Planstände ausblenden" : `Ungültige Planstände anzeigen (${oldHere.length})`}
          </Link>
        </div>
      )}

      {/* Hochladen */}
      {!query && canUploadHere && (
        <div className="card mt-6 p-5">
          <h3 className="mb-3 font-semibold">Hochladen</h3>
          <RaumUpload
            key={current?.id ?? "root"}
            projectId={id}
            folderId={current?.id ?? null}
            folderLabel={folderLabel(current?.id ?? null)}
            allowIntern={canManage}
          />
          {!current && (
            <p className="mt-2 text-xs text-slate-500">Dateien auf der obersten Ebene sehen alle Beteiligten.</p>
          )}
        </div>
      )}

      {/* Freigabe */}
      {!query && canManage && current && (
        <details className="card mt-6 p-5" open={!!freigabe}>
          <summary className="cursor-pointer font-semibold">Freigabe für „{current.name}“</summary>
          <p className="mt-2 text-sm text-slate-500">
            Gilt für diesen Ordner und alle Unterordner. Bauleitung, Baubegleitung und Berater sehen immer alles.
          </p>
          <form action={saveShares.bind(null, id)} className="mt-4 space-y-3">
            <input type="hidden" name="folder_id" value={current.id} />
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="share_all"
                defaultChecked={current.share_all || inherited?.all}
                disabled={inherited?.all}
                className="h-4 w-4"
              />
              Alle Beteiligten (lesen)
              {inherited?.all && inherited.allVia && (
                <span className="font-normal text-slate-500">– über „{inherited.allVia.name}“</span>
              )}
            </label>

            {external.length === 0 ? (
              <p className="text-sm text-slate-500">Noch keine Auftraggeber oder Gewerke im Projekt.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 uppercase">
                      <th className="py-1 pr-3 font-semibold">Beteiligter</th>
                      <th className="py-1 pr-3 font-semibold">Sehen</th>
                      <th className="py-1 font-semibold">Hochladen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {external.map((m) => {
                      const inh = inherited?.users.get(m.user_id);
                      const own = ownShares.get(m.user_id) as FolderShare | undefined;
                      return (
                        <tr key={m.user_id}>
                          <td className="py-2 pr-3">
                            {memberLabel(m)}
                            <span className="ml-1 text-xs text-slate-400">· {ROLE_LABELS[m.role]}</span>
                            {inh && <div className="text-xs text-slate-500">über „{inh.via.name}“</div>}
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="checkbox"
                              name={`zugriff_${m.user_id}`}
                              defaultChecked={!!own || !!inh || inherited?.all}
                              disabled={!!inh || inherited?.all}
                              className="h-4 w-4"
                            />
                          </td>
                          <td className="py-2">
                            <input
                              type="checkbox"
                              name={`upload_${m.user_id}`}
                              defaultChecked={!!own?.can_upload || !!inh?.upload}
                              disabled={!!inh?.upload}
                              className="h-4 w-4"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <SubmitButton className="btn btn-primary btn-sm" pendingText="Speichern …">
              Freigabe speichern
            </SubmitButton>
            <p className="text-xs text-slate-500">
              Ausgegraute Haken kommen aus einem übergeordneten Ordner und lassen sich nur dort ändern.
            </p>
          </form>
        </details>
      )}

      {/* Ordner verwalten */}
      {!query && canManage && (
        <details className="card mt-4 p-5" open={folders.length === 0}>
          <summary className="cursor-pointer font-semibold">Ordner verwalten</summary>
          <form action={createFolder.bind(null, id)} className="mt-3 flex gap-2">
            <input type="hidden" name="ordner" value={current?.id ?? ""} />
            <input
              name="name"
              required
              className="input"
              placeholder={current ? `Neuer Unterordner in „${current.name}“` : "Neuer Ordner"}
            />
            <SubmitButton className="btn shrink-0">Anlegen</SubmitButton>
          </form>
          {!current && folders.length === 0 && (
            <form action={insertTradeFolders.bind(null, id)} className="mt-3">
              <SubmitButton className="btn btn-sm" pendingText="…">
                Vorlage einfügen: Gewerke (Abbruch … Zimmerer), Pläne, Allgemein
              </SubmitButton>
            </form>
          )}
          {current && (
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
              <form action={renameFolder.bind(null, id)} className="flex gap-2">
                <input type="hidden" name="folder_id" value={current.id} />
                <input type="hidden" name="ordner" value={current.id} />
                <input name="name" required defaultValue={current.name} className="input" />
                <SubmitButton className="btn btn-sm shrink-0">Umbenennen</SubmitButton>
              </form>
              <form action={deleteFolder.bind(null, id)}>
                <input type="hidden" name="folder_id" value={current.id} />
                <input type="hidden" name="parent_id" value={current.parent_id ?? ""} />
                <SubmitButton className="btn btn-sm btn-danger" pendingText="…">
                  Ordner „{current.name}“ löschen (nur wenn leer)
                </SubmitButton>
              </form>
            </div>
          )}
        </details>
      )}
    </div>
  );
}
