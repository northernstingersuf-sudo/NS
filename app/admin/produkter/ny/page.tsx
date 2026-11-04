import { requireAdmin } from "@/lib/admin";
import ProductForm from "../ProduktForm";

export const metadata = { title: "Ny produkt – Admin", robots: { index: false, follow: false } };

export default async function NewProduct() {
  const { sb } = await requireAdmin();
  const { data: categories } = await sb.from("categories").select("id,name_sv").order("position");
  return <div><p className="font-mono text-xs uppercase tracking-wider text-mute">Administration / Produkter</p><h1 className="mt-2 text-4xl font-semibold tracking-tightest">Ny produkt</h1><ProductForm categories={categories ?? []} /></div>;
}
