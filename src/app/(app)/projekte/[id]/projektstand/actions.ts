"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProject } from "@/lib/auth";
import { STEP_TEMPLATE, type ProjectStep } from "@/lib/types";

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function back(projectId: string, key: "ok" | "fehler", msg: string, anchor?: string): never {
  redirect(
    `/projekte/${projectId}/projektstand?${key}=${encodeURIComponent(msg)}${anchor ? `&offen=${anchor}#${anchor}` : ""}`,
  );
}

const done = (projectId: string) => revalidatePath(`/projekte/${projectId}`, "layout");

// ---------------------------------------------------------------------
// Schritte
// ---------------------------------------------------------------------
export async function saveStep(projectId: string, formData: FormData) {
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) back(projectId, "fehler", "Keine Berechtigung.");

  const title = str(formData.get("title"));
  if (!title) back(projectId, "fehler", "Bitte den Schritt benennen.");
  const status = String(formData.get("status") ?? "offen");
  const fields = {
    title,
    ball_at: str(formData.get("ball_at")),
    note: str(formData.get("note")),
    status: ["offen", "aktuell", "erledigt"].includes(status) ? status : "offen",
  };

  const stepId = str(formData.get("step_id"));
  if (stepId) {
    const { error } = await supabase.from("project_steps").update(fields).eq("id", stepId).eq("project_id", projectId);
    if (error) back(projectId, "fehler", "Speichern fehlgeschlagen: " + error.message, `s-${stepId}`);
    done(projectId);
    back(projectId, "ok", "Schritt gespeichert.", `s-${stepId}`);
  }

  const { data: last } = await supabase
    .from("project_steps")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1);
  const position = (((last ?? []) as { position: number }[])[0]?.position ?? -1) + 1;

  const { error } = await supabase.from("project_steps").insert({ ...fields, project_id: projectId, position });
  if (error) back(projectId, "fehler", "Anlegen fehlgeschlagen: " + error.message);
  done(projectId);
  back(projectId, "ok", "Schritt angelegt.");
}

/** Schnell-Status per Klick: offen → aktuell → erledigt */
export async function setStepStatus(projectId: string, formData: FormData) {
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) back(projectId, "fehler", "Keine Berechtigung.");
  const stepId = str(formData.get("step_id"));
  const status = String(formData.get("status") ?? "");
  if (!stepId || !["offen", "aktuell", "erledigt"].includes(status)) back(projectId, "fehler", "Ungültige Eingabe.");

  const { error } = await supabase.from("project_steps").update({ status }).eq("id", stepId).eq("project_id", projectId);
  if (error) back(projectId, "fehler", error.message);
  done(projectId);
  back(projectId, "ok", "Status geändert.", `s-${stepId}`);
}

export async function moveStep(projectId: string, formData: FormData) {
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) back(projectId, "fehler", "Keine Berechtigung.");
  const stepId = str(formData.get("step_id"));
  const dir = formData.get("dir") === "up" ? -1 : 1;

  const { data } = await supabase
    .from("project_steps")
    .select("id, position")
    .eq("project_id", projectId)
    .order("position")
    .order("created_at");
  const list = ((data ?? []) as Pick<ProjectStep, "id" | "position">[]).map((s, i) => ({ ...s, position: i }));
  const i = list.findIndex((s) => s.id === stepId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) back(projectId, "ok", "Reihenfolge unverändert.");

  [list[i], list[j]] = [list[j], list[i]];
  for (const [pos, s] of list.entries()) {
    await supabase.from("project_steps").update({ position: pos }).eq("id", s.id).eq("project_id", projectId);
  }
  done(projectId);
  back(projectId, "ok", "Reihenfolge geändert.", `s-${stepId}`);
}

export async function deleteStep(projectId: string, formData: FormData) {
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) back(projectId, "fehler", "Keine Berechtigung.");
  const stepId = str(formData.get("step_id"));
  const { error } = await supabase.from("project_steps").delete().eq("id", stepId ?? "").eq("project_id", projectId);
  if (error) back(projectId, "fehler", "Löschen fehlgeschlagen: " + error.message);
  done(projectId);
  back(projectId, "ok", "Schritt gelöscht.");
}

export async function insertTemplate(projectId: string) {
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) back(projectId, "fehler", "Keine Berechtigung.");
  const { count } = await supabase
    .from("project_steps")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (count) back(projectId, "fehler", "Die Vorlage kann nur in ein leeres Projekt eingefügt werden.");

  const { error } = await supabase
    .from("project_steps")
    .insert(STEP_TEMPLATE.map((s, i) => ({ ...s, project_id: projectId, position: i })));
  if (error) back(projectId, "fehler", "Vorlage fehlgeschlagen: " + error.message);
  done(projectId);
  back(projectId, "ok", "Vorlage eingefügt – Schritte anpassen, löschen oder ergänzen.");
}

export async function commentStep(projectId: string, formData: FormData) {
  const { supabase, user } = await requireProject(projectId);
  const stepId = str(formData.get("step_id"));
  const body = str(formData.get("body"));
  if (!stepId || !body) back(projectId, "fehler", "Die Notiz ist leer.", stepId ? `s-${stepId}` : undefined);

  const { error } = await supabase
    .from("step_comments")
    .insert({ step_id: stepId, project_id: projectId, author_id: user.id, body });
  if (error) back(projectId, "fehler", "Notiz fehlgeschlagen: " + error.message, `s-${stepId}`);
  done(projectId);
  back(projectId, "ok", "Notiz gespeichert.", `s-${stepId}`);
}
