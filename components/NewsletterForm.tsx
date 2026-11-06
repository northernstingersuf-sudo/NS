"use client";
import { useActionState } from "react";
import Link from "next/link";
import { subscribe, type NewsState } from "@/app/actions/newsletter";
import { NEWSLETTER_CONSENT_TEXT } from "@/lib/newsletter-consent";

export default function NewsletterForm() {
  const [state, action, pending] = useActionState<NewsState, FormData>(subscribe, {});
  if (state.ok) return <p role="status" className="text-sm">Tack! Vi har skickat ett bekräftelsemejl. Klicka på länken i mejlet för att aktivera din prenumeration. Kontrollera även skräpposten.</p>;
  return (
    <form action={action} className="space-y-3">
      <h3 className="text-sm font-medium">Nyhetsbrev</h3>
      <p className="max-w-sm text-xs text-paper/60">Få nyheter och erbjudanden från Northern Stingers via e-post.</p>
      <div className="flex gap-2">
        <input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="E-post" aria-label="E-post"
          className="w-full border border-paper/30 bg-transparent px-3 py-2 text-sm placeholder:text-paper/40" />
        <button type="submit" disabled={pending} className="bg-paper px-4 text-sm text-ink disabled:opacity-60">{pending ? "Sparar…" : "Anmäl"}</button>
      </div>
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden"><label>Webbplats<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label className="flex items-start gap-2 text-xs text-paper/60">
        <input type="checkbox" name="consent" required className="mt-0.5" />
        <span>{NEWSLETTER_CONSENT_TEXT} Läs <Link href="/integritetspolicy" className="underline">integritetspolicyn</Link>.</span>
      </label>
      {state.error && <p role="alert" className="text-xs">{state.error}</p>}
    </form>
  );
}
