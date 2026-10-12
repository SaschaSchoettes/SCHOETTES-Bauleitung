export function Notice({ ok, error }: { ok?: string | null; error?: string | null }) {
  if (error) return <p className="notice notice-error">{error}</p>;
  if (ok) return <p className="notice notice-ok">{ok}</p>;
  return null;
}
