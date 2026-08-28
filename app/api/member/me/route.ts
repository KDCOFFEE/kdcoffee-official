import { NextResponse } from "next/server";
import { getCurrentMember, updateMemberProfile } from "@/lib/memberAuth";

function clean(value: unknown, max: number) { return String(value ?? "").trim().slice(0, max); }
function publicMember<T extends {
  lineUserId?: string;
  loginEmail?: string;
  passwordHash?: string;
  passwordSalt?: string;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: string;
  passwordResetRequestedAt?: string;
} | null>(member: T) {
  if (!member) return null;
  const safe = { ...member };
  delete safe.lineUserId;
  delete safe.loginEmail;
  delete safe.passwordHash;
  delete safe.passwordSalt;
  delete safe.passwordResetTokenHash;
  delete safe.passwordResetExpiresAt;
  delete safe.passwordResetRequestedAt;
  return safe;
}
export async function GET() {
  const member = await getCurrentMember();
  return NextResponse.json({ member: publicMember(member) }, { headers: { "Cache-Control": "no-store" } });
}
export async function PATCH(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "請先登入會員" }, { status: 401 });
  const body = await request.json();
  const phone = clean(body.phone, 10);
  const email = clean(body.email, 120);
  if (phone && !/^09\d{8}$/.test(phone)) return NextResponse.json({ error: "手機號碼格式不正確" }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Email 格式不正確" }, { status: 400 });
  const favoriteStore = body.favoriteStore?.id ? {
    id: clean(body.favoriteStore.id, 10), name: clean(body.favoriteStore.name, 30), address: clean(body.favoriteStore.address, 100),
    city: clean(body.favoriteStore.city, 20), district: clean(body.favoriteStore.district, 20),
  } : undefined;
  const updated = await updateMemberProfile(member.id, { pickupName: clean(body.pickupName, 20), phone, email, favoriteStore });
  return NextResponse.json({ member: publicMember(updated) });
}
