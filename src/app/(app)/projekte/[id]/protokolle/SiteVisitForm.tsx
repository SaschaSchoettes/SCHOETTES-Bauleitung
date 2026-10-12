"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { createSiteVisit } from "./actions";
import { STORAGE_BUCKET } from "@/lib/types";

const MAX_EDGE = 1600; // px, längste Kante
const QUALITY = 0.75;

/** Foto im Browser verkleinern (spart Speicher, ca. 200–500 KB je Foto). */
async function compress(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // z. B. HEIC in älteren Browsern → Original
  }
}

export function SiteVisitForm({ projectId, today }: { projectId: string; today: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const photos = (fd.getAll("photos") as File[]).filter((f) => f && f.size > 0);
    if (photos.length > 30) return setMsg({ error: "Bitte höchstens 30 Fotos je Ortstermin." });

    setBusy(true);
    setMsg({});
    const supabase = createClient();
    const paths: string[] = [];

    for (const [i, photo] of photos.entries()) {
      setStatus(`Foto ${i + 1} von ${photos.length} wird verkleinert und hochgeladen …`);
      const blob = await compress(photo);
      const ext = blob.type === "image/jpeg" ? "jpg" : (photo.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${projectId}/ortstermine/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, blob, { contentType: blob.type || photo.type || "image/jpeg" });
      if (error) {
        if (paths.length) await supabase.storage.from(STORAGE_BUCKET).remove(paths);
        setBusy(false);
        setStatus("");
        return setMsg({ error: `Foto ${i + 1} konnte nicht hochgeladen werden: ${error.message}` });
      }
      paths.push(path);
    }

    setStatus("Speichere …");
    const res = await createSiteVisit(projectId, {
      visit_date: String(fd.get("visit_date") ?? ""),
      title: String(fd.get("title") ?? ""),
      body: String(fd.get("body") ?? ""),
      photo_paths: paths,
    });
    setBusy(false);
    setStatus("");
    if (res.error) return setMsg({ error: res.error });
    setMsg({ ok: "Ortstermin gespeichert." });
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label">Datum *</label>
        <input name="visit_date" type="date" required defaultValue={today} className="input" />
      </div>
      <div>
        <label className="label">Anlass</label>
        <input name="title" className="input" placeholder="z. B. Begehung Dach, Abnahme Gerüst" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Was war vor Ort? *</label>
        <textarea name="body" required rows={4} className="input" placeholder="Kurz: Stand der Arbeiten, Besonderheiten, Absprachen" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Fotos</label>
        <input name="photos" type="file" accept="image/*" multiple className="input" />
        <p className="mt-1 text-xs text-slate-500">
          Auf dem Handy direkt mit der Kamera aufnehmen möglich. Fotos werden automatisch verkleinert.
        </p>
      </div>
      {status && <p className="text-sm text-slate-600 sm:col-span-2">{status}</p>}
      {msg.error && <p className="notice notice-error sm:col-span-2">{msg.error}</p>}
      {msg.ok && <p className="notice notice-ok sm:col-span-2">{msg.ok}</p>}
      <div className="sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Speichere …" : "Ortstermin speichern"}
        </button>
      </div>
    </form>
  );
}
