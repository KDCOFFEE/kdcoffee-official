import { listOrders, type StoredOrder } from "@/lib/adminOrders";
import { listMembers, type Member } from "@/lib/memberAuth";
import { getIdentityRegistrySnapshot } from "@/lib/memberIdentity";
import {
  effectiveCreditRemaining,
  readMembershipCommerceState,
  type CreditEntry,
  type MembershipCommerceState,
  type SubscriptionStatus,
} from "@/lib/membershipCommerce";

export type AdminMemberListFilters = {
  query?: string;
  sort?: "newest" | "oldest";
  login?: "all" | "email" | "line" | "both";
  subscription?: "all" | "active" | "inactive";
  credit?: "all" | "available";
  referral?: "all" | "participating";
  status?: "all" | "active" | "possible-duplicate";
};

export type AdminMemberListRow = {
  memberId: string;
  name: string;
  memberNumber: string | null;
  email: string | null;
  phone: string | null;
  loginMethods: Array<"email" | "line">;
  joinedAt: string;
  orderCount: number;
  lifetimeSpend: number;
  availableCredit: number;
  subscriptionStatus: SubscriptionStatus | null;
  referralStatus: "referrer" | "referred" | "both" | null;
  accountStatus: "active" | "possible-duplicate" | "merged-tombstone";
};

const invalidSpendStatuses = new Set(["cancelled", "uncollected", "refunded", "returned"]);

function orderMemberId(order: StoredOrder) {
  return typeof order.member?.memberId === "string" ? order.member.memberId : null;
}

function orderTotal(order: StoredOrder) {
  const value = Number(order.total ?? order.subtotal ?? 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function pickSubscriptionStatus(statuses: SubscriptionStatus[]): SubscriptionStatus | null {
  for (const status of ["active", "paused", "pending_activation", "terminated"] as const) if (statuses.includes(status)) return status;
  return null;
}

function memberName(member: Member) {
  return member.pickupName?.trim() || member.displayName?.trim() || "KD Coffee 會員";
}

function canonicalMembers(members: Member[], aliases: Record<string, string>) {
  const result = new Map<string, Member>();
  for (const member of members) {
    const canonicalId = aliases[member.id] || member.id;
    const current = result.get(canonicalId);
    if (!current || member.id === canonicalId) result.set(canonicalId, { ...member, id: canonicalId });
  }
  return [...result.values()];
}

function buildListRows(members: Member[], orders: StoredOrder[], state: MembershipCommerceState, registry: Awaited<ReturnType<typeof getIdentityRegistrySnapshot>>, now = new Date()) {
  const ordersByMember = new Map<string, StoredOrder[]>();
  for (const order of orders) {
    const rawId = orderMemberId(order);
    if (!rawId) continue;
    const id = registry.legacyAliases[rawId] || rawId;
    ordersByMember.set(id, [...(ordersByMember.get(id) ?? []), order]);
  }
  const identitiesByMember = new Map<string, Set<"email" | "line">>();
  for (const identity of Object.values(registry.identities)) {
    if (identity.status !== "active") continue;
    const providers = identitiesByMember.get(identity.memberId) ?? new Set<"email" | "line">();
    providers.add(identity.provider);
    identitiesByMember.set(identity.memberId, providers);
  }

  return canonicalMembers(members, registry.legacyAliases).map((member): AdminMemberListRow => {
    const id = member.id;
    const memberOrders = ordersByMember.get(id) ?? [];
    const statuses = Object.values(state.subscriptions).filter((item) => item.memberId === id).map((item) => item.status);
    const hasReferrer = Object.values(state.referrals).some((item) => item.referredMemberId === id && item.status !== "inactive");
    const hasReferrals = Object.values(state.referrals).some((item) => item.referrerMemberId === id && item.status !== "inactive");
    const registryMember = registry.members[id];
    const providers = identitiesByMember.get(id) ?? new Set<"email" | "line">();
    if (!providers.size && member.authProvider) providers.add(member.authProvider);
    if (member.passwordHash && (member.loginEmail || member.email)) providers.add("email");
    if (member.lineUserId) providers.add("line");
    const availableCredit = Object.values(state.creditEntries)
      .filter((entry) => entry.memberId === id)
      .reduce((sum, entry) => sum + effectiveCreditRemaining(state, entry, now), 0);
    return {
      memberId: id,
      name: memberName(member),
      memberNumber: registryMember?.memberNumber ?? member.memberNumber ?? null,
      email: member.email?.trim() || null,
      phone: member.phone?.trim() || null,
      loginMethods: [...providers].sort(),
      joinedAt: registryMember?.createdAt ?? member.createdAt,
      orderCount: memberOrders.length,
      lifetimeSpend: memberOrders.filter((order) => !invalidSpendStatuses.has(String(order.status))).reduce((sum, order) => sum + orderTotal(order), 0),
      availableCredit,
      subscriptionStatus: pickSubscriptionStatus(statuses),
      referralStatus: hasReferrer && hasReferrals ? "both" : hasReferrals ? "referrer" : hasReferrer ? "referred" : null,
      accountStatus: registryMember?.status ?? "active",
    };
  });
}

export async function getAdminMemberList(filters: AdminMemberListFilters = {}) {
  const [members, orders, state, registry] = await Promise.all([listMembers(), listOrders(), readMembershipCommerceState(), getIdentityRegistrySnapshot()]);
  const query = filters.query?.trim().toLocaleLowerCase("zh-TW") ?? "";
  let rows = buildListRows(members, orders, state, registry);
  if (query) rows = rows.filter((row) => [row.name, row.memberNumber, row.email, row.phone].some((value) => value?.toLocaleLowerCase("zh-TW").includes(query)));
  if (filters.login && filters.login !== "all") rows = rows.filter((row) => filters.login === "both" ? row.loginMethods.includes("email") && row.loginMethods.includes("line") : row.loginMethods.includes(filters.login as "email" | "line"));
  if (filters.subscription === "active") rows = rows.filter((row) => row.subscriptionStatus === "active");
  if (filters.subscription === "inactive") rows = rows.filter((row) => row.subscriptionStatus !== "active");
  if (filters.credit === "available") rows = rows.filter((row) => row.availableCredit > 0);
  if (filters.referral === "participating") rows = rows.filter((row) => row.referralStatus !== null);
  if (filters.status && filters.status !== "all") rows = rows.filter((row) => row.accountStatus === filters.status);
  rows.sort((a, b) => (filters.sort === "oldest" ? a.joinedAt.localeCompare(b.joinedAt) : b.joinedAt.localeCompare(a.joinedAt)) || a.memberId.localeCompare(b.memberId));
  return { rows, total: canonicalMembers(members, registry.legacyAliases).length };
}

function safeCredit(entry: CreditEntry, state: MembershipCommerceState, now: Date) {
  const remainingAmount = effectiveCreditRemaining(state, entry, now);
  return {
    creditEntryId: entry.creditEntryId,
    direction: entry.amount < 0 ? "deduct" as const : "grant" as const,
    amount: entry.amount,
    remainingAmount,
    sourceType: entry.sourceType,
    sourceReference: entry.sourceReference,
    issuedAt: entry.issuedAt,
    expiresAt: entry.expiresAt,
    status: Date.parse(entry.expiresAt) <= now.getTime() && entry.amount > 0 ? "expired" as const : remainingAmount === 0 && entry.status === "available" ? "consumed" as const : entry.status,
    reason: typeof entry.metadata.reason === "string" ? entry.metadata.reason : null,
    note: typeof entry.metadata.note === "string" ? entry.metadata.note : null,
  };
}

export async function getAdminMemberDetail(memberIdInput: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{3,160}$/.test(memberIdInput)) return null;
  const [members, orders, state, registry] = await Promise.all([listMembers(), listOrders(), readMembershipCommerceState(), getIdentityRegistrySnapshot()]);
  const memberId = registry.legacyAliases[memberIdInput] || memberIdInput;
  const member = canonicalMembers(members, registry.legacyAliases).find((item) => item.id === memberId);
  if (!member) return null;
  const summary = buildListRows([member], orders, state, registry, now)[0];
  const memberOrders = orders.filter((order) => (registry.legacyAliases[orderMemberId(order) ?? ""] || orderMemberId(order)) === memberId).map((order) => ({
    orderNumber: String(order.orderNumber),
    createdAt: String(order.createdAt),
    status: String(order.status),
    orderMode: String(order.orderMode),
    total: orderTotal(order),
    payment: typeof order.payment === "string" ? order.payment : null,
  }));
  const subscriptions = Object.values(state.subscriptions).filter((item) => item.memberId === memberId).map((subscription) => ({
    ...structuredClone(subscription),
    cycles: Object.values(state.cycles).filter((cycle) => cycle.subscriptionId === subscription.subscriptionId).sort((a, b) => b.plannedDate.localeCompare(a.plannedDate)),
  }));
  const identities = Object.values(registry.identities).filter((identity) => identity.memberId === memberId && identity.status === "active").map((identity) => ({ provider: identity.provider, verifiedAt: identity.verifiedAt, linkedAt: identity.linkedAt, status: identity.status }));
  const directReferrals = Object.values(state.referrals).filter((item) => item.referrerMemberId === memberId && item.status !== "inactive").map((item) => ({ memberNumber: registry.members[item.referredMemberId]?.memberNumber ?? null, safeDisplayName: item.safeDisplayName, status: item.status, createdAt: item.createdAt }));
  const referrerRelation = Object.values(state.referrals).find((item) => item.referredMemberId === memberId && item.status !== "inactive");
  const rewards = Object.values(state.referralRewards).filter((item) => item.beneficiaryMemberId === memberId).map((item) => ({ rewardId: item.rewardId, sourceOrderNumber: item.sourceOrderNumber, referralLevel: item.referralLevel, amount: item.calculatedCreditAmount, status: item.status, qualificationStatus: item.qualificationStatus ?? null, releasedAt: item.releasedAt }));
  const credits = Object.values(state.creditEntries).filter((entry) => entry.memberId === memberId).map((entry) => safeCredit(entry, state, now)).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  const reservedCredit = Object.values(state.creditReservations).filter((item) => item.memberId === memberId && item.status === "reserved").reduce((sum, item) => sum + item.amount, 0);
  const memberEntityIds = new Set<string>([
    ...credits.map((entry) => entry.creditEntryId),
    ...subscriptions.map((item) => item.subscriptionId),
    ...subscriptions.flatMap((item) => item.cycles.map((cycle) => cycle.cycleId)),
    ...Object.values(state.referrals).filter((item) => item.referrerMemberId === memberId || item.referredMemberId === memberId).map((item) => item.relationshipId),
    ...rewards.map((item) => item.rewardId),
  ]);
  const commerceAudit = state.audit.filter((item) => memberEntityIds.has(item.entityId)).map((item) => ({ id: item.auditId, timestamp: item.timestamp, actor: item.actor, action: item.action, reason: item.reason }));
  const identityAudit = registry.auditLog.filter((item) => item.memberId === memberId).map((item) => ({ id: item.auditId, timestamp: item.occurredAt, actor: item.actorType, action: item.action, reason: item.safeReason }));
  return {
    summary,
    contact: { email: member.email?.trim() || null, phone: member.phone?.trim() || null, pickupName: member.pickupName?.trim() || null, lastLoginAt: member.lastLoginAt || null },
    orders: memberOrders.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    credits,
    reservedCredit,
    pendingCredit: Object.values(state.referralConversions).filter((item) => item.status === "pending" && state.referrals[item.relationshipId]?.referrerMemberId === memberId).reduce((sum, item) => sum + item.pendingRewardAmount, 0),
    subscriptions,
    referral: {
      referralCode: Object.values(state.referrals).find((item) => item.referrerMemberId === memberId)?.referralCode ?? null,
      referrerMemberNumber: referrerRelation ? registry.members[referrerRelation.referrerMemberId]?.memberNumber ?? null : null,
      relationshipStatus: referrerRelation?.status ?? null,
      directReferrals,
      rewards,
    },
    identities,
    audit: [...commerceAudit, ...identityAudit].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
  };
}
