import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/memberAuth";
import { getMemberCreditPassbook } from "@/lib/memberCreditPassbookStore";
import { readCreditDisplayCopy } from "@/lib/creditDisplayCopy";
import { parseMemberCreditPassbookCursor } from "@/lib/memberCreditPassbook";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const member = await getCurrentMember();
  const copy = await readCreditDisplayCopy();
  if (!member) return NextResponse.json({ error: copy("credit.passbook.loginRequired") }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const rawOffset = params.get("offset") ?? "0";
  const cursor = params.get("cursor") ?? undefined;
  try {
    if (!/^\d{1,9}$/.test(rawOffset)) throw new Error("Invalid offset");
    if (cursor !== undefined) parseMemberCreditPassbookCursor(cursor);
  } catch {
    return NextResponse.json({ error: copy("credit.passbook.invalidPage") }, { status: 400 });
  }
  try {
    return NextResponse.json(await getMemberCreditPassbook(member.id, Number(rawOffset), undefined, cursor), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: copy("credit.passbook.loadError") }, { status: 500 });
  }
}
