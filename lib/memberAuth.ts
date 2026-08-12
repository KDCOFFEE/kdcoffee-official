import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "crypto";
import { cookies } from "next/headers";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";

import { getMembersDir } from "@/lib/storagePaths";

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
  authProvider?: "line" | "email";
  passwordHash?: string;
  passwordSalt?: string;
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

  return id ? readMember(id) : null;
}

export async function saveMember(member: Member) {
  await fs.mkdir(membersDir(), { recursive: true });

  await fs.writeFile(
    path.join(membersDir(), `${member.id}.json`),
    JSON.stringify(member, null, 2),
    "utf8",
  );

  return member;
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

async function derivePassword(password: string, salt: string) {
  return (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
}

export async function registerEmailMember(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  const existing = (await readAllMembers()).some(
    (member) => member.email && normalizeEmail(member.email) === email,
  );

  if (existing) return null;

  await fs.mkdir(membersDir(), { recursive: true });

  const id = createHmac("sha256", secret())
    .update(`email:${email}`)
    .digest("hex")
    .slice(0, 24);
  const passwordSalt = randomBytes(16).toString("base64url");
  const passwordHash = (await derivePassword(password, passwordSalt)).toString(
    "base64url",
  );
  const now = new Date().toISOString();
  const member: Member = {
    id,
    displayName: "KD Coffee 會員",
    email,
    authProvider: "email",
    passwordHash,
    passwordSalt,
    createdAt: now,
    lastLoginAt: now,
    updatedAt: now,
  };

  try {
    await fs.writeFile(
      path.join(membersDir(), `${id}.json`),
      JSON.stringify(member, null, 2),
      { encoding: "utf8", flag: "wx" },
    );
    return member;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return null;
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
      candidate.email &&
      normalizeEmail(candidate.email) === email,
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
    displayName: member.displayName?.trim() || "KD Coffee 會員",
    lastLoginAt: now,
    updatedAt: now,
  };

  return saveMember(updated);
}

export async function upsertLineMember(profile: {
  sub: string;
  name?: string;
  picture?: string;
  email?: string;
}) {
  await fs.mkdir(membersDir(), { recursive: true });

  const id = createHmac("sha256", secret())
    .update(profile.sub)
    .digest("hex")
    .slice(0, 24);

  const existing = await readMember(id);
  const now = new Date().toISOString();

  return saveMember({
    ...existing,
    id,
    lineUserId: profile.sub,
    authProvider: "line",
    displayName:
      profile.name ||
      existing?.displayName ||
      "LINE 會員",
    pictureUrl:
      profile.picture ||
      existing?.pictureUrl,
    email:
      profile.email ||
      existing?.email,
    phone: existing?.phone,
    pickupName: existing?.pickupName,
    favoriteStore: existing?.favoriteStore,
    createdAt: existing?.createdAt || now,
    lastLoginAt: now,
    updatedAt: now,
  });
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
  const current = await readMember(memberId);
  if (!current) return null;

  const next: Member = {
    ...current,
    updatedAt: new Date().toISOString(),
  };

  if (patch.pickupName !== undefined) {
    next.pickupName = patch.pickupName;
  }

  if (patch.phone !== undefined) {
    next.phone = patch.phone;
  }

  if (patch.email !== undefined) {
    next.email = patch.email;
  }

  if (patch.favoriteStore !== undefined) {
    next.favoriteStore = patch.favoriteStore;
  }

  return saveMember(next);
}

export function randomState() {
  return randomBytes(24).toString("base64url");
}

export function safeReturnPath(
  value: string | null | undefined,
) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/member";
  }

  return value.slice(0, 300);
}
