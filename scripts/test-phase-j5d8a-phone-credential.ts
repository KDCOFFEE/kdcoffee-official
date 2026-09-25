import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j5d8a-phone-"));
process.env.KD_DATA_DIR = temporaryRoot;
process.env.AUTH_SESSION_SECRET = "j5d8a-auth-secret-that-is-longer-than-thirty-two-characters";
process.env.MEMBER_IDENTITY_SECRET = "j5d8a-identity-secret-that-is-longer-than-thirty-two-characters";

// @ts-expect-error -- Node's type-stripping test runner requires explicit TypeScript extensions.
const auth = await import("../lib/memberAuth.ts");
// @ts-expect-error -- Node's type-stripping test runner requires explicit TypeScript extensions.
const identity = await import("../lib/memberIdentity.ts");

let checks = 0;
function equal(actual: unknown, expected: unknown, message?: string) {
  assert.equal(actual, expected, message);
  checks += 1;
}
function ok(value: unknown, message?: string) {
  assert.ok(value, message);
  checks += 1;
}

try {
  equal(identity.normalizeTaiwanMobile("0912345678"), "+886912345678");
  equal(identity.normalizeTaiwanMobile("+886912345678"), "+886912345678");
  equal(identity.normalizeTaiwanMobile("0912-345-678"), "+886912345678");
  equal(identity.normalizeTaiwanMobile("+886 912 345 678"), "+886912345678");
  for (const malformed of ["123", "0812345678", "+886812345678", "091234567", "09123456789", "phone0912345678"]) {
    equal(identity.normalizeTaiwanMobile(malformed), null, malformed);
    equal(identity.isValidTaiwanMobile(malformed), false, malformed);
  }
  await assert.rejects(
    auth.registerPhoneMember("0812345678", "Phone-Test-Password-2026"),
    identity.IdentityValidationError,
  );
  await assert.rejects(
    auth.registerPhoneMember("0912345678", "short"),
    identity.IdentityValidationError,
  );
  checks += 2;

  const password = "Phone-Test-Password-2026";
  const registered = await auth.registerPhoneMember("0912 345 678", password);
  ok(registered);
  assert.match(registered?.id || "", /^member_/u);
  assert.match(registered?.memberNumber || "", /^1962\d{5}$/u);
  checks += 2;
  equal(registered?.phone, "0912345678");
  equal(registered?.authProvider, "phone");
  assert.notEqual(registered?.passwordHash, password);
  assert.notEqual(registered?.passwordSalt, password);
  checks += 2;

  const persisted = JSON.parse(await fs.readFile(path.join(temporaryRoot, "members", `${registered?.id}.json`), "utf8"));
  assert.doesNotMatch(JSON.stringify(persisted), new RegExp(password.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  checks += 1;

  equal((await auth.authenticatePhoneMember("+886-912-345-678", password))?.id, registered?.id);
  equal(await auth.authenticatePhoneMember("0912345678", "wrong-password"), null);
  equal(await auth.authenticatePhoneMember("0987654321", password), null);
  equal(await auth.authenticatePhoneMember("not-a-phone", password), null);
  equal(await auth.registerPhoneMember("+886 912 345 678", password), null);

  const resolved = await identity.resolveMemberByIdentity("phone", "0912-345-678");
  equal(resolved?.memberId, registered?.id);
  const registry = await identity.getIdentityRegistrySnapshot();
  identity.validateMemberIdentityRegistry(registry);
  checks += 1;
  const phoneIdentity = Object.values(registry.identities).find((item) => item.provider === "phone");
  ok(phoneIdentity);
  equal(phoneIdentity?.verifiedAt, undefined, "Password-only phone identity must not claim ownership verification");
  assert.doesNotMatch(JSON.stringify(registry), /0912345678|\+886912345678/u);
  checks += 1;

  await assert.rejects(
    identity.provisionCanonicalMember({ provider: "phone", subject: "0912345678", persistMember: async () => undefined }),
    identity.IdentityConflictError,
  );
  checks += 1;

  const contactOnlyId = "contact-only-member";
  const now = new Date().toISOString();
  await fs.writeFile(path.join(temporaryRoot, "members", `${contactOnlyId}.json`), `${JSON.stringify({
    id: contactOnlyId,
    displayName: "Contact only",
    phone: "0988-111-222",
    createdAt: now,
    lastLoginAt: now,
  }, null, 2)}\n`, "utf8");
  equal(await identity.resolveMemberByIdentity("phone", "0988111222"), null);
  equal(await auth.authenticatePhoneMember("0988111222", password), null);

  await identity.setCanonicalMemberAccountStatus(registered!.id, "disabled");
  await assert.rejects(
    auth.authenticatePhoneMember("0912345678", password),
    auth.MemberAccountDisabledError,
  );
  checks += 1;

  const email = await auth.registerEmailMember("j5d8a-email@example.test", "Email-Test-Password-2026");
  ok(email);
  equal((await auth.authenticateEmailMember("J5D8A-EMAIL@EXAMPLE.TEST", "Email-Test-Password-2026"))?.id, email?.id);
  const line = await auth.loginLineMember({ sub: "j5d8a-line-subject", name: "LINE test" });
  equal(line.status, "authenticated");
  const methods = await auth.getMemberLoginMethods(registered!);
  equal(methods.phoneLinked, true);
  equal(methods.emailLinked, false);
  equal(methods.lineLinked, false);

  const sourceFiles = [
    await fs.readFile(path.join(process.cwd(), "lib", "memberAuth.ts"), "utf8"),
    await fs.readFile(path.join(process.cwd(), "lib", "memberIdentity.ts"), "utf8"),
  ].join("\n");
  assert.doesNotMatch(sourceFiles, /sendOtp|verifyOtp|SMS_PROVIDER|TWILIO|phoneVerified:\s*true|smsVerified:\s*true|otpVerified:\s*true/iu);
  checks += 1;

  console.log(`Phase J.5D.8A phone credential: PASS (${checks} assertions)`);
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
