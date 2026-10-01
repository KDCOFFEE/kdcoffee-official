import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

// Refuse an occupied port before generating fixtures or sending any request.
await new Promise<void>((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(3107, "127.0.0.1", () => probe.close((error) => error ? reject(error) : resolve()));
});

// Explicitly test-only credentials and data. Never reads local auth secrets.
const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-member-copy-browser-"));
process.env.KD_DATA_DIR = root;
process.env.AUTH_SESSION_SECRET = "copy-qa-auth-secret-over-thirty-two-characters";
process.env.MEMBER_IDENTITY_SECRET = "copy-qa-identity-secret-over-thirty-two-characters";
process.env.ADMIN_SESSION_SECRET = "copy-qa-admin-secret-over-thirty-two-characters";
process.env.ADMIN_PASSWORD = "Copy-QA-Only-2026";
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
const base = "http://localhost:3107";
const auth = await import("../lib/memberAuth");
const admin = await import("../lib/adminAuth");
const commerce = await import("../lib/membershipCommerce");
const member = await auth.registerEmailMember("copy-qa@example.test", "Copy-QA-Only-2026");
assert.ok(member);
await auth.saveMember({ ...member, displayName: "文案測試會員", pickupName: "文案測試會員" });
const state = await commerce.readMembershipCommerceState();
state.creditEntries["copy-qa-credit"] = { creditEntryId: "copy-qa-credit", memberId: member.id, sourceType: "referral", sourceReference: "copy-qa-original", amount: 300, remainingAmount: 300, issuedAt: "2026-10-01T00:00:00.000Z", expiresAt: "2027-10-01T00:00:00.000Z", status: "available", createdAt: "2026-10-01T00:00:00.000Z", metadata: {} };
const commerceFile = path.join(root, "membership-commerce", "commerce-state.json");
await fs.mkdir(path.dirname(commerceFile), { recursive: true });
await fs.writeFile(commerceFile, JSON.stringify(state));
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3107", "-H", "127.0.0.1"], { cwd: process.cwd(), stdio: "inherit", windowsHide: true, env: { ...process.env, NEXT_PUBLIC_SITE_URL: base, MEMBER_SITE_URL: base, NODE_ENV: "production", EMAIL_ENABLED: "false" } });
let exited = false;
child.once("exit", () => { exited = true; });
async function cleanup() {
  child.kill();
  assert.ok(root.startsWith(path.join(os.tmpdir(), "kd-member-copy-browser-")));
  await fs.rm(root, { recursive: true, force: true });
}
process.once("SIGINT", () => { void cleanup().finally(() => process.exit()); });
process.once("SIGTERM", () => { void cleanup().finally(() => process.exit()); });
for (let attempt = 0; attempt < 30; attempt++) {
  if (exited) throw new Error("The isolated QA server exited; refusing further requests.");
  try { if ((await fetch(`${base}/api/member/display-copy`)).ok) break; } catch { /* server is starting */ }
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (exited) throw new Error("The isolated QA server is not running.");
const snapshot = await fs.readFile(commerceFile, "utf8");
const ownerCookie = `${admin.adminCookieName}=${admin.createAdminSessionValue()}`;
const nonOwnerCookie = `${admin.adminCookieName}=${admin.createAdminSessionValue({ role: "admin" })}`;
const endpoint = `${base}/api/admin/member-center-copy`;
assert.equal((await fetch(endpoint)).status, 401);
assert.equal((await fetch(endpoint, { headers: { Cookie: nonOwnerCookie } })).status, 401);
assert.equal((await fetch(endpoint, { headers: { Cookie: ownerCookie } })).status, 200);
const put = (body: unknown, origin = base) => fetch(endpoint, { method: "PUT", headers: { Cookie: ownerCookie, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
assert.equal((await put({ expectedRevision: 0, overrides: {} }, "https://untrusted.example")).status, 403);
assert.equal((await put({ expectedRevision: 0, overrides: { "member.referral.generation1.title": "<script>bad</script>" } })).status, 400);
assert.equal((await put({ expectedRevision: 0, overrides: { "member.referral.generation1.title": "好友分享回饋" } })).status, 200);
assert.equal((await put({ expectedRevision: 0, overrides: {} })).status, 409);
assert.equal((await (await fetch(`${base}/api/member/display-copy`)).json()).overrides["member.referral.generation1.title"], "好友分享回饋");
assert.equal((await put({ expectedRevision: 1, overrides: {} })).status, 200);
assert.equal(await fs.readFile(commerceFile, "utf8"), snapshot);
console.log("COPY HTTP PASS: owner auth, non-owner denial, origin, validation, save/read, revision conflict, ledger unchanged.");
console.log(`ISOLATED QA READY ${base}; data=${root}; Email=copy-qa@example.test; Password=Copy-QA-Only-2026 (test only).`);
await new Promise<void>((resolve) => child.once("exit", () => resolve()));
await cleanup();
