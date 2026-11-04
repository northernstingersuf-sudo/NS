/** Ren validering och felöversättning för kassan. Inga beroenden, kan testas utan server. */

export type CheckoutInput = {
  idempotencyKey: string;
  email: string;
  name: string;
  phone: string;
  line1: string;
  line2: string;
  postalCode: string;
  city: string;
  discountCode: string;
  items: { id: string; qty: number }[];
  website?: string; // honeypot
};

export type ShippingAddress = { name: string; line1: string; line2: string | null; postal_code: string; city: string; country: "SE"; phone: string | null };
export type ValidCheckout = { idempotencyKey: string; email: string; address: ShippingAddress; discountCode: string | null; items: { id: string; qty: number }[] };
export type ValidationResult = { ok: true; value: ValidCheckout } | { ok: false; errors: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function validateCheckout(raw: unknown): ValidationResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const idempotencyKey = str(r.idempotencyKey);
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(idempotencyKey)) errors.form = "Ogiltig förfrågan. Ladda om sidan och försök igen.";

  const email = str(r.email).toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) errors.email = "Ange en giltig e-postadress.";

  const name = str(r.name);
  if (name.length < 2 || name.length > 100) errors.name = "Ange för- och efternamn.";
  const line1 = str(r.line1);
  if (line1.length < 3 || line1.length > 120) errors.line1 = "Ange din gatuadress.";
  const line2 = str(r.line2);
  if (line2.length > 120) errors.line2 = "Max 120 tecken.";
  const pc = str(r.postalCode).replace(/\s/g, "");
  if (!/^\d{5}$/.test(pc)) errors.postalCode = "Ange ett svenskt postnummer (5 siffror).";
  const city = str(r.city);
  if (city.length < 2 || city.length > 80) errors.city = "Ange ort.";
  const phone = str(r.phone);
  if (phone && !/^\+?[0-9][0-9 -]{6,19}$/.test(phone)) errors.phone = "Ange ett giltigt telefonnummer eller lämna tomt.";
  const discountCode = str(r.discountCode);
  if (discountCode.length > 40) errors.discountCode = "Rabattkoden är för lång.";

  const itemsRaw = Array.isArray(r.items) ? r.items : [];
  const items: { id: string; qty: number }[] = [];
  if (itemsRaw.length === 0) errors.items = "Varukorgen är tom.";
  if (itemsRaw.length > 50) errors.items = "För många rader i varukorgen.";
  for (const it of itemsRaw.slice(0, 50)) {
    const o = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
    const id = str(o.id);
    const qty = Number(o.qty);
    if (!UUID.test(id) || !Number.isInteger(qty) || qty < 1 || qty > 99) { errors.items = "Varukorgen innehåller en ogiltig rad."; break; }
    items.push({ id, qty });
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      idempotencyKey, email, discountCode: discountCode || null, items,
      address: { name, line1, line2: line2 || null, postal_code: `${pc.slice(0, 3)} ${pc.slice(3)}`, city, country: "SE", phone: phone || null },
    },
  };
}

/** Översätter databasens felkoder (create_order) till kundvänliga meddelanden. */
export function describeOrderError(message: string | undefined, detail?: string | null): { message: string; code: string } {
  const m = message ?? "";
  const d = detail ? ` (${detail})` : "";
  if (m.includes("shipping_not_configured")) return { code: "closed", message: "Kassan är inte öppen ännu. Försök igen senare." };
  if (m.includes("insufficient_stock")) return { code: "stock", message: `Tyvärr finns inte tillräckligt i lager${d}. Minska antalet eller ta bort varan.` };
  if (m.includes("out_of_stock")) return { code: "stock", message: `Varan är slut i lager${d}.` };
  if (m.includes("product_unavailable") || m.includes("variant_required")) return { code: "unavailable", message: `En vara i varukorgen är inte längre tillgänglig${d}. Uppdatera varukorgen.` };
  if (m.includes("invalid_discount")) return { code: "discount", message: "Rabattkoden är ogiltig, har gått ut eller är slutanvänd." };
  if (m.includes("invalid_email")) return { code: "email", message: "Ange en giltig e-postadress." };
  return { code: "unknown", message: "Beställningen kunde inte läggas just nu. Inget har dragits. Försök igen om en stund." };
}
