"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registerFile } from "@/app/(app)/projekte/[id]/dokumente/actions";
import { STORAGE_BUCKET } from "@/lib/types";

const MAX_MB = 50;

export function safeFileName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-120);
}

/** Upload von Protokollen (PDF) – für alle Beteiligten sichtbar. */
export function FileUpload({ projectId }: { projectId: string; mode?: "protokolle" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const files = (fd.getAll("files") as File[]).filter((f) => f && f.size > 0);
    if (files.length === 0) return setMsg({ error: "Bitte eine Datei auswählen." });
    const tooBig = files.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) return setMsg({ error: `„${tooBig.name}“ ist größer als ${MAX_MB} MB.` });

    setBusy(true);
    setMsg({});
    const supabase = createClient();
    const multi = files.length > 1;
    let done = 0;

    for (const file of files) {
      const path = `${projectId}/${crypto.randomUUID()}/${safeFileName(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) {
        setBusy(false);
        return setMsg({ error: `Upload von „${file.name}“ fehlgeschlagen: ${upErr.message}` });
      }
      const res = await registerFile(projectId, {
        kind: "protokoll",
        title: multi ? file.name.replace(/\.[^.]+$/, "") : String(fd.get("title") ?? ""),
        doc_date: String(fd.get("date") ?? ""),
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      });
      if (res.error) {
        setBusy(false);
        return setMsg({ error: res.error });
      }
      done++;
    }

    setBusy(false);
    setMsg({ ok: done === 1 ? "Datei hochgeladen." : `${done} Dateien hochgeladen.` });
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Datei(en) *</label>
        <input name="files" type="file" multiple required className="input" accept=".pdf,application/pdf,image/*" />
        <p className="mt-1 text-xs text-slate-500">
          Max. {MAX_MB} MB je Datei. Bei mehreren Dateien wird der Dateiname als Titel verwendet.
        </p>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Titel</label>
        <input name="title" className="input" placeholder="z. B. Baubesprechung Nr. 3" />
      </div>
      <div>
        <label className="label">Datum</label>
        <input name="date" type="date" className="input" />
      </div>
      <p className="notice notice-info text-xs sm:col-span-2">Protokolle sind für alle Beteiligten sichtbar.</p>
      {msg.error && <p className="notice notice-error sm:col-span-2">{msg.error}</p>}
      {msg.ok && <p className="notice notice-ok sm:col-span-2">{msg.ok}</p>}
      <div className="sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Lade hoch …" : "Hochladen"}
        </button>
      </div>
    </form>
  );
}
