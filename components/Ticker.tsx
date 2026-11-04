const items = ["Egna produkter för gäddfiske", "Frakt inom Sverige", "Northern Stingers"];
export default function Ticker() {
  return (
    <div className="overflow-hidden bg-ink py-2 text-paper" aria-label="Information">
      <div className="flex w-max animate-ticker font-mono text-[11px] uppercase tracking-wider">
        {[0, 1].map((k) => (
          <ul key={k} className="flex shrink-0 gap-12 pr-12" aria-hidden={k === 1}>
            {[...items, ...items].map((t, i) => <li key={i}>✦ {t}</li>)}
          </ul>
        ))}
      </div>
    </div>
  );
}
