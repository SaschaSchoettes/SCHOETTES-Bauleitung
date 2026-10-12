import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Project, Role } from "@/lib/types";

/** Angemeldeten Nutzer samt Profil laden; ohne Login → /login. */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, company, phone, is_admin")
    .eq("id", user.id)
    .single();

  return {
    supabase,
    user,
    profile: (profile as Profile | null) ?? {
      id: user.id,
      email: user.email ?? null,
      full_name: null,
      company: null,
      phone: null,
      is_admin: false,
    },
  };
}

/** Projekt und eigene Rolle laden; kein Zugriff → Projektliste. */
export async function requireProject(projectId: string) {
  const ctx = await requireUser();
  const { supabase, user, profile } = ctx;

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) redirect("/projekte");

  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  const role = (membership?.role as Role | undefined) ?? null;
  const canManage = profile.is_admin || role === "bauleitung";

  return { ...ctx, project: project as Project, role, canManage };
}
