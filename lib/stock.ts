export type StockBalance = {
  product_id: string;
  variant_id: string | null;
  quantity: number;
  reserved: number;
};

export function stockByScope<T extends StockBalance>(balances: T[]) {
  const products = new Map<string, T>();
  const variants = new Map<string, T>();
  for (const row of balances) {
    if (row.variant_id) variants.set(row.variant_id, row);
    else products.set(row.product_id, row);
  }
  return { products, variants };
}
