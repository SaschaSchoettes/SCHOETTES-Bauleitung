import Link from "next/link";
import { requireProject } from "@/lib/auth";
import { ProjectTabs, type Tab } from "@/components/ProjectTabs";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { project, canManage } = await requireProject(id);
  const base = `/projekte/${id}`;

  const tabs: Tab[] = [
    { href: base, label: "Übersicht" },
    { href: `${base}/kontakte`, label: "Kontakte" },
    { href: `${base}/stammdaten`, label: "Stammdaten" },
  ];
  if (canManage) tabs.push({ href: `${base}/zugaenge`, label: "Zugänge" });

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
