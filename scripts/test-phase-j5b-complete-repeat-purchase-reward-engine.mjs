import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const rulesTypes = read("lib/membershipRuleTypes.ts");
const rules = read("lib/membershipBusinessRules.ts");
const commerce = read("lib/membershipCommerce.ts");
const manager = read("components/admin/MembershipRulesManager.tsx");
const member = read("components/member/MemberReferralCenter.tsx");
const admin = read("app/admin/referrals/page.tsx");

const checks = [
  ["rules schema includes general repeat-purchase referral rate", rulesTypes.includes("repeatPurchaseRewardRate: number")],
  ["reward model distinguishes first, repeat, subscription and self purchase", commerce.includes('"new_referral" | "repeat_purchase" | "subscription" | "self_purchase"')],
  ["legacy levels inherit repeat-purchase rate from first-purchase rate", rules.includes("repeatPurchaseRewardRate: typeof level.repeatPurchaseRewardRate === \"number\" ? level.repeatPurchaseRewardRate : newReferralRewardRate")],
  ["default repeat-purchase rates follow existing generation rates", rules.includes("newReferralRewardRate: 5, repeatPurchaseRewardRate: 5, subscriptionRewardRate: 5")],
  ["server validates repeat-purchase referral rate", rules.includes("一般續購推薦回饋率不正確")],
  ["admin exposes first-purchase referral rate", manager.includes('label="首次消費推薦"')],
  ["admin exposes repeat-purchase referral rate", manager.includes('label="一般續購推薦"')],
  ["admin exposes subscription renewal referral rate", manager.includes('label="定期購續期"')],
  ["normal follow-up orders are classified as repeat_purchase", commerce.includes('alreadyHadFirstReferralPurchase ? "repeat_purchase" : "new_referral"')],
  ["first-purchase marker remains canonical", commerce.includes('item.type === "referral_new_qualified"')],
  ["member self-purchase reward is created only after prior valid consumption", commerce.includes("hadPriorValidConsumption") && commerce.includes("createSelfPurchaseRewardFromFulfillment")],
  ["self-purchase reward uses Owner-configurable rate", commerce.includes("const rewardRate = rules.selfPurchaseRewardRate")],
  ["self-purchase reward is separate from referral monthly cap", commerce.includes('reward.rewardType === "self_purchase" ? 0 : Object.values(state.referralRewards)')],
  ["refund/cancellation reversal still applies by source order", commerce.includes("cancelOrReverseReferralRewards") && commerce.includes("item.sourceOrderNumber === input.orderId")],
  ["member ledger labels self and repeat rewards clearly", member.includes("會員續購回饋") && member.includes("一般續購推薦回饋")],
  ["admin reward overview reports all four reward sources", admin.includes("一般續購推薦") && admin.includes("會員續購回饋")],
  ["internal PV fields remain intact", commerce.includes("effectivePV") && commerce.includes("rewardPV") && commerce.includes("pvRewardMoneyValue")],
];

let failed = 0;
checks.forEach(([label, ok], index) => {
  if (ok) console.log(`PASS ${index + 1}: ${label}`);
  else { console.error(`FAIL ${index + 1}: ${label}`); failed += 1; }
});
if (failed) process.exit(1);
console.log(`\nJ.5B targeted regression complete: ${checks.length} PASS`);
