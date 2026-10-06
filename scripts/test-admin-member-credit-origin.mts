// Run: node --experimental-strip-types --import ./scripts/admin-credit-origin-test-bootstrap.mjs scripts/test-admin-member-credit-origin.mts
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = await mkdtemp(path.join(os.tmpdir(), "kd-admin-credit-origin-"));
const secret = randomBytes(48).toString("hex");
for (const key of ["RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID", "RAILWAY_ENVIRONMENT_ID", "RAILWAY_VOLUME_MOUNT_PATH"]) delete process.env[key];
Object.assign(process.env, {
  KD_DATA_DIR: root, AUTH_SESSION_SECRET: secret, ADMIN_SESSION_SECRET: secret,
  MEMBER_IDENTITY_SECRET: secret, NEXT_PUBLIC_SITE_URL: "https://www.kdcoffee1962.com",
  MEMBER_SITE_URL: "https://www.kdcoffee1962.com",
});
const stats = { mutationCalls: 0 };
const jar = new Map<string, string>();
const globals = globalThis as typeof globalThis & {
  __adminCreditOriginTest?: typeof stats;
  __publicOriginTestCookies?: { get: (name: string) => { value: string } | undefined };
};
globals.__adminCreditOriginTest = stats;
globals.__publicOriginTestCookies = { get: (name) => jar.has(name) ? { value: jar.get(name)! } : undefined };
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("External network forbidden in isolated credit test"); };

const auth = await import("../lib/adminAuth");
const identity = await import("../lib/memberIdentity");
const rules = await import("../lib/membershipBusinessRules");
const commerce = await import("../lib/membershipCommerce");
const route = await import("../app/api/admin/members/[memberId]/credit/route");
const canonical = "https://www.kdcoffee1962.com";
const internal = "https://internal-production.up.railway.app";
let checks = 0;

async function snapshot() {
  const hashes: Record<string, string> = {};
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else hashes[path.relative(root, file)] = createHash("sha256").update(await readFile(file)).digest("hex");
    }
  }
  await walk(root);
  return hashes;
}

try {
  const member = await identity.ensureLegacyCanonicalMember({ memberId: "admin_credit_origin_fixture", identities: [{ provider: "email", subject: "credit-origin@example.test" }] });
  await rules.saveMembershipBusinessRules({ expectedRevision: 0, rules: structuredClone(rules.DEFAULT_MEMBERSHIP_RULES) });
  const ownerCookie = auth.createAdminSessionValue({ adminId: "origin-test-owner" });
  jar.set(auth.adminCookieName, ownerCookie);
  const payload = { direction: "grant", amount: 10, reason: "隔離來源測試", note: "temporary data only", confirmation: "CONFIRM_CREDIT_ADJUSTMENT" };

  async function run(name: string, base: string, headers: HeadersInit, status: number, body: Record<string, unknown> = {}) {
    const before = await snapshot();
    const callsBefore = stats.mutationCalls;
    let bodyReads = 0;
    const request = new Request(`${base}/api/admin/members/test/credit`, {
      method: "POST", headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ ...payload, idempotencyKey: randomUUID(), ...body }),
    });
    const readJson = request.json.bind(request);
    request.json = () => { bodyReads++; return readJson(); };
    const response = await route.POST(request, { params: Promise.resolve({ memberId: member.memberId }) });
    const result = await response.json();
    assert.equal(response.status, status, name);
    if (status !== 200) {
      assert.equal(stats.mutationCalls, callsBefore, `${name}: mutation not called`);
      assert.deepEqual(await snapshot(), before, `${name}: all isolated data unchanged`);
      assert.equal(bodyReads, status === 400 ? 1 : 0, `${name}: control flow`);
      if (status === 403) assert.equal(result.error, "無法確認操作來源，請重新整理後再試一次。");
    } else {
      assert.equal(bodyReads, 1);
      assert.equal(stats.mutationCalls, callsBefore + 1);
      const state = await commerce.readMembershipCommerceState();
      assert.ok(state.creditEntries[result.creditEntryId]);
      assert.equal(result.balanceAfter, result.balanceBefore + 10);
    }
    console.log(`PASS ${++checks}: ${name}`);
    return result;
  }
  const firstParty = { origin: canonical, "sec-fetch-site": "same-origin" };
  process.env.RAILWAY_SERVICE_ID = "isolated-railway-context";
  await run("www browser behind Next localhost:8080", "https://localhost:8080", firstParty, 200);
  await run("www browser behind Railway URL", internal, firstParty, 200);
  await run("www browser behind arbitrary internal URL", "http://internal:8080", firstParty, 200);
  await run("direct production www", canonical, firstParty, 200);
  await run("normalized case and default HTTPS port", internal, { ...firstParty, origin: "https://WWW.KDCOFFEE1962.COM:443" }, 200);
  for (const origin of ["https://evil.example", "https://www.kdcoffee1962.com.evil.example", "https://kdcoffee1962.com.evil.example", "https://kdcoffee1962.com", "http://www.kdcoffee1962.com", "https://www.kdcoffee1962.com:444", "https://localhost:8080"]) {
    await run(`reject origin ${origin}`, internal, { ...firstParty, origin }, 403);
  }
  await run("forged Host and forwarded headers cannot allow evil", internal, { origin: "https://evil.example", host: "evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https", "sec-fetch-site": "same-origin" }, 403);
  for (const site of ["cross-site", "same-site"]) await run(`reject ${site} metadata`, internal, { ...firstParty, "sec-fetch-site": site }, 403);
  for (const origin of ["not a URL", "null", "https://", "https://user:pass@www.kdcoffee1962.com", `${canonical}/path`, `${canonical}?query=1`, `${canonical}#fragment`, "ftp://www.kdcoffee1962.com"]) {
    await run(`reject malformed/non-origin ${origin}`, internal, { ...firstParty, origin }, 403);
  }
  await run("missing Origin retains same-origin compatibility", internal, { "sec-fetch-site": "same-origin" }, 200);
  await run("missing both source headers retains compatibility", internal, {}, 200);
  await run("missing Origin still rejects cross-site metadata", internal, { "sec-fetch-site": "cross-site" }, 403);
  await run("missing Sec-Fetch-Site with valid Origin retains compatibility", internal, { origin: canonical }, 200);
  jar.delete(auth.adminCookieName);
  await run("no Admin session rejects before JSON/mutation", internal, firstParty, 401);
  jar.set(auth.adminCookieName, `${ownerCookie}invalid`);
  await run("invalid session signature rejects before JSON/mutation", internal, firstParty, 401);
  jar.set(auth.adminCookieName, auth.createAdminSessionValue({ now: new Date(Date.now() - 13 * 60 * 60 * 1000) }));
  await run("expired session rejects before JSON/mutation", internal, firstParty, 401);
  jar.set(auth.adminCookieName, ownerCookie);
  await run("invalid confirmation rejects before mutation", internal, firstParty, 400, { confirmation: "INVALID" });
  await run("invalid direction rejects before mutation", internal, firstParty, 400, { direction: "INVALID" });

  delete process.env.RAILWAY_SERVICE_ID;
  await run("development localhost", "http://localhost:3000", { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" }, 200);
  await run("development normalized loopback Host on same port", "http://localhost:3000", { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000", "sec-fetch-site": "same-origin" }, 200);
  await run("loopback does not trust external Host or forwarded host", "http://localhost:3000", { origin: "https://evil.example", host: "evil.example", "x-forwarded-host": "evil.example", "sec-fetch-site": "same-origin" }, 403);
  await run("loopback rejects different port", "http://localhost:3000", { origin: "http://localhost:3001", "sec-fetch-site": "same-origin" }, 403);
  process.env.RAILWAY_SERVICE_ID = "isolated-railway-context";
  const key = randomUUID();
  const initial = await run("real grant appends ledger and audit", internal, firstParty, 200, { idempotencyKey: key });
  const beforeReplay = await commerce.readMembershipCommerceState();
  const replay = await run("same key replays the original grant", internal, firstParty, 200, { idempotencyKey: key });
  const afterReplay = await commerce.readMembershipCommerceState();
  assert.equal(replay.creditEntryId, initial.creditEntryId);
  assert.deepEqual(afterReplay.creditEntries, beforeReplay.creditEntries);
  assert.deepEqual(afterReplay.audit, beforeReplay.audit);
  assert.deepEqual(afterReplay.events, beforeReplay.events);
  assert.deepEqual(afterReplay.notifications, beforeReplay.notifications);
  assert.ok(afterReplay.audit.some((entry) => entry.entityId === initial.creditEntryId && entry.action === "credit-adjustment-granted"));
  assert.equal(await commerce.getAvailableCredit(member.memberId), initial.balanceAfter);
  console.log(`PASS ${++checks}: replay preserves balance, ledger, audit, events and notification queue`);
  console.log(`PASS ${checks} admin member credit origin checks; real auth and commerce, temporary data only`);
} finally {
  globalThis.fetch = originalFetch;
  await rm(root, { recursive: true, force: true });
}
