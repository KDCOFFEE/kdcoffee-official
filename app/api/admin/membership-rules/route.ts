import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  MembershipRulesValidationError,
  MembershipRulesVersionConflictError,
  readMembershipRulesStore,
  saveMembershipBusinessRules,
} from "@/lib/membershipBusinessRules";
import { previewMembershipRulesImpact } from "@/lib/membershipCommerce";
import { getLiveWebsiteData } from "@/data/websiteData";
import { listActiveSkusMissingPv } from "@/lib/referralPv";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const store = await readMembershipRulesStore();
  return NextResponse.json({ revision: store.revision, version: store.activeRulesVersion, rules: store.versions.at(-1)?.rules });
}

export async function PUT(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    if (body.rules?.referral?.referralRewardCalculationMode === "pv") {
      const missingPv = listActiveSkusMissingPv(await getLiveWebsiteData());
      if (missingPv.length) return NextResponse.json({ error: `尚有 ${missingPv.length} 個販售中規格未設定 PV，無法切換。`, missingPv }, { status: 400 });
    }
    const store = await saveMembershipBusinessRules({ expectedRevision: Number(body.expectedRevision), rules: body.rules });
    return NextResponse.json({ ok: true, revision: store.revision, version: store.activeRulesVersion, rules: store.versions.at(-1)?.rules });
  } catch (error) {
    if (error instanceof MembershipRulesVersionConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof MembershipRulesValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "儲存失敗" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const impact = await previewMembershipRulesImpact(body.rules);
    const missingPv = body.rules?.referral?.referralRewardCalculationMode === "pv" ? listActiveSkusMissingPv(await getLiveWebsiteData()) : [];
    return NextResponse.json({ ...impact, missingPv, pvSwitchBlocked: missingPv.length > 0 });
  } catch (error) {
    if (error instanceof MembershipRulesValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "無法預覽影響" }, { status: 500 });
  }
}
