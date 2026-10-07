// node --experimental-strip-types --import ./scripts/public-origin-test-bootstrap.mjs scripts/test-dev-auth-redirects.mts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

const root = await mkdtemp(path.join(os.tmpdir(), "kd-dev-auth-redirects-"));
const secret = randomBytes(48).toString("hex");
const password = randomBytes(24).toString("hex");
const runtimeKeys = ["RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID", "RAILWAY_ENVIRONMENT_ID", "RAILWAY_VOLUME_MOUNT_PATH"];
for (const key of runtimeKeys) delete process.env[key];
Object.assign(process.env, { KD_DATA_DIR: root, AUTH_SESSION_SECRET: secret, ADMIN_SESSION_SECRET: secret, MEMBER_IDENTITY_SECRET: secret, ADMIN_PASSWORD: password });
const jar = new Map<string, string>();
const writes: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
(globalThis as typeof globalThis & { __publicOriginTestCookies?: unknown }).__publicOriginTestCookies = {
  get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined,
  set: (name: string, value: string, options: Record<string, unknown>) => { jar.set(name, value); writes.push({ name, value, options }); },
};
globalThis.fetch = async () => { throw new Error("External network forbidden in redirect tests"); };
const origin = await import("../lib/publicSiteOrigin");
const member = await import("../lib/memberAuth");
const admin = await import("../lib/adminAuth");
const memberLogout = await import("../app/api/auth/logout/route");
const adminLogout = await import("../app/api/admin/logout/route");
const adminLogin = await import("../app/api/admin/login/route");
const canonical = "https://www.kdcoffee1962.com";
const tunnel = "https://configured-fixture.ngrok-free.dev";
const local = "http://localhost:3000";
const internal = "https://localhost:3000";
const proxy = { origin: tunnel, host: "configured-fixture.ngrok-free.dev", "x-forwarded-host": "configured-fixture.ngrok-free.dev", "x-forwarded-proto": "https" };
let checks = 0;
const cases: Array<{ name: string; mode?: string; base: string; headers?: HeadersInit; expected: string; dev?: string; railway?: boolean; site?: string }> = [
  { name: "production public www ignores configured tunnel", mode: "production", base: canonical, headers: proxy, expected: canonical },
  { name: "production Railway proxy ignores configured tunnel", mode: "production", base: "https://kdcoffee-official-production.up.railway.app", headers: proxy, expected: canonical, railway: true },
  { name: "production Railway context with internal HTTPS localhost stays www", mode: "production", base: internal, headers: proxy, expected: canonical, railway: true },
  { name: "production untrusted remote URL cannot select DEV", mode: "production", base: "https://evil.example", headers: proxy, expected: canonical },
  { name: "direct localhost remains HTTP with DEV configured", base: local, headers: { origin: local, host: "localhost:3000" }, expected: local },
  { name: "internal HTTPS localhost with captured proxy shape uses configured tunnel", base: internal, headers: proxy, expected: tunnel },
  { name: "HTTP internal proxy uses configured tunnel", base: local, headers: proxy, expected: tunnel },
  { name: "proxy without Origin can select only configured forwarded destination", base: internal, headers: { "x-forwarded-host": "configured-fixture.ngrok-free.dev", "x-forwarded-proto": "https" }, expected: tunnel },
  { name: "public tunnel URL without proxy metadata", base: tunnel, expected: tunnel },
  { name: "normalized Origin default port and casing", base: internal, headers: { origin: "https://CONFIGURED-FIXTURE.NGROK-FREE.DEV:443" }, expected: tunnel },
  { name: "direct localhost cannot inherit synthetic proxy HTTPS", base: internal, headers: { origin: local, host: "localhost:3000", "x-forwarded-proto": "https" }, expected: local },
  { name: "local HTTPS config cannot upgrade development listener", base: internal, headers: { host: "localhost:3000" }, expected: local, site: internal },
  { name: "different tunnel cannot add a redirect destination", base: internal, headers: { origin: "https://another-fixture.ngrok-free.dev", host: "another-fixture.ngrok-free.dev", "x-forwarded-host": "another-fixture.ngrok-free.dev", "x-forwarded-proto": "https" }, expected: local },
  { name: "forged Host and forwarded host remain local", base: internal, headers: { origin: "https://evil.example", host: "evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" }, expected: local },
  { name: "fake configured-host suffix remains local", base: internal, headers: { "x-forwarded-host": "configured-fixture.ngrok-free.dev.evil.example", "x-forwarded-proto": "https" }, expected: local },
  { name: "different forwarded port cannot select tunnel", base: internal, headers: { "x-forwarded-host": "configured-fixture.ngrok-free.dev:444", "x-forwarded-proto": "https" }, expected: local },
  { name: "different forwarded scheme cannot select tunnel", base: internal, headers: { "x-forwarded-host": "configured-fixture.ngrok-free.dev", "x-forwarded-proto": "http" }, expected: local },
  { name: "forwarded host list is not an exact configured authority", base: internal, headers: { "x-forwarded-host": "evil.example, configured-fixture.ngrok-free.dev", "x-forwarded-proto": "https" }, expected: local },
  { name: "missing DEV does not trust proxy host", base: internal, headers: proxy, expected: local, dev: "" },
  { name: "invalid DEV path is ignored", base: internal, headers: proxy, expected: local, dev: tunnel + "/path" },
  { name: "invalid DEV userinfo is ignored", base: internal, headers: proxy, expected: local, dev: "https://user:password@configured-fixture.ngrok-free.dev" },
  { name: "untrusted remote request URL returns configured public fallback", base: "https://evil.example", headers: { host: "evil.example" }, expected: canonical },
  { name: "loopback Host normalized by Next preserves 127.0.0.1", base: internal, headers: { host: "127.0.0.1:3000" }, expected: "http://127.0.0.1:3000" },
  { name: "IPv6 development loopback remains HTTP", base: "https://[::1]:3000", headers: { host: "[::1]:3000" }, expected: "http://[::1]:3000" },
  { name: "another local development port remains HTTP", base: "https://localhost:3001", headers: { host: "localhost:3001" }, expected: "http://localhost:3001" },
];

try {
  for (const fixture of cases) {
    for (const key of runtimeKeys) delete process.env[key];
    Object.assign(process.env, { NODE_ENV: fixture.mode ?? "development", DEV_PUBLIC_ORIGIN: fixture.dev ?? tunnel, NEXT_PUBLIC_SITE_URL: fixture.site ?? canonical, MEMBER_SITE_URL: canonical });
    if (fixture.railway) process.env.RAILWAY_SERVICE_ID = "isolated-service";
    for (const [label, handler, endpoint, destination] of [
      ["member logout", memberLogout.POST, "/api/auth/logout", "/"],
      ["admin logout", adminLogout.POST, "/api/admin/logout", "/admin/login"],
      ["admin login success", adminLogin.POST, "/api/admin/login", "/admin"],
    ] as const) {
      const body = new FormData(); body.set("password", password);
      const request = new Request(fixture.base + endpoint + "?origin=https://evil.example&returnTo=//evil.example", { method: "POST", headers: fixture.headers, body });
      const response = await handler(request);
      const location = response.headers.get("location")!;
      assert.equal(response.status, 303);
      assert.equal(location, fixture.expected + destination, fixture.name + " " + label);
      assert.equal(/^https:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/)/.test(location), false);
      if (label === "member logout") {
        const cookie = writes.at(-1)!;
        assert.equal(cookie.name, member.MEMBER_SESSION_COOKIE); assert.equal(cookie.value, "");
        assert.equal((cookie.options.expires as Date).getTime(), 0); assert.equal(cookie.options.path, "/");
        assert.equal(cookie.options.domain, undefined); assert.equal(cookie.options.httpOnly, true); assert.equal(cookie.options.sameSite, "lax");
        assert.equal(cookie.options.secure, process.env.NODE_ENV === "production");
      } else {
        const cookie = response.cookies.get(admin.adminCookieName)!;
        assert.equal(cookie.domain, undefined); assert.equal(cookie.path, "/"); assert.equal(cookie.httpOnly, true); assert.equal(cookie.sameSite, "lax");
        assert.equal(cookie.secure, fixture.expected.startsWith("https:"));
        if (label === "admin logout") { assert.equal(cookie.value, ""); assert.equal(cookie.maxAge, 0); }
        else { assert.ok(admin.parseAdminSessionValue(cookie.value)); assert.equal(cookie.maxAge, 43200); }
      }
      assert.deepEqual(await readdir(root), [], "auth redirects do not mutate member data");
      console.log(`PASS ${++checks}: ${fixture.name} / ${label}`);
    }
  }
  for (const key of runtimeKeys) delete process.env[key];
  Object.assign(process.env, { NODE_ENV: "development", DEV_PUBLIC_ORIGIN: tunnel });
  const proxyRequest = new Request(internal + "/api/test", { headers: proxy });
  assert.equal(origin.resolvePublicSiteOrigin(proxyRequest), tunnel);
  assert.deepEqual(origin.resolveAllowedRequestOrigins(proxyRequest), [local, "http://127.0.0.1:3000", "http://[::1]:3000", tunnel]);
  console.log(`PASS ${++checks}: credit allowlist remains local HTTP plus explicit tunnel independently of redirect selection`);
  // Audit the existing, separate LINE success path without changing OAuth code.
  const lineLogin = await import("../app/api/auth/line/login/route");
  const lineCallback = await import("../app/api/auth/line/callback/route");
  Object.assign(process.env, { LINE_LOGIN_CHANNEL_ID: "isolated-channel", LINE_LOGIN_CHANNEL_SECRET: randomBytes(24).toString("hex"), LINE_LOGIN_EMAIL_SCOPE: "false" });
  const authorizationResponse = await lineLogin.GET(new Request(internal + "/api/auth/line/login?returnTo=%2Fmember", { headers: proxy }));
  const authorization = new URL(authorizationResponse.headers.get("location")!);
  assert.equal(authorization.searchParams.get("redirect_uri"), tunnel + "/api/auth/line/callback");
  console.log(`PASS ${++checks}: existing LINE authorization uses ngrok HTTPS through the same proxy shape`);
  globalThis.fetch = async (url, options) => {
    if (String(url) === "https://api.line.me/oauth2/v2.1/token") {
      assert.equal(new URLSearchParams(String(options?.body)).get("redirect_uri"), tunnel + "/api/auth/line/callback");
      return Response.json({ id_token: "isolated-id-token" });
    }
    if (String(url) === "https://api.line.me/oauth2/v2.1/verify") return Response.json({ sub: "isolated-ngrok-logout-regression", nonce: authorizationResponse.cookies.get("line_oauth_nonce")!.value, name: "Isolated Member" });
    throw new Error("Unexpected external network request");
  };
  const cookieHeader = authorizationResponse.cookies.getAll().map(cookie => `${cookie.name}=${encodeURIComponent(cookie.value)}`).join("; ");
  const callback = await lineCallback.GET(new NextRequest(internal + "/api/auth/line/callback?code=isolated-code&state=" + authorization.searchParams.get("state"), { headers: { ...proxy, cookie: cookieHeader } }));
  assert.equal(callback.headers.get("location"), tunnel + "/member");
  assert.ok(member.verifySessionToken(callback.cookies.get(member.MEMBER_SESSION_COOKIE)!.value));
  assert.equal(callback.cookies.get(member.MEMBER_SESSION_COOKIE)?.secure, true);
  assert.equal(callback.cookies.get(member.MEMBER_SESSION_COOKIE)?.domain, undefined);
  console.log(`PASS ${++checks}: existing member LINE login success returns to ngrok with valid host-only session`);
  console.log(`PASS ${checks} isolated development auth redirect checks`);
} finally {
  if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("kd-dev-auth-redirects-")) throw new Error("Unexpected temporary cleanup target");
  await rm(root, { recursive: true, force: true });
}
