"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  adminGraphAncestorIds,
  isAdminGraphActivationKey,
  isAdminGraphClickGesture,
  type AdminOrganizationGraph as OrganizationGraph,
} from "@/lib/adminMemberOrganization";
import { AdminOrganizationDiagnostics } from "./AdminOrganizationDiagnostics";
import { AdminOrganizationNode } from "./AdminOrganizationNode";

const ALL_ROOTS = "__all_roots__";

export function AdminOrganizationGraph(props: {
  graph: OrganizationGraph;
  selectedMemberId: string | null;
  focusMemberId: string | null;
  onSelect: (memberId: string, trigger: HTMLElement) => void;
}) {
  const nodes = useMemo(() => new Map(props.graph.nodes.map((node) => [node.memberId, node])), [props.graph.nodes]);
  const [rootId, setRootId] = useState(ALL_ROOTS);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<null | { pointerId: number; x: number; y: number; panX: number; panY: number; memberId: string | null; moved: boolean }>(null);

  useEffect(() => {
    if (!props.focusMemberId) return;
    const focusMemberId = props.focusMemberId;
    const target = nodes.get(focusMemberId);
    const targetRootId = target?.rootId ?? (target?.isRoot ? target.memberId : null);

    const frame = requestAnimationFrame(() => {
      if (targetRootId) {
        setRootId((current) => current !== ALL_ROOTS && current !== targetRootId ? targetRootId : current);
      }
      setExpanded((current) => new Set([...current, ...adminGraphAncestorIds(focusMemberId, nodes)]));

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          viewportRef.current?.querySelector<HTMLElement>(`[data-member-node="${CSS.escape(focusMemberId)}"]`)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
        });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [nodes, props.focusMemberId]);

  const visibleRootIds = rootId === ALL_ROOTS
    ? props.graph.roots
    : props.graph.roots.includes(rootId) ? [rootId] : props.graph.roots;

  function toggle(memberId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(memberId)) next.delete(memberId); else next.add(memberId);
      return next;
    });
  }

  function expandAll() {
    const ids = props.graph.nodes.filter((node) => node.childrenIds.length).map((node) => node.memberId);
    const next = new Set<string>();
    let index = 0;
    const batch = () => {
      ids.slice(index, index + 200).forEach((id) => next.add(id));
      index += 200;
      setExpanded(new Set(next));
      if (index < ids.length) requestAnimationFrame(batch);
    };
    batch();
  }

  function returnToRoot() {
    setPan({ x: 0, y: 0 });
    setZoom(1);
    setExpanded((current) => {
      const next = new Set(current);
      for (const id of visibleRootIds) next.add(id);
      return next;
    });
    viewportRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }

  return <section className="organization-panel" aria-label="完整推薦組織圖">
    <header className="graph-toolbar">
      <label>Root
        <select value={rootId} onChange={(event) => { setRootId(event.target.value); setPan({ x: 0, y: 0 }); }}>
          <option value={ALL_ROOTS}>全部 root（{props.graph.roots.length}）</option>
          {props.graph.roots.map((id) => <option key={id} value={id}>{nodes.get(id)?.displayName || id} · {nodes.get(id)?.memberNumber || id}</option>)}
        </select>
      </label>
      <button type="button" onClick={expandAll}>全部展開</button>
      <button type="button" onClick={() => setExpanded(new Set())}>全部收合</button>
      <button type="button" onClick={returnToRoot}>回到 root</button>
      <button type="button" aria-label="縮小" onClick={() => setZoom((value) => Math.max(.5, Number((value - .1).toFixed(1))))}>−</button>
      <output>{Math.round(zoom * 100)}%</output>
      <button type="button" aria-label="放大" onClick={() => setZoom((value) => Math.min(2, Number((value + .1).toFixed(1))))}>＋</button>
    </header>
    <AdminOrganizationDiagnostics findings={props.graph.diagnostics} />
    <div
      ref={viewportRef}
      className="graph-viewport"
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest("[data-branch-control]")) return;
        const member = (event.target as HTMLElement).closest<HTMLElement>("[data-member-node]");
        gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y, memberId: member?.dataset.memberNode ?? null, moved: false };
      }}
      onPointerMove={(event) => {
        const active = gesture.current;
        if (!active || active.pointerId !== event.pointerId) return;
        const moved = !isAdminGraphClickGesture({ x: active.x, y: active.y }, { x: event.clientX, y: event.clientY });
        if (moved && !active.moved) event.currentTarget.setPointerCapture(event.pointerId);
        active.moved ||= moved;
        if (active.moved) setPan({ x: active.panX + event.clientX - active.x, y: active.panY + event.clientY - active.y });
      }}
      onPointerUp={(event) => {
        const active = gesture.current;
        gesture.current = null;
        if (!active || active.pointerId !== event.pointerId || active.moved || !active.memberId) return;
        const member = (event.target as HTMLElement).closest<HTMLElement>("[data-member-node]");
        if (member?.dataset.memberNode === active.memberId) props.onSelect(active.memberId, member);
      }}
      onKeyDown={(event) => {
        if (!isAdminGraphActivationKey(event.key) || (event.target as HTMLElement).closest("[data-branch-control]")) return;
        const member = (event.target as HTMLElement).closest<HTMLElement>("[data-member-node]");
        if (!member?.dataset.memberNode) return;
        event.preventDefault();
        props.onSelect(member.dataset.memberNode, member);
      }}
    >
      <div className="graph-stage" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        {visibleRootIds.length ? <div className="organization-forest">
          {visibleRootIds.map((id) => {
            const root = nodes.get(id);
            return root ? <ul className="organization-tree" key={id} data-root-tree={id}>
              <AdminOrganizationNode node={root} nodes={nodes} expanded={expanded} selectedMemberId={props.selectedMemberId} onToggle={toggle} />
            </ul> : null;
          })}
        </div> : <p>目前沒有可顯示的 root。</p>}
      </div>
    </div>
  </section>;
}
