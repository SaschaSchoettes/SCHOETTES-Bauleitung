import { redirect } from "next/navigation";

// Alte Adresse → neuer Reiter "Projektstand"
export default async function ThemenRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projekte/${id}/projektstand`);
}
