import { requireProject } from "@/lib/auth";
import { getMembers, memberName } from "@/lib/data";
import { deleteSiteVisit } from "./actions";
import { deleteFile } from "../dokumente/actions";
import { SiteVisitForm } from "./SiteVisitForm";
import { FileUpload } from "@/components/FileUpload";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/Notice";
import {
  STORAGE_BUCKET,
  formatBytes,
  formatDate,
  todayBerlin,
  type Member,
  type ProjectFile,
  type SiteVisit,
} from "@/lib/types";

type Photo = { id: string; visit_id: string; storage_path: string };

export default async function ProtokollePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; fehler?: string }>;
}) {
  const { id } = await params;
  const { ok, fehler } = await searchParams;
  const { supabase, canManage } = await requireProject(id);

  const [{ data: visitData }, { data: photoData }, { data: fileData }, members] = await Promise.all([
    supabase.from("site_visits").select("*").eq("project_id", id).order("visit_date", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("site_visit_photos").select("id, visit_id, storage_path").eq("project_id", id).order("created_at"),
    supabase.from("project_files").select("*").eq("project_id", id).eq("kind", "protokoll").order("created_at", { ascending: false }),
    getMembers(supabase, id),
  ]);

  const visits = (visitData ?? []) as SiteVisit[];
  const photos = (photoData ?? []) as Photo[];
  const files = (fileData ?? []) as ProjectFile[];
  const byId = new Map<string, Member>(members.map((m): [string, Member] => [m.user_id, m]));

  const paths = [...photos.map((p) => p.storage_path), ...files.map((f) => f.storage_path)];
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(paths, 3600);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }

  const delVisit = deleteSiteVisit.bind(null, id);
  const delFile = deleteFile.bind(null, id);

  // Zeitstrahl aus Ortsterminen und PDF-Protokollen
  type Entry = { kind: "visit"; date: string; v: SiteVisit } | { kind: "file"; date: string; f: ProjectFile };
  const entries: Entry[] = [
    ...visits.map((v): Entry => ({ kind: "visit", date: v.visit_date, v })),
    ...files.map((f): Entry => ({ kind: "file", date: f.doc_date ?? f.created_at.slice(0, 10), f })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <h2 className="text-xl font-semibold">Protokolle</h2>
      <p className="mt-1 text-sm text-slate-500">
        Besprechungsprotokolle und Ortstermine – sichtbar für alle Beteiligten und den Bauherrn
      </p>

      <div className="mt-4">
        <Notice ok={ok} error={fehler} />
      </div>

      {canManage && (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <details className="card p-5" open={entries.length === 0}>
            <summary className="cursor-pointer font-semibold">📍 Ortstermin festhalten</summary>
            <SiteVisitForm projectId={id} today={todayBerlin()} />
          </details>
          <details className="card p-5">
            <summary className="cursor-pointer font-semibold">📄 Protokoll (PDF) hochladen</summary>
            <FileUpload projectId={id} mode="protokolle" />
          </details>
        </div>
      )}

      {entries.length === 0 && (
        <div className="card mt-5 p-6 text-center text-slate-500">Noch keine Protokolle oder Ortstermine.</div>
      )}

      <div className="mt-6 space-y-3">
        {entries.map((e) => {
          if (e.kind === "file") {
            const f = e.f;
            const url = urls.get(f.storage_path);
            return (
              <article key={f.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      📄 Protokoll · {formatDate(e.date)}
                    </div>
                    <div className="mt-0.5 font-semibold">{f.title}</div>
                    <div className="truncate text-xs text-slate-400">
                      {f.file_name} {f.size_bytes ? `· ${formatBytes(f.size_bytes)}` : ""}
                    </div>
                  </div>
                  {url && (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                      Öffnen
                    </a>
                  )}
                </div>
                {canManage && (
                  <form action={delFile} className="mt-3">
                    <input type="hidden" name="file_id" value={f.id} />
                    <input type="hidden" name="return" value="protokolle" />
                    <SubmitButton className="btn btn-sm btn-danger" pendingText="Löschen …">
                      Löschen
                    </SubmitButton>
                  </form>
                )}
              </article>
            );
          }

          const v = e.v;
          const vp = photos.filter((p) => p.visit_id === v.id);
          const author = v.created_by ? byId.get(v.created_by) : undefined;
          return (
            <article key={v.id} className="card p-4">
              <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                📍 Ortstermin · {formatDate(v.visit_date)}
              </div>
              {v.title && <div className="mt-0.5 font-semibold">{v.title}</div>}
              <p className="mt-1 text-sm whitespace-pre-wrap">{v.body}</p>
              {vp.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {vp.map((p) => {
                    const url = urls.get(p.storage_path);
                    return url ? (
                      <a key={p.id} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-square overflow-hidden rounded-lg bg-slate-100">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="Foto Ortstermin" loading="lazy" className="h-full w-full object-cover" />
                      </a>
                    ) : null;
                  })}
                </div>
              )}
              <div className="mt-2 text-xs text-slate-400">{author ? `Erfasst von ${memberName(author)}` : ""}</div>
              {canManage && (
                <form action={delVisit} className="mt-3">
                  <input type="hidden" name="visit_id" value={v.id} />
                  <SubmitButton className="btn btn-sm btn-danger" pendingText="Löschen …">
                    Ortstermin löschen
                  </SubmitButton>
                </form>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
