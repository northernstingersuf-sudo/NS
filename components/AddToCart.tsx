"use client";
import { useState } from "react";
import { useCart, type CartItem } from "./CartProvider";
export default function AddToCart({ item, inStock }: { item: Omit<CartItem, "qty">; inStock: boolean }) {
  const { add } = useCart();
  const [done, setDone] = useState(false);
  return (
    <button disabled={!inStock} onClick={() => { add(item); setDone(true); setTimeout(() => setDone(false), 1800); }}
      className="mt-10 w-full bg-ink py-4 text-sm text-paper disabled:bg-line disabled:text-mute" aria-live="polite">
      {!inStock ? "Slut i lager" : done ? "Tillagd i varukorgen" : "Lägg i varukorg"}
    </button>
  );
}
