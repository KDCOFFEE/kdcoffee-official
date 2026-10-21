import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createJiti } from "jiti";
import ts from "typescript";
import { HOMEPAGE_SECTION_KEYS, resolveHomepageSectionOrder, homepageSectionOrderMap, validateHomepageCms } from "../lib/homepageCms";
import { activeHomepageCampaigns } from "../lib/homepageCampaigns";
import { atomicWriteJson, withFileLock } from "../lib/jsonFileStore";
import type { HomepageData } from "../data/homepageData";
import type { HomepageViewData } from "../components/home/HomepageV3";

const project = process.cwd();
const stored = await fs.readFile("public/data/homepage.json", "utf8");
const source = await fs.readFile("components/admin/HomepageManager.tsx", "utf8");
const jiti = createJiti(import.meta.url, { alias: { "@": project }, jsx: { runtime: "automatic" }, fsCache: false });
const Home = (await jiti.import<{ default: ComponentType<{ homepageData: HomepageViewData; products: never[]; pages: never[] }> }>(
  path.join(project, "components/home/HomepageV3.tsx"))).default;
const legacyIds = ["home002", "home003", "home004", "home005", "home006", "home007", "home008", "home009", "home010"] as const;
const legacyOrder = legacyIds.map((key, order) => ({ key, order }));
function fixture(): HomepageData {
  const h: HomepageData = JSON.parse(stored);
  h.campaignSection.enabled = true; h.campaignSection.displayLimit = 1;
  h.campaigns = [{ ...h.campaigns[0], enabled: true, startDate: "", endDate: "", placements: ["frontend_campaign_section", "product_pages"] }];
  h.home002!.enabled = true; h.home003!.enabled = true; h.home010!.enabled = true;
  delete h.presentation;
  return h;
}
function render(h: HomepageData) {
  return renderToStaticMarkup(createElement(Home, { homepageData: h as unknown as HomepageViewData, products: [], pages: [] }));
}
function campaignTag(html: string) { return html.match(/<section\b(?=[^>]*id="monthly-campaign")[^>]*>/u)?.[0] ?? ""; }
function renderedOrder(html: string, id: string) {
  const tag = html.match(new RegExp('<section\\b(?=[^>]*id="' + id + '")[^>]*>'))?.[0] ?? "";
  const value = tag.match(/(?:style="|;)order:([-\d.]+)/u)?.[1];
  assert.ok(value, "Missing rendered order for " + id); return Number(value);
}
let passed = 0;
async function check(label: string, run: () => unknown | Promise<unknown>) { await run(); console.log("PASS " + (++passed) + ": " + label); }
async function protectedHashes() {
  const hashes: Record<string, string> = {};
  async function walk(dir: string) { for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name); if (e.isDirectory()) await walk(f);
    else if (e.isFile() && e.name.endsWith(".json")) hashes[f] = createHash("sha256").update(await fs.readFile(f)).digest("hex");
  } }
  for (const dir of ["data", "public/data"]) await walk(dir);
  return hashes;
}
const before = await protectedHashes();
await check("Legacy order normalizes to every canonical section once without mutating input", () => {
  const input = structuredClone(legacyOrder), original = structuredClone(input), next = resolveHomepageSectionOrder(input);
  assert.deepEqual(input, original); assert.deepEqual(next.filter(x => x.key !== "campaignSection").map(x => x.key), [...legacyIds]);
  assert.deepEqual([...next.map(x => x.key)].sort(), [...HOMEPAGE_SECTION_KEYS].sort());
  assert.equal(next.filter(x => x.key === "campaignSection").length, 1);
});
await check("Default Campaign preserves the proven HOME003 insertion point", () => {
  for (const input of [undefined, [], legacyOrder, [...legacyOrder].reverse().map((x, order) => ({ ...x, order }))]) {
    const keys = resolveHomepageSectionOrder(input).map(x => x.key); assert.equal(keys.indexOf("campaignSection"), keys.indexOf("home003") + 1);
  }
});
await check("Duplicate Campaign uses existing first-occurrence dedupe semantics", () => {
  const input = [{ key: "campaignSection", order: -2 }, ...legacyOrder, { key: "campaignSection", order: 999 }];
  const next = resolveHomepageSectionOrder(input); assert.equal(next[0].key, "campaignSection"); assert.equal(next.filter(x => x.key === "campaignSection").length, 1);
});
await check("Unknown and malformed legacy entries remain ignored", () => {
  const next = resolveHomepageSectionOrder([null, { key: "unknown", order: -9 }, ...legacyOrder]);
  assert.deepEqual(next, resolveHomepageSectionOrder(legacyOrder));
});
await check("Legacy saved ordering still validates without creating a namespace or migration", () => {
  const h = fixture(); h.sectionOrder = structuredClone(legacyOrder); const original = structuredClone(h);
  assert.equal(validateHomepageCms(h), true); assert.deepEqual(h, original);
});
await check("Explicit complete Campaign ordering validates and retains Owner position", () => {
  const h = fixture(); h.sectionOrder = resolveHomepageSectionOrder([{ key: "campaignSection", order: -1 }, ...legacyOrder]);
  assert.equal(validateHomepageCms(h), true); assert.equal(h.sectionOrder[0].key, "campaignSection");
});
await check("Malformed ordering shape and incomplete nonlegacy shape still reject", () => {
  for (const order of [{}, [], [{ key: "campaignSection", order: 0 }]]) assert.throws(() => validateHomepageCms({ ...fixture(), sectionOrder: order }));
});

// Compile the actual existing ordering editor and its generic controls in memory.
// Only React state storage is supplied; handlers, labels, move and visibility
// implementations are the production functions. No production test exports.
const ast = ts.createSourceFile("HomepageManager.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functionNames = new Set(["HomepageSectionOrderEditor", "moveItem", "Panel", "Visibility"]);
const snippets = ast.statements.filter(node =>
  (ts.isFunctionDeclaration(node) && node.name && functionNames.has(node.name.text)) ||
  (ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(ast) === "sectionNames")));
const compiled = ts.transpileModule(snippets.map(node => node.getText(ast)).join("\n") +
  "\nexport { HomepageSectionOrderEditor };", { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports: Record<string, unknown> = {};
new Function("require", "exports", "resolveHomepageSectionOrder", "useState", compiled)(
  createRequire(import.meta.url), exports, resolveHomepageSectionOrder, (initial: unknown) => [initial, () => {}]);
type Node = { type: unknown; props: Record<string, any> };
function nodes(tree: unknown, predicate: (node: Node) => boolean): Node[] {
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Node; return [...(predicate(node) ? [node] : []), ...nodes(node.props.children, predicate)];
}
let draft = fixture();
const edits: { path: Array<string | number>; value: unknown }[] = [];
function setPath(parts: Array<string | number>, value: unknown) {
  edits.push({ path: parts, value }); let target: any = draft;
  for (const part of parts.slice(0, -1)) target = target[part] ??= {};
  target[parts[parts.length - 1]] = value;
}
const Editor = exports.HomepageSectionOrderEditor as (props: object) => unknown;
function row() {
  const tree = Editor({ homepage: draft, setPath });
  return nodes(tree, node => typeof node.props.className === "string" && node.props.className.startsWith("homepage-section-order-row"))
    .find(node => nodes(node, cell => cell.type === "strong").some(cell => cell.props.children === "本月活動"))!;
}
function move(label: string) {
  const button = nodes(row(), node => node.type === "button" && node.props["aria-label"] === label)[0];
  assert.ok(button); button.props.onClick();
}
function toggle(value: boolean) {
  const control = nodes(row(), node => typeof node.type === "function" && (node.type as Function).name === "Visibility")[0];
  assert.ok(control); const tree = (control.type as Function)(control.props);
  nodes(tree, node => node.type === "input")[0].props.onChange({ target: { checked: value } });
}
const canonical = structuredClone(draft.campaigns);
await check("Campaign appears once in the same Admin ordering table", () => {
  assert.ok(row()); const keys = resolveHomepageSectionOrder(draft.sectionOrder).map(x => x.key);
  assert.equal(keys.filter(x => x === "campaignSection").length, 1);
});
await check("Actual Admin move-up handler moves Campaign one position", () => {
  const before = homepageSectionOrderMap(draft.sectionOrder).campaignSection; move("上移");
  assert.equal(homepageSectionOrderMap(draft.sectionOrder).campaignSection, before - 1);
});
await check("Actual Admin move-down handler restores Campaign position", () => {
  const before = homepageSectionOrderMap(draft.sectionOrder).campaignSection; move("下移");
  assert.equal(homepageSectionOrderMap(draft.sectionOrder).campaignSection, before + 1);
});
await check("Actual Admin hide changes only existing section enabled state", () => {
  const order = structuredClone(draft.sectionOrder); toggle(false);
  assert.equal(draft.campaignSection.enabled, false); assert.deepEqual(draft.sectionOrder, order); assert.equal(campaignTag(render(draft)), "");
});
await check("Actual Admin re-show retains order and all canonical entities", () => {
  const order = structuredClone(draft.sectionOrder); toggle(true);
  assert.equal(draft.campaignSection.enabled, true); assert.deepEqual(draft.sectionOrder, order); assert.deepEqual(draft.campaigns, canonical);
  assert.ok(campaignTag(render(draft)));
  assert.ok(edits.every(edit => edit.path[0] === "sectionOrder" || edit.path.join(".") === "campaignSection.enabled"));
});
await check("Frontend default is exactly one Campaign between HOME003 and HOME004 order", () => {
  const html = render(fixture()); assert.equal((html.match(/id="monthly-campaign"/gu) ?? []).length, 1);
  assert.ok(renderedOrder(html, "home003") < renderedOrder(html, "monthly-campaign"));
  assert.equal(renderedOrder(html, "monthly-campaign"), homepageSectionOrderMap(undefined).campaignSection);
});
await check("Moving Campaign first or last changes real rendered flex order", () => {
  for (const order of [-1, 999]) { const h = fixture(); h.sectionOrder = resolveHomepageSectionOrder([{ key: "campaignSection", order }, ...legacyOrder]);
    const html = render(h); assert.equal(renderedOrder(html, "monthly-campaign"), homepageSectionOrderMap(h.sectionOrder).campaignSection);
    assert.ok(order < 0 ? renderedOrder(html, "monthly-campaign") < renderedOrder(html, "home002") : renderedOrder(html, "monthly-campaign") > renderedOrder(html, "home010"));
  }
});
for (const [label, change] of [
  ["disabled canonical Campaign", (h: HomepageData) => { h.campaigns[0].enabled = false; }],
  ["empty canonical Campaign collection", (h: HomepageData) => { h.campaigns = []; }],
  ["product-only placement", (h: HomepageData) => { h.campaigns[0].placements = ["product_pages"]; }],
  ["future canonical Campaign", (h: HomepageData) => { h.campaigns[0].startDate = "2099-01-01"; }],
  ["expired canonical Campaign", (h: HomepageData) => { h.campaigns[0].endDate = "2000-01-01"; }],
] as const) await check("Section visible cannot override " + label, () => {
  const h = fixture(); change(h); assert.equal(activeHomepageCampaigns(h).length, 0); assert.equal(campaignTag(render(h)), "");
});
await check("Canonical display limit and content editing continue through the same renderer", () => {
  const h = fixture(); h.campaigns[0].title = "Existing canonical Campaign edited";
  h.campaigns.push({ ...h.campaigns[0], id: "SECOND-CAMPAIGN", title: "Not selected due to limit", sort: 99 });
  const html = render(h); assert.match(html, /Existing canonical Campaign edited/u); assert.doesNotMatch(html, /Not selected due to limit/u);
});
await check("Other section visibility and retained ordering remain independent", () => {
  const h = fixture(); h.home002!.enabled = false; const html = render(h);
  assert.doesNotMatch(html, /id="home002"/u); assert.ok(campaignTag(html));
  const reordered = resolveHomepageSectionOrder([{ key: "campaignSection", order: -1 }, ...legacyOrder]);
  assert.deepEqual(reordered.filter(x => x.key !== "campaignSection").map(x => x.key), [...legacyIds]);
});
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "kd-campaign-ordering-"));
try {
  const file = path.join(temp, "store", "homepage.json");
  const relative = path.relative(temp, file);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  assert.ok(!path.resolve(temp).toLowerCase().startsWith(path.resolve(project).toLowerCase() + path.sep));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await check("TEMP atomic ordering/visibility persistence writes no second Campaign payload", async () => {
    const h = fixture(); h.sectionOrder = resolveHomepageSectionOrder([{ key: "campaignSection", order: -1 }, ...legacyOrder]); h.campaignSection.enabled = false;
    assert.equal(validateHomepageCms(h), true);
    await withFileLock(file, () => atomicWriteJson(file, h));
    const saved: HomepageData = JSON.parse(await fs.readFile(file, "utf8"));
    assert.deepEqual(saved.sectionOrder, h.sectionOrder); assert.equal(saved.campaignSection.enabled, false);
    assert.deepEqual(saved.campaigns, h.campaigns); assert.deepEqual(Object.keys(saved).sort(), Object.keys(h).sort());
    assert.equal(resolveHomepageSectionOrder(saved.sectionOrder)[0].key, "campaignSection"); assert.equal(campaignTag(render(saved)), "");
  });
} finally {
  assert.equal(path.dirname(await fs.realpath(temp)).toLowerCase(), (await fs.realpath(os.tmpdir())).toLowerCase());
  await fs.rm(temp, { recursive: true, force: true });
}
await check("Protected project JSON stays byte-identical", async () => assert.deepEqual(await protectedHashes(), before));
console.log("Campaign homepage ordering: " + passed + " PASS / 0 FAIL; TEMP only; no canonical Campaign duplication.");
