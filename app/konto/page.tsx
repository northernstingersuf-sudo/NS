import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../logga-in/actions";

export const metadata: Metadata = { title: "Mitt konto", robots: { index: false } };
const sek = (o: number) => new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK", maximumFractionDigits: 0 }).format(o / 100);

export default async function Account() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/logga-in");
  const { data: orders } = await sb.from("orders").select("id,status,total_ore,tracking_number,created_at").order("created_at", { ascending: false });
  return (
    <div className="mx-auto max-w-3xl px-5 pt-16 sm:px-8">
      <h1 className="text-5xl font-semibold tracking-tightest">Mitt konto</h1>
      <p className="mt-4 text-mute">{user.email}</p>
      <h2 className="mt-12 text-xl font-semibold">Beställningar</h2>
      {orders?.length ? (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {orders.map((o) => (
            <li key={o.id} className="flex justify-between gap-4 py-4 text-sm">
              <span>{new Date(o.created_at).toLocaleDateString("sv-SE")} · {o.status}{o.tracking_number ? ` · spårning ${o.tracking_number}` : ""}</span>
              <span>{sek(o.total_ore)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="mt-4 text-mute">Inga beställningar ännu.</p>}
      <form action={signOut}><button className="mt-12 border border-ink px-6 py-3 text-sm">Logga ut</button></form>
    </div>
  );
}
