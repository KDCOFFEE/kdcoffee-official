import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  canUnlinkIdentity,
  completeLineLink,
  createLineLinkTransaction,
  ensureLegacyCanonicalMember,
  formatMemberNumber,
  getIdentityRegistrySnapshot,
  getMemberIdentityState,
  hasMatchingEmailIdentity,
  IdentityConflictError,
  IdentityValidationError,
  provisionCanonicalMember,
  resolveCanonicalMemberId,
  resolveMemberByIdentity,
  validateMemberIdentityRegistry,
// @ts-expect-error -- Node's type-stripping test runner requires explicit TypeScript extensions.
} from "../lib/memberIdentity.ts";

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kd-member-identity-"));
process.env.KD_DATA_DIR = temporaryRoot;
process.env.AUTH_SESSION_SECRET = "identity-test-secret-that-is-longer-than-thirty-two-characters";

let checks = 0;
function check(value: unknown, message: string) {
  assert.ok(value, message);
  checks += 1;
}

async function createMember(provider: "email" | "line", subject: string) {
  return provisionCanonicalMember({
    provider,
    subject,
    persistMember: async () => undefined,
  });
}

try {
  assert.equal(formatMemberNumber(1), "KD-000001");
  assert.throws(() => formatMemberNumber(0), IdentityValidationError);
  checks += 2;

  const emailA = "member-a@example.test";
  const lineA = "line-subject-a";
  const createdA = await createMember("email", emailA);
  const emailResolvedA = await resolveMemberByIdentity("email", " MEMBER-A@example.test ");
  assert.equal(emailResolvedA?.memberId, createdA.member.memberId);
  checks += 1;

  const stateA = "state-a-single-use";
  const transactionA = await createLineLinkTransaction(createdA.member.memberId, stateA);
  const linkedA = await completeLineLink({
    transactionId: transactionA.transactionId,
    memberId: createdA.member.memberId,
    state: stateA,
    lineSubject: lineA,
    persistLinkedMember: async () => undefined,
  });
  assert.equal(linkedA.status, "linked");
  const lineResolvedA = await resolveMemberByIdentity("line", lineA);
  assert.equal(lineResolvedA?.memberId, createdA.member.memberId);
  assert.equal(lineResolvedA?.memberNumber, createdA.member.memberNumber);
  checks += 3;

  const replayA = await completeLineLink({
    transactionId: transactionA.transactionId,
    memberId: createdA.member.memberId,
    state: stateA,
    lineSubject: lineA,
    persistLinkedMember: async () => assert.fail("完成的連結不得再次寫入會員"),
  });
  assert.equal(replayA.status, "already-completed");
  checks += 1;

  await assert.rejects(
    completeLineLink({
      transactionId: transactionA.transactionId,
      memberId: createdA.member.memberId,
      state: stateA,
      lineSubject: "different-line-subject",
      persistLinkedMember: async () => assert.fail("錯誤重送不得寫入會員"),
    }),
    IdentityValidationError,
  );
  checks += 1;

  const createdB = await createMember("email", "member-b@example.test");
  const stateB = "state-b-conflict";
  const transactionB = await createLineLinkTransaction(createdB.member.memberId, stateB);
  await assert.rejects(
    completeLineLink({
      transactionId: transactionB.transactionId,
      memberId: createdB.member.memberId,
      state: stateB,
      lineSubject: lineA,
      persistLinkedMember: async () => assert.fail("衝突時不得修改會員"),
    }),
    IdentityValidationError,
  );
  assert.equal((await resolveMemberByIdentity("line", lineA))?.memberId, createdA.member.memberId);
  checks += 2;

  const old = new Date("2026-01-01T00:00:00.000Z");
  const expired = await createLineLinkTransaction(createdB.member.memberId, "expired-state", old);
  await assert.rejects(
    completeLineLink({
      transactionId: expired.transactionId,
      memberId: createdB.member.memberId,
      state: "expired-state",
      lineSubject: "line-expired",
      persistLinkedMember: async () => assert.fail("逾期連結不得修改會員"),
      now: new Date(old.getTime() + 11 * 60 * 1000),
    }),
    IdentityValidationError,
  );
  checks += 1;

  check(
    hasMatchingEmailIdentity("same@example.test", ["other@example.test", " SAME@example.test "]),
    "相同 Email 只能觸發需授權連結訊號",
  );
  const independentLine = await createMember("line", "line-with-email-signal");
  assert.notEqual(independentLine.member.memberId, createdA.member.memberId);
  checks += 1;

  const legacyEmail = await ensureLegacyCanonicalMember({
    memberId: "legacy-email-member",
    identities: [{ provider: "email", subject: "legacy@example.test" }],
  });
  const legacyLine = await ensureLegacyCanonicalMember({
    memberId: "legacy-line-member",
    identities: [{ provider: "line", subject: "legacy-line-subject" }],
  });
  const legacyHybrid = await ensureLegacyCanonicalMember({
    memberId: "legacy-hybrid-member",
    identities: [
      { provider: "email", subject: "hybrid@example.test" },
      { provider: "line", subject: "legacy-hybrid-line" },
    ],
  });
  assert.equal(await resolveCanonicalMemberId("legacy-email-member"), legacyEmail.memberId);
  assert.equal((await resolveMemberByIdentity("line", "legacy-line-subject"))?.memberId, legacyLine.memberId);
  const hybridState = await getMemberIdentityState(legacyHybrid.memberId);
  assert.deepEqual(new Set(hybridState.providers), new Set(["email", "line"]));
  const legacyOrderFixture = {
    orderNumber: "KD-TEST-LEGACY",
    member: { memberId: "legacy-email-member" },
  };
  const orderBeforeResolution = JSON.stringify(legacyOrderFixture);
  assert.equal(
    await resolveCanonicalMemberId(legacyOrderFixture.member.memberId),
    legacyEmail.memberId,
  );
  assert.equal(JSON.stringify(legacyOrderFixture), orderBeforeResolution, "歷史訂單不得被 resolver 改寫");
  checks += 5;

  const parallel = await Promise.all(
    Array.from({ length: 24 }, (_, index) => createMember("email", `parallel-${index}@example.test`)),
  );
  const numbers = parallel.map((item) => item.member.memberNumber);
  assert.equal(new Set(numbers).size, numbers.length);
  checks += 1;

  assert.equal(canUnlinkIdentity(1), false);
  assert.equal(canUnlinkIdentity(2), true);
  checks += 2;

  const registry = await getIdentityRegistrySnapshot();
  validateMemberIdentityRegistry(registry);
  assert.throws(
    () => validateMemberIdentityRegistry({ ...registry, schemaVersion: 999 }),
    IdentityValidationError,
  );
  assert.throws(
    () => validateMemberIdentityRegistry({
      ...registry,
      members: {
        ...registry.members,
        duplicate: { ...createdA.member, memberId: "duplicate" },
      },
    }),
    IdentityValidationError,
  );
  assert.throws(
    () => validateMemberIdentityRegistry({
      ...registry,
      identities: {
        ...registry.identities,
        invalid: {
          identityId: "invalid",
          memberId: createdA.member.memberId,
          provider: "invalid",
          subjectHash: "invalid",
          verifiedAt: new Date().toISOString(),
          linkedAt: new Date().toISOString(),
          status: "active",
        },
      },
    }),
    IdentityValidationError,
  );
  checks += 4;

  const serialized = JSON.stringify(registry);
  for (const secretValue of [emailA, lineA, "member-b@example.test", "legacy-line-subject"]) {
    assert.equal(serialized.includes(secretValue), false, "身份註冊表不得保存原始登入識別資料");
    checks += 1;
  }
  check(registry.auditLog.some((item) => item.action === "identity-linked"), "連結成功需留下安全稽核紀錄");
  check(registry.auditLog.some((item) => item.action === "identity-link-rejected"), "連結拒絕需留下安全稽核紀錄");

  await assert.rejects(
    createMember("email", emailA),
    IdentityConflictError,
  );
  checks += 1;

  console.log(`Member identity foundation: PASS (${checks} assertions)`);
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
