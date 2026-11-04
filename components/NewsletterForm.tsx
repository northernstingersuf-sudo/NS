"use client";
import { useActionState } from "react";
import { subscribe, type NewsState } from "@/app/actions/newsletter";

export default function NewsletterForm() {
  const [state, action, pending] = useActionState<NewsState, FormData>(subscribe, {});
  if (state.ok) return <p role="status" className="text-sm">Tack! Du är anmäld till nyhetsbrevet.</p>;
  return (
    <form action={action} className="space-y-3">
      <h3 className="text-sm font-medium">Nyhetsbrev</h3>
      <div className="flex gap-2">
        <input name="email" type="email" required maxLength={254} autoComplete="email" placeholder="E-post" aria-label="E-post"
          className="w-full border border-paper/30 bg-transparent px-3 py-2 text-sm placeholder:text-paper/40" />
        <button disabled={pending} className="bg-paper px-4 text-sm text-ink disabled:opacity-60">Anmäl</button>
      </div>
      <label className="flex items-start gap-2 text-xs text-paper/60">
        <input type="checkbox" name="consent" required className="mt-0.5" />
        Jag godkänner att Northern Stingers skickar nyhetsbrev. Läs vår <a href="/integritetspolicy" className="underline">integritetspolicy</a>.
      </label>
      {state.error && <p role="alert" className="text-xs">{state.error}</p>}
    </form>
  );
}
