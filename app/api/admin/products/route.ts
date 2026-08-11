import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { atomicWriteJson, withFileLock } from "@/lib/jsonFileStore";
import { applyProductChanges, ProductCommerceUpdateError } from "@/lib/productCommerceUpdates";
import { mergeProductAssetUpdates, ProductAssetUpdateError } from "@/lib/productAssetUpdates";

export const dynamic = "force-dynamic";

const websiteFile = path.join(process.cwd(), "public", "data", "website-data.json");
const archiveFile = path.join(process.cwd(), "public", "data", "monthly-menus.json");
const backupDir = path.join(process.cwd(), "data", "backups", "artworks");
const SCHEMA_VERSION = "12.0";
type ProductRecord = Record<string, unknown>;
const defaultPageLayout = { heroAsset: "hero", productAsset: "productPhoto", listAsset: "mainVisual", galleryAssets: ["label"], showGallery: true, showRelatedWorks: true };
const defaultDisplayFields = { origin: true, process: true, roast: true, variety: false, altitude: false, flavors: true, shortCopy: true, mood: true };

function isRecord(value: unknown): value is ProductRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeProduct(value: unknown) {
  const product = isRecord(value) ? value : {};
  const purchase = Array.isArray(product.purchase) ? product.purchase : [];
  const pageLayout = isRecord(product.pageLayout) ? product.pageLayout : {};
  return {
    ...product,
    schemaVersion: SCHEMA_VERSION,
    flavors: Array.isArray(product.flavors) ? product.flavors : [],
    assets: isRecord(product.assets) ? product.assets : {},
    pageLayout: {
      ...defaultPageLayout,
      ...pageLayout,
      galleryAssets: Array.isArray(pageLayout.galleryAssets) ? pageLayout.galleryAssets : ["label"],
    },
    history: Array.isArray(product.history) ? product.history : [],
    publish: isRecord(product.publish) ? product.publish : {},
    displayFields: { ...defaultDisplayFields, ...(isRecord(product.displayFields) ? product.displayFields : {}) },
    skus: Array.isArray(product.skus) && product.skus.length
      ? product.skus
      : purchase.filter(isRecord).map((item) => ({ ...item, stock: product.stock || 0, enabled: true })),
  };
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function backup(data: unknown) {
  await fs.mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.writeFile(path.join(backupDir, `artworks-${stamp}.json`), `${JSON.stringify(data, null, 2)}\n`, "utf8");
  const files = (await fs.readdir(backupDir)).sort().reverse();
  await Promise.all(files.slice(30).map((name) => fs.unlink(path.join(backupDir, name))));
}

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await readJson<ProductRecord>(websiteFile, {});
  const archive = await readJson<ProductRecord>(archiveFile, { menus: [] });
  const menu = isRecord(data.menu) ? data.menu : {};
  const raw = Array.isArray(menu.products) ? menu.products : [];
  const products = raw.filter(isRecord).map(normalizeProduct);
  const migrated = data.schemaVersion !== SCHEMA_VERSION || products.some((product, index) => JSON.stringify(product) !== JSON.stringify(raw[index]));
  return NextResponse.json({
    products,
    menu: {
      monthKey: menu.monthKey || "2026-08",
      monthLabel: menu.monthLabel || "",
      title: menu.title || "",
      intro: menu.intro || "",
    },
    archive: archive.menus || [],
    version: data.version || 1,
    schemaVersion: SCHEMA_VERSION,
    migrated,
    updatedAt: data.updatedAt || "",
  });
}

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    if (body.scope === "assets") {
      if (!Array.isArray(body.products)) return NextResponse.json({ error: "商品素材資料格式不正確。" }, { status: 400 });
      return await withFileLock(websiteFile, async () => {
        const data = await readJson<ProductRecord>(websiteFile, {});
        const menu = isRecord(data.menu) ? data.menu : {};
        const current = (Array.isArray(menu.products) ? menu.products : []).filter(isRecord);
        const products = mergeProductAssetUpdates(current, body.products);
        await backup(data);
        data.menu = { ...menu, products };
        data.updatedAt = new Date().toISOString();
        data.version = Number(data.version || 1) + 1;
        await atomicWriteJson(websiteFile, data);
        return NextResponse.json({ ok: true, scope: "assets", count: body.products.length, version: data.version, updatedAt: data.updatedAt });
      });
    }

    if (body.scope !== "productChanges") {
      return NextResponse.json({ error: "商品儲存必須使用 productChanges patch，禁止提交完整 products snapshot。" }, { status: 400 });
    }
    if (!Array.isArray(body.changes)) return NextResponse.json({ error: "商品變更資料格式不正確。" }, { status: 400 });

    return await withFileLock(websiteFile, async () => {
      const data = await readJson<ProductRecord>(websiteFile, {});
      const menu = isRecord(data.menu) ? data.menu : {};
      const current = (Array.isArray(menu.products) ? menu.products : []).filter(isRecord);
      const products = applyProductChanges(current, body.changes);
      await backup(data);
      data.menu = { ...menu, products };
      data.schemaVersion = SCHEMA_VERSION;
      data.updatedAt = new Date().toISOString();
      data.version = Number(data.version || 1) + 1;
      await atomicWriteJson(websiteFile, data);
      return NextResponse.json({ ok: true, scope: "productChanges", count: body.changes.length, version: data.version, updatedAt: data.updatedAt });
    });
  } catch (error) {
    const status = error instanceof ProductCommerceUpdateError
      ? error.status
      : error instanceof ProductAssetUpdateError
        ? 400
        : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "儲存失敗" }, { status });
  }
}
