import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

process.env.ADMIN_SESSION_SECRET = "phase-j5d5c-b1-admin-session-secret";

const auth = await import("../lib/adminAuth");
const authorization = await import("../lib/adminAuthorization");
const directory = await import("../lib/adminMemberDirectory");
const fulfillment = await import("../lib/fulfillment");
const businessRules = await import("../lib/membershipBusinessRules");
const memberIdentity = await import("../lib/memberIdentity");
const membershipCommerce = await import("../lib/membershipCommerce");
const organization = await import("../lib/adminMemberOrganization");
const search = await import("../lib/adminMemberSearch");

let passed = 0;
async function check(name: string, operation: () => void | Promise<void>) {
  await operation();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

async function source(file: string) {
  return readFile(path.join(process.cwd(), file), "utf8");
}

function registry(memberIds: string[]) {
  const now = "2026-09-16T00:00:00.000Z";
  return {
    schemaVersion: 1, revision: 1, nextMemberSequence: memberIds.length + 1, createdAt: now, updatedAt: now,
    members: Object.fromEntries(memberIds.map((memberId, index) => [memberId, { memberId, memberNumber: `KD-${String(index + 1).padStart(6, "0")}`, status: "active", legacyMemberIds: [], createdAt: now, updatedAt: now }])),
    identities: {}, legacyAliases: {}, linkTransactions: {}, auditLog: [],
  } as const;
}

function relation(id: string, parent: string, child: string, status: "registered" | "qualified" | "inactive" = "registered") {
  return { relationshipId: id, referrerMemberId: parent, referredMemberId: child, referralCode: "TEST", safeDisplayName: "Test", status, createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z" };
}

function searchRows() {
  return [
    { memberId: "member_alpha", memberNumber: "KD-000002", displayName: "小丁", phone: "0912-345-678", email: "junny17880522@yahoo.com.tw", loginEmail: "" },
    { memberId: "member_7ob_5Y2A97lrj159ucZ-GQ", memberNumber: "KD-000003", displayName: "王大明", phone: "0988777666", email: "one@gmail.com", loginEmail: "" },
    { memberId: "member_beta", memberNumber: "KD-000004", displayName: "小丁", phone: "", email: "beta@gmail.com", loginEmail: "" },
  ];
}

const temp = await mkdtemp(path.join(os.tmpdir(), "kd-j5d5c-b1-"));
const paths: import("../lib/adminMemberDirectory").AdminMemberDirectoryPaths = {
  membersDir: path.join(temp, "members"), identityFile: path.join(temp, "identity.json"), commerceFile: path.join(temp, "commerce.json"), rulesFile: path.join(temp, "rules.json"), ordersDir: path.join(temp, "orders"), fulfillmentFile: path.join(temp, "fulfillment.json"), fulfillmentSettingsFile: path.join(temp, "settings.json"), websiteFile: path.join(temp, "website.json"),
};
const productionRoot = { kdDataDir: "/data", railwayVolumeMountPath: "/data", resolvedRoot: "/data", storageRootSource: "KD_DATA_DIR" };
const productionRead = { mode: "production" as const, productionRoot, retries: 1, now: new Date("2026-09-16T00:00:00.000Z") };

async function writeJson(file: string, value: unknown) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function makeFixture() {
  await mkdir(paths.membersDir, { recursive: true });
  await mkdir(paths.ordersDir, { recursive: true });
  const now = "2026-09-16T00:00:00.000Z";
  const identity = registry(["member_one", "member_two"]);
  (identity.legacyAliases as Record<string, string>).legacy_one = "member_one";
  await writeJson(paths.identityFile, identity);
  await writeJson(path.join(paths.membersDir, "member_one.json"), { id: "member_one", displayName: "小丁", pickupName: "小丁", email: "junny17880522@yahoo.com.tw", loginEmail: "JUNNY17880522@YAHOO.COM.TW", phone: "0912-345-678", createdAt: now, updatedAt: now, lastLoginAt: now, passwordHash: "never-expose", passwordSalt: "never-expose", lineUserId: "never-expose" });
  await writeJson(path.join(paths.membersDir, "member_two.json"), { id: "member_two", displayName: "第二位", pickupName: "", email: "two@gmail.com", loginEmail: "", phone: "", createdAt: now, updatedAt: now });
  const emptyCommerce = {
    schemaVersion: 1, revision: 1, createdAt: now, updatedAt: now,
    subscriptions: {
      sub_old: { subscriptionId: "sub_old", memberId: "member_one", status: "terminated", startedFromOrderId: "ORDER-0", anchorDate: "2026-09-01", intervalDays: 30, shippingMethod: "studio_pickup", storeSelection: null, defaultItems: [], rulesVersion: 1, statusReason: "test", createdAt: now, updatedAt: now, revision: 1 },
      sub_active: { subscriptionId: "sub_active", memberId: "member_one", status: "active", startedFromOrderId: "ORDER-1", anchorDate: "2026-09-16", intervalDays: 7, shippingMethod: "711_cod", storeSelection: { storeId: "S1", storeName: "測試門市" }, defaultItems: [], rulesVersion: 1, statusReason: "test", createdAt: now, updatedAt: now, revision: 1 },
    },
    cycles: {
      cycle_late: { cycleId: "cycle_late", subscriptionId: "sub_active", sequence: 2, kind: "scheduled", plannedDate: "2026-09-25", modificationDeadline: "2026-09-22", orderCreationDate: "2026-09-22", status: "modifiable", itemsDraft: [], itemsSnapshot: null, pricingSnapshot: null, giftSnapshot: null, shippingSnapshot: null, rulesSnapshot: null, createdOrderId: null, createdAt: now, updatedAt: now, revision: 1 },
      cycle_early: { cycleId: "cycle_early", subscriptionId: "sub_active", sequence: 1, kind: "scheduled", plannedDate: "2026-09-20", modificationDeadline: "2026-09-17", orderCreationDate: "2026-09-17", status: "modifiable", itemsDraft: [], itemsSnapshot: null, pricingSnapshot: null, giftSnapshot: null, shippingSnapshot: null, rulesSnapshot: null, createdOrderId: null, createdAt: now, updatedAt: now, revision: 1 },
    },
    referrals: { r1: relation("r1", "member_one", "member_two") }, referralConversions: {}, referralRewards: {}, validConsumptionEvents: {}, qualificationRounds: {}, referralRewardCoverages: {}, referralRewardMaturations: {}, creditEntries: {}, creditReservations: {}, events: [], notifications: [], audit: [], idempotency: {},
  };
  await writeJson(paths.commerceFile, emptyCommerce);
  const rules = JSON.parse(await readFile(path.join(process.cwd(), "data/membership-commerce/business-rules.json"), "utf8"));
  await writeJson(paths.rulesFile, rules);
  const website = JSON.parse(await readFile(path.join(process.cwd(), "public/data/website-data.json"), "utf8"));
  await writeJson(paths.websiteFile, website);
  await writeJson(paths.fulfillmentFile, { schemaVersion: 1, revision: 1, records: {
    "ORDER-1": { orderId: "ORDER-1", currentState: "completed", revision: 1, events: [], createdAt: now, updatedAt: now },
    "ORDER-3": { orderId: "WRONG-ID", currentState: "completed", revision: 1, events: [], createdAt: now, updatedAt: now },
  }, reviews: [], processedFingerprints: {}, consequenceStatus: {}, createdAt: now, updatedAt: now });
  await writeJson(paths.fulfillmentSettingsFile, { schemaVersion: 1, revision: 1, notificationEmail: "owner@example.invalid", automaticTrackingEnabled: false, pickupDeadlineDays: 7, expiryPolicy: "manual_review", trackedEvents: { orderCreated: true, shipped: true, arrived: true, completed: true }, gmailConnection: { status: "not_connected", lastSyncedAt: null, recentProcessedCount: 0, reviewCount: 0 }, updatedAt: now });
  await writeJson(path.join(paths.ordersDir, "ORDER-1.json"), { orderNumber: "ORDER-1", createdAt: "2026-09-15T00:00:00.000Z", status: "completed", member: { memberId: "legacy_one" }, customer: { name: "小丁", email: "junny17880522@yahoo.com.tw" }, orderMode: "studio_pickup", total: 100, items: [{ effectivePV: 12, quantity: 1 }] });
  await writeJson(path.join(paths.ordersDir, "ORDER-2.json"), { orderNumber: "ORDER-2", createdAt: "2026-09-15T01:00:00.000Z", status: "completed", member: { memberId: "missing_member" }, customer: { name: "小丁", email: "junny17880522@yahoo.com.tw", phone: "0912-345-678" }, orderMode: "studio_pickup", total: 999, items: [{ effectivePV: 999, quantity: 1 }] });
  await writeJson(path.join(paths.ordersDir, "ORDER-3.json"), { orderNumber: "ORDER-3", createdAt: "2026-09-15T02:00:00.000Z", status: "completed", member: { memberId: "member_one" }, customer: { name: "小丁" }, orderMode: "711_cod", store: { name: "測試門市" }, total: 50, items: [{ effectivePV: 5, quantity: 1 }] });
}

try {
  await makeFixture();

  const ownerSession = auth.parseAdminSessionValue(auth.createAdminSessionValue({ adminId: "owner", role: "owner" }));
  const adminSession = auth.parseAdminSessionValue(auth.createAdminSessionValue({ adminId: "operator", role: "admin" }));
  const legacyPayload = Buffer.from(JSON.stringify({ role: "admin", expiresAt: Date.now() + 60_000 })).toString("base64url");
  const { createHmac } = await import("node:crypto");
  const legacy = auth.parseAdminSessionValue(`${legacyPayload}.${createHmac("sha256", process.env.ADMIN_SESSION_SECRET!).update(legacyPayload).digest("base64url")}`);

  await check("unauthenticated directory permission is denied", async () => assert.rejects(() => authorization.requireAdminPermission(authorization.adminPermissions.membersSensitiveRead, { session: null }), (error: unknown) => error instanceof authorization.AdminAuthorizationError && error.status === 401));
  await check("legacy Admin session is sensitive denied", async () => assert.rejects(() => authorization.requireAdminPermission(authorization.adminPermissions.membersSensitiveRead, { session: legacy }), (error: unknown) => error instanceof authorization.AdminAuthorizationError && error.status === 403));
  await check("admin role is sensitive denied", async () => assert.rejects(() => authorization.requireAdminPermission(authorization.adminPermissions.membersSensitiveRead, { session: adminSession }), (error: unknown) => error instanceof authorization.AdminAuthorizationError && error.status === 403));
  await check("Owner is sensitive allowed", async () => assert.equal(await authorization.requireAdminPermission(authorization.adminPermissions.membersSensitiveRead, { session: ownerSession }), ownerSession));

  await check("Production fallback outside /data fails closed", () => assert.throws(() => directory.assertAdminMemberDirectoryProductionRoot({ nodeEnv: "production", kdDataDir: "", railwayVolumeMountPath: "", resolvedRoot: "", storageRootSource: "local" }), /\/data/u));
  await check("Production requires exact KD_DATA_DIR /data", () => assert.throws(() => directory.assertAdminMemberDirectoryProductionRoot({ nodeEnv: "production", kdDataDir: "/tmp/data", railwayVolumeMountPath: "/data", resolvedRoot: "/tmp/data", storageRootSource: "KD_DATA_DIR" }), /\/data/u));
  await check("verified Production root contract passes", () => directory.assertAdminMemberDirectoryProductionRoot({ nodeEnv: "production", kdDataDir: "/data", railwayVolumeMountPath: "/data", resolvedRoot: "/data", storageRootSource: "KD_DATA_DIR" }));

  const initial = await directory.readAdminMemberDirectorySnapshot({ paths, now: new Date("2026-09-16T00:00:00.000Z") });
  await check("stable strict snapshot is accepted", () => assert.equal(initial.sourceCounts.members, 2));
  await check("missing mandatory source fails closed", async () => {
    const original = await readFile(paths.fulfillmentSettingsFile, "utf8"); await unlink(paths.fulfillmentSettingsFile);
    await assert.rejects(() => directory.readAdminMemberDirectorySnapshot({ paths, ...productionRead }), (error: unknown) => error instanceof directory.AdminMemberDirectoryError && error.code === "missing-source");
    await writeFile(paths.fulfillmentSettingsFile, original, "utf8");
  });
  await check("malformed source fails closed", async () => {
    const original = await readFile(paths.websiteFile, "utf8"); await writeFile(paths.websiteFile, "{broken", "utf8");
    await assert.rejects(() => directory.readAdminMemberDirectorySnapshot({ paths, retries: 1 }), (error: unknown) => error instanceof directory.AdminMemberDirectoryError && error.code === "invalid-source");
    await writeFile(paths.websiteFile, original, "utf8");
  });
  await check("unstable snapshot retries then fails", async () => {
    let revision = 0;
    await assert.rejects(() => directory.readAdminMemberDirectorySnapshot({ paths, retries: 2, afterFirstCapture: async () => {
      const data = JSON.parse(await readFile(paths.websiteFile, "utf8")); data.updatedAt = `2026-09-16T00:00:0${revision += 1}.000Z`; await writeJson(paths.websiteFile, data);
    } }), (error: unknown) => error instanceof directory.AdminMemberDirectoryError && error.code === "unstable-snapshot");
  });

  const snapshot = await directory.readAdminMemberDirectorySnapshot({ paths, now: new Date("2026-09-16T00:00:00.000Z") });
  const one = directory.getAdminMemberDetail(snapshot, "member_one")!;
  await check("legacy alias resolves to canonical member", () => assert.equal(directory.getAdminMemberDetail(snapshot, "legacy_one")?.identity.memberId, "member_one"));
  await check("unresolved order is not matched by PII", () => assert.equal(one.orders.orderCount, 2));
  await check("unresolved order is diagnosed", () => assert.ok(snapshot.diagnostics.some((item) => item.orderNumber === "ORDER-2" && item.code === "order-member-unresolved")));
  await check("fulfillment order ID mismatch is flagged", () => assert.ok(snapshot.diagnostics.some((item) => item.orderNumber === "ORDER-3" && item.code === "fulfillment-order-mismatch")));
  await check("historical PV uses immutable order snapshots", () => assert.equal(one.commerce.historicalEffectivePv, 17));

  await check("H5 exact name search", () => assert.equal(search.searchAdminMembers(searchRows(), "小丁")[0].match.kind, "exact"));
  await check("H5 one-character name uses prefix", () => assert.equal(search.searchAdminMembers(searchRows(), "小")[0].match.reason, "姓名"));
  await check("H5 email without @ searches local part", () => assert.equal(search.searchAdminMembers(searchRows(), "junny")[0].row.memberId, "member_alpha"));
  await check("H5 email domain requires explicit @", () => assert.ok(search.searchAdminMembers(searchRows(), "@gmail.com").length >= 2));
  await check("email domain does not create one-character noise", () => assert.equal(search.searchAdminMembers(searchRows(), "a").some((item) => item.match.reason === "Email"), false));
  await check("H5 phone normalization", () => assert.equal(search.searchAdminMembers(searchRows(), "(0912) 345 678")[0].row.memberId, "member_alpha"));
  await check("short phone fragment is excluded", () => assert.equal(search.searchAdminMembers(searchRows(), "091").some((item) => item.match.reason === "手機"), false));
  await check("H5 canonical member number", () => assert.equal(search.searchAdminMembers(searchRows(), "KD-000002")[0].row.memberId, "member_alpha"));
  await check("H5 normalized member number", () => assert.equal(search.searchAdminMembers(searchRows(), "000002")[0].row.memberId, "member_alpha"));
  await check("single-character Member ID contains is excluded", () => assert.equal(search.searchAdminMembers(searchRows(), "j").some((item) => item.row.memberId.includes("j")), false));
  await check("meaningful Member ID partial is allowed", () => assert.equal(search.searchAdminMembers(searchRows(), "5Y2A")[0].match.reason, "Member ID"));
  await check("exact ranks above prefix and partial", () => assert.ok(search.searchAdminMembers(searchRows(), "小丁").every((item) => item.match.score >= 500)));

  const memberIds = ["root", ...Array.from({ length: 205 }, (_, index) => `child_${index}`), "deep_1", "deep_2"];
  const referrals = Object.fromEntries(memberIds.slice(1, 206).map((id, index) => [`wide_${index}`, relation(`wide_${index}`, "root", id)]));
  referrals.deep1 = relation("deep1", "child_0", "deep_1"); referrals.deep2 = relation("deep2", "deep_1", "deep_2"); referrals.inactive = relation("inactive", "child_1", "deep_2", "inactive");
  const wideGraph = organization.buildAdminMemberOrganization({ registry: registry(memberIds) as never, referrals, members: memberIds.map((memberId) => ({ memberId, displayName: memberId })) });
  await check("complete graph has no depth limit", () => assert.equal(wideGraph.nodes.find((node) => node.memberId === "deep_2")?.depth, 3));
  await check(">200 children remain complete", () => assert.equal(wideGraph.nodes.find((node) => node.memberId === "root")?.directCount, 205));
  await check("inactive referral excluded from hierarchy", () => assert.equal(wideGraph.nodes.find((node) => node.memberId === "deep_2")?.parentId, "deep_1"));
  await check("descendant count is correct", () => assert.equal(wideGraph.nodes.find((node) => node.memberId === "root")?.descendantCount, 207));
  await check("root calculation is complete", () => assert.deepEqual(wideGraph.roots, ["root"]));

  const orphanRegistry = registry(["a", "b", "c", "d"]);
  const anomalous = organization.buildAdminMemberOrganization({ registry: orphanRegistry as never, referrals: {
    self: relation("self", "a", "a"), ab: relation("ab", "a", "b"), cb: relation("cb", "c", "b"), cd: relation("cd", "c", "d"), dc: relation("dc", "d", "c"), missing: relation("missing", "ghost", "a"),
  }, members: [{ memberId: "a" }] });
  await check("missing parent is detected", () => assert.ok(anomalous.diagnostics.some((item) => item.code === "missing-parent")));
  await check("profile orphan is detected", () => assert.ok(anomalous.diagnostics.some((item) => item.code === "orphan")));
  await check("self-referral is detected", () => assert.ok(anomalous.diagnostics.some((item) => item.code === "self-referral")));
  await check("cycle is detected safely", () => assert.ok(anomalous.diagnostics.some((item) => item.code === "cycle")));
  await check("multiple active parents are flagged", () => assert.ok(anomalous.diagnostics.some((item) => item.code === "multiple-active-parents")));
  await check("anomalous graph does not recurse infinitely", () => assert.equal(anomalous.nodes.length, 5));

  await check("secret member fields are excluded", () => assert.doesNotMatch(JSON.stringify(one), /passwordHash|passwordSalt|lineUserId|subjectHash|resetToken/iu));
  await check("all subscriptions are preserved", () => assert.deepEqual(one.subscriptions.map((item) => item.subscriptionId).sort(), ["sub_active", "sub_old"]));
  await check("earliest applicable next cycle is selected", () => assert.equal(one.subscriptions.find((item) => item.subscriptionId === "sub_active")?.nextCycle?.cycleId, "cycle_early"));
  await check("completed spend uses completed immutable totals only", () => assert.equal(one.orders.completedSpend, 150));
  await check("order/fulfillment mismatch surfaces in detail", () => assert.ok(one.orders.recent.some((order) => order.diagnostic)));
  await check("member order PV is not multiplied by reward rows", () => assert.equal(one.commerce.historicalEffectivePv, 17));

  await check("node click gesture opens only below movement threshold", () => assert.equal(organization.isAdminGraphClickGesture({ x: 0, y: 0 }, { x: 2, y: 2 }), true));
  await check("drag gesture does not open member", () => assert.equal(organization.isAdminGraphClickGesture({ x: 0, y: 0 }, { x: 20, y: 3 }), false));
  await check("search ancestor expansion reaches selected member", () => assert.deepEqual(organization.adminGraphAncestorIds("deep_2", new Map(wideGraph.nodes.map((node) => [node.memberId, node]))), ["root", "child_0", "deep_1"]));
  await check("keyboard Enter and Space activate nodes", () => assert.ok(organization.isAdminGraphActivationKey("Enter") && organization.isAdminGraphActivationKey(" ")));
  await check("branch control prevents node-open bubbling", async () => assert.match(await source("components/admin/member-directory/AdminOrganizationNode.tsx"), /stopPropagation\(\)/u));
  await check("Escape closes detail and focus is restored", async () => { const text = await source("components/admin/member-directory/AdminMemberDirectory.tsx"); assert.match(text, /event\.key !== "Escape"/u); assert.match(text, /target\?\.focus\(\)/u); });

  await check("no PII is persisted in browser storage", async () => { const text = await source("components/admin/member-directory/AdminMemberDirectory.tsx"); assert.doesNotMatch(text, /localStorage|sessionStorage|indexedDB/iu); });
  await check("search query is never placed in URL", async () => assert.doesNotMatch(await source("components/admin/member-directory/AdminMemberDirectory.tsx"), /searchParams|\?query=|\?q=/u));
  await check("all APIs require sensitive permission", async () => { for (const file of ["app/api/admin/member-directory/route.ts", "app/api/admin/member-directory/organization/route.ts", "app/api/admin/member-directory/[memberId]/route.ts"]) assert.match(await source(file), /requireAdminPermission\(adminPermissions\.membersSensitiveRead\)/u); });
  await check("API responses are private no-store and vary by Cookie", async () => { for (const file of ["app/api/admin/member-directory/route.ts", "app/api/admin/member-directory/organization/route.ts", "app/api/admin/member-directory/[memberId]/route.ts"]) { const text = await source(file); assert.match(text, /private, no-store/u); assert.match(text, /Vary: "Cookie"/u); } });
  await check("page is noindex nofollow noarchive", async () => { const text = await source("app/admin/member-directory/page.tsx"); assert.match(text, /index: false, follow: false, noarchive: true/u); });
  await check("existing Member Center organization chart remains untouched", async () => { const status = await import("node:child_process").then(({ execFileSync }) => execFileSync("git", ["diff", "--name-only", "--", "components/member/MemberReferralOrgChart.tsx"], { encoding: "utf8" })); assert.equal(status.trim(), ""); });

  const missingPath = (name: string) => path.join(temp, "h3-missing", name);
  const expectProductionMissing = async (override: Partial<typeof paths>, sourceId: import("../lib/adminMemberDirectory").AdminMemberDirectorySourceId) => {
    await assert.rejects(
      () => directory.readAdminMemberDirectorySnapshot({ paths: { ...paths, ...override }, ...productionRead }),
      (error: unknown) => error instanceof directory.AdminMemberDirectoryError && error.code === "missing-source" && error.source === sourceId,
    );
  };

  await check("H3 Production exact /data contract accepts an isolated complete fixture", async () => assert.equal((await directory.readAdminMemberDirectorySnapshot({ paths, ...productionRead })).sourceCounts.members, 2));
  await check("H3 Production repository fallback is rejected", () => assert.throws(() => directory.assertAdminMemberDirectoryProductionRoot({ nodeEnv: "production", kdDataDir: "", railwayVolumeMountPath: "", resolvedRoot: "", storageRootSource: "local" }), /\/data/u));
  await check("H3 Production wrong KD_DATA_DIR is rejected", () => assert.throws(() => directory.assertAdminMemberDirectoryProductionRoot({ nodeEnv: "production", kdDataDir: "/workspace/data", railwayVolumeMountPath: "/data", resolvedRoot: "/workspace/data", storageRootSource: "KD_DATA_DIR" }), /\/data/u));
  await check("H3 Production wrong Railway mount is rejected", () => assert.throws(() => directory.assertAdminMemberDirectoryProductionRoot({ nodeEnv: "production", kdDataDir: "/data", railwayVolumeMountPath: "/volume", resolvedRoot: "/data", storageRootSource: "KD_DATA_DIR" }), /\/data/u));
  await check("H3 Production resolved root outside /data is rejected", () => assert.throws(() => directory.assertAdminMemberDirectoryProductionRoot({ nodeEnv: "production", kdDataDir: "/data", railwayVolumeMountPath: "/data", resolvedRoot: "/data/members", storageRootSource: "KD_DATA_DIR" }), /\/data/u));
  await check("H3 Production missing identity registry fails", () => expectProductionMissing({ identityFile: missingPath("identity.json") }, "identity-registry"));
  await check("H3 Production missing commerce state fails", () => expectProductionMissing({ commerceFile: missingPath("commerce.json") }, "commerce-state"));
  await check("H3 Production missing rules fails", () => expectProductionMissing({ rulesFile: missingPath("rules.json") }, "business-rules"));
  await check("H3 Production missing fulfillment state fails", () => expectProductionMissing({ fulfillmentFile: missingPath("fulfillment.json") }, "fulfillment-state"));
  await check("H3 Production missing fulfillment settings fails", () => expectProductionMissing({ fulfillmentSettingsFile: missingPath("settings.json") }, "fulfillment-settings"));
  await check("H3 Production missing website data fails", () => expectProductionMissing({ websiteFile: missingPath("website.json") }, "website-data"));
  await check("H3 Production missing members directory fails", () => expectProductionMissing({ membersDir: missingPath("members") }, "members"));
  await check("H3 Production missing orders directory fails", () => expectProductionMissing({ ordersDir: missingPath("orders") }, "orders"));
  await check("H3 Production malformed source fails", async () => {
    const malformed = path.join(temp, "malformed-commerce.json");
    await writeFile(malformed, "{broken", "utf8");
    await assert.rejects(() => directory.readAdminMemberDirectorySnapshot({ paths: { ...paths, commerceFile: malformed }, ...productionRead }), (error: unknown) => error instanceof directory.AdminMemberDirectoryError && error.code === "invalid-source" && error.source === "commerce-state");
  });
  await check("H3 Production never substitutes a local default", async () => {
    await assert.rejects(() => directory.readAdminMemberDirectorySnapshot({ paths: { ...paths, fulfillmentSettingsFile: missingPath("no-default.json") }, ...productionRead }), (error: unknown) => error instanceof directory.AdminMemberDirectoryError && error.source === "fulfillment-settings");
  });

  const localRoot = path.join(temp, "local-defaults");
  await mkdir(localRoot, { recursive: true });
  const localPaths: import("../lib/adminMemberDirectory").AdminMemberDirectoryPaths = {
    membersDir: path.join(localRoot, "members"),
    identityFile: path.join(localRoot, "identity.json"),
    commerceFile: path.join(localRoot, "commerce.json"),
    rulesFile: path.join(localRoot, "rules.json"),
    ordersDir: path.join(localRoot, "orders"),
    fulfillmentFile: path.join(localRoot, "fulfillment.json"),
    fulfillmentSettingsFile: path.join(localRoot, "settings.json"),
    websiteFile: path.join(localRoot, "website.json"),
  };
  await writeFile(localPaths.websiteFile, await readFile(paths.websiteFile, "utf8"), "utf8");
  const localNow = new Date("2026-09-16T08:00:00.000Z");
  const localSnapshot = await directory.readAdminMemberDirectorySnapshot({ paths: localPaths, mode: "local-development", now: localNow });
  await check("H3 local missing fulfillment settings uses canonical default", () => assert.deepEqual(directory.adminMemberDirectoryLocalDefault("fulfillment-settings", localNow), fulfillment.defaultLogisticsSettings(localNow)));
  await check("H3 local missing fulfillment state uses canonical empty store", () => assert.doesNotThrow(() => fulfillment.validateFulfillmentStore(directory.adminMemberDirectoryLocalDefault("fulfillment-state", localNow))));
  await check("H3 local missing identity registry uses canonical empty registry", () => assert.equal(memberIdentity.validateMemberIdentityRegistry(directory.adminMemberDirectoryLocalDefault("identity-registry", localNow)).revision, 0));
  await check("H3 local missing commerce state uses canonical empty state", () => assert.equal(membershipCommerce.validateMembershipCommerceState(directory.adminMemberDirectoryLocalDefault("commerce-state", localNow)).revision, 0));
  await check("H3 local missing business rules uses canonical default rules", () => assert.deepEqual(businessRules.validateMembershipRulesStore(directory.adminMemberDirectoryLocalDefault("business-rules", localNow)).versions[0].rules, businessRules.DEFAULT_MEMBERSHIP_RULES));
  await check("H3 local missing members directory becomes valid-empty", () => assert.equal(localSnapshot.sourceCounts.members, 0));
  await check("H3 local missing orders directory becomes valid-empty", () => assert.equal(localSnapshot.sourceCounts.orders, 0));
  await check("H3 local missing website data still fails", async () => await assert.rejects(() => directory.readAdminMemberDirectorySnapshot({ paths: { ...localPaths, websiteFile: missingPath("local-website.json") }, mode: "local-development", retries: 1 }), (error: unknown) => error instanceof directory.AdminMemberDirectoryError && error.code === "missing-source" && error.source === "website-data"));
  await check("H3 local malformed existing source still fails", async () => {
    const malformed = path.join(localRoot, "bad-settings.json");
    await writeFile(malformed, "{broken", "utf8");
    await assert.rejects(() => directory.readAdminMemberDirectorySnapshot({ paths: { ...localPaths, fulfillmentSettingsFile: malformed }, mode: "local-development", retries: 1 }), (error: unknown) => error instanceof directory.AdminMemberDirectoryError && error.code === "invalid-source" && error.source === "fulfillment-settings");
  });
  await check("H3 local default state has a stable path-independent fingerprint", async () => {
    const again = await directory.readAdminMemberDirectorySnapshot({ paths: localPaths, mode: "local-development", now: new Date("2027-01-01T00:00:00.000Z") });
    assert.equal(again.revisionToken, localSnapshot.revisionToken);
    assert.doesNotMatch(again.revisionToken, /[\\/]/u);
  });
  await check("H3 local defaults emit explicit diagnostics", () => {
    for (const code of ["source-empty:members", "source-empty:orders", "source-defaulted:identity-registry", "source-defaulted:commerce-state", "source-defaulted:business-rules", "source-defaulted:fulfillment-state", "source-defaulted:fulfillment-settings"]) assert.ok(localSnapshot.diagnostics.some((item) => item.code === code), code);
  });
  await check("H3 Production emits no local-default diagnostics", async () => assert.equal((await directory.readAdminMemberDirectorySnapshot({ paths, ...productionRead })).diagnostics.some((item) => item.code.startsWith("source-defaulted:") || item.code.startsWith("source-empty:")), false));
  await check("H3 development error payload exposes only allowlisted source ID", () => assert.deepEqual(directory.adminMemberDirectoryErrorPayload(new directory.AdminMemberDirectoryError("missing-source", `private ${paths.fulfillmentSettingsFile}`, { source: "fulfillment-settings" }), "development"), { code: "missing-source", source: "fulfillment-settings" }));
  await check("H3 Production error payload redacts source and path", () => {
    const payload = directory.adminMemberDirectoryErrorPayload(new directory.AdminMemberDirectoryError("missing-source", `private ${paths.fulfillmentSettingsFile}`, { source: "fulfillment-settings" }), "production");
    assert.deepEqual(payload, { code: "missing-source" });
    assert.doesNotMatch(JSON.stringify(payload), /fulfillment|settings|[A-Z]:\\/iu);
  });
  await check("H3 local behavior cannot change Production root resolution", async () => {
    assert.equal(directory.resolveAdminMemberDirectorySnapshotMode("development"), "local-development");
    assert.equal(directory.resolveAdminMemberDirectorySnapshotMode("production"), "production");
    assert.throws(() => directory.assertAdminMemberDirectoryProductionRoot({ nodeEnv: "production", kdDataDir: "", railwayVolumeMountPath: "", resolvedRoot: "", storageRootSource: "local" }), /\/data/u);
    await assert.rejects(() => directory.readAdminMemberDirectorySnapshot({ paths, mode: "production", retries: 1 }), (error: unknown) => error instanceof directory.AdminMemberDirectoryError && error.code === "storage");
  });

  assert.equal(passed, 87);
  console.log(`\n${passed}/87 PASS`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
