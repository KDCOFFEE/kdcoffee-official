"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ReferralOrgOrderDetail = {
  orderNumber: string;
  createdAt: string | null;
  sourceItems: Array<{ name: string; optionLabel: string; optionDetail: string; preparationLabel: string; quantity: number }>;
  referralLevel: number | null;
  effectivePV: number | null;
  rewardRate: number | null;
  creditAmount: number | null;
  projectedCreditAmount: number | null;
  status: string | null;
  cancellationReason: string | null;
  qualificationStatus: string | null;
  releasedAt: string | null;
};

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
      <strong>會員 {node.memberNumber}</strong>
      <small>直推 {node.directReferralCount} 人 · 團隊 {node.teamCount} 人</small>
      <span className="member-org-node-metrics">
        {hasRecentOrders ? (
          <button type="button" className="member-org-order-trigger" onClick={() => onOpenOrders(node)}>
            新訂單 {node.recentOrderCount} <b>查看 ›</b>
          </button>
        ) : <em>新訂單 0</em>}
        <em>待入帳 {money(node.pendingCredit)}</em>
        <em>本週期 {money(node.currentPeriodCredit)}</em>
      </span>
      {canOpen ? (
        <button type="button" className="member-org-drilldown" onClick={() => onOpen(node)}>
          查看他的組織圖 ›
        </button>
      ) : <b className="is-muted">目前沒有下線</b>}
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

const formatOrgDate = (value: string | null) => {
  if (!value) return "日期未記錄";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10).replaceAll("-", "/");
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
};

function orgRewardStatusLabel(order: ReferralOrgOrderDetail) {
  if (!order.status) return "此訂單未產生你的推薦回饋";
  if (order.status === "released") return "已入帳 ✓";
  if (order.status === "reversed") return "獎勵已沖回";
  if (order.status === "cancelled") return "獎勵已取消";
  if (order.qualificationStatus === "awaiting_order") return "待完成資格消費";
  if (order.qualificationStatus === "awaiting_completion") return "等待訂單完成";
  if (order.qualificationStatus === "qualified") return "已取得資格・等待發放";
  if (order.qualificationStatus === "expired") return "資格已逾期";
  return "待入帳";
}

function MemberOrgOrderViewer({ node, pointDisplayName, onClose }: { node: ReferralOrgChartNode; pointDisplayName: string; onClose: () => void }) {
  return (
    <div className="member-org-order-viewer" role="dialog" aria-modal="true" aria-labelledby="member-org-order-title">
      <button type="button" className="member-org-order-backdrop" aria-label="關閉新訂單明細" onClick={onClose} />
      <section className="member-org-order-panel">
        <header>
          <div>
            <p className="eyebrow dark">NEW ORDERS</p>
            <h3 id="member-org-order-title">會員 {node.memberNumber} 的新訂單</h3>
            <p>近 30 日共 {node.recentOrders.length} 筆；內容直接讀取既有訂單與 Reward Engine 紀錄。</p>
          </div>
          <button type="button" className="member-org-order-close" onClick={onClose} aria-label="關閉">×</button>
        </header>
        <div className="member-org-order-list">
          {node.recentOrders.map((order) => {
            const rewardAmount = order.projectedCreditAmount ?? order.creditAmount;
            const hasReward = order.referralLevel != null && order.effectivePV != null && order.rewardRate != null && rewardAmount != null;
            return (
              <article className="member-org-order-card" key={order.orderNumber}>
                <div className="member-org-order-card-top">
                  <time>{formatOrgDate(order.createdAt)}</time>
                  <span>{orgRewardStatusLabel(order)}</span>
                </div>
                <div className="member-org-order-card-title">
                  <div>
                    <small>REFERRAL REWARD</small>
                    <strong>{order.referralLevel ? `第 ${order.referralLevel} 代推薦回饋` : "下線新訂單"}</strong>
                  </div>
                  <em>{order.orderNumber}</em>
                </div>
                <div className="member-org-order-source">
                  <span><small>來源會員</small><strong>{node.memberNumber}</strong></span>
                  <span className="member-org-order-items"><small>消費內容</small><strong>{order.sourceItems.length ? order.sourceItems.map((item) => `${item.name}${item.optionLabel ? `・${item.optionLabel}` : ""}${item.optionDetail ? `・${item.optionDetail}` : ""}${item.preparationLabel ? `・${item.preparationLabel}` : ""} × ${item.quantity}`).join("、") : "商品明細未記錄"}</strong></span>
                </div>
                {hasReward ? (
                  <div className="member-org-order-calc">
                    <span><small>回饋計算</small><strong>{Math.round(order.effectivePV!)} {pointDisplayName || "KD點"} × {(order.rewardRate! * 100).toLocaleString("zh-TW", { maximumFractionDigits: 2 })}%</strong></span>
                    <span><small>本筆回饋</small><strong>+ {money(rewardAmount!)}</strong></span>
                  </div>
                ) : (
                  <p className="member-org-order-no-reward">此筆訂單目前沒有對你的推薦回饋紀錄；組織圖不另外計算獎勵。</p>
                )}
              </article>
            );
          })}
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
      <button className="member-org-backdrop" type="button" aria-label="關閉推薦組織圖" onClick={onClose} />
      <div className="member-org-shell">
        <header className="member-org-header">
          <div>
            <p className="eyebrow dark">REFERRAL ORGANIZATION</p>
            <h2 id="member-org-title">推薦組織圖 <span>顯示 3 代內</span></h2>
            <p>點擊有下線的會員，即可以他為最上層重新查看下一個三代組織。</p>
          </div>
          <button type="button" className="member-org-close" onClick={onClose} aria-label="關閉">×</button>
        </header>

        <div id="member-org-summary" className={`member-org-kpis${summaryExpanded ? " is-expanded" : ""}`} aria-label="推薦組織圖摘要">
          <article><small>我的推薦成員</small><strong>{data.stats.teamMembers}</strong><span>人</span></article>
          <article><small>新訂單</small><strong>{data.stats.newOrders}</strong><span>近 30 日有效訂單</span></article>
          <article><small>待入帳回饋</small><strong>{money(data.stats.pendingCredit)}</strong><span>依 Reward Engine</span></article>
          <article><small>本週期入帳</small><strong>{money(data.stats.currentPeriodCredit)}</strong><span>{data.periodLabel}</span></article>
        </div>

        <div className="member-org-toolbar">
          <div className="member-org-current">
            <small>目前查看</small>
            <strong>{center.memberId === data.root.memberId ? `我的組織圖 · ${center.memberNumber}` : `會員 ${center.memberNumber}`}</strong>
          </div>
          <button
            type="button"
            className="member-org-summary-toggle"
            aria-expanded={summaryExpanded}
            aria-controls="member-org-summary"
            onClick={() => setSummaryExpanded((current) => !current)}
          >
            {summaryExpanded ? "收合摘要" : "展開摘要"}
          </button>
          <div className="member-org-actions">
            <button type="button" disabled={!history.length} onClick={() => { setHistory((current) => current.slice(0, -1)); resetView(); }}>← 返回上一層</button>
            <button type="button" onClick={() => { setHistory([]); resetView(); }}>⌂ 回到我的組織圖</button>
          </div>
          <div className="member-org-zoom" aria-label="組織圖縮放">
            <button type="button" onClick={() => updateScale(scale - 0.1)} aria-label="縮小">−</button>
            <span>{Math.round(scale * 100)}%</span>
            <button type="button" onClick={() => updateScale(scale + 0.1)} aria-label="放大">＋</button>
            <button type="button" onClick={resetView}>適合畫面</button>
          </div>
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
          <span>拖曳移動畫布 · 滾輪或雙指縮放</span>
          <span>新訂單／回饋數字僅讀取既有會員與 Reward Engine 資料，不另行計算獎勵規則。</span>
        </footer>
      </div>
    </div>
  );
}
