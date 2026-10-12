"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProject } from "@/lib/auth";
import { STORAGE_BUCKET } from "@/lib/types";

function str(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

export type FileMeta = {
  kind: string;
  title: string;
  category: string;
  plan_number: string;
  plan_index: string;
  plan_date: string;
  visibility: string;
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
  const title = str(meta.title) ?? meta.file_name;

  const { error } = await supabase.from("project_files").insert({
    project_id: projectId,
    kind: meta.kind === "dokument" ? "dokument" : "plan",
    title,
    category: str(meta.category),
    plan_number: str(meta.plan_number),
    plan_index: str(meta.plan_index),
    plan_date: str(meta.plan_date),
    visibility: meta.visibility === "intern" ? "intern" : "alle",
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

export async function deleteFile(projectId: string, formData: FormData) {
  const path = `/projekte/${projectId}/plaene`;
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
  const path = `/projekte/${projectId}/plaene`;
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) redirect(`${path}?fehler=${encodeURIComponent("Keine Berechtigung.")}`);

  const fileId = str(formData.get("file_id"));
  const visibility = formData.get("visibility") === "intern" ? "intern" : "alle";
  await supabase.from("project_files").update({ visibility }).eq("id", fileId ?? "").eq("project_id", projectId);

  revalidatePath(path);
  redirect(`${path}?ok=${encodeURIComponent("Sichtbarkeit geändert.")}`);
}
