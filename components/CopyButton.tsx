"use client";
import { useState } from "react";

export default function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" aria-label={`Kopiera ${label}`} className="border border-line px-3 py-1 font-mono text-[11px] uppercase tracking-wider hover:border-ink"
      onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); } catch {} }}>
      {done ? "Kopierat ✓" : "Kopiera"}
    </button>
  );
}
