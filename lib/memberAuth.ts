import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "crypto";
import { cookies } from "next/headers";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";

// @ts-expect-error -- Node's type-stripping test runner requires explicit TypeScript extensions.
import { getMembersDir } from "./storagePaths.ts";
// @ts-expect-error -- Node's type-stripping test runner requires explicit TypeScript extensions.
import { atomicWriteJson, withFileLock } from "./jsonFileStore.ts";
import {
  completeLineLink,
  ensureLegacyCanonicalMember,
  getIdentityRegistrySnapshot,
  getMemberIdentityState,
  hasMatchingEmailIdentity,
  IdentityConflictError,
  provisionCanonicalMember,
  resolveCanonicalMemberId,
  resolveMemberByIdentity,
// @ts-expect-error -- Node's type-stripping test runner requires explicit TypeScript extensions.
} from "./memberIdentity.ts";

export type FavoriteStore = {
  id: string;
  name: string;
  address: string;
  city?: string;
  district?: string;
};

export type Member = {
  id: string;
  lineUserId?: string;
  displayName?: string;
  pictureUrl?: string;
  email?: string;
  /** Email 登入憑證識別；聯絡 Email 可獨立更新。 */
  loginEmail?: string;
  memberNumber?: string;
  authProvider?: "line" | "email";
  passwordHash?: string;
  passwordSalt?: string;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: string;
  passwordResetRequestedAt?: string;
  phone?: string;
  pickupName?: string;
  favoriteStore?: FavoriteStore;
  createdAt: string;
  lastLoginAt: string;
  updatedAt?: string;
};

export const MEMBER_SESSION_COOKIE = "kd_member_session";

const membersDir = () => getMembersDir();
const scrypt = promisify(scryptCallback);
const PASSWORD_KEY_LENGTH = 64;
const DUMMY_PASSWORD_SALT = "kd-coffee-email-login";
const PASSWORD_RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const PASSWORD_RESET_COOLDOWN_MS = 60 * 1000;

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function secret() {
  const value = process.env.AUTH_SESSION_SECRET;

  if (
    process.env.NODE_ENV === "production" &&
    (!value || value.length < 32)
  ) {
    throw new Error(
      "AUTH_SESSION_SECRET must contain at least 32 characters in production",
    );
  }

  return value || "dev-only-change-this-secret-before-production";
}

function sign(value: string) {
  return createHmac("sha256", secret())
    .update(value)
    .digest("base64url");
}

export function memberSessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  };
}

export function createSessionToken(memberId: string) {
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      memberId,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 30,
    }),
  ).toString("base64url");

  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token?: string | null) {
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);

  if (
    left.length !== right.length ||
    !timingSafeEqual(left, right)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );

    if (
      parsed.v !== 1 ||
      !parsed.memberId ||
      parsed.exp < Date.now()
    ) {
      return null;
    }

    return parsed.memberId as string;
  } catch {
    return null;
  }
}

export async function setMemberSession(memberId: string) {
  const jar = await cookies();

  jar.set(
    MEMBER_SESSION_COOKIE,
    createSessionToken(memberId),
    memberSessionCookieOptions(
      process.env.NODE_ENV === "production",
    ),
  );
}

export async function clearMemberSession() {
  const jar = await cookies();

  jar.set(MEMBER_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/",
  });
}

export async function readMember(
  id: string,
): Promise<Member | null> {
  try {
    return JSON.parse(
      await fs.readFile(
        path.join(membersDir(), `${id}.json`),
        "utf8",
      ),
    );
  } catch {
    return null;
  }
}

export async function getCurrentMember(): Promise<Member | null> {
  const jar = await cookies();

  const id = verifySessionToken(
    jar.get(MEMBER_SESSION_COOKIE)?.value,
  );

  if (!id) return null;
  const canonicalId = await resolveCanonicalMemberId(id);
  const member = (await readMember(canonicalId)) || (canonicalId !== id ? await readMember(id) : null);
  if (!member) return null;

  try {
    return await attachCanonicalIdentity(member);
  } catch (error) {
    // 不因身份索引暫時不可用而中斷既有有效 session。
    console.error("Member identity resolution failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return member;
  }
}

export async function saveMember(member: Member) {
  await fs.mkdir(membersDir(), { recursive: true });
  const filePath = memberFilePath(member.id);
  return withFileLock(filePath, async () => {
    await atomicWriteJson(filePath, member);
    return member;
  });
}

function memberFilePath(memberId: string) {
  return path.join(membersDir(), `${memberId}.json`);
}

async function readAllMembers() {
  try {
    const files = (await fs.readdir(membersDir())).filter((file) =>
      file.endsWith(".json"),
    );
    const members = await Promise.all(
      files.map((file) => readMember(file.slice(0, -5))),
    );

    return members.filter((member): member is Member => Boolean(member));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function identityCandidates(member: Member) {
  const identities: Array<{ provider: "email" | "line"; subject: string }> = [];
  const loginEmail = member.loginEmail || (
    member.passwordHash && member.passwordSalt ? member.email : undefined
  );
  if (loginEmail) identities.push({ provider: "email", subject: normalizeEmail(loginEmail) });
  if (member.lineUserId) identities.push({ provider: "line", subject: member.lineUserId });
  return identities;
}

async function attachCanonicalIdentity(member: Member) {
  const canonical = await ensureLegacyCanonicalMember({
    memberId: member.id,
    identities: identityCandidates(member),
  });
  return { ...member, memberNumber: canonical.memberNumber };
}

async function updateMemberSafely(memberId: string, updater: (current: Member) => Member) {
  const filePath = memberFilePath(memberId);
  return withFileLock(filePath, async () => {
    const current = await readMember(memberId);
    if (!current) return null;
    const updated = updater(current);
    await atomicWriteJson(filePath, updated);
    return updated;
  });
}

async function derivePassword(password: string, salt: string) {
  return (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
}

function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function resetTokenMatches(storedHash: string | undefined, tokenHash: string) {
  if (!storedHash) return false;

  try {
    const stored = Buffer.from(storedHash, "base64url");
    const candidate = Buffer.from(tokenHash, "base64url");

    return stored.length === candidate.length && timingSafeEqual(stored, candidate);
  } catch {
    return false;
  }
}

export async function createEmailPasswordReset(emailInput: string) {
  const email = normalizeEmail(emailInput);
  const member = (await readAllMembers()).find(
    (candidate) =>
      candidate.authProvider === "email" &&
      candidate.email &&
      normalizeEmail(candidate.email) === email,
  );

  if (!member) return null;

  const filePath = memberFilePath(member.id);

  return withFileLock(filePath, async () => {
    const current = await readMember(member.id);
    if (
      !current ||
      current.authProvider !== "email" ||
      !current.email ||
      normalizeEmail(current.email) !== email
    ) {
      return null;
    }

    const lastRequestedAt = Date.parse(current.passwordResetRequestedAt || "");
    if (
      Number.isFinite(lastRequestedAt) &&
      Date.now() - lastRequestedAt < PASSWORD_RESET_COOLDOWN_MS
    ) {
      return null;
    }

    const token = randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString("base64url");
    const requestedAt = new Date();
    const expiresAt = new Date(requestedAt.getTime() + PASSWORD_RESET_TTL_MS);
    const updated: Member = {
      ...current,
      passwordResetTokenHash: hashPasswordResetToken(token),
      passwordResetExpiresAt: expiresAt.toISOString(),
      passwordResetRequestedAt: requestedAt.toISOString(),
      updatedAt: requestedAt.toISOString(),
    };

    await atomicWriteJson(filePath, updated);

    return {
      email: normalizeEmail(current.email),
      token,
      expiresAt: expiresAt.toISOString(),
    };
  });
}

export async function resetEmailMemberPassword(token: string, password: string) {
  const tokenHash = hashPasswordResetToken(token);
  const member = (await readAllMembers()).find(
    (candidate) => resetTokenMatches(candidate.passwordResetTokenHash, tokenHash),
  );

  if (!member) return false;

  const filePath = memberFilePath(member.id);

  return withFileLock(filePath, async () => {
    const current = await readMember(member.id);
    const expiresAt = Date.parse(current?.passwordResetExpiresAt || "");

    if (
      !current ||
      current.authProvider !== "email" ||
      !resetTokenMatches(current.passwordResetTokenHash, tokenHash) ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now()
    ) {
      return false;
    }

    const passwordSalt = randomBytes(16).toString("base64url");
    const passwordHash = (await derivePassword(password, passwordSalt)).toString(
      "base64url",
    );
    const updated: Member = {
      ...current,
      passwordSalt,
      passwordHash,
      updatedAt: new Date().toISOString(),
    };

    delete updated.passwordResetTokenHash;
    delete updated.passwordResetExpiresAt;
    delete updated.passwordResetRequestedAt;

    await atomicWriteJson(filePath, updated);
    return true;
  });
}

export async function registerEmailMember(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  const existing = (await readAllMembers()).some(
    (member) => {
      const loginEmail = member.loginEmail || (
        member.passwordHash && member.passwordSalt ? member.email : undefined
      );
      return Boolean(loginEmail && normalizeEmail(loginEmail) === email);
    },
  );

  if (existing || await resolveMemberByIdentity("email", email)) return null;

  await fs.mkdir(membersDir(), { recursive: true });
  const passwordSalt = randomBytes(16).toString("base64url");
  const passwordHash = (await derivePassword(password, passwordSalt)).toString(
    "base64url",
  );
  const now = new Date().toISOString();
  try {
    let created: Member | null = null;
    await provisionCanonicalMember({
      provider: "email",
      subject: email,
      persistMember: async (id, memberNumber) => {
        created = {
          id,
          memberNumber,
          displayName: "KD Coffee 會員",
          email,
          loginEmail: email,
          authProvider: "email",
          passwordHash,
          passwordSalt,
          createdAt: now,
          lastLoginAt: now,
          updatedAt: now,
        };
        await fs.writeFile(memberFilePath(id), `${JSON.stringify(created, null, 2)}\n`, {
          encoding: "utf8",
          flag: "wx",
          mode: 0o600,
        });
      },
    });
    return created as Member | null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST" || error instanceof IdentityConflictError) return null;
    throw error;
  }
}

export async function authenticateEmailMember(
  emailInput: string,
  password: string,
) {
  const email = normalizeEmail(emailInput);
  const member = (await readAllMembers()).find(
    (candidate) =>
      candidate.authProvider === "email" &&
      (candidate.loginEmail || candidate.email) &&
      normalizeEmail(candidate.loginEmail || candidate.email || "") === email,
  );

  const salt = member?.passwordSalt || DUMMY_PASSWORD_SALT;
  const candidateHash = await derivePassword(password, salt);
  let valid = false;

  if (member?.passwordHash && member.passwordSalt) {
    try {
      const storedHash = Buffer.from(member.passwordHash, "base64url");
      valid =
        storedHash.length === candidateHash.length &&
        timingSafeEqual(storedHash, candidateHash);
    } catch {
      valid = false;
    }
  }

  if (!member || !valid) return null;

  const now = new Date().toISOString();
  const updated: Member = {
    ...member,
    email,
    loginEmail: email,
    displayName: member.displayName?.trim() || "KD Coffee 會員",
    lastLoginAt: now,
    updatedAt: now,
  };

  const canonical = await attachCanonicalIdentity(updated);
  return saveMember(canonical);
}

export type LineLoginResult =
  | { status: "authenticated"; member: Member }
  | { status: "link-required" };

export async function loginLineMember(profile: {
  sub: string;
  name?: string;
  picture?: string;
  email?: string;
}): Promise<LineLoginResult> {
  await fs.mkdir(membersDir(), { recursive: true });

  const mapped = await resolveMemberByIdentity("line", profile.sub);
  if (mapped) {
    const current = await readMember(mapped.memberId);
    if (!current) throw new Error("LINE 會員資料不存在");
    const updated = await updateMemberSafely(current.id, (latest) => ({
      ...latest,
      lineUserId: profile.sub,
      displayName: profile.name || latest.displayName || "LINE 會員",
      pictureUrl: profile.picture || latest.pictureUrl,
      lastLoginAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    if (!updated) throw new Error("LINE 會員資料不存在");
    return { status: "authenticated", member: { ...updated, memberNumber: mapped.memberNumber } };
  }

  const legacyId = createHmac("sha256", secret())
    .update(profile.sub)
    .digest("hex")
    .slice(0, 24);

  const existing = (await readMember(legacyId)) || (await readAllMembers()).find(
    (candidate) => candidate.lineUserId === profile.sub,
  );
  const now = new Date().toISOString();

  if (existing) {
    const canonical = await attachCanonicalIdentity(existing);
    const updated = await updateMemberSafely(existing.id, (latest) => ({
      ...latest,
      lineUserId: profile.sub,
      authProvider: latest.passwordHash ? latest.authProvider : "line",
      displayName: profile.name || latest.displayName || "LINE 會員",
      pictureUrl: profile.picture || latest.pictureUrl,
      email: latest.email || profile.email,
      lastLoginAt: now,
      updatedAt: now,
    }));
    if (!updated) throw new Error("LINE 會員資料不存在");
    return { status: "authenticated", member: { ...updated, memberNumber: canonical.memberNumber } };
  }

  if (profile.email) {
    const normalized = normalizeEmail(profile.email);
    const legacyLoginEmails = (await readAllMembers()).flatMap((candidate) => {
      const loginEmail = candidate.loginEmail || (candidate.passwordHash ? candidate.email : undefined);
      return loginEmail ? [loginEmail] : [];
    });
    const legacyEmailCredential = hasMatchingEmailIdentity(normalized, legacyLoginEmails);
    if (legacyEmailCredential || await resolveMemberByIdentity("email", normalized)) {
      return { status: "link-required" };
    }
  }

  let created: Member | null = null;
  await provisionCanonicalMember({
    provider: "line",
    subject: profile.sub,
    persistMember: async (id, memberNumber) => {
      created = {
        id,
        memberNumber,
        lineUserId: profile.sub,
        authProvider: "line",
        displayName: profile.name || "LINE 會員",
        pictureUrl: profile.picture,
        email: profile.email,
        createdAt: now,
        lastLoginAt: now,
        updatedAt: now,
      };
      await fs.writeFile(memberFilePath(id), `${JSON.stringify(created, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
    },
  });
  if (!created) throw new Error("LINE 會員建立失敗");
  return { status: "authenticated", member: created as Member };
}

/** 保留舊函式名稱供既有內部呼叫相容；新流程應使用 loginLineMember。 */
export async function upsertLineMember(profile: Parameters<typeof loginLineMember>[0]) {
  const result = await loginLineMember(profile);
  if (result.status !== "authenticated") throw new IdentityConflictError("需要先完成帳號連結");
  return result.member;
}

export async function linkLineIdentityToMember(input: {
  transactionId: string;
  member: Member;
  state: string;
  profile: { sub: string; name?: string; picture?: string };
}) {
  const result = await completeLineLink({
    transactionId: input.transactionId,
    memberId: input.member.id,
    state: input.state,
    lineSubject: input.profile.sub,
    persistLinkedMember: async () => {
      const updated = await updateMemberSafely(input.member.id, (latest) => ({
        ...latest,
        lineUserId: input.profile.sub,
        displayName: latest.displayName || input.profile.name || "KD Coffee 會員",
        pictureUrl: latest.pictureUrl || input.profile.picture,
        updatedAt: new Date().toISOString(),
      }));
      if (!updated) throw new Error("會員資料不存在");
    },
  });
  return result;
}

export async function updateMemberProfile(
  memberId: string,
  patch: {
    pickupName?: string;
    phone?: string;
    email?: string;
    favoriteStore?: FavoriteStore;
  },
) {
  return updateMemberSafely(memberId, (current) => {
    const next: Member = { ...current, updatedAt: new Date().toISOString() };
    if (patch.pickupName !== undefined) next.pickupName = patch.pickupName;
    if (patch.phone !== undefined) next.phone = patch.phone;
    if (patch.email !== undefined) next.email = patch.email;
    if (patch.favoriteStore !== undefined) next.favoriteStore = patch.favoriteStore;
    return next;
  });
}

export async function getMemberLoginMethods(member: Member) {
  const canonical = await attachCanonicalIdentity(member);
  const state = await getMemberIdentityState(canonical.id);
  return {
    memberNumber: state.member?.memberNumber || canonical.memberNumber || "",
    emailLinked: state.providers.includes("email"),
    lineLinked: state.providers.includes("line"),
  };
}

export async function getMemberIdentityAdminSummary() {
  const members = await readAllMembers();
  const registry = await getIdentityRegistrySnapshot();
  const activeIdentities = Object.values(registry.identities).filter((item) => item.status === "active");
  const emailSignals = new Map<string, number>();
  for (const member of members) {
    if (!member.email) continue;
    const normalized = normalizeEmail(member.email);
    emailSignals.set(normalized, (emailSignals.get(normalized) || 0) + 1);
  }
  const possibleDuplicateGroups = [...emailSignals.values()].filter((count) => count > 1).length;
  return {
    memberCount: members.length,
    numberedCount: Object.keys(registry.members).length,
    pendingNumberCount: Math.max(0, members.length - Object.keys(registry.members).length),
    emailIdentityCount: activeIdentities.filter((item) => item.provider === "email").length,
    lineIdentityCount: activeIdentities.filter((item) => item.provider === "line").length,
    bothLinkedCount: Object.keys(registry.members).filter((memberId) => {
      const providers = new Set(activeIdentities.filter((item) => item.memberId === memberId).map((item) => item.provider));
      return providers.has("email") && providers.has("line");
    }).length,
    hybridLegacyCount: members.filter((item) => Boolean(item.lineUserId && item.email)).length,
    possibleDuplicateCount: possibleDuplicateGroups,
    auditCount: registry.auditLog.length,
  };
}

export function randomState() {
  return randomBytes(24).toString("base64url");
}

export function safeReturnPath(
  value: string | null | undefined,
) {
  return value === "/checkout" || value === "/member"
    ? value
    : "/member";
}
