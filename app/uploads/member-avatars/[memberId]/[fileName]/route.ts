import { promises as fs } from "fs";
import path from "path";
import { getMemberAvatarUploadDir } from "@/lib/storagePaths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function GET(_request: Request, context: { params: Promise<{ memberId: string; fileName: string }> }) {
  const { memberId, fileName } = await context.params;
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(memberId) || !/^avatar\.(jpg|png|webp)$/i.test(fileName)) return new Response("Not found", { status: 404 });
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  try {
    const data = await fs.readFile(path.join(getMemberAvatarUploadDir(memberId), fileName));
    return new Response(data, { headers: { "Content-Type": CONTENT_TYPES[extension] || "application/octet-stream", "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
