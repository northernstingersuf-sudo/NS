import Image from "next/image";
import Link from "next/link";
import CartLink from "./CartLink";
import { getCategories } from "@/lib/products";

const nav = "font-mono text-[11px] uppercase tracking-wider text-ink/80 transition-colors hover:text-ink";

export default async function Header() {
  const cats = await getCategories();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 sm:px-8">
        <nav aria-label="Produkter" className="flex items-center gap-6">
          <Link href="/produkter" className={nav}>Alla produkter</Link>
          {cats.map((c) => <Link key={c.slug} href={`/produkter?kategori=${c.slug}`} className={`${nav} hidden xl:block`}>{c.name_sv}</Link>)}
        </nav>
        <Link href="/" aria-label="Northern Stingers – startsida">
          <Image src="/logo/norst-black.webp" alt="norst." width={96} height={96} priority className="-my-3 h-14 w-auto" />
        </Link>
        <nav aria-label="Övrigt" className="flex items-center justify-end gap-6">
          <Link href="/frakt-och-leverans" className={`${nav} hidden md:block`}>Frakt</Link>
          <Link href="/kontakt" className={`${nav} hidden md:block`}>Kontakta oss</Link>
          <Link href="/om-oss" className={`${nav} hidden lg:block`}>Om oss</Link>
          <Link href="/sok" className={nav}>Sök</Link>
          <CartLink />
        </nav>
      </div>
    </header>
  );
}
