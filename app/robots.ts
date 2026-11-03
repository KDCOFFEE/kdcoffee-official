import type { MetadataRoute } from "next";
import { getCanonicalPublicSiteOrigin } from "@/lib/publicSiteOrigin";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [
      "/admin", "/api/", "/member", "/member-backup", "/gmail-fulfillment",
      "/cart", "/checkout", "/orders/", "/order-complete",
      "/data/", "/uploads/member-avatars/", "/uploads/order-notifications/",
    ] },
    sitemap: `${getCanonicalPublicSiteOrigin()}/sitemap.xml`,
  };
}
