export function Brand({ large = false }: { large?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span
        className={`font-bold tracking-[0.22em] text-brand ${large ? "text-xl" : "text-sm sm:text-base"}`}
      >
        SCHÖTTES
      </span>
      <span className={`text-slate-500 ${large ? "text-lg" : "text-sm sm:text-base"}`}>Bauportal</span>
    </span>
  );
}
