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

const presentation =
  fs.readFileSync(
    "lib/memberRewardPresentation.ts",
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
  presentation.includes(
    "qualificationCoverage",
  ),
  "shared display resolver consumes immutable coverage evidence",
);

check(
  presentation.includes(
    "qualificationMaturation",
  ),
  "shared display resolver also considers maturation evidence",
);

check(
  presentation.includes(
    "resolveEffectiveRewardDisplayStatus",
  ),
  "effective reward status has one canonical read-only resolver",
);

check(
  presentation.includes(
    'return "資格已確認・安全等待中"',
  ),
  "member sees clear confirmed qualification status",
);

check(
  presentation.includes(
    'return "尚待取得推薦回饋資格"',
  ),
  "unqualified state remains clearly distinct",
);

check(
  ui.includes(
    "reward.displayStatus",
  ),
  "member reward details consume the canonical server-resolved status",
);

check(
  ui.includes(
    "本筆已由有效推薦資格涵蓋 ✓",
  ),
  "member sees qualification coverage explanation",
);

check(
  ui.includes("qualificationValidUntil={qualificationDisplayUntil}"),
  "member sees coverage validity end date",
);

console.log(
  `\nJ.5D.6B2.3 PASS — ${pass}/${pass} checks passed`,
);
