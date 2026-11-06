"use client";
import { useActionState } from "react";
import { requestWithdrawal, type WithdrawalState } from "@/app/actions/withdrawal";

const input = "mt-1 w-full border border-line bg-transparent px-3 py-3 text-sm";

export default function WithdrawalRequestForm() {
  const [state, action, pending] = useActionState<WithdrawalState, FormData>(requestWithdrawal, {});
  if (state.ok) return (
    <div role="status" className="border border-line p-5">
      <h3 className="font-semibold text-ink">Ångermeddelandet är mottaget</h3>
      <p className="mt-2">Ett mottagningsbevis har skickats till e-postadressen som är kopplad till ordern. Kontrollera även skräpposten.</p>
      <p className="mt-2 text-xs">Ärende-ID: <span className="font-mono">{state.requestId}</span></p>
    </div>
  );
  return (
    <form action={action} className="mt-6 space-y-4 border border-line p-5">
      <div>
        <h3 className="text-lg font-semibold text-ink">Skicka ångermeddelande</h3>
        <p className="mt-1 text-sm">Fyll i uppgifterna för ordern. Ett mottagningsbevis skickas automatiskt till e-postadressen som användes vid köpet.</p>
      </div>
      <label className="block text-xs font-medium text-mute">Ordernummer<input name="order_number" required maxLength={20} placeholder="NS-2026-000123" className={input} autoComplete="off" /></label>
      <label className="block text-xs font-medium text-mute">Ditt namn<input name="name" required minLength={2} maxLength={100} autoComplete="name" className={input} /></label>
      <label className="block text-xs font-medium text-mute">E-postadressen som användes vid köpet<input name="email" type="email" required maxLength={254} autoComplete="email" className={input} /></label>
      <label className="block text-xs font-medium text-mute">Meddelande (valfritt)<textarea name="message" rows={3} maxLength={2000} className={input} placeholder="Ange gärna vilka varor ångern gäller om du endast vill frånträda en del av ordern." /></label>
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden"><label>Webbplats<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm_withdrawal" required className="mt-1" />
        <span>Jag meddelar härmed uttryckligen att jag vill frånträda köpeavtalet för ordern ovan.</span>
      </label>
      {state.error && <p role="alert" className="border border-red-300 px-3 py-2 text-sm">{state.error}</p>}
      <button type="submit" disabled={pending} className="w-full bg-ink px-5 py-3 text-sm text-paper disabled:opacity-60">{pending ? "Skickar…" : "Utöva ångerrätten – skicka ångermeddelande"}</button>
      <p className="text-xs text-mute">Mottagningsbevis skickas automatiskt via e-post. Formuläret gör inte automatiskt en återbetalning eller en administrativ orderändring.</p>
    </form>
  );
}
