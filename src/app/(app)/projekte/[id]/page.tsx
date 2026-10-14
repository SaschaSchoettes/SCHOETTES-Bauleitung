import { redirect } from "next/navigation";

// Ein Projekt öffnet direkt im Projektstand
export default async function ProjektStart({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projekte/${id}/projektstand`);
}
