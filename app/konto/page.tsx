import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { sek } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../logga-in/actions";

export const metadata: Metadata = { title: "Mitt konto", robots: { index: false }, referrer: "no-referrer" };
const statusLabels: Record<string, string> = {
  pending: "Inväntar betalningskontroll",
  paid: "Betalning mottagen",
  packed: "Packas",
  shipped: "Skickad",
  delivered: "Levererad",
  cancelled: "Avbruten",
  refunded: "Återbetald",
};

export default async function Account() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/logga-in");
  const { data: orders, error } = await sb.from("orders")
    .select("id,order_number,guest_token,status,total_ore,tracking_number,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return (
    <div className="mx-auto max-w-3xl px-5 pt-16 sm:px-8">
      <h1 className="text-5xl font-semibold tracking-tightest">Mitt konto</h1>
      <p className="mt-4 text-mute">{user.email}</p>
      <h2 className="mt-12 text-xl font-semibold">Beställningar</h2>
      {error ? <p role="alert" className="mt-4 text-sm text-red-700">Kunde inte hämta dina beställningar. Ladda om sidan och försök igen.</p> : orders?.length ? (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {orders.map((o) => (
            <li key={o.id} className="flex items-start justify-between gap-4 py-4 text-sm">
              <div className="min-w-0">
                {o.guest_token ? (
                  <Link className="font-semibold underline underline-offset-4" prefetch={false} href={`/order/${o.guest_token}`}>
                    {o.order_number ?? "Visa beställning"}
                  </Link>
                ) : <span className="font-semibold">{o.order_number ?? "Beställning"}</span>}
                <p className="mt-1 text-mute">{new Date(o.created_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" })} · {statusLabels[o.status] ?? "Okänd status"}</p>
                {o.tracking_number && <p className="mt-1 break-words text-mute">Spårningsnummer {o.tracking_number}</p>}
              </div>
              <span className="shrink-0 font-medium tabular-nums">{sek(o.total_ore)}</span>
            </li>
          ))}
        </ul>
      ) : <p className="mt-4 text-mute">Inga beställningar ännu.</p>}
      <form action={signOut}><button className="mt-12 border border-ink px-6 py-3 text-sm">Logga ut</button></form>
    </div>
  );
}
