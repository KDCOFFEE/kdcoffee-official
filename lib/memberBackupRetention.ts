import { promises as fs } from "node:fs";
import path from "node:path";

import {
  listMemberBackups,
  removeVerifiedRailwayCronBackup,
  type MemberBackupSummary,
} from "./memberBackup";
import { getBackupsDir, getPersistentDataRoot } from "./storagePaths";

const MIB = 1024 * 1024;

export const DEFAULT_LOCAL_CRON_MAX = 7;
export const DEFAULT_MIN_FREE_BYTES = 200 * MIB;
export const DEFAULT_MIN_FREE_PERCENT = 35;
export const MINIMUM_BACKUP_ESTIMATE_BYTES = 16 * MIB;
export const BACKUP_ESTIMATE_MULTIPLIER = 2.5;
export const LOCAL_CRON_SAFETY_COPIES = 1;
export const DRIVE_DAILY_RETENTION_COUNT = 30;
export const DRIVE_MONTHLY_RETENTION_MONTHS = 12;

type RetentionEnvironment = Readonly<Record<string, string | undefined>>;

export type MemberBackupRetentionPolicy = {
  localCronMax: number;
  minFreeBytes: number;
  minFreePercent: number;
};

export type FilesystemCapacity = {
  totalBytes: number;
  freeBytes: number;
};

export type MemberBackupStorageStatus = "healthy" | "caution" | "storage-low";

export type MemberBackupStorageMetrics = FilesystemCapacity & {
  backupStorageBytes: number;
  manualBackupCount: number;
  cronBackupCount: number;
  reserveFloorBytes: number;
  estimatedNextBackupBytes: number;
  projectedFreeBytes: number;
  status: MemberBackupStorageStatus;
};

type MemberBackupStorageState = {
  metrics: MemberBackupStorageMetrics;
  backups: MemberBackupSummary[];
};

export type LocalRetentionResult = {
  removed: string[];
  protected: string[];
  skippedWithoutVerifiedOffsite: string[];
  storage: MemberBackupStorageMetrics;
};

export class MemberBackupStorageError extends Error {
  readonly code: "storage-low" | "manual-backup-space-risk";
  readonly metrics: MemberBackupStorageMetrics;
  readonly eligibleCronBackupCount: number;

  constructor(
    code: "storage-low" | "manual-backup-space-risk",
    message: string,
    metrics: MemberBackupStorageMetrics,
    eligibleCronBackupCount = 0,
  ) {
    super(message);
    this.name = "MemberBackupStorageError";
    this.code = code;
    this.metrics = metrics;
    this.eligibleCronBackupCount = eligibleCronBackupCount;
  }
}

function integerSetting(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.floor(parsed))) : fallback;
}

export function memberBackupRetentionPolicy(environment: RetentionEnvironment = process.env): MemberBackupRetentionPolicy {
  return {
    localCronMax: integerSetting(environment.MEMBER_BACKUP_LOCAL_MAX_CRON, DEFAULT_LOCAL_CRON_MAX, 1, 100),
    minFreeBytes: integerSetting(environment.MEMBER_BACKUP_MIN_FREE_BYTES, DEFAULT_MIN_FREE_BYTES, 64 * MIB, Number.MAX_SAFE_INTEGER),
    minFreePercent: integerSetting(environment.MEMBER_BACKUP_MIN_FREE_PERCENT, DEFAULT_MIN_FREE_PERCENT, 10, 90),
  };
}

export function calculateReserveFloorBytes(capacity: FilesystemCapacity, policy: MemberBackupRetentionPolicy) {
  return Math.max(policy.minFreeBytes, Math.ceil(capacity.totalBytes * (policy.minFreePercent / 100)));
}

export function estimateNextMemberBackupBytes(newestVerifiedBackupBytes = 0) {
  const baseline = Number.isFinite(newestVerifiedBackupBytes) ? Math.max(0, newestVerifiedBackupBytes) : 0;
  return Math.max(MINIMUM_BACKUP_ESTIMATE_BYTES, Math.ceil(baseline * BACKUP_ESTIMATE_MULTIPLIER));
}

export function assessMemberBackupStorage(
  capacity: FilesystemCapacity,
  input: {
    backupStorageBytes: number;
    manualBackupCount: number;
    cronBackupCount: number;
    newestVerifiedBackupBytes?: number;
    policy?: MemberBackupRetentionPolicy;
  },
): MemberBackupStorageMetrics {
  const policy = input.policy ?? memberBackupRetentionPolicy();
  const reserveFloorBytes = calculateReserveFloorBytes(capacity, policy);
  const estimatedNextBackupBytes = estimateNextMemberBackupBytes(input.newestVerifiedBackupBytes);
  const projectedFreeBytes = Math.max(0, capacity.freeBytes - estimatedNextBackupBytes);
  const status: MemberBackupStorageStatus = projectedFreeBytes < reserveFloorBytes
    ? "storage-low"
    : projectedFreeBytes < reserveFloorBytes + estimatedNextBackupBytes
      ? "caution"
      : "healthy";
  return {
    ...capacity,
    backupStorageBytes: input.backupStorageBytes,
    manualBackupCount: input.manualBackupCount,
    cronBackupCount: input.cronBackupCount,
    reserveFloorBytes,
    estimatedNextBackupBytes,
    projectedFreeBytes,
    status,
  };
}

async function directoryBytes(directory: string): Promise<number> {
  const stat = await fs.lstat(directory).catch(() => null);
  if (!stat) return 0;
  if (stat.isSymbolicLink()) throw new Error("Member backup storage metrics refuse symbolic links");
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;
  let bytes = 0;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    bytes += await directoryBytes(path.join(directory, entry.name));
  }
  return bytes;
}

export async function readMemberBackupStorageState(options: {
  environment?: RetentionEnvironment;
  testOnlyAllowNonProduction?: boolean;
  capacity?: FilesystemCapacity;
} = {}): Promise<MemberBackupStorageState> {
  const backups = await listMemberBackups({ testOnlyAllowNonProduction: options.testOnlyAllowNonProduction });
  const dataRoot = getPersistentDataRoot();
  if (!dataRoot) throw new Error("Persistent data root is unavailable for member backup storage metrics");
  let capacity = options.capacity;
  if (!capacity) {
    const stats = await fs.statfs(dataRoot, { bigint: true });
    const totalBytes = Number(stats.bsize * stats.blocks);
    const freeBytes = Number(stats.bsize * stats.bavail);
    if (!Number.isSafeInteger(totalBytes) || !Number.isSafeInteger(freeBytes) || totalBytes <= 0 || freeBytes < 0) {
      throw new Error("Persistent filesystem capacity could not be determined safely");
    }
    capacity = { totalBytes, freeBytes };
  }
  const backupStorageBytes = await directoryBytes(path.join(getBackupsDir(), "members"));
  const newest = backups[0];
  const metrics = assessMemberBackupStorage(capacity, {
    backupStorageBytes,
    manualBackupCount: backups.filter((backup) => backup.source === "manual_admin").length,
    cronBackupCount: backups.filter((backup) => backup.source === "railway_cron").length,
    newestVerifiedBackupBytes: newest?.bytes ?? 0,
    policy: memberBackupRetentionPolicy(options.environment),
  });
  return { metrics, backups };
}

export async function readMemberBackupStorageMetrics(options: Parameters<typeof readMemberBackupStorageState>[0] = {}) {
  return (await readMemberBackupStorageState(options)).metrics;
}

type LocalRetentionDependencies = {
  environment?: RetentionEnvironment;
  testOnlyAllowNonProduction?: boolean;
  readState?: () => Promise<MemberBackupStorageState>;
  verifyOffsite: (backup: MemberBackupSummary) => Promise<boolean>;
  removeBackup?: (backupId: string) => Promise<unknown>;
};

function cronBackupsNewestFirst(backups: MemberBackupSummary[]) {
  return backups
    .filter((backup) => backup.source === "railway_cron")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function ensureAutomaticBackupStorage(input: LocalRetentionDependencies): Promise<LocalRetentionResult> {
  const readState = input.readState ?? (() => readMemberBackupStorageState({ environment: input.environment, testOnlyAllowNonProduction: input.testOnlyAllowNonProduction }));
  const removeBackup = input.removeBackup ?? ((backupId: string) => removeVerifiedRailwayCronBackup(backupId, { testOnlyAllowNonProduction: input.testOnlyAllowNonProduction }));
  let state = await readState();
  const removed: string[] = [];
  const protectedIds: string[] = [];
  const skippedWithoutVerifiedOffsite: string[] = [];
  let eligibleCronBackupCount = 0;
  if (state.metrics.status !== "storage-low") return { removed, protected: protectedIds, skippedWithoutVerifiedOffsite, storage: state.metrics };

  const cron = cronBackupsNewestFirst(state.backups);
  protectedIds.push(...cron.slice(0, LOCAL_CRON_SAFETY_COPIES).map((backup) => backup.backupId));
  const candidates = cron.slice(LOCAL_CRON_SAFETY_COPIES).reverse();
  for (const backup of candidates) {
    if (state.metrics.status !== "storage-low") break;
    let verifiedOffsite = false;
    try { verifiedOffsite = await input.verifyOffsite(backup); }
    catch { verifiedOffsite = false; }
    if (!verifiedOffsite) {
      skippedWithoutVerifiedOffsite.push(backup.backupId);
      continue;
    }
    eligibleCronBackupCount += 1;
    await removeBackup(backup.backupId);
    removed.push(backup.backupId);
    state = await readState();
  }
  if (state.metrics.status === "storage-low") {
    throw new MemberBackupStorageError(
      "storage-low",
      "Insufficient safe persistent storage for an automatic member backup",
      state.metrics,
      eligibleCronBackupCount,
    );
  }
  return { removed, protected: protectedIds, skippedWithoutVerifiedOffsite, storage: state.metrics };
}

export async function ensureManualBackupStorage(options: {
  environment?: RetentionEnvironment;
  testOnlyAllowNonProduction?: boolean;
  readState?: () => Promise<MemberBackupStorageState>;
} = {}) {
  const state = await (options.readState ?? (() => readMemberBackupStorageState({ environment: options.environment, testOnlyAllowNonProduction: options.testOnlyAllowNonProduction })))();
  if (state.metrics.status === "storage-low") {
    throw new MemberBackupStorageError(
      "manual-backup-space-risk",
      "Insufficient safe persistent storage for another manual member backup",
      state.metrics,
      0,
    );
  }
  return state.metrics;
}

export async function applyLocalCronRetention(input: LocalRetentionDependencies): Promise<LocalRetentionResult> {
  const readState = input.readState ?? (() => readMemberBackupStorageState({ environment: input.environment, testOnlyAllowNonProduction: input.testOnlyAllowNonProduction }));
  const removeBackup = input.removeBackup ?? ((backupId: string) => removeVerifiedRailwayCronBackup(backupId, { testOnlyAllowNonProduction: input.testOnlyAllowNonProduction }));
  const policy = memberBackupRetentionPolicy(input.environment);
  let state = await readState();
  const cron = cronBackupsNewestFirst(state.backups);
  const protectedIds = cron.slice(0, policy.localCronMax).map((backup) => backup.backupId);
  const removed: string[] = [];
  const skippedWithoutVerifiedOffsite: string[] = [];
  for (const backup of cron.slice(policy.localCronMax).reverse()) {
    let verifiedOffsite = false;
    try { verifiedOffsite = await input.verifyOffsite(backup); }
    catch { verifiedOffsite = false; }
    if (!verifiedOffsite) {
      skippedWithoutVerifiedOffsite.push(backup.backupId);
      continue;
    }
    await removeBackup(backup.backupId);
    removed.push(backup.backupId);
    state = await readState();
  }
  return { removed, protected: protectedIds, skippedWithoutVerifiedOffsite, storage: state.metrics };
}

export type DriveRetentionCandidate = {
  driveFileId: string;
  backupId: string;
  name: string;
  createdTime: string;
};

export type DriveRetentionPlan = {
  convention: "UTC";
  dryRun: true;
  retain: DriveRetentionCandidate[];
  deleteCandidates: DriveRetentionCandidate[];
  protected: DriveRetentionCandidate[];
  ignoredUnknown: Array<{ driveFileId: string | null; name: string | null; reason: string }>;
};

function utcMonthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function planGoogleDriveMemberBackupRetention(input: {
  candidates: DriveRetentionCandidate[];
  ignoredUnknown?: DriveRetentionPlan["ignoredUnknown"];
  protectedLocalBackupIds?: Iterable<string>;
  now?: Date;
  dailyKeep?: number;
  monthlyKeep?: number;
}): DriveRetentionPlan {
  const now = input.now ?? new Date();
  const dailyKeep = Math.max(1, Math.floor(input.dailyKeep ?? DRIVE_DAILY_RETENTION_COUNT));
  const monthlyKeep = Math.max(1, Math.floor(input.monthlyKeep ?? DRIVE_MONTHLY_RETENTION_MONTHS));
  const protectedLocal = new Set(input.protectedLocalBackupIds ?? []);
  const ordered = [...input.candidates].sort((left, right) => right.createdTime.localeCompare(left.createdTime) || left.backupId.localeCompare(right.backupId));
  const retainIds = new Set(ordered.slice(0, dailyKeep).map((item) => item.driveFileId));
  const protectedIds = new Set(ordered.filter((item) => protectedLocal.has(item.backupId)).map((item) => item.driveFileId));
  const allowedMonths = new Set<string>();
  for (let index = 0; index < monthlyKeep; index += 1) {
    allowedMonths.add(utcMonthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1))));
  }
  const selectedMonths = new Set<string>();
  for (const item of ordered) {
    const created = new Date(item.createdTime);
    if (!Number.isFinite(created.getTime())) continue;
    const month = utcMonthKey(created);
    if (allowedMonths.has(month) && !selectedMonths.has(month)) {
      retainIds.add(item.driveFileId);
      selectedMonths.add(month);
    }
  }
  const retain = ordered.filter((item) => retainIds.has(item.driveFileId));
  const protectedItems = ordered.filter((item) => protectedIds.has(item.driveFileId));
  const deleteCandidates = ordered.filter((item) => !retainIds.has(item.driveFileId) && !protectedIds.has(item.driveFileId));
  return {
    convention: "UTC",
    dryRun: true,
    retain,
    deleteCandidates,
    protected: protectedItems,
    ignoredUnknown: [...(input.ignoredUnknown ?? [])],
  };
}
