"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProject } from "@/lib/auth";

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function back(projectId: string, key: "ok" | "fehler", msg: string, topicId?: string | null): never {
  const anchor = topicId ? `&offen=${topicId}#t-${topicId}` : "";
  redirect(`/projekte/${projectId}/themen?${key}=${encodeURIComponent(msg)}${anchor}`);
}

export async function createTopic(projectId: string, formData: FormData) {
  const { supabase, user } = await requireProject(projectId);
  const title = str(formData.get("title"));
  if (!title) back(projectId, "fehler", "Bitte einen Titel angeben.");

  const { data, error } = await supabase
    .from("topics")
    .insert({
      project_id: projectId,
      title,
      description: str(formData.get("description")),
      trade: str(formData.get("trade")),
      responsible_id: str(formData.get("responsible_id")),
      due_date: str(formData.get("due_date")),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) back(projectId, "fehler", "Anlegen fehlgeschlagen: " + (error?.message ?? ""));
  revalidatePath(`/projekte/${projectId}`, "layout");
  back(projectId, "ok", "Thema angelegt.", data.id);
}

export async function updateTopic(projectId: string, formData: FormData) {
  const { supabase } = await requireProject(projectId);
  const topicId = str(formData.get("topic_id"));
  const title = str(formData.get("title"));
  if (!topicId || !title) back(projectId, "fehler", "Ungültige Eingabe.", topicId);

  const { data, error } = await supabase
    .from("topics")
    .update({
      title,
      description: str(formData.get("description")),
      trade: str(formData.get("trade")),
      responsible_id: str(formData.get("responsible_id")),
      due_date: str(formData.get("due_date")),
    })
    .eq("id", topicId)
    .eq("project_id", projectId)
    .select("id");

  if (error) back(projectId, "fehler", "Speichern fehlgeschlagen: " + error.message, topicId);
  if (!data?.length) back(projectId, "fehler", "Nur der Ersteller oder die Bauleitung kann das Thema ändern.", topicId);
  revalidatePath(`/projekte/${projectId}`, "layout");
  back(projectId, "ok", "Thema gespeichert.", topicId);
}

export async function decideTopic(projectId: string, formData: FormData) {
  const { supabase, canManage } = await requireProject(projectId);
  const topicId = str(formData.get("topic_id"));
  if (!topicId) back(projectId, "fehler", "Ungültige Eingabe.");
  if (!canManage) back(projectId, "fehler", "Nur Bauleitung oder Baubegleitung können festlegen.", topicId);

  const status = String(formData.get("status") ?? "offen");
  const decision = str(formData.get("decision"));
  if (!["offen", "in_klaerung", "festgelegt", "erledigt"].includes(status)) back(projectId, "fehler", "Ungültiger Status.", topicId);
  if (status === "festgelegt" && !decision) back(projectId, "fehler", "Bitte die Festlegung beschreiben.", topicId);

  const { error } = await supabase
    .from("topics")
    .update({ status, decision })
    .eq("id", topicId)
    .eq("project_id", projectId);

  if (error) back(projectId, "fehler", error.message, topicId);
  revalidatePath(`/projekte/${projectId}`, "layout");
  back(projectId, "ok", "Status gespeichert.", topicId);
}

export async function commentTopic(projectId: string, formData: FormData) {
  const { supabase, user } = await requireProject(projectId);
  const topicId = str(formData.get("topic_id"));
  const body = str(formData.get("body"));
  if (!topicId || !body) back(projectId, "fehler", "Der Kommentar ist leer.", topicId);

  const { error } = await supabase.from("topic_comments").insert({
    topic_id: topicId,
    project_id: projectId,
    author_id: user.id,
    body,
  });

  if (error) back(projectId, "fehler", "Kommentar fehlgeschlagen: " + error.message, topicId);
  revalidatePath(`/projekte/${projectId}/themen`);
  back(projectId, "ok", "Kommentar gespeichert.", topicId);
}

export async function deleteTopic(projectId: string, formData: FormData) {
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) back(projectId, "fehler", "Keine Berechtigung.");
  const topicId = str(formData.get("topic_id"));
  const { error } = await supabase.from("topics").delete().eq("id", topicId ?? "").eq("project_id", projectId);
  if (error) back(projectId, "fehler", "Löschen fehlgeschlagen: " + error.message);
  revalidatePath(`/projekte/${projectId}`, "layout");
  back(projectId, "ok", "Thema gelöscht.");
}
