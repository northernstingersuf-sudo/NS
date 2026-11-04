/**
 * Swish utan Swish-API. Allt här är rena funktioner: inga nätverksanrop, ingen betalningsbekräftelse.
 *  - QR: Swish publicerade C2B-format  C<payee>;<amount>;<message>;<lock_mask>  (kodas lokalt med qrcode-biblioteket).
 *  - Appöppning: community-dokumenterade, EJ officiella länkformat. Kan sluta fungera; QR/nummer/referens är alltid reservvägen.
 * Inget i den här filen visar att en betalning har genomförts.
 */

export const SWISH_MESSAGE_MAX = 50;

/** Tillåter siffror, ev. inledande +, mellanslag och bindestreck i inmatningen. Returnerar bara siffror (7–15). */
export function normalizeSwishNumber(raw: string | undefined | null): string | null {
  const digits = (raw ?? "").trim().replace(/^\+/, "").replace(/[\s-]/g, "");
  return /^\d{7,15}$/.test(digits) ? digits : null;
}

/** 24900 → "249,00" (decimalkomma, två decimaler, utan flyttal). */
export function formatSwishAmount(ore: number): string {
  if (!Number.isSafeInteger(ore) || ore <= 0) throw new Error("Ogiltigt belopp för Swish.");
  return `${Math.floor(ore / 100)},${String(ore % 100).padStart(2, "0")}`;
}

/** Kort, entydig orderreferens: tillåter A–Z, 0–9, mellanslag, punkt, komma, bindestreck. */
export function sanitizeSwishMessage(ref: string): string {
  const clean = ref.replace(/[^A-Za-z0-9 .,-]/g, "").trim().slice(0, SWISH_MESSAGE_MAX);
  if (!clean) throw new Error("Tom orderreferens.");
  return clean;
}

export type SwishPaymentInput = { payee: string; amountOre: number; message: string };

function check({ payee, amountOre, message }: SwishPaymentInput) {
  const p = normalizeSwishNumber(payee);
  if (!p) throw new Error("Ogiltigt Swish-nummer.");
  return { payee: p, amountOre, message: sanitizeSwishMessage(message) };
}

/** Payload för QR-koden. lock_mask = 0 enligt projektets krav: inga fält avsiktligt redigerbara. */
export function buildSwishQrPayload(input: SwishPaymentInput): string {
  const { payee, amountOre, message } = check(input);
  return `C${payee};${formatSwishAmount(amountOre)};${encodeURIComponent(message)};0`;
}

/** BEST EFFORT. Observerat format, inte officiellt dokumenterat av Swish. */
export function buildSwishAppLink(input: SwishPaymentInput): string {
  const { payee, amountOre, message } = check(input);
  const data = {
    version: 1,
    payee: { value: payee, editable: false },
    amount: { value: amountOre / 100, editable: false },
    message: { value: message, editable: false },
  };
  return `swish://payment?data=${encodeURIComponent(JSON.stringify(data))}`;
}

/** BEST EFFORT, alternativ länk. Observerad HTTPS-form, inte officiellt dokumenterad. */
export function buildSwishHttpsLink(input: SwishPaymentInput): string {
  const { payee, amountOre, message } = check(input);
  const amt = `${Math.floor(amountOre / 100)}.${String(amountOre % 100).padStart(2, "0")}`;
  const q = new URLSearchParams({ sw: payee, amt, cur: "SEK", msg: message });
  return `https://app.swish.nu/1/p/sw/?${q.toString()}`;
}
