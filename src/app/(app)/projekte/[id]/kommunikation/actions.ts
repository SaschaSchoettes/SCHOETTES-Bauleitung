"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProject } from "@/lib/auth";

export async function sendMessage(projectId: string, formData: FormData) {
  const { supabase, user, canManage } = await requireProject(projectId);

  const kanal = String(formData.get("kanal") ?? "projekt");
  const body = String(formData.get("body") ?? "").trim();
  const back = (extra = "") =>
    `/projekte/${projectId}/kommunikation?kanal=${encodeURIComponent(kanal)}${extra}`;

  if (!body) redirect(back("&fehler=" + encodeURIComponent("Die Nachricht ist leer.")));
  if (body.length > 5000) redirect(back("&fehler=" + encodeURIComponent("Die Nachricht ist zu lang (max. 5000 Zeichen).")));

  let threadUserId: string | null = null;
  if (kanal !== "projekt") {
    // Nicht-Pflegende dürfen nur in ihren eigenen Kanal schreiben (RLS prüft zusätzlich)
    threadUserId = canManage ? kanal : user.id;
  }

  const { error } = await supabase.from("messages").insert({
    project_id: projectId,
    thread_user_id: threadUserId,
    author_id: user.id,
    body,
  });

  if (error) redirect(back("&fehler=" + encodeURIComponent("Senden fehlgeschlagen: " + error.message)));

  revalidatePath(`/projekte/${projectId}`, "layout");
  redirect(back());
}
