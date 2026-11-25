"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";

const BUCKET = "product-images";
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

async function imageFormat(file: File) {
  const bytes = Buffer.from(await file.slice(0, 12).arrayBuffer());
  if (file.type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (file.type === "image/png" && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "png";
  if (file.type === "image/webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

export async function manageVariantImage(formData: FormData) {
  const { sb } = await requireAdmin();
  const productId = String(formData.get("productId") ?? "");
  const variantId = String(formData.get("variantId") ?? "");
  const action = String(formData.get("operation") ?? "");
  const imageId = String(formData.get("imageId") ?? "");
  const alt = String(formData.get("alt") ?? "").trim();
  if (!UUID.test(productId)) redirect("/admin/produkter");
  const editPath = "/admin/produkter/" + productId;
  const fail = (message: string): never => redirect(editPath + "?bildfel=" + encodeURIComponent(message) + "#variantbilder");

  if (!UUID.test(variantId) || !["add", "cover", "remove"].includes(action) ||
      (action !== "add" && !UUID.test(imageId)) || alt.length > 160) {
    fail("Kontrollera bildens uppgifter.");
  }
  const { data: variant, error: variantError } = await sb.from("product_variants")
    .select("id").eq("product_id", productId).eq("id", variantId).maybeSingle();
  if (variantError || !variant) fail("Varianten kunde inte hittas.");

  let upload: { path: string; url: string } | undefined;
  if (action === "add") {
    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0 || file.size > 4 * 1024 * 1024) {
      return fail("Välj en bild som är högst 4 MB.");
    }
    const extension = await imageFormat(file);
    if (!extension) return fail("Välj en giltig JPEG-, PNG- eller WebP-bild.");
    if (!hasServiceRole()) return fail("Bilduppladdning saknar serverkonfiguration.");
    const path = "variants/" + variantId + "/" + crypto.randomUUID() + "." + extension;
    const bucket = createAdminClient().storage.from(BUCKET);
    const { error } = await bucket.upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    if (error) return fail("Bilden kunde inte laddas upp. Försök igen.");
    upload = { path, url: bucket.getPublicUrl(path).data.publicUrl };
  }

  const { error } = await sb.rpc("admin_manage_variant_image", {
    p_variant_id: variantId,
    p_action: action,
    p_image_id: action === "add" ? null : imageId,
    p_url: upload?.url ?? null,
    p_alt_sv: alt || null,
  });
  if (error) {
    if (upload && /^(P000[12]|42501|22023)$/.test(error.code)) {
      await createAdminClient().storage.from(BUCKET).remove([upload.path]);
    }
    fail(error.message.includes("variant_image_limit") ? "Varianten har redan tre bilder." : "Bilden kunde inte sparas. Försök igen.");
  }

  revalidatePath("/");
  revalidatePath("/produkter");
  revalidatePath("/produkter/[slug]", "page");
  redirect(editPath + "?bildsparad=1#variantbilder");
}
