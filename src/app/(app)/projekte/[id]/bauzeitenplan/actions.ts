"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProject } from "@/lib/auth";

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function back(projectId: string, key: "ok" | "fehler", msg: string): never {
  redirect(`/projekte/${projectId}/bauzeitenplan?${key}=${encodeURIComponent(msg)}`);
}

export async function saveScheduleItem(projectId: string, formData: FormData) {
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) back(projectId, "fehler", "Keine Berechtigung.");

  const title = str(formData.get("title"));
  const start = str(formData.get("start_date"));
  const end = str(formData.get("end_date")) ?? start;
  if (!title) back(projectId, "fehler", "Bitte eine Bezeichnung angeben.");
  if (!start || !end) back(projectId, "fehler", "Bitte Beginn und Ende angeben.");
  if (end < start) back(projectId, "fehler", "Das Ende liegt vor dem Beginn.");

  const status = String(formData.get("status") ?? "geplant");
  const fields = {
    title,
    trade: str(formData.get("trade")),
    assignee_id: str(formData.get("assignee_id")),
    start_date: start,
    end_date: end,
    status: ["geplant", "laeuft", "erledigt"].includes(status) ? status : "geplant",
    note: str(formData.get("note")),
  };

  const itemId = str(formData.get("item_id"));
  const { error } = itemId
    ? await supabase.from("schedule_items").update(fields).eq("id", itemId).eq("project_id", projectId)
    : await supabase.from("schedule_items").insert({ ...fields, project_id: projectId });

  if (error) back(projectId, "fehler", "Speichern fehlgeschlagen: " + error.message);

  revalidatePath(`/projekte/${projectId}`, "layout");
  back(projectId, "ok", itemId ? "Vorgang aktualisiert." : "Vorgang angelegt.");
}

export async function deleteScheduleItem(projectId: string, formData: FormData) {
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) back(projectId, "fehler", "Keine Berechtigung.");

  const itemId = str(formData.get("item_id"));
  if (!itemId) back(projectId, "fehler", "Vorgang nicht gefunden.");

  const { error } = await supabase.from("schedule_items").delete().eq("id", itemId).eq("project_id", projectId);
  if (error) back(projectId, "fehler", "Löschen fehlgeschlagen: " + error.message);

  revalidatePath(`/projekte/${projectId}`, "layout");
  back(projectId, "ok", "Vorgang gelöscht.");
}

export async function confirmScheduleItem(projectId: string, formData: FormData) {
  const { supabase } = await requireProject(projectId);
  const itemId = str(formData.get("item_id"));
  if (!itemId) back(projectId, "fehler", "Vorgang nicht gefunden.");

  const { error } = await supabase.rpc("confirm_schedule_item", { p_item: itemId });
  if (error) back(projectId, "fehler", error.message);

  revalidatePath(`/projekte/${projectId}`, "layout");
  back(projectId, "ok", "Termin bestätigt.");
}
