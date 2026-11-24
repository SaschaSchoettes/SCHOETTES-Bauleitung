"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProject } from "@/lib/auth";
import { STORAGE_BUCKET, TRADE_FOLDERS } from "@/lib/types";

function str(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

const enc = encodeURIComponent;

export type FileMeta = {
  kind: string; // "plan" | "dokument" | "protokoll"
  title: string;
  plan_number?: string;
  plan_index?: string;
  plan_date?: string;
  doc_date?: string;
  intern?: boolean;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  folder_id?: string;
};

/** Nach dem Upload in den Speicher: Datensatz anlegen. */
export async function registerFile(projectId: string, meta: FileMeta): Promise<{ error?: string }> {
  const { supabase, user, canManage } = await requireProject(projectId);
  const cleanup = () => supabase.storage.from(STORAGE_BUCKET).remove([meta.storage_path]);

  if (!meta.storage_path.startsWith(projectId + "/")) return { error: "Ungültiger Speicherpfad." };

  const isProtocol = meta.kind === "protokoll";
  const planNumber = str(meta.plan_number);
  const kind = isProtocol ? "protokoll" : meta.kind === "plan" || planNumber ? "plan" : "dokument";
  const folderId = isProtocol ? null : str(meta.folder_id);

  if (isProtocol && !canManage) {
    await cleanup();
    return { error: "Protokolle können nur von der Bauleitung abgelegt werden." };
  }
  if (!isProtocol) {
    const { data: allowed } = await supabase.rpc("can_upload_to", { p_project: projectId, p_folder: folderId });
    if (!allowed) {
      await cleanup();
      return { error: "Sie haben für diesen Ordner keine Berechtigung zum Hochladen." };
    }
  }

  const { error } = await supabase.from("project_files").insert({
    project_id: projectId,
    kind,
    folder_id: folderId,
    uploaded_by: user.id,
    title: str(meta.title) ?? meta.file_name.replace(/\.[^.]+$/, ""),
    plan_number: kind === "plan" ? planNumber : null,
    plan_index: kind === "plan" ? str(meta.plan_index) : null,
    plan_date: kind === "plan" ? str(meta.plan_date) : null,
    doc_date: kind === "plan" ? null : str(meta.doc_date),
    visibility: canManage && meta.intern ? "intern" : "alle",
    visible_to: null,
    storage_path: meta.storage_path,
    file_name: meta.file_name,
    mime_type: str(meta.mime_type),
    size_bytes: Number.isFinite(meta.size_bytes) ? meta.size_bytes : null,
  });

  if (error) {
    await cleanup();
    return { error: "Speichern fehlgeschlagen: " + error.message };
  }

  revalidatePath(`/projekte/${projectId}`, "layout");
  return {};
}

function backTo(projectId: string, formData: FormData) {
  const tab = formData.get("return") === "protokolle" ? "protokolle" : "dokumente";
  const folder = str(formData.get("ordner"));
  return `/projekte/${projectId}/${tab}${folder ? `?ordner=${folder}&` : "?"}`;
}

export async function deleteFile(projectId: string, formData: FormData) {
  const path = backTo(projectId, formData);
  const { supabase, user, canManage } = await requireProject(projectId);

  const fileId = str(formData.get("file_id"));
  const { data: file } = await supabase
    .from("project_files")
    .select("id, storage_path, uploaded_by")
    .eq("id", fileId ?? "")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!file) redirect(`${path}fehler=${enc("Datei nicht gefunden.")}`);
  if (!canManage && file.uploaded_by !== user.id) {
    redirect(`${path}fehler=${enc("Sie können nur eigene Uploads löschen.")}`);
  }

  const { error } = await supabase.from("project_files").delete().eq("id", file.id);
  if (error) redirect(`${path}fehler=${enc("Löschen fehlgeschlagen: " + error.message)}`);
  await supabase.storage.from(STORAGE_BUCKET).remove([file.storage_path]);

  revalidatePath(`/projekte/${projectId}`, "layout");
  redirect(`${path}ok=${enc("Datei gelöscht.")}`);
}

export async function updateFile(projectId: string, formData: FormData) {
  const path = backTo(projectId, formData);
  const { supabase, canManage } = await requireProject(projectId);

  const fileId = str(formData.get("file_id"));
  const title = str(formData.get("title"));
  const target = str(formData.get("target"));
  if (!fileId || !title) redirect(`${path}fehler=${enc("Bitte einen Namen angeben.")}`);

  const patch: Record<string, unknown> = { title: title.slice(0, 200), folder_id: target };
  if (canManage) patch.visibility = formData.get("intern") === "on" ? "intern" : "alle";

  const { data: changed, error } = await supabase
    .from("project_files")
    .update(patch)
    .eq("id", fileId)
    .eq("project_id", projectId)
    .in("kind", ["plan", "dokument"])
    .select("id");
  if (error) {
    const msg = error.message.includes("row-level security")
      ? "Im Zielordner haben Sie keine Berechtigung zum Hochladen."
      : error.message;
    redirect(`${path}fehler=${enc("Ändern fehlgeschlagen: " + msg)}`);
  }
  if (!changed?.length) redirect(`${path}fehler=${enc("Sie können nur eigene Uploads ändern.")}`);

  revalidatePath(`/projekte/${projectId}/dokumente`);
  redirect(`${path}ok=${enc("Datei gespeichert.")}`);
}

// ---------------------------------------------------------------------
// Ordner
// ---------------------------------------------------------------------

export async function createFolder(projectId: string, formData: FormData) {
  const path = backTo(projectId, formData);
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) redirect(`${path}fehler=${enc("Keine Berechtigung.")}`);

  const name = str(formData.get("name"));
  const parent = str(formData.get("ordner"));
  if (!name) redirect(`${path}fehler=${enc("Bitte einen Ordnernamen angeben.")}`);

  const { data: created, error } = await supabase
    .from("doc_folders")
    .insert({ project_id: projectId, parent_id: parent, name: name.slice(0, 100) })
    .select("id")
    .single();
  if (error || !created) redirect(`${path}fehler=${enc("Ordner fehlgeschlagen: " + (error?.message ?? ""))}`);
  revalidatePath(`/projekte/${projectId}/dokumente`);
  const hint = parent
    ? `Ordner „${name}“ angelegt. Er übernimmt die Freigaben des übergeordneten Ordners.`
    : `Ordner „${name}“ angelegt – jetzt festlegen, wer ihn sehen darf.`;
  redirect(`/projekte/${projectId}/dokumente?ordner=${created.id}&freigabe=1&ok=${enc(hint)}`);
}

export async function renameFolder(projectId: string, formData: FormData) {
  const path = backTo(projectId, formData);
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) redirect(`${path}fehler=${enc("Keine Berechtigung.")}`);
  const folderId = str(formData.get("folder_id"));
  const name = str(formData.get("name"));
  if (!folderId || !name) redirect(`${path}fehler=${enc("Ungültige Eingabe.")}`);

  const { error } = await supabase
    .from("doc_folders")
    .update({ name: name.slice(0, 100) })
    .eq("id", folderId)
    .eq("project_id", projectId);
  if (error) redirect(`${path}fehler=${enc(error.message)}`);
  revalidatePath(`/projekte/${projectId}/dokumente`);
  redirect(`${path}ok=${enc("Ordner umbenannt.")}`);
}

export async function deleteFolder(projectId: string, formData: FormData) {
  const { supabase, canManage } = await requireProject(projectId);
  const folderId = str(formData.get("folder_id"));
  const parent = str(formData.get("parent_id"));
  const path = `/projekte/${projectId}/dokumente${parent ? `?ordner=${parent}&` : "?"}`;
  if (!canManage) redirect(`${path}fehler=${enc("Keine Berechtigung.")}`);

  const [{ count: sub }, { count: files }] = await Promise.all([
    supabase.from("doc_folders").select("id", { count: "exact", head: true }).eq("parent_id", folderId ?? ""),
    supabase.from("project_files").select("id", { count: "exact", head: true }).eq("folder_id", folderId ?? ""),
  ]);
  if (sub || files) redirect(`${path}fehler=${enc("Der Ordner ist nicht leer.")}`);

  const { error } = await supabase.from("doc_folders").delete().eq("id", folderId ?? "").eq("project_id", projectId);
  if (error) redirect(`${path}fehler=${enc(error.message)}`);
  revalidatePath(`/projekte/${projectId}/dokumente`);
  redirect(`${path}ok=${enc("Ordner gelöscht.")}`);
}

export async function insertTradeFolders(projectId: string) {
  const path = `/projekte/${projectId}/dokumente?`;
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) redirect(`${path}fehler=${enc("Keine Berechtigung.")}`);

  const { data: root, error } = await supabase
    .from("doc_folders")
    .insert({ project_id: projectId, parent_id: null, name: "Gewerke" })
    .select("id")
    .single();
  if (error || !root) redirect(`${path}fehler=${enc("Vorlage fehlgeschlagen: " + (error?.message ?? ""))}`);

  await supabase
    .from("doc_folders")
    .insert(TRADE_FOLDERS.map((name) => ({ project_id: projectId, parent_id: root.id, name })));
  await supabase.from("doc_folders").insert([
    { project_id: projectId, parent_id: null, name: "Pläne", share_all: true },
    { project_id: projectId, parent_id: null, name: "Allgemein" },
  ]);

  revalidatePath(`/projekte/${projectId}/dokumente`);
  redirect(
    `${path}ok=${enc("Ordner angelegt: Gewerke (mit Unterordnern), Pläne (für alle), Allgemein. Freigaben je Ordner festlegen.")}`,
  );
}

/** Freigaben eines Ordners speichern (ersetzt die bisherigen eigenen Freigaben). */
export async function saveShares(projectId: string, formData: FormData) {
  const folderId = str(formData.get("folder_id"));
  const path = `/projekte/${projectId}/dokumente?ordner=${folderId ?? ""}&`;
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage || !folderId) redirect(`${path}fehler=${enc("Keine Berechtigung.")}`);

  const { data: folder } = await supabase
    .from("doc_folders")
    .select("id")
    .eq("id", folderId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!folder) redirect(`${path}fehler=${enc("Ordner nicht gefunden.")}`);

  const { data: members } = await supabase
    .from("project_members")
    .select("user_id, role")
    .eq("project_id", projectId);
  const external = ((members ?? []) as { user_id: string; role: string }[]).filter((m) => !["bauleitung", "baubegleitung", "berater"].includes(m.role));

  const rows = external
    .filter((m) => formData.get(`zugriff_${m.user_id}`) === "on" || formData.get(`upload_${m.user_id}`) === "on")
    .map((m) => ({ folder_id: folderId, user_id: m.user_id, can_upload: formData.get(`upload_${m.user_id}`) === "on" }));

  const { error: e1 } = await supabase
    .from("doc_folders")
    .update({ share_all: formData.get("share_all") === "on" })
    .eq("id", folderId);
  const { error: e2 } = await supabase.from("folder_shares").delete().eq("folder_id", folderId);
  const { error: e3 } = rows.length ? await supabase.from("folder_shares").insert(rows) : { error: null };
  const err = e1 ?? e2 ?? e3;
  if (err) redirect(`${path}fehler=${enc("Freigabe fehlgeschlagen: " + err.message)}`);

  revalidatePath(`/projekte/${projectId}/dokumente`);
  redirect(`${path}ok=${enc("Freigabe gespeichert.")}`);
}
