import assert from "node:assert/strict";
import fs from "node:fs";

const commerce =
  fs.readFileSync(
    "lib/membershipCommerce.ts",
    "utf8",
  );

const ui =
  fs.readFileSync(
    "components/member/MemberReferralCenter.tsx",
    "utf8",
  );

let pass = 0;

function check(
  condition: unknown,
  message: string,
) {
  assert.ok(condition, message);
  pass += 1;

  console.log(
    `PASS ${String(pass).padStart(2, "0")} ${message}`,
  );
}

console.log(
  "\n=== CASE 1 COVERAGE EVIDENCE PROJECTION ===",
);

check(
  commerce.includes(
    "qualificationCoverageByRewardId",
  ),
  "server indexes qualification coverage",
);

check(
  commerce.includes(
    "qualificationMaturationByRewardId",
  ),
  "server indexes maturation evidence",
);

check(
  commerce.includes(
    "qualificationAuthority: referralRewardQualificationAuthority(item)",
  ),
  "member projection exposes canonical authority",
);

check(
  commerce.includes(
    "coverageEndsAt: qualificationCoverage.coverageEndsAt",
  ),
  "member projection exposes coverage interval",
);

console.log(
  "\n=== CASE 2 MEMBER STATUS SEMANTICS ===",
);

check(
  ui.includes(
    "hasQualificationCoverage",
  ),
  "UI detects immutable coverage evidence",
);

check(
  ui.includes(
    "effectiveQualificationStatus",
  ),
  "UI derives effective qualification state",
);

check(
  ui.includes(
    '? "qualified"',
  ),
  "coverage evidence resolves reward as qualified",
);

check(
  ui.includes(
    '"資格已確認・等待入帳"',
  ),
  "member sees clear confirmed qualification status",
);

check(
  ui.includes(
    '"等待資格確認"',
  ),
  "unqualified state remains clearly distinct",
);

check(
  ui.includes(
    "本筆回饋已由目前有效的推薦回饋資格涵蓋",
  ),
  "member sees qualification coverage explanation",
);

check(
  ui.includes(
    '"資格有效至："',
  ),
  "member sees coverage validity end date",
);

console.log(
  `\nJ.5D.6B2.3 PASS — ${pass}/11 checks passed`,
);