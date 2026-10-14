"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProject } from "@/lib/auth";

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function back(projectId: string, key: "ok" | "fehler", msg: string, anchor?: string): never {
  redirect(
    `/projekte/${projectId}/themen?${key}=${encodeURIComponent(msg)}${anchor ? `&offen=${anchor}#${anchor}` : ""}`,
  );
}

const done = (projectId: string) => revalidatePath(`/projekte/${projectId}`, "layout");

// ---------------------------------------------------------------------
// Themen & Festlegungen (einfaches Textfeld)
// ---------------------------------------------------------------------
export async function postTopic(projectId: string, formData: FormData) {
  const { supabase, user } = await requireProject(projectId);
  const text = str(formData.get("text"));
  if (!text) back(projectId, "fehler", "Bitte etwas eingeben.");

  const [first, ...rest] = text.split("\n");
  const title = first.trim().slice(0, 200) || "Thema";
  const description = (first.length > 200 ? first.slice(200) + "\n" : "") + rest.join("\n");

  const { data, error } = await supabase
    .from("topics")
    .insert({ project_id: projectId, title, description: description.trim() || null, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) back(projectId, "fehler", "Speichern fehlgeschlagen: " + (error?.message ?? ""));
  done(projectId);
  back(projectId, "ok", "Thema eingetragen.", `t-${data.id}`);
}

export async function replyTopic(projectId: string, formData: FormData) {
  const { supabase, user } = await requireProject(projectId);
  const topicId = str(formData.get("topic_id"));
  const body = str(formData.get("body"));
  if (!topicId || !body) back(projectId, "fehler", "Die Antwort ist leer.", topicId ? `t-${topicId}` : undefined);

  const { error } = await supabase
    .from("topic_comments")
    .insert({ topic_id: topicId, project_id: projectId, author_id: user.id, body });
  if (error) back(projectId, "fehler", "Antwort fehlgeschlagen: " + error.message, `t-${topicId}`);
  done(projectId);
  back(projectId, "ok", "Antwort gespeichert.", `t-${topicId}`);
}

/** Festlegung treffen oder Thema schließen/wieder öffnen (Bauleitung/Baubegleitung) */
export async function decideTopic(projectId: string, formData: FormData) {
  const { supabase, canManage } = await requireProject(projectId);
  const topicId = str(formData.get("topic_id"));
  if (!canManage) back(projectId, "fehler", "Nur Bauleitung oder Baubegleitung.", topicId ? `t-${topicId}` : undefined);

  const action = String(formData.get("action") ?? "");
  const decision = str(formData.get("decision"));
  let update: { status: string; decision: string | null };
  if (action === "festlegen") {
    if (!decision) back(projectId, "fehler", "Bitte die Festlegung eintragen.", `t-${topicId}`);
    update = { status: "festgelegt", decision };
  } else if (action === "erledigt") {
    update = { status: "erledigt", decision };
  } else {
    update = { status: "offen", decision: null };
  }

  const { error } = await supabase.from("topics").update(update).eq("id", topicId ?? "").eq("project_id", projectId);
  if (error) back(projectId, "fehler", error.message, `t-${topicId}`);
  done(projectId);
  back(projectId, "ok", "Gespeichert.", `t-${topicId}`);
}

export async function deleteTopic(projectId: string, formData: FormData) {
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) back(projectId, "fehler", "Keine Berechtigung.");
  const topicId = str(formData.get("topic_id"));
  const { error } = await supabase.from("topics").delete().eq("id", topicId ?? "").eq("project_id", projectId);
  if (error) back(projectId, "fehler", "Löschen fehlgeschlagen: " + error.message);
  done(projectId);
  back(projectId, "ok", "Thema gelöscht.");
}
