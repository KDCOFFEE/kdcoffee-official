import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";

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
    { id: "m_a", displayName: "A", email: "a@example.test", createdAt: now, updatedAt: now },
    { id: "m_b", displayName: "B", email: "b@example.test", createdAt: now, updatedAt: now },
    { id: "m_c", displayName: "C", email: "c@example.test", createdAt: now, updatedAt: now },
  ]) await writeJson(path.join(root, "members", `${member.id}.json`), member);

  await writeJson(path.join(root, "member-identity", "registry.json"), {
    schemaVersion: 1, revision: 7, nextMemberSequence: 4, createdAt: now, updatedAt: now,
    members: {
      m_a: { memberId: "m_a", memberNumber: "196200001", status: "active", createdAt: now, updatedAt: now },
      m_b: { memberId: "m_b", memberNumber: "196200002", status: "active", createdAt: now, updatedAt: now },
      m_c: { memberId: "m_c", memberNumber: "196200003", status: "active", createdAt: now, updatedAt: now },
    }, identities: {}, legacyAliases: {}, linkTransactions: {}, auditLog: [],
  });
  await writeJson(path.join(root, "membership-commerce", "commerce-state.json"), {
    schemaVersion: 1, revision: 11, createdAt: now, updatedAt: now,
    subscriptions: { sub1: { subscriptionId: "sub1" } }, cycles: {},
    referrals: {
      r1: { relationshipId: "r1", referrerMemberId: "m_a", referredMemberId: "m_b", status: "registered", createdAt: now },
      r2: { relationshipId: "r2", referrerMemberId: "m_b", referredMemberId: "m_c", status: "qualified", createdAt: now },
    },
    referralConversions: {}, referralRewards: { rr1: { rewardId: "rr1" } }, validConsumptionEvents: {}, qualificationRounds: {}, referralRewardCoverages: {}, referralRewardMaturations: {},
    creditEntries: { c1: { creditEntryId: "c1" } }, creditReservations: { cr1: { reservationId: "cr1" } }, events: [], notifications: [], audit: [], idempotency: {},
  });
  await writeJson(path.join(root, "membership-commerce", "business-rules.json"), { schemaVersion: 1, revision: 3 });
  await writeJson(path.join(root, "orders", "ORD-1.json"), { orderNumber: "ORD-1", memberId: "m_b", total: 475 });
  await writeJson(path.join(root, "fulfillment", "state.json"), { schemaVersion: 1, revision: 5, records: { "ORD-1": { currentState: "completed" } } });
  await writeJson(path.join(root, "fulfillment", "settings.json"), { schemaVersion: 1, revision: 2, pickupDeadlineDays: 7 });
  await writeJson(path.join(root, "store", "website-data.json"), { menu: { products: [] }, revision: 9 });
  await fs.writeFile(path.join(root, "uploads", "member-avatars", "m_a", "avatar.webp"), Buffer.from([1, 2, 3, 4]));
  await fs.writeFile(path.join(root, "uploads", "order-notifications", "ORD-1.png"), Buffer.from([5, 6, 7]));
}

async function expectReject(run: () => Promise<unknown>, pattern: RegExp) {
  await assert.rejects(run, pattern);
}

async function main() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j5d5a-"));
  const root = path.join(workspace, "complete");
  await fs.mkdir(root, { recursive: true });
  await prepareFixture(root);
  Object.assign(process.env, { NODE_ENV: "test", KD_DATA_DIR: root, RAILWAY_GIT_COMMIT_SHA: "e7bf9d5-test" });
  delete process.env.RAILWAY_VOLUME_MOUNT_PATH;

  const backupModule = await import("../lib/memberBackup");
  assert.deepEqual(backupModule.validateProductionBackupProvenance({ nodeEnv: "production", kdDataDir: "/data", railwayVolumeMountPath: "/data", contract: { root: "/data", source: "KD_DATA_DIR", railwayMountPath: "/data" } }), []);
  assert.ok(backupModule.validateProductionBackupProvenance({ nodeEnv: "production", kdDataDir: root, railwayVolumeMountPath: "/data", contract: { root, source: "KD_DATA_DIR", railwayMountPath: "/data" } }).length >= 1);
  await expectReject(() => backupModule.createMemberBackup({ source: "manual_admin" }), /Production member backup refused/);
  await expectReject(() => backupModule.createMemberBackup({ source: "manual_admin", testOnlyAllowNonProduction: true }), /test override is allowed only/);

  const result = await backupModule.createMemberBackup({ source: "test", now: new Date(now), testOnlyAllowNonProduction: true });
  const manifest = result.manifest;
  assert.equal(manifest.status, "verified");
  assert.equal(manifest.backupVersion, "J.5D.5A-v1");
  assert.equal(manifest.environment, "test");
  assert.equal(manifest.dataRoot.replaceAll("\\", "/"), root.replaceAll("\\", "/"));
  assert.equal(manifest.gitCommit, "e7bf9d5-test");
  assert.equal(manifest.counts.canonicalMembers, 3);
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

  for (const required of [
    "manifest.json", "checksums.sha256", "organization-tree.json", "organization.html", "readable/members.csv", "readable/organization.csv",
    "raw/member-identity/registry.json", "raw/membership-commerce/commerce-state.json", "raw/membership-commerce/business-rules.json", "raw/orders/ORD-1.json",
    "raw/fulfillment/state.json", "raw/fulfillment/settings.json", "raw/store/website-data.json", "raw/uploads/member-avatars/m_a/avatar.webp", "raw/uploads/order-notifications/ORD-1.png",
  ]) await fs.access(path.join(result.path, ...required.split("/")));

  const tree = JSON.parse(await fs.readFile(path.join(result.path, "organization-tree.json"), "utf8"));
  assert.deepEqual(tree.roots, ["m_a"]);
  assert.equal(tree.nodes.find((node: { memberId: string }) => node.memberId === "m_a").teamCount, 2);
  assert.equal(tree.nodes.find((node: { memberId: string }) => node.memberId === "m_b").depth, 1);
  assert.equal(tree.validation.valid, true);
  const html = await fs.readFile(path.join(result.path, "organization.html"), "utf8");
  assert.match(html, /196200001/);
  assert.match(html, /搜尋會員編號/);
  assert.match(html, /回到 root/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.doesNotMatch(html, /fetch\s*\(/);

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
  const zipStream = await backupModule.createMemberBackupZipStream(verified);
  const zipChunks: Buffer[] = [];
  for await (const chunk of Readable.fromWeb(zipStream as never)) zipChunks.push(Buffer.from(chunk));
  const zip = Buffer.concat(zipChunks);
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

  console.log("J.5D.5A production-proof member backup tests: PASS");
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
