import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_MEMBERSHIP_RULES,
  MembershipRulesValidationError,
  normalizeMembershipBusinessRules,
  readMembershipRulesStore,
  saveMembershipBusinessRules,
  validateMembershipBusinessRules,
} from "../lib/membershipBusinessRules";

let checks = 0;
function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks += 1;
  console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`);
}

function rejectsRules(mutator: (rules: Record<string, unknown>) => void, label: string) {
  const candidate = structuredClone(DEFAULT_MEMBERSHIP_RULES) as unknown as Record<string, unknown>;
  mutator(candidate);
  assert.throws(() => validateMembershipBusinessRules(candidate), MembershipRulesValidationError, label);
  checks += 1;
  console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`);
}

const defaults = DEFAULT_MEMBERSHIP_RULES.referral.payoutQualification;
check(defaults.generalMember.rollingWindowDays === 30, "一般會員累積期間預設 30 天");
check(defaults.generalMember.cumulativeValidConsumptionThreshold === 1_500, "一般會員門檻預設 NT$1500");
check(defaults.activeSubscriptionMember.rollingWindowDays === 30, "訂閱會員累積期間預設 30 天");
check(defaults.activeSubscriptionMember.cumulativeValidConsumptionThreshold === 1_000, "訂閱會員門檻預設 NT$1000");
check(defaults.mode === "either", "資格判定模式預設 either");
check(defaults.validConsumption.includeCreditDiscount === true, "有效消費預設包含抵用金折抵");
check(defaults.validConsumption.includeShipping === false, "有效消費預設不包含運費");
check(defaults.rewardCoverage.lookbackDays === 7, "獎勵涵蓋回看預設 7 天");
check(defaults.rewardCoverage.forwardDays === 30, "獎勵涵蓋未來預設 30 天");
check(defaults.excessConsumptionMode === "reset", "超額消費預設 reset");
check(DEFAULT_MEMBERSHIP_RULES.referral.referralRewardBaseWaitingDays === 7, "基礎等待預設 7 天");
check(DEFAULT_MEMBERSHIP_RULES.referral.referralRewardReturnProtectionDays === 7, "退貨保護預設 7 天");
check(DEFAULT_MEMBERSHIP_RULES.notification.events.credit_reward.channels.includes("line"), "推薦獎勵發放預設啟用 LINE");
check(DEFAULT_MEMBERSHIP_RULES.notification.events.credit_reward.channels.includes("email"), "推薦獎勵發放預設啟用 Email");

const legacyRules = structuredClone(DEFAULT_MEMBERSHIP_RULES) as unknown as Record<string, unknown>;
const legacyReferral = legacyRules.referral as Record<string, unknown>;
delete legacyReferral.payoutQualification;
delete legacyReferral.referralRewardReturnProtectionDays;
legacyReferral.referralNewRewardReleaseDelayDays = 7;
const normalizedCurrent = normalizeMembershipBusinessRules(legacyRules);
check(normalizedCurrent.referral.payoutQualification.mode === "either", "舊規則缺少新群組時補入目前預設");
check(normalizedCurrent.referral.referralRewardReturnProtectionDays === 7, "一般新規則正規化使用目前 7 天預設");

const explicitHistorical = structuredClone(legacyRules);
(explicitHistorical.referral as Record<string, unknown>).referralRewardReturnProtectionDays = 3;
check(normalizeMembershipBusinessRules(explicitHistorical).referral.referralRewardReturnProtectionDays === 3, "明確歷史 3 天值維持不變");

rejectsRules((rules) => { ((rules.referral as Record<string, unknown>).payoutQualification as Record<string, unknown>).mode = "invalid"; }, "拒絕未知資格判定模式");
rejectsRules((rules) => { ((rules.referral as Record<string, unknown>).payoutQualification as Record<string, unknown>).excessConsumptionMode = "invalid"; }, "拒絕未知超額消費模式");
rejectsRules((rules) => { ((((rules.referral as Record<string, unknown>).payoutQualification as Record<string, unknown>).generalMember as Record<string, unknown>)).rollingWindowDays = 0; }, "拒絕非正整數累積期間");
rejectsRules((rules) => { ((((rules.referral as Record<string, unknown>).payoutQualification as Record<string, unknown>).generalMember as Record<string, unknown>)).cumulativeValidConsumptionThreshold = -1; }, "拒絕負數有效消費門檻");
rejectsRules((rules) => { ((((rules.referral as Record<string, unknown>).payoutQualification as Record<string, unknown>).validConsumption as Record<string, unknown>)).includeShipping = "false"; }, "拒絕非布林有效消費設定");
rejectsRules((rules) => { (((rules.notification as Record<string, unknown>).events as Record<string, Record<string, unknown>>).credit_reward.channels as unknown[]) = ["line", "fax"]; }, "拒絕不支援的通知管道");

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kd-i4b3b-"));
const rulesFile = path.join(temporaryRoot, "business-rules.json");
try {
  const timestamp = "2026-08-01T00:00:00.000Z";
  const legacyVersion = {
    rulesVersion: 1,
    effectiveAt: timestamp,
    createdAt: timestamp,
    createdBy: "system" as const,
    rules: legacyRules,
  };
  const legacyStore = {
    schemaVersion: 1,
    revision: 0,
    activeRulesVersion: 1,
    versions: [legacyVersion],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await fs.writeFile(rulesFile, `${JSON.stringify(legacyStore, null, 2)}\n`, "utf8");
  const originalVersionJson = JSON.stringify(legacyStore.versions[0]);

  const readLegacy = await readMembershipRulesStore(rulesFile);
  check(readLegacy.versions[0].rules.referral.payoutQualification.mode === "either", "歷史檔讀取時安全補入新欄位");
  check(readLegacy.versions[0].rules.referral.referralRewardReturnProtectionDays === 3, "缺欄位的歷史版本讀取時保留舊 3 天語意");

  const ownerRules = structuredClone(readLegacy.versions[0].rules);
  ownerRules.referral.payoutQualification.mode = "both";
  ownerRules.referral.payoutQualification.generalMember.rollingWindowDays = 45;
  ownerRules.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold = 2_000;
  ownerRules.referral.payoutQualification.activeSubscriptionMember.rollingWindowDays = 60;
  ownerRules.referral.payoutQualification.activeSubscriptionMember.cumulativeValidConsumptionThreshold = 1_200;
  ownerRules.referral.payoutQualification.validConsumption.includeCreditDiscount = false;
  ownerRules.referral.payoutQualification.validConsumption.includeShipping = true;
  ownerRules.referral.payoutQualification.rewardCoverage.lookbackDays = 14;
  ownerRules.referral.payoutQualification.rewardCoverage.forwardDays = 45;
  ownerRules.referral.payoutQualification.excessConsumptionMode = "carry";
  ownerRules.referral.referralRewardReturnProtectionDays = 7;
  ownerRules.notification.events.credit_reward.channels = ["member_center", "email"];

  const saved = await saveMembershipBusinessRules({ expectedRevision: 0, rules: ownerRules, now: new Date("2026-08-02T00:00:00.000Z") }, rulesFile);
  check(saved.revision === 1 && saved.activeRulesVersion === 2 && saved.versions.length === 2, "Owner 儲存附加新版本");
  const persisted = JSON.parse(await fs.readFile(rulesFile, "utf8"));
  check(JSON.stringify(persisted.versions[0]) === originalVersionJson, "Owner 儲存不重寫既有歷史版本");
  check(persisted.versions[1].rules.referral.payoutQualification.mode === "both", "新資格設定完整序列化");
  check(persisted.versions[1].rules.referral.referralRewardReturnProtectionDays === 7, "新 Owner 版本明確儲存 7 天退貨保護");
  check(JSON.stringify(persisted.versions[1].rules.notification.events.credit_reward.channels) === JSON.stringify(["member_center", "email"]), "通知管道設定正確 round-trip");
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}

const managerSource = await fs.readFile(path.join(process.cwd(), "components", "admin", "MembershipRulesManager.tsx"), "utf8");
for (const label of ["推薦獎勵領取資格", "資格判定模式", "一般會員資格", "訂閱會員資格", "有效消費計算", "獎勵涵蓋期間", "超額消費處理", "獎勵安全等待", "通知方式"]) {
  check(managerSource.includes(label), `Admin 顯示「${label}」`);
}
check(managerSource.includes("現階段不會改變既有發放流程"), "Admin 清楚標示新引擎尚未接用");

console.log(`Phase I.4B.3B business rules: ${checks} checks passed.`);
