import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const moduleApi = await import("node:module") as unknown as {
  registerHooks: (hooks: {
    resolve: (
      specifier: string,
      context: unknown,
      nextResolve: (specifier: string, context: unknown) => unknown,
    ) => unknown;
  }) => void;
};
moduleApi.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server") return nextResolve("next/server.js", context);
    return nextResolve(specifier, context);
  },
});

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j5d8b-phone-api-"));
process.env.KD_DATA_DIR = temporaryRoot;
process.env.AUTH_SESSION_SECRET = "j5d8b-auth-secret-that-is-longer-than-thirty-two-characters";
process.env.MEMBER_IDENTITY_SECRET = "j5d8b-identity-secret-that-is-longer-than-thirty-two-characters";

const rulesApi = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");
const identity = await import("../lib/memberIdentity");
const auth = await import("../lib/memberAuth");
const registerRoute = await import("../app/api/auth/phone/register/route");
const loginRoute = await import("../app/api/auth/phone/login/route");

let checks = 0;
function check(value: unknown, label: string) {
  assert.ok(value, label);
  checks += 1;
  console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`);
}

function request(pathname: string, body: Record<string, unknown>) {
  return new Request(`https://kdcoffee.test${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setCookies(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? [response.headers.get("set-cookie") || ""];
}

function assertSafeResponse(text: string, password: string) {
  assert.doesNotMatch(text, new RegExp(password.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  assert.doesNotMatch(text, /passwordHash|passwordSalt|subjectHash|identityHash|member_[A-Za-z0-9_-]+/iu);
  checks += 2;
}

async function register(body: Record<string, unknown>) {
  return registerRoute.POST(request("/api/auth/phone/register", body));
}

async function login(body: Record<string, unknown>) {
  return loginRoute.POST(request("/api/auth/phone/login", body));
}

try {
  check(typeof registerRoute.POST === "function", "phone register route exists");
  check(typeof loginRoute.POST === "function", "phone login route exists");

  const rules = structuredClone(rulesApi.DEFAULT_MEMBERSHIP_RULES);
  rules.referral.referralAttributionEnabled = true;
  await rulesApi.saveMembershipBusinessRules(
    { expectedRevision: 0, rules, now: new Date("2026-09-25T00:00:00.000Z") },
  );

  const referrer = await identity.provisionCanonicalMember({
    provider: "email",
    subject: "j5d8b-referrer@example.test",
    persistMember: async () => undefined,
  });
  const referralCode = commerce.referralCodeForMember(referrer.member.memberId);
  const password = "Phone-API-Password-2026";

  const invalidPhone = await register({ phone: "0812345678", password, passwordConfirmation: password, referralCode });
  check(invalidPhone.status === 400, "invalid Taiwan phone returns 400");
  const shortPassword = await register({ phone: "0912000001", password: "short", passwordConfirmation: "short", referralCode });
  check(shortPassword.status === 400, "short password returns 400");
  const mismatch = await register({ phone: "0912000001", password, passwordConfirmation: `${password}x`, referralCode });
  check(mismatch.status === 400, "password mismatch returns 400");

  const localRegistration = await register({
    phone: "0912-345-678",
    password,
    passwordConfirmation: password,
    referralCode,
  });
  check(localRegistration.status === 201, "local Taiwan phone registers successfully");
  const localBody = await localRegistration.text();
  check(JSON.parse(localBody).ok === true, "registration returns small success JSON");
  assertSafeResponse(localBody, password);
  const localCookies = setCookies(localRegistration).join("\n");
  check(localCookies.includes(`${auth.MEMBER_SESSION_COOKIE}=`), "registration creates the standard member session cookie");
  check(localCookies.includes("kd_referral_attribution=") && localCookies.includes("kd_retail_promotion_attribution="), "registration clears referral and Retail Promotion attribution cookies");

  const localCanonical = await identity.resolveMemberByIdentity("phone", "+886 912 345 678");
  check(Boolean(localCanonical), "registration creates a canonical phone member");
  check(/^1962\d{5}$/u.test(localCanonical?.memberNumber || ""), "registration allocates accepted 1962 member number");
  const localMember = localCanonical ? await auth.readMember(localCanonical.memberId) : null;
  check(localMember?.phone === "0912345678", "contact phone remains local-format profile data");

  const internationalRegistration = await register({
    phone: "+886 988 111 222",
    password,
    passwordConfirmation: password,
    referralCode,
  });
  check(internationalRegistration.status === 201, "+886 Taiwan phone registers successfully");
  check(Boolean(await identity.resolveMemberByIdentity("phone", "0988-111-222")), "+886 registration uses canonical normalization");

  const duplicate = await register({ phone: "+886-912-345-678", password, passwordConfirmation: password, referralCode });
  check(duplicate.status === 409, "alternate formatting cannot bypass duplicate protection");
  const duplicateBody = await duplicate.text();
  check(duplicateBody.includes("已經註冊過") && !duplicateBody.includes(localCanonical?.memberId || "__none__"), "duplicate response is consumer-safe");

  const successfulLogin = await login({ phone: "+886 912 345 678", password });
  check(successfulLogin.status === 200, "valid phone login succeeds");
  const loginBody = await successfulLogin.text();
  assertSafeResponse(loginBody, password);
  const loginCookies = setCookies(successfulLogin).join("\n");
  check(loginCookies.includes(`${auth.MEMBER_SESSION_COOKIE}=`), "login creates the standard member session cookie");
  check(loginCookies.includes("kd_referral_attribution=") && loginCookies.includes("kd_retail_promotion_attribution="), "login clears stale attribution cookies");

  const wrongPassword = await login({ phone: "0912345678", password: "wrong-password" });
  const unknownPhone = await login({ phone: "0977000000", password });
  const invalidFormat = await login({ phone: "not-a-phone", password });
  const wrongError = await wrongPassword.text();
  const unknownError = await unknownPhone.text();
  const invalidError = await invalidFormat.text();
  check(wrongPassword.status === 401 && unknownPhone.status === 401 && invalidFormat.status === 401, "wrong, unknown, and malformed credentials all return 401");
  check(wrongError === unknownError && unknownError === invalidError, "invalid login variants use the same generic error");

  const registry = await identity.getIdentityRegistrySnapshot();
  const localRelations = Object.values((await commerce.readMembershipCommerceState()).referrals)
    .filter((relation) => relation.referredMemberId === localCanonical?.memberId);
  check(localRelations.length === 1 && localRelations[0].referrerMemberId === referrer.member.memberId, "trusted referral registration assigns the normal member relationship once");
  check(Object.values(registry.identities).filter((entry) => entry.provider === "phone").length === 2, "duplicate and invalid requests create no extra phone identity");

  const invalidReferral = await register({
    phone: "0912000002",
    password,
    passwordConfirmation: password,
    referralCode: "KDFFFFFFFFFF",
  });
  check(invalidReferral.status === 400, "unknown referral code is rejected before account creation");
  check((await identity.resolveMemberByIdentity("phone", "0912000002")) === null, "invalid referral cannot create a member or relationship");

  const commerceState = await commerce.readMembershipCommerceState();
  check(Object.keys(commerceState.retailPromotionRewards).length === 0, "phone member registration creates no guest Retail Promotion reward");

  const contactOnlyId = "j5d8b-contact-only";
  const now = new Date().toISOString();
  await fs.writeFile(path.join(temporaryRoot, "members", `${contactOnlyId}.json`), `${JSON.stringify({
    id: contactOnlyId,
    displayName: "Contact only",
    phone: "0966-123-456",
    createdAt: now,
    lastLoginAt: now,
  }, null, 2)}\n`, "utf8");
  const contactOnlyLogin = await login({ phone: "0966123456", password });
  check(contactOnlyLogin.status === 401, "contact-only member.phone remains a non-login credential");

  await identity.setCanonicalMemberAccountStatus(localCanonical!.memberId, "disabled");
  const disabledLogin = await login({ phone: "0912345678", password });
  const disabledBody = await disabledLogin.text();
  check(disabledLogin.status === 403 && disabledBody.includes("MEMBER_DISABLED"), "disabled phone member receives the established safe disabled response");
  assert.doesNotMatch(disabledBody, /member_[A-Za-z0-9_-]{16,}|subjectHash|passwordHash|passwordSalt/u);
  checks += 1;

  const routeSources = await Promise.all([
    fs.readFile(path.join(process.cwd(), "app", "api", "auth", "phone", "register", "route.ts"), "utf8"),
    fs.readFile(path.join(process.cwd(), "app", "api", "auth", "phone", "login", "route.ts"), "utf8"),
  ]);
  const joinedSources = routeSources.join("\n");
  assert.doesNotMatch(joinedSources, /sendOtp|verifyOtp|SMS_PROVIDER|TWILIO|phoneVerified|smsVerified|otpVerified/iu);
  assert.doesNotMatch(joinedSources, /console\.(?:log|error|warn)|request\.text\(|JSON\.stringify\(body/iu);
  checks += 2;
  check(joinedSources.includes("assignReferralByCode") && joinedSources.includes("resolveReferralAttributionCandidate"), "registration reuses trusted referral attribution and assignment");
  check(joinedSources.includes("clearRetailPromotionAttributionCookie"), "both routes protect member behavior from stale guest attribution");

  console.log(`\nJ.5D.8B phone auth API: ${checks} checks PASS`);
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
