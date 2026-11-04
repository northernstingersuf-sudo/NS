"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/CartProvider";
import { sek } from "@/lib/money";
import { placeOrder, quoteCart, type QuoteLine } from "./actions";

const input = "mt-1 w-full border border-line bg-transparent px-3 py-3 text-sm";
const label = "block text-xs font-medium uppercase tracking-wider text-mute";
const KEY_STORE = "ns-checkout-key";

type Shipping = { flat_ore: number; free_over_ore: number | null };

export default function CheckoutForm({ shipping }: { shipping: Shipping }) {
  const { items, clear, ready } = useCart();
  const router = useRouter();
  const [lines, setLines] = useState<QuoteLine[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  const cartSig = useMemo(() => JSON.stringify(items.map((i) => [i.id, i.qty]).sort()), [items]);

  useEffect(() => {
    if (!ready) return;
    if (!items.length) { setLines([]); return; }
    let alive = true;
    quoteCart(items.map((i) => ({ id: i.id, qty: i.qty }))).then((l) => alive && setLines(l))
      .catch(() => alive && setLines(items.map((i) => ({ id: i.id, name: i.name, variant: null, unit_ore: i.price_ore, qty: i.qty, problem: null }))));
    return () => { alive = false; };
  }, [ready, cartSig]); // eslint-disable-line react-hooks/exhaustive-deps

  const subtotal = (lines ?? []).reduce((n, l) => n + l.unit_ore * l.qty, 0);
  const blocked = (lines ?? []).some((l) => l.problem);
  const shippingOre = subtotal >= (shipping.free_over_ore ?? Infinity) ? 0 : shipping.flat_ore;

  /** Idempotensnyckel per unik beställning (korg + formulärdata). Dubbelklick/omladdning/nätverksfel ger samma nyckel → samma order. */
  function keyFor(sig: string): string {
    try {
      const raw = sessionStorage.getItem(KEY_STORE);
      if (raw) { const o = JSON.parse(raw) as { sig: string; key: string }; if (o.sig === sig) return o.key; }
      const key = crypto.randomUUID();
      sessionStorage.setItem(KEY_STORE, JSON.stringify({ sig, key }));
      return key;
    } catch { return crypto.randomUUID(); }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setError(null); setFieldErrors({});
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? "");
    const payload = {
      email: get("email"), name: get("name"), phone: get("phone"), line1: get("line1"), line2: get("line2"),
      postalCode: get("postalCode"), city: get("city"), discountCode: get("discountCode"), website: get("website"),
      items: items.map((i) => ({ id: i.id, qty: i.qty })),
    };
    setPending(true);
    try {
      const res = await placeOrder({ ...payload, idempotencyKey: keyFor(JSON.stringify([cartSig, { ...payload, website: "" }])) });
      if (res.ok) {
        try { sessionStorage.removeItem(KEY_STORE); } catch {}
        clear();
        router.push(`/order/${res.token}`);
        return;
      }
      setError(res.error);
      if (res.fieldErrors) setFieldErrors(res.fieldErrors);
    } catch {
      setError("Nätverksfel. Tryck på knappen igen; din beställning dubbleras inte.");
    }
    setPending(false);
  }

  if (!ready || (lines === null && items.length > 0)) return <p className="mt-10 text-sm text-mute" aria-live="polite">Laddar varukorg…</p>;
  if (!items.length) return <p className="mt-10 text-mute">Varukorgen är tom. <Link href="/produkter" className="text-ink underline">Se produkter</Link></p>;

  const fe = (k: string) => fieldErrors[k] ? <span role="alert" className="mt-1 block text-xs text-red-700">{fieldErrors[k]}</span> : null;

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-10 grid gap-12 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-5">
        <h2 className="text-xl font-semibold">Leverans</h2>
        <label className="block"><span className={label}>E-post</span><input name="email" type="email" required autoComplete="email" className={input} />{fe("email")}</label>
        <label className="block"><span className={label}>Namn</span><input name="name" required autoComplete="name" className={input} />{fe("name")}</label>
        <label className="block"><span className={label}>Gatuadress</span><input name="line1" required autoComplete="address-line1" className={input} />{fe("line1")}</label>
        <label className="block"><span className={label}>Adressrad 2 (valfri)</span><input name="line2" autoComplete="address-line2" className={input} />{fe("line2")}</label>
        <div className="grid grid-cols-[1fr_2fr] gap-4">
          <label className="block"><span className={label}>Postnummer</span><input name="postalCode" required inputMode="numeric" autoComplete="postal-code" className={input} />{fe("postalCode")}</label>
          <label className="block"><span className={label}>Ort</span><input name="city" required autoComplete="address-level2" className={input} />{fe("city")}</label>
        </div>
        <label className="block"><span className={label}>Telefon (valfri, för leveransavisering)</span><input name="phone" type="tel" autoComplete="tel" className={input} />{fe("phone")}</label>
        <p className="text-xs text-mute">Vi levererar just nu endast inom Sverige.</p>
        {/* Honeypot: dolt för människor. */}
        <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden"><label>Webbplats<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <h2 className="text-xl font-semibold">Din beställning</h2>
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {(lines ?? []).map((l) => (
            <li key={l.id} className="flex justify-between gap-4 py-3 text-sm">
              <span>{l.qty} × {l.name}{l.variant ? ` – ${l.variant}` : ""}{l.problem && <span role="alert" className="mt-1 block text-xs text-red-700">{l.problem}. Ta bort varan i varukorgen.</span>}</span>
              <span className="tabular-nums">{sek(l.unit_ore * l.qty)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between"><dt>Delsumma</dt><dd className="tabular-nums">{sek(subtotal)}</dd></div>
          <div className="flex justify-between"><dt>Frakt</dt><dd className="tabular-nums">{shippingOre === 0 ? "Fri frakt" : sek(shippingOre)}</dd></div>
        </dl>
        <label className="mt-5 block"><span className={label}>Rabattkod (valfri)</span><input name="discountCode" autoComplete="off" className={input} />{fe("discountCode")}</label>
        <p className="mt-2 text-xs text-mute">Rabatt och slutlig summa räknas ut av oss när du lägger beställningen.</p>

        {error && <p role="alert" className="mt-5 border border-red-300 px-4 py-3 text-sm">{error}</p>}
        {fe("items")}
        <button disabled={pending || blocked} className="mt-6 w-full bg-ink py-4 text-sm text-paper disabled:bg-line disabled:text-mute">
          {pending ? "Skapar beställning…" : "Lägg beställning och betala med Swish"}
        </button>
        <p className="mt-3 text-xs leading-relaxed text-mute">Du betalar i nästa steg med Swish. Ordern behandlas först när vi har kontrollerat att betalningen kommit in.</p>
      </aside>
    </form>
  );
}
