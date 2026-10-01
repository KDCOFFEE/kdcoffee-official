"use client";

import { MemberCopyValue, MemberCopyElement } from "@/components/member/MemberCenterCopyProvider";

import { useEffect, useMemo, useRef, useState } from "react";
import RewardSourceOrderSummaryCard from "./RewardSourceOrderSummaryCard";
import type { RewardSourceOrderSummary } from "@/lib/memberRewardPresentation";

export type ReferralOrgOrderDetail = RewardSourceOrderSummary;

export type ReferralOrgChartNode = {
  memberId: string;
  memberNumber: string;
  parentMemberId: string | null;
  parentMemberNumber: string | null;
  level: number;
  directReferralCount: number;
  teamCount: number;
  recentOrderCount: number;
  pendingCredit: number;
  currentPeriodCredit: number;
  recentOrders: ReferralOrgOrderDetail[];
};

export type ReferralOrgChartData = {
  periodLabel: string;
  pointDisplayName: string;
  stats: {
    teamMembers: number;
    newOrders: number;
    pendingCredit: number;
    currentPeriodCredit: number;
  };
  root: ReferralOrgChartNode;
  nodes: ReferralOrgChartNode[];
};

type Props = {
  open: boolean;
  data: ReferralOrgChartData;
  onClose: () => void;
};

const money = (value: number) => `NT$ ${Math.round(value).toLocaleString("zh-TW")}`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function OrgNodeCard({
  node,
  isRoot,
  onOpen,
  onOpenOrders,
}: {
  node: ReferralOrgChartNode;
  isRoot?: boolean;
  onOpen: (node: ReferralOrgChartNode) => void;
  onOpenOrders: (node: ReferralOrgChartNode) => void;
}) {
  const canOpen = node.directReferralCount > 0;
  const hasRecentOrders = node.recentOrderCount > 0 && node.recentOrders.length > 0;
  return (
    <div
      className={`member-org-node-card${isRoot ? " is-root" : ""}${canOpen ? " is-clickable" : ""}`}
      onClick={(event) => {
        if (!canOpen) return;
        if ((event.target as HTMLElement).closest("button")) return;
        onOpen(node);
      }}
    >
      <span className="member-org-avatar" aria-hidden="true">{isRoot ? "★" : "●"}</span>
      <strong><MemberCopyValue value={"會員 "} />{node.memberNumber}</strong>
      <small><MemberCopyValue value={"直推 "} />{node.directReferralCount}<MemberCopyValue value={" 人 · 團隊 "} />{node.teamCount}<MemberCopyValue value={" 人"} /></small>
      <span className="member-org-node-metrics">
        {hasRecentOrders ? (
          <button type="button" className="member-org-order-trigger" onClick={() => onOpenOrders(node)}><MemberCopyValue value={"新訂單 "} />{node.recentOrderCount} <b><MemberCopyValue value={"查看 ›"} /></b>
          </button>
        ) : <em><MemberCopyValue value={"新訂單 0"} /></em>}
        <em><MemberCopyValue value={"待入帳 "} />{money(node.pendingCredit)}</em>
        <em><MemberCopyValue value={"本週期 "} />{money(node.currentPeriodCredit)}</em>
      </span>
      {canOpen ? (
        <button type="button" className="member-org-drilldown" onClick={() => onOpen(node)}><MemberCopyValue value={"查看他的組織圖 ›"} /></button>
      ) : <b className="is-muted"><MemberCopyValue value={"目前沒有下線"} /></b>}
    </div>
  );
}

function Branch({
  node,
  byParent,
  depth,
  onOpen,
  onOpenOrders,
}: {
  node: ReferralOrgChartNode;
  byParent: Map<string, ReferralOrgChartNode[]>;
  depth: number;
  onOpen: (node: ReferralOrgChartNode) => void;
  onOpenOrders: (node: ReferralOrgChartNode) => void;
}) {
  const children = depth > 0 ? byParent.get(node.memberId) ?? [] : [];
  return (
    <li>
      <OrgNodeCard node={node} onOpen={onOpen} onOpenOrders={onOpenOrders} />
      {children.length ? (
        <ul>
          {children.map((child) => (
            <Branch key={child.memberId} node={child} byParent={byParent} depth={depth - 1} onOpen={onOpen} onOpenOrders={onOpenOrders} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function MemberOrgOrderViewer({ node, pointDisplayName, onClose }: { node: ReferralOrgChartNode; pointDisplayName: string; onClose: () => void }) {
  return (
    <div className="member-org-order-viewer" role="dialog" aria-modal="true" aria-labelledby="member-org-order-title">
      <MemberCopyElement as="button" type="button" className="member-org-order-backdrop" aria-label="關閉新訂單明細" onClick={onClose} />
      <section className="member-org-order-panel">
        <header>
          <div>
            <p className="eyebrow dark"><MemberCopyValue value={"NEW ORDERS"} /></p>
            <h3 id="member-org-order-title"><MemberCopyValue value={"會員 "} />{node.memberNumber}<MemberCopyValue value={" 的新訂單"} /></h3>
            <p><MemberCopyValue value={"近 30 日共 "} />{node.recentOrders.length}<MemberCopyValue value={" 筆；內容直接讀取既有訂單與回饋紀錄。"} /></p>
          </div>
          <MemberCopyElement as="button" type="button" className="member-org-order-close" onClick={onClose} aria-label="關閉">×</MemberCopyElement>
        </header>
        <div className="member-org-order-list">
          {node.recentOrders.map((order) => (
            <RewardSourceOrderSummaryCard
              key={order.orderNumber}
              summary={order}
              pointDisplayName={pointDisplayName || "KD點"}
              title={order.referralLevel ? `第 ${order.referralLevel} 代推薦回饋` : "會員消費回饋"}
              sourceMemberNumber={node.memberNumber}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export default function MemberReferralOrgChart({ open, data, onClose }: Props) {
  if (!open) return null;
  return <MemberReferralOrgChartDialog data={data} onClose={onClose} />;
}

function MemberReferralOrgChartDialog({ data, onClose }: Omit<Props, "open">) {
  const [history, setHistory] = useState<string[]>([]);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [orderNode, setOrderNode] = useState<ReferralOrgChartNode | null>(null);
  const [scale, setScale] = useState(() => (typeof window !== "undefined" && window.innerWidth <= 760 ? 0.68 : 0.9));
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const allNodes = useMemo(() => [data.root, ...data.nodes], [data]);
  const nodeById = useMemo(() => new Map(allNodes.map((node) => [node.memberId, node])), [allNodes]);
  const byParent = useMemo(() => {
    const map = new Map<string, ReferralOrgChartNode[]>();
    for (const node of data.nodes) {
      if (!node.parentMemberId) continue;
      const list = map.get(node.parentMemberId) ?? [];
      list.push(node);
      map.set(node.parentMemberId, list);
    }
    return map;
  }, [data.nodes]);

  const centerId = history.at(-1) ?? data.root.memberId;
  const center = nodeById.get(centerId) ?? data.root;
  const visibleChildren = byParent.get(center.memberId) ?? [];

  const resetView = () => {
    const mobile = typeof window !== "undefined" && window.innerWidth <= 760;
    setScale(mobile ? 0.68 : 0.9);
    setOffset({ x: 0, y: 0 });
  };

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const openNode = (node: ReferralOrgChartNode) => {
    if (!node.directReferralCount) return;
    setHistory((current) => [...current, node.memberId]);
    resetView();
  };

  const updateScale = (next: number) => setScale(clamp(next, 0.45, 1.7));

  return (
    <div className="member-org-modal" role="dialog" aria-modal="true" aria-labelledby="member-org-title">
      <MemberCopyElement as="button" className="member-org-backdrop" type="button" aria-label="關閉推薦組織圖" onClick={onClose} />
      <div className="member-org-shell">
        <header className="member-org-header">
          <button type="button" className="member-org-return" onClick={onClose}><MemberCopyValue value={"← 返回推薦"} /></button>
          <div>
            <p className="eyebrow dark"><MemberCopyValue value={"REFERRAL ORGANIZATION"} /></p>
            <h2 id="member-org-title"><MemberCopyValue value={"推薦組織圖 "} /><span><MemberCopyValue value={"顯示 3 代內"} /></span></h2>
            <p><MemberCopyValue value={"點擊有下線的會員，即可以他為最上層重新查看下一個三代組織。"} /></p>
          </div>
          <MemberCopyElement as="button" type="button" className="member-org-close" onClick={onClose} aria-label="關閉">×</MemberCopyElement>
        </header>

        <MemberCopyElement as="div" id="member-org-summary" className={`member-org-kpis${summaryExpanded ? " is-expanded" : ""}`} aria-label="推薦組織圖摘要">
          <article><small><MemberCopyValue value={"我的推薦成員"} /></small><strong>{data.stats.teamMembers}</strong><span><MemberCopyValue value={"人"} /></span></article>
          <article><small><MemberCopyValue value={"新訂單"} /></small><strong>{data.stats.newOrders}</strong><span><MemberCopyValue value={"近 30 日有效訂單"} /></span></article>
          <article><small><MemberCopyValue value={"待入帳回饋"} /></small><strong>{money(data.stats.pendingCredit)}</strong><span><MemberCopyValue value={"依正式回饋紀錄"} /></span></article>
          <article><small><MemberCopyValue value={"本週期入帳"} /></small><strong>{money(data.stats.currentPeriodCredit)}</strong><span>{data.periodLabel}</span></article>
        </MemberCopyElement>

        <div className="member-org-toolbar">
          <div className="member-org-current">
            <small><MemberCopyValue value={"目前查看"} /></small>
            <strong><MemberCopyValue value={center.memberId === data.root.memberId ? `我的組織圖 · ${center.memberNumber}` : `會員 ${center.memberNumber}`} /></strong>
          </div>
          <button
            type="button"
            className="member-org-summary-toggle"
            aria-expanded={summaryExpanded}
            aria-controls="member-org-summary"
            onClick={() => setSummaryExpanded((current) => !current)}
          >
            <MemberCopyValue value={summaryExpanded ? "收合摘要" : "展開摘要"} />
          </button>
          <div className="member-org-actions">
            <button type="button" disabled={!history.length} onClick={() => { setHistory((current) => current.slice(0, -1)); resetView(); }}><MemberCopyValue value={"← 返回上一層"} /></button>
            <button type="button" onClick={() => { setHistory([]); resetView(); }}><MemberCopyValue value={"⌂ 回到我的組織圖"} /></button>
          </div>
          <MemberCopyElement as="div" className="member-org-zoom" aria-label="組織圖縮放">
            <MemberCopyElement as="button" type="button" onClick={() => updateScale(scale - 0.1)} aria-label="縮小">−</MemberCopyElement>
            <span>{Math.round(scale * 100)}%</span>
            <MemberCopyElement as="button" type="button" onClick={() => updateScale(scale + 0.1)} aria-label="放大">＋</MemberCopyElement>
            <button type="button" onClick={resetView}><MemberCopyValue value={"適合畫面"} /></button>
          </MemberCopyElement>
        </div>

        <div
          className="member-org-viewport"
          onWheel={(event) => {
            event.preventDefault();
            updateScale(scale + (event.deltaY < 0 ? 0.08 : -0.08));
          }}
          onPointerDown={(event) => {
            const target = event.target as HTMLElement;
            const interactiveTarget = target.closest(".member-org-node-card, button, a, input, select, textarea");
            if (event.pointerType !== "touch" && interactiveTarget) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          }}
          onPointerMove={(event) => {
            const previous = pointers.current.get(event.pointerId);
            if (!previous) return;
            const before = [...pointers.current.values()];
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            const after = [...pointers.current.values()];
            if (after.length === 1) {
              setOffset((current) => ({ x: current.x + event.clientX - previous.x, y: current.y + event.clientY - previous.y }));
            } else if (after.length >= 2 && before.length >= 2) {
              const distance = (items: Array<{ x: number; y: number }>) => Math.hypot(items[0].x - items[1].x, items[0].y - items[1].y);
              const beforeDistance = distance(before);
              const afterDistance = distance(after);
              if (beforeDistance > 0) updateScale(scale * (afterDistance / beforeDistance));
              const beforeMid = { x: (before[0].x + before[1].x) / 2, y: (before[0].y + before[1].y) / 2 };
              const afterMid = { x: (after[0].x + after[1].x) / 2, y: (after[0].y + after[1].y) / 2 };
              setOffset((current) => ({ x: current.x + afterMid.x - beforeMid.x, y: current.y + afterMid.y - beforeMid.y }));
            }
          }}
          onPointerUp={(event) => pointers.current.delete(event.pointerId)}
          onPointerCancel={(event) => pointers.current.delete(event.pointerId)}
        >
          <div className="member-org-stage" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}>
            <div className="member-org-tree">
              <ul>
                <li>
                  <OrgNodeCard node={center} isRoot onOpen={openNode} onOpenOrders={setOrderNode} />
                  {visibleChildren.length ? (
                    <ul>
                      {visibleChildren.map((node) => (
                        <Branch key={node.memberId} node={node} byParent={byParent} depth={2} onOpen={openNode} onOpenOrders={setOrderNode} />
                      ))}
                    </ul>
                  ) : null}
                </li>
              </ul>
            </div>
          </div>
        </div>

        {orderNode ? <MemberOrgOrderViewer node={orderNode} pointDisplayName={data.pointDisplayName} onClose={() => setOrderNode(null)} /> : null}

        <footer className="member-org-footer">
          <span><MemberCopyValue value={"拖曳移動畫布 · 滾輪或雙指縮放"} /></span>
          <span><MemberCopyValue value={"新訂單／回饋數字僅顯示既有會員與回饋資料，不另行計算。"} /></span>
        </footer>
      </div>
    </div>
  );
}
