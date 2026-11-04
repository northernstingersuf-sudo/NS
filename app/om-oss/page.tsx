import type { Metadata } from "next";
import Page from "@/components/Page";
export const metadata: Metadata = { title: "Om oss" };
export default function P() {
  return (<Page title="Om oss"><p>Northern Stingers designar egna fiskeprodukter, kläder och livsstilsprodukter. Allt vi säljer är till för långa dagar vid vattnet.</p></Page>);
}
