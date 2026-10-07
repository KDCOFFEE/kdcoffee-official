// node --experimental-strip-types --import ./scripts/public-origin-test-bootstrap.mjs scripts/test-member-logout-flow.mts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { NextRequest } from "next/server";
import { autoImplementMethods } from "next/dist/server/route-modules/app-route/helpers/auto-implement-methods.js";

const root = await mkdtemp(path.join(os.tmpdir(), "kd-member-logout-flow-"));
const secret = randomBytes(48).toString("hex");
const runtimeKeys = ["RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID", "RAILWAY_ENVIRONMENT_ID", "RAILWAY_VOLUME_MOUNT_PATH"];
for (const key of runtimeKeys) delete process.env[key];
Object.assign(process.env, { KD_DATA_DIR: root, AUTH_SESSION_SECRET: secret, MEMBER_IDENTITY_SECRET: secret });
const jar = new Map<string, string>();
const writes: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
(globalThis as typeof globalThis & { __publicOriginTestCookies?: unknown }).__publicOriginTestCookies = {
  get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined,
  set: (name: string, value: string, options: Record<string, unknown>) => { jar.set(name, value); writes.push({ name, value, options }); },
};
globalThis.fetch = async () => { throw new Error("External network forbidden in logout tests"); };
const auth = await import("../lib/memberAuth");
const logout = await import("../app/api/auth/logout/route");
const originalInfo = console.info;
const logs: Array<[string, Record<string, unknown>]> = [];
console.info = (prefix: string, fields: Record<string, unknown>) => { logs.push([prefix, fields]); };
let checks = 0;
function pass(name: string) { console.log(`PASS ${++checks}: ${name}`); }

try {
  // AST verifies the real UI source, not a fixture or a copy of default markup.
  // This proves implementation intent; it is not real-browser network evidence.
  const text = await readFile(new URL("../app/member/page.tsx", import.meta.url), "utf8");
  const source = ts.createSourceFile("member.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let form: ts.JsxElement | undefined;
  function attribute(attributes: ts.JsxAttributes, name: string) {
    return attributes.properties.find((item): item is ts.JsxAttribute => ts.isJsxAttribute(item) && item.name.getText(source) === name);
  }
  function value(attributes: ts.JsxAttributes, name: string) {
    const initializer = attribute(attributes, name)?.initializer;
    return initializer && ts.isStringLiteral(initializer) ? initializer.text : undefined;
  }
  function find(node: ts.Node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === "form" && value(node.openingElement.attributes, "action") === "/api/auth/logout") form = node;
    ts.forEachChild(node, find);
  }
  find(source);
  assert.ok(form, "actual member page has native logout form");
  assert.equal(value(form.openingElement.attributes, "method"), "post");
  assert.equal(attribute(form.openingElement.attributes, "onSubmit"), undefined);
  for (let ancestor = form.parent; ancestor; ancestor = ancestor.parent) {
    assert.equal(ts.isJsxElement(ancestor) && ancestor.openingElement.tagName.getText(source) === "form", false, "logout form is not nested inside another form");
  }
  pass("actual UI AST uses native POST form without onSubmit interception or nested form");
  const button = form.children.find((child): child is ts.JsxElement => ts.isJsxElement(child) && child.openingElement.tagName.getText(source) === "button");
  assert.ok(button);
  assert.ok([undefined, "submit"].includes(value(button.openingElement.attributes, "type")));
  for (const name of ["formMethod", "formAction", "onClick"]) assert.equal(attribute(button.openingElement.attributes, name), undefined);
  pass("logout is a native submit button with no GET override or client click navigation");
  assert.deepEqual(Object.keys(logout), ["POST"]);
  pass("route exports POST only; no GET logout mutation endpoint exists");
  const methods = autoImplementMethods(logout);
  const unsubmittedToken = auth.createSessionToken("GET_TEST_SENTINEL");
  jar.set(auth.MEMBER_SESSION_COOKIE, unsubmittedToken);
  const writesBeforeGet = writes.length;
  const logsBeforeGet = logs.length;
  const getResponse = await methods.GET(new NextRequest("http://localhost:3000/api/auth/logout"), { params: Promise.resolve({}) });
  assert.ok(getResponse instanceof Response);
  assert.equal(getResponse.status, 405);
  assert.equal(jar.get(auth.MEMBER_SESSION_COOKIE), unsubmittedToken);
  assert.equal(writes.length, writesBeforeGet);
  assert.equal(logs.length, logsBeforeGet);
  pass("installed Next method dispatcher returns GET 405 without logout or cookie mutation");
  const optionsResponse = await methods.OPTIONS(new NextRequest("http://localhost:3000/api/auth/logout", { method: "OPTIONS" }), { params: Promise.resolve({}) });
  assert.ok(optionsResponse instanceof Response);
  assert.equal(optionsResponse.status, 204);
  assert.equal(optionsResponse.headers.get("allow"), "OPTIONS, POST");
  assert.equal(writes.length, writesBeforeGet);
  pass("installed Next OPTIONS advertises POST and cannot mutate session");

  const tunnel = "https://configured-fixture.ngrok-free.dev";
  const canonical = "https://www.kdcoffee1962.com";
  const cases = [
    { name: "ngrok proxy", mode: "development", base: "https://localhost:3000", expected: tunnel, headers: { origin: tunnel, "x-forwarded-host": "configured-fixture.ngrok-free.dev", "x-forwarded-proto": "https" } },
    { name: "HTTP localhost direct", mode: "development", base: "http://localhost:3000", expected: "http://localhost:3000", headers: { origin: "http://localhost:3000", host: "localhost:3000" } },
    { name: "production ignores configured DEV", mode: "production", base: canonical, expected: canonical, headers: { origin: canonical } },
    { name: "production Railway internal", mode: "production", base: "https://kdcoffee-official-production.up.railway.app", expected: canonical, headers: {} },
    { name: "forged forwarded host cannot control destination", mode: "development", base: "https://localhost:3000", expected: "http://localhost:3000", headers: { origin: "https://evil.example", host: "evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" } },
    { name: "sensitive Origin components cannot control redirects", mode: "development", base: "http://localhost:3000", expected: "http://localhost:3000", headers: { origin: "https://user:PRIVATE_PASSWORD_SENTINEL@evil.example/path?token=PRIVATE_QUERY_SENTINEL" } },
  ];
  for (const fixture of cases) {
    Object.assign(process.env, { NODE_ENV: fixture.mode, DEV_PUBLIC_ORIGIN: tunnel, NEXT_PUBLIC_SITE_URL: canonical, MEMBER_SITE_URL: canonical });
    const memberId = "PRIVATE_MEMBER_SENTINEL";
    const token = auth.createSessionToken(memberId);
    jar.set(auth.MEMBER_SESSION_COOKIE, token);
    assert.equal(auth.verifySessionToken(token), memberId);
    const start = logs.length;
    const headers = new Headers({ "sec-fetch-site": "same-origin", cookie: token, authorization: "PRIVATE_AUTH_SENTINEL" });
    for (const [name, value] of Object.entries(fixture.headers)) {
      if (value !== undefined) headers.set(name, value);
    }
    const request = new Request(fixture.base + "/api/auth/logout?token=PRIVATE_QUERY_SENTINEL", { method: "POST", headers, body: "PRIVATE_BODY_SENTINEL" });
    request.json = async () => { throw new Error("Logout must not read body"); };
    const response = await logout.POST(request);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), fixture.expected + "/");
    assert.equal(new URL(response.headers.get("location")!).pathname, "/");
    assert.equal(/^https:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/)/.test(response.headers.get("location")!), false);
    assert.equal(jar.get(auth.MEMBER_SESSION_COOKIE), "");
    assert.equal(auth.verifySessionToken(jar.get(auth.MEMBER_SESSION_COOKIE)), null);
    const cookie = writes.at(-1)!;
    assert.equal(cookie.name, auth.MEMBER_SESSION_COOKIE); assert.equal(cookie.value, "");
    assert.equal((cookie.options.expires as Date).getTime(), 0); assert.equal(cookie.options.path, "/"); assert.equal(cookie.options.domain, undefined);
    assert.equal(cookie.options.httpOnly, true); assert.equal(cookie.options.sameSite, "lax"); assert.equal(cookie.options.secure, fixture.mode === "production");
    const emitted = logs.slice(start);
    assert.equal(emitted.length, 0, "logout emits no temporary diagnostics in any environment");
    const serialized = JSON.stringify(emitted);
    for (const sensitive of [secret, token, memberId, "PRIVATE_BODY_SENTINEL", "PRIVATE_QUERY_SENTINEL", "PRIVATE_AUTH_SENTINEL", "PRIVATE_PASSWORD_SENTINEL"]) assert.equal(serialized.includes(sensitive), false);
    assert.deepEqual(await readdir(root), [], "logout does not modify member data");
    pass(`${fixture.name}: POST 303 to root, session cleared, no diagnostic output`);
  }
  console.log(`PASS ${checks} member logout flow checks; UI checks are AST, request checks are isolated routes`);
} finally {
  console.info = originalInfo;
  if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("kd-member-logout-flow-")) throw new Error("Unexpected cleanup target");
  await rm(root, { recursive: true, force: true });
}
