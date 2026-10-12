import type { SupabaseClient } from "@supabase/supabase-js";
import type { Member } from "@/lib/types";

/** Alle Beteiligten mit Login eines Projekts inkl. Profil */
export async function getMembers(supabase: SupabaseClient, projectId: string): Promise<Member[]> {
  const { data } = await supabase
    .from("project_members")
    .select("project_id, user_id, role, trade, created_at, profiles(id, email, full_name, company, phone)")
    .eq("project_id", projectId);
  const members = (data ?? []) as unknown as Member[];
  return members.sort((a, b) => memberName(a).localeCompare(memberName(b), "de"));
}

/** Ungelesene Nachrichten je Kanal ("projekt" bzw. User-ID des Einzelkanals) */
export async function getUnread(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<{ total: number; byThread: Map<string, number> }> {
  const { data: msgs } = await supabase
    .from("messages")
    .select("id, thread_user_id, author_id")
    .eq("project_id", projectId)
    .neq("author_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  const list = (msgs ?? []) as { id: string; thread_user_id: string | null; author_id: string }[];
  const byThread = new Map<string, number>();
  if (list.length === 0) return { total: 0, byThread };

  const { data: reads } = await supabase
    .from("message_reads")
    .select("message_id")
    .eq("user_id", userId)
    .in(
      "message_id",
      list.map((m) => m.id),
    );
  const readSet = new Set(((reads ?? []) as { message_id: string }[]).map((r) => r.message_id));

  let total = 0;
  for (const m of list) {
    if (readSet.has(m.id)) continue;
    const key = m.thread_user_id ?? "projekt";
    byThread.set(key, (byThread.get(key) ?? 0) + 1);
    total++;
  }
  return { total, byThread };
}

export function memberName(m: Member): string {
  return m.profiles?.full_name || m.profiles?.email || "Unbekannt";
}

export function memberLabel(m: Member): string {
  const extra = [m.trade, m.profiles?.company].filter(Boolean).join(", ");
  return extra ? `${memberName(m)} (${extra})` : memberName(m);
}
