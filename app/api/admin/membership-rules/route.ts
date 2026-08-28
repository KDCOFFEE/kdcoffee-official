import { NextResponse } from "next/server";

import { isAdminAuthenticated } from "@/lib/adminAuth";
import {
  MembershipRulesValidationError,
  MembershipRulesVersionConflictError,
  readMembershipRulesStore,
  saveMembershipBusinessRules,
} from "@/lib/membershipBusinessRules";

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
    const store = await saveMembershipBusinessRules({ expectedRevision: Number(body.expectedRevision), rules: body.rules });
    return NextResponse.json({ ok: true, revision: store.revision, version: store.activeRulesVersion, rules: store.versions.at(-1)?.rules });
  } catch (error) {
    if (error instanceof MembershipRulesVersionConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof MembershipRulesValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "儲存失敗" }, { status: 500 });
  }
}
