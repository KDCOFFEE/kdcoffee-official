import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "kd_admin_session";
const ADMIN_SESSION_VERSION = 2 as const;
const ADMIN_SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;
const DEFAULT_OWNER_ID = "owner";
const ADMIN_ID_PATTERN = /^[A-Za-z0-9._:@-]{1,100}$/u;

export const adminPermissions = {
  membersSensitiveRead: "members.sensitive.read",
} as const;

export type AdminPermission = (typeof adminPermissions)[keyof typeof adminPermissions];
export type AdminRole = "owner" | "admin";

export type VersionedAdminSession = {
  version: typeof ADMIN_SESSION_VERSION;
  adminId: string;
  role: AdminRole;
  permissions: AdminPermission[];
  expiresAt: number;
  legacy: false;
};

export type LegacyAdminSession = {
  version: 1;
  adminId: null;
  role: "admin";
  permissions: [];
  expiresAt: number;
  legacy: true;
};

export type AdminSession = VersionedAdminSession | LegacyAdminSession;

function secret() {
  return (process.env.ADMIN_SESSION_SECRET || process.env.AUTH_SESSION_SECRET || "").trim();
}

function sign(payload: string) {
  const key = secret();
  if (!key) throw new Error("尚未設定 ADMIN_SESSION_SECRET 或 AUTH_SESSION_SECRET");
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

function signaturesMatch(signature: string, expected: string) {
  const supplied = Buffer.from(signature);
  const trusted = Buffer.from(expected);
  return supplied.length === trusted.length && crypto.timingSafeEqual(supplied, trusted);
}

function permissionsForRole(role: AdminRole): AdminPermission[] {
  return role === "owner" ? [adminPermissions.membersSensitiveRead] : [];
}

function configuredOwnerId() {
  const configured = process.env.ADMIN_OWNER_ID?.trim();
  const adminId = configured || DEFAULT_OWNER_ID;
  if (!ADMIN_ID_PATTERN.test(adminId)) {
    throw new Error("ADMIN_OWNER_ID 格式不正確");
  }
  return adminId;
}

function isKnownPermission(value: unknown): value is AdminPermission {
  return value === adminPermissions.membersSensitiveRead;
}

function isValidVersionedSession(value: unknown): value is Omit<VersionedAdminSession, "legacy"> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const session = value as Record<string, unknown>;
  if (
    session.version !== ADMIN_SESSION_VERSION ||
    typeof session.adminId !== "string" ||
    !ADMIN_ID_PATTERN.test(session.adminId) ||
    (session.role !== "owner" && session.role !== "admin") ||
    !Array.isArray(session.permissions) ||
    !session.permissions.every(isKnownPermission) ||
    !Number.isFinite(Number(session.expiresAt))
  ) {
    return false;
  }

  const uniquePermissions = new Set(session.permissions);
  if (uniquePermissions.size !== session.permissions.length) return false;
  if (session.role === "owner" && !uniquePermissions.has(adminPermissions.membersSensitiveRead)) return false;
  if (session.role === "admin" && uniquePermissions.has(adminPermissions.membersSensitiveRead)) return false;
  return true;
}

export function createAdminSessionValue(input: {
  adminId?: string;
  role?: AdminRole;
  now?: Date;
} = {}) {
  const role = input.role ?? "owner";
  const adminId = input.adminId?.trim() || (role === "owner" ? configuredOwnerId() : "admin");
  if (!ADMIN_ID_PATTERN.test(adminId)) throw new Error("Admin ID 格式不正確");
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Admin session 時間不正確");
  const session = {
    version: ADMIN_SESSION_VERSION,
    adminId,
    role,
    permissions: permissionsForRole(role),
    expiresAt: now.getTime() + ADMIN_SESSION_LIFETIME_MS,
  } satisfies Omit<VersionedAdminSession, "legacy">;
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseAdminSessionValue(value: string | null | undefined, now = new Date()): AdminSession | null {
  if (!value || !Number.isFinite(now.getTime())) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (!payload || !signature || !signaturesMatch(signature, sign(payload))) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const data = parsed as Record<string, unknown>;
    const expiresAt = Number(data.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return null;

    if (isValidVersionedSession(data)) {
      return {
        version: ADMIN_SESSION_VERSION,
        adminId: data.adminId,
        role: data.role,
        permissions: [...data.permissions],
        expiresAt,
        legacy: false,
      };
    }

    if (data.version === undefined && data.role === "admin") {
      return {
        version: 1,
        adminId: null,
        role: "admin",
        permissions: [],
        expiresAt,
        legacy: true,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export async function readAdminSession(): Promise<AdminSession | null> {
  const jar = await cookies();
  return parseAdminSessionValue(jar.get(COOKIE_NAME)?.value);
}

export async function isAdminAuthenticated() {
  return Boolean(await readAdminSession());
}

export const adminCookieName = COOKIE_NAME;

export function isAdminPasswordConfigured() {
  return Boolean((process.env.ADMIN_PASSWORD || "").trim());
}

export function verifyAdminPassword(password: string) {
  const expected = (process.env.ADMIN_PASSWORD || "").trim();
  if (!expected || !password) return false;
  const suppliedDigest = crypto.createHash("sha256").update(password).digest();
  const expectedDigest = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(suppliedDigest, expectedDigest);
}
