import { requireAdmin } from "@/lib/admin";
import { isValidFrom } from "@/lib/email";
import { isValidRoleId, isValidWebhookUrl } from "@/lib/discord";
import { hasServiceRole } from "@/lib/supabase/admin";
import { normalizeSwishNumber } from "@/lib/swish";
import { saveShipping } from "./actions";

export const metadata = { title: "Inställningar – Admin", robots: { index: false, follow: false } };
const input = "mt-1 w-full border border-line bg-transparent px-3 py-2 text-sm";
const kr = (ore?: number | null) => (ore == null ? "" : (ore / 100).toFixed(2).replace(".", ","));

export default async function Settings({ searchParams }: { searchParams: Promise<{ ok?: string; fel?: string }> }) {
  const { sb } = await requireAdmin();
  const sp = await searchParams;
  const { data } = await sb.from("shop_settings").select("value").eq("key", "shipping").maybeSingle();
  const ship = data?.value as { flat_ore?: number; free_over_ore?: number | null } | undefined;
  const swish = normalizeSwishNumber(process.env.SWISH_NUMBER);
  // Visar bara OM hemligheter är satta, aldrig deras värden.
  const checks: [string, boolean, string][] = [
    ["Service role-nyckel (server)", hasServiceRole(), "SUPABASE_SERVICE_ROLE_KEY"],
    ["Swish-nummer", !!swish, swish ? `SWISH_NUMBER (slutar på ${swish.slice(-3)})` : "SWISH_NUMBER"],
    ["Discord webhook-URL", isValidWebhookUrl(process.env.DISCORD_WEBHOOK_URL), "DISCORD_WEBHOOK_URL"],
    ["Discord roll-ID", isValidRoleId(process.env.DISCORD_ROLE_ID), "DISCORD_ROLE_ID"],
    ["E-post: Resend API-nyckel", !!process.env.RESEND_API_KEY?.trim(), "RESEND_API_KEY"],
    ["E-post: avsändare", isValidFrom(process.env.EMAIL_FROM), "EMAIL_FROM"],
    ["Sajtens URL (adminlänk i Discord)", !!process.env.NEXT_PUBLIC_SITE_URL, "NEXT_PUBLIC_SITE_URL"],
    ["Fraktpris angivet", Number.isInteger(ship?.flat_ore), "Formuläret nedan"],
  ];
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-xs uppercase tracking-wider text-mute">Administration</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tightest">Inställningar</h1>
      {sp.ok && <p role="status" className="mt-6 border border-ink px-4 py-3 text-sm">Sparat.</p>}
      {sp.fel && <p role="alert" className="mt-6 border border-red-300 px-4 py-3 text-sm">{sp.fel}</p>}
      <h2 className="mt-10 text-xl font-semibold">Frakt</h2>
      <form action={saveShipping} className="mt-4 space-y-4">
        <label className="block text-xs text-mute">Fraktpris (kr, inkl. moms)<input name="flat" required inputMode="decimal" defaultValue={kr(ship?.flat_ore)} className={input} /></label>
        <label className="block text-xs text-mute">Fri frakt vid köp över (kr, lämna tomt för aldrig)<input name="free_over" inputMode="decimal" defaultValue={kr(ship?.free_over_ore)} className={input} /></label>
        <button className="bg-ink px-5 py-3 text-sm text-paper">Spara frakt</button>
        <p className="text-xs text-mute">Kassan öppnar först när fraktpris är angivet.</p>
      </form>
      <h2 className="mt-12 text-xl font-semibold">Driftkontroll</h2>
      <ul className="mt-4 divide-y divide-line border-y border-line text-sm">
        {checks.map(([name, ok, hint]) => <li key={name} className="flex justify-between gap-4 py-3"><span>{name}<span className="block font-mono text-xs text-mute">{hint}</span></span><span className={ok ? "" : "font-semibold text-red-700"}>{ok ? "OK" : "Saknas"}</span></li>)}
      </ul>
      <p className="mt-3 text-xs text-mute">Miljövariabler sätts i hostingens inställningar, aldrig i koden. Värdena visas inte här.</p>
    </div>
  );
}
