"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const field = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function signIn(f: FormData) {
  const sb = await createClient();
  const { error } = await sb.auth.signInWithPassword({ email: field(f, "email"), password: String(f.get("password") ?? "") });
  if (error) redirect("/logga-in?fel=inlogg");
  redirect("/konto");
}
export async function signUp(f: FormData) {
  const password = String(f.get("password") ?? "");
  if (password.length < 10) redirect("/logga-in?fel=losenord");
  const sb = await createClient();
  const { error } = await sb.auth.signUp({ email: field(f, "email"), password });
  if (error) redirect("/logga-in?fel=registrering");
  redirect("/logga-in?klar=1");
}
export async function signOut() {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect("/");
}
