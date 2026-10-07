// node --experimental-strip-types --import ./scripts/admin-credit-origin-test-bootstrap.mjs scripts/test-admin-credit-dev-origin.mts
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = await mkdtemp(path.join(os.tmpdir(), "kd-admin-dev-origin-"));
const secret = randomBytes(48).toString("hex");
for (const key of ["RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID", "RAILWAY_ENVIRONMENT_ID", "RAILWAY_VOLUME_MOUNT_PATH", "NEXT_PUBLIC_SITE_URL", "MEMBER_SITE_URL", "DEV_PUBLIC_ORIGIN"]) delete process.env[key];
Object.assign(process.env, { KD_DATA_DIR: root, AUTH_SESSION_SECRET: secret, ADMIN_SESSION_SECRET: secret, MEMBER_IDENTITY_SECRET: secret });
const stats = { mutationCalls: 0 };
const jar = new Map<string, string>();
const globals = globalThis as typeof globalThis & {
  __adminCreditOriginTest?: typeof stats;
  __publicOriginTestCookies?: { get: (name: string) => { value: string } | undefined };
};
globals.__adminCreditOriginTest = stats;
globals.__publicOriginTestCookies = { get: (name) => jar.has(name) ? { value: jar.get(name)! } : undefined };
globalThis.fetch = async () => { throw new Error("External network forbidden in isolated test"); };
const auth = await import("../lib/adminAuth");
const identity = await import("../lib/memberIdentity");
const origin = await import("../lib/publicSiteOrigin");
const route = await import("../app/api/admin/members/[memberId]/credit/route");
const canonical = "https://www.kdcoffee1962.com";
// Fixture only: no particular tunnel name is embedded in application code.
const tunnel = "https://configured-fixture.ngrok-free.dev";
const local = "http://localhost:3000";
let checks = 0;

async function snapshot() {
  const files: Record<string, string> = {};
  async function walk(dir: string) {
    for (const file of await readdir(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) await walk(fullPath);
      else files[path.relative(root, fullPath)] = (await readFile(fullPath)).toString("base64");
    }
  }
  await walk(root);
  return files;
}

try {
  const member = await identity.ensureLegacyCanonicalMember({ memberId: "dev_origin_fixture", identities: [{ provider: "email", subject: "dev-origin@example.test" }] });
  const token = auth.createAdminSessionValue();
  jar.set(auth.adminCookieName, token);
  async function run(name: string, source: string, expected: number, options: { base?: string; headers?: HeadersInit; direction?: "grant" | "deduct"; confirmation?: string } = {}) {
    const before = await snapshot();
    const callsBefore = stats.mutationCalls;
    const request = new Request((options.base ?? local) + "/api/admin/members/fixture/credit", {
      method: "POST", headers: { origin: source, "sec-fetch-site": "same-origin", "content-type": "application/json", ...options.headers },
      body: JSON.stringify({ direction: options.direction ?? "grant", amount: 10, reason: "隔離開發來源測試",
        confirmation: options.confirmation ?? "CONFIRM_CREDIT_ADJUSTMENT", idempotencyKey: randomUUID() }),
    });
    let bodyReads = 0; const readJson = request.json.bind(request); request.json = () => { bodyReads++; return readJson(); };
    const response = await route.POST(request, { params: Promise.resolve({ memberId: member.memberId }) });
    const result = await response.json();
    assert.equal(response.status, expected, name);
    if (expected !== 200) {
      assert.equal(stats.mutationCalls, callsBefore, `${name}: mutation count unchanged`);
      assert.deepEqual(await snapshot(), before, `${name}: temporary data unchanged`);
      assert.equal(bodyReads, expected === 400 ? 1 : 0, `${name}: auth/source before JSON`);
    } else {
      assert.equal(stats.mutationCalls, callsBefore + 1);
      assert.equal(bodyReads, 1);
      assert.equal(result.balanceAfter, result.balanceBefore + (options.direction === "deduct" ? -10 : 10));
    }
    console.log(`PASS ${++checks}: ${name}`);
  }
  Object.assign(process.env, { NODE_ENV: "production", DEV_PUBLIC_ORIGIN: tunnel, NEXT_PUBLIC_SITE_URL: tunnel, MEMBER_SITE_URL: tunnel });
  assert.deepEqual(origin.resolveAllowedRequestOrigins(new Request(local)), [canonical]);
  await run("production www passes behind local internal URL", canonical, 200);
  await run("production ignores DEV_PUBLIC_ORIGIN and both site variables", tunnel, 403);
  await run("production rejects evil origin", "https://evil.example", 403);
  await run("production rejects fake www suffix", canonical + ".evil.example", 403);
  await run("production rejects unsupported apex", "https://kdcoffee1962.com", 403);
  await run("production ignores arbitrary remote request URL/Host/forwarded origin", "https://evil.example", 403, {
    base: "https://evil.example", headers: { host: "evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" },
  });
  await run("production does not permit local origin even in a local production build", local, 403);

  Object.assign(process.env, { NODE_ENV: "development" });
  delete process.env.DEV_PUBLIC_ORIGIN;
  await run("development localhost", local, 200);
  await run("development 127.0.0.1 same port without trusting incoming Host", "http://127.0.0.1:3000", 200);
  await run("development IPv6 same port", "http://[::1]:3000", 200);
  await run("different loopback port", "http://localhost:3001", 403);
  await run("unconfigured ngrok rejected despite NEXT_PUBLIC_SITE_URL", tunnel, 403);
  await run("remote request URL does not implicitly trust unconfigured tunnel", tunnel, 403, { base: tunnel });
  process.env.DEV_PUBLIC_ORIGIN = tunnel;
  await run("configured tunnel behind localhost with public forwarded headers", tunnel, 200, {
    headers: { host: "localhost:3000", "x-forwarded-host": "configured-fixture.ngrok-free.dev", "x-forwarded-proto": "https" },
  });
  await run("configured tunnel with deduction retains real commerce", tunnel, 200, { direction: "deduct" });
  await run("different tunnel rejected", "https://other-fixture.ngrok-free.dev", 403);
  await run("evil origin cannot use configured tunnel", "https://evil.example", 403);
  await run("forged Host and forwarded host cannot add an origin", "https://evil.example", 403, {
    headers: { host: "evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" },
  });
  await run("tunnel wrong scheme rejected", tunnel.replace("https:", "http:"), 403);
  await run("tunnel wrong port rejected", tunnel + ":444", 403);
  await run("cross-site metadata rejected for configured tunnel", tunnel, 403, { headers: { "sec-fetch-site": "cross-site" } });
  await run("same-site metadata rejected for configured tunnel", tunnel, 403, { headers: { "sec-fetch-site": "same-site" } });
  jar.clear();
  await run("no Admin session rejects before JSON or mutation", tunnel, 401);
  jar.set(auth.adminCookieName, token);
  await run("confirmation still precedes mutation", tunnel, 400, { confirmation: "INVALID" });
  for (const invalid of ["not a URL", "https://", tunnel + "/path", tunnel + "/path/..", tunnel + "?x=1", tunnel + "?", tunnel + "#fragment", tunnel + "#",
    "https://user:password@configured-fixture.ngrok-free.dev", "ftp://configured-fixture.ngrok-free.dev", "https://*.ngrok-free.dev", "https://configured-fixture.ngrok-free.dev\\path"]) {
    process.env.DEV_PUBLIC_ORIGIN = invalid;
    await run(`invalid development configuration ignored: ${invalid}`, tunnel, 403);
    await run("invalid development configuration leaves localhost usable", local, 200);
  }
  process.env.DEV_PUBLIC_ORIGIN = "https://CONFIGURED-FIXTURE.NGROK-FREE.DEV:443/";
  await run("normalized hostname/default HTTPS port/root slash", tunnel, 200);
  process.env.RAILWAY_SERVICE_ID = "isolated-railway-context";
  await run("Railway context ignores tunnel even if NODE_ENV is development", tunnel, 403);
  await run("Railway context keeps canonical www", canonical, 200);
  delete process.env.RAILWAY_SERVICE_ID;
  console.log(`PASS ${checks} Admin development origin checks; real auth/commerce, temporary data only`);
} finally { await rm(root, { recursive: true, force: true }); }
