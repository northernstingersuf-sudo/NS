import Link from "next/link";
import { requireAdmin } from "@/lib/admin";

export const metadata = { title: "Admin", robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-7xl px-5 pt-10 sm:px-8">
      <nav aria-label="Administration" className="mb-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line pb-5 font-mono text-xs uppercase tracking-wider">
        <Link href="/admin" className="font-semibold">Översikt</Link>
        <Link href="/admin/ordrar">Beställningar</Link>
        <Link href="/admin/produkter">Produkter</Link>
        <Link href="/admin/produkter/ny">Ny produkt</Link>
        <Link href="/admin/lager">Lager</Link>
        <Link href="/admin/nyhetsbrev">Nyhetsbrev</Link>
        <Link href="/admin/returer">Ångermeddelanden</Link>
        <Link href="/admin/installningar">Inställningar</Link>
        <Link href="/" className="ml-auto text-mute">Visa butik ↗</Link>
      </nav>
      {children}
    </div>
  );
}
