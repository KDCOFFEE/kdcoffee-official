import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  advanceMembershipTestLabClock,
  applyMembershipTestLabPreset,
  configureMembershipTestLab,
  createMembershipTestLabOrder,
  getMembershipTestLabSnapshot,
  isMembershipTestLabEnabled,
  resetMembershipTestLab,
  runMembershipTestLabScheduler,
  simulateReferralAttack,
  testMembershipLabCycle,
  transitionMembershipTestLabOrder,
  type SimulatedOrder,
} from "@/lib/membershipTestLab";

export const dynamic = "force-dynamic";

function unavailable() { return NextResponse.json({ error: "會員制度測試實驗室目前未啟用" }, { status: 404 }); }

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isMembershipTestLabEnabled()) return unavailable();
  try { return NextResponse.json(await getMembershipTestLabSnapshot()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "無法讀取測試情境" }, { status: 500 }); }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isMembershipTestLabEnabled()) return unavailable();
  try {
    const body = await request.json();
    let result: unknown;
    if (body.action === "preset") result = await applyMembershipTestLabPreset(String(body.presetId || "paid-five-level"));
    else if (body.action === "configure") result = await configureMembershipTestLab(body.input || {});
    else if (body.action === "create-order") result = await createMembershipTestLabOrder(body.input || {});
    else if (body.action === "transition-order") result = await transitionMembershipTestLabOrder(String(body.orderId), String(body.status) as SimulatedOrder["status"]);
    else if (body.action === "advance-clock") result = await advanceMembershipTestLabClock({ days: body.days == null ? undefined : Number(body.days), dateTime: body.dateTime || undefined });
    else if (body.action === "run-scheduler") result = await runMembershipTestLabScheduler();
    else if (body.action === "test-cycle") result = await testMembershipLabCycle(Number(body.days));
    else if (body.action === "attack") result = await simulateReferralAttack({ referrerMemberId: String(body.referrerMemberId), referredMemberId: String(body.referredMemberId) });
    else if (body.action === "reset") {
      if (body.confirmation !== "CLEAR SIMULATION ONLY") return NextResponse.json({ error: "需要確認只清除模擬資料" }, { status: 400 });
      result = await resetMembershipTestLab();
    } else return NextResponse.json({ error: "未知的模擬動作" }, { status: 400 });
    return NextResponse.json({ ok: true, result, snapshot: await getMembershipTestLabSnapshot() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "模擬操作失敗" }, { status: 400 });
  }
}
