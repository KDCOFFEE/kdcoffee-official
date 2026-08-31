import { NextResponse } from "next/server";

import { getActiveMembershipRules } from "@/lib/membershipBusinessRules";
import { getDateOnlyInTimeZone } from "@/lib/checkoutRules";
import { addTaipeiCalendarDays, resolveCreditMemberPolicy } from "@/lib/membershipPolicies";

export const dynamic = "force-dynamic";

export async function GET() {
  const version = await getActiveMembershipRules();
  const rules = version.rules;
  const today = getDateOnlyInTimeZone(new Date());
  return NextResponse.json({
    rulesVersion: version.rulesVersion,
    pickup: {
      earliestStandardDate: addTaipeiCalendarDays(today, rules.pickup.preparationLeadDays),
      earliestCustomRoastDate: addTaipeiCalendarDays(today, rules.pickup.customRoastPreparationLeadDays),
      blockedDates: rules.pickup.blockedDates,
      datePickerMode: rules.pickup.datePickerMode,
    },
    subscription: {
      intervalsDays: rules.subscription.intervalOptions.filter((item) => item.enabled).map((item) => item.days),
      customCycleEnabled: rules.subscription.customCycleEnabled,
      customCycleMinDays: rules.subscription.customCycleMinDays,
      customCycleMaxDays: rules.subscription.customCycleMaxDays,
      earliestDate: addTaipeiCalendarDays(today, rules.subscription.preparationLeadDays),
    },
    credit: resolveCreditMemberPolicy(rules),
  });
}
