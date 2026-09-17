import type { MemberIdentityRegistry } from "@/lib/memberIdentity";
import type { ReferralRelationship } from "@/lib/membershipCommerce";

export type AdminOrganizationFinding = {
  code:
    | "duplicate-canonical-member"
    | "duplicate-relationship"
    | "missing-parent"
    | "missing-child"
    | "orphan"
    | "self-referral"
    | "cycle"
    | "multiple-active-parents"
    | "unreachable-node"
    | "root-correctness";
  severity: "warning" | "error";
  memberId?: string;
  relationshipId?: string;
  message: string;
};

export type AdminOrganizationNode = {
  memberId: string;
  memberNumber: string;
  displayName: string;
  accountStatus: string;
  parentId: string | null;
  childrenIds: string[];
  depth: number | null;
  directCount: number;
  descendantCount: number;
  teamCount: number;
  rootId: string | null;
  isRoot: boolean;
  relationshipStatus: "registered" | "qualified" | "none" | "anomaly";
  anomalyCodes: string[];
};

export type AdminOrganizationEdge = {
  relationshipId: string;
  parentId: string;
  childId: string;
  status: ReferralRelationship["status"];
  includedInHierarchy: boolean;
};

export type AdminOrganizationGraph = {
  nodes: AdminOrganizationNode[];
  edges: AdminOrganizationEdge[];
  roots: string[];
  counts: {
    nodes: number;
    currentRelationships: number;
    inactiveRelationships: number;
    roots: number;
    anomalies: number;
  };
  diagnostics: AdminOrganizationFinding[];
};

export function isAdminGraphClickGesture(start: { x: number; y: number }, end: { x: number; y: number }, threshold = 6) {
  return Math.hypot(end.x - start.x, end.y - start.y) < threshold;
}

export function adminGraphAncestorIds(memberId: string, nodes: Map<string, { parentId: string | null }>) {
  const ancestors: string[] = [];
  const seen = new Set<string>();
  let parentId = nodes.get(memberId)?.parentId ?? null;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    ancestors.unshift(parentId);
    parentId = nodes.get(parentId)?.parentId ?? null;
  }
  return ancestors;
}

export function isAdminGraphActivationKey(key: string) {
  return key === "Enter" || key === " ";
}

type MemberPresentation = {
  memberId: string;
  memberNumber?: string;
  displayName?: string;
  accountStatus?: string;
};

export function canonicalizeAdminMemberId(registry: MemberIdentityRegistry, memberId: string) {
  let current = memberId.trim();
  const seen = new Set<string>();
  while (registry.legacyAliases[current] && !seen.has(current)) {
    seen.add(current);
    current = registry.legacyAliases[current];
  }
  return current;
}

function findingKey(finding: AdminOrganizationFinding) {
  return `${finding.code}:${finding.memberId || ""}:${finding.relationshipId || ""}:${finding.message}`;
}

export function buildAdminMemberOrganization(input: {
  registry: MemberIdentityRegistry;
  referrals: Record<string, ReferralRelationship>;
  members: MemberPresentation[];
}): AdminOrganizationGraph {
  const { registry } = input;
  const findings: AdminOrganizationFinding[] = [];
  const presentations = new Map<string, MemberPresentation>();
  const duplicateCanonical = new Set<string>();

  for (const member of input.members) {
    const canonicalId = canonicalizeAdminMemberId(registry, member.memberId);
    if (presentations.has(canonicalId)) duplicateCanonical.add(canonicalId);
    const current = presentations.get(canonicalId);
    if (!current || member.memberId === canonicalId) presentations.set(canonicalId, { ...member, memberId: canonicalId });
  }
  for (const memberId of duplicateCanonical) {
    findings.push({ code: "duplicate-canonical-member", severity: "error", memberId, message: `多份會員資料解析至同一 canonical member：${memberId}` });
  }

  const allIds = new Set(Object.keys(registry.members));
  for (const id of presentations.keys()) allIds.add(id);
  const rawRelationships = Object.values(input.referrals).sort((left, right) => left.relationshipId.localeCompare(right.relationshipId));
  for (const relation of rawRelationships) {
    allIds.add(canonicalizeAdminMemberId(registry, relation.referrerMemberId));
    allIds.add(canonicalizeAdminMemberId(registry, relation.referredMemberId));
  }

  const knownCanonical = new Set(Object.keys(registry.members));
  const active = rawRelationships.filter((relation) => relation.status !== "inactive");
  const edgeKeys = new Map<string, string>();
  const incoming = new Map<string, AdminOrganizationEdge[]>();
  const edges: AdminOrganizationEdge[] = [];

  for (const relation of rawRelationships) {
    const parentId = canonicalizeAdminMemberId(registry, relation.referrerMemberId);
    const childId = canonicalizeAdminMemberId(registry, relation.referredMemberId);
    const edge: AdminOrganizationEdge = {
      relationshipId: relation.relationshipId,
      parentId,
      childId,
      status: relation.status,
      includedInHierarchy: false,
    };
    edges.push(edge);
    if (relation.status === "inactive") continue;

    if (!knownCanonical.has(parentId)) findings.push({ code: "missing-parent", severity: "error", memberId: parentId, relationshipId: relation.relationshipId, message: `推薦關係的上層會員不存在於 identity registry：${parentId}` });
    if (!knownCanonical.has(childId)) findings.push({ code: "missing-child", severity: "error", memberId: childId, relationshipId: relation.relationshipId, message: `推薦關係的下層會員不存在於 identity registry：${childId}` });
    if (parentId === childId) {
      findings.push({ code: "self-referral", severity: "error", memberId: childId, relationshipId: relation.relationshipId, message: `會員不可推薦自己：${childId}` });
      continue;
    }
    const pair = `${parentId}\u0000${childId}`;
    if (edgeKeys.has(pair)) {
      findings.push({ code: "duplicate-relationship", severity: "error", memberId: childId, relationshipId: relation.relationshipId, message: `重複推薦關係：${parentId} → ${childId}` });
      continue;
    }
    edgeKeys.set(pair, relation.relationshipId);
    const list = incoming.get(childId) ?? [];
    list.push(edge);
    incoming.set(childId, list);
  }

  const candidateParent = new Map<string, AdminOrganizationEdge>();
  for (const [childId, candidates] of incoming) {
    if (candidates.length > 1) {
      findings.push({ code: "multiple-active-parents", severity: "error", memberId: childId, message: `會員同時存在 ${candidates.length} 個有效上層，未自動選擇其一。` });
      continue;
    }
    candidateParent.set(childId, candidates[0]);
  }

  const cycleMembers = new Set<string>();
  for (const start of allIds) {
    const path: string[] = [];
    const positions = new Map<string, number>();
    let current: string | undefined = start;
    while (current && candidateParent.has(current) && !cycleMembers.has(current)) {
      if (positions.has(current)) {
        const cycle = path.slice(positions.get(current));
        for (const memberId of cycle) cycleMembers.add(memberId);
        findings.push({ code: "cycle", severity: "error", memberId: current, message: `推薦關係形成循環：${cycle.join(" → ")} → ${current}` });
        break;
      }
      positions.set(current, path.length);
      path.push(current);
      current = candidateParent.get(current)?.parentId;
    }
  }
  for (const memberId of cycleMembers) candidateParent.delete(memberId);

  const children = new Map<string, string[]>();
  const parent = new Map<string, string>();
  for (const [childId, edge] of candidateParent) {
    if (cycleMembers.has(edge.parentId) || cycleMembers.has(childId)) continue;
    parent.set(childId, edge.parentId);
    const list = children.get(edge.parentId) ?? [];
    list.push(childId);
    children.set(edge.parentId, list);
    edge.includedInHierarchy = true;
  }
  for (const list of children.values()) list.sort((left, right) => left.localeCompare(right));

  const roots = [...allIds].filter((id) => !parent.has(id) && !cycleMembers.has(id)).sort((left, right) => left.localeCompare(right));
  const depth = new Map<string, number>();
  const rootOf = new Map<string, string>();
  const queue = roots.map((id) => ({ id, root: id, depth: 0 }));
  for (let index = 0; index < queue.length; index += 1) {
    const item = queue[index];
    if (depth.has(item.id)) continue;
    depth.set(item.id, item.depth);
    rootOf.set(item.id, item.root);
    for (const childId of children.get(item.id) ?? []) queue.push({ id: childId, root: item.root, depth: item.depth + 1 });
  }

  const descendants = new Map<string, number>();
  const byDepth = [...depth.entries()].sort((left, right) => right[1] - left[1]);
  for (const [memberId] of byDepth) {
    const count = (children.get(memberId) ?? []).reduce((sum, childId) => sum + 1 + (descendants.get(childId) ?? 0), 0);
    descendants.set(memberId, count);
  }

  for (const memberId of knownCanonical) {
    if (!presentations.has(memberId)) findings.push({ code: "orphan", severity: "warning", memberId, message: `Identity registry 會員缺少 profile 資料：${memberId}` });
  }
  for (const memberId of allIds) {
    if (!depth.has(memberId)) findings.push({ code: "unreachable-node", severity: "error", memberId, message: `會員無法從任何有效 root 抵達：${memberId}` });
  }
  const expectedRootCount = [...allIds].filter((id) => !incoming.has(id)).length;
  if (roots.length !== expectedRootCount && !cycleMembers.size) {
    findings.push({ code: "root-correctness", severity: "error", message: `Root 計算異常：預期 ${expectedRootCount}，實際 ${roots.length}。` });
  }

  const byMemberFinding = new Map<string, Set<string>>();
  for (const item of findings) {
    if (!item.memberId) continue;
    const codes = byMemberFinding.get(item.memberId) ?? new Set<string>();
    codes.add(item.code);
    byMemberFinding.set(item.memberId, codes);
  }

  const nodes = [...allIds].sort((left, right) => left.localeCompare(right)).map((memberId): AdminOrganizationNode => {
    const canonical = registry.members[memberId];
    const presentation = presentations.get(memberId);
    const incomingEdge = candidateParent.get(memberId);
    const anomalyCodes = [...(byMemberFinding.get(memberId) ?? [])];
    return {
      memberId,
      memberNumber: canonical?.memberNumber ?? presentation?.memberNumber ?? "",
      displayName: presentation?.displayName || "未解析會員",
      accountStatus: canonical?.status ?? presentation?.accountStatus ?? "unresolved",
      parentId: parent.get(memberId) ?? null,
      childrenIds: children.get(memberId) ?? [],
      depth: depth.get(memberId) ?? null,
      directCount: children.get(memberId)?.length ?? 0,
      descendantCount: descendants.get(memberId) ?? 0,
      teamCount: descendants.get(memberId) ?? 0,
      rootId: rootOf.get(memberId) ?? null,
      isRoot: roots.includes(memberId),
      relationshipStatus: anomalyCodes.length ? "anomaly" : incomingEdge && incomingEdge.status !== "inactive" ? incomingEdge.status : "none",
      anomalyCodes,
    };
  });

  const uniqueFindings = [...new Map(findings.map((item) => [findingKey(item), item])).values()];
  return {
    nodes,
    edges,
    roots,
    counts: {
      nodes: nodes.length,
      currentRelationships: active.length,
      inactiveRelationships: rawRelationships.length - active.length,
      roots: roots.length,
      anomalies: uniqueFindings.length,
    },
    diagnostics: uniqueFindings,
  };
}
