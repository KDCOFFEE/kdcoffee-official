import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kd-member-auth-"));
process.env.KD_DATA_DIR = temporaryRoot;
process.env.AUTH_SESSION_SECRET = "auth-test-secret-that-is-longer-than-thirty-two-characters";
process.env.MEMBER_IDENTITY_SECRET = "identity-test-secret-that-is-longer-than-thirty-two-characters";

// @ts-expect-error -- Node's type-stripping test runner requires explicit TypeScript extensions.
const auth = await import("../lib/memberAuth.ts");

let checks = 0;

try {
  const email = "member-auth@example.test";
  const password = "Initial-Test-Password-2026";
  const registered = await auth.registerEmailMember(email, password);
  assert.ok(registered);
  assert.match(registered.memberNumber || "", /^KD-\d{6}$/);
  assert.match(registered.id, /^member_/);
  checks += 3;

  assert.equal(await auth.registerEmailMember(email.toUpperCase(), password), null);
  assert.equal(await auth.authenticateEmailMember(email, "incorrect-password"), null);
  const authenticated = await auth.authenticateEmailMember(` ${email.toUpperCase()} `, password);
  assert.equal(authenticated?.id, registered.id);
  assert.equal(authenticated?.memberNumber, registered.memberNumber);
  checks += 4;

  const token = auth.createSessionToken(registered.id);
  assert.equal(auth.verifySessionToken(token), registered.id);
  assert.equal(auth.verifySessionToken(`${token}tampered`), null);
  checks += 2;

  const reset = await auth.createEmailPasswordReset(email);
  assert.ok(reset?.token);
  assert.equal(await auth.resetEmailMemberPassword(reset?.token || "", "Changed-Test-Password-2026"), true);
  assert.equal(await auth.resetEmailMemberPassword(reset?.token || "", "Another-Password-2026"), false);
  assert.equal(await auth.authenticateEmailMember(email, password), null);
  assert.equal((await auth.authenticateEmailMember(email, "Changed-Test-Password-2026"))?.id, registered.id);
  checks += 5;

  const sameEmailLine = await auth.loginLineMember({
    sub: "line-same-email-signal",
    email: email.toUpperCase(),
    name: "測試會員",
  });
  assert.equal(sameEmailLine.status, "link-required");
  checks += 1;

  const lineProfile = { sub: "new-line-subject", name: "LINE 測試會員" };
  const newLine = await auth.loginLineMember(lineProfile);
  assert.equal(newLine.status, "authenticated");
  if (newLine.status !== "authenticated") assert.fail("LINE member was not created");
  assert.notEqual(newLine.member.id, registered.id);
  assert.match(newLine.member.id, /^member_/);
  const repeatedLine = await auth.loginLineMember(lineProfile);
  assert.equal(repeatedLine.status, "authenticated");
  if (repeatedLine.status !== "authenticated") assert.fail("LINE member did not resolve");
  assert.equal(repeatedLine.member.id, newLine.member.id);
  assert.equal(repeatedLine.member.memberNumber, newLine.member.memberNumber);
  checks += 6;

  const legacyId = "legacy-line-fixture";
  const now = new Date().toISOString();
  await fs.writeFile(
    path.join(temporaryRoot, "members", `${legacyId}.json`),
    `${JSON.stringify({
      id: legacyId,
      lineUserId: "legacy-line-auth-subject",
      displayName: "既有 LINE 會員",
      createdAt: now,
      lastLoginAt: now,
    }, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" },
  );
  const legacyLogin = await auth.loginLineMember({ sub: "legacy-line-auth-subject" });
  assert.equal(legacyLogin.status, "authenticated");
  if (legacyLogin.status !== "authenticated") assert.fail("Legacy LINE member did not resolve");
  assert.equal(legacyLogin.member.id, legacyId);
  assert.match(legacyLogin.member.memberNumber || "", /^KD-\d{6}$/);
  checks += 3;

  console.log(`Member auth compatibility: PASS (${checks} assertions)`);
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
