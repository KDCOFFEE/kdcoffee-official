import { readFile } from "node:fs/promises";

const read = (file) => readFile(file, "utf8");

const files = {
  types: await read("lib/membershipRuleTypes.ts"),
  rules: await read("lib/membershipBusinessRules.ts"),
  admin: await read("components/admin/MembershipRulesManager.tsx"),
  helper: await read("lib/referralAttribution.ts"),
  api: await read("app/api/referral-attribution/route.ts"),
  capture: await read("components/member/ReferralAttributionCapture.tsx"),
  layout: await read("app/layout.tsx"),
  memberAuth: await read("lib/memberAuth.ts"),
  emailRegister: await read("app/api/auth/email/register/route.ts"),
  emailLogin: await read("app/api/auth/email/login/route.ts"),
  lineLogin: await read("app/api/auth/line/login/route.ts"),
  lineCallback: await read("app/api/auth/line/callback/route.ts"),
};

const checks = [
  ["type enabled", files.types.includes("referralAttributionEnabled: boolean")],
  ["type minutes", files.types.includes("referralAttributionSessionMinutes: number")],
  ["default enabled", files.rules.includes("referralAttributionEnabled: true")],
  ["default sixty", files.rules.includes("referralAttributionSessionMinutes: 60")],
  ["validator", files.rules.includes("referralAttributionSessionMinutes, 5, 1440")],
  ["admin toggle", files.admin.includes("referralAttributionEnabled")],
  ["admin minutes", files.admin.includes("referralAttributionSessionMinutes")],
  ["httpOnly", files.helper.includes("httpOnly: true")],
  ["sameSite lax", files.helper.includes('sameSite: "lax"')],
  ["HMAC SHA256", files.helper.includes('createHmac("sha256"')],
  ["session secret", files.helper.includes("AUTH_SESSION_SECRET")],
  ["domain separated signature", files.helper.includes("referral-attribution:${payload}")],
  ["timing safe compare", files.helper.includes("timingSafeEqual")],
  ["signed token create", files.helper.includes("createReferralAttributionToken")],
  ["signed token verify", files.helper.includes("verifyReferralAttributionToken")],
  ["token expiry", files.helper.includes("parsed.exp <= Date.now()")],
  ["policy independent", !files.helper.includes("referral.programEnabled &&")],
  ["server validates", files.api.includes("isValidReferralAttributionCode")],
  ["existing blocked", files.api.includes('reason: "existing-member"')],
  ["last touch set", files.api.includes("setReferralAttributionCookie")],
  ["global ref", files.capture.includes('.get("ref")')],
  ["layout capture", files.layout.includes("<ReferralAttributionCapture />")],
  ["email candidate", files.emailRegister.includes("resolveReferralAttributionCandidate")],
  ["email register clear", files.emailRegister.includes("clearReferralAttributionCookie(response)")],
  ["email login clear", files.emailLogin.includes("clearReferralAttributionCookie(response)")],
  ["LINE new true", files.memberAuth.includes("createdNewMember: true")],
  ["LINE existing false", files.memberAuth.includes("createdNewMember: false")],
  ["LINE pre OAuth", files.lineLogin.includes("setReferralAttributionCookie")],
  ["LINE new only", files.lineCallback.includes("login.createdNewMember && referralCode")],
  ["LINE clear", files.lineCallback.includes("clearReferralAttributionCookie(response)")],
];

let failed = 0;

for (const [label, pass] of checks) {
  console.log(`${pass ? "PASS" : "FAIL"} - ${label}`);
  if (!pass) failed += 1;
}

if (failed) {
  console.error(`FAILED: ${failed} assertion(s)`);
  process.exit(1);
}

console.log(`PASS: ${checks.length} J.5D.2 assertions`);
