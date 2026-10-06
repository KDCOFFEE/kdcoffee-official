import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

const root = await mkdtemp(path.join(os.tmpdir(), "kd-public-origin-"));
const canonical = "https://www.kdcoffee1962.com";
const railway = "https://kdcoffee-official-production.up.railway.app";
const secret = randomBytes(48).toString("hex");
const password = randomBytes(24).toString("hex");
const runtimeKeys = ["RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID", "RAILWAY_ENVIRONMENT_ID", "RAILWAY_VOLUME_MOUNT_PATH"];
for (const key of runtimeKeys) delete process.env[key];
Object.assign(process.env, { KD_DATA_DIR: root, AUTH_SESSION_SECRET: secret, ADMIN_SESSION_SECRET: secret, MEMBER_IDENTITY_SECRET: secret, ADMIN_PASSWORD: password });
const jar = new Map<string, string>();
const cleared: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
(globalThis as any).__publicOriginTestCookies = {
  get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined,
  set: (name: string, value: string, options: Record<string, unknown>) => { jar.set(name, value); cleared.push({ name, value, options }); },
};
const origin = await import("../lib/publicSiteOrigin");
const login = await import("../app/api/admin/login/route");
const logout = await import("../app/api/admin/logout/route");
const memberLogout = await import("../app/api/auth/logout/route");
const adminAuth = await import("../lib/adminAuth");
const memberAuth = await import("../lib/memberAuth");
const lineLogin = await import("../app/api/auth/line/login/route");
const lineCallback = await import("../app/api/auth/line/callback/route");
let passed = 0;
const check = async (name: string, operation: () => unknown | Promise<unknown>) => { await operation(); console.log(`PASS ${++passed}: ${name}`); };
function request(base: string, route: string, headers: HeadersInit = {}, suppliedPassword = password) {
  const body = new FormData(); body.set("password", suppliedPassword);
  return new Request(base + route, { method: "POST", headers, body });
}
const proxy = { "x-forwarded-host": "www.kdcoffee1962.com", "x-forwarded-proto": "https", host: "kdcoffee-official-production.up.railway.app" };
const originalFetch = globalThis.fetch;
globalThis.fetch = (async () => { throw new Error("Unexpected network request blocked"); }) as typeof fetch;

try {
  Object.assign(process.env, { NODE_ENV: "production" });
  process.env.RAILWAY_SERVICE_ID = "isolated-service";
  process.env.NEXT_PUBLIC_SITE_URL = railway;
  process.env.MEMBER_SITE_URL = canonical;
  for (const [label, base, headers] of [["public", canonical, {}], ["proxy internal", railway, proxy]] as const) {
    await check(`${label} admin success stays canonical with legacy Railway config`, async () => {
      const response = await login.POST(request(base, "/api/admin/login", headers));
      assert.equal(response.status, 303); assert.equal(response.headers.get("location"), canonical + "/admin");
      const cookie = response.cookies.get(adminAuth.adminCookieName)!;
      assert.equal(cookie.httpOnly, true); assert.equal(cookie.sameSite, "lax"); assert.equal(cookie.secure, true); assert.equal(cookie.path, "/"); assert.equal(cookie.maxAge, 43200); assert.equal(cookie.domain, undefined);
      const session = adminAuth.parseAdminSessionValue(cookie.value)!;
      assert.equal(session.role, "owner"); assert.ok(Math.abs(session.expiresAt - Date.now() - 43200000) < 2000);
    });
    await check(`${label} wrong password stays canonical and sets no session`, async () => {
      const r = await login.POST(request(base, "/api/admin/login", headers, "invalid"));
      assert.equal(r.status, 303); assert.equal(r.headers.get("location"), canonical + "/admin/login?error=invalid"); assert.equal(r.cookies.get(adminAuth.adminCookieName), undefined);
    });
    await check(`${label} missing password configuration stays canonical`, async () => {
      delete process.env.ADMIN_PASSWORD;
      try { const r = await login.POST(request(base, "/api/admin/login", headers)); assert.equal(r.headers.get("location"), canonical + "/admin/login?error=not_configured"); assert.equal(r.cookies.get(adminAuth.adminCookieName), undefined); }
      finally { process.env.ADMIN_PASSWORD = password; }
    });
    await check(`${label} logout clears matching host-only cookie`, async () => {
      const r = await logout.POST(request(base, "/api/admin/logout", headers));
      assert.equal(r.status, 303); assert.equal(r.headers.get("location"), canonical + "/admin/login");
      const cookie = r.cookies.get(adminAuth.adminCookieName)!;
      assert.equal(cookie.value, ""); assert.equal(cookie.maxAge, 0); assert.equal(cookie.domain, undefined); assert.equal(cookie.path, "/"); assert.equal(cookie.secure, true); assert.equal(cookie.httpOnly, true); assert.equal(cookie.sameSite, "lax");
    });
    await check(`${label} member logout clears session and stays canonical`, async () => {
      const r = await memberLogout.POST(request(base, "/api/auth/logout", headers));
      assert.equal(r.status, 303); assert.equal(r.headers.get("location"), canonical + "/");
      const cookie = cleared.at(-1)!; assert.equal(cookie.name, memberAuth.MEMBER_SESSION_COOKIE); assert.equal(cookie.value, ""); assert.equal((cookie.options.expires as Date).getTime(), 0); assert.equal(cookie.options.domain, undefined); assert.equal(cookie.options.path, "/");
    });
  }
  for (const host of ["evil.example", "www.kdcoffee1962.com.evil.example", "www.kdcoffee1962.com@evil.example", "evil.example, www.kdcoffee1962.com"]) {
    await check(`untrusted forwarded host ${host} cannot change redirects`, async () => {
      const headers = { host, "x-forwarded-host": host, "x-forwarded-proto": "javascript" };
      for (const handler of [login.POST, logout.POST, memberLogout.POST]) {
        const r = await handler(request(railway, "/api/test?origin=https://evil.example&returnTo=//evil.example", headers));
        assert.equal(new URL(r.headers.get("location")!).origin, canonical);
      }
    });
  }
  await check("missing or malformed URL settings still use canonical Railway origin", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL; delete process.env.MEMBER_SITE_URL;
    assert.equal(origin.resolvePublicSiteOrigin(new Request("http://localhost:8080/api/test")), canonical);
    process.env.NEXT_PUBLIC_SITE_URL = "javascript:alert(1)";
    assert.equal(origin.resolvePublicSiteOrigin(new Request(railway)), canonical);
  });
  for (const key of runtimeKeys) delete process.env[key];
  for (const base of ["http://localhost:4319", "http://127.0.0.1:4319", "http://[::1]:4319"]) {
    await check(`${base} remains local even with production URL config and forged headers`, async () => {
      process.env.NEXT_PUBLIC_SITE_URL = canonical;
      const headers = { "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" };
      const r = await login.POST(request(base, "/api/admin/login", headers));
      assert.equal(r.headers.get("location"), base + "/admin"); assert.equal(r.cookies.get(adminAuth.adminCookieName)?.secure, false);
      const out = await logout.POST(request(base, "/api/admin/logout", headers)); assert.equal(out.headers.get("location"), base + "/admin/login"); assert.equal(out.cookies.get(adminAuth.adminCookieName)?.secure, false);
      const memberOut = await memberLogout.POST(request(base, "/api/auth/logout", headers)); assert.equal(memberOut.headers.get("location"), base + "/");
    });
  }
  await check("explicit HTTPS development host remains supported", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://admin.test/path";
    assert.equal(origin.resolvePublicSiteOrigin(new Request("https://internal.test/", { headers: { "x-forwarded-host": "evil.example" } })), "https://admin.test");
  });
  await check("normalized local request URL preserves the browser loopback Host and cookie origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://127.0.0.1:4319";
    assert.equal(origin.resolvePublicSiteOrigin(new Request("http://localhost:4319/api/admin/login", { headers: { host: "127.0.0.1:4319", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" } })), "http://127.0.0.1:4319");
    assert.equal(origin.resolvePublicSiteOrigin(new Request("http://localhost:4319/", { headers: { host: "127.0.0.1:9999" } })), "http://localhost:4319");
    assert.equal(origin.resolvePublicSiteOrigin(new Request("http://localhost:4319/", { headers: { host: "evil.example:4319" } })), "http://localhost:4319");
  });
  await check("unconfigured request Host and unsafe configured URL cannot create external redirects", () => {
    delete process.env.MEMBER_SITE_URL;
    for (const value of ["", "https://user:password@evil.example", "javascript:alert(1)", "http://evil.example"]) {
      process.env.NEXT_PUBLIC_SITE_URL = value;
      assert.equal(origin.resolvePublicSiteOrigin(new Request("https://evil.example/")), canonical);
    }
  });
  await check("admin return link and unauthenticated redirect stay relative", async () => {
    const page = await readFile(new URL("../app/admin/login/page.tsx", import.meta.url), "utf8"); assert.match(page, /href="\/">返回網站/);
    const adminPage = await readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"); assert.match(adminPage, /redirect\("\/admin\/login"\)/);
  });
  // LINE routes are intentionally unchanged. Run their real authorization and
  // callback flow with an isolated member registry and stubbed LINE responses.
  process.env.NEXT_PUBLIC_SITE_URL = railway;
  process.env.LINE_LOGIN_CHANNEL_ID = "isolated-channel";
  process.env.LINE_LOGIN_CHANNEL_SECRET = randomBytes(24).toString("hex");
  process.env.LINE_LOGIN_EMAIL_SCOPE = "false";
  for (const [label, base, headers, extra] of [["public proxy", railway, proxy, ""], ["local", "http://localhost:4319", {}, ""], ["explicit local origin", railway, {}, "&origin=http%3A%2F%2Flocalhost%3A4319"]] as const) {
    await check(`LINE ${label} authorization and successful callback remain compatible`, async () => {
      const expected = label === "public proxy" ? canonical : "http://localhost:4319";
      process.env.NEXT_PUBLIC_SITE_URL = label === "local" ? expected : railway;
      const r = await lineLogin.GET(new Request(base + "/api/auth/line/login?returnTo=%2Fcheckout" + extra, { headers }));
      const authorization = new URL(r.headers.get("location")!);
      assert.equal(authorization.origin, "https://access.line.me"); assert.equal(authorization.searchParams.get("redirect_uri"), expected + "/api/auth/line/callback"); assert.equal(authorization.searchParams.get("scope"), "openid profile");
      assert.equal(r.cookies.get("line_oauth_state")?.maxAge, 600); assert.equal(r.cookies.get("line_oauth_state")?.domain, undefined);
      const cookieHeader = r.cookies.getAll().map(c => `${c.name}=${encodeURIComponent(c.value)}`).join("; ");
      let tokenCalls = 0;
      globalThis.fetch = (async (url, options) => {
        if (String(url) === "https://api.line.me/oauth2/v2.1/token") { tokenCalls++; assert.equal(new URLSearchParams(String(options?.body)).get("redirect_uri"), expected + "/api/auth/line/callback"); return Response.json({ id_token: "isolated-id-token" }); }
        if (String(url) === "https://api.line.me/oauth2/v2.1/verify") return Response.json({ sub: "isolated-" + label, nonce: r.cookies.get("line_oauth_nonce")!.value, name: "Isolated Member" });
        throw new Error("Unexpected network request blocked");
      }) as typeof fetch;
      const callback = await lineCallback.GET(new NextRequest(base + "/api/auth/line/callback?code=isolated-code&state=" + authorization.searchParams.get("state"), { headers: { ...headers, cookie: cookieHeader } }));
      assert.equal(tokenCalls, 1); assert.equal(callback.headers.get("location"), expected + "/checkout");
      const cookie = callback.cookies.get(memberAuth.MEMBER_SESSION_COOKIE)!; assert.ok(memberAuth.verifySessionToken(cookie.value)); assert.equal(cookie.domain, undefined); assert.equal(cookie.secure, expected.startsWith("https:"));
      assert.equal(callback.cookies.get("line_oauth_state")?.value, "");
      const errorLog = console.error;
      try {
        console.error = () => {};
        const failed = await lineCallback.GET(new NextRequest(base + "/api/auth/line/callback?error=access_denied", { headers: { ...headers, cookie: cookieHeader } }));
        assert.equal(failed.headers.get("location"), expected + "/member?error=line_login_failed"); assert.equal(failed.cookies.get("line_oauth_state")?.value, ""); assert.equal(tokenCalls, 1);
      } finally { console.error = errorLog; }
      jar.clear();
    });
  }
  console.log(`\n${passed} public origin / auth route cases passed (isolated data, no live login/logout).`);
} finally {
  globalThis.fetch = originalFetch;
  await rm(root, { recursive: true, force: true });
}
