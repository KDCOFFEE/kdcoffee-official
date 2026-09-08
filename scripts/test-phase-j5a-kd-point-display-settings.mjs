import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let passed = 0;
function check(condition, label) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`PASS ${passed}: ${label}`);
}
const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");

const types = read("lib/membershipRuleTypes.ts");
const rules = read("lib/membershipBusinessRules.ts");
const manager = read("components/admin/MembershipRulesManager.tsx");
const product = read("components/commerce/AddToCart.tsx");
const page = read("app/works/[slug]/page.tsx");
const center = read("components/member/MemberReferralCenter.tsx");
const org = read("components/member/MemberReferralOrgChart.tsx");
const commerce = read("lib/membershipCommerce.ts");

check(types.includes("pointDisplayName: string"), "rules schema includes Owner-editable point display name");
check(types.includes("selfPurchaseRewardRate: number"), "rules schema includes configurable self-purchase reward rate");
check(rules.includes('pointDisplayName: "KD點"'), "backward-compatible default display name is KD點");
check(rules.includes("selfPurchaseRewardRate: 5"), "default self-purchase reward rate is 5% and stored in rules");
check(rules.includes("點數顯示名稱需為 1～24 個字元"), "display name is server-side validated");
check(rules.includes("會員續購回饋比例不正確"), "self-purchase reward rate is server-side validated");
check(manager.includes('label="點數顯示名稱"'), "admin section exposes point display name beside reward calculation settings");
check(manager.includes('label="會員續購回饋"'), "admin section exposes configurable self-purchase reward rate");
check(manager.includes("推薦回饋設定") && manager.includes("referral-rate-row"), "generation reward-rate editor uses optimized row UI");
check(product.includes('pointDisplayName = "KD點"') && product.includes("${pointDisplayName}"), "product purchase UI uses configured display name");
check(page.includes("pointDisplayName={membershipRules.rules.referral.pointDisplayName}"), "product page passes active rules display name to purchase UI");
check(center.includes('data.pointDisplayName || "KD點"'), "member reward ledger uses configured display name");
check(org.includes('pointDisplayName || "KD點"'), "member org-chart order viewer uses configured display name");
check(commerce.includes("pointDisplayName: version.rules.referral.pointDisplayName"), "org-chart payload receives active display name");
check(commerce.includes("const pointDisplayName = version.rules.referral.pointDisplayName || \"KD點\""), "member referral payload receives active display name");
check(rules.includes("pvRewardMoneyValue") && commerce.includes("effectivePV"), "internal PV engine fields remain intact for compatibility");

console.log(`\nJ.5A targeted regression complete: ${passed} PASS`);
