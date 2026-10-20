import assert from "node:assert/strict";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import os from "node:os";
import * as util from "node:util";
import * as asyncHooks from "node:async_hooks";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const workspace = "components/admin/works/WorksArtworkWorkspace.tsx";
const helper = "components/admin/works/WorksWorkspaceEditSession.ts";
const indexPage = "app/admin/works/page.tsx";
const indexComponent = "components/admin/works/WorksArtworkIndex.tsx";
let indexRole: string | null = "owner", catalogReads = 0;
let indexCatalog: any[] = [];
const ExistingWorksManager = () => React.createElement("div", { "data-existing-works-manager": true });
const allowed = new Set([workspace, helper, indexPage, indexComponent, ...[
  "worksArtworkOwnerProjection", "worksArtworkReadModel", "worksArtworkFieldRegistry", "worksArtworkSourceTrace",
  "worksArtworkResolver", "worksArtworkContract", "worksArtworkValidation", "productVisualAssets",
  "productPageContent", "productPageContentValidation", "productPageSections", "cleanRoastingMedia", "media",
].map(n => "lib/" + n + ".ts")]);
const cache = new Map<string, { exports: any }>();
function load(id: string): any {
  assert.ok(allowed.has(id), "Unexpected runtime import: " + id);
  if (cache.has(id)) return cache.get(id)!.exports;
  const module = { exports: {} }; cache.set(id, module);
  const js = ts.transpileModule(readFileSync(path.join(root, id), "utf8"), {
    fileName: id, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function("require", "module", "exports", js)((specifier: string) => {
    if (specifier === "@/lib/adminAuth") return { readAdminSession: async () => indexRole ? { role: indexRole } : null, isAdminAuthenticated: async () => !!indexRole };
    if (specifier === "@/data/websiteData") return { getLiveWebsiteData: async () => { catalogReads++; return { menu: { products: structuredClone(indexCatalog) } }; } };
    if (specifier === "@/components/admin/WorksPageManager") return ExistingWorksManager;
    if (specifier === "next/navigation") return { redirect: (url: string) => { throw { redirect: url }; } };
    if (specifier === "react") return React;
    if (specifier === "react/jsx-runtime") return jsx;
    if (specifier === "next/link") return ({ children, ...props }: any) => React.createElement("a", props, children);
    if (specifier.endsWith(".module.css")) return new Proxy({}, { get: (_t, k) => k === "__esModule" ? false : String(k) });
    assert.ok(specifier.startsWith("./") || specifier.startsWith("@/"), "No server/filesystem/network imports allowed");
    let target = specifier.startsWith("@/") ? specifier.slice(2) : path.posix.join(path.posix.dirname(id), specifier);
    if (!/\.tsx?$/.test(target)) target += allowed.has(target + ".tsx") ? ".tsx" : ".ts";
    return load(target);
  }, module, module.exports);
  return module.exports;
}
const hash = (file: string) => crypto.createHash("sha256").update(readFileSync(file)).digest("hex");
function fingerprints() {
  const result: Array<[string, string]> = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file); else if (entry.name.endsWith(".json")) result.push([path.relative(root, file), hash(file)]);
    }
  }
  walk(path.join(root, "data")); walk(path.join(root, "public/data"));
  return result.sort((a, b) => a[0].localeCompare(b[0]));
}
const before = fingerprints();
assert.equal(before.length, 17);
assert.equal(hash(path.join(root, "public/data/website-data.json")), "77b44042e32ef589c6c08a2c5a2589b15bc89d97e97542b11b0dd9769c18ad93");
assert.equal(hash(path.join(root, "public/data/homepage.json")), "dbd97d72fd30bb548fff461084c3b497ec877e169d1f728c1fa408a92128cfac");
const originalFetch = globalThis.fetch;
let network = 0;
globalThis.fetch = async () => { network++; throw Error("No real network allowed"); };
let pass = 0, fail = 0;
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try { await fn(); pass++; } catch (error) { fail++; console.error("FAIL " + name); console.error(error); }
}
const clone = <T,>(v: T): T => structuredClone(v);
const html = (component: any, props: any) => renderToStaticMarkup(React.createElement(component, props));
// Expand only stateless field/save-bar components, then drive their real callbacks.
function nodes(element: any): any[] {
  if (!React.isValidElement(element)) return Array.isArray(element) ? element.flatMap(nodes) : [];
  const el = element as any;
  if (typeof el.type === "function") return nodes(el.type(el.props));
  return [el, ...nodes(el.props.children)];
}
function button(tree: any, label: string) {
  const found = nodes(tree).find(n => n.type === "button" && n.props.children === label);
  assert.ok(found, "Missing button " + label); return found;
}


async function tempSaveIntegration() {
  const temporary = process.env.W35A_TEMP_ROOT!;
  function within(parent: string, file: string) {
    const relative = path.relative(path.resolve(parent), path.resolve(file));
    return !!relative && !relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative);
  }
  assert.ok(temporary && within(os.tmpdir(), temporary) && !within(root, temporary));
  assert.equal(process.env.KD_DATA_DIR, temporary);
  assert.equal(process.env.RAILWAY_VOLUME_MOUNT_PATH, undefined);
  const serverAllowed = new Set([workspace, helper, "data/websiteData.ts",
    "app/api/admin/works/[slug]/owner-write/route.ts", "app/api/admin/works/[slug]/owner-read/route.ts",
    ...["adminAuth", "adminAuthorization", "publicSiteOrigin", "storagePaths", "jsonFileStore", "commerceLockProtocol",
      "worksArtworkEditorialWriteService", "worksArtworkOwnerReadService", "worksArtworkOwnerProjection",
      "worksArtworkFieldRegistry", "worksArtworkReadModel", "worksArtworkSourceTrace", "worksArtworkContract",
      "worksArtworkValidation", "worksArtworkResolver", "worksArtworkWriteModel", "productPageContent",
      "productPageContentValidation", "productPageSections", "productVisualAssets", "cleanRoastingMedia", "media",
      "productListing"].map(n => "lib/" + n + ".ts")]);
  const fixture = path.join(temporary, "store/website-data.json"), initial = fs.readFileSync(fixture);
  const serverCache = new Map<string, { exports: any }>();
  let activeRequest: Request | null = null, io = 0;
  function guard(file: unknown): asserts file is string {
    assert.equal(typeof file, "string"); assert.ok(within(temporary, file as string), "Application IO escaped TEMP");
  }
  const safeFs = {
    async readFile(file: string, ...args: any[]) { guard(file); io++; return (fsp.readFile as any)(file, ...args); },
    async open(file: string, ...args: any[]) { guard(file); io++; return (fsp.open as any)(file, ...args); },
    async rename(from: string, to: string) { guard(from); guard(to); io++; return fsp.rename(from, to); },
    async unlink(file: string) { guard(file); io++; return fsp.unlink(file); },
  };
  function app(id: string): any {
    assert.ok(serverAllowed.has(id), "Unexpected integration dependency: " + id);
    if (serverCache.has(id)) return serverCache.get(id)!.exports;
    const module = { exports: {} }; serverCache.set(id, module);
    const output = ts.transpileModule(readFileSync(path.join(root, id), "utf8"), {
      fileName: id, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    new Function("require", "module", "exports", output)((specifier: string) => {
      if (specifier === "server-only") return {};
      if (specifier === "next/headers") return { cookies: async () => ({ get: (key: string) => {
        const value = activeRequest?.headers.get("cookie")?.split("; ").find(pair => pair.startsWith(key + "="))?.slice(key.length + 1);
        return value ? { value } : undefined;
      } }) };
      if (specifier === "react") return React;
      if (specifier === "react/jsx-runtime") return jsx;
      if (specifier === "next/link") return ({ children, ...props }: any) => React.createElement("a", props, children);
      if (specifier.endsWith(".module.css")) return new Proxy({}, { get: (_t, k) => k === "__esModule" ? false : String(k) });
      if (specifier === "crypto" || specifier === "node:crypto") return crypto;
      if (specifier === "path" || specifier === "node:path") return path;
      if (specifier === "node:util") return util;
      if (specifier === "node:async_hooks") return asyncHooks;
      if (specifier === "node:fs/promises") return safeFs;
      if (specifier === "fs") return { promises: safeFs };
      // The data module's legacy seed import is inert; live reads still exercise
      // its real getWebsiteDataFile() + safeFs path. Never give writers raw fs.
      if (specifier === "@/public/data/website-data.json") return JSON.parse(initial.toString("utf8"));
      assert.ok(specifier.startsWith("./") || specifier.startsWith("@/"), "Network/external application import forbidden");
      let target = specifier.startsWith("@/") ? specifier.slice(2) : path.posix.join(path.posix.dirname(id), specifier);
      if (!/\.tsx?$/.test(target)) target += serverAllowed.has(target + ".tsx") ? ".tsx" : ".ts";
      return app(target);
    }, module, module.exports);
    return module.exports;
  }
  const website = app("lib/storagePaths.ts").getWebsiteDataFile();
  guard(website);
  assert.equal(path.resolve(website), path.resolve(fixture));
  assert.ok(!within(path.join(root, "public/data"), website));
  assert.ok(!/^\/data(?:\/|$)/i.test(website.replaceAll("\\", "/")));
  console.log("F1F2 RESOLVED TEMP WEBSITE: " + website);
  console.log("F1F2 PATH GUARD: PASS before loading real write route/engine.");
  const write = app("app/api/admin/works/[slug]/owner-write/route.ts");
  const read = app("app/api/admin/works/[slug]/owner-read/route.ts");
  const auth = app("lib/adminAuth.ts");
  const ui = app(workspace), edit = app(helper);
  const publicData = app("data/websiteData.ts"), resolver = app("lib/productPageContent.ts");
  const target = "giotto-awakening";
  const ownerCookie = auth.adminCookieName + "=" + auth.createAdminSessionValue({ adminId: "temp-ui-owner", role: "owner" });
  const calls: Array<{ method: string; path: string; body: any; status: number }> = [];
  let origin = "http://localhost:3000";
  const savedFetch = globalThis.fetch;
  // Browser-equivalent receiver, Origin, cookie and Request/Response boundaries.
  // Dispatches to the unmodified production handlers, never to the real server.
  globalThis.fetch = (async function(this: unknown, input: RequestInfo | URL, options?: RequestInit) {
    assert.ok(this === undefined || this === null || this === globalThis, "Illegal fetch receiver");
    const url = new URL(String(input), origin);
    assert.equal(url.origin, origin);
    const match = /^\/api\/admin\/works\/([^/]+)\/owner-(read|write)$/.exec(url.pathname);
    assert.ok(match, "Unexpected fetch URL");
    assert.equal(options?.credentials, "same-origin"); assert.equal(options?.cache, "no-store");
    const headers = new Headers(options?.headers); headers.set("cookie", ownerCookie);
    headers.set("sec-fetch-site", "same-origin");
    const method = options?.method ?? "GET";
    if (method === "POST") headers.set("origin", origin);
    activeRequest = new Request(url, { ...options, headers });
    const response = method === "POST"
      ? await write.POST(activeRequest, { params: Promise.resolve({ slug: decodeURIComponent(match[1]) }) })
      : await read.GET(activeRequest, { params: Promise.resolve({ slug: decodeURIComponent(match[1]) }) });
    calls.push({ method, path: url.pathname, body: options?.body ? JSON.parse(String(options.body)) : null, status: response.status });
    return response;
  }) as typeof fetch;
  const current = () => JSON.parse(fs.readFileSync(website, "utf8"));
  async function clickSave(session: any) {
    let timeout: ReturnType<typeof setTimeout>;
    let unsubscribe = () => {};
    const done = new Promise<void>((resolve, reject) => {
      timeout = setTimeout(() => reject(Error("UI Save did not finish")), 8000);
      unsubscribe = session.subscribe(() => { if (!session.snapshot().busy) resolve(); });
    });
    try {
      const save = button(ui.WorkspaceSaveBar({ session, state: session.snapshot() }), "儲存變更");
      assert.equal(save.props.disabled, false); save.props.onClick(); await done;
    } finally { clearTimeout(timeout!); unsubscribe(); }
    assert.equal(session.snapshot().message, "已儲存");
  }
  let cases = 0;
  try {
    for (origin of ["http://localhost:3000", "https://slit-gorged-decibel.ngrok-free.dev"]) {
      for (const id of Object.keys(edit.EDIT_FIELDS)) {
        fs.writeFileSync(website, initial); calls.length = 0;
        const before = current(), product = before.menu.products.find((p: any) => p.slug === target);
        assert.ok(!Object.hasOwn(product, "worksPage"));
        const initialRead = await ui.readOwnerWorkspace(target);
        assert.ok(initialRead.ok);
        const session = new edit.WorkspaceEditSession(initialRead.data, target, ui.readOwnerWorkspace, ui.isOwnerWorkspaceModel);
        const readField = (model: any) => model.fields.find((f: any) => f.id === id);
        const props = () => ({ item: readField(session.snapshot().model), model: session.snapshot().model, editing: { session, state: session.snapshot() } });
        session.open(id);
        const value = "F1F2 真實路由整合 😀\n最後一字：" + id;
        nodes(ui.WorkspaceField(props())).find(n => n.type === "textarea").props.onChange({ target: { value } });
        // Click production Save while the editor remains active: no blur.
        await clickSave(session);
        const post = calls.filter(c => c.method === "POST");
        assert.equal(post.length, 1); assert.equal(post[0].status, 200);
        assert.equal(post[0].path, "/api/admin/works/" + target + "/owner-write");
        assert.deepEqual(Object.keys(post[0].body).sort(), ["contractVersion", "expectedWorksRevision", "expectedEditToken", "requestId", "operations"].sort());
        assert.deepEqual(post[0].body.operations, [{ scope: "updateEditorialContent", field: edit.EDIT_FIELDS[id], state: { mode: "value", value } }]);
        const stored = current(), updated = stored.menu.products.find((p: any) => p.slug === target);
        assert.equal(updated.worksPage.revision, 1);
        assert.deepEqual(Object.keys(updated.worksPage.fields), [edit.EDIT_FIELDS[id]]);
        assert.equal(updated.worksPage.fields[edit.EDIT_FIELDS[id]].value, value);
        const outside = { ...updated }; delete outside.worksPage;
        assert.deepEqual(outside, product);
        assert.deepEqual(stored.menu.products.filter((p: any) => p.slug !== target), before.menu.products.filter((p: any) => p.slug !== target));
        assert.equal(readField(session.snapshot().model).value, value);
        assert.equal(readField(session.snapshot().model).source.connected, true);
        assert.deepEqual(session.snapshot().drafts, {});
        const reloaded = await ui.readOwnerWorkspace(target); assert.ok(reloaded.ok);
        assert.equal(readField(reloaded.data).value, value);
        assert.equal(reloaded.data.writePreparation.worksRevision, 1);
        const publicValue = async () => {
          const data = await publicData.getLiveWebsiteData();
          const content = resolver.resolveWorksProductPageContent(data.menu.products.find((p: any) => p.slug === target));
          return ({ "content.hero": content["product-hero"].lead, "content.story": content["product-hero"].storyLead, "content.flavor": content["flavor-notes"].description } as any)[id];
        };
        assert.equal(await publicValue(), value, "Public live read did not consume committed Works value");
        button(ui.WorkspaceField(props()), "清空").props.onClick(); await clickSave(session);
        assert.equal(await publicValue(), "");
        const cleared = await ui.readOwnerWorkspace(target); assert.ok(cleared.ok);
        assert.equal(readField(cleared.data).value, ""); assert.equal(cleared.data.writePreparation.worksRevision, 2);
        assert.equal(current().menu.products.find((p: any) => p.slug === target).worksPage.fields[edit.EDIT_FIELDS[id]].value, "");
        session.deactivate(); cases++;
      }
    }
    assert.ok(io > 0);
    console.log("F1F2 TEMP UI→ROUTE→ENGINE→DISK→OWNER/PUBLIC: " + cases + " PASS / 0 FAIL (SET + CLEAR each).");
    console.log("Real signed Owner auth and Origin gates exercised; external network calls: 0.");
  } finally { globalThis.fetch = savedFetch; }
}

if (process.argv.includes("--temp-save-integration")) {
  try { await tempSaveIntegration(); }
  finally { assert.deepEqual(fingerprints(), before, "REAL DATA CHANGED"); globalThis.fetch = originalFetch; }
} else {
try {
  const ui = load(workspace);
  const edit = load(helper);
  const catalog = JSON.parse(readFileSync(path.join(root, "public/data/website-data.json"), "utf8")).menu.products;
  indexCatalog = catalog;
  const product = catalog.find((p: any) => p.slug === "giotto-awakening");
  assert.ok(product);
  const projected = load("lib/worksArtworkOwnerProjection.ts").projectWorksArtworkOwner({ product, catalog, editorialBinding: "CURRENT_PUBLIC" });
  assert.ok(projected.ok);
  const base = { ...projected.value, writePreparation: { worksRevision: 0, editToken: "w3e1." + "1".repeat(64) } };
  assert.ok(ui.isOwnerWorkspaceModel(base));
  const baseJson = JSON.stringify(base);
  const field = (model: any, id: string) => model.fields.find((f: any) => f.id === id);
  type Request = { url: string; options: RequestInit; body: any };
  function harness(initial = base) {
    let server = clone(initial), serial = 0;
    const calls: Request[] = [];
    let readFailure = false;
    let post: (request: Request) => Promise<Response> = async request => success(request);
    function success(request: Request) {
      const updated = clone(server);
      const changedFields: string[] = [];
      for (const operation of request.body.operations) {
        const id = Object.keys(edit.EDIT_FIELDS).find(id => edit.EDIT_FIELDS[id] === operation.field)!;
        Object.assign(field(updated, id), {
          value: operation.state.value, hasValue: true, state: operation.state.value === "" ? "explicit-blank" : "explicit",
          source: { ...field(updated, id).source, label: "作品頁自訂內容", connected: true, trace: null },
        });
        changedFields.push(operation.field);
      }
      updated.writePreparation = {
        worksRevision: server.writePreparation.worksRevision + 1,
        editToken: "w3e1." + crypto.createHash("sha256").update(String(server.writePreparation.worksRevision + 1)).digest("hex"),
      };
      server = updated;
      return Response.json({ ok: true, outcome: "SAVED", requestId: request.body.requestId, ...server.writePreparation, changedFields, ownerModel: clone(server) });
    }
    const fetcher: typeof fetch = async (url, options) => {
      const request = { url: String(url), options: options ?? {}, body: options?.body ? JSON.parse(String(options.body)) : null };
      calls.push(request);
      if (options?.method === "GET") return readFailure ? new Response("", { status: 500 }) : Response.json({ ok: true, data: clone(server) });
      return post(request);
    };
    const session = new edit.WorkspaceEditSession(clone(initial), product.slug,
      (slug: string, signal?: AbortSignal) => ui.readOwnerWorkspace(slug, signal, fetcher),
      ui.isOwnerWorkspaceModel, fetcher, () => "w35a-attempt-" + (++serial));
    return {
      session, calls, success, fetcher, get server() { return server; }, set server(v: any) { server = v; },
      setPost(fn: typeof post) { post = fn; }, failRead() { readFailure = true; }, allowRead() { readFailure = false; },
      state: () => session.snapshot(), props: () => ({ session, state: session.snapshot() }),
      posts: () => calls.filter(r => r.options.method === "POST"), gets: () => calls.filter(r => r.options.method === "GET"),
    };
  }
  const fieldTree = (h: ReturnType<typeof harness>, id: string) => ui.WorkspaceField({ item: field(h.state().model, id), model: h.state().model, editing: h.props() });
  const saveTree = (h: ReturnType<typeof harness>) => ui.WorkspaceSaveBar(h.props());

  await check("exactly three client editable IDs, independent of read DTO capability", () => {
    assert.deepEqual(edit.EDIT_FIELDS, { "content.hero": "hero.supportingCopy", "content.story": "story.body", "content.flavor": "flavor.narrative" });
  });
  for (const item of base.fields) await check("field edit boundary " + item.id, () => {
    const h = harness(), markup = html(ui.WorkspaceField, { item, model: base, editing: h.props() });
    assert.equal(markup.includes('aria-expanded="false"'), edit.isEditField(item.id));
    if (!edit.isEditField(item.id)) {
      h.session.open(item.id); h.session.change(item.id, "injected");
      assert.equal(h.state().editor, null); assert.deepEqual(h.state().drafts, {});
      assert.ok(!markup.includes("<textarea"));
    }
  });
  await check("initial clean and no POST on Save", async () => {
    const h = harness(); assert.deepEqual(edit.dirtyIds(h.state()), []);
    assert.equal(button(saveTree(h), "儲存變更").props.disabled, true);
    await h.session.save(); assert.equal(h.posts().length, 0);
  });
  await check("edit button opens labeled textarea without dirtying", () => {
    const h = harness(); button(fieldTree(h, "content.story"), "編輯").props.onClick();
    const tree = fieldTree(h, "content.story"), all = nodes(tree);
    const input = all.find(n => n.type === "textarea");
    assert.ok(input); assert.equal(input.props.value, edit.baselineText(base, "content.story"));
    assert.ok(all.some(n => n.type === "label" && n.props.htmlFor === input.props.id));
    assert.equal(input.props.autoFocus, true);
    assert.deepEqual(edit.dirtyIds(h.state()), []);
  });
  await check("actual textarea callback makes dirty and exact revert cleans", () => {
    const h = harness(); h.session.open("content.hero");
    let input = nodes(fieldTree(h, "content.hero")).find(n => n.type === "textarea");
    input.props.onChange({ target: { value: "  新文字😀\n第二行 " } });
    assert.equal(h.state().drafts["content.hero"], "  新文字😀\n第二行 ");
    assert.equal(button(saveTree(h), "儲存變更").props.disabled, false);
    input = nodes(fieldTree(h, "content.hero")).find(n => n.type === "textarea");
    input.props.onChange({ target: { value: edit.baselineText(base, "content.hero") } });
    assert.deepEqual(h.state().drafts, {});
  });
  await check("one editor retains drafts across editor and section switches", () => {
    const h = harness(); h.session.open("content.hero"); h.session.change("content.hero", "Hero draft");
    h.session.open("content.story"); h.session.change("content.story", "Story draft");
    assert.equal(h.state().editor, "content.story");
    assert.ok(!html(ui.WorkspaceField, { item: field(base, "content.hero"), model: base, editing: h.props() }).includes("<textarea"));
    for (const section of ["pageContent", "productFacts", "pageContent"])
      html(ui.WorkspaceSection, { section, model: h.state().model, editing: h.props() });
    h.session.open("content.hero");
    assert.equal(h.state().drafts["content.hero"], "Hero draft"); assert.equal(h.state().drafts["content.story"], "Story draft");
    assert.equal(nodes(fieldTree(h, "content.hero")).find(n => n.type === "textarea").props.value, "Hero draft");
  });
  for (const id of Object.keys(edit.EDIT_FIELDS)) {
    await check("CLEAR is explicit empty via rendered action " + id, async () => {
      const h = harness(); h.session.change(id, "先設定文字"); await h.session.save(); h.session.open(id);
      button(fieldTree(h, id), "清空").props.onClick();
      assert.equal(h.state().drafts[id], "");
      await h.session.save();
      assert.deepEqual(h.posts()[1].body.operations, [{ scope: "updateEditorialContent", field: edit.EDIT_FIELDS[id], state: { mode: "value", value: "" } }]);
      assert.equal(field(h.state().model, id).value, ""); assert.equal(field(h.state().model, id).state, "explicit-blank");
      assert.deepEqual(h.state().drafts, {});
    });
  }
  for (const [value, valid] of [["", true], ["😀".repeat(2000), true], ["😀".repeat(2001), false], [" \n\t", false], ["多行\n😀", true], ["\ud800", false], ["\udc00", false], ["x\u0000", false]] as const)
    await check("validation " + JSON.stringify(value).slice(0, 30), async () => {
      const h = harness(); h.session.open("content.story"); h.session.change("content.story", value);
      assert.equal(edit.textProblem(value) === null, valid);
      assert.equal(button(saveTree(h), "儲存變更").props.disabled, !valid);
      if (!valid) { await h.session.save(); assert.equal(h.posts().length, 0); }
    });
  await check("code point counter and nearby accessible error", () => {
    const h = harness(); h.session.open("content.story"); h.session.change("content.story", "😀😀");
    assert.match(html(ui.WorkspaceField, { item: field(base, "content.story"), model: base, editing: h.props() }), /2 \/ 2000/);
    h.session.change("content.story", "  ");
    const all = nodes(fieldTree(h, "content.story")), input = all.find(n => n.type === "textarea");
    assert.equal(input.props["aria-invalid"], true);
    assert.ok(all.some(n => n.props.id === input.props["aria-describedby"].split(" ")[1] && n.props.role === "alert"));
  });
  await check("sparse request uses current context, exact envelope, URL authority and safe options", async () => {
    const current = clone(base); current.writePreparation = { worksRevision: 7, editToken: "w3e1." + "7".repeat(64) };
    const h = harness(current); h.session.change("content.story", "單欄");
    await h.session.save();
    const r = h.posts()[0];
    assert.equal(r.url, "/api/admin/works/giotto-awakening/owner-write");
    assert.deepEqual(Object.keys(r.body).sort(), ["contractVersion", "expectedWorksRevision", "expectedEditToken", "requestId", "operations"].sort());
    assert.equal(r.body.expectedWorksRevision, 7); assert.equal(r.body.expectedEditToken, current.writePreparation.editToken);
    assert.equal(r.body.operations.length, 1); assert.equal(r.body.operations[0].field, "story.body");
    assert.equal(r.options.credentials, "same-origin"); assert.equal(r.options.cache, "no-store"); assert.equal(r.options.redirect, "error");
    assert.deepEqual(r.options.headers, { "Content-Type": "application/json" });
    assert.ok(!("slug" in r.body) && !("targetRef" in r.body) && !("ownerModel" in r.body));
  });
  await check("success uses server values/source/revision/token; next attempt gets new correlation ID", async () => {
    const h = harness(); h.session.change("content.story", "第一次");
    await h.session.save();
    assert.deepEqual(h.state().model, h.server); assert.equal(h.state().message, "已儲存");
    assert.equal(field(h.state().model, "content.story").source.connected, true);
    assert.equal(h.state().model.writePreparation.worksRevision, 1);
    const token = h.state().model.writePreparation.editToken;
    assert.deepEqual(h.state().drafts, {});
    h.session.change("content.flavor", "第二次"); await h.session.save();
    assert.equal(h.posts()[1].body.expectedWorksRevision, 1);
    assert.equal(h.posts()[1].body.expectedEditToken, token);
    assert.notEqual(h.posts()[1].body.requestId, h.posts()[0].body.requestId);
    assert.equal(h.posts()[1].body.operations.length, 1);
  });
  await check("default browser request IDs are new correlation values", async () => {
    const h = harness();
    const s = new edit.WorkspaceEditSession(clone(base), product.slug, () => Promise.resolve({ ok: true, data: base }), ui.isOwnerWorkspaceModel, h.fetcher);
    s.change("content.story", "A"); await s.save(); s.change("content.story", "B"); await s.save();
    assert.match(h.posts()[0].body.requestId, /^[A-Za-z0-9._-]{8,100}$/);
    assert.notEqual(h.posts()[0].body.requestId, h.posts()[1].body.requestId);
    assert.ok(!JSON.stringify(h.posts()).includes("idempotency"));
  });
  await check("multi-field dirty request preserves exact accepted text and excludes untouched", async () => {
    const h = harness(); h.session.change("content.hero", "  😀\nHero "); h.session.change("content.story", "Body");
    await h.session.save();
    assert.deepEqual(h.posts()[0].body.operations.map((op: any) => [op.field, op.state.value]), [["hero.supportingCopy", "  😀\nHero "], ["story.body", "Body"]]);
    assert.equal(field(h.state().model, "content.flavor").value, field(base, "content.flavor").value);
  });
  await check("in-flight UI prevents duplicate send, edit and discard", async () => {
    const h = harness(); let release!: () => void;
    h.setPost(async request => { await new Promise<void>(resolve => { release = resolve; }); return h.success(request); });
    h.session.change("content.story", "keep");
    const pending = h.session.save();
    assert.equal(h.state().busy, true); assert.equal(button(saveTree(h), "處理中…").props.disabled, true);
    h.session.change("content.story", "lost"); h.session.discard(); await h.session.save();
    assert.equal(h.state().drafts["content.story"], "keep"); assert.equal(h.posts().length, 1);
    release(); await pending; assert.equal(h.state().busy, false);
  });
  await check("409 preserves draft, blocks save, performs no automatic retry/read", async () => {
    const h = harness(); h.setPost(async () => new Response("PRIVATE stack /srv", { status: 409 }));
    h.session.change("content.story", "my draft"); await h.session.save();
    assert.equal(h.state().blocked, "conflict"); assert.equal(h.state().drafts["content.story"], "my draft");
    assert.equal(h.state().message, "內容已在其他地方更新，請先取得最新版本再確認變更。");
    await h.session.save(); assert.equal(h.posts().length, 1); assert.equal(h.gets().length, 0);
    assert.equal(button(saveTree(h), "儲存變更").props.disabled, true);
  });
  await check("conflict reload retains local text, updates server baseline, requires explicit review", async () => {
    const h = harness(); h.setPost(async () => new Response("", { status: 409 }));
    h.session.change("content.story", "my draft"); await h.session.save();
    const newer = clone(h.server); field(newer, "content.story").value = "other editor";
    newer.writePreparation = { worksRevision: 4, editToken: "w3e1." + "4".repeat(64) }; h.server = newer;
    await h.session.reload();
    assert.equal(h.gets().length, 1); assert.equal(h.state().drafts["content.story"], "my draft");
    assert.equal(field(h.state().model, "content.story").value, "other editor");
    assert.equal(h.state().blocked, "review"); assert.equal(edit.canSave(h.state()), false);
    button(saveTree(h), "已核對最新內容，保留我的草稿").props.onClick();
    assert.equal(edit.canSave(h.state()), true);
    h.setPost(async r => h.success(r)); await h.session.save();
    assert.equal(h.posts()[1].body.expectedWorksRevision, 4);
    assert.equal(h.posts()[1].body.expectedEditToken, newer.writePreparation.editToken);
  });
  for (const kind of ["COMMITTED", "NETWORK", "MALFORMED_SUCCESS"] as const)
    await check("ambiguous response reconciles via GET only: " + kind, async () => {
      const h = harness();
      h.setPost(async r => {
        h.success(r);
        if (kind === "NETWORK") throw Error("PRIVATE path");
        if (kind === "MALFORMED_SUCCESS") return Response.json({ ok: true, ownerModel: {} });
        return Response.json({ ok: false, error: { commitState: "COMMITTED", message: "PRIVATE" } }, { status: 500 });
      });
      h.session.change("content.story", "confirmed saved"); await h.session.save();
      assert.equal(h.posts().length, 1); assert.equal(h.gets().length, 1); assert.deepEqual(h.state().drafts, {});
      assert.equal(h.state().blocked, ""); assert.equal(field(h.state().model, "content.story").value, "confirmed saved");
      assert.equal(h.state().message, kind === "COMMITTED" ? "儲存已提交，已重新確認最新內容" : "已重新確認儲存內容");
      assert.equal(h.gets()[0].options.cache, "no-store");
    });
  await check("COMMITTED but failed GET preserves drafts and forbids retry", async () => {
    const h = harness(); h.failRead();
    h.setPost(async r => { h.success(r); return Response.json({ ok: false, error: { commitState: "COMMITTED" } }, { status: 500 }); });
    h.session.change("content.story", "retain"); await h.session.save(); await h.session.save();
    assert.equal(h.posts().length, 1); assert.equal(h.gets().length, 1); assert.equal(h.state().blocked, "uncertain");
    assert.equal(h.state().drafts["content.story"], "retain"); assert.match(h.state().message, /請勿直接重複送出/);
  });
  await check("unconfirmed readback never clears draft merely for equal legacy text", async () => {
    const h = harness(); h.setPost(async () => { throw Error("network"); });
    const updated = clone(h.server); field(updated, "content.story").value = "same but legacy"; h.server = updated;
    h.session.change("content.story", "same but legacy"); await h.session.save();
    assert.equal(h.state().drafts["content.story"], "same but legacy");
    assert.equal(h.state().blocked, "review"); assert.equal(edit.canSave(h.state()), false); assert.equal(h.posts().length, 1);
  });
  await check("network without commit retains draft until explicit review, not automatic retry", async () => {
    const h = harness(); h.setPost(async () => { throw Error("SECRET"); });
    h.session.change("content.story", "unsaved"); await h.session.save(); await h.session.save();
    assert.equal(h.gets().length, 1); assert.equal(h.posts().length, 1);
    assert.equal(h.state().drafts["content.story"], "unsaved"); assert.equal(h.state().blocked, "review");
  });
  for (const status of [400, 401, 403, 404, 413, 415, 500])
    await check("safe normal failure " + status, async () => {
      const h = harness(); h.setPost(async () => Response.json({ ok: false, error: { commitState: "NOT_COMMITTED", message: "SECRET C:\\private stack" } }, { status }));
      h.session.change("content.story", "draft"); await h.session.save();
      assert.equal(h.posts().length, 1); assert.equal(h.gets().length, 0); assert.equal(h.state().drafts["content.story"], "draft");
      assert.doesNotMatch(h.state().message, /SECRET|private|stack/); assert.ok(h.state().message);
    });
  await check("retry after confirmed failure uses fresh requestId", async () => {
    const h = harness(); h.setPost(async () => new Response("", { status: 400 }));
    h.session.change("content.story", "retry"); await h.session.save(); await h.session.save();
    assert.equal(h.posts().length, 2); assert.notEqual(h.posts()[0].body.requestId, h.posts()[1].body.requestId);
  });
  await check("discard button clears drafts and active editor", () => {
    const h = harness(); h.session.open("content.story"); h.session.change("content.story", "discard");
    button(saveTree(h), "取消變更").props.onClick();
    assert.deepEqual(h.state().drafts, {}); assert.equal(h.state().editor, null); assert.equal(edit.canSave(h.state()), false);
  });
  await check("unload guard attaches only dirty, prevents unload, cleanup removes it", () => {
    const target = new EventTarget(); let add = 0, remove = 0;
    const originalAdd = target.addEventListener.bind(target), originalRemove = target.removeEventListener.bind(target);
    target.addEventListener = ((...args: any[]) => { add++; (originalAdd as any)(...args); }) as any;
    target.removeEventListener = ((...args: any[]) => { remove++; (originalRemove as any)(...args); }) as any;
    edit.installDraftUnloadGuard(target, false)(); assert.equal(add, 0);
    const cleanup = edit.installDraftUnloadGuard(target, true);
    const event = new Event("beforeunload", { cancelable: true }); target.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true); assert.equal(add, 1);
    cleanup(); assert.equal(remove, 1);
    const after = new Event("beforeunload", { cancelable: true }); target.dispatchEvent(after); assert.equal(after.defaultPrevented, false);
  });
  await check("disposing artwork aborts pending request and ignores old response", async () => {
    const h = harness(); let release!: () => void, signal: AbortSignal;
    h.setPost(async r => { signal = r.options.signal!; await new Promise<void>(resolve => { release = resolve; }); return h.success(r); });
    h.session.change("content.story", "old"); const pending = h.session.save();
    const before = h.state(); h.session.deactivate(); assert.equal(signal!.aborted, true);
    release(); await pending; assert.equal(h.state(), before);
  });
  for (const preparation of [undefined, { worksRevision: -1, editToken: "w3e1." + "1".repeat(64) }, { worksRevision: 0, editToken: "bad" }])
    await check("invalid read preparation cannot write " + JSON.stringify(preparation), async () => {
      const model = clone(base); model.writePreparation = preparation;
      const h = harness(model); h.session.change("content.story", "x"); await h.session.save(); assert.equal(h.posts().length, 0);
    });
  await check("invalid editable source cannot be edited", () => {
    const model = clone(base); field(model, "content.story").state = "invalid";
    const h = harness(model); h.session.open("content.story"); h.session.change("content.story", "x");
    assert.deepEqual(h.state().drafts, {}); assert.ok(!nodes(fieldTree(h, "content.story")).some(n => n.type === "button"));
  });
  await check("workspace retains ten-section IA and has no Publish/Product/Commerce inputs", () => {
    const h = harness();
    const markup = html(ui.OwnerWorkspaceView, { model: base, slug: product.slug });
    assert.equal((markup.match(/data-section-nav=/g) ?? []).length, 10);
    assert.match(markup, /作品內容儲存/); assert.match(markup, /儲存變更/);
    assert.doesNotMatch(markup, /Publish|發布|發佈|<input|contenteditable/i);
    const cards = base.fields.map((item: any) => html(ui.WorkspaceField, { item, model: base, editing: h.props() })).join("");
    for (const label of ["目前內容", "資料來源", "顯示位置", "影響範圍", "目前修改方式"]) assert.ok(cards.includes(label));
  });

  await check("actual section exposes all three editors and retains metadata", () => {
    const h = harness();
    const markup = html(ui.WorkspaceSection, { model: base, section: "pageContent", editing: h.props() });
    assert.equal((markup.match(/aria-expanded="false"/g) ?? []).length, 3);
    for (const id of Object.keys(edit.EDIT_FIELDS)) assert.ok(markup.includes('aria-label="編輯 ' + field(base, id).label + '"'));
    for (const text of ["目前內容", "資料來源", "顯示位置", "影響範圍", "目前修改方式"]) assert.ok(markup.includes(text));
  });
  await check("rendered Save action uses session and refreshes visible server truth", async () => {
    const h = harness(); h.session.change("content.story", "按鈕儲存");
    const done = new Promise<void>(resolve => {
      const unsubscribe = h.session.subscribe(() => {
        if (!h.state().busy && h.state().message === "已儲存") { unsubscribe(); resolve(); }
      });
    });
    button(saveTree(h), "儲存變更").props.onClick();
    await done;
    assert.equal(h.posts().length, 1);
    const markup = html(ui.WorkspaceField, { item: field(h.state().model, "content.story"), model: h.state().model, editing: h.props() });
    assert.match(markup, /按鈕儲存/); assert.match(markup, /作品頁自訂內容/);
    assert.equal(button(saveTree(h), "儲存變更").props.disabled, true);
  });
  await check("later manual read confirms committed save without a second POST", async () => {
    const h = harness(); h.failRead();
    h.setPost(async r => { h.success(r); return Response.json({ ok: false, error: { commitState: "COMMITTED" } }, { status: 500 }); });
    h.session.change("content.story", "已提交"); await h.session.save();
    assert.equal(h.state().blocked, "uncertain");
    h.allowRead(); await h.session.reload();
    assert.deepEqual(h.state().drafts, {}); assert.equal(h.state().blocked, "");
    assert.equal(h.state().message, "儲存已提交，已重新確認最新內容");
    await h.session.save(); assert.equal(h.posts().length, 1);
  });
  await check("confirmation of old submitted text retains a newer local draft", async () => {
    const h = harness(); h.failRead();
    h.setPost(async r => { h.success(r); throw Error("uncertain"); });
    h.session.change("content.story", "提交值"); await h.session.save();
    h.session.change("content.story", "較新草稿"); h.allowRead(); await h.session.reload();
    assert.equal(field(h.state().model, "content.story").value, "提交值");
    assert.equal(h.state().drafts["content.story"], "較新草稿");
    assert.equal(h.posts().length, 1); assert.equal(edit.canSave(h.state()), true);
  });
  await check("wrong-artwork success/readback cannot replace current artwork or clear drafts", async () => {
    const h = harness();
    h.setPost(async r => {
      const response = await h.success(r), body = await response.json();
      field(body.ownerModel, "system.slug").value = "another-artwork";
      h.server = body.ownerModel;
      return Response.json(body);
    });
    h.session.change("content.story", "my work"); await h.session.save();
    assert.equal(field(h.state().model, "system.slug").value, product.slug);
    assert.equal(h.state().drafts["content.story"], "my work"); assert.equal(h.state().blocked, "uncertain");
    assert.equal(h.posts().length, 1);
  });


  await check("leaving artwork during response JSON parse starts no recovery GET", async () => {
    const h = harness();
    let release!: () => void, parsing!: () => void;
    const started = new Promise<void>(resolve => { parsing = resolve; });
    h.setPost(async () => ({
      ok: true, status: 200,
      json: async () => { parsing(); await new Promise<void>(resolve => { release = resolve; }); return { invalid: true }; },
    }) as Response);
    h.session.change("content.story", "late response"); const pending = h.session.save();
    await started; h.session.deactivate(); const before = h.state();
    release(); await pending;
    assert.equal(h.state(), before); assert.equal(h.gets().length, 0);
    await h.session.save(); assert.equal(h.posts().length, 1);
  });


  for (const id of Object.keys(edit.EDIT_FIELDS)) await check("F1 browser receiver + active textarea Save without blur: " + id, async () => {
    const h = harness(), savedFetch = globalThis.fetch;
    let illegalReceiver = 0;
    // Web IDL globals accept an implicit/null receiver or the real global.
    // Arrow mocks alone miss the pre-fix session-as-receiver defect.
    const nativeLikeFetch = function(this: unknown, input: RequestInfo | URL, options?: RequestInit) {
      if (this !== undefined && this !== null && this !== globalThis) {
        illegalReceiver++; throw new TypeError("Illegal invocation");
      }
      return h.fetcher(input, options);
    };
    globalThis.fetch = nativeLikeFetch as typeof fetch;
    try {
      const session = new edit.WorkspaceEditSession(clone(base), product.slug, ui.readOwnerWorkspace, ui.isOwnerWorkspaceModel);
      session.open(id);
      const props = () => ({ item: field(session.snapshot().model, id), model: session.snapshot().model, editing: { session, state: session.snapshot() } });
      nodes(ui.WorkspaceField(props())).find(n => n.type === "textarea").props.onChange({ target: { value: "BBB 最後一字😀" } });
      // No blur event. Invoke the exact production Save button callback.
      const done = new Promise<void>(resolve => {
        const unsubscribe = session.subscribe(() => {
          if (!session.snapshot().busy && session.snapshot().message) { unsubscribe(); resolve(); }
        });
      });
      button(ui.WorkspaceSaveBar({ session, state: session.snapshot() }), "儲存變更").props.onClick();
      await done;
      assert.equal(illegalReceiver, 0, "Native fetch received the EditSession instead of its global receiver");
      assert.equal(h.posts().length, 1);
      assert.equal(h.posts()[0].url, "/api/admin/works/giotto-awakening/owner-write");
      assert.deepEqual(h.posts()[0].body.operations, [{ scope: "updateEditorialContent", field: edit.EDIT_FIELDS[id], state: { mode: "value", value: "BBB 最後一字😀" } }]);
      assert.equal(session.snapshot().message, "已儲存"); assert.deepEqual(session.snapshot().drafts, {});
    } finally { globalThis.fetch = savedFetch; }
  });
  await check("F2 real Admin index exposes canonical artwork links and preserves existing manager", async () => {
    const page = load(indexPage);
    const element = await page.default();
    const markup = renderToStaticMarkup(element);
    assert.ok(markup.includes("/admin/works/giotto-awakening"));
    for (const product of catalog) assert.ok(markup.includes('href="/admin/works/' + encodeURIComponent(product.slug) + '"'));
    assert.ok(markup.includes("data-existing-works-manager"));
    assert.doesNotMatch(markup, /<input|<textarea|contenteditable/i);
    assert.equal(catalogReads, 1);
  });


  await check("F2 catalog remains dynamic and includes valid non-public artworks", async () => {
    const saved = indexCatalog;
    try {
      indexCatalog = [{ slug: "first", name: "第一件", inMonthlyMenu: false }, { slug: "second", name: "第二件", status: "hidden" }];
      const markup = renderToStaticMarkup(await load(indexPage).default());
      assert.equal((markup.match(/href="\/admin\/works\//g) ?? []).length, 2);
      assert.ok(markup.includes("/admin/works/first") && markup.includes("/admin/works/second"));
      assert.ok(markup.includes("第一件") && markup.includes("第二件"));
      assert.doesNotMatch(markup, /giotto-awakening/);
    } finally { indexCatalog = saved; }
  });
  await check("F2 non-owner retains old manager without Owner links or catalog reads", async () => {
    indexRole = "admin"; const before = catalogReads;
    try {
      const markup = renderToStaticMarkup(await load(indexPage).default());
      assert.ok(markup.includes("data-existing-works-manager")); assert.ok(!markup.includes("/admin/works/giotto-awakening"));
      assert.equal(catalogReads, before);
    } finally { indexRole = "owner"; }
  });
  await check("F2 unauthenticated index redirects before catalog access", async () => {
    indexRole = null; const before = catalogReads;
    try { await assert.rejects(load(indexPage).default(), (e: any) => e.redirect === "/admin/login"); assert.equal(catalogReads, before); }
    finally { indexRole = "owner"; }
  });
  await check("F2 missing/invalid/duplicate slugs fail closed rather than generate broken links", () => {
    for (const products of [[{ name: "no slug" }], [{ slug: "../bad" }], [{ slug: "same" }, { slug: "same" }]]) {
      const markup = html(load(indexComponent).default, { products });
      assert.ok(!markup.includes('href="/admin/works/'));
      assert.match(markup, /目錄需要確認/);
    }
  });
  await check("F2 empty catalog and names are rendered safely", () => {
    const component = load(indexComponent).default;
    assert.match(html(component, { products: [] }), /目前沒有可管理的作品/);
    const markup = html(component, { products: [{ slug: "safe", name: "<script>unsafe</script>" }] });
    assert.ok(!markup.includes("<script>")); assert.match(markup, /&lt;script&gt;/);
  });


  await check("F1F2 full Save integration through real route/engine and TEMP disk, Owner/public reload", () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "KD_Coffee_W35A_F1F2_"));
    const relative = path.relative(os.tmpdir(), temporary);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    try {
      const fixture = path.join(temporary, "store/website-data.json");
      fs.mkdirSync(path.dirname(fixture), { recursive: true });
      fs.copyFileSync(path.join(root, "public/data/website-data.json"), fixture);
      const env: NodeJS.ProcessEnv = { ...process.env, KD_DATA_DIR: temporary, W35A_TEMP_ROOT: temporary,
        NODE_ENV: "test", ADMIN_SESSION_SECRET: crypto.randomBytes(48).toString("hex"),
        DEV_PUBLIC_ORIGIN: "https://slit-gorged-decibel.ngrok-free.dev" };
      for (const key of ["RAILWAY_VOLUME_MOUNT_PATH", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID", "RAILWAY_ENVIRONMENT_ID", "GIT_INDEX_FILE"]) delete env[key];
      const worker = spawnSync(process.execPath, ["--experimental-strip-types", fileURLToPath(import.meta.url), "--temp-save-integration"], {
        cwd: root, env, stdio: "inherit", timeout: 60000,
      });
      assert.equal(worker.error, undefined); assert.equal(worker.status, 0);
    } finally {
      assert.deepEqual(fingerprints(), before, "REAL DATA CHANGED");
      const resolved = fs.realpathSync(temporary), base = fs.realpathSync(os.tmpdir());
      const relative = path.relative(base, resolved);
      assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative) && path.basename(resolved).startsWith("KD_Coffee_W35A_F1F2_"));
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  });

  await check("read DTO and current model are never mutated by local sessions", () => assert.equal(JSON.stringify(base), baseJson));
  await check("no real network or data writes", () => { assert.equal(network, 0); assert.deepEqual(fingerprints(), before); });
} finally {
  globalThis.fetch = originalFetch;
  assert.deepEqual(fingerprints(), before, "REAL DATA CHANGED");
}
console.log("W3.5A: " + pass + " PASS / " + fail + " FAIL");
console.log("UI failure flows mocked + real TEMP route/engine integration; external network 0; protected JSON 17/17 unchanged.");
if (fail) process.exitCode = 1;
}
