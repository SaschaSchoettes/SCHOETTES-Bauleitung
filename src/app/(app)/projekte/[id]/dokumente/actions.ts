"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProject } from "@/lib/auth";
import { STORAGE_BUCKET, type Visibility } from "@/lib/types";

function str(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

const VISIBILITIES: Visibility[] = ["alle", "bauherr", "gewerk", "intern"];

export type FileMeta = {
  kind: string;
  title: string;
  category: string;
  trade: string;
  plan_number: string;
  plan_index: string;
  plan_date: string;
  doc_date: string;
  visibility: string;
  visible_to: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
};

/** Nach dem Upload in den Speicher: Datensatz anlegen. */
export async function registerFile(projectId: string, meta: FileMeta): Promise<{ error?: string }> {
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) return { error: "Keine Berechtigung." };

  if (!meta.storage_path.startsWith(projectId + "/")) return { error: "Ungültiger Speicherpfad." };

  const kind = meta.kind === "dokument" ? "dokument" : meta.kind === "protokoll" ? "protokoll" : "plan";
  const visibility = (VISIBILITIES as string[]).includes(meta.visibility) ? (meta.visibility as Visibility) : "alle";
  const visibleTo = visibility === "gewerk" ? str(meta.visible_to) : null;
  if (visibility === "gewerk" && !visibleTo) {
    await supabase.storage.from(STORAGE_BUCKET).remove([meta.storage_path]);
    return { error: "Bitte das Gewerk auswählen, das die Datei sehen darf." };
  }

  const { error } = await supabase.from("project_files").insert({
    project_id: projectId,
    kind,
    title: str(meta.title) ?? meta.file_name,
    category: str(meta.category),
    trade: str(meta.trade),
    plan_number: kind === "plan" ? str(meta.plan_number) : null,
    plan_index: kind === "plan" ? str(meta.plan_index) : null,
    plan_date: kind === "plan" ? str(meta.plan_date) : null,
    doc_date: kind === "plan" ? null : str(meta.doc_date),
    visibility,
    visible_to: visibleTo,
    storage_path: meta.storage_path,
    file_name: meta.file_name,
    mime_type: str(meta.mime_type),
    size_bytes: Number.isFinite(meta.size_bytes) ? meta.size_bytes : null,
  });

  if (error) {
    await supabase.storage.from(STORAGE_BUCKET).remove([meta.storage_path]);
    return { error: "Speichern fehlgeschlagen: " + error.message };
  }

  revalidatePath(`/projekte/${projectId}`, "layout");
  return {};
}

function backTo(projectId: string, formData: FormData) {
  const tab = formData.get("return") === "protokolle" ? "protokolle" : "dokumente";
  return `/projekte/${projectId}/${tab}`;
}

export async function deleteFile(projectId: string, formData: FormData) {
  const path = backTo(projectId, formData);
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) redirect(`${path}?fehler=${encodeURIComponent("Keine Berechtigung.")}`);

  const fileId = str(formData.get("file_id"));
  const { data: file } = await supabase
    .from("project_files")
    .select("id, storage_path")
    .eq("id", fileId ?? "")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!file) redirect(`${path}?fehler=${encodeURIComponent("Datei nicht gefunden.")}`);

  await supabase.storage.from(STORAGE_BUCKET).remove([file.storage_path]);
  const { error } = await supabase.from("project_files").delete().eq("id", file.id);
  if (error) redirect(`${path}?fehler=${encodeURIComponent("Löschen fehlgeschlagen: " + error.message)}`);

  revalidatePath(`/projekte/${projectId}`, "layout");
  redirect(`${path}?ok=${encodeURIComponent("Datei gelöscht.")}`);
}

export async function setVisibility(projectId: string, formData: FormData) {
  const path = backTo(projectId, formData);
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) redirect(`${path}?fehler=${encodeURIComponent("Keine Berechtigung.")}`);

  const fileId = str(formData.get("file_id"));
  const raw = String(formData.get("visibility") ?? "alle");
  const visibility = (VISIBILITIES as string[]).includes(raw) ? raw : "alle";
  const visibleTo = visibility === "gewerk" ? str(formData.get("visible_to")) : null;
  if (visibility === "gewerk" && !visibleTo) {
    redirect(`${path}?fehler=${encodeURIComponent("Bitte das Gewerk auswählen.")}`);
  }

  const { error } = await supabase
    .from("project_files")
    .update({ visibility, visible_to: visibleTo })
    .eq("id", fileId ?? "")
    .eq("project_id", projectId);
  if (error) redirect(`${path}?fehler=${encodeURIComponent("Ändern fehlgeschlagen: " + error.message)}`);

  revalidatePath(path);
  redirect(`${path}?ok=${encodeURIComponent("Sichtbarkeit geändert.")}`);
}
