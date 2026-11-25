import { requireAdmin } from "@/lib/admin";
import ProductForm from "../ProduktForm";

export const metadata = { title: "Ny produkt – Admin", robots: { index: false, follow: false } };

export default async function NewProduct({ searchParams }: { searchParams: Promise<{ fel?: string }> }) {
  const { fel } = await searchParams;
  const { sb } = await requireAdmin();
  const { data: categories } = await sb.from("categories").select("id,name_sv").order("position");
  return <div><p className="font-mono text-xs uppercase tracking-wider text-mute">Administration / Produkter</p><h1 className="mt-2 text-4xl font-semibold tracking-tightest">Ny produkt</h1>{fel && <p role="alert" className="mt-4 text-sm text-red-700">{fel}</p>}<ProductForm categories={categories ?? []} /></div>;
}
