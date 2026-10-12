"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

export async function createProject(formData: FormData) {
  const { supabase, profile } = await requireUser();
  if (!profile.is_admin) redirect("/projekte?fehler=" + encodeURIComponent("Keine Berechtigung."));

  const name = str(formData.get("name"));
  if (!name) redirect("/projekte?fehler=" + encodeURIComponent("Bitte eine Bezeichnung angeben."));

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name,
      number: str(formData.get("number")),
      street: str(formData.get("street")),
      zip_city: str(formData.get("zip_city")),
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect("/projekte?fehler=" + encodeURIComponent("Projekt konnte nicht angelegt werden: " + (error?.message ?? "")));
  }

  revalidatePath("/projekte");
  redirect(`/projekte/${data.id}/stammdaten`);
}
