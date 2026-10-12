"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProject } from "@/lib/auth";
import { STORAGE_BUCKET } from "@/lib/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Ortstermin anlegen; Fotos wurden vorher vom Browser in den Speicher geladen. */
export async function createSiteVisit(
  projectId: string,
  input: { visit_date: string; title: string; body: string; photo_paths: string[] },
): Promise<{ error?: string }> {
  const { supabase, user, canManage } = await requireProject(projectId);
  if (!canManage) return { error: "Keine Berechtigung." };

  const body = String(input.body ?? "").trim();
  if (!body) return { error: "Bitte kurz beschreiben, was vor Ort war." };
  if (!ISO_DATE.test(input.visit_date)) return { error: "Bitte ein gültiges Datum angeben." };
  const paths = (input.photo_paths ?? []).filter((p) => typeof p === "string" && p.startsWith(projectId + "/"));

  const { data: visit, error } = await supabase
    .from("site_visits")
    .insert({
      project_id: projectId,
      visit_date: input.visit_date,
      title: String(input.title ?? "").trim() || null,
      body: body.slice(0, 10000),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !visit) {
    if (paths.length) await supabase.storage.from(STORAGE_BUCKET).remove(paths);
    return { error: "Speichern fehlgeschlagen: " + (error?.message ?? "") };
  }

  if (paths.length) {
    const { error: photoErr } = await supabase
      .from("site_visit_photos")
      .insert(paths.map((p) => ({ visit_id: visit.id, project_id: projectId, storage_path: p })));
    if (photoErr) return { error: "Notiz gespeichert, Fotos fehlgeschlagen: " + photoErr.message };
  }

  revalidatePath(`/projekte/${projectId}`, "layout");
  return {};
}

export async function deleteSiteVisit(projectId: string, formData: FormData) {
  const path = `/projekte/${projectId}/protokolle`;
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) redirect(`${path}?fehler=${encodeURIComponent("Keine Berechtigung.")}`);

  const visitId = String(formData.get("visit_id") ?? "");
  const { data: photos } = await supabase
    .from("site_visit_photos")
    .select("storage_path")
    .eq("visit_id", visitId)
    .eq("project_id", projectId);

  const paths = ((photos ?? []) as { storage_path: string }[]).map((p) => p.storage_path);
  if (paths.length) await supabase.storage.from(STORAGE_BUCKET).remove(paths);

  const { error } = await supabase.from("site_visits").delete().eq("id", visitId).eq("project_id", projectId);
  if (error) redirect(`${path}?fehler=${encodeURIComponent("Löschen fehlgeschlagen: " + error.message)}`);

  revalidatePath(`/projekte/${projectId}`, "layout");
  redirect(`${path}?ok=${encodeURIComponent("Ortstermin gelöscht.")}`);
}
