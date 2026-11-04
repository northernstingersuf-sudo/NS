import type { Metadata } from "next";
import Page from "@/components/Page";
export const metadata: Metadata = { title: "Frakt och leverans" };
export default function P() {
  return (<Page title="Frakt och leverans"><p>Vi levererar just nu endast inom Sverige. Fraktkostnad och leveranstid visas i kassan. Ett spårningsnummer skickas när ordern lämnat oss.</p></Page>);
}
