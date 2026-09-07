import fs from "node:fs";
const page = fs.readFileSync("app/member/page.tsx", "utf8");

const checks = [
  ["login branch has no stray dashboard closing div", !page.includes("</section>\n        </div>\n      </main>\n    );\n  }\n\n  /**")],
  ["dashboard wrapper opens once", (page.match(/className="member-dashboard-content"/g) || []).length === 1],
  ["dashboard wrapper closes before member card closes", page.includes('</form>\n        </div>\n      </section>\n    </main>')],
  ["visual redesign preserved", page.includes("member-welcome-hero") && page.includes("member-quick-action-grid")],
  ["personalized welcome preserved", page.includes('`${memberName}，歡迎回來`')],
  ["existing referral center preserved", page.includes("<MemberReferralCenter />")],
  ["existing subscription preserved", page.includes("<MemberSubscriptionExperience")],
  ["orders preserved", page.includes('className="member-orders"')],
];

let pass = 0;
for (const [label, ok] of checks) {
  if (!ok) {
    console.error(`FAIL ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${label}`);
    pass++;
  }
}
if (process.exitCode) process.exit(1);
console.log(`PHASE J.3C.1A-H1 JSX structure hotfix assertions: ${pass} PASS`);
