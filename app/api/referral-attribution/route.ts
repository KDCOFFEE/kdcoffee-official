import { NextResponse } from "next/server";

import { getCurrentMember } from "@/lib/memberAuth";
import {
  clearReferralAttributionCookie,
  getReferralAttributionPolicy,
  isValidReferralAttributionCode,
  normalizeReferralAttributionCode,
  setReferralAttributionCookie,
} from "@/lib/referralAttribution";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const member = await getCurrentMember();

    if (member) {
      const response = NextResponse.json({
        ok: true,
        tracked: false,
        reason: "existing-member",
      });

      clearReferralAttributionCookie(response);
      return response;
    }

    const body = await request.json();

    const referralCode =
      normalizeReferralAttributionCode(
        body.referralCode,
      );

    const policy = await getReferralAttributionPolicy();

    if (!policy.enabled) {
      const response = NextResponse.json({
        ok: true,
        tracked: false,
        reason: "disabled",
      });

      clearReferralAttributionCookie(response);
      return response;
    }

    if (
      !referralCode ||
      !(await isValidReferralAttributionCode(referralCode))
    ) {
      return NextResponse.json(
        {
          error: "\u63a8\u85a6\u9023\u7d50\u7121\u6548",
          tracked: false,
        },
        { status: 400 },
      );
    }

    const response = NextResponse.json({
      ok: true,
      tracked: true,
      sessionMinutes: policy.sessionMinutes,
    });

    setReferralAttributionCookie(
      response,
      referralCode,
      policy.sessionMinutes,
    );

    return response;
  } catch {
    return NextResponse.json(
      {
        error: "\u63a8\u85a6\u4f86\u6e90\u66ab\u6642\u7121\u6cd5\u8a18\u9304",
      },
      { status: 500 },
    );
  }
}
