import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import CopyButton from "@/components/CopyButton";
import { customerStatus, getOrderByToken, type CustomerStatus } from "@/lib/orders";
import { isEmailConfigured } from "@/lib/notify-email";
import { sek } from "@/lib/money";
import { buildSwishAppLink, buildSwishHttpsLink, buildSwishQrPayload, normalizeSwishNumber } from "@/lib/swish";
import { reportPaid } from "./actions";

export const metadata: Metadata = { title: "Din beställning", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const STATUS: Record<CustomerStatus, { title: string; text: string }> = {
  awaiting_payment: { title: "Inväntar betalning", text: "Betala med Swish nedan. Vi behandlar ordern först när vi har kontrollerat att betalningen kommit in." },
  reported: { title: "Betalning rapporterad – inväntar kontroll", text: "Tack! Vi kontrollerar manuellt att betalningen har kommit in. Ordern behandlas först efter det. Det kan ta en stund." },
  paid: { title: "Betalning mottagen", text: "Vi har kontrollerat din betalning och förbereder ordern." },
  packed: { title: "Packas", text: "Din order packas just nu." },
  shipped: { title: "Skickad", text: "Din order är på väg." },
  delivered: { title: "Levererad", text: "Ordern är markerad som levererad." },
  cancelled: { title: "Avbruten", text: "Ordern är avbruten. Har du betalat, kontakta oss så ordnar vi det." },
  refunded: { title: "Återbetald", text: "Ordern är markerad som återbetald." },
};

export default async function OrderPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ rapporterad?: string; fel?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const order = await getOrderByToken(token);
  if (!order) notFound();

  const status = customerStatus(order);
  const ref = order.order_number ?? order.id.slice(0, 8).toUpperCase();
  const needsPayment = status === "awaiting_payment" || status === "reported";
  const payee = normalizeSwishNumber(process.env.SWISH_NUMBER);

  let qrSvg: string | null = null;
  let appLink: string | null = null;
  let altLink: string | null = null;
  if (needsPayment && payee) {
    const input = { payee, amountOre: order.total_ore, message: ref };
    // QR skapas lokalt. Inget anrop till Swish eller annan extern tjänst.
    qrSvg = await QRCode.toString(buildSwishQrPayload(input), { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#000000", light: "#ffffff" } });
    appLink = buildSwishAppLink(input);
    altLink = buildSwishHttpsLink(input);
  }
  const a = order.shipping_address;

  return (
    <div className="mx-auto max-w-3xl px-5 pt-16 sm:px-8">
      <p className="font-mono text-xs uppercase tracking-wider text-mute">Order {ref}</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tightest">{STATUS[status].title}</h1>
      <p className="mt-4 text-mute" role="status">{STATUS[status].text}</p>
      {sp.rapporterad && status === "reported" && <p role="status" className="mt-6 border border-ink px-4 py-3 text-sm">Din rapport är mottagen.</p>}
      {sp.fel && <p role="alert" className="mt-6 border border-red-300 px-4 py-3 text-sm">Något gick fel. Försök igen om en stund.</p>}
      {status === "shipped" || status === "delivered" ? (order.tracking_number ? <p className="mt-4 text-sm">Spårningsnummer: <span className="font-mono">{order.tracking_number}</span></p> : null) : null}

      {needsPayment && (
        <section aria-labelledby="swish" className="mt-10 border border-line p-6">
          <h2 id="swish" className="text-xl font-semibold">Betala med Swish</h2>
          {payee && qrSvg && appLink && altLink ? (
            <div className="mt-6 grid gap-8 sm:grid-cols-[auto_1fr]">
              <div>
                <div role="img" aria-label={`QR-kod för Swish-betalning, ${sek(order.total_ore)}, referens ${ref}`} className="w-56 max-w-full bg-white [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                <p className="mt-2 text-xs text-mute">Skanna med Swish-appen.</p>
              </div>
              <div className="min-w-0 space-y-4 text-sm">
                <a href={appLink} className="block bg-ink py-4 text-center text-paper md:hidden">Öppna Swish och betala</a>
                <p className="text-xs text-mute md:hidden">Öppnas inte appen? <a href={altLink} className="underline">Prova alternativ länk</a> eller skanna/skriv in uppgifterna nedan.</p>
                <dl className="divide-y divide-line border-y border-line">
                  <Row label="Mottagare (Swish-nummer)" value={payee} copy />
                  <Row label="Belopp" value={sek(order.total_ore)} copy={(order.total_ore / 100).toFixed(2).replace(".", ",")} />
                  <Row label="Meddelande / referens" value={ref} copy />
                </dl>
                <p className="text-xs leading-relaxed text-mute">Ange exakt belopp och referens så att vi kan hitta din betalning. Att Swish öppnas eller att du trycker på knappen nedan betyder inte att betalningen är bekräftad. Det gör vi manuellt.</p>
              </div>
            </div>
          ) : (
            <p role="alert" className="mt-4 text-sm">Swish-uppgifterna kan inte visas just nu. Kontakta oss och uppge referens <span className="font-mono">{ref}</span>.</p>
          )}
          {status === "awaiting_payment" && (
            <form action={reportPaid} className="mt-8 border-t border-line pt-6">
              <input type="hidden" name="token" value={token} />
              <button className="w-full border border-ink py-3 text-sm">Jag har betalat</button>
              <p className="mt-2 text-xs text-mute">Skickar bara en rapport till oss. Din order markeras inte som betald förrän vi kontrollerat.</p>
            </form>
          )}
        </section>
      )}

      <section aria-labelledby="sammanfattning" className="mt-10">
        <h2 id="sammanfattning" className="text-xl font-semibold">Beställning</h2>
        <ul className="mt-4 divide-y divide-line border-y border-line text-sm">
          {order.order_items.map((i, n) => (
            <li key={n} className="flex justify-between gap-4 py-3"><span>{i.quantity} × {i.name}{i.variant ? ` – ${i.variant}` : ""}</span><span className="tabular-nums">{sek(i.unit_price_ore * i.quantity)}</span></li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1 text-sm">
          <div className="flex justify-between"><dt>Delsumma</dt><dd className="tabular-nums">{sek(order.subtotal_ore)}</dd></div>
          {order.discount_ore > 0 && <div className="flex justify-between"><dt>Rabatt</dt><dd className="tabular-nums">−{sek(order.discount_ore)}</dd></div>}
          <div className="flex justify-between"><dt>Frakt</dt><dd className="tabular-nums">{order.shipping_ore === 0 ? "Fri frakt" : sek(order.shipping_ore)}</dd></div>
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Totalt</dt><dd className="tabular-nums">{sek(order.total_ore)}</dd></div>
        </dl>
        <p className="mt-6 text-sm text-mute">Leverans till {[a.name, a.line1, a.line2, `${a.postal_code ?? ""} ${a.city ?? ""}`.trim()].filter(Boolean).join(", ")}</p>
        <p className="mt-1 text-sm text-mute">{isEmailConfigured() ? `Vi mejlar orderbekräftelse och statusuppdateringar till ${order.email}. Hittar du inget mejl, titta i skräpposten. ` : ""}Spara den här sidans länk: den är din orderstatus.</p>
      </section>
      <p className="mt-10 text-sm"><Link href="/produkter" className="underline">Fortsätt handla</Link></p>
    </div>
  );
}

function Row({ label, value, copy }: { label: string; value: string; copy?: boolean | string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0"><dt className="text-xs text-mute">{label}</dt><dd className="mt-0.5 break-all font-mono text-sm">{value}</dd></div>
      {copy ? <CopyButton value={typeof copy === "string" ? copy : value} label={label} /> : null}
    </div>
  );
}
