import fs from "node:fs";
import assert from "node:assert/strict";

import {
  DEFAULT_MEMBERSHIP_RULES,
  normalizeMembershipBusinessRules,
  validateMembershipBusinessRules,
} from "../lib/membershipBusinessRules";

let passed = 0;

function check(
  condition: unknown,
  message: string,
) {
  assert.ok(condition, message);
  passed += 1;
  console.log(
    `PASS ${String(passed).padStart(2, "0")} ${message}`,
  );
}

console.log(
  "\n=== CASE 1 LEGACY BACKWARD COMPATIBILITY ===",
);

{
  const legacy =
    structuredClone(
      DEFAULT_MEMBERSHIP_RULES,
    ) as any;

  delete legacy.referral
    .selfPurchaseEligibilityMode;

  const normalized =
    normalizeMembershipBusinessRules(
      legacy,
    );

  check(
    normalized.referral
      .selfPurchaseEligibilityMode ===
      "after_prior_valid_consumption",
    "legacy rules preserve existing second-order behavior",
  );
}

console.log(
  "\n=== CASE 2 OWNER CAN ENABLE FIRST ORDER ===",
);

{
  const rules =
    structuredClone(
      DEFAULT_MEMBERSHIP_RULES,
    );

  rules.referral
    .selfPurchaseEligibilityMode =
    "first_completed_order";

  const validated =
    validateMembershipBusinessRules(
      rules,
    );

  check(
    validated.referral
      .selfPurchaseEligibilityMode ===
      "first_completed_order",
    "first completed order mode is valid",
  );
}

console.log(
  "\n=== CASE 3 OWNER CAN PRESERVE PRIOR-CONSUMPTION MODE ===",
);

{
  const rules =
    structuredClone(
      DEFAULT_MEMBERSHIP_RULES,
    );

  rules.referral
    .selfPurchaseEligibilityMode =
    "after_prior_valid_consumption";

  const validated =
    validateMembershipBusinessRules(
      rules,
    );

  check(
    validated.referral
      .selfPurchaseEligibilityMode ===
      "after_prior_valid_consumption",
    "prior valid consumption mode is valid",
  );
}

console.log(
  "\n=== CASE 4 INVALID MODE FAILS CLOSED ===",
);

{
  const rules =
    structuredClone(
      DEFAULT_MEMBERSHIP_RULES,
    ) as any;

  rules.referral
    .selfPurchaseEligibilityMode =
    "anything_goes";

  let rejected = false;

  try {
    validateMembershipBusinessRules(
      rules,
    );
  } catch {
    rejected = true;
  }

  check(
    rejected,
    "invalid self-purchase eligibility mode is rejected",
  );
}

console.log(
  "\n=== CASE 5 ENGINE WIRING ===",
);

{
  const source =
    fs.readFileSync(
      "lib/membershipCommerce.ts",
      "utf8",
    );

  check(
    source.includes(
      "const selfPurchaseEligible =",
    ),
    "engine has explicit self-purchase eligibility gate",
  );

  check(
    source.includes(
      '"first_completed_order"',
    ),
    "engine supports first completed order mode",
  );

  check(
    source.includes(
      "hadPriorValidConsumption",
    ),
    "engine preserves prior valid consumption path",
  );

  check(
    source.includes(
      "createSelfPurchaseRewardFromFulfillment",
    ),
    "eligible order still enters existing reward engine",
  );
}

console.log(
  "\n=== CASE 6 ADMIN WIRING ===",
);

{
  const source =
    fs.readFileSync(
      "components/admin/MembershipRulesManager.tsx",
      "utf8",
    );

  check(
    source.includes(
      "首筆完成訂單立即回饋",
    ),
    "Admin exposes first-order reward option",
  );

  check(
    source.includes(
      "第二筆完成消費起回饋",
    ),
    "Admin exposes legacy second-order option",
  );

  check(
    source.includes(
      "selfPurchaseEligibilityMode",
    ),
    "Admin writes canonical business rule",
  );
}

console.log(
  `\nJ.5D.6B2.2 PASS — ${passed}/${passed} checks passed`,
);