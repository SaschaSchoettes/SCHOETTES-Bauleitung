"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registerFile } from "@/app/(app)/projekte/[id]/dokumente/actions";
import { STORAGE_BUCKET } from "@/lib/types";
import { safeFileName } from "@/components/FileUpload";

const MAX_MB = 50;

/** Dateien in den aktuellen Ordner ziehen oder auswählen (wie OneDrive). */
export function RaumUpload({
  projectId,
  folderId,
  folderLabel,
  allowIntern,
}: {
  projectId: string;
  folderId: string | null;
  folderLabel: string;
  allowIntern: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [asPlan, setAsPlan] = useState(false);
  const [plan, setPlan] = useState({ number: "", index: "", date: "", title: "" });
  const [intern, setIntern] = useState(false);

  async function upload(list: FileList | File[]) {
    const files = [...list].filter((f) => f.size > 0);
    if (!files.length) return;
    const tooBig = files.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) return setMsg({ error: `„${tooBig.name}“ ist größer als ${MAX_MB} MB.` });
    if (asPlan && files.length > 1) return setMsg({ error: "Plan-Angaben gelten nur für eine einzelne Datei." });
    if (asPlan && !plan.number.trim()) return setMsg({ error: "Bitte die Plannummer angeben." });

    setMsg({});
    const supabase = createClient();
    let done = 0;
    for (const file of files) {
      setBusy(`Lade hoch … ${done + 1} / ${files.length}`);
      const path = `${projectId}/${crypto.randomUUID()}/${safeFileName(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) {
        setBusy(null);
        return setMsg({ error: `Upload von „${file.name}“ fehlgeschlagen: ${upErr.message}` });
      }
      const res = await registerFile(projectId, {
        kind: asPlan ? "plan" : "dokument",
        title: asPlan && plan.title.trim() ? plan.title : file.name.replace(/\.[^.]+$/, ""),
        plan_number: asPlan ? plan.number : "",
        plan_index: asPlan ? plan.index : "",
        plan_date: asPlan ? plan.date : "",
        intern,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        folder_id: folderId ?? "",
      });
      if (res.error) {
        setBusy(null);
        return setMsg({ error: res.error });
      }
      done++;
    }
    setBusy(null);
    setMsg({ ok: done === 1 ? "Datei hochgeladen." : `${done} Dateien hochgeladen.` });
    setPlan({ number: "", index: "", date: "", title: "" });
    setAsPlan(false);
    setIntern(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!busy) upload(e.dataTransfer.files);
        }}
        onClick={() => !busy && inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm transition ${
          over ? "border-brand bg-slate-50" : "border-slate-300 hover:bg-slate-50"
        }`}
      >
        {busy ? (
          <span className="font-medium">{busy}</span>
        ) : (
          <>
            <span className="font-medium">Dateien hierher ziehen oder klicken</span>
            <span className="mt-1 block text-xs text-slate-500">
              Ablage in: {folderLabel} · max. {MAX_MB} MB je Datei
            </span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={asPlan} onChange={(e) => setAsPlan(e.target.checked)} className="h-4 w-4" />
          Als Plan mit Plannummer / Index
        </label>
        {allowIntern && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={intern} onChange={(e) => setIntern(e.target.checked)} className="h-4 w-4" />
            Nur intern
          </label>
        )}
      </div>

      {asPlan && (
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-4">
            <label className="label">Titel (optional, sonst Dateiname)</label>
            <input className="input" value={plan.title} onChange={(e) => setPlan({ ...plan, title: e.target.value })} placeholder="z. B. Grundriss EG" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Plannummer *</label>
            <input className="input" value={plan.number} onChange={(e) => setPlan({ ...plan, number: e.target.value })} placeholder="z. B. A-101" />
          </div>
          <div>
            <label className="label">Index</label>
            <input className="input" value={plan.index} onChange={(e) => setPlan({ ...plan, index: e.target.value })} placeholder="z. B. b" />
          </div>
          <div>
            <label className="label">Planstand</label>
            <input type="date" className="input" value={plan.date} onChange={(e) => setPlan({ ...plan, date: e.target.value })} />
          </div>
          <p className="text-xs text-slate-500 sm:col-span-4">
            Gleiche Plannummer wie ein vorhandener Plan → der bisherige Stand wird automatisch als ungültig gekennzeichnet.
            Danach die Datei oben hineinziehen.
          </p>
        </div>
      )}

      {msg.error && <p className="notice notice-error mt-3">{msg.error}</p>}
      {msg.ok && <p className="notice notice-ok mt-3">{msg.ok}</p>}
    </div>
  );
}
