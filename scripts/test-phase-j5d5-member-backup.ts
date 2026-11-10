import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { Script } from "node:vm";

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  KD_DATA_DIR: process.env.KD_DATA_DIR,
  RAILWAY_VOLUME_MOUNT_PATH: process.env.RAILWAY_VOLUME_MOUNT_PATH,
  RAILWAY_GIT_COMMIT_SHA: process.env.RAILWAY_GIT_COMMIT_SHA,
};
const now = "2026-09-16T03:20:00.000Z";

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function prepareFixture(root: string) {
  const requiredDirs = ["members", "member-identity", "membership-commerce", "orders", "fulfillment", "uploads/member-avatars/m_a", "uploads/order-notifications", "store"];
  await Promise.all(requiredDirs.map((item) => fs.mkdir(path.join(root, item), { recursive: true })));
  for (const member of [
    { id: "m_a", displayName: "小丁", phone: "0912-345-678", email: "junny17880522@yahoo.com.tw", loginEmail: "login-a@example.test", authProvider: "email", pictureUrl: "https://profile.example.test/a.jpg", createdAt: now, lastLoginAt: now, updatedAt: now },
    { id: "m_b", displayName: "陳美玲", phone: "0988 111 222", email: "1@gmail.com", avatarUrl: "/uploads/member-avatars/m_a/avatar.webp", authProvider: "line", createdAt: now, lastLoginAt: now, updatedAt: now },
    { id: "m_c", displayName: "陳美玲", phone: "(0977)333444", email: "other@yahoo.com", createdAt: now, lastLoginAt: now, updatedAt: now },
    { id: "member_7ob_5Y2A97lrj159ucZ-GQ", displayName: "小丁老師", phone: "0966-555-444", email: "2@gmail.com", createdAt: now, lastLoginAt: now, updatedAt: now },
  ]) await writeJson(path.join(root, "members", `${member.id}.json`), member);

  await writeJson(path.join(root, "member-identity", "registry.json"), {
    schemaVersion: 1, revision: 7, nextMemberSequence: 4, createdAt: now, updatedAt: now,
    members: {
      m_a: { memberId: "m_a", memberNumber: "196200001", status: "active", createdAt: now, updatedAt: now },
      m_b: { memberId: "m_b", memberNumber: "196200002", status: "active", createdAt: now, updatedAt: now },
      m_c: { memberId: "m_c", memberNumber: "KD-000002", status: "active", createdAt: now, updatedAt: now },
      "member_7ob_5Y2A97lrj159ucZ-GQ": { memberId: "member_7ob_5Y2A97lrj159ucZ-GQ", memberNumber: "KD-000004", status: "active", createdAt: now, updatedAt: now },
    }, identities: {
      identity_a: { identityId: "identity_a", memberId: "m_a", provider: "email", subjectHash: "hidden" },
      identity_b: { identityId: "identity_b", memberId: "m_b", provider: "line", subjectHash: "hidden" },
    }, legacyAliases: {}, linkTransactions: {}, auditLog: [],
  });
  await writeJson(path.join(root, "membership-commerce", "commerce-state.json"), {
    schemaVersion: 1, revision: 11, createdAt: now, updatedAt: now,
    subscriptions: { sub1: { subscriptionId: "sub1", memberId: "m_b", status: "active", anchorDate: "2026-09-15", intervalDays: 7, shippingMethod: "711_cod", storeSelection: { storeId: "S1", storeName: "港明" }, createdAt: now } },
    cycles: { cycle1: { cycleId: "cycle1", subscriptionId: "sub1", kind: "scheduled", status: "modifiable", plannedDate: "2026-09-22", orderCreationDate: "2026-09-19", modificationDeadline: "2026-09-18", createdOrderId: null, pricingSnapshot: { finalAmount: 475 }, createdAt: now } },
    referrals: {
      r1: { relationshipId: "r1", referrerMemberId: "m_a", referredMemberId: "m_b", status: "registered", createdAt: now },
      r2: { relationshipId: "r2", referrerMemberId: "m_b", referredMemberId: "m_c", status: "qualified", createdAt: now },
    },
    referralConversions: {}, referralRewards: { rr1: { rewardId: "rr1", beneficiaryMemberId: "m_b", status: "released", calculatedCreditAmount: 50, projectedCreditAmount: 50, effectivePV: 100 } },
    validConsumptionEvents: { vc1: { eventId: "vc1", memberId: "m_b", validConsumptionAmount: 475 } },
    qualificationRounds: { qr1: { roundId: "qr1", memberId: "m_b" } }, referralRewardCoverages: {}, referralRewardMaturations: {},
    creditEntries: { c1: { creditEntryId: "c1", memberId: "m_b", status: "available", remainingAmount: 50 } },
    creditReservations: { cr1: { reservationId: "cr1", memberId: "m_b", orderId: "ORD-1", status: "reserved" } }, events: [], notifications: [], audit: [], idempotency: {},
  });
  await writeJson(path.join(root, "membership-commerce", "business-rules.json"), { schemaVersion: 1, revision: 3 });
  await writeJson(path.join(root, "orders", "ORD-1.json"), { orderNumber: "ORD-1", member: { memberId: "m_b" }, createdAt: now, status: "completed", orderMode: "711_cod", total: 475, store: { id: "S1", name: "港明", address: "測試地址" }, items: [{ name: "莫內花語", optionLabel: "半磅", quantity: 1 }] });
  await writeJson(path.join(root, "fulfillment", "state.json"), { schemaVersion: 1, revision: 5, records: { "ORD-1": { orderId: "ORD-1", currentState: "completed", updatedAt: now, events: [{ state: "completed", occurredAt: now, source: "admin" }] } } });
  await writeJson(path.join(root, "fulfillment", "settings.json"), { schemaVersion: 1, revision: 2, pickupDeadlineDays: 7 });
  await writeJson(path.join(root, "store", "website-data.json"), { menu: { products: [] }, revision: 9 });
  await fs.writeFile(path.join(root, "uploads", "member-avatars", "m_a", "avatar.webp"), Buffer.from([1, 2, 3, 4]));
  await fs.writeFile(path.join(root, "uploads", "order-notifications", "ORD-1.png"), Buffer.from([5, 6, 7]));
}

async function expectReject(run: () => Promise<unknown>, pattern: RegExp) {
  await assert.rejects(run, pattern);
}

type OfflineTestHandler = (event: unknown) => void;

type OfflineTestElement = {
  hidden: boolean;
  innerHTML: string;
  value: string;
  textContent: string;
  style: Record<string, string>;
  onclick: (() => void) | null;
  handlers: Map<string, OfflineTestHandler>;
  addEventListener: (type: string, handler: OfflineTestHandler) => void;
  querySelector: (selector: string) => { focus: () => void } | null;
  scrollTo: () => void;
  setPointerCapture: () => void;
  classList: { add: () => void; remove: () => void };
};

async function main() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j5d5a-"));
  const root = path.join(workspace, "complete");
  await fs.mkdir(root, { recursive: true });
  await prepareFixture(root);
  Object.assign(process.env, { NODE_ENV: "test", KD_DATA_DIR: root, RAILWAY_GIT_COMMIT_SHA: "e7bf9d5-test" });
  delete process.env.RAILWAY_VOLUME_MOUNT_PATH;

  const backupModule = await import("../lib/memberBackup");
  assert.equal(backupModule.isSupportedMemberBackupVersion("J.5D.5A-H1-v1"), true);
  assert.equal(backupModule.isSupportedMemberBackupVersion("J.5D.5A-H2-v1"), true);
  assert.equal(backupModule.isSupportedMemberBackupVersion("unknown"), false);
  assert.deepEqual(backupModule.validateProductionBackupProvenance({ nodeEnv: "production", kdDataDir: "/data", railwayVolumeMountPath: "/data", contract: { root: "/data", source: "KD_DATA_DIR", railwayMountPath: "/data" } }), []);
  assert.ok(backupModule.validateProductionBackupProvenance({ nodeEnv: "production", kdDataDir: root, railwayVolumeMountPath: "/data", contract: { root, source: "KD_DATA_DIR", railwayMountPath: "/data" } }).length >= 1);
  await expectReject(() => backupModule.createMemberBackup({ source: "manual_admin" }), /Production member backup refused/);
  await expectReject(() => backupModule.createMemberBackup({ source: "manual_admin", testOnlyAllowNonProduction: true }), /test override is allowed only/);

  const result = await backupModule.createMemberBackup({ source: "test", now: new Date(now), testOnlyAllowNonProduction: true });
  const manifest = result.manifest;
  assert.equal(manifest.status, "verified");
  assert.equal(manifest.backupVersion, "J.5D.5A-H2-v1");
  assert.equal(manifest.environment, "test");
  assert.equal(manifest.dataRoot.replaceAll("\\", "/"), root.replaceAll("\\", "/"));
  assert.equal(manifest.gitCommit, "e7bf9d5-test");
  assert.equal(manifest.counts.canonicalMembers, 4);
  assert.equal(manifest.counts.activeReferrals, 2);
  assert.equal(manifest.counts.totalReferrals, 2);
  assert.equal(manifest.counts.subscriptions, 1);
  assert.equal(manifest.counts.ledgerEntries, 3);
  assert.equal(manifest.counts.orders, 1);
  assert.equal(manifest.counts.fulfillmentRecords, 1);
  assert.equal(manifest.sourceRevisions.identityRevision, 7);
  assert.equal(manifest.sourceRevisions.commerceRevision, 11);
  assert.equal(manifest.sourceRevisions.businessRulesRevision, 3);
  assert.equal(manifest.sourceRevisions.fulfillmentRevision, 5);
  assert.equal(manifest.datasets.length, 10);
  assert.deepEqual(new Set(manifest.datasets.map((item) => item.id)), new Set(["members", "member_identity", "membership_commerce", "membership_business_rules", "orders", "fulfillment_state", "fulfillment_settings", "member_avatars", "order_notifications", "website_data"]));
  const capturedAvatars = manifest.datasets.find((item) => item.id === "member_avatars");
  assert.deepEqual(
    { required: capturedAvatars?.required, present: capturedAvatars?.present, empty: capturedAvatars?.empty, status: capturedAvatars?.status, fileCount: capturedAvatars?.fileCount },
    { required: true, present: true, empty: false, status: "captured", fileCount: 1 },
  );

  for (const required of [
    "manifest.json", "checksums.sha256", "index.html", "organization-tree.json", "organization.html", "readable/members.csv", "readable/organization.csv",
    "raw/member-identity/registry.json", "raw/membership-commerce/commerce-state.json", "raw/membership-commerce/business-rules.json", "raw/orders/ORD-1.json",
    "raw/fulfillment/state.json", "raw/fulfillment/settings.json", "raw/store/website-data.json", "raw/uploads/member-avatars/m_a/avatar.webp", "raw/uploads/order-notifications/ORD-1.png",
  ]) await fs.access(path.join(result.path, ...required.split("/")));

  const tree = JSON.parse(await fs.readFile(path.join(result.path, "organization-tree.json"), "utf8"));
  assert.deepEqual(tree.roots, ["m_a", "member_7ob_5Y2A97lrj159ucZ-GQ"]);
  assert.equal(tree.nodes.find((node: { memberId: string }) => node.memberId === "m_a").teamCount, 2);
  assert.equal(tree.nodes.find((node: { memberId: string }) => node.memberId === "m_b").depth, 1);
  assert.equal(tree.validation.valid, true);
  const html = await fs.readFile(path.join(result.path, "organization.html"), "utf8");
  assert.match(html, /196200001/);
  assert.match(html, /輸入姓名、會員編號或 Member ID/);
  assert.match(html, /回到根節點/);
  assert.match(html, /離線備份資料｜含會員個資/);
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /fetch\s*\(|XMLHttpRequest|innerHTML|junny17880522|0912-345-678/u);
  const inlineScript = /<script>([\s\S]*?)<\/script>/u.exec(html)?.[1];
  assert.ok(inlineScript);
  assert.doesNotThrow(() => new Script(inlineScript, { filename: "organization-inline.js" }));
  const index = await fs.readFile(path.join(result.path, "index.html"), "utf8");
  assert.match(index, /KD Coffee｜備份資料檢視中心/);
  assert.match(index, /本次開啟尚未重新驗證/);
  assert.match(index, /Store／網站資料/);

  const readJson = async (relative: string) => JSON.parse(await fs.readFile(path.join(root, relative), "utf8"));
  const profiles = new Map<string, Record<string, unknown>>();
  for (const filename of await fs.readdir(path.join(root, "members"))) {
    const profile = await readJson("members/" + filename);
    profiles.set(profile.id, profile);
  }
  const embedded = { members: backupModule.buildOfflineMemberIndex({
    tree, profiles,
    identity: await readJson("member-identity/registry.json"),
    commerce: await readJson("membership-commerce/commerce-state.json"),
    fulfillment: await readJson("fulfillment/state.json"),
    parsedOrders: new Map([["raw/orders/ORD-1.json", await readJson("orders/ORD-1.json")]]),
  }) };
  const find = (query: string) => backupModule.searchOfflineMembers(embedded.members, query);
  assert.equal(find("196200001")[0]?.member.memberId, "m_a");
  assert.equal(find("M_A")[0]?.member.memberId, "m_a");
  assert.equal(find("0912-345-678")[0]?.member.memberId, "m_a");
  assert.equal(find("0912 345 678")[0]?.member.memberId, "m_a");
  assert.equal(find("(0912)345678")[0]?.member.memberId, "m_a");
  assert.equal(find("0912345678")[0]?.member.memberId, "m_a");
  assert.equal(find("JUNNY17880522@YAHOO.COM.TW")[0]?.member.memberId, "m_a");
  assert.equal(find("美玲").length, 2);
  const singleJ = find("j");
  assert.equal(singleJ[0]?.member.memberId, "m_a");
  assert.equal(singleJ[0]?.reason, "Email");
  assert.equal(singleJ.some((result) => result.member.memberId === "member_7ob_5Y2A97lrj159ucZ-GQ"), false);
  assert.equal(find("a").length, 0);
  assert.equal(find("小").some((result) => result.member.memberId === "m_a" && result.reason === "姓名"), true);
  assert.equal(find("KD-000002")[0]?.member.memberId, "m_c");
  assert.equal(find("000002")[0]?.member.memberId, "m_c");
  assert.equal(find("@gmail.com").length, 2);
  assert.equal(find("@gmail.com").every((result) => result.reason === "Email"), true);
  assert.equal(find("5Y2A")[0]?.member.memberId, "member_7ob_5Y2A97lrj159ucZ-GQ");
  assert.equal(find("小丁")[0]?.member.memberId, "m_a");
  assert.equal(find("小丁")[0]?.exact, true);
  assert.equal(find("小丁")[1]?.member.memberId, "member_7ob_5Y2A97lrj159ucZ-GQ");
  assert.equal(find("不存在的會員").length, 0);
  const memberA = embedded.members.find((member) => member.memberId === "m_a");
  const memberB = embedded.members.find((member) => member.memberId === "m_b");
  const memberC = embedded.members.find((member) => member.memberId === "m_c");
  assert.ok(memberA && memberB && memberC);
  assert.equal(memberA.identity.providerTypes[0], "email");
  assert.equal(memberA.identity.providerPicture, true);
  assert.equal(memberB.identity.customAvatar, true);
  assert.equal(memberB.organization.parentId, "m_a");
  assert.equal(memberB.organization.children[0]?.memberId, "m_c");
  assert.equal(memberB.organization.directReferralCount, 1);
  assert.equal(memberB.organization.teamCount, 1);
  assert.equal(memberB.organization.descendantCount, 1);
  assert.equal(memberB.orders.totalCount, 1);
  assert.equal(memberB.orders.recent[0]?.orderNumber, "ORD-1");
  assert.equal(memberB.subscriptions[0]?.subscriptionId, "sub1");
  assert.equal(memberB.subscriptions[0]?.nextCycle?.plannedDate, "2026-09-22");
  assert.equal(memberB.fulfillment[0]?.currentState, "completed");
  assert.equal(memberB.commerce.recordedRemainingCredit, 50);
  assert.equal(memberB.commerce.rewardCount, 1);
  assert.equal(memberC.subscriptions.length, 0);
  assert.equal(memberC.orders.totalCount, 0);

  const fakeStaging = path.join(root, "backups", "members", `.staging-${manifest.backupId}`);
  await fs.mkdir(fakeStaging, { recursive: true });
  const backups = await backupModule.listMemberBackups({ testOnlyAllowNonProduction: true });
  assert.equal(backups.length, 1);
  assert.equal(backups[0]?.backupId, manifest.backupId);

  assert.equal(backupModule.isValidMemberBackupId(manifest.backupId), true);
  for (const invalid of ["../manifest.json", ".staging-x", `${manifest.backupId}/../x`, "C:\\data\\secret"]) {
    assert.equal(backupModule.isValidMemberBackupId(invalid), false);
    await expectReject(() => backupModule.getVerifiedMemberBackupForDownload(invalid, { testOnlyAllowNonProduction: true }), /Invalid member backup ID/);
  }
  const verified = await backupModule.getVerifiedMemberBackupForDownload(manifest.backupId, { testOnlyAllowNonProduction: true });
  const zipArtifact = await backupModule.createMemberBackupZipArtifact(verified);
  const zipChunks: Buffer[] = [];
  for await (const chunk of Readable.fromWeb(zipArtifact.body as never)) zipChunks.push(Buffer.from(chunk));
  const zip = Buffer.concat(zipChunks);
  assert.equal(zipArtifact.bytes, zip.length);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.match(zip.toString("latin1"), /organization-tree\.json/);
  assert.match(zip.toString("latin1"), /raw\/orders\/ORD-1\.json/);
  assert.match(zip.toString("latin1"), /checksums\.sha256/);

  const originalOrganization = await fs.readFile(path.join(result.path, "organization-tree.json"));
  await fs.appendFile(path.join(result.path, "organization-tree.json"), "tampered");
  await expectReject(() => backupModule.getVerifiedMemberBackupForDownload(manifest.backupId, { testOnlyAllowNonProduction: true }), /changed|checksum mismatch/);
  await fs.writeFile(path.join(result.path, "organization-tree.json"), originalOrganization);

  const graph = backupModule.buildOrganizationTree({
    identity: { members: { a: { memberNumber: "1" }, b: { memberNumber: "2" }, c: { memberNumber: "3" } } },
    commerce: { referrals: {
      one: { referrerMemberId: "a", referredMemberId: "b", status: "registered" }, two: { referrerMemberId: "c", referredMemberId: "b", status: "qualified" },
      three: { referrerMemberId: "b", referredMemberId: "a", status: "registered" }, four: { referrerMemberId: "missing", referredMemberId: "c", status: "registered" },
      five: { referrerMemberId: "c", referredMemberId: "c", status: "registered" },
    } },
    profiles: new Map(), duplicateProfileIds: ["a"], createdAt: now,
  });
  assert.equal(graph.validation.valid, false);
  for (const key of ["duplicate_member_id", "multiple_active_parent", "missing_parent", "orphan", "self_referral", "cycle"] as const) assert.ok(graph.validation.findingCounts[key] > 0, `${key} must be detected`);

  const validEmptyAvatarRoot = path.join(workspace, "valid-empty-avatar");
  await fs.mkdir(validEmptyAvatarRoot, { recursive: true });
  await prepareFixture(validEmptyAvatarRoot);
  const providerProfilePath = path.join(validEmptyAvatarRoot, "members", "m_a.json");
  const providerProfile = JSON.parse(await fs.readFile(providerProfilePath, "utf8"));
  providerProfile.pictureUrl = "https://profile.example.test/provider-avatar.jpg";
  await writeJson(providerProfilePath, providerProfile);
  const customAvatarProfilePath = path.join(validEmptyAvatarRoot, "members", "m_b.json");
  const customAvatarProfile = JSON.parse(await fs.readFile(customAvatarProfilePath, "utf8"));
  delete customAvatarProfile.avatarUrl;
  await writeJson(customAvatarProfilePath, customAvatarProfile);
  await fs.rm(path.join(validEmptyAvatarRoot, "uploads", "member-avatars"), { recursive: true, force: true });
  process.env.KD_DATA_DIR = validEmptyAvatarRoot;
  const validEmptyAvatarBackup = await backupModule.createMemberBackup({ source: "test", testOnlyAllowNonProduction: true });
  const validEmptyAvatars = validEmptyAvatarBackup.manifest.datasets.find((item) => item.id === "member_avatars");
  assert.equal(validEmptyAvatarBackup.manifest.validation.criticalDatasetsPresent, false);
  assert.equal(validEmptyAvatarBackup.manifest.validation.criticalDatasetsSatisfied, true);
  assert.deepEqual(
    { required: validEmptyAvatars?.required, present: validEmptyAvatars?.present, empty: validEmptyAvatars?.empty, status: validEmptyAvatars?.status, fileCount: validEmptyAvatars?.fileCount },
    { required: true, present: false, empty: true, status: "valid-empty", fileCount: 0 },
  );

  const missingReferencedAvatarRoot = path.join(workspace, "missing-referenced-avatar");
  await fs.mkdir(missingReferencedAvatarRoot, { recursive: true });
  await prepareFixture(missingReferencedAvatarRoot);
  await fs.rm(path.join(missingReferencedAvatarRoot, "uploads", "member-avatars"), { recursive: true, force: true });
  const referencedProfilePath = path.join(missingReferencedAvatarRoot, "members", "m_a.json");
  const referencedProfile = JSON.parse(await fs.readFile(referencedProfilePath, "utf8"));
  referencedProfile.avatarUrl = "/uploads/member-avatars/m_a/avatar.webp?v=1";
  await writeJson(referencedProfilePath, referencedProfile);
  process.env.KD_DATA_DIR = missingReferencedAvatarRoot;
  await expectReject(
    () => backupModule.createMemberBackup({ source: "test", testOnlyAllowNonProduction: true }),
    /Member avatar dataset is missing while canonical member profiles contain avatarUrl references: m_a/,
  );

  const missingRoot = path.join(workspace, "missing");
  await fs.mkdir(missingRoot, { recursive: true });
  await prepareFixture(missingRoot);
  await fs.rm(path.join(missingRoot, "fulfillment", "settings.json"));
  process.env.KD_DATA_DIR = missingRoot;
  await expectReject(() => backupModule.createMemberBackup({ source: "test", testOnlyAllowNonProduction: true }), /Critical backup dataset is missing/);

  const corruptRoot = path.join(workspace, "corrupt");
  await fs.mkdir(corruptRoot, { recursive: true });
  await prepareFixture(corruptRoot);
  await fs.writeFile(path.join(corruptRoot, "orders", "ORD-1.json"), "{broken");
  process.env.KD_DATA_DIR = corruptRoot;
  await expectReject(() => backupModule.createMemberBackup({ source: "test", testOnlyAllowNonProduction: true }), /Critical backup JSON is unavailable or invalid/);

  const tornRoot = path.join(workspace, "torn");
  await fs.mkdir(tornRoot, { recursive: true });
  await prepareFixture(tornRoot);
  process.env.KD_DATA_DIR = tornRoot;
  await expectReject(() => backupModule.createMemberBackup({ source: "test", testOnlyAllowNonProduction: true, beforeStabilityCheck: async () => writeJson(path.join(tornRoot, "store", "website-data.json"), { changed: true }) }), /Critical source changed during member backup: website_data/);
  const tornEntries = await fs.readdir(path.join(tornRoot, "backups", "members")).catch(() => [] as string[]);
  assert.equal(tornEntries.some((entry) => !entry.startsWith(".staging-")), false);
  assert.equal(tornEntries.some((entry) => entry.startsWith(".staging-")), false);

  const routeSource = await fs.readFile(path.join(process.cwd(), "app/api/admin/member-backups/[backupId]/download/route.ts"), "utf8");
  assert.match(routeSource, /isAdminAuthenticated/);
  assert.match(routeSource, /isValidMemberBackupId/);
  assert.match(routeSource, /getVerifiedMemberBackupForDownload/);
  assert.match(routeSource, /Cache-Control[\s\S]*no-store/);
  assert.doesNotMatch(routeSource, /searchParams|get\(["']path/);
  const adminRoute = await fs.readFile(path.join(process.cwd(), "app/api/admin/member-backups/route.ts"), "utf8");
  assert.doesNotMatch(adminRoute, /pruneMemberBackups/);

  console.log("J.5D.5A-H5 field-aware member search tests: PASS");
  await fs.rm(workspace, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
