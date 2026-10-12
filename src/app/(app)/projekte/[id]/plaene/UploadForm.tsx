"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registerFile } from "./actions";
import { STORAGE_BUCKET } from "@/lib/types";

const MAX_MB = 50;

function safeName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-120);
}

export function UploadForm({ projectId, categories }: { projectId: string; categories: string[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<"plan" | "dokument">("plan");
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
    let done = 0;

    for (const file of files) {
      const path = `${projectId}/${crypto.randomUUID()}/${safeName(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) {
        setBusy(false);
        return setMsg({ error: `Upload von „${file.name}“ fehlgeschlagen: ${upErr.message}` });
      }
      const res = await registerFile(projectId, {
        kind,
        // Bei mehreren Dateien ohne Titel: Dateiname als Titel
        title: files.length > 1 ? file.name.replace(/\.[^.]+$/, "") : String(fd.get("title") ?? ""),
        category: String(fd.get("category") ?? ""),
        plan_number: files.length > 1 ? "" : String(fd.get("plan_number") ?? ""),
        plan_index: files.length > 1 ? "" : String(fd.get("plan_index") ?? ""),
        plan_date: String(fd.get("plan_date") ?? ""),
        visibility: String(fd.get("visibility") ?? "alle"),
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
    setKind("plan");
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2 flex gap-2">
        {(["plan", "dokument"] as const).map((k) => (
          <label
            key={k}
            className={`btn btn-sm ${kind === k ? "btn-primary" : ""}`}
            style={{ cursor: "pointer" }}
          >
            <input
              type="radio"
              name="kind"
              value={k}
              checked={kind === k}
              onChange={() => setKind(k)}
              className="sr-only"
            />
            {k === "plan" ? "Plan" : "Dokument"}
          </label>
        ))}
      </div>

      <div className="sm:col-span-2">
        <label className="label">Datei(en) *</label>
        <input name="files" type="file" multiple required className="input" accept=".pdf,.png,.jpg,.jpeg,.dwg,.dxf,.doc,.docx,.xls,.xlsx,image/*,application/pdf" />
        <p className="mt-1 text-xs text-slate-500">Max. {MAX_MB} MB je Datei. Bei mehreren Dateien wird der Dateiname als Titel verwendet.</p>
      </div>

      <div className="sm:col-span-2">
        <label className="label">Titel</label>
        <input name="title" className="input" placeholder={kind === "plan" ? "z. B. Grundriss EG" : "z. B. Baugenehmigung"} />
      </div>

      {kind === "plan" && (
        <>
          <div>
            <label className="label">Plannummer</label>
            <input name="plan_number" className="input" placeholder="z. B. A-101" />
          </div>
          <div>
            <label className="label">Index</label>
            <input name="plan_index" className="input" placeholder="z. B. b" />
          </div>
        </>
      )}

      <div>
        <label className="label">Kategorie</label>
        <input name="category" list="file-categories" className="input" placeholder={kind === "plan" ? "z. B. Ausführungsplanung" : "z. B. Genehmigung"} />
        <datalist id="file-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div>
        <label className="label">{kind === "plan" ? "Planstand (Datum)" : "Datum"}</label>
        <input name="plan_date" type="date" className="input" />
      </div>

      <div className="sm:col-span-2">
        <label className="label">Sichtbar für</label>
        <select name="visibility" defaultValue="alle" className="input">
          <option value="alle">Alle Beteiligten</option>
          <option value="intern">Nur intern (Bauleitung, Baubegleitung, Berater)</option>
        </select>
      </div>

      {kind === "plan" && (
        <p className="notice notice-info text-xs sm:col-span-2">
          Gleiche Plannummer wie ein vorhandener Plan → der bisherige Stand wird automatisch als
          <b> ungültig</b> gekennzeichnet.
        </p>
      )}

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
