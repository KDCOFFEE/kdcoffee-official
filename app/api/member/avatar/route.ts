import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

import { getCurrentMember, updateMemberProfile } from "@/lib/memberAuth";
import { getMemberAvatarUploadDir } from "@/lib/storagePaths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  const requestUrl = new URL(request.url);
  if (originUrl.origin === requestUrl.origin) return true;

  // Reverse proxies such as ngrok can expose the public browser origin through
  // forwarded headers while Next.js internally sees localhost in request.url.
  // Keep the same-origin check, but compare against that public request origin.
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  if (!host) return false;

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || requestUrl.protocol.replace(":", "");
  if (protocol !== "http" && protocol !== "https") return false;

  return originUrl.origin === `${protocol}://${host}`;
}

async function removePreviousAvatar(memberId: string) {
  const dir = getMemberAvatarUploadDir(memberId);
  try {
    const files = await fs.readdir(dir);
    await Promise.all(files.filter((file) => /^avatar\.(?:jpg|png|webp)$/i.test(file)).map((file) => fs.unlink(path.join(dir, file)).catch(() => undefined)));
  } catch {}
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "無法確認請求來源" }, { status: 403 });
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "請先登入會員" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("avatar");
  if (!(file instanceof File)) return NextResponse.json({ error: "請選擇頭像照片" }, { status: 400 });
  const extension = MIME_EXTENSIONS[file.type];
  if (!extension) return NextResponse.json({ error: "頭像僅支援 JPG、PNG、WebP" }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) return NextResponse.json({ error: "頭像檔案需小於 5MB" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const dir = getMemberAvatarUploadDir(member.id);
  await fs.mkdir(dir, { recursive: true });
  await removePreviousAvatar(member.id);
  const fileName = `avatar.${extension}`;
  await fs.writeFile(path.join(dir, fileName), bytes);
  const avatarUrl = `/uploads/member-avatars/${encodeURIComponent(member.id)}/${fileName}?v=${Date.now()}`;
  const updated = await updateMemberProfile(member.id, { avatarUrl });
  return NextResponse.json({ ok: true, avatarUrl: updated?.avatarUrl ?? avatarUrl });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "無法確認請求來源" }, { status: 403 });
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "請先登入會員" }, { status: 401 });
  await removePreviousAvatar(member.id);
  await updateMemberProfile(member.id, { avatarUrl: "" });
  return NextResponse.json({ ok: true, fallbackUrl: member.pictureUrl || null });
}
