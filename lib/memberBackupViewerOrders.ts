import { isDeepStrictEqual } from "node:util";
import type { OrganizationTreeSnapshot } from "./memberBackup";
import { projectReturnRewardHolds, type MembershipCommerceState } from "./membershipCommerce";
import { validateReturnEventLog } from "./orderReturns";
import { projectReturnSettlements } from "./returnSettlementLedger";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : "";
const amount = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

/** Use only unambiguous, confirmed active edges. This projection does not alter the archived tree. */
function orderGraph(tree: OrganizationTreeSnapshot, known: Set<string>) {
  const parents = new Map<string, Set<string>>();
  const excluded = new Set<string>();
  for (const relation of tree.relationships) {
    const child = relation.referredMemberId, parent = relation.referrerMemberId;
    if (!known.has(child) || relation.status === "inactive") continue;
    if (!known.has(parent) || parent === child || !["registered", "qualified"].includes(relation.status)) {
      excluded.add(child);
      continue;
    }
    const ids = parents.get(child) ?? new Set<string>();
    ids.add(parent);
    parents.set(child, ids);
  }
  const single = new Map<string, string>();
  for (const [child, ids] of parents) {
    if (ids.size !== 1) excluded.add(child);
    if (!excluded.has(child)) single.set(child, [...ids][0]);
  }
  const done = new Set<string>();
  const cycle = new Set<string>();
  for (const start of single.keys()) {
    const visited = new Map<string, number>();
    let node: string | undefined = start;
    while (node && !done.has(node) && !visited.has(node)) {
      visited.set(node, visited.size);
      node = single.get(node);
    }
    if (node && visited.has(node)) for (const id of [...visited.keys()].slice(visited.get(node))) cycle.add(id);
    for (const id of visited.keys()) done.add(id);
  }
  const children = new Map<string, string[]>();
  for (const [child, parent] of single) {
    if (cycle.has(child) || cycle.has(parent)) { excluded.add(child); continue; }
    const ids = children.get(parent) ?? [];
    ids.push(child);
    children.set(parent, ids);
  }
  return { children: [...children], excluded };
}

function returnEvidence(commerce: RecordValue) {
  const requests = new Map<string, Array<{ state: string; at: string }>>();
  const refunds = new Map<string, Array<{ amount: number; at: string }>>();
  let complete = false;
  try {
    const events = commerce.returnEvents;
    validateReturnEventLog(events);
    const latest = new Map(events.map(event => [JSON.stringify([event.orderId, event.returnRequestId]), event]));
    for (const event of latest.values()) {
      const list = requests.get(event.orderId) ?? [];
      list.push({ state: event.type, at: event.occurredAt });
      requests.set(event.orderId, list);
    }
    if (commerce.returnSettlementEvents === undefined && !events.some(event => event.type === "RETURN_APPROVED")) {
      // The canonical state omits its settlement ledger until the first approval.
      complete = true;
    } else if (Array.isArray(commerce.returnSettlementEvents)) {
      const effects = projectReturnSettlements(commerce as MembershipCommerceState);
      for (const effect of effects) {
        if (effect.effectType !== "payment_refund" || effect.status !== "applied" || !effect.paymentResult) continue;
        const list = refunds.get(effect.orderId) ?? [];
        list.push({ amount: effect.paymentResult.amount, at: effect.paymentResult.confirmedAt });
        refunds.set(effect.orderId, list);
      }
      complete = true;
    }
  } catch {
    // A malformed or legacy ledger cannot prove that completed orders are free of refunds.
  }
  return { requests, refunds, complete };
}

export function buildBackupOrderViewerData(tree: OrganizationTreeSnapshot, memberIds: string[], snapshots: Map<string, unknown>, commerce: RecordValue) {
  const known = new Set(memberIds);
  for (const finding of tree.validation.findings) {
    if (finding.type === "duplicate_member_id" && finding.memberId) known.delete(finding.memberId);
  }
  const graph = orderGraph(tree, known);
  const { requests, refunds, complete } = returnEvidence(commerce);
  const orderFiles = new Map<string, RecordValue>();
  const conflicts = new Set<string>();
  const unlinked: Array<{ orderNumber: string; reason: string }> = [];
  let duplicates = 0;
  for (const [file, snapshot] of snapshots) {
    if (!file.startsWith("raw/orders/") || !file.endsWith(".json")) continue;
    const order = record(snapshot);
    const orderNumber = text(order.orderNumber);
    if (!orderNumber.trim()) { unlinked.push({ orderNumber: "", reason: "missing_number" }); continue; }
    const previous = orderFiles.get(orderNumber);
    if (!previous) orderFiles.set(orderNumber, order);
    else if (isDeepStrictEqual(previous, order)) duplicates++;
    else conflicts.add(orderNumber);
  }
  const reversals = new Map<string, Set<string>>();
  for (const [eventId, value] of Object.entries(record(commerce.validConsumptionEvents))) {
    const event = record(value);
    if (event.eventId !== eventId || !date(event.reversedAt) || !["returned", "refunded"].includes(text(event.reversalOutcome))) continue;
    const id = text(event.sourceOrderId);
    const members = reversals.get(id) ?? new Set<string>();
    members.add(text(event.memberId));
    reversals.set(id, members);
  }
  const orders = [...orderFiles].flatMap(([orderNumber, order]) => {
    const memberId = text(record(order.member).memberId);
    const reason = conflicts.has(orderNumber) ? "conflict" : !memberId ? "guest" : !known.has(memberId) ? "unknown_member" : "";
    if (reason) { unlinked.push({ orderNumber, reason }); return []; }
    if (graph.excluded.has(memberId)) unlinked.push({ orderNumber, reason: "referral_unconfirmed" });
    const paymentStatus = text(record(order.paymentDetails).status);
    const status = text(order.status);
    const returnRequests = requests.get(orderNumber) ?? [];
    const recordedRefunds = refunds.get(orderNumber) ?? [];
    const reversed = reversals.get(orderNumber)?.has(memberId) ?? false;
    const returnRisk = status === "returned" || status === "refunded" || paymentStatus === "refunded" || reversed ||
      recordedRefunds.length > 0 || returnRequests.some(request => !["RETURN_WITHDRAWN", "RETURN_REJECTED"].includes(request.state));
    return [{
      orderNumber, memberId, status, createdAt: date(order.createdAt), total: amount(order.total),
      subtotal: amount(order.subtotal), shipping: amount(order.shipping),
      paymentStatus, fulfillmentState: text(record(order.fulfillmentSummary).state),
      returnRequests, refunds: recordedRefunds, reversed, returnRisk,
      items: Array.isArray(order.items) ? order.items.map(value => {
        const item = record(value);
        return { name: text(item.name) || text(item.productName), quantity: amount(item.quantity) };
      }) : null,
    }];
  });
  const byNumber = new Map(orders.map(order => [order.orderNumber, order]));
  const rewards = Object.entries(record(commerce.referralRewards)).flatMap(([id, value]) => {
    const reward = record(value);
    const order = byNumber.get(text(reward.sourceOrderNumber));
    const memberId = text(reward.beneficiaryMemberId);
    const level = amount(reward.referralLevel);
    if (!id || id !== reward.rewardId || !order || order.memberId !== reward.sourceMemberId ||
      !known.has(memberId) || memberId === order.memberId || !level ||
      !["new_referral", "repeat_purchase", "subscription"].includes(text(reward.rewardType)) ||
      !["scheduled", "released", "cancelled", "reversed"].includes(text(reward.status))) return [];
    const ancestry = reward.ancestrySnapshot;
    if (Array.isArray(ancestry) && ancestry[level - 1] !== memberId) return [];
    let hold = "";
    if (complete) {
      try {
        const dependencies = projectReturnRewardHolds(commerce as MembershipCommerceState, { program:"referral", id }).dependencies;
        if (dependencies.some(dependency => dependency.persisted && dependency.state !== "resolved")) hold = "recorded";
      } catch { /* Unverified HOLD evidence is not included. */ }
    }
    return [{
      memberId, orderNumber: order.orderNumber, status: text(reward.status), hold,
      qualification: text(reward.qualificationStatus), releasedAt: date(reward.releasedAt), reversedAt: date(reward.reversedAt),
      recordedLevel: Array.isArray(ancestry) ? level : null,
    }];
  });
  return { graph: { children: graph.children, excludedEdges: graph.excluded.size }, orders, unlinked, duplicates, completeReturnLedger: complete, rewards };
}

export type BackupOrderViewerData = ReturnType<typeof buildBackupOrderViewerData>;
