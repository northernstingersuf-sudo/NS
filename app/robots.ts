import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/konto", "/varukorg", "/sok", "/logga-in", "/kassa", "/order"] }, sitemap: "https://northernstingers.se/sitemap.xml" };
}
