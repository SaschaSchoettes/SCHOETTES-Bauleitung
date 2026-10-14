import Link from "next/link";
import { requireProject } from "@/lib/auth";
import { getUnread } from "@/lib/data";
import { ProjectTabs, type Tab } from "@/components/ProjectTabs";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, project } = await requireProject(id);
  const base = `/projekte/${id}`;
  const [{ total: unread }, { count: openTopics }] = await Promise.all([
    getUnread(supabase, id, user.id),
    supabase
      .from("topics")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id)
      .in("status", ["offen", "in_klaerung"]),
  ]);

  const tabs: Tab[] = [
    { href: `${base}/projektstand`, label: "Projektstand" },
    { href: `${base}/themen`, label: openTopics ? `Festlegungen / Themen (${openTopics})` : "Festlegungen / Themen" },
    { href: `${base}/kommunikation`, label: unread > 0 ? `Kommunikation (${unread})` : "Kommunikation" },
    { href: `${base}/bauzeitenplan`, label: "Bauzeitenplan" },
    { href: `${base}/dokumente`, label: "Dokumente" },
    { href: `${base}/kontakte`, label: "Kontakte" },
    { href: `${base}/protokolle`, label: "Protokolle" },
    { href: `${base}/stammdaten`, label: "Stammdaten", also: [`${base}/zugaenge`] },
  ];

  return (
    <div>
      <Link href="/projekte" className="text-sm text-slate-500 hover:text-slate-900">
        ← Alle Projekte
      </Link>
      {project.number && <div className="mt-2 text-sm text-slate-500">Projekt {project.number}</div>}
      <h1 className="mt-0.5 text-2xl font-semibold sm:text-3xl">{project.name}</h1>
      <div className="mt-4">
        <ProjectTabs tabs={tabs} />
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}
