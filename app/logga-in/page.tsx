import type { Metadata } from "next";
import { signIn, signUp } from "./actions";

export const metadata: Metadata = { title: "Logga in", robots: { index: false } };
const errors: Record<string, string> = {
  inlogg: "Fel e-post eller lösenord.",
  losenord: "Lösenordet måste vara minst 10 tecken.",
  registrering: "Kontot kunde inte skapas. Kontrollera e-postadressen.",
};
const input = "w-full border border-line px-4 py-3 text-sm";

export default async function Login({ searchParams }: { searchParams: Promise<{ fel?: string; klar?: string }> }) {
  const { fel, klar } = await searchParams;
  return (
    <div className="mx-auto grid max-w-5xl gap-16 px-5 pt-16 sm:px-8 md:grid-cols-2">
      <div className="md:col-span-2">
        <h1 className="text-5xl font-semibold tracking-tightest">Konto</h1>
        {fel && <p role="alert" className="mt-6 border border-ink px-4 py-3 text-sm">{errors[fel] ?? "Något gick fel."}</p>}
        {klar && <p role="status" className="mt-6 border border-ink px-4 py-3 text-sm">Kontot är skapat. Bekräfta din e-post om du fått ett mejl, och logga sedan in.</p>}
      </div>
      <form action={signIn} className="space-y-4">
        <h2 className="text-xl font-semibold">Logga in</h2>
        <input name="email" type="email" required autoComplete="email" placeholder="E-post" aria-label="E-post" className={input} />
        <input name="password" type="password" required autoComplete="current-password" placeholder="Lösenord" aria-label="Lösenord" className={input} />
        <button className="w-full bg-ink py-3 text-sm text-paper">Logga in</button>
      </form>
      <form action={signUp} className="space-y-4">
        <h2 className="text-xl font-semibold">Skapa konto</h2>
        <input name="email" type="email" required autoComplete="email" placeholder="E-post" aria-label="E-post" className={input} />
        <input name="password" type="password" required minLength={10} autoComplete="new-password" placeholder="Lösenord (minst 10 tecken)" aria-label="Nytt lösenord" className={input} />
        <button className="w-full border border-ink py-3 text-sm">Skapa konto</button>
        <p className="text-xs text-mute">Du kan alltid handla som gäst utan konto.</p>
      </form>
    </div>
  );
}
