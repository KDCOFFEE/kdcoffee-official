import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { MemberBackupSummary } from "../lib/memberBackup";
import {
  applyLocalCronRetention,
  assessMemberBackupStorage,
  calculateReserveFloorBytes,
  DEFAULT_LOCAL_CRON_MAX,
  DEFAULT_MIN_FREE_BYTES,
  DEFAULT_MIN_FREE_PERCENT,
  ensureAutomaticBackupStorage,
  ensureManualBackupStorage,
  estimateNextMemberBackupBytes,
  memberBackupRetentionPolicy,
  MemberBackupStorageError,
  MINIMUM_BACKUP_ESTIMATE_BYTES,
  planGoogleDriveMemberBackupRetention,
  type MemberBackupStorageMetrics,
} from "../lib/memberBackupRetention";
import {
  getGoogleDriveMemberBackupRetentionPlan,
  GoogleDriveMemberBackupError,
  runScheduledMemberBackupOffsiteWorkflow,
} from "../lib/googleDriveMemberBackup";

let passed = 0;
async function check(name: string, operation: () => void | Promise<void>) {
  await operation();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

function backup(index: number, source: "manual_admin" | "railway_cron" = "railway_cron"): MemberBackupSummary {
  const day = String((index % 28) + 1).padStart(2, "0");
  const suffix = index.toString(16).padStart(8, "0").slice(-8);
  return {
    backupId: `202601${day}T010203Z_${suffix}`,
    createdAt: `2026-01-${day}T01:02:03.000Z`,
    completedAt: `2026-01-${day}T01:02:04.000Z`,
    source,
    environment: "production",
    dataRoot: "/data",
    gitCommit: "i2-test",
    status: "verified",
    memberCount: 3,
    activeReferralCount: 1,
    totalReferralCount: 1,
    orderCount: 10,
    bytes: 1_000_000,
    backupLocation: `/data/backups/members/202601${day}T010203Z_${suffix}`,
  };
}

function metrics(status: MemberBackupStorageMetrics["status"], overrides: Partial<MemberBackupStorageMetrics> = {}): MemberBackupStorageMetrics {
  return {
    totalBytes: 500_000_000,
    freeBytes: status === "storage-low" ? 210_000_000 : status === "caution" ? 235_000_000 : 400_000_000,
    backupStorageBytes: 10_000_000,
    manualBackupCount: 0,
    cronBackupCount: 0,
    reserveFloorBytes: 209_715_200,
    estimatedNextBackupBytes: 16_777_216,
    projectedFreeBytes: status === "storage-low" ? 193_222_784 : status === "caution" ? 218_222_784 : 383_222_784,
    status,
    ...overrides,
  };
}

function driveCandidate(index: number, createdTime: string) {
  const backupId = `20260101T010203Z_${index.toString(16).padStart(8, "0").slice(-8)}`;
  return { driveFileId: `drive_file_${String(index).padStart(10, "0")}`, backupId, name: `kdcoffee-member-backup_${backupId}.zip`, createdTime };
}

await check("default local cron maximum is seven", () => {
  assert.equal(DEFAULT_LOCAL_CRON_MAX, 7);
  assert.equal(memberBackupRetentionPolicy({}).localCronMax, 7);
});

await check("default reserve settings are 200 MiB and 35 percent", () => {
  const policy = memberBackupRetentionPolicy({});
  assert.equal(policy.minFreeBytes, DEFAULT_MIN_FREE_BYTES);
  assert.equal(policy.minFreePercent, DEFAULT_MIN_FREE_PERCENT);
});

await check("manual_admin backups are never post-retention candidates", async () => {
  const removed: string[] = [];
  const backups = [backup(1, "manual_admin"), ...Array.from({ length: 9 }, (_, index) => backup(index + 2))];
  await applyLocalCronRetention({
    environment: { MEMBER_BACKUP_LOCAL_MAX_CRON: "7" },
    readState: async () => ({ metrics: metrics("healthy"), backups }),
    verifyOffsite: async () => true,
    removeBackup: async (backupId) => { removed.push(backupId); },
  });
  assert.equal(removed.includes(backups[0].backupId), false);
});

await check("old railway_cron backups can be pruned after offsite verification", async () => {
  const removed: string[] = [];
  const backups = Array.from({ length: 9 }, (_, index) => backup(index + 1));
  await applyLocalCronRetention({
    environment: { MEMBER_BACKUP_LOCAL_MAX_CRON: "7" },
    readState: async () => ({ metrics: metrics("healthy"), backups }),
    verifyOffsite: async () => true,
    removeBackup: async (backupId) => { removed.push(backupId); },
  });
  assert.equal(removed.length, 2);
});

await check("offsite-missing cron backup is never pruned", async () => {
  const removed: string[] = [];
  const backups = Array.from({ length: 8 }, (_, index) => backup(index + 1));
  const result = await applyLocalCronRetention({
    environment: { MEMBER_BACKUP_LOCAL_MAX_CRON: "7" },
    readState: async () => ({ metrics: metrics("healthy"), backups }),
    verifyOffsite: async () => false,
    removeBackup: async (backupId) => { removed.push(backupId); },
  });
  assert.deepEqual(removed, []);
  assert.equal(result.skippedWithoutVerifiedOffsite.length, 1);
});

await check("reserve floor uses max of bytes and percentage", () => {
  assert.equal(calculateReserveFloorBytes({ totalBytes: 1_000_000_000, freeBytes: 0 }, memberBackupRetentionPolicy({})), 350_000_000);
  assert.equal(calculateReserveFloorBytes({ totalBytes: 454_299_648, freeBytes: 0 }, memberBackupRetentionPolicy({})), DEFAULT_MIN_FREE_BYTES);
});

await check("projected free-space calculation subtracts conservative estimate", () => {
  const result = assessMemberBackupStorage({ totalBytes: 1_000_000_000, freeBytes: 500_000_000 }, {
    backupStorageBytes: 10,
    manualBackupCount: 1,
    cronBackupCount: 1,
    newestVerifiedBackupBytes: 10_000_000,
  });
  assert.equal(result.estimatedNextBackupBytes, 25_000_000);
  assert.equal(result.projectedFreeBytes, 475_000_000);
});

await check("backup estimate has fixed minimum and 2.5 multiplier", () => {
  assert.equal(estimateNextMemberBackupBytes(1), MINIMUM_BACKUP_ESTIMATE_BYTES);
  assert.equal(estimateNextMemberBackupBytes(20_000_000), 50_000_000);
});

await check("healthy storage guard allows backup creation", async () => {
  const result = await ensureAutomaticBackupStorage({
    readState: async () => ({ metrics: metrics("healthy"), backups: [] }),
    verifyOffsite: async () => false,
  });
  assert.equal(result.storage.status, "healthy");
  assert.deepEqual(result.removed, []);
});

await check("caution status is calculated above reserve but without full buffer", () => {
  const result = assessMemberBackupStorage({ totalBytes: 454_299_648, freeBytes: 235_000_000 }, {
    backupStorageBytes: 0,
    manualBackupCount: 0,
    cronBackupCount: 0,
    newestVerifiedBackupBytes: 1_000_000,
  });
  assert.equal(result.status, "caution");
});

await check("storage-low blocks automatic backup creation", async () => {
  await assert.rejects(() => ensureAutomaticBackupStorage({
    readState: async () => ({ metrics: metrics("storage-low"), backups: [] }),
    verifyOffsite: async () => false,
  }), (error: unknown) => error instanceof MemberBackupStorageError && error.code === "storage-low");
});

await check("storage-low never removes manual backup", async () => {
  const removed: string[] = [];
  await assert.rejects(() => ensureAutomaticBackupStorage({
    readState: async () => ({ metrics: metrics("storage-low"), backups: [backup(1, "manual_admin")] }),
    verifyOffsite: async () => true,
    removeBackup: async (backupId) => { removed.push(backupId); },
  }), MemberBackupStorageError);
  assert.deepEqual(removed, []);
});

await check("storage reclamation deletion surface receives backup IDs only", async () => {
  const oldCron = backup(1);
  const newestCron = backup(2);
  const states = [
    { metrics: metrics("storage-low"), backups: [newestCron, oldCron] },
    { metrics: metrics("healthy"), backups: [newestCron] },
  ];
  const removed: string[] = [];
  await ensureAutomaticBackupStorage({
    readState: async () => states.shift()!,
    verifyOffsite: async () => true,
    removeBackup: async (backupId) => { assert.match(backupId, /^\d{8}T\d{6}Z_[a-f0-9]{8}$/u); removed.push(backupId); },
  });
  assert.deepEqual(removed, [oldCron.backupId]);
});

await check("pre-create reclamation recalculates free space after each deletion", async () => {
  let reads = 0;
  const oldCron = backup(1);
  const newestCron = backup(2);
  await ensureAutomaticBackupStorage({
    readState: async () => {
      reads += 1;
      return reads === 1
        ? { metrics: metrics("storage-low"), backups: [newestCron, oldCron] }
        : { metrics: metrics("healthy"), backups: [newestCron] };
    },
    verifyOffsite: async () => true,
    removeBackup: async () => undefined,
  });
  assert.equal(reads, 2);
});

await check("post-upload retention keeps newest seven cron backups", async () => {
  const backups = Array.from({ length: 10 }, (_, index) => backup(index + 1));
  const removed: string[] = [];
  const result = await applyLocalCronRetention({
    readState: async () => ({ metrics: metrics("healthy"), backups }),
    verifyOffsite: async () => true,
    removeBackup: async (backupId) => { removed.push(backupId); },
  });
  assert.equal(result.protected.length, 7);
  assert.equal(removed.length, 3);
});

await check("Drive upload failure prevents post-upload local retention", async () => {
  const calls: string[] = [];
  await assert.rejects(() => runScheduledMemberBackupOffsiteWorkflow({
    preflightStorage: async () => { calls.push("preflight"); return null; },
    createBackup: async () => { calls.push("create"); return { manifest: { backupId: backup(1).backupId }, path: "safe" } as never; },
    uploadBackup: async () => { calls.push("upload"); throw new GoogleDriveMemberBackupError("upload-failed", "safe"); },
    pruneBackups: async () => { calls.push("prune"); return {}; },
  }), GoogleDriveMemberBackupError);
  assert.deepEqual(calls, ["preflight", "create", "upload"]);
});

await check("Drive rolling retention keeps latest thirty", () => {
  const candidates = Array.from({ length: 40 }, (_, index) => driveCandidate(index, new Date(Date.UTC(2026, 8, 30 - index)).toISOString()));
  const plan = planGoogleDriveMemberBackupRetention({ candidates, now: new Date("2026-09-30T12:00:00Z") });
  const retained = new Set(plan.retain.map((item) => item.driveFileId));
  for (const item of candidates.slice(0, 30)) assert.equal(retained.has(item.driveFileId), true);
  assert.equal(plan.retain.length, 31); // One older August item is also the monthly archive.
  assert.equal(plan.deleteCandidates.length, 9);
});

await check("Drive monthly retention keeps one latest backup per month", () => {
  const candidates = Array.from({ length: 15 }, (_, index) => driveCandidate(index, new Date(Date.UTC(2026, 8 - index, 20)).toISOString()));
  const plan = planGoogleDriveMemberBackupRetention({ candidates, now: new Date("2026-09-30T12:00:00Z"), dailyKeep: 1, monthlyKeep: 12 });
  assert.equal(plan.retain.length, 12);
});

await check("Drive monthly retention is limited to latest twelve UTC months", () => {
  const candidates = Array.from({ length: 15 }, (_, index) => driveCandidate(index, new Date(Date.UTC(2026, 8 - index, 20)).toISOString()));
  const plan = planGoogleDriveMemberBackupRetention({ candidates, now: new Date("2026-09-30T12:00:00Z"), dailyKeep: 1, monthlyKeep: 12 });
  assert.equal(plan.convention, "UTC");
  assert.equal(plan.deleteCandidates.length, 3);
});

await check("one Drive object can satisfy daily and monthly retention", () => {
  const item = driveCandidate(1, "2026-09-20T00:00:00.000Z");
  const plan = planGoogleDriveMemberBackupRetention({ candidates: [item], now: new Date("2026-09-30T12:00:00Z") });
  assert.deepEqual(plan.retain, [item]);
});

const driveFolderId = "drive_folder_1234567890";
const driveEnvironment = {
  GOOGLE_DRIVE_CLIENT_ID: "client-id-marker",
  GOOGLE_DRIVE_CLIENT_SECRET: "client-secret-marker",
  GOOGLE_DRIVE_REFRESH_TOKEN: "refresh-token-marker",
  GOOGLE_DRIVE_BACKUP_FOLDER_ID: driveFolderId,
};

function retentionDriveFile(overrides: Record<string, unknown> = {}) {
  const backupId = "20260101T010203Z_1234abcd";
  return {
    id: "drive_file_1234567890",
    name: `kdcoffee-member-backup_${backupId}.zip`,
    size: "100",
    createdTime: "2026-01-01T01:02:03.000Z",
    mimeType: "application/zip",
    parents: [driveFolderId],
    appProperties: {
      kdBackupId: backupId,
      kdBackupType: "member-backup",
      kdSource: "railway_cron",
      kdEnvironment: "production",
      kdGitCommit: "i2-test",
      kdCreatedAt: "2026-01-01T01:02:03.000Z",
    },
    ...overrides,
  };
}

function retentionFetcher(files: unknown[], calls: Array<{ url: string; method: string }> = []) {
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, method: init.method ?? "GET" });
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "token-marker" });
    if (url.startsWith("https://www.googleapis.com/drive/v3/files?")) return Response.json({ files });
    throw new Error(`Unexpected URL: ${url}`);
  };
  return fetcher;
}

await check("unknown Drive file is ignored and never a delete candidate", async () => {
  const plan = await getGoogleDriveMemberBackupRetentionPlan({ fetcher: retentionFetcher([{ id: "unknown_file_12345", name: "notes.txt", size: "12", parents: [driveFolderId] }]), environment: driveEnvironment, localBackups: [] });
  assert.equal(plan.ignoredUnknown.length, 1);
  assert.equal(plan.deleteCandidates.length, 0);
});

await check("wrong-folder Drive file is never deletable", async () => {
  const plan = await getGoogleDriveMemberBackupRetentionPlan({ fetcher: retentionFetcher([retentionDriveFile({ parents: ["another_folder_12345"] })]), environment: driveEnvironment, localBackups: [] });
  assert.equal(plan.ignoredUnknown[0].reason, "wrong-folder");
});

await check("Drive file missing kdBackupType is never deletable", async () => {
  const file = retentionDriveFile();
  (file.appProperties as Record<string, string>).kdBackupType = "";
  const plan = await getGoogleDriveMemberBackupRetentionPlan({ fetcher: retentionFetcher([file]), environment: driveEnvironment, localBackups: [] });
  assert.equal(plan.ignoredUnknown[0].reason, "missing-or-wrong-backup-type");
});

await check("malformed Drive metadata is never deletable", async () => {
  const plan = await getGoogleDriveMemberBackupRetentionPlan({ fetcher: retentionFetcher([{ id: "short" }]), environment: driveEnvironment, localBackups: [] });
  assert.equal(plan.ignoredUnknown[0].reason, "malformed-metadata");
});

await check("currently local backup protects its canonical offsite object", () => {
  const item = driveCandidate(1, "2025-01-01T00:00:00.000Z");
  const plan = planGoogleDriveMemberBackupRetention({ candidates: [item], protectedLocalBackupIds: [item.backupId], dailyKeep: 1, monthlyKeep: 1, now: new Date("2026-09-30T00:00:00Z") });
  assert.deepEqual(plan.protected, [item]);
  assert.equal(plan.deleteCandidates.length, 0);
});

await check("Drive dry-run plan is deterministic", () => {
  const candidates = [driveCandidate(2, "2026-08-01T00:00:00Z"), driveCandidate(1, "2026-09-01T00:00:00Z")];
  const left = planGoogleDriveMemberBackupRetention({ candidates, now: new Date("2026-09-30T00:00:00Z") });
  const right = planGoogleDriveMemberBackupRetention({ candidates: [...candidates].reverse(), now: new Date("2026-09-30T00:00:00Z") });
  assert.deepEqual(left, right);
});

await check("Drive dry-run makes zero DELETE API calls", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const plan = await getGoogleDriveMemberBackupRetentionPlan({ fetcher: retentionFetcher([retentionDriveFile()], calls), environment: driveEnvironment, localBackups: [] });
  assert.equal(plan.dryRun, true);
  assert.equal(calls.some((call) => call.method === "DELETE"), false);
});

await check("manual backup storage guard blocks without pruning anything", async () => {
  await assert.rejects(() => ensureManualBackupStorage({
    readState: async () => ({ metrics: metrics("storage-low"), backups: [backup(1, "manual_admin")] }),
  }), (error: unknown) => error instanceof MemberBackupStorageError && error.code === "manual-backup-space-risk");
});

await check("safe storage metrics contain no PII secrets or filesystem paths", () => {
  const serialized = JSON.stringify(metrics("healthy"));
  assert.doesNotMatch(serialized, /memberId|phone|email|refresh|secret|\/data|backupLocation/iu);
});

await check("I1 upload idempotency contract remains present", async () => {
  const source = await readFile(path.join(process.cwd(), "lib", "googleDriveMemberBackup.ts"), "utf8");
  assert.match(source, /uploadInFlight/u);
  assert.match(source, /findExistingDriveFile/u);
  assert.match(source, /kdBackupId/u);
});

await check("canonical J.5D.5A verification remains the upload boundary", async () => {
  const source = await readFile(path.join(process.cwd(), "lib", "googleDriveMemberBackup.ts"), "utf8");
  assert.match(source, /getVerifiedMemberBackupForDownload/u);
  assert.match(source, /createMemberBackupZipArtifact/u);
  assert.doesNotMatch(source, /arbitraryPath|userSuppliedPath/u);
});

await check("Admin storage API exposes no-store metrics without Drive upload", async () => {
  const source = await readFile(path.join(process.cwd(), "app", "api", "admin", "member-backups", "route.ts"), "utf8");
  assert.match(source, /readMemberBackupStorageMetrics/u);
  assert.match(source, /Cache-Control.*no-store/u);
  assert.doesNotMatch(source, /uploadVerifiedMemberBackupToGoogleDrive/u);
});

await check("automatic workflow orders preflight before create and pruning after upload", async () => {
  const calls: string[] = [];
  await runScheduledMemberBackupOffsiteWorkflow({
    preflightStorage: async () => { calls.push("preflight"); return null; },
    createBackup: async () => { calls.push("create"); return { manifest: { backupId: backup(1).backupId }, path: "safe" } as never; },
    uploadBackup: async () => { calls.push("upload"); return { status: "uploaded", backupId: backup(1).backupId } as never; },
    pruneBackups: async () => { calls.push("prune"); return {}; },
    driveRetentionPlan: async () => { calls.push("drive-plan"); return null; },
    finalStorage: async () => { calls.push("final-storage"); return null; },
  });
  assert.deepEqual(calls, ["preflight", "create", "upload", "prune", "drive-plan", "final-storage"]);
});

await check("Drive retention is dry-run only and contains no deletion implementation", async () => {
  const source = await readFile(path.join(process.cwd(), "lib", "googleDriveMemberBackup.ts"), "utf8");
  assert.doesNotMatch(source, /method:\s*["']DELETE["']/u);
});

await check("Drive retention inventory failure does not invalidate a verified uploaded backup", async () => {
  const result = await runScheduledMemberBackupOffsiteWorkflow({
    preflightStorage: async () => null,
    createBackup: async () => ({ manifest: { backupId: backup(1).backupId }, path: "safe" }) as never,
    uploadBackup: async () => ({ status: "uploaded", backupId: backup(1).backupId }) as never,
    pruneBackups: async () => ({ removed: [] }),
    driveRetentionPlan: async () => { throw new GoogleDriveMemberBackupError("folder-unavailable", "safe"); },
    finalStorage: async () => null,
  });
  assert.deepEqual(result.driveRetention, { dryRun: true, status: "unavailable", code: "folder-unavailable" });
});

assert.equal(passed, 35);
console.log(`\nPHASE J.5D.5B-I2: ${passed}/35 PASS`);
