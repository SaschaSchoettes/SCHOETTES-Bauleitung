"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomInt } from "crypto";
import { requireProject } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLES, type Role } from "@/lib/types";

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function back(path: string, key: "ok" | "fehler", msg: string): never {
  redirect(`${path}?${key}=${encodeURIComponent(msg)}`);
}

/** Lesbares Startpasswort ohne verwechselbare Zeichen (0/O, 1/l/I). */
function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += chars[randomInt(chars.length)];
  return out.slice(0, 4) + "-" + out.slice(4, 8) + "-" + out.slice(8);
}

// ---------------------------------------------------------------------
// Stammdaten
// ---------------------------------------------------------------------
export async function updateProject(projectId: string, formData: FormData) {
  const path = `/projekte/${projectId}/stammdaten`;
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) back(path, "fehler", "Keine Berechtigung.");

  const name = str(formData.get("name"));
  if (!name) back(path, "fehler", "Die Bezeichnung darf nicht leer sein.");

  const status = String(formData.get("status") ?? "aktiv");

  const { error } = await supabase
    .from("projects")
    .update({
      number: str(formData.get("number")),
      name,
      street: str(formData.get("street")),
      zip_city: str(formData.get("zip_city")),
      client_name: str(formData.get("client_name")),
      measure: str(formData.get("measure")),
      start_date: str(formData.get("start_date")),
      end_date: str(formData.get("end_date")),
      status: ["aktiv", "ruhend", "abgeschlossen"].includes(status) ? status : "aktiv",
      notes: str(formData.get("notes")),
      billing_name: str(formData.get("billing_name")),
      billing_street: str(formData.get("billing_street")),
      billing_zip_city: str(formData.get("billing_zip_city")),
      billing_email: str(formData.get("billing_email")),
      billing_note: str(formData.get("billing_note")),
    })
    .eq("id", projectId);

  if (error) back(path, "fehler", "Speichern fehlgeschlagen: " + error.message);

  revalidatePath(`/projekte/${projectId}`, "layout");
  back(path, "ok", "Gespeichert.");
}

// ---------------------------------------------------------------------
// Kontakte
// ---------------------------------------------------------------------
function contactFields(formData: FormData) {
  return {
    name: str(formData.get("name")),
    company: str(formData.get("company")),
    trade: str(formData.get("trade")),
    function: str(formData.get("function")),
    phone: str(formData.get("phone")),
    mobile: str(formData.get("mobile")),
    email: str(formData.get("email"))?.toLowerCase() ?? null,
    note: str(formData.get("note")),
  };
}

export async function saveContact(projectId: string, formData: FormData) {
  const path = `/projekte/${projectId}/kontakte`;
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) back(path, "fehler", "Keine Berechtigung.");

  const fields = contactFields(formData);
  if (!fields.name) back(path, "fehler", "Bitte einen Namen angeben.");

  const contactId = str(formData.get("contact_id"));
  const { error } = contactId
    ? await supabase.from("project_contacts").update(fields).eq("id", contactId).eq("project_id", projectId)
    : await supabase.from("project_contacts").insert({ ...fields, project_id: projectId });

  if (error) back(path, "fehler", "Speichern fehlgeschlagen: " + error.message);

  revalidatePath(path);
  back(path, "ok", contactId ? "Kontakt aktualisiert." : "Kontakt angelegt.");
}

export async function deleteContact(projectId: string, formData: FormData) {
  const path = `/projekte/${projectId}/kontakte`;
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) back(path, "fehler", "Keine Berechtigung.");

  const contactId = str(formData.get("contact_id"));
  if (!contactId) back(path, "fehler", "Kontakt nicht gefunden.");

  const { error } = await supabase
    .from("project_contacts")
    .delete()
    .eq("id", contactId)
    .eq("project_id", projectId);

  if (error) back(path, "fehler", "Löschen fehlgeschlagen: " + error.message);

  revalidatePath(path);
  back(path, "ok", "Kontakt gelöscht.");
}

// ---------------------------------------------------------------------
// Zugänge (Login + Rolle im Projekt)
// ---------------------------------------------------------------------
export type AccessState = {
  error?: string;
  ok?: string;
  credentials?: { email: string; password: string; name: string };
};

export async function addAccess(
  projectId: string,
  _prev: AccessState,
  formData: FormData,
): Promise<AccessState> {
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) return { error: "Keine Berechtigung." };

  const email = str(formData.get("email"))?.toLowerCase() ?? null;
  const fullName = str(formData.get("full_name"));
  const company = str(formData.get("company"));
  const phone = str(formData.get("phone"));
  const trade = str(formData.get("trade"));
  const role = String(formData.get("role") ?? "gewerk") as Role;
  const alsoContact = formData.get("also_contact") === "on";

  if (!email || !email.includes("@")) return { error: "Bitte eine gültige E-Mail-Adresse angeben." };
  if (!fullName) return { error: "Bitte einen Namen angeben." };
  if (!ROLES.includes(role)) return { error: "Ungültige Rolle." };

  const admin = createAdminClient();

  // Gibt es den Nutzer schon (z. B. aus einem anderen Projekt)?
  const { data: existing } = await admin
    .from("profiles")
    .select("id, full_name")
    .eq("email", email)
    .maybeSingle();

  let userId: string;
  let newPassword: string | null = null;

  if (existing) {
    userId = existing.id;
  } else {
    newPassword = generatePassword();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: newPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName, company, phone },
    });
    if (createError || !created.user) {
      return { error: "Zugang konnte nicht angelegt werden: " + (createError?.message ?? "unbekannter Fehler") };
    }
    userId = created.user.id;
  }

  // Zuordnung zum Projekt (über den Nutzer-Client → RLS prüft die Berechtigung erneut)
  const { error: memberError } = await supabase
    .from("project_members")
    .upsert({ project_id: projectId, user_id: userId, role, trade }, { onConflict: "project_id,user_id" });

  if (memberError) return { error: "Zuordnung fehlgeschlagen: " + memberError.message };

  if (alsoContact) {
    const { data: dup } = await supabase
      .from("project_contacts")
      .select("id")
      .eq("project_id", projectId)
      .eq("email", email)
      .maybeSingle();
    if (!dup) {
      await supabase.from("project_contacts").insert({
        project_id: projectId,
        name: fullName,
        company,
        trade,
        phone,
        email,
      });
    }
  }

  revalidatePath(`/projekte/${projectId}`, "layout");

  if (newPassword) {
    return {
      ok: "Zugang angelegt.",
      credentials: { email, password: newPassword, name: fullName },
    };
  }
  return { ok: `${existing?.full_name || email} hatte bereits einen Zugang und wurde dem Projekt zugeordnet.` };
}

export async function updateMember(projectId: string, formData: FormData) {
  const path = `/projekte/${projectId}/zugaenge`;
  const { supabase, canManage } = await requireProject(projectId);
  if (!canManage) back(path, "fehler", "Keine Berechtigung.");

  const userId = str(formData.get("user_id"));
  const role = String(formData.get("role") ?? "") as Role;
  if (!userId || !ROLES.includes(role)) back(path, "fehler", "Ungültige Eingabe.");

  const { error } = await supabase
    .from("project_members")
    .update({ role, trade: str(formData.get("trade")) })
    .eq("project_id", projectId)
    .eq("user_id", userId);

  if (error) back(path, "fehler", "Speichern fehlgeschlagen: " + error.message);

  revalidatePath(path);
  back(path, "ok", "Gespeichert.");
}

export async function removeMember(projectId: string, formData: FormData) {
  const path = `/projekte/${projectId}/zugaenge`;
  const { supabase, user, canManage } = await requireProject(projectId);
  if (!canManage) back(path, "fehler", "Keine Berechtigung.");

  const userId = str(formData.get("user_id"));
  if (!userId) back(path, "fehler", "Ungültige Eingabe.");
  if (userId === user.id) back(path, "fehler", "Sie können sich nicht selbst entfernen.");

  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);

  if (error) back(path, "fehler", "Entfernen fehlgeschlagen: " + error.message);

  revalidatePath(`/projekte/${projectId}`, "layout");
  back(path, "ok", "Zugang zum Projekt entfernt. Der Login bleibt für andere Projekte bestehen.");
}

export async function resetPassword(
  projectId: string,
  _prev: AccessState,
  formData: FormData,
): Promise<AccessState> {
  const { profile } = await requireProject(projectId);
  if (!profile.is_admin) return { error: "Nur der Administrator kann Passwörter zurücksetzen." };

  const userId = str(formData.get("user_id"));
  const email = str(formData.get("email")) ?? "";
  const name = str(formData.get("name")) ?? email;
  if (!userId) return { error: "Ungültige Eingabe." };

  const password = generatePassword();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return { error: "Zurücksetzen fehlgeschlagen: " + error.message };

  return { ok: "Neues Passwort erzeugt.", credentials: { email, password, name } };
}
