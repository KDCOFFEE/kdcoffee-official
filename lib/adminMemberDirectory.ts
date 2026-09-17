import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { WebsiteData } from "@/data/websiteData";
import type { FulfillmentStore, LogisticsSettings } from "@/lib/fulfillmentTypes";
import type { Member } from "@/lib/memberAuth";
import { defaultLogisticsSettings, validateFulfillmentStore } from "@/lib/fulfillment";
import { validateMemberIdentityRegistry, type MemberIdentityRegistry } from "@/lib/memberIdentity";
import {
  DEFAULT_MEMBERSHIP_RULES,
  MEMBERSHIP_RULES_SCHEMA_VERSION,
  validateMembershipRulesStore,
} from "@/lib/membershipBusinessRules";
import {
  validateMembershipCommerceState,
  type MembershipCommerceState,
  type Subscription,
  type SubscriptionCycle,
} from "@/lib/membershipCommerce";
import {
  getFulfillmentSettingsFile,
  getFulfillmentStateFile,
  getMemberIdentityRegistryFile,
  getMembersDir,
  getMembershipCommerceStateFile,
  getMembershipRulesFile,
  getOrdersDir,
  getStorageRootContract,
  getWebsiteDataFile,
} from "@/lib/storagePaths";
import {
  buildAdminMemberOrganization,
  canonicalizeAdminMemberId,
  type AdminOrganizationFinding,
  type AdminOrganizationGraph,
} from "@/lib/adminMemberOrganization";
import type { AdminMemberSearchRow } from "@/lib/adminMemberSearch";

type JsonObject = Record<string, unknown>;

export const adminMemberDirectorySourceIds = [
  "members",
  "identity-registry",
  "commerce-state",
  "business-rules",
  "orders",
  "fulfillment-state",
  "fulfillment-settings",
  "website-data",
] as const;

export type AdminMemberDirectorySourceId = (typeof adminMemberDirectorySourceIds)[number];
export type AdminMemberDirectorySnapshotMode = "production" | "local-development" | "test";

type ProductionRootInput = {
  nodeEnv?: string;
  kdDataDir?: string;
  railwayVolumeMountPath?: string;
  resolvedRoot?: string;
  storageRootSource?: string;
};

export class AdminMemberDirectoryError extends Error {
  readonly code: "storage" | "missing-source" | "invalid-source" | "unstable-snapshot";
  readonly source?: AdminMemberDirectorySourceId;

  constructor(
    code: AdminMemberDirectoryError["code"],
    message: string,
    options: ErrorOptions & { source?: AdminMemberDirectorySourceId } = {},
  ) {
    super(message, options);
    this.name = "AdminMemberDirectoryError";
    this.code = code;
    this.source = options.source;
  }
}

export type AdminMemberDirectoryPaths = {
  membersDir: string;
  identityFile: string;
  commerceFile: string;
  rulesFile: string;
  ordersDir: string;
  fulfillmentFile: string;
  fulfillmentSettingsFile: string;
  websiteFile: string;
};

export type AdminMemberDirectoryDiagnostic = {
  code: string;
  severity: "warning" | "error";
  message: string;
  memberId?: string;
  orderNumber?: string;
};

export type AdminMemberDirectoryRow = AdminMemberSearchRow & {
  pickupName: string;
  accountStatus: string;
  createdAt: string;
  subscriptionStatuses: string[];
  directCount: number;
  teamCount: number;
  orderCount: number;
  completedOrderCount: number;
  completedSpend: number;
  allOrderAmount: number;
  creditAvailable: number;
  qualificationStatus: string;
  hasGraphAnomaly: boolean;
};

export type AdminMemberOrderSummary = {
  orderNumber: string;
  createdAt: string;
  orderStatus: string;
  fulfillmentStatus: string | null;
  completed: boolean;
  total: number;
  shippingMethod: string;
  storeName: string;
  effectivePvSnapshot: number;
  diagnostic: string | null;
};

export type AdminMemberSubscriptionSummary = {
  subscriptionId: string;
  status: Subscription["status"];
  intervalDays: number;
  shippingMethod: string;
  storeSelection: { storeId: string; storeName: string } | null;
  startedFromOrderId: string;
  nextCycle: null | {
    cycleId: string;
    kind: SubscriptionCycle["kind"];
    status: SubscriptionCycle["status"];
    plannedDate: string;
    modificationDeadline: string;
    orderCreationDate: string;
    createdOrderId: string | null;
  };
};

export type AdminMemberDetail = {
  revisionToken: string;
  identity: {
    memberId: string;
    memberNumber: string;
    accountStatus: string;
    createdAt: string;
    updatedAt: string;
    displayName: string;
    pickupName: string;
    phone: string;
    email: string;
    loginEmail: string;
    lastLoginAt: string;
    avatarStatus: { customAvatar: boolean; providerPicture: boolean };
    providers: Array<{ provider: string; status: string; verifiedAt: string; linkedAt: string }>;
    aliases: string[];
  };
  organization: {
    node: AdminOrganizationGraph["nodes"][number] | null;
    parent: { memberId: string; memberNumber: string; displayName: string } | null;
    children: Array<{ memberId: string; memberNumber: string; displayName: string }>;
    relationshipHistory: Array<{ relationshipId: string; parentId: string; childId: string; status: string; createdAt: string; updatedAt: string }>;
    findings: AdminOrganizationFinding[];
  };
  subscriptions: AdminMemberSubscriptionSummary[];
  commerce: {
    creditAvailable: number;
    creditReserved: number;
    rewardCount: number;
    calculatedRewardAmount: number;
    releasedRewardAmount: number;
    projectedRewardAmount: number;
    validConsumption: number;
    qualificationStatus: string;
    qualificationRoundCount: number;
    historicalEffectivePv: number;
    rewardPvSnapshots: number;
  };
  orders: {
    orderCount: number;
    completedOrderCount: number;
    completedSpend: number;
    allOrderAmount: number;
    recent: AdminMemberOrderSummary[];
  };
  diagnostics: AdminMemberDirectoryDiagnostic[];
};

export type AdminMemberDirectorySnapshot = {
  revisionToken: string;
  generatedAt: string;
  rows: AdminMemberDirectoryRow[];
  organization: AdminOrganizationGraph;
  diagnostics: AdminMemberDirectoryDiagnostic[];
  details: Map<string, AdminMemberDetail>;
  canonicalAliases: Map<string, string>;
  sourceCounts: { members: number; identities: number; orders: number; subscriptions: number; referrals: number };
};

type Capture = {
  fingerprint: string;
  files: Map<string, string>;
  memberFiles: string[];
  orderFiles: string[];
  diagnostics: AdminMemberDirectoryDiagnostic[];
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function productionPath(value: string) {
  return path.posix.normalize(value.replaceAll("\\", "/"));
}

export function resolveAdminMemberDirectorySnapshotMode(nodeEnv = process.env.NODE_ENV): AdminMemberDirectorySnapshotMode {
  if (nodeEnv === "production") return "production";
  if (nodeEnv === "test") return "test";
  return "local-development";
}

export function assertAdminMemberDirectoryProductionRoot(input?: ProductionRootInput) {
  const contract = input ? null : getStorageRootContract();
  const values = input ?? {
    nodeEnv: process.env.NODE_ENV,
    kdDataDir: process.env.KD_DATA_DIR,
    railwayVolumeMountPath: process.env.RAILWAY_VOLUME_MOUNT_PATH,
    resolvedRoot: contract?.root,
    storageRootSource: contract?.source,
  };
  if (values.nodeEnv !== "production") return;
  const exact = [values.kdDataDir, values.railwayVolumeMountPath, values.resolvedRoot]
    .map((value) => productionPath(value?.trim() || ""));
  if (exact.some((value) => value !== "/data") || values.storageRootSource !== "KD_DATA_DIR") {
    throw new AdminMemberDirectoryError("storage", "Production 會員目錄只允許從 Railway /data persistent volume 讀取；已拒絕 repository fallback。");
  }
}

export function resolveAdminMemberDirectoryPaths(): AdminMemberDirectoryPaths {
  assertAdminMemberDirectoryProductionRoot();
  return {
    membersDir: getMembersDir(),
    identityFile: getMemberIdentityRegistryFile(),
    commerceFile: getMembershipCommerceStateFile(),
    rulesFile: getMembershipRulesFile(),
    ordersDir: getOrdersDir(),
    fulfillmentFile: getFulfillmentStateFile(),
    fulfillmentSettingsFile: getFulfillmentSettingsFile(),
    websiteFile: getWebsiteDataFile(),
  };
}

function isMissing(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function sourceDiagnostic(code: string, message: string): AdminMemberDirectoryDiagnostic {
  return { code, severity: "warning", message };
}

export function adminMemberDirectoryLocalDefault(
  source: Exclude<AdminMemberDirectorySourceId, "members" | "orders" | "website-data">,
  now: Date,
) {
  const timestamp = now.toISOString();
  switch (source) {
    case "identity-registry":
      return { schemaVersion: 1, revision: 0, nextMemberSequence: 1, createdAt: timestamp, updatedAt: timestamp, members: {}, identities: {}, legacyAliases: {}, linkTransactions: {}, auditLog: [] };
    case "commerce-state":
      return { schemaVersion: 1, revision: 0, createdAt: timestamp, updatedAt: timestamp, subscriptions: {}, cycles: {}, referrals: {}, referralConversions: {}, referralRewards: {}, validConsumptionEvents: {}, qualificationRounds: {}, referralRewardCoverages: {}, referralRewardMaturations: {}, creditEntries: {}, creditReservations: {}, events: [], notifications: [], audit: [], idempotency: {} };
    case "business-rules":
      return { schemaVersion: MEMBERSHIP_RULES_SCHEMA_VERSION, revision: 0, activeRulesVersion: 1, versions: [{ rulesVersion: 1, effectiveAt: timestamp, createdAt: timestamp, createdBy: "system", rules: structuredClone(DEFAULT_MEMBERSHIP_RULES) }], createdAt: timestamp, updatedAt: timestamp };
    case "fulfillment-state":
      return { schemaVersion: 1, revision: 0, records: {}, reviews: [], processedFingerprints: {}, consequenceStatus: {}, createdAt: timestamp, updatedAt: timestamp };
    case "fulfillment-settings":
      return defaultLogisticsSettings(now);
  }
}

async function jsonFiles(
  directory: string,
  source: "members" | "orders",
  mode: AdminMemberDirectorySnapshotMode,
) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (mode !== "production" && isMissing(error)) {
      return {
        files: [] as string[],
        fingerprint: `missing-empty:${source}:v1`,
        diagnostic: sourceDiagnostic(`source-empty:${source}`, `${source} 來源目錄不存在，已依本機 runtime 契約使用空集合。`),
      };
    }
    throw new AdminMemberDirectoryError("missing-source", `缺少 mandatory ${source} directory：${directory}`, { cause: error, source });
  }
  return {
    files: entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => path.join(directory, entry.name)).sort(),
    fingerprint: `present:${source}:v1`,
    diagnostic: null,
  };
}

async function capture(
  paths: AdminMemberDirectoryPaths,
  mode: AdminMemberDirectorySnapshotMode,
  now: Date,
): Promise<Capture> {
  const [members, orders] = await Promise.all([
    jsonFiles(paths.membersDir, "members", mode),
    jsonFiles(paths.ordersDir, "orders", mode),
  ]);
  const sources = [
    { id: "identity-registry", file: paths.identityFile },
    { id: "commerce-state", file: paths.commerceFile },
    { id: "business-rules", file: paths.rulesFile },
    { id: "fulfillment-state", file: paths.fulfillmentFile },
    { id: "fulfillment-settings", file: paths.fulfillmentSettingsFile },
    { id: "website-data", file: paths.websiteFile },
  ] as const;
  const files = new Map<string, string>();
  const fingerprints: Array<[string, string]> = [
    ["directory:members", members.fingerprint],
    ["directory:orders", orders.fingerprint],
  ];
  const diagnostics = [members.diagnostic, orders.diagnostic].filter((item): item is AdminMemberDirectoryDiagnostic => Boolean(item));
  for (const source of sources) {
    try {
      const content = await fs.readFile(source.file, "utf8");
      files.set(source.file, content);
      fingerprints.push([`source:${source.id}`, createHash("sha256").update(content).digest("hex")]);
    } catch (error) {
      if (mode !== "production" && source.id !== "website-data" && isMissing(error)) {
        const content = JSON.stringify(adminMemberDirectoryLocalDefault(source.id, now));
        files.set(source.file, content);
        fingerprints.push([`source:${source.id}`, `missing-default:${source.id}:v1`]);
        diagnostics.push(sourceDiagnostic(`source-defaulted:${source.id}`, `${source.id} 實體來源不存在，已依本機 runtime 契約使用 canonical default。`));
        continue;
      }
      throw new AdminMemberDirectoryError("missing-source", `無法讀取 mandatory source：${source.file}`, { cause: error, source: source.id });
    }
  }
  for (const file of members.files) {
    try {
      const content = await fs.readFile(file, "utf8");
      files.set(file, content);
      fingerprints.push([`members/${path.basename(file)}`, createHash("sha256").update(content).digest("hex")]);
    } catch (error) {
      throw new AdminMemberDirectoryError("missing-source", `無法讀取 member source：${file}`, { cause: error, source: "members" });
    }
  }
  for (const file of orders.files) {
    try {
      const content = await fs.readFile(file, "utf8");
      files.set(file, content);
      fingerprints.push([`orders/${path.basename(file)}`, createHash("sha256").update(content).digest("hex")]);
    } catch (error) {
      throw new AdminMemberDirectoryError("missing-source", `無法讀取 order source：${file}`, { cause: error, source: "orders" });
    }
  }
  const hash = createHash("sha256");
  for (const [key, value] of fingerprints.sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(key).update("\0").update(value).update("\0");
  }
  return { fingerprint: hash.digest("hex"), files, memberFiles: members.files, orderFiles: orders.files, diagnostics };
}

function parseJson(content: string | undefined, file: string, source: AdminMemberDirectorySourceId) {
  if (content === undefined) throw new AdminMemberDirectoryError("missing-source", `快照缺少 mandatory source：${file}`, { source });
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new AdminMemberDirectoryError("invalid-source", `JSON 格式錯誤：${file}`, { cause: error, source });
  }
}

function validateCanonical<T>(source: AdminMemberDirectorySourceId, operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof AdminMemberDirectoryError) throw error;
    throw new AdminMemberDirectoryError("invalid-source", `Canonical ${source} validation failed`, { cause: error, source });
  }
}

function validateProfile(value: unknown, file: string): Member {
  if (!isObject(value) || typeof value.id !== "string" || !value.id || typeof value.createdAt !== "string") {
    throw new AdminMemberDirectoryError("invalid-source", `會員 profile 格式不完整：${file}`, { source: "members" });
  }
  return value as Member;
}

function validateOrder(value: unknown, file: string) {
  if (!isObject(value) || typeof value.orderNumber !== "string" || !value.orderNumber || typeof value.createdAt !== "string" || typeof value.status !== "string") {
    throw new AdminMemberDirectoryError("invalid-source", `訂單格式不完整：${file}`, { source: "orders" });
  }
  return value;
}

function validateSettings(value: unknown, file: string): LogisticsSettings {
  if (!isObject(value) || value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || !isObject(value.trackedEvents) || !isObject(value.gmailConnection)) {
    throw new AdminMemberDirectoryError("invalid-source", `物流設定格式不完整：${file}`);
  }
  return value as LogisticsSettings;
}

function validateWebsite(value: unknown, file: string): WebsiteData {
  if (!isObject(value) || !Number.isFinite(Number(value.version)) || typeof value.updatedAt !== "string" || !isObject(value.menu) || !Array.isArray(value.menu.products)) {
    throw new AdminMemberDirectoryError("invalid-source", `網站商品資料格式不完整：${file}`);
  }
  return value as unknown as WebsiteData;
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function orderMemberId(order: JsonObject) {
  return isObject(order.member) ? stringValue(order.member.memberId) : "";
}

function orderTotal(order: JsonObject) {
  return Math.max(0, numberValue(order.total ?? order.subtotal));
}

function orderPv(order: JsonObject) {
  if (!Array.isArray(order.items)) return 0;
  return order.items.reduce((sum, value) => {
    if (!isObject(value)) return sum;
    return sum + Math.max(0, numberValue(value.effectivePV ?? value.basePV)) * Math.max(0, numberValue(value.quantity || 1));
  }, 0);
}

function shippingSummary(order: JsonObject) {
  const mode = stringValue(order.orderMode);
  const store = isObject(order.store) ? stringValue(order.store.name ?? order.store.storeName) : "";
  return { shippingMethod: mode || "unknown", storeName: store };
}

function earliestNextCycle(cycles: SubscriptionCycle[], nowDate: string) {
  const terminal = new Set(["completed", "cancelled", "skipped", "uncollected"]);
  const candidates = cycles.filter((cycle) => !terminal.has(cycle.status)).sort((left, right) => left.plannedDate.localeCompare(right.plannedDate) || left.sequence - right.sequence);
  return candidates.find((cycle) => cycle.plannedDate >= nowDate) ?? candidates[0] ?? null;
}

function taipeiDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function availableCredit(state: MembershipCommerceState, registry: MemberIdentityRegistry, memberId: string, now: Date) {
  return Object.values(state.creditEntries).filter((entry) => canonicalizeAdminMemberId(registry, entry.memberId) === memberId && entry.status === "available" && Date.parse(entry.expiresAt) > now.getTime()).reduce((sum, entry) => sum + Math.max(0, entry.remainingAmount), 0);
}

function isGenericMemberDisplayName(value: string) {
  const normalized = value.trim().toLocaleLowerCase("en-US").replace(/\s+/gu, "");
  return normalized === "kdcoffee會員" || normalized === "kdcoffeemember" || normalized === "會員";
}

function memberName(profile: Member | undefined) {
  const displayName = profile?.displayName?.trim() ?? "";
  const pickupName = profile?.pickupName?.trim() ?? "";

  if (pickupName && (!displayName || isGenericMemberDisplayName(displayName))) {
    return pickupName;
  }

  return displayName || pickupName || "未填姓名";
}

function buildSnapshot(input: {
  capture: Capture;
  paths: AdminMemberDirectoryPaths;
  now: Date;
}): AdminMemberDirectorySnapshot {
  const { capture: source, paths, now } = input;
  const registry: MemberIdentityRegistry = validateCanonical("identity-registry", () => validateMemberIdentityRegistry(parseJson(source.files.get(paths.identityFile), paths.identityFile, "identity-registry")));
  const commerce: MembershipCommerceState = validateCanonical("commerce-state", () => validateMembershipCommerceState(parseJson(source.files.get(paths.commerceFile), paths.commerceFile, "commerce-state")));
  validateCanonical("business-rules", () => validateMembershipRulesStore(parseJson(source.files.get(paths.rulesFile), paths.rulesFile, "business-rules")));
  const fulfillment: FulfillmentStore = validateCanonical("fulfillment-state", () => validateFulfillmentStore(parseJson(source.files.get(paths.fulfillmentFile), paths.fulfillmentFile, "fulfillment-state")));
  validateCanonical("fulfillment-settings", () => validateSettings(parseJson(source.files.get(paths.fulfillmentSettingsFile), paths.fulfillmentSettingsFile, "fulfillment-settings"), paths.fulfillmentSettingsFile));
  validateCanonical("website-data", () => validateWebsite(parseJson(source.files.get(paths.websiteFile), paths.websiteFile, "website-data"), paths.websiteFile));
  const profiles = source.memberFiles.map((file) => validateProfile(parseJson(source.files.get(file), file, "members"), file));
  const orders = source.orderFiles.map((file) => validateOrder(parseJson(source.files.get(file), file, "orders"), file));
  const diagnostics: AdminMemberDirectoryDiagnostic[] = [...source.diagnostics];

  const profilesByCanonical = new Map<string, Member>();
  for (const profile of profiles) {
    const canonicalId = canonicalizeAdminMemberId(registry, profile.id);
    if (profilesByCanonical.has(canonicalId)) diagnostics.push({ code: "duplicate-profile", severity: "error", memberId: canonicalId, message: `多份 profile 對應至 ${canonicalId}` });
    if (!profilesByCanonical.has(canonicalId) || profile.id === canonicalId) profilesByCanonical.set(canonicalId, profile);
  }

  const presentation = [...new Set([...Object.keys(registry.members), ...profilesByCanonical.keys()])].map((memberId) => ({
    memberId,
    memberNumber: registry.members[memberId]?.memberNumber ?? "",
    displayName: memberName(profilesByCanonical.get(memberId)),
    accountStatus: registry.members[memberId]?.status ?? "unresolved",
  }));
  const organization = buildAdminMemberOrganization({ registry, referrals: commerce.referrals, members: presentation });
  const graphById = new Map(organization.nodes.map((node) => [node.memberId, node]));

  const ordersByMember = new Map<string, JsonObject[]>();
  for (const order of orders) {
    const rawMemberId = orderMemberId(order);
    if (!rawMemberId) {
      diagnostics.push({ code: "order-member-unresolved", severity: "warning", orderNumber: stringValue(order.orderNumber), message: "訂單缺少 canonical memberId；未以姓名、電話或 Email 猜配。" });
      continue;
    }
    const memberId = canonicalizeAdminMemberId(registry, rawMemberId);
    if (!registry.members[memberId] && !profilesByCanonical.has(memberId)) {
      diagnostics.push({ code: "order-member-unresolved", severity: "warning", memberId, orderNumber: stringValue(order.orderNumber), message: "訂單 memberId 無法解析至 canonical member；未以 PII 猜配。" });
      continue;
    }
    const list = ordersByMember.get(memberId) ?? [];
    list.push(order);
    ordersByMember.set(memberId, list);
  }

  const subscriptionsByMember = new Map<string, Subscription[]>();
  for (const subscription of Object.values(commerce.subscriptions)) {
    const memberId = canonicalizeAdminMemberId(registry, subscription.memberId);
    const list = subscriptionsByMember.get(memberId) ?? [];
    list.push(subscription);
    subscriptionsByMember.set(memberId, list);
  }
  const cyclesBySubscription = new Map<string, SubscriptionCycle[]>();
  for (const cycle of Object.values(commerce.cycles)) {
    const list = cyclesBySubscription.get(cycle.subscriptionId) ?? [];
    list.push(cycle);
    cyclesBySubscription.set(cycle.subscriptionId, list);
  }

  const memberIds = [...new Set([...Object.keys(registry.members), ...profilesByCanonical.keys(), ...organization.nodes.map((node) => node.memberId)])].sort();
  const details = new Map<string, AdminMemberDetail>();
  const rows: AdminMemberDirectoryRow[] = [];
  const currentDate = taipeiDate(now);

  for (const memberId of memberIds) {
    const canonical = registry.members[memberId];
    const profile = profilesByCanonical.get(memberId);
    const node = graphById.get(memberId) ?? null;
    const memberOrders = (ordersByMember.get(memberId) ?? []).sort((left, right) => stringValue(right.createdAt).localeCompare(stringValue(left.createdAt)));
    const orderSummaries: AdminMemberOrderSummary[] = memberOrders.map((order) => {
      const orderNumber = stringValue(order.orderNumber);
      const record = fulfillment.records[orderNumber];
      const mismatch = Boolean(record && record.orderId !== orderNumber);
      if (mismatch) diagnostics.push({ code: "fulfillment-order-mismatch", severity: "error", memberId, orderNumber, message: `Fulfillment record.orderId (${record.orderId}) 與訂單編號不一致。` });
      const fulfillmentStatus = mismatch ? null : record?.currentState ?? null;
      const completed = fulfillmentStatus ? fulfillmentStatus === "completed" : stringValue(order.status) === "completed";
      const shipping = shippingSummary(order);
      return {
        orderNumber,
        createdAt: stringValue(order.createdAt),
        orderStatus: stringValue(order.status),
        fulfillmentStatus,
        completed,
        total: orderTotal(order),
        ...shipping,
        effectivePvSnapshot: orderPv(order),
        diagnostic: mismatch ? "訂單與履約狀態關聯不一致" : null,
      };
    });
    const completedOrders = orderSummaries.filter((order) => order.completed);
    const subscriptions = (subscriptionsByMember.get(memberId) ?? []).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const subscriptionSummaries: AdminMemberSubscriptionSummary[] = subscriptions.map((subscription) => {
      const next = earliestNextCycle(cyclesBySubscription.get(subscription.subscriptionId) ?? [], currentDate);
      return {
        subscriptionId: subscription.subscriptionId,
        status: subscription.status,
        intervalDays: subscription.intervalDays,
        shippingMethod: subscription.shippingMethod,
        storeSelection: subscription.storeSelection,
        startedFromOrderId: subscription.startedFromOrderId,
        nextCycle: next ? {
          cycleId: next.cycleId,
          kind: next.kind,
          status: next.status,
          plannedDate: next.plannedDate,
          modificationDeadline: next.modificationDeadline,
          orderCreationDate: next.orderCreationDate,
          createdOrderId: next.createdOrderId,
        } : null,
      };
    });

    const rewards = Object.values(commerce.referralRewards).filter((reward) => canonicalizeAdminMemberId(registry, reward.beneficiaryMemberId) === memberId);
    const consumptions = Object.values(commerce.validConsumptionEvents).filter((event) => canonicalizeAdminMemberId(registry, event.memberId) === memberId);
    const rounds = Object.values(commerce.qualificationRounds).filter((round) => canonicalizeAdminMemberId(registry, round.memberId) === memberId);
    const creditReserved = Object.values(commerce.creditReservations).filter((reservation) => canonicalizeAdminMemberId(registry, reservation.memberId) === memberId && reservation.status === "reserved").reduce((sum, reservation) => sum + reservation.amount, 0);
    const creditAvailable = availableCredit(commerce, registry, memberId, now);
    const qualificationStatus = rounds.length ? "qualified" : rewards.map((reward) => reward.qualificationStatus).filter(Boolean).sort().at(-1) ?? "none";
    const identities = Object.values(registry.identities).filter((identity) => identity.memberId === memberId).map((identity) => ({ provider: identity.provider, status: identity.status, verifiedAt: identity.verifiedAt, linkedAt: identity.linkedAt }));
    const parentNode = node?.parentId ? graphById.get(node.parentId) : null;
    const relationshipHistory = Object.values(commerce.referrals).filter((relation) => {
      const parentId = canonicalizeAdminMemberId(registry, relation.referrerMemberId);
      const childId = canonicalizeAdminMemberId(registry, relation.referredMemberId);
      return parentId === memberId || childId === memberId;
    }).map((relation) => ({
      relationshipId: relation.relationshipId,
      parentId: canonicalizeAdminMemberId(registry, relation.referrerMemberId),
      childId: canonicalizeAdminMemberId(registry, relation.referredMemberId),
      status: relation.status,
      createdAt: relation.createdAt,
      updatedAt: relation.updatedAt,
    }));
    const memberDiagnostics = diagnostics.filter((item) => item.memberId === memberId);
    const detail: AdminMemberDetail = {
      revisionToken: source.fingerprint,
      identity: {
        memberId,
        memberNumber: canonical?.memberNumber ?? profile?.memberNumber ?? "",
        accountStatus: canonical?.status ?? "unresolved",
        createdAt: canonical?.createdAt ?? profile?.createdAt ?? "",
        updatedAt: canonical?.updatedAt ?? profile?.updatedAt ?? "",
        displayName: memberName(profile),
        pickupName: profile?.pickupName ?? "",
        phone: profile?.phone ?? "",
        email: profile?.email ?? "",
        loginEmail: profile?.loginEmail ?? "",
        lastLoginAt: profile?.lastLoginAt ?? "",
        avatarStatus: { customAvatar: Boolean(profile?.avatarUrl), providerPicture: Boolean(profile?.pictureUrl) },
        providers: identities,
        aliases: canonical?.legacyMemberIds ?? [],
      },
      organization: {
        node,
        parent: parentNode ? { memberId: parentNode.memberId, memberNumber: parentNode.memberNumber, displayName: parentNode.displayName } : null,
        children: (node?.childrenIds ?? []).map((childId) => graphById.get(childId)).filter((child): child is NonNullable<typeof child> => Boolean(child)).map((child) => ({ memberId: child.memberId, memberNumber: child.memberNumber, displayName: child.displayName })),
        relationshipHistory,
        findings: organization.diagnostics.filter((item) => item.memberId === memberId),
      },
      subscriptions: subscriptionSummaries,
      commerce: {
        creditAvailable,
        creditReserved,
        rewardCount: rewards.length,
        calculatedRewardAmount: rewards.reduce((sum, reward) => sum + reward.calculatedCreditAmount, 0),
        releasedRewardAmount: rewards.filter((reward) => reward.status === "released").reduce((sum, reward) => sum + reward.calculatedCreditAmount, 0),
        projectedRewardAmount: rewards.reduce((sum, reward) => sum + (reward.projectedCreditAmount ?? reward.calculatedCreditAmount), 0),
        validConsumption: consumptions.reduce((sum, event) => sum + event.validConsumptionAmount, 0),
        qualificationStatus,
        qualificationRoundCount: rounds.length,
        historicalEffectivePv: completedOrders.reduce((sum, order) => sum + order.effectivePvSnapshot, 0),
        rewardPvSnapshots: rewards.reduce((sum, reward) => sum + reward.rewardPV, 0),
      },
      orders: {
        orderCount: orderSummaries.length,
        completedOrderCount: completedOrders.length,
        completedSpend: completedOrders.reduce((sum, order) => sum + order.total, 0),
        allOrderAmount: orderSummaries.reduce((sum, order) => sum + order.total, 0),
        recent: orderSummaries.slice(0, 20),
      },
      diagnostics: memberDiagnostics,
    };
    details.set(memberId, detail);
    rows.push({
      memberId,
      memberNumber: detail.identity.memberNumber,
      displayName: detail.identity.displayName,
      pickupName: detail.identity.pickupName,
      phone: detail.identity.phone,
      email: detail.identity.email,
      loginEmail: detail.identity.loginEmail,
      accountStatus: detail.identity.accountStatus,
      createdAt: detail.identity.createdAt,
      subscriptionStatuses: [...new Set(subscriptions.map((subscription) => subscription.status))],
      directCount: node?.directCount ?? 0,
      teamCount: node?.teamCount ?? 0,
      orderCount: detail.orders.orderCount,
      completedOrderCount: detail.orders.completedOrderCount,
      completedSpend: detail.orders.completedSpend,
      allOrderAmount: detail.orders.allOrderAmount,
      creditAvailable,
      qualificationStatus,
      hasGraphAnomaly: Boolean(node?.anomalyCodes.length),
    });
  }

  rows.sort((left, right) => left.memberNumber.localeCompare(right.memberNumber) || left.memberId.localeCompare(right.memberId));
  return {
    revisionToken: source.fingerprint,
    generatedAt: now.toISOString(),
    rows,
    organization,
    diagnostics,
    details,
    canonicalAliases: new Map(Object.entries(registry.legacyAliases).map(([alias, memberId]) => [alias, canonicalizeAdminMemberId(registry, memberId)])),
    sourceCounts: {
      members: rows.length,
      identities: Object.values(registry.identities).filter((identity) => identity.status === "active").length,
      orders: orders.length,
      subscriptions: Object.keys(commerce.subscriptions).length,
      referrals: Object.keys(commerce.referrals).length,
    },
  };
}

export async function readAdminMemberDirectorySnapshot(options: {
  paths?: AdminMemberDirectoryPaths;
  retries?: number;
  now?: Date;
  mode?: AdminMemberDirectorySnapshotMode;
  productionRoot?: Omit<ProductionRootInput, "nodeEnv">;
  afterFirstCapture?: (attempt: number) => void | Promise<void>;
} = {}) {
  const mode = options.mode ?? resolveAdminMemberDirectorySnapshotMode();
  if (process.env.NODE_ENV === "production" && mode !== "production") {
    throw new AdminMemberDirectoryError("storage", "Production runtime 不允許切換至本機會員快照模式。");
  }
  if (mode === "production") {
    const contract = options.productionRoot ? null : getStorageRootContract();
    assertAdminMemberDirectoryProductionRoot(options.productionRoot
      ? { nodeEnv: "production", ...options.productionRoot }
      : {
          nodeEnv: "production",
          kdDataDir: process.env.KD_DATA_DIR,
          railwayVolumeMountPath: process.env.RAILWAY_VOLUME_MOUNT_PATH,
          resolvedRoot: contract?.root,
          storageRootSource: contract?.source,
        });
  }
  const paths = options.paths ?? resolveAdminMemberDirectoryPaths();
  const retries = Math.max(1, Math.min(5, options.retries ?? 3));
  const now = options.now ?? new Date();
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const first = await capture(paths, mode, now);
    await options.afterFirstCapture?.(attempt);
    const second = await capture(paths, mode, now);
    if (first.fingerprint === second.fingerprint) return buildSnapshot({ capture: second, paths, now });
  }
  throw new AdminMemberDirectoryError("unstable-snapshot", `Canonical member sources changed during ${retries} snapshot attempts; refusing torn data.`);
}

export function adminMemberDirectoryErrorPayload(error: AdminMemberDirectoryError, nodeEnv = process.env.NODE_ENV) {
  return {
    code: error.code,
    ...(nodeEnv === "production" || !error.source ? {} : { source: error.source }),
  };
}

export function getAdminMemberDetail(snapshot: AdminMemberDirectorySnapshot, rawMemberId: string) {
  if (!/^[A-Za-z0-9_-]{1,160}$/u.test(rawMemberId)) return null;
  const canonicalId = snapshot.canonicalAliases.get(rawMemberId) ?? rawMemberId;
  return snapshot.details.get(canonicalId) ?? null;
}

export function directoryPublicPayload(snapshot: AdminMemberDirectorySnapshot) {
  return {
    revisionToken: snapshot.revisionToken,
    generatedAt: snapshot.generatedAt,
    rows: snapshot.rows,
    diagnostics: snapshot.diagnostics,
    sourceCounts: snapshot.sourceCounts,
  };
}

export function organizationPublicPayload(snapshot: AdminMemberDirectorySnapshot) {
  return {
    revisionToken: snapshot.revisionToken,
    generatedAt: snapshot.generatedAt,
    ...snapshot.organization,
  };
}
