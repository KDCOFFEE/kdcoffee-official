import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { getAssetLibrary, saveAssetLibrary } from "@/lib/assets";

export const runtime = "nodejs";

const clean = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".svg", ".gif", ".avif"]);

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const assetId = String(form.get("assetId") || "");
  if (!(file instanceof File) || !assetId) return NextResponse.json({ error: "缺少檔案或 Asset ID" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ error: "目前資產管理只接受圖片" }, { status: 400 });
  if (file.size > 12 * 1024 * 1024) return NextResponse.json({ error: "圖片不可超過 12 MB" }, { status: 400 });

  const library = await getAssetLibrary();
  const index = library.assets.findIndex((asset) => asset.id === assetId);
  if (index < 0) return NextResponse.json({ error: "找不到指定的資產位置" }, { status: 404 });
  const asset = library.assets[index];
  const ext = path.extname(file.name).toLowerCase();
  if (!allowedExtensions.has(ext)) return NextResponse.json({ error: "不支援的圖片格式" }, { status: 400 });
  const category = clean(asset.category) || "misc";
  const stem = clean(asset.seoStem) || `kd-coffee-${asset.id.toLowerCase()}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads", "assets", category);
  await fs.mkdir(uploadDir, { recursive: true });
  const existing = await fs.readdir(uploadDir).catch(() => [] as string[]);
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = existing.map((name) => name.match(new RegExp(`^${escaped}-v(\\d+)\\.[a-z0-9]+$`, "i"))).filter(Boolean);
  const version = Math.max(0, ...matches.map((match) => Number(match?.[1] || 0))) + 1;
  const fileName = `${stem}-v${String(version).padStart(2, "0")}${ext === ".jpeg" ? ".jpg" : ext}`;
  await fs.writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));
  const publicPath = `/uploads/assets/${category}/${fileName}`;
  library.assets[index] = { ...asset, path: publicPath, status: "active", originalFileName: file.name, updatedAt: new Date().toISOString() };
  await saveAssetLibrary(library);
  return NextResponse.json({ ok: true, asset: library.assets[index], fileName, path: publicPath });
}
