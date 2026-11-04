"use client";
import Link from "next/link";
import { useCart } from "./CartProvider";
export default function CartLink() {
  const { count } = useCart();
  return <Link href="/varukorg" className="font-mono text-[11px] uppercase tracking-wider">Varukorg ({count})</Link>;
}
