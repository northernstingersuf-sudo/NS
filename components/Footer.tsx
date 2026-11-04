import Image from "next/image";
import Link from "next/link";
import NewsletterForm from "./NewsletterForm";

const col = (title: string, items: [string, string][]) => (
  <div>
    <h3 className="mb-4 text-sm font-medium">{title}</h3>
    <ul className="space-y-2 text-sm text-mute">
      {items.map(([href, label]) => (
        <li key={href}><Link href={href} className="hover:text-ink">{label}</Link></li>
      ))}
    </ul>
  </div>
);

export default function Footer() {
  return (
    <footer className="mt-32 bg-ink text-paper">
      <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 md:grid-cols-4">
        <div>
          <Image src="/logo/norst-white.webp" alt="norst." width={96} height={96} className="h-16 w-auto -ml-1" />
          <p className="mt-4 max-w-[28ch] text-sm text-paper/60">Egna fiskeprodukter, kläder och livsstil.</p>
        </div>
        <div className="[&_a]:text-paper/60 [&_a:hover]:text-paper">{col("Handla", [["/produkter", "Alla produkter"], ["/konto", "Mitt konto"]])}</div>
        <div className="[&_a]:text-paper/60 [&_a:hover]:text-paper">{col("Kundservice", [["/frakt-och-leverans", "Frakt och leverans"], ["/retur-och-reklamation", "Retur och reklamation"], ["/kontakt", "Kontakt"]])}</div>
        <div className="[&_a]:text-paper/60 [&_a:hover]:text-paper">{col("Juridik", [["/kopvillkor", "Köpvillkor"], ["/integritetspolicy", "Integritetspolicy"], ["/om-oss", "Om oss"]])}</div>
      </div>
      <div className="mx-auto max-w-7xl px-5 pb-12 sm:px-8 md:max-w-md md:ml-auto md:mr-[max(2rem,calc((100vw-80rem)/2+2rem))]"><NewsletterForm /></div>
      <div className="border-t border-paper/10 py-6 text-center text-xs text-paper/40">© {new Date().getFullYear()} Northern Stingers · northernstingers.se</div>
    </footer>
  );
}
