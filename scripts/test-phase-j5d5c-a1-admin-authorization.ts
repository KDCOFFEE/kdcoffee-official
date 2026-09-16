import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";

process.env.ADMIN_PASSWORD = "phase-j5d5c-a1-owner-password";
process.env.ADMIN_SESSION_SECRET = "phase-j5d5c-a1-session-secret-with-safe-length";
process.env.ADMIN_OWNER_ID = "kd-owner";
process.env.NEXT_PUBLIC_SITE_URL = "https://admin.test";

const auth = await import("../lib/adminAuth");
const authorization = await import("../lib/adminAuthorization");
const login = await import("../app/api/admin/login/route");
const logout = await import("../app/api/admin/logout/route");

let passed = 0;
const checks: string[] = [];

async function check(name: string, operation: () => void | Promise<void>) {
  await operation();
  passed += 1;
  checks.push(name);
  console.log(`PASS ${passed}: ${name}`);
}

function loginRequest(password: string) {
  const body = new FormData();
  body.set("password", password);
  return new Request("https://admin.test/api/admin/login", { method: "POST", body });
}

function sessionCookie(response: Response) {
  const header = response.headers.get("set-cookie") || "";
  const match = header.match(/kd_admin_session=([^;]+)/u);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function legacySessionValue(expiresAt: number) {
  const payload = Buffer.from(JSON.stringify({ role: "admin", expiresAt })).toString("base64url");
  const signature = createHmac("sha256", process.env.ADMIN_SESSION_SECRET!).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

async function expectAuthorizationStatus(operation: () => Promise<unknown>, status: 401 | 403) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof authorization.AdminAuthorizationError);
    assert.equal(error.status, status);
    return true;
  });
}

await check("valid Owner login succeeds", async () => {
  const response = await login.POST(loginRequest(process.env.ADMIN_PASSWORD!));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://admin.test/admin");
  assert.ok(sessionCookie(response));
});

await check("wrong password fails", async () => {
  const response = await login.POST(loginRequest("wrong-password"));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://admin.test/admin/login?error=invalid");
  assert.equal(sessionCookie(response), null);
});

await check("login route uses the timing-safe verifier", async () => {
  const source = await readFile(new URL("../app/api/admin/login/route.ts", import.meta.url), "utf8");
  assert.match(source, /verifyAdminPassword\(password\)/u);
  assert.doesNotMatch(source, /password\s*!==\s*expected/u);
  assert.equal(auth.verifyAdminPassword(process.env.ADMIN_PASSWORD!), true);
  assert.equal(auth.verifyAdminPassword("wrong-password"), false);
});

const ownerValue = auth.createAdminSessionValue();
const ownerSession = auth.parseAdminSessionValue(ownerValue);

await check("new Owner session is versioned", () => {
  assert.ok(ownerSession);
  assert.equal(ownerSession.version, 2);
  assert.equal(ownerSession.legacy, false);
  assert.equal(ownerSession.adminId, "kd-owner");
  assert.equal(ownerSession.role, "owner");
});

await check("Owner receives members.sensitive.read", () => {
  assert.ok(ownerSession);
  assert.equal(
    authorization.hasAdminPermission(ownerSession, authorization.adminPermissions.membersSensitiveRead),
    true,
  );
});

const adminSession = auth.parseAdminSessionValue(
  auth.createAdminSessionValue({ adminId: "operator-1", role: "admin" }),
);

await check("Admin/operator role lacks members.sensitive.read", () => {
  assert.ok(adminSession);
  assert.equal(adminSession.role, "admin");
  assert.deepEqual(adminSession.permissions, []);
  assert.equal(
    authorization.hasAdminPermission(adminSession, authorization.adminPermissions.membersSensitiveRead),
    false,
  );
});

const legacySession = auth.parseAdminSessionValue(legacySessionValue(Date.now() + 60_000));

await check("legacy session remains authenticated but has no sensitive permission", async () => {
  assert.ok(legacySession);
  assert.equal(legacySession.legacy, true);
  assert.deepEqual(legacySession.permissions, []);
  assert.equal(
    authorization.hasAdminPermission(legacySession, authorization.adminPermissions.membersSensitiveRead),
    false,
  );
  assert.equal(await authorization.requireAdminAuthenticated({ session: legacySession }), legacySession);
});

await check("unauthenticated authorization fails with 401", async () => {
  await expectAuthorizationStatus(
    () => authorization.requireAdminAuthenticated({ session: null }),
    401,
  );
});

await check("authenticated session without permission fails with 403", async () => {
  await expectAuthorizationStatus(
    () => authorization.requireAdminPermission(
      authorization.adminPermissions.membersSensitiveRead,
      { session: adminSession },
    ),
    403,
  );
});

await check("authorized Owner permission check succeeds", async () => {
  const result = await authorization.requireAdminPermission(
    authorization.adminPermissions.membersSensitiveRead,
    { session: ownerSession },
  );
  assert.equal(result, ownerSession);
});

await check("expired session is rejected", () => {
  const oldValue = auth.createAdminSessionValue({ now: new Date("2020-01-01T00:00:00.000Z") });
  assert.equal(auth.parseAdminSessionValue(oldValue, new Date("2020-01-02T00:00:00.000Z")), null);
});

await check("malformed and tampered sessions are rejected", () => {
  assert.equal(auth.parseAdminSessionValue("not-a-session"), null);
  const replacement = ownerValue.endsWith("a") ? "b" : "a";
  assert.equal(auth.parseAdminSessionValue(`${ownerValue.slice(0, -1)}${replacement}`), null);
});

await check("session and login response contain no password or signing secret", async () => {
  const payload = JSON.parse(Buffer.from(ownerValue.split(".")[0], "base64url").toString("utf8"));
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /password|secret/iu);
  assert.equal(serialized.includes(process.env.ADMIN_PASSWORD!), false);
  assert.equal(serialized.includes(process.env.ADMIN_SESSION_SECRET!), false);
  const response = await login.POST(loginRequest(process.env.ADMIN_PASSWORD!));
  const responseMaterial = `${await response.text()} ${response.headers.get("location") || ""}`;
  assert.equal(responseMaterial.includes(process.env.ADMIN_PASSWORD!), false);
  assert.equal(responseMaterial.includes(process.env.ADMIN_SESSION_SECRET!), false);
});

await check("legacy ADMIN_PASSWORD bootstrap works without a new Owner variable", () => {
  const configured = process.env.ADMIN_OWNER_ID;
  delete process.env.ADMIN_OWNER_ID;
  try {
    const fallback = auth.parseAdminSessionValue(auth.createAdminSessionValue());
    assert.ok(fallback);
    assert.equal(fallback.role, "owner");
    assert.equal(fallback.adminId, "owner");
    assert.equal(fallback.permissions.includes(auth.adminPermissions.membersSensitiveRead), true);
  } finally {
    process.env.ADMIN_OWNER_ID = configured;
  }
});

await check("logout invalidates the Admin cookie", async () => {
  const response = await logout.POST(new Request("https://admin.test/api/admin/logout", { method: "POST" }));
  assert.equal(response.status, 303);
  const header = response.headers.get("set-cookie") || "";
  assert.match(header, /kd_admin_session=/u);
  assert.match(header, /Max-Age=0/iu);
});

assert.equal(passed, 15);
console.log(`\n${passed}/15 PASS`);
console.log(checks.join("\n"));
