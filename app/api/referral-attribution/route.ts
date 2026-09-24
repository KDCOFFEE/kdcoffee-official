import { NextResponse } from "next/server";

import { getCurrentMember } from "@/lib/memberAuth";
import {
  clearReferralAttributionCookie,
  getReferralAttributionPolicy,
  isValidReferralAttributionCode,
  normalizeReferralAttributionCode,
  setReferralAttributionCookie,
} from "@/lib/referralAttribution";
import {
  clearRetailPromotionAttributionCookie,
  getRetailPromotionAttributionPolicy,
  setRetailPromotionAttributionCookie,
} from "@/lib/retailPromotionAttribution";

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
      clearRetailPromotionAttributionCookie(response);
      return response;
    }

    const body = await request.json();

    const referralCode =
      normalizeReferralAttributionCode(
        body.referralCode,
      );

    const [referralPolicy, retailPromotionPolicy] = await Promise.all([
      getReferralAttributionPolicy(),
      getRetailPromotionAttributionPolicy(),
    ]);

    if (!referralPolicy.enabled && !retailPromotionPolicy.enabled) {
      const response = NextResponse.json({
        ok: true,
        tracked: false,
        reason: "disabled",
      });

      clearReferralAttributionCookie(response);
      clearRetailPromotionAttributionCookie(response);
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
      referralTracked: referralPolicy.enabled,
      retailPromotionTracked: retailPromotionPolicy.enabled,
      sessionMinutes: referralPolicy.enabled ? referralPolicy.sessionMinutes : undefined,
      attributionWindowDays: retailPromotionPolicy.enabled ? retailPromotionPolicy.attributionWindowDays : undefined,
    });

    if (referralPolicy.enabled) {
      setReferralAttributionCookie(response, referralCode, referralPolicy.sessionMinutes);
    } else {
      clearReferralAttributionCookie(response);
    }
    if (retailPromotionPolicy.enabled) {
      setRetailPromotionAttributionCookie(response, {
        referralCode,
        attributionWindowDays: retailPromotionPolicy.attributionWindowDays,
      });
    } else {
      clearRetailPromotionAttributionCookie(response);
    }

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
