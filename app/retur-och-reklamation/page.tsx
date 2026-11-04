import type { Metadata } from "next";
import Page from "@/components/Page";
export const metadata: Metadata = { title: "Retur och reklamation" };
export default function P() {
  return (<Page title="Retur och reklamation"><p>Som konsument har du enligt distansavtalslagen rätt att ångra ditt köp inom 14 dagar efter att du tagit emot varan. Kontakta oss först, så hjälper vi dig med returen.</p><p>Reklamation av felaktig vara kan göras inom tre år enligt konsumentköplagen.</p></Page>);
}
