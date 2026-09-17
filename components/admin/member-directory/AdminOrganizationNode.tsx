"use client";

import type { AdminOrganizationNode as OrganizationNode } from "@/lib/adminMemberOrganization";

export function AdminOrganizationNode(props: {
  node: OrganizationNode;
  nodes: Map<string, OrganizationNode>;
  expanded: Set<string>;
  selectedMemberId: string | null;
  onToggle: (memberId: string) => void;
}) {
  const children = props.node.childrenIds.map((id) => props.nodes.get(id)).filter((node): node is OrganizationNode => Boolean(node));
  const open = props.expanded.has(props.node.memberId);
  return <li className="organization-branch">
    <span className="organization-connector organization-connector-left" aria-hidden="true" />
    <span className="organization-connector organization-connector-right" aria-hidden="true" />
    <span className="organization-connector organization-connector-drop" aria-hidden="true" />
    <div
      className={`organization-node${props.node.memberId === props.selectedMemberId ? " selected" : ""}${props.node.anomalyCodes.length ? " anomaly" : ""}`}
      data-member-node={props.node.memberId}
      tabIndex={0}
      role="button"
      aria-label={`查看 ${props.node.displayName} 會員資料`}
    >
      <span><strong>{props.node.displayName}</strong><small>{props.node.memberNumber || props.node.memberId}</small></span>
      <span><b>直推 {props.node.directCount}</b><small>團隊 {props.node.teamCount}</small></span>
      {children.length ? <button
        type="button"
        data-branch-control
        aria-label={open ? "收合分支" : "展開分支"}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); props.onToggle(props.node.memberId); }}
      >{open ? "−" : "+"}</button> : null}
    </div>
    {children.length && open ? <ul className="organization-children">{children.map((child) => <AdminOrganizationNode key={child.memberId} {...props} node={child} />)}</ul> : null}
  </li>;
}
