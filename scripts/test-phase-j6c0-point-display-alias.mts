import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import * as nodeModule from "node:module";
import { mock } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules, readMembershipRulesStore, MembershipRulesVersionConflictError, MembershipRulesValidationError } from "../lib/membershipBusinessRules";
import { readPointDisplayName, readPointDisplayNameSetting, savePointDisplayName } from "../lib/pointDisplayNameStore";
import { POINT_NAME_KEY, SPACED_POINT_NAME_KEY, resolvePointDisplayName, formatPointDisplayName, pointNameAliasValue } from "../lib/pointDisplayName";
import { creditDisplayName, resolveMemberCopy, resolveMemberDisplayValue, MEMBER_CENTER_COPY_CATALOG } from "../lib/memberCenterCopy";
import { readMemberCenterCopy, saveMemberCenterCopy, MemberCopyValidationError } from "../lib/memberCenterCopyStore";
import { createStoreRepository } from "../lib/storeRepository";
import { resolveEffectivePv } from "../lib/referralPv";
import { getMembershipRulesFile, getMembershipCommerceStateFile } from "../lib/storagePaths";
import Provider, { MemberCopyValue, useMemberPointDisplayName } from "../components/member/MemberCenterCopyProvider";
import MemberCenterCopyManager from "../components/admin/MemberCenterCopyManager";

// Local Node 24 compatibility boundary; installed Node 20 typings omit registerHooks.
// Context is opaque here: the fixture only forwards it to the synchronous next hook.
type SyncNextResolve = (specifier: string, context: object) => nodeModule.ResolveFnOutput;
type RegisterHooksCompat = (hooks: {
  resolve: (specifier: string, context: object, nextResolve: SyncNextResolve) => nodeModule.ResolveFnOutput;
}) => { deregister(): void };
const { registerHooks } = nodeModule as unknown as { registerHooks: RegisterHooksCompat };

// Only the Next request cookie context is supplied; signing, authorization,
// same-origin checks, API handler, file lock and persistence run real code.
let cookieValue: string | undefined;
const cookieFixture = globalThis as typeof globalThis & { __j6c0Cookies?: () => { get: () => { value: string } | undefined } };
cookieFixture.__j6c0Cookies = () => ({ get: () => cookieValue ? { value: cookieValue } : undefined });
const hooks = registerHooks({ resolve(specifier: string, context: object, nextResolve: SyncNextResolve) {
  if (specifier === "next/headers") return { url: "data:text/javascript,export async function cookies(){return globalThis.__j6c0Cookies();}", shortCircuit: true };
  return nextResolve(specifier, context);
} });
const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6c0-alias-"));
const previousRoot = process.env.KD_DATA_DIR;
process.env.KD_DATA_DIR = root;
let passed = 0;
async function test(name: string, operation: () => unknown | Promise<unknown>) { await operation(); passed++; console.log('PASS ' + passed + ': ' + name); }
const protectedFiles = ["lib/membershipBusinessRules.ts", "lib/membershipCommerce.ts", "lib/referralPv.ts", "lib/storeTypes.ts", "lib/storeRepository.ts", "lib/storeValidation.ts", "components/commerce/AddToCart.tsx", "app/works/[slug]/page.tsx", "components/member/RetailPromotionCenter.tsx", "components/admin/MembershipRulesManager.tsx", "lib/memberNotificationAutomation.ts"];
async function hashes() { return Object.fromEntries(await Promise.all(protectedFiles.map(async file => [file, createHash("sha256").update(await fs.readFile(file)).digest("hex")]))); }
const sourceBefore = await hashes();
try {
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-08T00:00:00.000Z") });
  const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES);
  rules.referral.pvRewardMoneyValue = 7.25;
  rules.referral.pointDisplayName = "KD點";
  const initial = await saveMembershipBusinessRules({ expectedRevision: 0, rules });
  const rulesFile = getMembershipRulesFile();
  const copyFile = path.join(root, "member-center/display-copy.json");
  const creditKey = "member.rewards.storeCredit.title";
  const overrides = { [creditKey]: "KD幣", "member.dashboard.label.622f3c5acb": "枚" };
  await saveMemberCenterCopy({ expectedRevision: 0, overrides });
  const copyBefore = await fs.readFile(copyFile, "utf8");
  const rawBefore = JSON.parse(await fs.readFile(rulesFile, "utf8"));
  const repository = createStoreRepository({ dataRoot: root });
  await repository.createSection({ id: "alias-section", name: "測試", slug: "alias-section" });
  await repository.createProduct({ id: "alias-product", sectionId: "alias-section", slug: "alias-product", name: "測試商品", sku: "ALIAS-1", price: 500, inventory: 2, pvValue: 0 });
  const catalogBefore = await fs.readFile(repository.catalogPath, "utf8");
  const calculationInput = { sku: { id: "pv-test", label: "測試", detail: "隔離 SKU", pvEnabled: true, pvValue: 17.5, price: 500 }, originalUnitPrice: 500, discountedUnitPrice: 400, quantity: 2, roundingMode: "round-half-up" as const };
  const calculatedBefore = resolveEffectivePv(calculationInput);
  const { provisionCanonicalMember } = await import("../lib/memberIdentity");
  const { getMemberCommerceDashboard, getMemberReferralCenter, readMembershipCommerceState } = await import("../lib/membershipCommerce");
  const member = await provisionCanonicalMember({ provider: "email", subject: "alias@example.test", persistMember: async () => undefined });
  const state = await readMembershipCommerceState();
  state.creditEntries["alias-credit"] = { creditEntryId: "alias-credit", memberId: member.member.memberId, sourceType: "manual", sourceReference: "isolated-alias-test", amount: 500, remainingAmount: 300, issuedAt: "2026-10-01T00:00:00.000Z", expiresAt: "2027-10-01T00:00:00.000Z", status: "available", createdAt: "2026-10-01T00:00:00.000Z", metadata: { pvRewardMoneyValue: 7.25, rulesVersion: initial.activeRulesVersion } };
  await fs.mkdir(path.dirname(getMembershipCommerceStateFile()), { recursive: true });
  await fs.writeFile(getMembershipCommerceStateFile(), JSON.stringify(state));
  const beforeDTO = await Promise.all([getMemberCommerceDashboard(member.member.memberId), getMemberReferralCenter(member.member.memberId)]);
  const commerceBefore = await fs.readFile(getMembershipCommerceStateFile(), "utf8");
  await test("Canonical source loads referral.pointDisplayName", async () => assert.equal(await readPointDisplayName(), "KD點"));
  await test("Title is canonical semantic alias", () => assert.equal(pointNameAliasValue(POINT_NAME_KEY, "KD點"), "KD點"));
  await test("Spaced title only derives existing typography", () => { assert.equal(pointNameAliasValue(SPACED_POINT_NAME_KEY, "KD點"), "KD 點"); assert.equal(formatPointDisplayName("會員點", "spaced"), "會員點"); });
  await test("Both Admin catalog controls retained", () => { for (const key of [POINT_NAME_KEY, SPACED_POINT_NAME_KEY]) assert.ok(MEMBER_CENTER_COPY_CATALOG.some(entry => entry.key === key)); });
  const { createAdminSessionValue } = await import("../lib/adminAuth");
  const api = await import("../app/api/admin/point-display-name/route");
  const request = (body: unknown, origin = "http://127.0.0.1:4318") => new Request("http://127.0.0.1:4318/api/admin/point-display-name", { method: "PUT", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body) });
  await test("Unauthenticated write denied", async () => assert.equal((await api.PUT(request({ expectedRevision: initial.revision, pointDisplayName: "KD幣點" }))).status, 401));
  cookieValue = createAdminSessionValue({ role: "admin" });
  await test("Non-owner write denied", async () => assert.equal((await api.PUT(request({ expectedRevision: initial.revision, pointDisplayName: "KD幣點" }))).status, 401));
  cookieValue = createAdminSessionValue({ role: "owner" });
  await test("Cross-origin write denied", async () => assert.equal((await api.PUT(request({ expectedRevision: initial.revision, pointDisplayName: "KD幣點" }, "https://example.invalid"))).status, 403));
  await test("Extra business fields rejected", async () => assert.equal((await api.PUT(request({ expectedRevision: initial.revision, pointDisplayName: "KD幣點", pvRewardMoneyValue: 1 }))).status, 400));
  await test("Admin API reload reads canonical revision and value", async () => assert.deepEqual(await (await api.GET()).json(), { revision: initial.revision, pointDisplayName: "KD點" }));
  await test("Alias write updates canonical via real API", async () => { const response = await api.PUT(request({ expectedRevision: initial.revision, pointDisplayName: "KD幣點" })); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { revision: initial.revision + 1, pointDisplayName: "KD幣點" }); });
  const setting = await readPointDisplayNameSetting();
  await test("All same-semantic controls reload KD幣點", async () => { assert.equal(await readPointDisplayName(), "KD幣點"); for (const key of [POINT_NAME_KEY, SPACED_POINT_NAME_KEY]) assert.equal(pointNameAliasValue(key, setting.pointDisplayName), "KD幣點"); });
  await test("Legacy copy aliases cannot override canonical title or spaced title", () => { for (const key of [POINT_NAME_KEY, SPACED_POINT_NAME_KEY]) assert.equal(resolveMemberCopy({ [key]: "錯誤副本" }, key, {}, "", setting.pointDisplayName), "KD幣點"); });
  const rawAfter = JSON.parse(await fs.readFile(rulesFile, "utf8"));
  await test("All historical versions byte-value unchanged", () => assert.deepEqual(rawAfter.versions.slice(0, -1), rawBefore.versions));
  await test("New snapshot changes only pointDisplayName", () => { const latest = structuredClone(rawAfter.versions.at(-1).rules); latest.referral.pointDisplayName = rawBefore.versions.at(-1).rules.referral.pointDisplayName; assert.deepEqual(latest, rawBefore.versions.at(-1).rules); });
  await test("Each historical conversion is immutable and new snapshot preserves active conversion", () => {
    // rawBefore is the persisted snapshot captured before the point-name write.
    const conversions = (versions: typeof rawBefore.versions) => versions.map((version: { rulesVersion: number; rules: typeof rules }) => ({ rulesVersion: version.rulesVersion, pvRewardMoneyValue: version.rules.referral.pvRewardMoneyValue }));
    const beforeConversions = conversions(rawBefore.versions);
    const afterConversions = conversions(rawAfter.versions.slice(0, rawBefore.versions.length));
    assert.deepEqual(afterConversions, beforeConversions);
    assert.equal(rawAfter.versions.at(-1).rules.referral.pvRewardMoneyValue, rawBefore.versions.at(-1).rules.referral.pvRewardMoneyValue);
    console.log("CONVERSION HISTORY " + JSON.stringify({ before: beforeConversions, after: afterConversions, newSnapshot: conversions(rawAfter.versions.slice(-1))[0] }));
  });
  await test("Point write leaves display-copy file byte-identical", async () => assert.equal(await fs.readFile(copyFile, "utf8"), copyBefore));
  await test("Credit resolver remains independently KD幣", () => assert.equal(creditDisplayName(overrides), "KD幣"));
  await test("Store pvValue=0 and all product persistence byte-identical", async () => assert.equal(await fs.readFile(repository.catalogPath, "utf8"), catalogBefore));
  await test("Actual effective-PV math unchanged", () => assert.deepEqual(resolveEffectivePv(calculationInput), calculatedBefore));
  const afterDTO = await Promise.all([getMemberCommerceDashboard(member.member.memberId), getMemberReferralCenter(member.member.memberId)]);
  const stripName = (value: unknown): unknown => Array.isArray(value) ? value.map(stripName) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== "pointDisplayName").map(([key, child]) => [key, stripName(child)])) : value;
  await test("Actual dashboard/referral reward, wallet, qualification DTO values unchanged except point label", () => assert.deepEqual(stripName(afterDTO), stripName(beforeDTO)));
  await test("Commerce wallet and reward ledger persisted bytes unchanged", async () => assert.equal(await fs.readFile(getMembershipCommerceStateFile(), "utf8"), commerceBefore));
  await test("Stale alias write returns 409", async () => assert.equal((await api.PUT(request({ expectedRevision: initial.revision, pointDisplayName: "舊名稱" }))).status, 409));
  await test("Stale repository helper rejects", async () => assert.rejects(savePointDisplayName({ expectedRevision: initial.revision, pointDisplayName: "舊名稱" }), MembershipRulesVersionConflictError));
  await test("Invalid revisions and invalid names remain rejected", async () => { for (const revision of [-1, NaN, 1.5]) await assert.rejects(savePointDisplayName({ expectedRevision: revision, pointDisplayName: "KD點" }), MembershipRulesValidationError); for (const name of ["", " ", "a".repeat(25), 12]) await assert.rejects(savePointDisplayName({ expectedRevision: setting.revision, pointDisplayName: name }), MembershipRulesValidationError); });
  await test("Concurrent same-revision writes have exactly one winner", async () => { const results = await Promise.allSettled([savePointDisplayName({ expectedRevision: setting.revision, pointDisplayName: "KD幣點" }), savePointDisplayName({ expectedRevision: setting.revision, pointDisplayName: "KD幣點" })]); assert.equal(results.filter(result => result.status === "fulfilled").length, 1); assert.ok(results.some(result => result.status === "rejected" && result.reason instanceof MembershipRulesVersionConflictError)); });
  await test("Copy path rejects each duplicate persisted alias", async () => { for (const key of [POINT_NAME_KEY, SPACED_POINT_NAME_KEY]) await assert.rejects(saveMemberCenterCopy({ expectedRevision: 1, overrides: { ...overrides, [key]: "獨立副本" } }), MemberCopyValidationError); });
  await test("No new duplicate alias fields persisted", async () => { const copy = JSON.parse(await fs.readFile(copyFile, "utf8")); assert.ok(!Object.hasOwn(copy.overrides, POINT_NAME_KEY)); assert.ok(!Object.hasOwn(copy.overrides, SPACED_POINT_NAME_KEY)); });
  await test("Unrelated ordinary copy edit leaves canonical rules untouched", async () => { const bytes = await fs.readFile(rulesFile, "utf8"); await saveMemberCenterCopy({ expectedRevision: 1, overrides: { ...overrides, "member.referral.generation1.title": "好友回饋" } }); assert.equal(await fs.readFile(rulesFile, "utf8"), bytes); assert.equal(creditDisplayName((await readMemberCenterCopy()).overrides), "KD幣"); });
  function PointConsumer() { return createElement("span", null, useMemberPointDisplayName("KD點")); }
  const render = (children: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(Provider, { initialOverrides: { ...overrides, [POINT_NAME_KEY]: "舊副本" }, initialPointDisplayName: setting.pointDisplayName, children }));
  await test("Existing configured point hook now uses canonical name", () => assert.equal(render(createElement(PointConsumer)), "<span>KD幣點</span>"));
  await test("Existing hardcoded numeric point label uses canonical and preserves amount", () => assert.equal(render(createElement(MemberCopyValue, { value: "+ 1,234.5 KD點" })), "+ 1,234.5 KD幣點"));
  await test("Existing literal spacing uses formatting derivation", () => assert.equal(resolveMemberDisplayValue({}, "KD 點", "KD點"), "KD 點"));
  await test("Existing credit display and numeric units unchanged", () => { assert.equal(resolveMemberCopy(overrides, creditKey, {}, "", "KD幣點"), "KD幣"); assert.equal(resolveMemberDisplayValue(overrides, "18 元", "KD幣點"), "18 元"); });
  await test("Admin original field reads canonical not legacy copy", () => { const html = renderToStaticMarkup(createElement(MemberCenterCopyManager, { initialRevision: 2, initialOverrides: { [POINT_NAME_KEY]: "舊副本" }, initialPointSetting: setting })); assert.match(html, /id="member.rewards.kdPoints.title"[^>]*value="KD幣點"/); assert.ok(!html.includes("舊副本")); });
  await test("Future Store resolver needs only existing rules and pvValue", async () => { const latest = (await readMembershipRulesStore()).versions.at(-1)!; assert.equal(resolvePointDisplayName(latest.rules), "KD幣點"); const catalog = await repository.read(); assert.equal(catalog.products[0].pvValue + " " + resolvePointDisplayName(latest.rules), "0 KD幣點"); for (const key of ["pointDisplayName", "kdLabel"]) assert.ok(!Object.hasOwn(catalog.products[0], key)); });
  await test("Scheduled unrelated rules never activated by point-only alias edit", async () => { const current = await readMembershipRulesStore(); await saveMembershipBusinessRules({ expectedRevision: current.revision, rules: current.versions.at(-1)!.rules, effectiveAt: "2026-12-01T00:00:00.000Z" }); const bytes = await fs.readFile(rulesFile, "utf8"); await assert.rejects(savePointDisplayName({ expectedRevision: current.revision + 1, pointDisplayName: "不可提前生效" }), MembershipRulesValidationError); assert.equal(await fs.readFile(rulesFile, "utf8"), bytes); });
  await test("Artwork current dynamic consumer still passes canonical business-rule name", async () => { const source = await fs.readFile("app/works/[slug]/page.tsx", "utf8"); assert.match(source, /pointDisplayName=\{membershipRules\.rules\.referral\.pointDisplayName\}/); });
  await test("Artwork, Retail PV, rule/conversion validator, wallet/reward and J6B protected sources unchanged", async () => assert.deepEqual(await hashes(), sourceBefore));
  console.log('J6C0 ALIAS PASS: ' + passed + '/' + passed + '; isolated fixtures only.');
} finally {
  mock.timers.reset(); hooks.deregister(); delete cookieFixture.__j6c0Cookies;
  if (previousRoot === undefined) delete process.env.KD_DATA_DIR; else process.env.KD_DATA_DIR = previousRoot;
  assert.ok(root.startsWith(path.join(os.tmpdir(), "kd-j6c0-alias-")));
  await fs.rm(root, { recursive: true, force: true });
}
