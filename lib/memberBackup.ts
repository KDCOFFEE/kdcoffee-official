import { createHash, randomBytes } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Readable } from "node:stream";

import {
  getBackupsDir,
  getFulfillmentSettingsFile,
  getFulfillmentStateFile,
  getMemberIdentityRegistryFile,
  getMembersDir,
  getMembershipCommerceStateFile,
  getMembershipRulesFile,
  getOrderNotificationUploadsDir,
  getOrdersDir,
  getPersistentDataRoot,
  getStorageRootContract,
  getUploadsRoot,
  getWebsiteDataFile,
  type StorageRootContract,
} from "./storagePaths";

const packageJson = createRequire(import.meta.url)("../package.json") as { version: string };

export const MEMBER_BACKUP_FORMAT_VERSION = 2 as const;
export const MEMBER_BACKUP_VERSION = "J.5D.5A-v1" as const;

type JsonRecord = Record<string, unknown>;
type BackupSource = "manual_admin" | "railway_cron" | "test";
type BackupEnvironment = "production" | "test";

export type OrganizationFinding = {
  type: "duplicate_member_id" | "missing_parent" | "missing_child" | "orphan" | "self_referral" | "cycle" | "multiple_active_parent" | "root_correctness";
  severity: "warning" | "error";
  memberId?: string;
  relationshipId?: string;
  message: string;
};

export type OrganizationTreeNode = {
  memberId: string;
  memberNumber: string;
  parentId: string | null;
  childrenIds: string[];
  depth: number | null;
  directReferralCount: number;
  teamCount: number;
  descendantCount: number;
  relationshipStatus: string;
};

type OrganizationRelationshipRow = {
  relationshipId: string;
  referrerMemberId: string;
  referrerMemberNumber: string;
  referredMemberId: string;
  referredMemberNumber: string;
  status: string;
  createdAt: string;
};

export type OrganizationTreeSnapshot = {
  formatVersion: 1;
  createdAt: string;
  relationSource: "membership-commerce/commerce-state.json#referrals";
  roots: string[];
  nodes: OrganizationTreeNode[];
  relationships: OrganizationRelationshipRow[];
  validation: {
    valid: boolean;
    findingCounts: Record<OrganizationFinding["type"], number>;
    findings: OrganizationFinding[];
  };
};

type DatasetId =
  | "members"
  | "member_identity"
  | "membership_commerce"
  | "membership_business_rules"
  | "orders"
  | "fulfillment_state"
  | "fulfillment_settings"
  | "member_avatars"
  | "order_notifications"
  | "website_data";

export type MemberBackupManifest = {
  formatVersion: typeof MEMBER_BACKUP_FORMAT_VERSION;
  backupVersion: typeof MEMBER_BACKUP_VERSION;
  backupId: string;
  createdAt: string;
  completedAt: string;
  source: BackupSource;
  environment: BackupEnvironment;
  dataRoot: string;
  storageRootSource: StorageRootContract["source"];
  railwayVolumeMountPath: string | null;
  railwayDeploymentId: string | null;
  gitCommit: string;
  appVersion: string;
  backupLocation: string;
  status: "verified";
  counts: {
    memberFiles: number;
    members: number;
    canonicalMembers: number;
    activeReferrals: number;
    totalReferrals: number;
    roots: number;
    orphans: number;
    subscriptions: number;
    creditEntries: number;
    creditReservations: number;
    rewardEntries: number;
    ledgerEntries: number;
    orders: number;
    fulfillmentRecords: number;
  };
  sourceRevisions: {
    identityRevision: number | null;
    commerceRevision: number | null;
    businessRulesRevision: number | null;
    fulfillmentRevision: number | null;
  };
  datasets: Array<{
    id: DatasetId;
    sourcePath: string;
    backupPath: string;
    kind: "file" | "directory";
    fileCount: number;
    byteCount: number;
    contentSha256: string;
  }>;
  files: Array<{ path: string; sha256: string; bytes: number }>;
  validation: {
    criticalDatasetsPresent: true;
    jsonReadable: true;
    sourceStableDuringSnapshot: true;
    copiedContentMatchesSource: true;
    checksumsVerified: true;
    organizationGraphValid: boolean;
    organizationFindingCount: number;
    summary: string;
  };
};

export type MemberBackupSummary = {
  backupId: string;
  createdAt: string;
  completedAt: string;
  source: BackupSource;
  environment: BackupEnvironment;
  dataRoot: string;
  gitCommit: string;
  status: "verified";
  memberCount: number;
  activeReferralCount: number;
  totalReferralCount: number;
  orderCount: number;
  bytes: number;
  backupLocation: string;
};

type DatasetSpec = {
  id: DatasetId;
  sourcePath: string;
  backupPath: string;
  kind: "file" | "directory";
  validateJson: "single" | "all-json" | "none";
};

type SnapshotFile = {
  sourcePath: string;
  relativePath: string;
  backupPath: string;
  bytes: number;
  sha256: string;
};

type DatasetSnapshot = {
  spec: DatasetSpec;
  files: SnapshotFile[];
  contentSha256: string;
  byteCount: number;
};

type SnapshotCatalog = {
  datasets: DatasetSnapshot[];
  parsedJson: Map<string, unknown>;
};

export type VerifiedMemberBackup = {
  directory: string;
  manifest: MemberBackupManifest;
  files: Array<{ absolutePath: string; archivePath: string; bytes: number }>;
};

export type MemberBackupOptions = {
  source?: BackupSource;
  now?: Date;
  /** Explicitly test-only. Production routes never expose or pass this option. */
  testOnlyAllowNonProduction?: boolean;
  beforeStabilityCheck?: () => void | Promise<void>;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function entriesRecord(value: unknown): Array<[string, JsonRecord]> {
  return Object.entries(asRecord(value)).map(([key, item]) => [key, asRecord(item)]);
}

function sha256(bytes: Uint8Array | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function normalizeSlashes(value: string) {
  return value.replaceAll("\\", "/");
}

function safeRelativePath(value: string) {
  const normalized = normalizeSlashes(value);
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Unsafe backup path: ${value}`);
  }
  return normalized;
}

function joinBackupPath(root: string, relativePath: string) {
  return path.join(root, ...safeRelativePath(relativePath).split("/"));
}

function pathInside(root: string, candidate: string) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function backupRoot() {
  return path.join(getBackupsDir(), "members");
}

function backupIdFor(date: Date) {
  const iso = date.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
  return `${iso}_${randomBytes(4).toString("hex")}`;
}

export function isValidMemberBackupId(value: string) {
  return /^\d{8}T\d{6}Z_[a-f0-9]{8}$/u.test(value);
}

export function validateProductionBackupProvenance(input: {
  nodeEnv?: string;
  kdDataDir?: string;
  railwayVolumeMountPath?: string;
  contract: StorageRootContract;
}) {
  const reasons: string[] = [];
  if (input.nodeEnv !== "production") reasons.push("NODE_ENV must be production");
  if (input.kdDataDir?.trim() !== "/data") reasons.push("KD_DATA_DIR must equal /data");
  if (input.railwayVolumeMountPath?.trim() !== "/data") reasons.push("RAILWAY_VOLUME_MOUNT_PATH must equal /data");
  if (normalizeSlashes(input.contract.root) !== "/data") reasons.push("resolved persistent data root must equal /data");
  if (input.contract.source !== "KD_DATA_DIR") reasons.push("storage root must resolve from KD_DATA_DIR");
  if (normalizeSlashes(input.contract.railwayMountPath) !== "/data") reasons.push("resolved Railway volume mount must equal /data");
  return reasons;
}

async function resolveExecutionContext(options: MemberBackupOptions) {
  const contract = getStorageRootContract();
  const source = options.source ?? "manual_admin";
  if (options.testOnlyAllowNonProduction) {
    if (process.env.NODE_ENV !== "test" || source !== "test") {
      throw new Error("Member backup test override is allowed only for NODE_ENV=test and source=test");
    }
    if (!contract.root || contract.source !== "KD_DATA_DIR") throw new Error("Backup tests require an explicit absolute KD_DATA_DIR");
    const stat = await fs.stat(contract.root).catch(() => null);
    if (!stat?.isDirectory()) throw new Error("Backup test data root does not exist");
    return { environment: "test" as const, contract, source };
  }

  const reasons = validateProductionBackupProvenance({
    nodeEnv: process.env.NODE_ENV,
    kdDataDir: process.env.KD_DATA_DIR,
    railwayVolumeMountPath: process.env.RAILWAY_VOLUME_MOUNT_PATH,
    contract,
  });
  const stat = contract.root ? await fs.stat(contract.root).catch(() => null) : null;
  if (!stat?.isDirectory()) reasons.push("resolved persistent data root does not exist or is not a directory");
  if (reasons.length) throw new Error(`Production member backup refused: ${reasons.join("; ")}`);
  return { environment: "production" as const, contract, source };
}

export async function assertProductionMemberBackupRuntime() {
  return resolveExecutionContext({ source: "manual_admin" });
}

function criticalDatasets(dataRoot: string): DatasetSpec[] {
  const specs: DatasetSpec[] = [
    { id: "members", sourcePath: getMembersDir(), backupPath: "raw/members", kind: "directory", validateJson: "all-json" },
    { id: "member_identity", sourcePath: getMemberIdentityRegistryFile(), backupPath: "raw/member-identity/registry.json", kind: "file", validateJson: "single" },
    { id: "membership_commerce", sourcePath: getMembershipCommerceStateFile(), backupPath: "raw/membership-commerce/commerce-state.json", kind: "file", validateJson: "single" },
    { id: "membership_business_rules", sourcePath: getMembershipRulesFile(), backupPath: "raw/membership-commerce/business-rules.json", kind: "file", validateJson: "single" },
    { id: "orders", sourcePath: getOrdersDir(), backupPath: "raw/orders", kind: "directory", validateJson: "all-json" },
    { id: "fulfillment_state", sourcePath: getFulfillmentStateFile(), backupPath: "raw/fulfillment/state.json", kind: "file", validateJson: "single" },
    { id: "fulfillment_settings", sourcePath: getFulfillmentSettingsFile(), backupPath: "raw/fulfillment/settings.json", kind: "file", validateJson: "single" },
    { id: "member_avatars", sourcePath: path.join(getUploadsRoot(), "member-avatars"), backupPath: "raw/uploads/member-avatars", kind: "directory", validateJson: "none" },
    { id: "order_notifications", sourcePath: getOrderNotificationUploadsDir(), backupPath: "raw/uploads/order-notifications", kind: "directory", validateJson: "none" },
    { id: "website_data", sourcePath: getWebsiteDataFile(), backupPath: "raw/store/website-data.json", kind: "file", validateJson: "single" },
  ];
  return specs.map((spec) => {
    if (!pathInside(dataRoot, spec.sourcePath)) throw new Error(`Critical dataset is outside the persistent data root: ${spec.id}`);
    return spec;
  });
}

async function walkRegularFiles(root: string) {
  const found: string[] = [];
  async function walk(directory: string) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Critical dataset contains a symbolic link: ${target}`);
      if (entry.isDirectory()) await walk(target);
      else if (entry.isFile()) found.push(target);
      else throw new Error(`Critical dataset contains an unsupported filesystem entry: ${target}`);
    }
  }
  await walk(root);
  return found;
}

async function assertJsonReadable(filePath: string) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    throw new Error(`Critical backup JSON is unavailable or invalid: ${filePath}`, { cause: error });
  }
}

async function captureDataset(spec: DatasetSpec, parsedJson: Map<string, unknown>): Promise<DatasetSnapshot> {
  const stat = await fs.lstat(spec.sourcePath).catch(() => null);
  if (!stat) throw new Error(`Critical backup dataset is missing: ${spec.sourcePath}`);
  if (stat.isSymbolicLink()) throw new Error(`Critical backup dataset must not be a symbolic link: ${spec.sourcePath}`);
  if (spec.kind === "file" && !stat.isFile()) throw new Error(`Critical backup dataset is not a file: ${spec.sourcePath}`);
  if (spec.kind === "directory" && !stat.isDirectory()) throw new Error(`Critical backup dataset is not a directory: ${spec.sourcePath}`);

  const sourceFiles = spec.kind === "file" ? [spec.sourcePath] : await walkRegularFiles(spec.sourcePath);
  const files: SnapshotFile[] = [];
  for (const sourcePath of sourceFiles) {
    const relativePath = spec.kind === "file" ? "" : normalizeSlashes(path.relative(spec.sourcePath, sourcePath));
    const backupPath = spec.kind === "file" ? spec.backupPath : `${spec.backupPath}/${safeRelativePath(relativePath)}`;
    const fileStat = await fs.stat(sourcePath);
    const hash = await sha256File(sourcePath);
    if (spec.validateJson === "single" || (spec.validateJson === "all-json" && sourcePath.toLowerCase().endsWith(".json"))) {
      parsedJson.set(backupPath, await assertJsonReadable(sourcePath));
    }
    files.push({ sourcePath, relativePath, backupPath, bytes: fileStat.size, sha256: hash });
  }
  const signature = files.map((file) => `${file.relativePath}\0${file.bytes}\0${file.sha256}`).join("\n");
  return { spec, files, contentSha256: sha256(signature), byteCount: files.reduce((sum, file) => sum + file.bytes, 0) };
}

async function captureCatalog(specs: DatasetSpec[]) {
  const parsedJson = new Map<string, unknown>();
  const datasets: DatasetSnapshot[] = [];
  for (const spec of specs) datasets.push(await captureDataset(spec, parsedJson));
  return { datasets, parsedJson } satisfies SnapshotCatalog;
}

function assertCatalogStable(before: SnapshotCatalog, after: SnapshotCatalog) {
  for (const dataset of before.datasets) {
    const later = after.datasets.find((item) => item.spec.id === dataset.spec.id);
    if (!later || dataset.contentSha256 !== later.contentSha256 || dataset.files.length !== later.files.length || dataset.byteCount !== later.byteCount) {
      throw new Error(`Critical source changed during member backup: ${dataset.spec.id}`);
    }
  }
}

async function copyCatalogToStaging(catalog: SnapshotCatalog, staging: string) {
  const tracked: MemberBackupManifest["files"] = [];
  for (const dataset of catalog.datasets) {
    if (dataset.spec.kind === "directory") await fs.mkdir(joinBackupPath(staging, dataset.spec.backupPath), { recursive: true });
    for (const file of dataset.files) {
      const destination = joinBackupPath(staging, file.backupPath);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(file.sourcePath, destination, fs.constants.COPYFILE_EXCL);
      const copiedStat = await fs.stat(destination);
      const copiedHash = await sha256File(destination);
      if (copiedStat.size !== file.bytes || copiedHash !== file.sha256) throw new Error(`Copied backup content does not match source: ${file.backupPath}`);
      if (file.backupPath.toLowerCase().endsWith(".json")) await assertJsonReadable(destination);
      tracked.push({ path: file.backupPath, sha256: copiedHash, bytes: copiedStat.size });
    }
  }
  return tracked;
}

function jsonFrom(catalog: SnapshotCatalog, backupPath: string) {
  if (!catalog.parsedJson.has(backupPath)) throw new Error(`Parsed critical JSON is missing: ${backupPath}`);
  return asRecord(catalog.parsedJson.get(backupPath));
}

function profileRecords(catalog: SnapshotCatalog) {
  const members = new Map<string, JsonRecord>();
  const duplicates: string[] = [];
  for (const [backupPath, parsed] of catalog.parsedJson.entries()) {
    if (!backupPath.startsWith("raw/members/") || !backupPath.endsWith(".json")) continue;
    const record = asRecord(parsed);
    const memberId = String(record.id ?? record.memberId ?? path.basename(backupPath, ".json"));
    if (members.has(memberId)) duplicates.push(memberId);
    else members.set(memberId, record);
  }
  return { members, duplicates };
}

function organizationRelationships(identity: JsonRecord, commerce: JsonRecord): OrganizationRelationshipRow[] {
  const registryMembers = asRecord(identity.members);
  return entriesRecord(commerce.referrals).map(([relationshipId, relation]) => {
    const referrerMemberId = String(relation.referrerMemberId ?? "");
    const referredMemberId = String(relation.referredMemberId ?? "");
    return {
      relationshipId,
      referrerMemberId,
      referrerMemberNumber: String(asRecord(registryMembers[referrerMemberId]).memberNumber ?? ""),
      referredMemberId,
      referredMemberNumber: String(asRecord(registryMembers[referredMemberId]).memberNumber ?? ""),
      status: String(relation.status ?? ""),
      createdAt: String(relation.createdAt ?? relation.assignedAt ?? ""),
    };
  }).sort((a, b) => a.relationshipId.localeCompare(b.relationshipId));
}

function emptyFindingCounts(): Record<OrganizationFinding["type"], number> {
  return { duplicate_member_id: 0, missing_parent: 0, missing_child: 0, orphan: 0, self_referral: 0, cycle: 0, multiple_active_parent: 0, root_correctness: 0 };
}

export function buildOrganizationTree(input: {
  identity: JsonRecord;
  commerce: JsonRecord;
  profiles: Map<string, JsonRecord>;
  duplicateProfileIds?: string[];
  createdAt: string;
}): OrganizationTreeSnapshot {
  const registryMembers = asRecord(input.identity.members);
  const relationships = organizationRelationships(input.identity, input.commerce);
  const active = relationships.filter((row) => row.status !== "inactive");
  const findings: OrganizationFinding[] = [];
  const addFinding = (finding: OrganizationFinding) => {
    if (!findings.some((item) => item.type === finding.type && item.memberId === finding.memberId && item.relationshipId === finding.relationshipId && item.message === finding.message)) findings.push(finding);
  };
  for (const memberId of input.duplicateProfileIds ?? []) addFinding({ type: "duplicate_member_id", severity: "error", memberId, message: `Duplicate member profile ID: ${memberId}` });

  const canonicalIds = new Set(Object.keys(registryMembers));
  const allIds = new Set([...canonicalIds, ...input.profiles.keys()]);
  for (const relation of relationships) {
    if (relation.referrerMemberId) allIds.add(relation.referrerMemberId);
    if (relation.referredMemberId) allIds.add(relation.referredMemberId);
  }
  const incoming = new Map<string, OrganizationRelationshipRow[]>();
  const children = new Map<string, string[]>();
  for (const relation of active) {
    if (!relation.referrerMemberId || !canonicalIds.has(relation.referrerMemberId)) {
      addFinding({ type: "missing_parent", severity: "error", memberId: relation.referredMemberId || undefined, relationshipId: relation.relationshipId, message: `Referral parent is missing: ${relation.referrerMemberId || "(empty)"}` });
      if (relation.referredMemberId) addFinding({ type: "orphan", severity: "error", memberId: relation.referredMemberId, relationshipId: relation.relationshipId, message: `Member is orphaned by a missing parent: ${relation.referredMemberId}` });
    }
    if (!relation.referredMemberId || !canonicalIds.has(relation.referredMemberId)) addFinding({ type: "missing_child", severity: "error", memberId: relation.referredMemberId || undefined, relationshipId: relation.relationshipId, message: `Referral child is missing: ${relation.referredMemberId || "(empty)"}` });
    if (relation.referrerMemberId && relation.referrerMemberId === relation.referredMemberId) addFinding({ type: "self_referral", severity: "error", memberId: relation.referredMemberId, relationshipId: relation.relationshipId, message: `Member refers itself: ${relation.referredMemberId}` });
    if (relation.referredMemberId) {
      const list = incoming.get(relation.referredMemberId) ?? [];
      list.push(relation);
      incoming.set(relation.referredMemberId, list);
    }
    if (relation.referrerMemberId && relation.referredMemberId && relation.referrerMemberId !== relation.referredMemberId) {
      const list = children.get(relation.referrerMemberId) ?? [];
      if (!list.includes(relation.referredMemberId)) list.push(relation.referredMemberId);
      children.set(relation.referrerMemberId, list);
    }
  }
  for (const [memberId, parents] of incoming) {
    const distinctParents = new Set(parents.map((item) => item.referrerMemberId).filter(Boolean));
    if (distinctParents.size > 1) addFinding({ type: "multiple_active_parent", severity: "error", memberId, message: `Member has multiple active parents: ${[...distinctParents].join(", ")}` });
  }
  for (const list of children.values()) list.sort((a, b) => a.localeCompare(b));

  const colors = new Map<string, 0 | 1 | 2>();
  const visit = (memberId: string, stack: string[]) => {
    const color = colors.get(memberId) ?? 0;
    if (color === 1) {
      const start = stack.indexOf(memberId);
      const cycle = [...stack.slice(Math.max(0, start)), memberId];
      addFinding({ type: "cycle", severity: "error", memberId, message: `Referral cycle detected: ${cycle.join(" -> ")}` });
      return;
    }
    if (color === 2) return;
    colors.set(memberId, 1);
    for (const child of children.get(memberId) ?? []) visit(child, [...stack, memberId]);
    colors.set(memberId, 2);
  };
  for (const memberId of allIds) visit(memberId, []);

  const roots = [...allIds].filter((memberId) => {
    const validParents = (incoming.get(memberId) ?? []).filter((relation) => relation.referrerMemberId && canonicalIds.has(relation.referrerMemberId) && relation.referrerMemberId !== memberId);
    return validParents.length === 0;
  }).sort((a, b) => a.localeCompare(b));
  const depth = new Map<string, number>();
  const queue = roots.map((memberId) => ({ memberId, depth: 0 }));
  while (queue.length) {
    const current = queue.shift()!;
    const previous = depth.get(current.memberId);
    if (previous !== undefined && previous <= current.depth) continue;
    depth.set(current.memberId, current.depth);
    for (const child of children.get(current.memberId) ?? []) queue.push({ memberId: child, depth: current.depth + 1 });
  }
  for (const memberId of allIds) if (!depth.has(memberId)) addFinding({ type: "root_correctness", severity: "error", memberId, message: `Member is not reachable from any valid root: ${memberId}` });

  const descendants = (memberId: string, visiting = new Set<string>()): Set<string> => {
    if (visiting.has(memberId)) return new Set();
    const next = new Set(visiting).add(memberId);
    const result = new Set<string>();
    for (const child of children.get(memberId) ?? []) {
      if (child === memberId) continue;
      result.add(child);
      for (const nested of descendants(child, next)) result.add(nested);
    }
    result.delete(memberId);
    return result;
  };
  const nodes = [...allIds].map((memberId): OrganizationTreeNode => {
    const canonical = asRecord(registryMembers[memberId]);
    const profile = input.profiles.get(memberId) ?? {};
    const parents = incoming.get(memberId) ?? [];
    const parentId = parents.map((item) => item.referrerMemberId).filter((id) => id && id !== memberId).sort()[0] ?? null;
    const childrenIds = [...(children.get(memberId) ?? [])];
    const descendantCount = descendants(memberId).size;
    return {
      memberId,
      memberNumber: String(canonical.memberNumber ?? profile.memberNumber ?? ""),
      parentId,
      childrenIds,
      depth: depth.get(memberId) ?? null,
      directReferralCount: childrenIds.length,
      teamCount: descendantCount,
      descendantCount,
      relationshipStatus: parents[0]?.status ?? (canonicalIds.has(memberId) ? "root" : "missing_identity"),
    };
  }).sort((a, b) => (a.depth ?? Number.MAX_SAFE_INTEGER) - (b.depth ?? Number.MAX_SAFE_INTEGER) || a.memberNumber.localeCompare(b.memberNumber) || a.memberId.localeCompare(b.memberId));
  const findingCounts = emptyFindingCounts();
  for (const finding of findings) findingCounts[finding.type] += 1;
  return { formatVersion: 1, createdAt: input.createdAt, relationSource: "membership-commerce/commerce-state.json#referrals", roots, nodes, relationships, validation: { valid: findings.every((item) => item.severity !== "error"), findingCounts, findings } };
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function rowsToCsv(headers: string[], rows: Array<Record<string, unknown>>) {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(headers.map((header) => csvCell(row[header])).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function memberReadableRows(identity: JsonRecord, profiles: Map<string, JsonRecord>, tree: OrganizationTreeSnapshot) {
  const registryMembers = asRecord(identity.members);
  const nodeById = new Map(tree.nodes.map((node) => [node.memberId, node]));
  const ids = new Set([...Object.keys(registryMembers), ...profiles.keys()]);
  return [...ids].map((memberId) => {
    const profile = profiles.get(memberId) ?? {};
    const canonical = asRecord(registryMembers[memberId]);
    const node = nodeById.get(memberId);
    return {
      memberId,
      memberNumber: String(canonical.memberNumber ?? profile.memberNumber ?? ""),
      displayName: String(profile.displayName ?? profile.name ?? ""),
      email: String(profile.email ?? ""),
      phone: String(profile.phone ?? ""),
      status: String(canonical.status ?? ""),
      parentId: node?.parentId ?? "",
      directReferralCount: node?.directReferralCount ?? 0,
      teamCount: node?.teamCount ?? 0,
      createdAt: String(profile.createdAt ?? canonical.createdAt ?? ""),
      updatedAt: String(profile.updatedAt ?? canonical.updatedAt ?? ""),
    };
  }).sort((a, b) => a.memberNumber.localeCompare(b.memberNumber) || a.memberId.localeCompare(b.memberId));
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function buildOrganizationHtml(tree: OrganizationTreeSnapshot) {
  const embedded = JSON.stringify({ roots: tree.roots, nodes: tree.nodes }).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KD Coffee 會員組織圖備份 ${escapeHtml(tree.createdAt)}</title>
<style>
:root{font-family:Inter,"Noto Sans TC","Microsoft JhengHei",sans-serif;color:#1d1a16;background:#f3efe7}*{box-sizing:border-box}body{margin:0;overflow:hidden}
.top{height:116px;padding:16px 22px;background:#f8f4ed;border-bottom:1px solid #d8d0c3;display:grid;gap:10px}.title{display:flex;justify-content:space-between;gap:16px;align-items:center}.title h1{font-size:20px;margin:0}.title p{margin:4px 0 0;color:#72695d;font-size:12px}.tools{display:flex;gap:8px;flex-wrap:wrap}.tools input{min-width:260px;padding:9px 12px;border:1px solid #c8bcaa;border-radius:8px;background:white}.tools button{border:1px solid #a99880;background:#fffaf2;border-radius:8px;padding:8px 11px;cursor:pointer}.tools output{min-width:56px;text-align:center;padding:8px;color:#665b4d}
.viewport{height:calc(100vh - 116px);overflow:auto;cursor:grab;touch-action:none}.viewport.dragging{cursor:grabbing}.stage{transform-origin:0 0;min-width:max-content;padding:44px}.forest{display:flex;gap:76px;align-items:flex-start}.tree,.tree ul{display:flex;justify-content:center;gap:26px;position:relative;margin:0;padding:34px 0 0}.tree{padding-top:0}.tree li{list-style:none;text-align:center;position:relative;padding:34px 8px 0}.tree>li{padding-top:0}.tree ul:before{content:"";position:absolute;top:0;left:50%;height:34px;border-left:1px solid #a99f92}.tree li:before,.tree li:after{content:"";position:absolute;top:0;width:50%;height:34px;border-top:1px solid #a99f92}.tree li:before{right:50%}.tree li:after{left:50%;border-left:1px solid #a99f92}.tree li:only-child:before,.tree li:only-child:after{display:none}.tree li:first-child:before,.tree li:last-child:after{border:0}.node{width:220px;padding:15px;border:1px solid #ddd2c4;border-radius:16px;background:#fff;box-shadow:0 10px 28px #382d2014}.node.root{background:#241f19;color:#fff}.node strong,.node small,.node em{display:block}.node strong{font-size:14px}.node small{margin-top:7px;color:#766d62}.node.root small{color:#d7cec0}.node em{margin-top:6px;font-size:10px;font-style:normal;opacity:.66}.node button{margin-top:10px;border:0;background:transparent;text-decoration:underline;cursor:pointer;color:inherit}.node.match{outline:3px solid #b98a3c;outline-offset:3px}.collapsed>ul{display:none}.empty{padding:30px;color:#756b5f}.legend{position:fixed;right:14px;bottom:12px;background:#fffdf8e8;border:1px solid #d8d0c3;border-radius:9px;padding:8px 10px;font-size:11px;color:#73695e}
</style></head><body><header class="top"><div class="title"><div><h1>KD Coffee 會員組織圖備份</h1><p>快照：${escapeHtml(tree.createdAt)} · 關係來源：Membership Commerce referrals · 完全離線</p></div><span>${tree.nodes.length} 位會員 · ${tree.roots.length} 個 root</span></div><div class="tools"><input id="search" type="search" placeholder="搜尋會員編號或 member ID"><button id="find">搜尋</button><button id="minus">縮小</button><output id="zoom">100%</output><button id="plus">放大</button><button id="reset">回到 root</button><button id="expand">全部展開</button></div></header><main class="viewport" id="viewport"><div class="stage" id="stage"><div class="forest" id="forest"></div></div></main><div class="legend">拖曳／捲動瀏覽 · 節點可展開收合 · organization-tree.json 才是復原資料</div>
<script>const DATA=${embedded};const byId=new Map(DATA.nodes.map(n=>[n.memberId,n]));const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));function branch(id,seen=new Set()){const n=byId.get(id);if(!n||seen.has(id))return "";const next=new Set(seen);next.add(id);const kids=n.childrenIds.filter(x=>byId.has(x)&&!next.has(x));return '<li data-id="'+esc(id)+'"><article class="node '+(n.depth===0?'root':'')+'"><strong>會員 '+esc(n.memberNumber||"未編號")+'</strong><small>'+esc(n.memberId)+'</small><small>直推 '+n.directReferralCount+' 人 · 團隊 '+n.teamCount+' 人</small><em>'+esc(n.relationshipStatus)+'</em>'+(kids.length?'<button type="button">收合分支</button>':'')+'</article>'+(kids.length?'<ul>'+kids.map(x=>branch(x,next)).join("")+'</ul>':'')+'</li>'}const forest=document.getElementById("forest");forest.innerHTML=DATA.roots.length?DATA.roots.map(id=>'<ul class="tree">'+branch(id)+'</ul>').join(""):'<p class="empty">沒有可顯示的 root；請查看 organization-tree.json 的 validation findings。</p>';forest.addEventListener("click",e=>{const b=e.target.closest(".node button");if(!b)return;const li=b.closest("li");li.classList.toggle("collapsed");b.textContent=li.classList.contains("collapsed")?"展開分支":"收合分支"});let scale=1,ox=0,oy=0;const stage=document.getElementById("stage"),vp=document.getElementById("viewport"),out=document.getElementById("zoom");function paint(){stage.style.transform='translate('+ox+'px,'+oy+'px) scale('+scale+')';out.textContent=Math.round(scale*100)+'%'}function setScale(v){scale=Math.max(.25,Math.min(2.5,v));paint()}document.getElementById("minus").onclick=()=>setScale(scale-.1);document.getElementById("plus").onclick=()=>setScale(scale+.1);function reset(){scale=1;ox=0;oy=0;vp.scrollTo(0,0);paint()}document.getElementById("reset").onclick=reset;document.getElementById("expand").onclick=()=>{document.querySelectorAll("li.collapsed").forEach(x=>x.classList.remove("collapsed"));document.querySelectorAll(".node button").forEach(x=>x.textContent="收合分支")};let drag=null;vp.addEventListener("pointerdown",e=>{if(e.target.closest("button,input"))return;drag={x:e.clientX,y:e.clientY,ox,oy};vp.setPointerCapture(e.pointerId);vp.classList.add("dragging")});vp.addEventListener("pointermove",e=>{if(!drag)return;ox=drag.ox+e.clientX-drag.x;oy=drag.oy+e.clientY-drag.y;paint()});function stop(){drag=null;vp.classList.remove("dragging")}vp.addEventListener("pointerup",stop);vp.addEventListener("pointercancel",stop);vp.addEventListener("wheel",e=>{if(!e.ctrlKey)return;e.preventDefault();setScale(scale+(e.deltaY < 0 ? 0.08 : -0.08))},{passive:false});function find(){document.querySelectorAll(".node.match").forEach(x=>x.classList.remove("match"));const q=document.getElementById("search").value.trim().toLowerCase();if(!q)return;const n=DATA.nodes.find(x=>x.memberId.toLowerCase().includes(q)||x.memberNumber.toLowerCase().includes(q));if(!n)return alert("找不到會員");let id=n.memberId;while(id){const li=document.querySelector('li[data-id="'+CSS.escape(id)+'"]');if(li){li.classList.remove("collapsed");const card=li.querySelector(":scope > .node");if(id===n.memberId){card.classList.add("match");card.scrollIntoView({behavior:"smooth",block:"center",inline:"center"})}}id=byId.get(id)?.parentId||null}}document.getElementById("find").onclick=find;document.getElementById("search").addEventListener("keydown",e=>{if(e.key==="Enter")find()});paint();</script></body></html>`;
}

async function writeTracked(root: string, relativePath: string, content: string | Buffer, tracked: MemberBackupManifest["files"]) {
  const destination = joinBackupPath(root, relativePath);
  const payload = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, payload, { flag: "wx" });
  tracked.push({ path: safeRelativePath(relativePath), sha256: sha256(payload), bytes: payload.length });
}

function revision(value: unknown) {
  return Number.isSafeInteger(value) ? Number(value) : null;
}

function deploymentCommit() {
  return (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || process.env.SOURCE_VERSION || "unavailable").trim();
}

function countRecords(value: unknown) {
  return Object.keys(asRecord(value)).length;
}

async function removeStaging(target: string, expectedRoot: string) {
  const basename = path.basename(target);
  if (!pathInside(expectedRoot, target) || !basename.startsWith(".staging-") || path.dirname(path.resolve(target)) !== path.resolve(expectedRoot)) throw new Error("Refusing to remove an unsafe staging path");
  await fs.rm(target, { recursive: true, force: true });
}

function manifestDatasetRows(catalog: SnapshotCatalog): MemberBackupManifest["datasets"] {
  return catalog.datasets.map((dataset) => ({ id: dataset.spec.id, sourcePath: normalizeSlashes(dataset.spec.sourcePath), backupPath: dataset.spec.backupPath, kind: dataset.spec.kind, fileCount: dataset.files.length, byteCount: dataset.byteCount, contentSha256: dataset.contentSha256 }));
}

export async function createMemberBackup(options: MemberBackupOptions = {}) {
  const context = await resolveExecutionContext(options);
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Backup timestamp is invalid");
  const backupId = backupIdFor(now);
  const root = backupRoot();
  const staging = path.join(root, `.staging-${backupId}`);
  const finalDir = path.join(root, backupId);
  if (!pathInside(context.contract.root, root)) throw new Error("Backup destination is outside the persistent data root");
  await fs.mkdir(root, { recursive: true });
  await removeStaging(staging, root);
  await fs.mkdir(staging, { recursive: false });

  try {
    const specs = criticalDatasets(context.contract.root);
    const catalog = await captureCatalog(specs);
    const tracked = await copyCatalogToStaging(catalog, staging);
    const identity = jsonFrom(catalog, "raw/member-identity/registry.json");
    const commerce = jsonFrom(catalog, "raw/membership-commerce/commerce-state.json");
    const rules = jsonFrom(catalog, "raw/membership-commerce/business-rules.json");
    const fulfillment = jsonFrom(catalog, "raw/fulfillment/state.json");
    const profiles = profileRecords(catalog);
    const organization = buildOrganizationTree({ identity, commerce, profiles: profiles.members, duplicateProfileIds: profiles.duplicates, createdAt: now.toISOString() });
    const members = memberReadableRows(identity, profiles.members, organization);

    await writeTracked(staging, "readable/members.csv", rowsToCsv(["memberId", "memberNumber", "displayName", "email", "phone", "status", "parentId", "directReferralCount", "teamCount", "createdAt", "updatedAt"], members), tracked);
    await writeTracked(staging, "readable/organization.csv", rowsToCsv(["relationshipId", "referrerMemberId", "referrerMemberNumber", "referredMemberId", "referredMemberNumber", "status", "createdAt"], organization.relationships), tracked);
    await writeTracked(staging, "organization-tree.json", `${JSON.stringify(organization, null, 2)}\n`, tracked);
    await writeTracked(staging, "organization.html", buildOrganizationHtml(organization), tracked);

    await options.beforeStabilityCheck?.();
    const after = await captureCatalog(specs);
    assertCatalogStable(catalog, after);
    const activeReferrals = organization.relationships.filter((item) => item.status !== "inactive").length;
    const creditEntries = countRecords(commerce.creditEntries);
    const creditReservations = countRecords(commerce.creditReservations);
    const rewardEntries = countRecords(commerce.referralRewards);
    const manifest: MemberBackupManifest = {
      formatVersion: MEMBER_BACKUP_FORMAT_VERSION,
      backupVersion: MEMBER_BACKUP_VERSION,
      backupId,
      createdAt: now.toISOString(),
      completedAt: new Date().toISOString(),
      source: context.source,
      environment: context.environment,
      dataRoot: normalizeSlashes(context.contract.root),
      storageRootSource: context.contract.source,
      railwayVolumeMountPath: context.contract.railwayMountPath ? normalizeSlashes(context.contract.railwayMountPath) : null,
      railwayDeploymentId: process.env.RAILWAY_DEPLOYMENT_ID?.trim() || null,
      gitCommit: deploymentCommit(),
      appVersion: String(packageJson.version),
      backupLocation: normalizeSlashes(finalDir),
      status: "verified",
      counts: {
        memberFiles: catalog.datasets.find((item) => item.spec.id === "members")?.files.length ?? 0,
        members: members.length,
        canonicalMembers: countRecords(identity.members),
        activeReferrals,
        totalReferrals: organization.relationships.length,
        roots: organization.roots.length,
        orphans: organization.validation.findingCounts.orphan,
        subscriptions: countRecords(commerce.subscriptions),
        creditEntries,
        creditReservations,
        rewardEntries,
        ledgerEntries: creditEntries + creditReservations + rewardEntries,
        orders: catalog.datasets.find((item) => item.spec.id === "orders")?.files.filter((item) => item.backupPath.endsWith(".json")).length ?? 0,
        fulfillmentRecords: countRecords(fulfillment.records),
      },
      sourceRevisions: { identityRevision: revision(identity.revision), commerceRevision: revision(commerce.revision), businessRulesRevision: revision(rules.revision), fulfillmentRevision: revision(fulfillment.revision) },
      datasets: manifestDatasetRows(catalog),
      files: tracked.sort((a, b) => a.path.localeCompare(b.path)),
      validation: {
        criticalDatasetsPresent: true,
        jsonReadable: true,
        sourceStableDuringSnapshot: true,
        copiedContentMatchesSource: true,
        checksumsVerified: true,
        organizationGraphValid: organization.validation.valid,
        organizationFindingCount: organization.validation.findings.length,
        summary: organization.validation.valid ? "All critical datasets, JSON documents, source stability, copied bytes, checksums, and organization graph validations passed." : `Backup bytes are verified; organization graph contains ${organization.validation.findings.length} recorded finding(s).`,
      },
    };
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    await fs.writeFile(path.join(staging, "manifest.json"), manifestText, { flag: "wx" });
    const checksumRows = [...manifest.files, { path: "manifest.json", sha256: sha256(manifestText), bytes: Buffer.byteLength(manifestText) }].sort((a, b) => a.path.localeCompare(b.path)).map((file) => `${file.sha256}  ${file.path}`);
    await fs.writeFile(path.join(staging, "checksums.sha256"), `${checksumRows.join("\n")}\n`, { flag: "wx" });
    await verifyBackupDirectory(staging, backupId, { allowStaging: true });
    await fs.rename(staging, finalDir);
    const verified = await verifyBackupDirectory(finalDir, backupId);
    return { manifest: verified.manifest, path: finalDir };
  } catch (error) {
    await removeStaging(staging, root).catch(() => undefined);
    throw error;
  }
}

function parseChecksums(text: string) {
  const rows = new Map<string, string>();
  for (const line of text.split(/\r?\n/u).filter(Boolean)) {
    const match = /^([a-f0-9]{64})  (.+)$/u.exec(line);
    if (!match) throw new Error("Backup checksum file is malformed");
    const relativePath = safeRelativePath(match[2]);
    if (rows.has(relativePath)) throw new Error(`Duplicate checksum path: ${relativePath}`);
    rows.set(relativePath, match[1]);
  }
  return rows;
}

async function verifyBackupDirectory(directory: string, expectedBackupId: string, options: { allowStaging?: boolean } = {}): Promise<VerifiedMemberBackup> {
  if (!isValidMemberBackupId(expectedBackupId)) throw new Error("Invalid member backup ID");
  if (!options.allowStaging && path.basename(directory).startsWith(".staging-")) throw new Error("Staging backups cannot be downloaded or listed as verified");
  const directoryStat = await fs.lstat(directory).catch(() => null);
  if (!directoryStat?.isDirectory() || directoryStat.isSymbolicLink()) throw new Error("Verified member backup directory is unavailable");
  const manifestPath = path.join(directory, "manifest.json");
  const checksumPath = path.join(directory, "checksums.sha256");
  const manifestText = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestText) as MemberBackupManifest;
  if (manifest.backupId !== expectedBackupId || manifest.status !== "verified" || manifest.backupVersion !== MEMBER_BACKUP_VERSION || manifest.formatVersion !== MEMBER_BACKUP_FORMAT_VERSION) throw new Error("Backup manifest identity or verified status is invalid");
  const checksums = parseChecksums(await fs.readFile(checksumPath, "utf8"));
  if (checksums.get("manifest.json") !== sha256(manifestText)) throw new Error("Backup manifest checksum mismatch");
  const expectedPaths = new Set(manifest.files.map((file) => safeRelativePath(file.path)));
  if (expectedPaths.size !== manifest.files.length || checksums.size !== manifest.files.length + 1) throw new Error("Backup checksum inventory does not match manifest");
  const files: VerifiedMemberBackup["files"] = [];
  for (const file of manifest.files) {
    const relativePath = safeRelativePath(file.path);
    const absolutePath = joinBackupPath(directory, relativePath);
    if (!pathInside(directory, absolutePath)) throw new Error("Backup manifest path escapes its directory");
    const stat = await fs.lstat(absolutePath).catch(() => null);
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.size !== file.bytes) throw new Error(`Backup file is unavailable or changed: ${relativePath}`);
    const actual = await sha256File(absolutePath);
    if (actual !== file.sha256 || checksums.get(relativePath) !== actual) throw new Error(`Backup checksum mismatch: ${relativePath}`);
    files.push({ absolutePath, archivePath: relativePath, bytes: stat.size });
  }
  files.push({ absolutePath: manifestPath, archivePath: "manifest.json", bytes: Buffer.byteLength(manifestText) });
  const checksumStat = await fs.stat(checksumPath);
  files.push({ absolutePath: checksumPath, archivePath: "checksums.sha256", bytes: checksumStat.size });
  return { directory, manifest, files: files.sort((a, b) => a.archivePath.localeCompare(b.archivePath)) };
}

async function verifiedBackupById(backupId: string, testOnlyAllowNonProduction = false) {
  await resolveExecutionContext({ source: testOnlyAllowNonProduction ? "test" : "manual_admin", testOnlyAllowNonProduction });
  if (!isValidMemberBackupId(backupId)) throw new Error("Invalid member backup ID");
  const root = backupRoot();
  const directory = path.join(root, backupId);
  if (!pathInside(root, directory) || path.dirname(path.resolve(directory)) !== path.resolve(root)) throw new Error("Backup path boundary validation failed");
  return verifyBackupDirectory(directory, backupId);
}

export async function getVerifiedMemberBackupForDownload(backupId: string, options: { testOnlyAllowNonProduction?: boolean } = {}) {
  return verifiedBackupById(backupId, options.testOnlyAllowNonProduction === true);
}

export async function listMemberBackups(options: { testOnlyAllowNonProduction?: boolean } = {}): Promise<MemberBackupSummary[]> {
  await resolveExecutionContext({ source: options.testOnlyAllowNonProduction ? "test" : "manual_admin", testOnlyAllowNonProduction: options.testOnlyAllowNonProduction });
  const root = backupRoot();
  let entries: import("node:fs").Dirent[];
  try { entries = await fs.readdir(root, { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const summaries: MemberBackupSummary[] = [];
  for (const entry of entries.filter((item) => item.isDirectory() && isValidMemberBackupId(item.name))) {
    try {
      const { manifest } = await verifyBackupDirectory(path.join(root, entry.name), entry.name);
      summaries.push({ backupId: manifest.backupId, createdAt: manifest.createdAt, completedAt: manifest.completedAt, source: manifest.source, environment: manifest.environment, dataRoot: manifest.dataRoot, gitCommit: manifest.gitCommit, status: "verified", memberCount: manifest.counts.canonicalMembers, activeReferralCount: manifest.counts.activeReferrals, totalReferralCount: manifest.counts.totalReferrals, orderCount: manifest.counts.orders, bytes: manifest.files.reduce((sum, item) => sum + item.bytes, 0), backupLocation: manifest.backupLocation });
    } catch {
      // Corrupt, incomplete, unknown-version, and staging directories are never advertised.
    }
  }
  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function pruneMemberBackups(retentionDays = Number(process.env.MEMBER_BACKUP_RETENTION_DAYS || 90), now = new Date()) {
  const safeDays = Number.isFinite(retentionDays) ? Math.max(7, Math.min(3650, Math.floor(retentionDays))) : 90;
  const threshold = now.getTime() - safeDays * 86_400_000;
  const root = backupRoot();
  const backups = await listMemberBackups();
  const removed: string[] = [];
  for (const backup of backups) {
    if (Date.parse(backup.createdAt) >= threshold) continue;
    const target = path.join(root, backup.backupId);
    if (!pathInside(root, target) || path.dirname(path.resolve(target)) !== path.resolve(root) || !isValidMemberBackupId(path.basename(target))) throw new Error("Unsafe backup retention target");
    await fs.rm(target, { recursive: true, force: false });
    removed.push(backup.backupId);
  }
  return { retentionDays: safeDays, removed };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

async function crc32File(filePath: string) {
  let crc = 0xffffffff;
  for await (const chunk of createReadStream(filePath)) for (const byte of chunk as Buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const safe = date.getFullYear() < 1980 ? new Date(1980, 0, 1) : date;
  return { time: (safe.getHours() << 11) | (safe.getMinutes() << 5) | Math.floor(safe.getSeconds() / 2), date: ((safe.getFullYear() - 1980) << 9) | ((safe.getMonth() + 1) << 5) | safe.getDate() };
}

function zipLocalHeader(name: Buffer, crc: number, size: number, time: number, date: number) {
  const buffer = Buffer.alloc(30 + name.length);
  buffer.writeUInt32LE(0x04034b50, 0); buffer.writeUInt16LE(20, 4); buffer.writeUInt16LE(0x0800, 6); buffer.writeUInt16LE(0, 8); buffer.writeUInt16LE(time, 10); buffer.writeUInt16LE(date, 12); buffer.writeUInt32LE(crc, 14); buffer.writeUInt32LE(size, 18); buffer.writeUInt32LE(size, 22); buffer.writeUInt16LE(name.length, 26); buffer.writeUInt16LE(0, 28); name.copy(buffer, 30);
  return buffer;
}

function zipCentralHeader(name: Buffer, crc: number, size: number, time: number, date: number, offset: number) {
  const buffer = Buffer.alloc(46 + name.length);
  buffer.writeUInt32LE(0x02014b50, 0); buffer.writeUInt16LE(20, 4); buffer.writeUInt16LE(20, 6); buffer.writeUInt16LE(0x0800, 8); buffer.writeUInt16LE(0, 10); buffer.writeUInt16LE(time, 12); buffer.writeUInt16LE(date, 14); buffer.writeUInt32LE(crc, 16); buffer.writeUInt32LE(size, 20); buffer.writeUInt32LE(size, 24); buffer.writeUInt16LE(name.length, 28); buffer.writeUInt16LE(0, 30); buffer.writeUInt16LE(0, 32); buffer.writeUInt16LE(0, 34); buffer.writeUInt16LE(0, 36); buffer.writeUInt32LE(0, 38); buffer.writeUInt32LE(offset, 42); name.copy(buffer, 46);
  return buffer;
}

export async function createMemberBackupZipStream(verified: VerifiedMemberBackup) {
  if (verified.files.length > 65_535) throw new Error("Backup contains too many files for a standard ZIP archive");
  const entries = [] as Array<{ absolutePath: string; name: Buffer; size: number; crc: number; time: number; date: number; offset: number }>;
  let offset = 0;
  for (const file of verified.files) {
    if (file.bytes > 0xffffffff) throw new Error("Backup file exceeds standard ZIP size limits");
    const stat = await fs.stat(file.absolutePath);
    const name = Buffer.from(safeRelativePath(file.archivePath), "utf8");
    const { time, date } = dosDateTime(stat.mtime);
    const crc = await crc32File(file.absolutePath);
    entries.push({ absolutePath: file.absolutePath, name, size: stat.size, crc, time, date, offset });
    offset += 30 + name.length + stat.size;
    if (offset > 0xffffffff) throw new Error("Backup exceeds standard ZIP archive limits");
  }
  async function* archive() {
    for (const entry of entries) {
      yield zipLocalHeader(entry.name, entry.crc, entry.size, entry.time, entry.date);
      for await (const chunk of createReadStream(entry.absolutePath)) yield chunk as Buffer;
    }
    const centralOffset = offset;
    let centralSize = 0;
    for (const entry of entries) {
      const header = zipCentralHeader(entry.name, entry.crc, entry.size, entry.time, entry.date, entry.offset);
      centralSize += header.length;
      yield header;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(centralOffset, 16); end.writeUInt16LE(0, 20);
    yield end;
  }
  return Readable.toWeb(Readable.from(archive())) as ReadableStream<Uint8Array>;
}

export function currentMemberBackupDataRoot() {
  return getPersistentDataRoot();
}
