"use client";

import { useMemo, useState } from "react";

import type { AdminMemberDirectoryRow } from "@/lib/adminMemberDirectory";

const ROW_HEIGHT = 76;

export function AdminMemberDirectoryList(props: {
  rows: AdminMemberDirectoryRow[];
  selectedMemberId: string | null;
  onSelect: (memberId: string, trigger: HTMLElement) => void;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const virtual = props.rows.length > 150;
  const start = virtual ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 5) : 0;
  const end = virtual ? Math.min(props.rows.length, start + 30) : props.rows.length;
  const visible = useMemo(() => props.rows.slice(start, end), [end, props.rows, start]);

  return <div className="directory-list" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
    <div style={virtual ? { height: props.rows.length * ROW_HEIGHT, position: "relative" } : undefined}>
      <div style={virtual ? { position: "absolute", inset: `${start * ROW_HEIGHT}px 0 auto` } : undefined}>
        {visible.map((row) => <button
          type="button"
          key={row.memberId}
          className={row.memberId === props.selectedMemberId ? "selected" : ""}
          onClick={(event) => props.onSelect(row.memberId, event.currentTarget)}
        >
          <span><strong>{row.displayName}</strong><small>{row.memberNumber || "無會員編號"}</small></span>
          <span><b>{row.subscriptionStatuses.join(" / ") || "無定期配送"}</b><small>直推 {row.directCount}・團隊 {row.teamCount}</small></span>
        </button>)}
      </div>
    </div>
  </div>;
}
