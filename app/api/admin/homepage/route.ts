import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { atomicWriteJson, withFileLock } from "@/lib/jsonFileStore";
import { validateHomepageCampaignDates } from "@/lib/homepageCampaignValidation";
import { hasAvailableHome004Sku, resolveHome004Recommendations } from "@/lib/home004Recommendations";

export const dynamic = "force-dynamic";

const homepagePath = path.join(process.cwd(), "public", "data", "homepage.json");
const websitePath = path.join(process.cwd(), "public", "data", "website-data.json");

async function readJson(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [homepage, website] = await Promise.all([readJson(homepagePath), readJson(websitePath)]);
  const products = Array.isArray(website.menu?.products)
    ? website.menu.products.map((product: Record<string, unknown>) => ({
        slug: typeof product.slug === "string" ? product.slug : "",
        name: typeof product.name === "string" ? product.name : "",
        active: typeof product.active === "boolean" ? product.active : undefined,
        status: typeof product.status === "string" ? product.status : undefined,
        purchasable: product.purchasable === true,
        inMonthlyMenu: product.inMonthlyMenu === true,
        hasAvailableSku: hasAvailableHome004Sku(product),
      })).filter((product: { slug: string; name: string }) => product.slug && product.name)
    : [];
  return NextResponse.json({ homepage, products });
}

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const homepage = body.homepage;
    if (!homepage || !Array.isArray(homepage.campaigns) || !homepage.hero) {
      return NextResponse.json({ error: "首頁資料格式不完整" }, { status: 400 });
    }
    const campaignDateError = validateHomepageCampaignDates(homepage.campaigns);
    if (campaignDateError) return NextResponse.json({ error: campaignDateError }, { status: 400 });
    const website = await readJson(websitePath);
    const home004Resolution = resolveHome004Recommendations(
      homepage.home004?.productSlugs,
      Array.isArray(website.menu?.products) ? website.menu.products : [],
    );
    if (!home004Resolution.valid) {
      return NextResponse.json({ error: home004Resolution.errors[0] }, { status: 400 });
    }
    const version = await withFileLock(homepagePath, async () => {
      homepage.updatedAt = new Date().toISOString();
      homepage.version = Number(homepage.version || 1) + 1;
      await atomicWriteJson(homepagePath, homepage);
      return homepage.version;
    });
    return NextResponse.json({ ok: true, version });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "儲存失敗" }, { status: 500 });
  }
}
