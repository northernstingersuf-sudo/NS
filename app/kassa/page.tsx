import type { Metadata } from "next";
import { getCheckoutConfig } from "./actions";
import CheckoutForm from "./CheckoutForm";

export const metadata: Metadata = { title: "Kassa", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Checkout() {
  const cfg = await getCheckoutConfig();
  return (
    <div className="mx-auto max-w-5xl px-5 pt-16 sm:px-8">
      <h1 className="text-5xl font-semibold tracking-tightest">Kassa</h1>
      {cfg.open ? (
        <CheckoutForm shipping={cfg.shipping} />
      ) : (
        <p role="status" className="mt-10 max-w-xl border border-line px-5 py-4 text-sm">{cfg.reason} Kassan öppnar så snart butiken är redo.</p>
      )}
    </div>
  );
}
