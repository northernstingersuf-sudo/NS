/** Alla belopp i heltalsören. Inga flyttal i beräkningar. */
export const sek = (ore: number) =>
  new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: ore % 100 === 0 ? 0 : 2, minimumFractionDigits: ore % 100 === 0 ? 0 : 2 }).format(ore / 100);

/** "249", "249,5", "249.50" → öre. Returnerar null vid ogiltig inmatning (inga negativa tal, högst två decimaler). */
export function parseSekToOre(raw: string): number | null {
  const s = raw.replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  const [kr, dec = ""] = s.split(".");
  return Number(kr) * 100 + Number(dec.padEnd(2, "0"));
}
