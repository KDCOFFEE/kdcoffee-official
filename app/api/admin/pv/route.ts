import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { getLiveWebsiteData } from "@/data/websiteData";
import { listActiveSkusMissingPv } from "@/lib/referralPv";

export const dynamic = "force-dynamic";
export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const website = await getLiveWebsiteData();
  const rows = website.menu.products.flatMap((product) => (product.skus?.length ? product.skus : product.purchase).map((sku, index) => ({ productId: product.id || product.slug, productSlug: product.slug, productName: product.name, skuId: sku.id || `${product.slug}:${index}`, skuLabel: sku.label, price: sku.price, pvEnabled: sku.pvEnabled === true, pvValue: typeof sku.pvValue === "number" ? sku.pvValue : 0, active: product.active !== false && product.purchasable !== false && product.status === "active" && sku.enabled !== false })));
  return NextResponse.json({ rows, missingPv: listActiveSkusMissingPv(website) });
}
