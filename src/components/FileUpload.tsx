"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registerFile } from "@/app/(app)/projekte/[id]/dokumente/actions";
import { DOC_CATEGORIES, STORAGE_BUCKET, VISIBILITY_LABELS, type Visibility } from "@/lib/types";

const MAX_MB = 50;

export function safeFileName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-120);
}

export type MemberOption = { id: string; label: string };

/**
 * Upload in den privaten Speicher + Datensatz.
 * mode "dokumente": Plan oder Dokument mit Sichtbarkeit
 * mode "protokolle": PDF-Protokoll, für alle sichtbar
 */
export function FileUpload({
  projectId,
  mode,
  planCategories = [],
  members = [],
  folderId = null,
  folderLabel = null,
  initialKind = "plan",
}: {
  projectId: string;
  mode: "dokumente" | "protokolle";
  planCategories?: string[];
  members?: MemberOption[];
  folderId?: string | null;
  folderLabel?: string | null;
  initialKind?: "plan" | "dokument";
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"plan" | "dokument">(initialKind);
  const [visibility, setVisibility] = useState<Visibility>(initialKind === "plan" ? "alle" : "bauherr");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  const isProtocol = mode === "protokolle";
  const effectiveKind = isProtocol ? "protokoll" : kind;

  function chooseKind(k: "plan" | "dokument") {
    setKind(k);
    setVisibility(k === "plan" ? "alle" : "bauherr");
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const files = (fd.getAll("files") as File[]).filter((f) => f && f.size > 0);
    if (files.length === 0) return setMsg({ error: "Bitte eine Datei auswählen." });
    const tooBig = files.find((f) => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) return setMsg({ error: `„${tooBig.name}“ ist größer als ${MAX_MB} MB.` });
    if (!isProtocol && visibility === "gewerk" && !fd.get("visible_to")) {
      return setMsg({ error: "Bitte das Gewerk auswählen, das die Datei sehen darf." });
    }

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
        kind: effectiveKind,
        title: multi ? file.name.replace(/\.[^.]+$/, "") : String(fd.get("title") ?? ""),
        category: String(fd.get("category") ?? ""),
        trade: String(fd.get("trade") ?? ""),
        plan_number: multi ? "" : String(fd.get("plan_number") ?? ""),
        plan_index: multi ? "" : String(fd.get("plan_index") ?? ""),
        plan_date: String(fd.get("date") ?? ""),
        doc_date: String(fd.get("date") ?? ""),
        visibility: isProtocol ? "alle" : visibility,
        visible_to: String(fd.get("visible_to") ?? ""),
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        folder_id: folderId ?? "",
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
    chooseKind(initialKind);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
      {!isProtocol && (
        <div className="flex gap-2 sm:col-span-2">
          {(["plan", "dokument"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => chooseKind(k)}
              className={`btn btn-sm ${kind === k ? "btn-primary" : ""}`}
            >
              {k === "plan" ? "Plan" : "Angebot / Rechnung / Sonstiges"}
            </button>
          ))}
        </div>
      )}

      {!isProtocol && kind === "dokument" && (
        <p className="text-sm text-slate-600 sm:col-span-2">
          Ablage in: <b>{folderLabel || "Dokumente (oberste Ebene)"}</b>
        </p>
      )}

      <div className="sm:col-span-2">
        <label className="label">Datei(en) *</label>
        <input
          name="files"
          type="file"
          multiple
          required
          className="input"
          accept={
            isProtocol
              ? ".pdf,application/pdf,image/*"
              : ".pdf,.png,.jpg,.jpeg,.dwg,.dxf,.doc,.docx,.xls,.xlsx,image/*,application/pdf"
          }
        />
        <p className="mt-1 text-xs text-slate-500">
          Max. {MAX_MB} MB je Datei. Bei mehreren Dateien wird der Dateiname als Titel verwendet.
        </p>
      </div>

      <div className="sm:col-span-2">
        <label className="label">Titel</label>
        <input
          name="title"
          className="input"
          placeholder={
            isProtocol ? "z. B. Baubesprechung Nr. 3" : kind === "plan" ? "z. B. Grundriss EG" : "z. B. Angebot Dachdeckerarbeiten"
          }
        />
      </div>

      {!isProtocol && kind === "plan" && (
        <>
          <div>
            <label className="label">Plannummer</label>
            <input name="plan_number" className="input" placeholder="z. B. A-101" />
          </div>
          <div>
            <label className="label">Index</label>
            <input name="plan_index" className="input" placeholder="z. B. b" />
          </div>
          <div>
            <label className="label">Plankategorie</label>
            <input name="category" list="plan-categories" className="input" placeholder="z. B. Ausführungsplanung" />
            <datalist id="plan-categories">
              {planCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </>
      )}

      {!isProtocol && kind === "dokument" && (
        <>
          <div>
            <label className="label">Art</label>
            <select name="category" className="input" defaultValue="Angebot">
              {DOC_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Gewerk / Firma</label>
            <input name="trade" className="input" placeholder="z. B. Dachdecker Müller" />
          </div>
        </>
      )}

      <div>
        <label className="label">{kind === "plan" && !isProtocol ? "Planstand (Datum)" : "Datum"}</label>
        <input name="date" type="date" className="input" />
      </div>

      {!isProtocol && (
        <>
          <div className="sm:col-span-2">
            <label className="label">Sichtbar für</label>
            <select
              name="visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
              className="input"
            >
              {(Object.keys(VISIBILITY_LABELS) as Visibility[]).map((v) => (
                <option key={v} value={v}>
                  {VISIBILITY_LABELS[v]}
                </option>
              ))}
            </select>
          </div>
          {visibility === "gewerk" && (
            <div className="sm:col-span-2">
              <label className="label">Welches Gewerk darf die Datei sehen? *</label>
              <select name="visible_to" className="input" defaultValue="">
                <option value="">– bitte wählen –</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {!isProtocol && kind === "plan" && (
        <p className="notice notice-info text-xs sm:col-span-2">
          Gleiche Plannummer wie ein vorhandener Plan → der bisherige Stand wird automatisch als
          <b> ungültig</b> gekennzeichnet.
        </p>
      )}
      {isProtocol && (
        <p className="notice notice-info text-xs sm:col-span-2">Protokolle sind für alle Beteiligten sichtbar.</p>
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
