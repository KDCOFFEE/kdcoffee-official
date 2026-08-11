import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const contentTypes: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(_request: Request, context: { params: Promise<{ fileName: string }> }) {
  const { fileName } = await context.params;
  const extension = path.extname(fileName).toLowerCase();
  const isSafeFileName = fileName === path.basename(fileName) && /^[a-z0-9][a-z0-9._-]*$/i.test(fileName);
  const contentType = contentTypes[extension];
  if (!isSafeFileName || !contentType) return new Response("Not found", { status: 404 });

  try {
    const file = await fs.readFile(path.join(process.cwd(), "public", "images", "campaigns", fileName));
    return new Response(file, {
      headers: {
        "Cache-Control": "public, max-age=3600",
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Response("Not found", { status: 404 });
    throw error;
  }
}
