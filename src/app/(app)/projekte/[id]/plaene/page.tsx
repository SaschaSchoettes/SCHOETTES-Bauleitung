import { redirect } from "next/navigation";

// Alte Adresse → neuer Reiter "Dokumente"
export default async function PlaeneRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projekte/${id}/dokumente`);
}
