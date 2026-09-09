import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import { getIdentityRegistrySnapshot } from "./memberIdentity";
import { getActiveMembershipRules } from "./membershipBusinessRules";
import { referralCodeForMember } from "./membershipCommerce";

export const REFERRAL_ATTRIBUTION_COOKIE = "kd_referral_attribution";
export const REFERRAL_CODE_PATTERN = /^KD[A-F0-9]{10}$/;

function attributionSecret() {
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

function signAttributionPayload(payload: string) {
  return createHmac("sha256", attributionSecret())
    .update(`referral-attribution:${payload}`)
    .digest("base64url");
}

export function createReferralAttributionToken(
  referralCode: string,
  sessionMinutes: number,
) {
  const normalized = normalizeReferralAttributionCode(
    referralCode,
  );

  if (!normalized) {
    throw new Error("Invalid referral attribution code");
  }

  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      referralCode: normalized,
      exp: Date.now() + sessionMinutes * 60 * 1000,
    }),
  ).toString("base64url");

  return `${payload}.${signAttributionPayload(payload)}`;
}

export function verifyReferralAttributionToken(
  token?: string | null,
) {
  if (!token) return "";

  const parts = token.split(".");

  if (parts.length !== 2) return "";

  const [payload, signature] = parts;

  if (!payload || !signature) return "";

  const expected = signAttributionPayload(payload);

  const left = Buffer.from(signature);
  const right = Buffer.from(expected);

  if (
    left.length !== right.length ||
    !timingSafeEqual(left, right)
  ) {
    return "";
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as {
      v?: unknown;
      referralCode?: unknown;
      exp?: unknown;
    };

    if (
      parsed.v !== 1 ||
      typeof parsed.exp !== "number" ||
      !Number.isFinite(parsed.exp) ||
      parsed.exp <= Date.now()
    ) {
      return "";
    }

    return normalizeReferralAttributionCode(
      parsed.referralCode,
    );
  } catch {
    return "";
  }
}

export function normalizeReferralAttributionCode(value: unknown) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(normalized) ? normalized : "";
}

export async function getReferralAttributionPolicy() {
  const active = await getActiveMembershipRules();
  const referral = active.rules.referral;

  return {
    enabled: referral.referralAttributionEnabled,
    sessionMinutes: referral.referralAttributionSessionMinutes,
  };
}

export async function isValidReferralAttributionCode(value: unknown) {
  const normalized = normalizeReferralAttributionCode(value);

  if (!normalized) return false;

  const registry = await getIdentityRegistrySnapshot();

  return Object.keys(registry.members).some(
    (memberId) =>
      referralCodeForMember(memberId) === normalized,
  );
}

export async function readReferralAttributionCookie() {
  const jar = await cookies();

  return verifyReferralAttributionToken(
    jar.get(REFERRAL_ATTRIBUTION_COOKIE)?.value,
  );
}

export function setReferralAttributionCookie(
  response: NextResponse,
  referralCode: string,
  sessionMinutes: number,
) {
  response.cookies.set(
    REFERRAL_ATTRIBUTION_COOKIE,
    createReferralAttributionToken(
      referralCode,
      sessionMinutes,
    ),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: sessionMinutes * 60,
    },
  );
}

export function clearReferralAttributionCookie(
  response: NextResponse,
) {
  response.cookies.set(
    REFERRAL_ATTRIBUTION_COOKIE,
    "",
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(0),
    },
  );
}

export function referralCodeFromReturnPath(value: string) {
  try {
    const url = new URL(value, "https://kdcoffee.local");

    if (url.pathname !== "/member") return "";

    return normalizeReferralAttributionCode(
      url.searchParams.get("ref"),
    );
  } catch {
    return "";
  }
}

export async function resolveReferralAttributionCandidate(
  explicitReferralCode?: unknown,
) {
  const policy = await getReferralAttributionPolicy();

  if (!policy.enabled) return "";

  const explicit = normalizeReferralAttributionCode(
    explicitReferralCode,
  );

  if (
    explicit &&
    await isValidReferralAttributionCode(explicit)
  ) {
    return explicit;
  }

  const stored = await readReferralAttributionCookie();

  if (
    stored &&
    await isValidReferralAttributionCode(stored)
  ) {
    return stored;
  }

  return "";
}
