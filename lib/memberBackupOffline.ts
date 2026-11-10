type JsonRecord = Record<string, unknown>;

type OrganizationNodeLike = {
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

type OrganizationTreeLike = {
  createdAt: string;
  roots: string[];
  nodes: OrganizationNodeLike[];
};

export type OfflineMemberOrderSummary = {
  orderNumber: string;
  createdAt: string;
  status: string;
  amount: number | null;
  orderMode: string;
  store: { id: string; name: string; address: string } | null;
  studioPickup: { preferredDate: string; preferredTime: string } | null;
  items: string[];
};

export type OfflineMemberFulfillmentSummary = {
  orderNumber: string;
  currentState: string;
  updatedAt: string;
  events: Array<{ state: string; occurredAt: string; source: string; note: string }>;
};

export type OfflineMemberIndexEntry = {
  memberId: string;
  memberNumber: string;
  displayName: string;
  phone: string;
  email: string;
  loginEmail: string;
  maskedPhone: string;
  maskedEmail: string;
  search: {
    memberId: string;
    memberNumber: string;
    memberNumberNormalized: string;
    displayName: string;
    phoneNormalized: string;
    emailNormalized: string;
    emailLocalPart: string;
    loginEmailNormalized: string;
    loginEmailLocalPart: string;
  };
  identity: {
    createdAt: string;
    updatedAt: string;
    status: string;
    providerTypes: string[];
    customAvatar: boolean;
    providerPicture: boolean;
  };
  organization: {
    parentId: string | null;
    parentMemberNumber: string;
    parentDisplayName: string;
    children: Array<{ memberId: string; memberNumber: string; displayName: string }>;
    directReferralCount: number;
    teamCount: number;
    descendantCount: number;
    depth: number | null;
    relationshipStatus: string;
  };
  subscriptions: Array<{
    subscriptionId: string;
    status: string;
    intervalDays: number | null;
    anchorDate: string;
    shippingMethod: string;
    storeSelection: { storeId: string; storeName: string } | null;
    nextCycle: null | {
      cycleId: string;
      kind: string;
      status: string;
      plannedDate: string;
      orderCreationDate: string;
      modificationDeadline: string;
      createdOrderId: string | null;
      estimatedAmount: number | null;
    };
  }>;
  commerce: {
    creditEntriesCount: number;
    recordedRemainingCredit: number;
    creditStatusCounts: Record<string, number>;
    rewardCount: number;
    rewardStatusCounts: Record<string, number>;
    calculatedRewardAmount: number;
    projectedRewardAmount: number;
    effectivePV: number;
    validConsumptionCount: number;
    validConsumptionAmount: number;
    qualificationRoundCount: number;
  };
  orders: {
    totalCount: number;
    recent: OfflineMemberOrderSummary[];
  };
  fulfillment: OfflineMemberFulfillmentSummary[];
};

export type OfflineMemberSearchResult = {
  member: OfflineMemberIndexEntry;
  score: number;
  exact: boolean;
  reason: "姓名" | "會員編號" | "Email" | "手機" | "Member ID";
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function entries(value: unknown) {
  return Object.entries(asRecord(value)).map(([key, item]) => [key, asRecord(item)] as const);
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function finiteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function sumNumbers(records: JsonRecord[], key: string) {
  return records.reduce((sum, record) => sum + (finiteNumber(record[key]) ?? 0), 0);
}

function statusCounts(records: JsonRecord[]) {
  return records.reduce<Record<string, number>>((result, record) => {
    const status = text(record.status) || "unknown";
    result[status] = (result[status] ?? 0) + 1;
    return result;
  }, {});
}

export function normalizeOfflinePhone(value: string) {
  return value.trim().replace(/[\s\-()]/gu, "");
}

export function normalizeOfflineEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase("zh-Hant");
}

function normalizeMemberNumber(value: string) {
  return normalizeText(value).replace(/^kd[-\s]?/u, "").replace(/[\s-]/gu, "");
}

function emailLocalPart(value: string) {
  return value.split("@", 1)[0] ?? "";
}

export function maskOfflinePhone(value: string) {
  const normalized = normalizeOfflinePhone(value);
  if (!normalized) return "";
  if (normalized.length <= 4) return `${normalized.slice(0, 1)}***`;
  if (normalized.length <= 7) return `${normalized.slice(0, 2)}**${normalized.slice(-2)}`;
  return `${normalized.slice(0, 2)}**-***-${normalized.slice(-3)}`;
}

export function maskOfflineEmail(value: string) {
  const normalized = normalizeOfflineEmail(value);
  if (!normalized) return "";
  const separator = normalized.indexOf("@");
  if (separator < 1) return `${normalized.slice(0, 1)}***`;
  return `${normalized.slice(0, 1)}***${normalized.slice(separator)}`;
}

function orderMemberId(order: JsonRecord) {
  return text(asRecord(order.member).memberId, order.memberId);
}

function orderRecords(parsedOrders: Map<string, unknown>) {
  return [...parsedOrders.entries()]
    .filter(([backupPath]) => backupPath.startsWith("raw/orders/") && backupPath.endsWith(".json"))
    .map(([, order]) => asRecord(order));
}

function itemSummary(item: unknown) {
  const record = asRecord(item);
  const label = text(record.name, record.productName, record.title, record.productId) || "未命名商品";
  const option = text(record.optionLabel, record.optionName, record.optionId);
  const quantity = finiteNumber(record.quantity);
  return `${label}${option ? `・${option}` : ""}${quantity !== null ? ` × ${quantity}` : ""}`;
}

function orderSummary(order: JsonRecord): OfflineMemberOrderSummary {
  const store = asRecord(order.store);
  const pickup = asRecord(order.studioPickup);
  return {
    orderNumber: text(order.orderNumber, order.id),
    createdAt: text(order.createdAt, order.orderDate),
    status: text(order.status),
    amount: finiteNumber(order.total),
    orderMode: text(order.orderMode, order.shippingMethod),
    store: Object.keys(store).length ? { id: text(store.id, store.storeId), name: text(store.name, store.storeName), address: text(store.address) } : null,
    studioPickup: Object.keys(pickup).length ? { preferredDate: text(pickup.preferredDate), preferredTime: text(pickup.preferredTime) } : null,
    items: Array.isArray(order.items) ? order.items.map(itemSummary) : [],
  };
}

function memberLabel(memberId: string, nodes: Map<string, OrganizationNodeLike>, profiles: Map<string, JsonRecord>, registry: JsonRecord) {
  const profile = profiles.get(memberId) ?? {};
  const canonical = asRecord(registry[memberId]);
  return {
    memberId,
    memberNumber: text(canonical.memberNumber, profile.memberNumber, nodes.get(memberId)?.memberNumber),
    displayName: text(profile.displayName, profile.name),
  };
}

function fulfillmentForOrder(fulfillment: JsonRecord, orderNumber: string): OfflineMemberFulfillmentSummary | null {
  const records = asRecord(fulfillment.records);
  let record = asRecord(records[orderNumber]);
  if (!Object.keys(record).length) {
    record = entries(records).map(([, value]) => value).find((value) => text(value.orderId) === orderNumber) ?? {};
  }
  if (!Object.keys(record).length) return null;
  return {
    orderNumber,
    currentState: text(record.currentState),
    updatedAt: text(record.updatedAt),
    events: (Array.isArray(record.events) ? record.events : []).map((event) => {
      const item = asRecord(event);
      return { state: text(item.state), occurredAt: text(item.occurredAt), source: text(item.source), note: text(item.note) };
    }),
  };
}

function nextCycleFor(subscriptionId: string, commerce: JsonRecord) {
  const terminal = new Set(["completed", "skipped", "cancelled", "uncollected"]);
  const cycles = entries(commerce.cycles).map(([, cycle]) => cycle)
    .filter((cycle) => text(cycle.subscriptionId) === subscriptionId && !terminal.has(text(cycle.status)))
    .sort((a, b) => text(a.plannedDate).localeCompare(text(b.plannedDate)) || text(a.createdAt).localeCompare(text(b.createdAt)));
  const cycle = cycles[0];
  if (!cycle) return null;
  const pricing = asRecord(cycle.pricingSnapshot);
  return {
    cycleId: text(cycle.cycleId),
    kind: text(cycle.kind),
    status: text(cycle.status),
    plannedDate: text(cycle.plannedDate),
    orderCreationDate: text(cycle.orderCreationDate),
    modificationDeadline: text(cycle.modificationDeadline),
    createdOrderId: text(cycle.createdOrderId) || null,
    estimatedAmount: finiteNumber(pricing.finalAmount),
  };
}

export function buildOfflineMemberIndex(input: {
  tree: OrganizationTreeLike;
  identity: JsonRecord;
  commerce: JsonRecord;
  fulfillment: JsonRecord;
  profiles: Map<string, JsonRecord>;
  parsedOrders: Map<string, unknown>;
}): OfflineMemberIndexEntry[] {
  const registry = asRecord(input.identity.members);
  const nodeById = new Map(input.tree.nodes.map((node) => [node.memberId, node]));
  const ids = new Set([...Object.keys(registry), ...input.profiles.keys(), ...input.tree.nodes.map((node) => node.memberId)]);
  const providersByMember = new Map<string, Set<string>>();
  for (const [, identity] of entries(input.identity.identities)) {
    const memberId = text(identity.memberId);
    const provider = text(identity.provider);
    if (!memberId || !provider) continue;
    const providers = providersByMember.get(memberId) ?? new Set<string>();
    providers.add(provider);
    providersByMember.set(memberId, providers);
  }
  const ordersByMember = new Map<string, JsonRecord[]>();
  for (const order of orderRecords(input.parsedOrders)) {
    const memberId = orderMemberId(order);
    if (!memberId || !ids.has(memberId)) continue;
    const records = ordersByMember.get(memberId) ?? [];
    records.push(order);
    ordersByMember.set(memberId, records);
  }

  return [...ids].map((memberId): OfflineMemberIndexEntry => {
    const profile = input.profiles.get(memberId) ?? {};
    const canonical = asRecord(registry[memberId]);
    const node = nodeById.get(memberId);
    const memberNumber = text(canonical.memberNumber, profile.memberNumber, node?.memberNumber);
    const displayName = text(profile.displayName, profile.name);
    const phone = text(profile.phone);
    const email = text(profile.email);
    const loginEmail = text(profile.loginEmail);
    const parent = node?.parentId ? memberLabel(node.parentId, nodeById, input.profiles, registry) : null;
    const children = (node?.childrenIds ?? []).map((childId) => memberLabel(childId, nodeById, input.profiles, registry));
    const subscriptions = entries(input.commerce.subscriptions).map(([, value]) => value)
      .filter((subscription) => text(subscription.memberId) === memberId)
      .sort((a, b) => text(b.createdAt).localeCompare(text(a.createdAt)))
      .map((subscription) => {
        const subscriptionId = text(subscription.subscriptionId);
        const store = asRecord(subscription.storeSelection);
        return {
          subscriptionId,
          status: text(subscription.status),
          intervalDays: finiteNumber(subscription.intervalDays),
          anchorDate: text(subscription.anchorDate),
          shippingMethod: text(subscription.shippingMethod),
          storeSelection: Object.keys(store).length ? { storeId: text(store.storeId, store.id), storeName: text(store.storeName, store.name) } : null,
          nextCycle: nextCycleFor(subscriptionId, input.commerce),
        };
      });
    const creditEntries = entries(input.commerce.creditEntries).map(([, value]) => value).filter((entry) => text(entry.memberId) === memberId);
    const rewards = entries(input.commerce.referralRewards).map(([, value]) => value).filter((reward) => text(reward.beneficiaryMemberId) === memberId);
    const validConsumption = entries(input.commerce.validConsumptionEvents).map(([, value]) => value).filter((event) => text(event.memberId) === memberId);
    const qualificationRounds = entries(input.commerce.qualificationRounds).map(([, value]) => value).filter((round) => text(round.memberId) === memberId);
    const memberOrders = (ordersByMember.get(memberId) ?? []).sort((a, b) => text(b.createdAt).localeCompare(text(a.createdAt)));
    const recentOrders = memberOrders.slice(0, 20).map(orderSummary);
    const fulfillment = recentOrders.map((order) => fulfillmentForOrder(input.fulfillment, order.orderNumber)).filter((value): value is OfflineMemberFulfillmentSummary => value !== null);
    return {
      memberId,
      memberNumber,
      displayName,
      phone,
      email,
      loginEmail,
      maskedPhone: maskOfflinePhone(phone),
      maskedEmail: maskOfflineEmail(email || loginEmail),
      search: {
        memberId: normalizeText(memberId),
        memberNumber: normalizeText(memberNumber),
        memberNumberNormalized: normalizeMemberNumber(memberNumber),
        displayName: normalizeText(displayName),
        phoneNormalized: normalizeOfflinePhone(phone),
        emailNormalized: normalizeOfflineEmail(email),
        emailLocalPart: emailLocalPart(normalizeOfflineEmail(email)),
        loginEmailNormalized: normalizeOfflineEmail(loginEmail),
        loginEmailLocalPart: emailLocalPart(normalizeOfflineEmail(loginEmail)),
      },
      identity: {
        createdAt: text(profile.createdAt, canonical.createdAt),
        updatedAt: text(profile.updatedAt, canonical.updatedAt),
        status: text(canonical.status, profile.status),
        providerTypes: [...(providersByMember.get(memberId) ?? new Set<string>(text(profile.authProvider) ? [text(profile.authProvider)] : []))].sort(),
        customAvatar: Boolean(text(profile.avatarUrl)),
        providerPicture: Boolean(text(profile.pictureUrl)),
      },
      organization: {
        parentId: node?.parentId ?? null,
        parentMemberNumber: parent?.memberNumber ?? "",
        parentDisplayName: parent?.displayName ?? "",
        children,
        directReferralCount: node?.directReferralCount ?? 0,
        teamCount: node?.teamCount ?? 0,
        descendantCount: node?.descendantCount ?? 0,
        depth: node?.depth ?? null,
        relationshipStatus: node?.relationshipStatus ?? "unresolved",
      },
      subscriptions,
      commerce: {
        creditEntriesCount: creditEntries.length,
        recordedRemainingCredit: sumNumbers(creditEntries.filter((entry) => ["available", "reserved"].includes(text(entry.status))), "remainingAmount"),
        creditStatusCounts: statusCounts(creditEntries),
        rewardCount: rewards.length,
        rewardStatusCounts: statusCounts(rewards),
        calculatedRewardAmount: sumNumbers(rewards, "calculatedCreditAmount"),
        projectedRewardAmount: sumNumbers(rewards, "projectedCreditAmount"),
        effectivePV: sumNumbers(rewards, "effectivePV"),
        validConsumptionCount: validConsumption.length,
        validConsumptionAmount: sumNumbers(validConsumption, "validConsumptionAmount"),
        qualificationRoundCount: qualificationRounds.length,
      },
      orders: { totalCount: memberOrders.length, recent: recentOrders },
      fulfillment,
    };
  }).sort((a, b) => a.memberNumber.localeCompare(b.memberNumber) || a.memberId.localeCompare(b.memberId));
}

export function searchOfflineMembers(index: OfflineMemberIndexEntry[], query: string): OfflineMemberSearchResult[] {
  const normalized = normalizeText(query);
  const phone = normalizeOfflinePhone(query);
  const email = normalizeOfflineEmail(query);
  const number = normalizeMemberNumber(query);
  const emailSyntax = normalized.includes("@");
  if (!normalized) return [];
  const results: OfflineMemberSearchResult[] = [];
  for (const member of index) {
    const fields = member.search;
    const matches: Array<{ score: number; exact: boolean; reason: OfflineMemberSearchResult["reason"] }> = [];
    const add = (score: number, exact: boolean, reason: OfflineMemberSearchResult["reason"]) => matches.push({ score, exact, reason });
    if (fields.displayName === normalized) add(500, true, "姓名");
    else if (fields.displayName.startsWith(normalized)) add(400, false, "姓名");
    else if (normalized.length >= 2 && fields.displayName.includes(normalized)) add(300, false, "姓名");
    if (fields.memberNumber === normalized || Boolean(number && fields.memberNumberNormalized === number)) add(490, true, "會員編號");
    else if (normalized.length >= 2 && number.length >= 2 && (fields.memberNumber.startsWith(normalized) || fields.memberNumberNormalized.startsWith(number))) add(390, false, "會員編號");
    else if (normalized.length >= 3 && number.length >= 3 && (fields.memberNumber.includes(normalized) || fields.memberNumberNormalized.includes(number))) add(290, false, "會員編號");
    const fullEmails = [fields.emailNormalized, fields.loginEmailNormalized].filter(Boolean);
    const localParts = [fields.emailLocalPart, fields.loginEmailLocalPart].filter(Boolean);
    if (emailSyntax) {
      if (fullEmails.includes(email)) add(480, true, "Email");
      else if (fullEmails.some((value) => value.startsWith(email))) add(380, false, "Email");
      else if (fullEmails.some((value) => value.includes(email))) add(280, false, "Email");
    } else {
      if (localParts.includes(email)) add(480, true, "Email");
      else if (localParts.some((value) => value.startsWith(email))) add(380, false, "Email");
      else if (normalized.length >= 2 && localParts.some((value) => value.includes(email))) add(280, false, "Email");
    }
    if (phone.length >= 4 && fields.phoneNormalized === phone) add(470, true, "手機");
    else if (phone.length >= 4 && fields.phoneNormalized.startsWith(phone)) add(370, false, "手機");
    else if (phone.length >= 4 && fields.phoneNormalized.includes(phone)) add(270, false, "手機");
    if (fields.memberId === normalized) add(460, true, "Member ID");
    else if (normalized.length >= 2 && fields.memberId.startsWith(normalized)) add(360, false, "Member ID");
    else if (normalized.length >= 4 && fields.memberId.includes(normalized)) add(260, false, "Member ID");
    const best = matches.sort((a, b) => b.score - a.score)[0];
    if (best) results.push({ member, ...best });
  }
  return results.sort((a, b) => b.score - a.score || a.member.memberNumber.localeCompare(b.member.memberNumber) || a.member.memberId.localeCompare(b.member.memberId));
}
