import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "kd_admin_session";

function secret() {
  return (process.env.ADMIN_SESSION_SECRET || process.env.AUTH_SESSION_SECRET || "").trim();
}

function sign(payload: string) {
  const key = secret();
  if (!key) throw new Error("尚未設定 ADMIN_SESSION_SECRET 或 AUTH_SESSION_SECRET");
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

export function createAdminSessionValue() {
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ role: "admin", expiresAt })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export async function isAdminAuthenticated() {
  const jar = await cookies();
  const value = jar.get(COOKIE_NAME)?.value;
  if (!value) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.role === "admin" && Number(data.expiresAt) > Date.now();
  } catch {
    return false;
  }
}

export const adminCookieName = COOKIE_NAME;
