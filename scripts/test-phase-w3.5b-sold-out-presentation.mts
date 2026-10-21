import assert from "node:assert/strict";
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import * as util from "node:util";
import * as asyncHooks from "node:async_hooks";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import postcss from "postcss";
// @ts-expect-error Node strip-types requires an explicit .mts extension.
import { runWorksCardMarkerSuite } from "./test-phase-w3.6a-works-card-marker-system.mts";
import sharp from "sharp";

const markerSuite = process.argv.includes("--card-marker-suite");
const project = fileURLToPath(new URL("../", import.meta.url));
const self = fileURLToPath(import.meta.url);
const hash = (p: string) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
function fingerprints() {
  const result: Array<[string, string]> = [];
  function walk(dir: string) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, e.name);
      if (e.isDirectory()) walk(file);
      else if (e.name.endsWith(".json")) result.push([path.relative(project, file), hash(file)]);
    }
  }
  walk(path.join(project, "data")); walk(path.join(project, "public/data"));
  return result.sort((a, b) => a[0].localeCompare(b[0]));
}
function within(root: string, file: string) {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  return !!relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}
const before = fingerprints();
assert.equal(before.length, 17);
assert.equal(hash(path.join(project, "public/data/website-data.json")), "77b44042e32ef589c6c08a2c5a2589b15bc89d97e97542b11b0dd9769c18ad93");
assert.equal(hash(path.join(project, "public/data/homepage.json")), "dbd97d72fd30bb548fff461084c3b497ec877e169d1f728c1fa408a92128cfac");

if (!process.argv.includes("--temp-worker")) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "KD_Coffee_W35B_"));
  assert.ok(within(os.tmpdir(), root) && !within(project, root));
  try {
    const store = path.join(root, "store"); fs.mkdirSync(store);
    for (const file of ["website-data.json", "pages.json", "assets.json"])
      fs.copyFileSync(path.join(project, "public/data", file), path.join(store, file));
    const env: NodeJS.ProcessEnv = { ...process.env, KD_DATA_DIR: root, W35B_TEST_ROOT: root, NODE_ENV: "test",
      ADMIN_SESSION_SECRET: crypto.randomBytes(48).toString("hex"), GIT_OPTIONAL_LOCKS: "0" };
    for (const key of ["RAILWAY_VOLUME_MOUNT_PATH", "RAILWAY_PROJECT_ID", "RAILWAY_SERVICE_ID", "RAILWAY_ENVIRONMENT_ID", "GIT_INDEX_FILE"])
      delete env[key];
    const child = spawnSync(process.execPath, ["--experimental-strip-types", self, "--temp-worker", ...(markerSuite ? ["--card-marker-suite"] : [])], { cwd: project, env, stdio: "inherit", timeout: 90000 });
    assert.equal(child.error, undefined); process.exitCode = child.status ?? 1;
  } finally {
    assert.deepEqual(fingerprints(), before, "REAL DATA CHANGED");
    const resolved = fs.realpathSync(root), base = fs.realpathSync(os.tmpdir());
    assert.ok(within(base, resolved) && !within(project, resolved) && path.basename(resolved).startsWith("KD_Coffee_W35B_"));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
  console.log("REAL DATA: protected JSON 17/17 unchanged; TEMP child only.");
} else {
  const root = process.env.W35B_TEST_ROOT!;
  assert.ok(root && within(os.tmpdir(), root) && !within(project, root));
  assert.equal(process.env.KD_DATA_DIR, root); assert.equal(process.env.RAILWAY_VOLUME_MOUNT_PATH, undefined);
  const modules = new Map<string, { exports: any }>();
  const managerId = "components/admin/WorksPageManager.tsx", settingsId = "components/admin/WorksSoldOutSettings.tsx";
  const publicId = "app/works/page.tsx", routeId = "app/api/admin/works-page/route.ts";
  const imageRouteId = "app/api/admin/pages/images/route.ts";
  let uploaderProps: any;
  const allowed = new Set([managerId, settingsId, publicId, routeId, imageRouteId, "data/websiteData.ts",
    "components/admin/WorksCardMarkerSettings.tsx", "components/admin/WorksCardMarkerStudio.tsx", "components/works/WorksCardMarkerVisual.tsx",
    "components/admin/works/WorksWorkspaceEditSession.ts", ...[
      "worksCardMarker", "worksCardMarkerPresentation", "pageBuilderImages", "worksPageCms", "worksSoldOutPresentation", "worksPageAdminStore", "pageBuilderStore", "pageBuilder", "pageBuilderVisualStyle",
      "homepageCms", "homepagePresentation", "cmsLinks", "media", "monthlyMenuPeriod", "productListing", "productVisualAssets",
      "cleanRoastingMedia", "assets", "storagePaths", "jsonFileStore", "commerceLockProtocol", "adminAuth",
    ].map(n => "lib/" + n + ".ts")]);
  let currentRequest: Request | null = null, runner: any = null, externalNetwork = 0, io = 0;
  function guard(file: unknown): asserts file is string { assert.equal(typeof file, "string"); assert.ok(within(root, file as string), "Application IO escaped TEMP"); }
  const safeFs = {
    async mkdir(file: string, ...args: any[]) { guard(file); io++; return (fsp.mkdir as any)(file, ...args); },
    async writeFile(file: string, ...args: any[]) { guard(file); io++; return (fsp.writeFile as any)(file, ...args); },
    async readFile(file: string, ...args: any[]) { guard(file); io++; return (fsp.readFile as any)(file, ...args); },
    async open(file: string, ...args: any[]) { guard(file); io++; return (fsp.open as any)(file, ...args); },
    async rename(a: string, b: string) { guard(a); guard(b); io++; return fsp.rename(a, b); },
    async unlink(file: string) { guard(file); io++; return fsp.unlink(file); },
  };
  const HookReact = {
    ...React,
    useState(initial: any) { return runner.state(initial); },
    useEffect(effect: any, deps: any[]) { runner.effect(effect, deps); },
    useMemo(compute: any) { runner.cursor++; return compute(); },
  };
  const fixture = JSON.parse(fs.readFileSync(path.join(root, "store/website-data.json"), "utf8"));
  function load(id: string): any {
    assert.ok(allowed.has(id), "Unexpected dependency: " + id);
    if (modules.has(id)) return modules.get(id)!.exports;
    const module = { exports: {} }; modules.set(id, module);
    const output = ts.transpileModule(fs.readFileSync(path.join(project, id), "utf8"), {
      fileName: id, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    new Function("require", "module", "exports", output)((spec: string) => {
      if (spec === "react") return id === managerId ? HookReact : React;
      if (spec === "react/jsx-runtime") return jsx;
      if (spec === "next/link") return ({ children, ...props }: any) => React.createElement("a", props, children);
      if (spec === "next/server") return { NextResponse: Response };
      if (spec === "next/headers") return { cookies: async () => ({ get: (key: string) => {
        const value = currentRequest?.headers.get("cookie")?.split("; ").find(s => s.startsWith(key + "="))?.slice(key.length + 1);
        return value ? { value } : undefined;
      } }) };
      if (spec === "server-only") return {};
      if (spec === "sharp") return sharp;
      // Only the generic widget is adapted; actual Settings/Manager callbacks,
      // existing authenticated image route, optimizer and asset persistence run.
      if (spec === "@/components/admin/MediaUploader") return (props: any) => { uploaderProps = props; return null; };
      if (spec === "crypto" || spec === "node:crypto") return crypto;
      if (spec === "path" || spec === "node:path") return path;
      if (spec === "node:util") return util;
      if (spec === "node:async_hooks") return asyncHooks;
      if (spec === "fs") return { promises: safeFs };
      if (spec === "node:fs/promises") return safeFs;
      if (spec === "@/public/data/website-data.json") return fixture;
      if (spec.endsWith(".module.css")) return new Proxy({}, { get: (_t, k) => k === "__esModule" ? false : String(k) });
      if (spec === "@/components/layout/Header" || spec === "@/components/layout/Footer" || spec === "@/components/works/WorksMotionRuntime" ||
          spec === "@/components/works/WorksHeroMedia") return () => null;
      if (spec === "@/components/commerce/ProductVisualMedia") return (props: any) => React.createElement("img", props);
      if (spec === "@/components/CmsLink") return ({ children, value }: any) => React.createElement("a", { href: typeof value === "string" ? value : "#" }, children);
      if (id === managerId && spec.startsWith("@/components/") && !spec.endsWith("/WorksSoldOutSettings") && !(markerSuite && spec.endsWith("/WorksCardMarkerStudio")))
        return spec.endsWith("/SmartLinkPicker") ? { __esModule: true, default: () => null, SmartLinkEditingProvider: ({ children }: any) => children } : () => null;
      assert.ok(spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("@/"), "External module forbidden");
      let target = spec.startsWith("@/") ? spec.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(id), spec));
      if (!/\.tsx?$/.test(target)) target += allowed.has(target + ".tsx") ? ".tsx" : ".ts";
      return load(target);
    }, module, module.exports);
    return module.exports;
  }
  const storage = load("lib/storagePaths.ts");
  const website = storage.getWebsiteDataFile(), pages = storage.getPagesDataFile();
  guard(website); guard(pages);
  assert.equal(path.resolve(website), path.resolve(root, "store/website-data.json"));
  assert.equal(path.resolve(pages), path.resolve(root, "store/pages.json"));
  console.log("TEMP PATH GUARD PASS: " + pages + "; website-data read-only fixture.");
  const cms = load("lib/worksPageCms.ts"), api = load(routeId), auth = load("lib/adminAuth.ts");
  const service = load("lib/worksPageAdminStore.ts"), publicPage = load(publicId), settings = load(settingsId).default;
  const ownerCookie = auth.adminCookieName + "=" + auth.createAdminSessionValue({ role: "owner" });
  const realFetch = globalThis.fetch, priorWindow = (globalThis as any).window;
  const calls: Array<{ method: string; body: any; status: number }> = [];
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    assert.ok(["/api/admin/works-page", "/api/admin/pages/images"].includes(url), "External/network request forbidden");
    const method = options?.method ?? "GET", headers = new Headers(options?.headers);
    headers.set("cookie", ownerCookie);
    currentRequest = new Request("http://localhost:3000" + url, { ...options, headers });
    const response = url === "/api/admin/pages/images" ? await load(imageRouteId).POST(currentRequest)
      : method === "GET" ? await api.GET() : await api.PUT(currentRequest);
    calls.push({ method, body: typeof options?.body === "string" ? JSON.parse(options.body) : null, status: response.status });
    return response;
  };
  (globalThis as any).window = new EventTarget();
  let pass = 0, fail = 0;
  async function check(name: string, run: () => unknown | Promise<unknown>) {
    try { await run(); pass++; } catch (e) { fail++; console.error("FAIL " + name); console.error(e); }
  }
  const clone = (v: any) => structuredClone(v);
  const disk = () => JSON.parse(fs.readFileSync(pages, "utf8"));
  const defaults = { mode: "text", text: "暫時完售", textFontSize: 20, textColor: "#f5eee3", textPosition: "center", dimMode: "band", dimStrength: 35, bandPosition: "center", bandSize: 30 };
  function writeConfig(value: any, missing = false) {
    const store = disk();
    store.systemPages = { ...(store.systemPages || {}), works: { schemaVersion: 1, ...(missing ? {} : { soldOutPresentation: value }) } };
    fs.writeFileSync(pages, JSON.stringify(store, null, 2) + "\n");
  }
  function nodes(element: any): any[] {
    if (Array.isArray(element)) return element.flatMap(nodes);
    if (!React.isValidElement(element)) return [];
    const e = element as any;
    if (typeof e.type === "function") return nodes(e.type(e.props));
    return [e, ...nodes(e.props.children)];
  }
  function button(tree: any, text: string) {
    const b = nodes(tree).find(n => n.type === "button" && n.props.children === text);
    assert.ok(b, "Button missing: " + text); return b;
  }
  async function cards() { return nodes(await publicPage.default()).filter(n => n.type === "article" && String(n.props.className).includes("catalog-card")); }
  const badge = (card: any) => nodes(card).find(n => n.type === "span" && n.props.className === "sold-out-overlay");
  const markup = (element: any) => renderToStaticMarkup(element);
  // A deterministic hook driver runs the real Manager's state, effects and event
  // callbacks. No source-string substitution and no replacement Save function.
  function mountManager() {
    const state: any[] = [], effects: any[] = [], pending: Array<() => void> = [];
    const instance: any = {
      cursor: 0,
      state(initial: any) {
        const i = this.cursor++;
        if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial;
        return [state[i], (value: any) => { state[i] = typeof value === "function" ? value(state[i]) : value; }];
      },
      effect(effect: any, deps: any[]) {
        const i = this.cursor++, old = effects[i];
        if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) {
          pending.push(() => { old?.cleanup?.(); effects[i] = { deps, cleanup: effect() }; });
        }
      },
      render() {
        this.cursor = 0; runner = this;
        const tree = load(managerId).default(); runner = null;
        pending.splice(0).forEach(effect => effect()); return tree;
      },
      dispose() { effects.forEach(e => e?.cleanup?.()); },
    };
    return instance;
  }
  async function loaded(instance: any) {
    const deadline = Date.now() + 5000;
    let tree = instance.render();
    while (!nodes(tree).some(n => n.type === "button" && n.props.children === "儲存全部")) {
      assert.ok(Date.now() < deadline, "Admin load timed out");
      await new Promise(resolve => setTimeout(resolve, 5)); tree = instance.render();
    }
    return tree;
  }
  const inputIds = ["works-sold-out-text", "works-sold-out-style", "works-sold-out-level", "works-sold-out-area"];
  let websiteHash = "";
  try {
    const source = JSON.parse(fs.readFileSync(website, "utf8"));
    source.menu.products[0] = { ...source.menu.products[0], status: "sold_out", purchasable: false, inMonthlyMenu: true, showWhenSoldOut: true };
    source.menu.products[1] = { ...source.menu.products[1], status: "active", purchasable: true, inMonthlyMenu: true };
    source.menu.products[2] = { ...source.menu.products[2], status: "sold_out", inMonthlyMenu: true, showWhenSoldOut: true };
    fs.writeFileSync(website, JSON.stringify(source, null, 2) + "\n"); websiteHash = hash(website);
    const soldSlug = source.menu.products[0].slug, availableSlug = source.menu.products[1].slug;

    if (markerSuite) {
      await runWorksCardMarkerSuite({ check, cms, service, load, pages, website, disk, hash, cards, nodes, markup, button,
        mountManager, loaded, source, soldSlug, availableSlug, project, root, guard, storage, sharp, getUploader: () => uploaderProps });
    } else {
    for (const value of [undefined, null, "", [], 1, {}, { text: "" }, { text: " \t" }, { text: "x\ny" }, { text: "😀".repeat(41) }, { text: "\ud800" }])
      await check("public missing/malformed text fallback " + JSON.stringify(value), () => assert.equal(cms.resolveWorksSoldOutPresentation(value).text, defaults.text));
    for (const value of ["等下一批", "回來再喝 ☕😀", "😀".repeat(40), "  等待補貨  "])
      await check("Unicode custom text preserved " + value.length, () => { assert.equal(cms.isWorksSoldOutText(value), true); assert.equal(cms.resolveWorksSoldOutPresentation({ text: value }).text, value); cms.validateWorksSoldOutPresentation({ text: value }); });
    for (const value of ["", " ", "\n", "第一行\n第二行", "x\ry", "\u2028", "😀".repeat(41), "\ud800", "\udc00", "\u0000", "\u200b", 0, false, null, [], {}])
      await check("strict invalid text rejected " + JSON.stringify(value), () => assert.throws(() => cms.validateWorksSoldOutPresentation({ text: value })));
    await check("exact new defaults", () => assert.deepEqual(cms.resolveWorksSoldOutPresentation(undefined), defaults));
    const enums = [["mode", ["text", "image"]], ["textPosition", ["top", "center", "bottom"]],
      ["dimMode", ["none", "band", "full"]], ["bandPosition", ["top", "center", "bottom"]]] as const;
    for (const [key, options] of enums) {
      for (const value of options) await check("enum " + key + "=" + value, () => {
        cms.validateWorksSoldOutPresentation({ [key]: value });
        assert.equal(cms.resolveWorksSoldOutPresentation({ [key]: value })[key], value);
      });
      for (const value of [null, 1, false, [], {}, "evil"]) await check("invalid enum " + key + JSON.stringify(value), () => {
        assert.throws(() => cms.validateWorksSoldOutPresentation({ [key]: value }));
        assert.equal(cms.resolveWorksSoldOutPresentation({ [key]: value })[key], (defaults as any)[key]);
      });
    }
    for (const [key, min, max] of [["textFontSize", 12, 48], ["dimStrength", 0, 100], ["bandSize", 10, 60]] as const) {
      for (const value of [min, max, Math.floor((min + max) / 2)]) await check("bounded number accepts " + key + value, () => {
        cms.validateWorksSoldOutPresentation({ [key]: value }); assert.equal(cms.resolveWorksSoldOutPresentation({ [key]: value })[key], value);
      });
      for (const value of [min - 1, max + 1, "20", null, 20.5, Infinity, NaN, false]) await check("bounded number rejects " + key + value, () => {
        assert.throws(() => cms.validateWorksSoldOutPresentation({ [key]: value }));
        assert.equal(cms.resolveWorksSoldOutPresentation({ [key]: value })[key], (defaults as any)[key]);
      });
    }
    for (const value of ["#Aa11ff", "#000000", "#ffffff"]) await check("safe text color " + value, () => {
      cms.validateWorksSoldOutPresentation({ textColor: value }); assert.equal(cms.resolveWorksSoldOutPresentation({ textColor: value }).textColor, value);
    });
    for (const value of ["red", "#fff", "url(javascript:evil)", "#123456;position:fixed", null, {}])
      await check("unsafe text color rejected " + JSON.stringify(value), () => assert.throws(() => cms.validateWorksSoldOutPresentation({ textColor: value })));
    for (const value of [{ css: "position:fixed" }, { className: "evil" }, { opacity: 1 }, { x: 20 }, { soldOut: true }, { extra: true }])
      await check("unknown CSS/availability key rejected " + JSON.stringify(value), () => assert.throws(() => cms.validateWorksSoldOutPresentation(value)));
    const imageRef = { media: { type: "image", provider: "local", url: "/uploads/assets/page-builder/sold-out-v01.webp" }, alt: "透明缺貨圖" };
    await check("reuse existing media reference shape", () => {
      cms.validateWorksSoldOutPresentation({ mode: "image", imageAsset: imageRef });
      assert.deepEqual(cms.resolveWorksSoldOutPresentation({ imageAsset: imageRef }).imageAsset, imageRef);
    });
    const invalidImages = [null, {}, { media: imageRef.media }, { ...imageRef, extra: true },
      ...["javascript:evil", "data:image/png;base64,x", "https://example.com/a.webp", "/uploads/assets/page-builder/../a.webp",
        "/uploads/assets/page-builder/%2e%2e.webp", "/uploads/assets/page-builder/a.svg", "//host/a.webp",
        "/uploads/assets/page-builder/a.webp?x=1", "C:\\secret.png"].map(url => ({ ...imageRef, media: { ...imageRef.media, url } })),
      { ...imageRef, media: { ...imageRef.media, type: "video" } }, { ...imageRef, alt: "" }];
    for (const value of invalidImages) await check("invalid image rejection / safe fallback " + JSON.stringify(value), () => {
      assert.throws(() => cms.validateWorksSoldOutPresentation({ imageAsset: value }));
      // Unknown wrapper keys are rejected on SAVE; safe known image data can still be read.
      if (!(value && typeof value === "object" && "extra" in value))
        assert.equal(cms.resolveWorksSoldOutPresentation({ imageAsset: value }).imageAsset, undefined);
    });
    for (const style of ["center-badge", "bottom-strip", "top-left-badge"])
      for (const dimArea of ["label-area", "top", "center", "bottom", "full", "none"])
        await check("legacy read-only normalization " + style + dimArea, async () => {
          writeConfig({ text: "舊文字", style, dimArea, dimLevel: "light", dimSize: "large" });
          const before = hash(pages), state = await service.readWorksPageAdminState(), value = state.resolved.soldOutPresentation;
          assert.equal(value.mode, "text"); assert.equal(value.text, "舊文字");
          assert.equal(value.textPosition, style === "top-left-badge" ? "top" : style === "bottom-strip" ? "bottom" : "center");
          assert.equal(value.dimMode, dimArea === "none" ? "none" : dimArea === "full" ? "full" : "band");
          assert.equal(value.bandSize, 50); assert.equal(hash(pages), before);
          cms.validateWorksSoldOutPresentation({ style, dimArea, dimLevel: "light", dimSize: "large" });
        });
    writeConfig(undefined, true);
    await check("legacy GET read-only defaults", async () => {
      const before = hash(pages); assert.deepEqual((await service.readWorksPageAdminState()).resolved.soldOutPresentation, defaults);
      assert.equal(hash(pages), before);
    });
    const stockBaseline = (await cards()).find(c => c.key === availableSlug); assert.ok(stockBaseline);
    const classHas = (e: any, c: string) => String(e?.props.className || "").split(" ").includes(c);
    const anchor = (e: any) => nodes(e).find(n => classHas(n, "works-sold-out-anchor"));
    const label = (e: any) => nodes(e).find(n => classHas(n, "works-sold-out-text"));
    const image = (e: any) => nodes(e).find(n => classHas(n, "works-sold-out-image"));
    const dims = (e: any) => nodes(e).filter(n => classHas(n, "works-sold-out-dim"));
    for (const value of [null, [], "broken", { mode: "evil", text: "", textColor: "url(evil)", bandSize: 900, imageAsset: null }])
      await check("malformed stored namespace public safe " + JSON.stringify(value), async () => {
        writeConfig(value); const b = badge((await cards()).find(c => c.key === soldSlug));
        assert.equal(b.props["data-display-mode"], "text"); assert.equal(label(b).props.children, defaults.text);
        assert.equal(image(b), undefined);
      });
    for (const textPosition of ["top", "center", "bottom"])
      for (const dimMode of ["none", "band", "full"])
        for (const bandPosition of ["top", "center", "bottom"]) await check("actual public text geometry " + [textPosition, dimMode, bandPosition], async () => {
          writeConfig({ ...defaults, text: "下一批見 ☕", textPosition, textFontSize: 32, textColor: "#abC123", dimMode, bandPosition, bandSize: 45, dimStrength: 63 });
          const list = await cards(), selected = list.find(c => c.key === soldSlug), b = badge(selected);
          assert.ok(b); assert.equal(b.props["data-display-mode"], "text"); assert.equal(b.props["data-dim-mode"], dimMode);
          assert.equal(label(b).props.children, "下一批見 ☕"); assert.equal(image(b), undefined);
          const textStyle = label(b).props.style;
          assert.equal(textStyle.fontSize, 32); assert.equal(textStyle.color, "#abC123");
          assert.equal(textStyle.background, "transparent"); assert.equal(textStyle.border, "none"); assert.equal(textStyle.padding, 0);
          assert.equal(textStyle.borderRadius, 0); assert.equal(textStyle.boxShadow, "none"); assert.equal(textStyle.textShadow, "none");
          assert.equal(label(b).type, "span"); assert.equal(label(b).props.onClick, undefined);
          assert.equal(b.props.style.display, "block"); assert.equal(b.props.style.background, "transparent");
          assert.equal(b.props.style.pointerEvents, "none"); assert.ok(classHas(anchor(b), "works-sold-out-anchor--" + textPosition));
          if (textPosition === "top") assert.equal(anchor(b).props.style.top, 42);
          if (textPosition === "center") assert.equal(anchor(b).props.style.transform, "translate(-50%, -50%)");
          if (textPosition === "bottom") assert.equal(anchor(b).props.style.bottom, b.props["data-has-tag"] === "true" ? 56 : 16);
          assert.equal(dims(b).length, dimMode === "none" ? 0 : 1);
          if (dimMode !== "none") {
            const d = dims(b)[0]; assert.ok(classHas(d, "works-sold-out-dim--" + dimMode));
            assert.equal(d.props.style.background, "rgb(25,20,17)"); assert.equal(d.props.style.opacity, .63);
            assert.equal(dims(anchor(b)).length, 0, "Band is a sibling across the image, never a label-local ellipse");
            if (dimMode === "full") assert.equal(d.props.style.inset, 0);
            else {
              assert.equal(d.props.style.left, 0); assert.equal(d.props.style.right, 0); assert.equal(d.props.style.height, "45%");
              if (bandPosition === "center") assert.equal(d.props.style.transform, "translateY(-50%)");
              else assert.equal(d.props.style[bandPosition], 0);
            }
          }
          assert.doesNotMatch(markup(b), /radial-gradient|ellipse|follow-label|custom-position|center-badge|bottom-strip|top-left-badge/);
          assert.equal(markup(list.find(c => c.key === availableSlug)), markup(stockBaseline), "In-stock card changed");
          assert.deepEqual(nodes(selected).filter(n => n.type === "a").map(n => n.props.href), ["/works/" + soldSlug, "/works/" + soldSlug]);
        });
    for (const mode of ["text", "image"]) for (const hasImage of [false, true]) await check("exclusive public mode " + mode + hasImage, async () => {
      writeConfig({ ...defaults, mode, ...(hasImage ? { imageAsset: imageRef } : {}) });
      const b = badge((await cards()).find(c => c.key === soldSlug));
      const expectImage = mode === "image" && hasImage;
      assert.equal(b.props["data-display-mode"], expectImage ? "image" : "text");
      assert.equal(!!image(b), expectImage); assert.equal(!!label(b), !expectImage);
      if (expectImage) { assert.equal(image(b).props.src, imageRef.media.url); assert.equal(image(b).props.alt, ""); assert.equal(image(b).props["aria-hidden"], "true");
        assert.ok(nodes(b).some(n => n.props.style?.clip === "rect(0,0,0,0)" && n.props.children === defaults.text), "Image marker retains an accessible text equivalent"); }
    });
    for (const dimMode of ["none", "band", "full"]) await check("zero strength never dims " + dimMode, async () => {
      writeConfig({ ...defaults, dimMode, dimStrength: 0 }); assert.equal(dims(badge((await cards()).find(c => c.key === soldSlug))).length, 0);
    });
    await check("existing showCommerceSummary still gates overlay", async () => {
      writeConfig(defaults); const store = disk(); store.systemPages.works.catalog = { presentation: { showCommerceSummary: false } }; fs.writeFileSync(pages, JSON.stringify(store));
      assert.ok((await cards()).every(c => !badge(c)));
    });
    await check("plain and band CSS has no old visual contract", () => {
      const ast = postcss.parse(fs.readFileSync(path.join(project, "app/globals.css"), "utf8"));
      const all: Record<string, Record<string, string>> = {};
      // Locate runtime selectors directly: prose/comment punctuation is not a contract.
      ast.walkRules((rule: any) => {
        if (!rule.selector.includes("works-sold-out")) return;
        assert.doesNotMatch(rule.selector, /radial|ellipse|spotlight|follow-label|custom-position|center-badge|bottom-strip|top-left-badge/);
        const decl = all[rule.selector] ?? {};
        rule.walkDecls((d: any) => {
          assert.ok(!d.important, "Presentation must not defeat shared inline geometry");
          assert.doesNotMatch(d.value, /radial|ellipse|spotlight/i);
          decl[d.prop] = d.value;
        });
        all[rule.selector] = decl;
      });
      for (const selector of [".works-sold-out-text", ".works-sold-out-image", ".works-sold-out-anchor",
        ".works-sold-out-dim", ".works-sold-out-dim--band", ".works-sold-out-dim--full"])
        assert.ok(all[selector], "Missing actual CSS selector: " + selector);
      const plain = all[".works-sold-out-text"];
      assert.equal(plain.background, "transparent"); assert.equal(plain.border, "0"); assert.equal(plain.padding, "0");
      assert.equal(plain["border-radius"], "0"); assert.equal(plain["box-shadow"], "none"); assert.equal(plain["text-shadow"], "none");
      assert.equal(plain["pointer-events"], "none");
      assert.equal(all[".works-sold-out-dim"].background, "rgb(25,20,17)");
      assert.equal(all[".works-sold-out-dim"]["pointer-events"], "none");
      assert.equal(all[".works-sold-out-dim--band"].left, "0"); assert.equal(all[".works-sold-out-dim--band"].right, "0");
      assert.equal(all[".works-sold-out-dim--full"].inset, "0");
    });
    const control = (tree: any, id: string) => nodes(tree).find(n => n.props.id === id);
    for (const mode of ["text", "image"]) for (const dimMode of ["none", "band", "full"]) await check("conditional Admin controls " + mode + dimMode, () => {
      const tree = settings({ value: { ...defaults, mode, dimMode }, onChange: () => {}, uploadImage: async () => imageRef.media });
      assert.equal(!!control(tree, "works-sold-out-text"), mode === "text");
      assert.equal(!!control(tree, "works-sold-out-font-size"), mode === "text");
      assert.equal(!!control(tree, "works-sold-out-color"), mode === "text");
      assert.equal(!!control(tree, "works-sold-out-position"), true);
      assert.equal(!!control(tree, "works-sold-out-band-position"), dimMode === "band");
      assert.equal(!!control(tree, "works-sold-out-band-size"), dimMode === "band");
      assert.equal(!!control(tree, "works-sold-out-strength"), dimMode !== "none");
    });
    for (const textPosition of ["top", "center", "bottom"]) await check("real Manager callbacks save/reload/SSR " + textPosition, async () => {
      writeConfig(defaults); const m = mountManager(); let tree = await loaded(m); button(tree, "作品缺貨顯示").props.onClick(); tree = m.render();
      const before = hash(pages);
      function change(id: string, value: string) { const c = control(tree, id); assert.ok(c, id); c.props.onChange({ target: { value } }); tree = m.render(); }
      change("works-sold-out-text", "完售 ☕"); change("works-sold-out-position", textPosition);
      change("works-sold-out-font-size", "36"); change("works-sold-out-color", "#ab1245");
      change("works-sold-out-dim-mode", "band"); change("works-sold-out-band-position", "bottom");
      change("works-sold-out-band-size", "55"); change("works-sold-out-strength", "71");
      assert.equal(control(tree, "works-sold-out-strength").props.type, "range");
      const previewBox = nodes(tree).find(n => n.props["data-sold-out-preview"] !== undefined);
      assert.equal(label(previewBox).props.style.fontSize, 36); assert.equal(dims(previewBox)[0].props.style.opacity, .71);
      assert.equal(hash(pages), before, "Preview must not save");
      const version = disk().version; await button(tree, "儲存全部").props.onClick(); tree = m.render();
      assert.equal(calls.at(-1)!.status, 200); assert.equal(disk().version, version + 1);
      const expected = { ...defaults, text: "完售 ☕", textPosition, textFontSize: 36, textColor: "#ab1245", bandPosition: "bottom", bandSize: 55, dimStrength: 71 };
      assert.deepEqual(disk().systemPages.works.soldOutPresentation, expected);
      assert.deepEqual((await service.readWorksPageAdminState()).resolved.soldOutPresentation, expected);
      const b = badge((await cards()).find(c => c.key === soldSlug));
      assert.deepEqual(label(b).props.style, label(previewBox).props.style);
      assert.deepEqual(dims(b)[0].props.style, dims(previewBox)[0].props.style);
      m.dispose(); const reload = mountManager(); let t = await loaded(reload); button(t, "作品缺貨顯示").props.onClick(); t = reload.render();
      assert.equal(control(t, "works-sold-out-position").props.value, textPosition); reload.dispose();
    });
    await check("actual existing upload route optimizes alpha / registers SEO / replaces / removes", async () => {
      writeConfig(defaults); const m = mountManager(); let tree = await loaded(m); button(tree, "作品缺貨顯示").props.onClick(); tree = m.render();
      control(tree, "works-sold-out-source").props.onChange({ target: { value: "image" } }); tree = m.render(); nodes(tree);
      assert.equal(uploaderProps.imageOnly, true); assert.equal(control(tree, "works-sold-out-text"), undefined);
      const uploadDir = storage.getAssetsUploadDir("page-builder"); guard(uploadDir);
      const alphaPng = await sharp({ create: { width: 2200, height: 400, channels: 4, background: { r: 80, g: 40, b: 20, alpha: 0 } } }).png().toBuffer();
      let lastUrl = "";
      for (const [name, bytes, type] of [["sold-out-transparent.png", alphaPng, "image/png"], ["sold-out-replacement.webp", await sharp(alphaPng).webp().toBuffer(), "image/webp"]] as const) {
        nodes(tree); const props = uploaderProps; const beforePage = hash(pages);
        const media = await props.onImageUpload(new File([new Uint8Array(bytes)], name, { type }));
        assert.equal(media.provider, "local"); assert.equal(media.type, "image"); assert.match(media.url, /^\/uploads\/assets\/page-builder\/kd-coffee-page-.+\.webp$/);
        assert.notEqual(media.url, lastUrl); lastUrl = media.url;
        const outputPath = path.join(uploadDir, path.basename(media.url)); guard(outputPath);
        const meta = await sharp(outputPath).metadata(); assert.equal(meta.format, "webp"); assert.equal(meta.hasAlpha, true); assert.ok(meta.width! <= 1800);
        const raw = await sharp(outputPath).raw().toBuffer({ resolveWithObject: true }); assert.equal(raw.info.channels, 4); assert.equal(raw.data[3], 0, "Transparent pixel preserved");
        const library = JSON.parse(fs.readFileSync(storage.getAssetsDataFile(), "utf8")), asset = library.assets.find((a: any) => a.path === media.url);
        assert.ok(asset); assert.equal(asset.format, "WebP"); assert.ok(asset.seoStem); assert.ok(asset.alt); assert.equal(asset.originalFileName, name); assert.equal(asset.status, "active");
        props.onChange(media); tree = m.render(); assert.equal(hash(pages), beforePage, "Upload/preview must not save page config");
        const previewBox = nodes(tree).find(n => n.props["data-sold-out-preview"] !== undefined);
        assert.equal(image(previewBox).props.src, media.url); assert.equal(label(previewBox), undefined);
        await button(tree, "儲存全部").props.onClick(); tree = m.render(); assert.equal(calls.at(-1)!.status, 200);
        const saved = disk().systemPages.works.soldOutPresentation; assert.equal(saved.mode, "image"); assert.equal(saved.imageAsset.media.url, media.url);
        assert.deepEqual((await service.readWorksPageAdminState()).resolved.soldOutPresentation.imageAsset, saved.imageAsset);
        const b = badge((await cards()).find(c => c.key === soldSlug)); assert.equal(image(b).props.src, media.url); assert.equal(label(b), undefined);
      }
      nodes(tree); const invalidBefore = hash(storage.getAssetsDataFile());
      await assert.rejects(() => uploaderProps.onImageUpload(new File(["x"], "bad.svg", { type: "image/svg+xml" })));
      assert.equal(hash(storage.getAssetsDataFile()), invalidBefore);
      uploaderProps.onRemove(); tree = m.render();
      const previewBox = nodes(tree).find(n => n.props["data-sold-out-preview"] !== undefined); assert.equal(image(previewBox), undefined); assert.ok(label(previewBox));
      await button(tree, "儲存全部").props.onClick(); tree = m.render();
      assert.equal(disk().systemPages.works.soldOutPresentation.mode, "image");
      assert.equal(Object.hasOwn(disk().systemPages.works.soldOutPresentation, "imageAsset"), false);
      assert.ok(label(badge((await cards()).find(c => c.key === soldSlug))));
      assert.ok(fs.existsSync(path.join(uploadDir, path.basename(lastUrl))), "Removing reference must not delete shared asset");
      m.dispose();
    });
    const invalidConfigs = [{ text: "" }, { text: "    " }, { text: "😀".repeat(41) }, { mode: "both" },
      { textFontSize: 49 }, { textColor: "red" }, { textPosition: "url(evil)" }, { dimMode: "radial" },
      { dimStrength: 101 }, { bandSize: 61 }, { bandPosition: "left" }, { imageAsset: null }, { css: "background:red" }];
    for (const value of invalidConfigs) await check("real PUT rejects atomically " + JSON.stringify(value), async () => {
      const before = hash(pages), response = await fetch("/api/admin/works-page", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: disk().version, works: { schemaVersion: 1, soldOutPresentation: value } }) });
      assert.equal(response.status, 400); assert.equal(hash(pages), before);
    });
    await check("version conflict preserves file", async () => {
      const before = hash(pages), response = await fetch("/api/admin/works-page", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: disk().version - 1, works: { schemaVersion: 1, soldOutPresentation: defaults } }) });
      assert.equal(response.status, 409); assert.equal(hash(pages), before);
    });
    await check("presentation global only / Product and Commerce untouched", () => {
      assert.equal(hash(website), websiteHash); assert.ok(!Object.hasOwn(disk(), "soldOutPresentation"));
      assert.deepEqual(load("components/admin/works/WorksWorkspaceEditSession.ts").EDIT_FIELDS,
        { "content.hero": "hero.supportingCopy", "content.story": "story.body", "content.flavor": "flavor.narrative" });
    });
    await check("real data and network unchanged", () => {
      assert.deepEqual(fingerprints(), before); assert.equal(externalNetwork, 0); assert.ok(io > 0);
    });
    }
  } finally {
    globalThis.fetch = realFetch; (globalThis as any).window = priorWindow;
    assert.deepEqual(fingerprints(), before, "REAL DATA CHANGED");
  }
  console.log((markerSuite ? "W3.6A: " : "W3.5B: ") + pass + " PASS / " + fail + " FAIL");
  console.log("TEMP global PUT + existing image upload/alpha/asset pipeline + Admin callbacks + public SSR; external network 0.");
  if (fail) process.exitCode = 1;
}
