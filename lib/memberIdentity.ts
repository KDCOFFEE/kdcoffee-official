import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";

// @ts-expect-error -- Node's type-stripping test runner requires explicit TypeScript extensions.
import { atomicWriteJson, withFileLock } from "./jsonFileStore.ts";
// @ts-expect-error -- Node's type-stripping test runner requires explicit TypeScript extensions.
import { getMemberIdentityRegistryFile } from "./storagePaths.ts";

export const MEMBER_IDENTITY_SCHEMA_VERSION = 1 as const;
export const MEMBER_NUMBER_PATTERN = /^KD-\d{6,9}$/;
export const LINE_LINK_TTL_MS = 10 * 60 * 1000;

export type IdentityProvider = "email" | "line";
export type CanonicalMemberStatus = "active" | "possible-duplicate" | "merged-tombstone";
export type IdentityStatus = "active" | "unlinked";
export type LinkTransactionStatus = "pending" | "completed" | "rejected" | "expired";

export type CanonicalMemberRecord = {
  memberId: string;
  memberNumber: string;
  status: CanonicalMemberStatus;
  legacyMemberIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type MemberIdentityRecord = {
  identityId: string;
  memberId: string;
  provider: IdentityProvider;
  subjectHash: string;
  verifiedAt: string;
  linkedAt: string;
  status: IdentityStatus;
};

export type IdentityLinkTransaction = {
  transactionId: string;
  memberId: string;
  provider: IdentityProvider;
  stateHash: string;
  status: LinkTransactionStatus;
  createdAt: string;
  expiresAt: string;
  completedAt?: string;
  identityId?: string;
  safeReason?: string;
};

export type IdentityAuditRecord = {
  auditId: string;
  action: "member-canonicalized" | "identity-linked" | "identity-link-rejected";
  memberId: string;
  provider?: IdentityProvider;
  occurredAt: string;
  result: "success" | "rejected";
  safeReason: string;
  actorType: "member" | "system";
  correlationId: string;
};

export type MemberIdentityRegistry = {
  schemaVersion: typeof MEMBER_IDENTITY_SCHEMA_VERSION;
  revision: number;
  nextMemberSequence: number;
  createdAt: string;
  updatedAt: string;
  members: Record<string, CanonicalMemberRecord>;
  identities: Record<string, MemberIdentityRecord>;
  legacyAliases: Record<string, string>;
  linkTransactions: Record<string, IdentityLinkTransaction>;
  auditLog: IdentityAuditRecord[];
};

export class IdentityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentityValidationError";
  }
}

export class IdentityConflictError extends Error {
  constructor(message = "此登入方式已連結至其他會員") {
    super(message);
    this.name = "IdentityConflictError";
  }
}

function identitySecret() {
  const value = (
    process.env.MEMBER_IDENTITY_SECRET || process.env.AUTH_SESSION_SECRET || ""
  ).trim();

  if (process.env.NODE_ENV === "production" && value.length < 32) {
    throw new Error("MEMBER_IDENTITY_SECRET 或 AUTH_SESSION_SECRET 至少需要 32 個字元");
  }

  return value || "dev-only-member-identity-secret";
}

export function normalizeIdentityEmail(value: string) {
  return value.trim().toLowerCase();
}

export function hasMatchingEmailIdentity(email: string, knownLoginEmails: Iterable<string>) {
  const candidate = normalizeIdentityEmail(email);
  return Boolean(candidate) && [...knownLoginEmails].some(
    (known) => normalizeIdentityEmail(known) === candidate,
  );
}

export function canUnlinkIdentity(activeIdentityCount: number) {
  return Number.isSafeInteger(activeIdentityCount) && activeIdentityCount > 1;
}

export function identitySubjectHash(provider: IdentityProvider, subject: string) {
  const normalized = provider === "email" ? normalizeIdentityEmail(subject) : subject.trim();
  if (!normalized) throw new IdentityValidationError("登入識別資料不可為空");

  return createHmac("sha256", identitySecret())
    .update(`${provider}:${normalized}`)
    .digest("base64url");
}

function identityKey(provider: IdentityProvider, subjectHash: string) {
  return `${provider}:${subjectHash}`;
}

function nowIso(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new IdentityValidationError("時間格式無效");
  return now.toISOString();
}

function randomId(prefix: string) {
  return `${prefix}_${randomBytes(16).toString("base64url")}`;
}

export function formatMemberNumber(sequence: number) {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 999_999_999) {
    throw new IdentityValidationError("會員編號序號超出範圍");
  }
  return `KD-${String(sequence).padStart(6, "0")}`;
}

function emptyRegistry(now = new Date()): MemberIdentityRegistry {
  const timestamp = nowIso(now);
  return {
    schemaVersion: MEMBER_IDENTITY_SCHEMA_VERSION,
    revision: 0,
    nextMemberSequence: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    members: {},
    identities: {},
    legacyAliases: {},
    linkTransactions: {},
    auditLog: [],
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function validateMemberIdentityRegistry(value: unknown): MemberIdentityRegistry {
  if (!isObject(value)) throw new IdentityValidationError("會員身份資料格式無效");
  if (value.schemaVersion !== MEMBER_IDENTITY_SCHEMA_VERSION) {
    throw new IdentityValidationError("不支援的會員身份資料版本");
  }
  if (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0) {
    throw new IdentityValidationError("會員身份資料修訂編號無效");
  }
  if (!Number.isSafeInteger(value.nextMemberSequence) || Number(value.nextMemberSequence) < 1) {
    throw new IdentityValidationError("下一個會員編號無效");
  }
  if (!isIsoTimestamp(value.createdAt) || !isIsoTimestamp(value.updatedAt)) {
    throw new IdentityValidationError("會員身份資料時間無效");
  }
  if (
    !isObject(value.members) ||
    !isObject(value.identities) ||
    !isObject(value.legacyAliases) ||
    !isObject(value.linkTransactions) ||
    !Array.isArray(value.auditLog)
  ) {
    throw new IdentityValidationError("會員身份資料集合無效");
  }

  const memberNumbers = new Set<string>();
  for (const [memberId, raw] of Object.entries(value.members)) {
    if (
      !isObject(raw) ||
      raw.memberId !== memberId ||
      !memberId ||
      !MEMBER_NUMBER_PATTERN.test(String(raw.memberNumber)) ||
      !["active", "possible-duplicate", "merged-tombstone"].includes(String(raw.status))
    ) {
      throw new IdentityValidationError("會員核心資料無效");
    }
    if (memberNumbers.has(String(raw.memberNumber))) {
      throw new IdentityValidationError("會員編號重複");
    }
    memberNumbers.add(String(raw.memberNumber));
    if (!Array.isArray(raw.legacyMemberIds) || !isIsoTimestamp(raw.createdAt) || !isIsoTimestamp(raw.updatedAt)) {
      throw new IdentityValidationError("會員相容資料無效");
    }
  }

  for (const [key, raw] of Object.entries(value.identities)) {
    if (
      !isObject(raw) ||
      typeof raw.identityId !== "string" ||
      !raw.identityId ||
      !["email", "line"].includes(String(raw.provider)) ||
      !["active", "unlinked"].includes(String(raw.status)) ||
      typeof raw.subjectHash !== "string" ||
      key !== identityKey(raw.provider as IdentityProvider, raw.subjectHash) ||
      typeof raw.memberId !== "string" ||
      !value.members[raw.memberId] ||
      !isIsoTimestamp(raw.verifiedAt) ||
      !isIsoTimestamp(raw.linkedAt)
    ) {
      throw new IdentityValidationError("登入方式資料無效");
    }
  }

  for (const [legacyId, canonicalId] of Object.entries(value.legacyAliases)) {
    if (!legacyId || typeof canonicalId !== "string" || !value.members[canonicalId]) {
      throw new IdentityValidationError("既有會員對照資料無效");
    }
  }

  for (const [transactionId, raw] of Object.entries(value.linkTransactions)) {
    if (
      !isObject(raw) ||
      raw.transactionId !== transactionId ||
      typeof raw.memberId !== "string" ||
      !value.members[raw.memberId] ||
      !["email", "line"].includes(String(raw.provider)) ||
      !["pending", "completed", "rejected", "expired"].includes(String(raw.status)) ||
      typeof raw.stateHash !== "string" ||
      !isIsoTimestamp(raw.createdAt) ||
      !isIsoTimestamp(raw.expiresAt)
    ) {
      throw new IdentityValidationError("登入方式連結資料無效");
    }
  }


  for (const raw of value.auditLog) {
    if (
      !isObject(raw) ||
      typeof raw.auditId !== "string" ||
      !["member-canonicalized", "identity-linked", "identity-link-rejected"].includes(String(raw.action)) ||
      typeof raw.memberId !== "string" ||
      !["success", "rejected"].includes(String(raw.result)) ||
      typeof raw.safeReason !== "string" ||
      !["member", "system"].includes(String(raw.actorType)) ||
      typeof raw.correlationId !== "string" ||
      !isIsoTimestamp(raw.occurredAt)
    ) {
      throw new IdentityValidationError("會員身份稽核資料無效");
    }
  }

  return value as MemberIdentityRegistry;
}

async function readRegistry(filePath = getMemberIdentityRegistryFile()) {
  try {
    return validateMemberIdentityRegistry(JSON.parse(await fs.readFile(filePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyRegistry();
    throw error;
  }
}

async function writeRegistry(filePath: string, registry: MemberIdentityRegistry, now = new Date()) {
  registry.revision += 1;
  registry.updatedAt = nowIso(now);
  validateMemberIdentityRegistry(registry);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await atomicWriteJson(filePath, registry);
}

async function withRegistryLock<T>(operation: (filePath: string) => Promise<T>) {
  const filePath = getMemberIdentityRegistryFile();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  return withFileLock(filePath, () => operation(filePath));
}

function appendAudit(
  registry: MemberIdentityRegistry,
  input: Omit<IdentityAuditRecord, "auditId" | "occurredAt">,
  now = new Date(),
) {
  registry.auditLog.push({
    auditId: randomId("audit"),
    occurredAt: nowIso(now),
    ...input,
  });
  if (registry.auditLog.length > 5_000) registry.auditLog.splice(0, registry.auditLog.length - 5_000);
}

function allocateMember(
  registry: MemberIdentityRegistry,
  memberId: string,
  legacyMemberIds: string[],
  now = new Date(),
) {
  const timestamp = nowIso(now);
  const record: CanonicalMemberRecord = {
    memberId,
    memberNumber: formatMemberNumber(registry.nextMemberSequence++),
    status: "active",
    legacyMemberIds: [...new Set(legacyMemberIds)],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  registry.members[memberId] = record;
  for (const legacyId of record.legacyMemberIds) registry.legacyAliases[legacyId] = memberId;
  return record;
}

function bindIdentity(
  registry: MemberIdentityRegistry,
  memberId: string,
  provider: IdentityProvider,
  subject: string,
  now = new Date(),
) {
  const subjectHash = identitySubjectHash(provider, subject);
  const key = identityKey(provider, subjectHash);
  const existing = registry.identities[key];
  if (existing?.status === "active" && existing.memberId !== memberId) throw new IdentityConflictError();
  if (existing?.status === "active") return existing;

  const timestamp = nowIso(now);
  const identity: MemberIdentityRecord = {
    identityId: randomId("ident"),
    memberId,
    provider,
    subjectHash,
    verifiedAt: timestamp,
    linkedAt: timestamp,
    status: "active",
  };
  registry.identities[key] = identity;
  return identity;
}

export async function ensureLegacyCanonicalMember(input: {
  memberId: string;
  identities: Array<{ provider: IdentityProvider; subject: string }>;
  now?: Date;
}) {
  return withRegistryLock(async (filePath) => {
    const registry = await readRegistry(filePath);
    const now = input.now ?? new Date();
    const canonicalId = registry.legacyAliases[input.memberId] || input.memberId;
    let changed = false;
    let member = registry.members[canonicalId];
    if (!member) {
      member = allocateMember(registry, canonicalId, [input.memberId], now);
      changed = true;
    }

    for (const identity of input.identities) {
      const hash = identitySubjectHash(identity.provider, identity.subject);
      const key = identityKey(identity.provider, hash);
      if (!registry.identities[key] || registry.identities[key].status !== "active") changed = true;
      bindIdentity(registry, canonicalId, identity.provider, identity.subject, now);
    }
    if (changed) {
      appendAudit(registry, {
        action: "member-canonicalized",
        memberId: canonicalId,
        result: "success",
        safeReason: "既有會員已建立相容身份索引",
        actorType: "system",
        correlationId: `canonicalize:${input.memberId}`,
      }, now);
      await writeRegistry(filePath, registry, now);
    }
    return member;
  });
}

export async function provisionCanonicalMember(input: {
  provider: IdentityProvider;
  subject: string;
  persistMember: (memberId: string, memberNumber: string) => Promise<void>;
  now?: Date;
}) {
  return withRegistryLock(async (filePath) => {
    const registry = await readRegistry(filePath);
    const subjectHash = identitySubjectHash(input.provider, input.subject);
    if (registry.identities[identityKey(input.provider, subjectHash)]?.status === "active") {
      throw new IdentityConflictError();
    }

    const now = input.now ?? new Date();
    const memberId = randomId("member");
    const member = allocateMember(registry, memberId, [], now);
    const identity = bindIdentity(registry, memberId, input.provider, input.subject, now);
    await input.persistMember(memberId, member.memberNumber);
    appendAudit(registry, {
      action: "identity-linked",
      memberId,
      provider: input.provider,
      result: "success",
      safeReason: "建立會員時完成第一個登入方式",
      actorType: "system",
      correlationId: identity.identityId,
    }, now);
    await writeRegistry(filePath, registry, now);
    return { member, identity };
  });
}

export async function resolveMemberByIdentity(provider: IdentityProvider, subject: string) {
  const registry = await readRegistry();
  const hash = identitySubjectHash(provider, subject);
  const identity = registry.identities[identityKey(provider, hash)];
  if (!identity || identity.status !== "active") return null;
  return registry.members[identity.memberId] ?? null;
}

export async function resolveCanonicalMemberId(memberId: string) {
  const registry = await readRegistry();
  return registry.legacyAliases[memberId] || (registry.members[memberId] ? memberId : memberId);
}

export async function getCanonicalMemberRecord(memberId: string) {
  const registry = await readRegistry();
  const canonicalId = registry.legacyAliases[memberId] || memberId;
  return registry.members[canonicalId] ?? null;
}

export async function createLineLinkTransaction(memberId: string, state: string, now = new Date()) {
  return withRegistryLock(async (filePath) => {
    const registry = await readRegistry(filePath);
    const canonicalId = registry.legacyAliases[memberId] || memberId;
    if (!registry.members[canonicalId]) throw new IdentityValidationError("會員身份尚未建立");
    const createdAt = nowIso(now);
    const transaction: IdentityLinkTransaction = {
      transactionId: randomId("link"),
      memberId: canonicalId,
      provider: "line",
      stateHash: identitySubjectHash("line", `state:${state}`),
      status: "pending",
      createdAt,
      expiresAt: nowIso(new Date(now.getTime() + LINE_LINK_TTL_MS)),
    };
    registry.linkTransactions[transaction.transactionId] = transaction;
    await writeRegistry(filePath, registry, now);
    return transaction;
  });
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function completeLineLink(input: {
  transactionId: string;
  memberId: string;
  state: string;
  lineSubject: string;
  persistLinkedMember: () => Promise<void>;
  now?: Date;
}) {
  return withRegistryLock(async (filePath) => {
    const registry = await readRegistry(filePath);
    const now = input.now ?? new Date();
    const transaction = registry.linkTransactions[input.transactionId];
    const canonicalId = registry.legacyAliases[input.memberId] || input.memberId;
    const suppliedStateHash = identitySubjectHash("line", `state:${input.state}`);

    if (transaction?.status === "completed" && transaction.memberId === canonicalId) {
      const replayHash = identitySubjectHash("line", input.lineSubject);
      const replayIdentity = registry.identities[identityKey("line", replayHash)];
      if (
        !safeEqual(transaction.stateHash, suppliedStateHash) ||
        !replayIdentity ||
        replayIdentity.identityId !== transaction.identityId ||
        replayIdentity.memberId !== canonicalId
      ) {
        throw new IdentityValidationError("登入方式連結重送驗證失敗");
      }
      return { status: "already-completed" as const, member: registry.members[canonicalId] };
    }

    const reject = async (reason: string) => {
      if (transaction) {
        transaction.status = Date.parse(transaction.expiresAt) <= now.getTime() ? "expired" : "rejected";
        transaction.safeReason = reason;
      }
      appendAudit(registry, {
        action: "identity-link-rejected",
        memberId: canonicalId,
        provider: "line",
        result: "rejected",
        safeReason: reason,
        actorType: "member",
        correlationId: input.transactionId,
      }, now);
      await writeRegistry(filePath, registry, now);
      throw new IdentityValidationError(reason);
    };

    if (!transaction || transaction.provider !== "line" || transaction.memberId !== canonicalId) {
      return reject("登入方式連結申請無效");
    }
    if (transaction.status !== "pending") return reject("登入方式連結申請已使用");
    if (Date.parse(transaction.expiresAt) <= now.getTime()) return reject("登入方式連結申請已逾期");
    if (!safeEqual(transaction.stateHash, suppliedStateHash)) return reject("登入方式連結驗證失敗");

    let identity: MemberIdentityRecord;
    try {
      identity = bindIdentity(registry, canonicalId, "line", input.lineSubject, now);
    } catch (error) {
      if (error instanceof IdentityConflictError) return reject("此 LINE 已連結至其他會員");
      throw error;
    }

    await input.persistLinkedMember();
    transaction.status = "completed";
    transaction.completedAt = nowIso(now);
    transaction.identityId = identity.identityId;
    appendAudit(registry, {
      action: "identity-linked",
      memberId: canonicalId,
      provider: "line",
      result: "success",
      safeReason: "會員完成 LINE 連結驗證",
      actorType: "member",
      correlationId: input.transactionId,
    }, now);
    await writeRegistry(filePath, registry, now);
    return { status: "linked" as const, member: registry.members[canonicalId] };
  });
}

export async function getMemberIdentityState(memberId: string) {
  const registry = await readRegistry();
  const canonicalId = registry.legacyAliases[memberId] || memberId;
  const member = registry.members[canonicalId] ?? null;
  const providers = Object.values(registry.identities)
    .filter((identity) => identity.memberId === canonicalId && identity.status === "active")
    .map((identity) => identity.provider);
  return { member, providers: [...new Set(providers)] };
}

export async function getIdentityRegistrySnapshot() {
  return readRegistry();
}
