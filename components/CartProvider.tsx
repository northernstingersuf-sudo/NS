"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type CartItem = { id: string; slug: string; name: string; price_ore: number; qty: number };
type Ctx = { items: CartItem[]; add: (i: Omit<CartItem, "qty">) => void; setQty: (id: string, q: number) => void; clear: () => void; ready: boolean; count: number; total: number };
const C = createContext<Ctx | null>(null);
const KEY = "ns-cart";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setItems(JSON.parse(raw)); } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
  }, [items, ready]);
  const add: Ctx["add"] = (i) => setItems((cur) =>
    cur.some((x) => x.id === i.id) ? cur.map((x) => (x.id === i.id ? { ...x, qty: Math.min(x.qty + 1, 99) } : x)) : [...cur, { ...i, qty: 1 }]);
  const setQty: Ctx["setQty"] = (id, q) => setItems((cur) => q <= 0 ? cur.filter((x) => x.id !== id) : cur.map((x) => (x.id === id ? { ...x, qty: Math.min(q, 99) } : x)));
  const clear: Ctx["clear"] = () => setItems([]);
  const count = items.reduce((n, x) => n + x.qty, 0);
  const total = items.reduce((n, x) => n + x.qty * x.price_ore, 0);
  return <C.Provider value={{ items, add, setQty, clear, ready, count, total }}>{children}</C.Provider>;
}
export const useCart = () => { const c = useContext(C); if (!c) throw new Error("CartProvider saknas"); return c; };
