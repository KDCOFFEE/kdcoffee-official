import { NextResponse } from "next/server";
import { getLiveWebsiteData } from "@/data/websiteData";
import packageJson from "@/package.json";

export const dynamic = "force-dynamic";
const appVersion = packageJson.version;

export async function GET() {
  try {
    const live = await getLiveWebsiteData();
    const products = Array.isArray(live?.menu?.products) ? live.menu.products : [];
    const purchasable = products.filter((item: any) =>
      item?.status !== "hidden" &&
      item?.status !== "sold_out" &&
      item?.purchasable !== false &&
      Array.isArray(item?.purchase) &&
      item.purchase.some((option: any) => option?.enabled !== false && Number(option?.price) > 0),
    );

    return NextResponse.json({
      ok: true,
      version: appVersion,
      time: new Date().toISOString(),
      products: products.length,
      purchasableProducts: purchasable.length,
      lineLoginConfigured: Boolean(
        process.env.LINE_LOGIN_CHANNEL_ID && process.env.LINE_LOGIN_CHANNEL_SECRET,
      ),
    });
  } catch (error) {
    console.error("KD Coffee health check failed", error);
    return NextResponse.json(
      { ok: false, version: appVersion, error: "health_check_failed" },
      { status: 500 },
    );
  }
}
