"use client";
import Link from "next/link";
import { useCart } from "@/components/CartProvider";

const sek = (o: number) => new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(o / 100);

export default function Cart() {
  const { items, setQty, total } = useCart();
  return (
    <div className="mx-auto max-w-3xl px-5 pt-16 sm:px-8">
      <h1 className="text-5xl font-semibold tracking-tightest">Varukorg</h1>
      {items.length === 0 ? (
        <p className="mt-10 text-mute">Varukorgen är tom. <Link href="/produkter" className="text-ink underline">Se produkter</Link></p>
      ) : (
        <>
          <ul className="mt-10 divide-y divide-line border-y border-line">
            {items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-4 py-5">
                <Link href={`/produkter/${i.slug}`}>{i.name}</Link>
                <div className="flex items-center gap-5">
                  <div className="flex items-center border border-line">
                    <button aria-label={`Minska ${i.name}`} className="px-3 py-1" onClick={() => setQty(i.id, i.qty - 1)}>−</button>
                    <span className="w-8 text-center text-sm">{i.qty}</span>
                    <button aria-label={`Öka ${i.name}`} className="px-3 py-1" onClick={() => setQty(i.id, i.qty + 1)}>+</button>
                  </div>
                  <span className="w-24 text-right text-sm">{sek(i.price_ore * i.qty)}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-6 flex justify-between text-lg"><span>Delsumma</span><span>{sek(total)}</span></p>
          <p className="mt-1 text-sm text-mute">Frakt och slutlig summa beräknas i kassan.</p>
          <Link href="/kassa" className="mt-8 block w-full bg-ink py-4 text-center text-sm text-paper">Till kassan</Link>
        </>
      )}
    </div>
  );
}
