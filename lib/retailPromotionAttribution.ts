import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import { getIdentityRegistrySnapshot } from "./memberIdentity";
import { getActiveMembershipRules, type RulesVersion } from "./membershipBusinessRules";
import { referralCodeForMember } from "./membershipCommerce";
import { normalizeReferralAttributionCode } from "./referralAttribution";

export const RETAIL_PROMOTION_ATTRIBUTION_COOKIE = "kd_retail_promotion_attribution";

export type RetailPromotionAttributionTokenPayload = {
  v: 1;
  referralCode: string;
  attributedAt: string;
  exp: number;
  source: "member-share-link";
};

export type RetailPromotionOrderSnapshot = {
  version: 1;
  referrerMemberId: string;
  referralCode: string;
  attributedAt: string;
  expiresAt: string;
  source: "member-share-link";
  ruleVersionId: number;
  rewardRate: number;
  baseWaitingDays: number;
  returnProtectionDays: number;
  reversalPolicy: "cancel-pending-and-reverse-released" | "cancel-pending-only";
  roundingMode: RulesVersion["rules"]["money"]["roundingMode"];
};

function attributionSecret() {
  const value = process.env.AUTH_SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && (!value || value.length < 32)) {
    throw new Error("AUTH_SESSION_SECRET must contain at least 32 characters in production");
  }
  return value || "dev-only-change-this-secret-before-production";
}

function sign(payload: string) {
  return createHmac("sha256", attributionSecret())
    .update(`retail-promotion-attribution:${payload}`)
    .digest("base64url");
}

export function createRetailPromotionAttributionToken(input: {
  referralCode: string;
  attributionWindowDays: number;
  now?: Date;
}) {
  const referralCode = normalizeReferralAttributionCode(input.referralCode);
  if (!referralCode) throw new Error("Invalid retail promotion referral code");
  const now = input.now ?? new Date();
  const payload: RetailPromotionAttributionTokenPayload = {
    v: 1,
    referralCode,
    attributedAt: now.toISOString(),
    exp: now.getTime() + input.attributionWindowDays * 86_400_000,
    source: "member-share-link",
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyRetailPromotionAttributionToken(token?: string | null, now = new Date()) {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<RetailPromotionAttributionTokenPayload>;
    const referralCode = normalizeReferralAttributionCode(parsed.referralCode);
    if (parsed.v !== 1 || !referralCode || parsed.source !== "member-share-link" || typeof parsed.attributedAt !== "string" || !Number.isFinite(Date.parse(parsed.attributedAt)) || typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp) || parsed.exp <= now.getTime()) return null;
    return { ...parsed, v: 1, referralCode, source: "member-share-link" } as RetailPromotionAttributionTokenPayload;
  } catch {
    return null;
  }
}

export async function resolveRetailPromotionReferrer(referralCode: string) {
  const normalized = normalizeReferralAttributionCode(referralCode);
  if (!normalized) return null;
  const registry = await getIdentityRegistrySnapshot();
  const memberId = Object.keys(registry.members).find((candidate) => referralCodeForMember(candidate) === normalized);
  return memberId ? { memberId, referralCode: normalized } : null;
}

export async function getRetailPromotionAttributionPolicy(at = new Date()) {
  const version = await getActiveMembershipRules(at);
  return { ...version.rules.retailPromotion, rulesVersion: version.rulesVersion };
}

export function setRetailPromotionAttributionCookie(response: NextResponse, input: {
  referralCode: string;
  attributionWindowDays: number;
  now?: Date;
}) {
  response.cookies.set(RETAIL_PROMOTION_ATTRIBUTION_COOKIE, createRetailPromotionAttributionToken(input), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: input.attributionWindowDays * 86_400,
  });
}

export function clearRetailPromotionAttributionCookie(response: NextResponse) {
  response.cookies.set(RETAIL_PROMOTION_ATTRIBUTION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export async function readRetailPromotionOrderSnapshot(input: {
  rulesVersion?: RulesVersion;
  now?: Date;
} = {}): Promise<RetailPromotionOrderSnapshot | null> {
  const now = input.now ?? new Date();
  const token = verifyRetailPromotionAttributionToken((await cookies()).get(RETAIL_PROMOTION_ATTRIBUTION_COOKIE)?.value, now);
  if (!token) return null;
  const version = input.rulesVersion ?? await getActiveMembershipRules(now);
  const rules = version.rules.retailPromotion;
  if (!rules.enabled || rules.rewardRate <= 0) return null;
  const referrer = await resolveRetailPromotionReferrer(token.referralCode);
  if (!referrer) return null;
  return {
    version: 1,
    referrerMemberId: referrer.memberId,
    referralCode: referrer.referralCode,
    attributedAt: token.attributedAt,
    expiresAt: new Date(token.exp).toISOString(),
    source: token.source,
    ruleVersionId: version.rulesVersion,
    rewardRate: rules.rewardRate,
    baseWaitingDays: version.rules.referral.referralRewardBaseWaitingDays,
    returnProtectionDays: version.rules.referral.referralRewardReturnProtectionDays,
    reversalPolicy: version.rules.referral.reversalPolicy,
    roundingMode: version.rules.money.roundingMode,
  };
}
