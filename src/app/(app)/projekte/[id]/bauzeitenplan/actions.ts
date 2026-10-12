"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProject } from "@/lib/auth";

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function back(projectId: string, key: "ok" | "fehler", msg: string, itemId?: string | null): never {
  const view = "";
  const anchor = itemId ? `&offen=${itemId}#v-${itemId}` : "";
  redirect(`/projekte/${projectId}/bauzeitenplan?${key}=${encodeURIComponent(msg)}${view}${anchor}`);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
  const buffer = Math.max(0, Math.min(365, parseInt(String(formData.get("buffer_days") ?? "0"), 10) || 0));
  const fields = {
    title,
    trade: str(formData.get("trade")),
    assignee_id: str(formData.get("assignee_id")),
    start_date: start,
    end_date: end,
    status: ["geplant", "laeuft", "erledigt"].includes(status) ? status : "geplant",
    note: str(formData.get("note")),
    buffer_days: buffer,
  };

  const itemId = str(formData.get("item_id"));
  const { error } = itemId
    ? await supabase.from("schedule_items").update(fields).eq("id", itemId).eq("project_id", projectId)
    : await supabase.from("schedule_items").insert({ ...fields, project_id: projectId });

  if (error) back(projectId, "fehler", "Speichern fehlgeschlagen: " + error.message, itemId);

  revalidatePath(`/projekte/${projectId}`, "layout");
  back(projectId, "ok", itemId ? "Vorgang aktualisiert." : "Vorgang angelegt.", itemId);
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
  if (error) back(projectId, "fehler", error.message, itemId);

  revalidatePath(`/projekte/${projectId}`, "layout");
  back(projectId, "ok", "Termin bestätigt.", itemId);
}

/** Notiz eines beliebigen Beteiligten zu einem Vorgang */
export async function commentScheduleItem(projectId: string, formData: FormData) {
  const { supabase, user } = await requireProject(projectId);
  const itemId = str(formData.get("item_id"));
  const body = str(formData.get("body"));
  if (!itemId || !body) back(projectId, "fehler", "Die Notiz ist leer.", itemId);

  const { error } = await supabase.from("schedule_comments").insert({
    item_id: itemId,
    project_id: projectId,
    author_id: user.id,
    body,
    is_problem: formData.get("is_problem") === "on",
  });

  if (error) back(projectId, "fehler", "Notiz fehlgeschlagen: " + error.message, itemId);
  revalidatePath(`/projekte/${projectId}`, "layout");
  back(projectId, "ok", "Notiz gespeichert.", itemId);
}

export type ImportItem = { title: string; trade: string | null; start_date: string; end_date: string };

/** Excel-Import: übernimmt die geprüften Zeilen aus der Vorschau */
export async function importSchedule(
  projectId: string,
  items: ImportItem[],
  replace: boolean,
): Promise<{ error?: string; count?: number }> {
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) return { error: "Keine Berechtigung." };
  if (!Array.isArray(items) || items.length === 0) return { error: "Keine Vorgänge zum Importieren." };
  if (items.length > 500) return { error: "Zu viele Zeilen (max. 500)." };

  const rows = [];
  for (const [i, it] of items.entries()) {
    const title = String(it.title ?? "").trim().slice(0, 200);
    if (!title || !ISO_DATE.test(it.start_date) || !ISO_DATE.test(it.end_date) || it.end_date < it.start_date) {
      return { error: `Ungültige Zeile ${i + 1}: ${title || "(ohne Titel)"}` };
    }
    rows.push({
      project_id: projectId,
      title,
      trade: it.trade ? String(it.trade).trim().slice(0, 100) : null,
      start_date: it.start_date,
      end_date: it.end_date,
      sort_order: i,
    });
  }

  if (replace) {
    const { error: delErr } = await supabase.from("schedule_items").delete().eq("project_id", projectId);
    if (delErr) return { error: "Vorhandene Vorgänge konnten nicht entfernt werden: " + delErr.message };
  }

  const { error } = await supabase.from("schedule_items").insert(rows);
  if (error) return { error: "Import fehlgeschlagen: " + error.message };

  revalidatePath(`/projekte/${projectId}`, "layout");
  return { count: rows.length };
}
