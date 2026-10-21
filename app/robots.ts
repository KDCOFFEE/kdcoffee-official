import type { MetadataRoute } from "next";
import { getCanonicalPublicSiteOrigin } from "@/lib/publicSiteOrigin";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${getCanonicalPublicSiteOrigin()}/sitemap.xml`,
  };
}
