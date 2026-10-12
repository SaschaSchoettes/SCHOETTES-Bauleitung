/* eslint-disable @next/next/no-img-element */
export function Brand({ large = false }: { large?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <img
        src="/logo.png"
        alt="Schöttes – Bauingenieur, Sachverständiger, Energieberater"
        className={large ? "h-14 w-auto" : "h-7 w-auto sm:h-8"}
      />
      <span className={`border-l border-slate-300 pl-2.5 text-petrol ${large ? "text-lg" : "text-sm sm:text-base"}`}>
        Bauportal
      </span>
    </span>
  );
}
