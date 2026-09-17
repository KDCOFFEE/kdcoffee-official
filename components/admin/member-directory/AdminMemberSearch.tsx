"use client";

import type { AdminMemberSearchMatch } from "@/lib/adminMemberSearch";
import type { AdminMemberDirectoryRow } from "@/lib/adminMemberDirectory";

const MAX_VISIBLE_RESULTS = 40;

function isGenericMemberName(value: string) {
  const normalized = value.trim().toLocaleLowerCase("en-US").replace(/\s+/gu, "");
  return normalized === "kdcoffee會員" || normalized === "kdcoffeemember" || normalized === "會員";
}

function preferredName(row: AdminMemberDirectoryRow) {
  const displayName = row.displayName?.trim();
  const pickupName = row.pickupName?.trim();
  if (pickupName && (!displayName || isGenericMemberName(displayName))) return pickupName;
  return displayName || pickupName || "未填姓名";
}

function matchedNameValue(row: AdminMemberDirectoryRow, query: string) {
  const needle = query.trim().toLocaleLowerCase("en-US");
  const candidates = [row.displayName, row.pickupName].map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  return candidates.find((value) => value.toLocaleLowerCase("en-US").includes(needle)) || preferredName(row);
}

function matchedValue(row: AdminMemberDirectoryRow, match: AdminMemberSearchMatch, query: string) {
  if (match.reason === "姓名") return matchedNameValue(row, query);
  if (match.reason === "會員編號") return row.memberNumber || "—";
  if (match.reason === "手機") return row.phone || "—";
  if (match.reason === "Member ID") return row.memberId || "—";

  // Search can match either contact Email or login Email. Prefer the value that
  // actually contains the query is handled in ranking; for display, expose both
  // only when they differ so the Owner can immediately distinguish candidates.
  const contact = row.email?.trim();
  const login = row.loginEmail?.trim();
  if (contact && login && contact.toLocaleLowerCase("en-US") !== login.toLocaleLowerCase("en-US")) {
    return `${contact} / 登入 ${login}`;
  }
  return contact || login || "—";
}

function kindLabel(kind: AdminMemberSearchMatch["kind"]) {
  if (kind === "exact") return "完全符合";
  if (kind === "prefix") return "開頭符合";
  return "部分符合";
}

export function AdminMemberSearch(props: {
  query: string;
  onQueryChange: (value: string) => void;
  results: Array<{ row: AdminMemberDirectoryRow; match: AdminMemberSearchMatch }>;
  onSelect: (memberId: string, trigger: HTMLElement) => void;
}) {
  const query = props.query.trim();
  const visibleResults = props.results.slice(0, MAX_VISIBLE_RESULTS);
  const hiddenCount = Math.max(0, props.results.length - visibleResults.length);

  return <div className="member-search">
    <label htmlFor="admin-member-search">搜尋會員</label>
    <input
      id="admin-member-search"
      value={props.query}
      onChange={(event) => props.onQueryChange(event.target.value)}
      placeholder="搜尋姓名、手機、Email、會員編號或 Member ID"
      autoComplete="off"
    />
    {query ? <div className="member-search-results" role="listbox" aria-label="會員搜尋結果">
      {props.results.length ? <div className="member-search-summary" aria-live="polite">
        <strong>找到 {props.results.length} 位</strong>
        <span>{props.results.length > 1 ? "可繼續輸入幾個字縮小範圍，不需要輸入完整資料。" : "找到唯一候選會員。"}</span>
      </div> : null}

      {visibleResults.map(({ row, match }) => <button
        key={row.memberId}
        type="button"
        role="option"
        aria-selected="false"
        onClick={(event) => props.onSelect(row.memberId, event.currentTarget)}
      >
        <span className="member-search-primary">
          <strong>{preferredName(row)}</strong>
          <small>{row.memberNumber || "無會員編號"}</small>
        </span>
        <span className="member-search-match">
          <small>{match.reason} · {kindLabel(match.kind)}</small>
          <b>{matchedValue(row, match, query)}</b>
        </span>
        <span className="member-search-meta">
          {row.pickupName && row.pickupName !== preferredName(row) ? <small>取貨姓名 {row.pickupName}</small> : null}
          {match.reason !== "手機" && row.phone ? <small>手機 {row.phone}</small> : null}
          {match.reason !== "Email" && (row.email || row.loginEmail) ? <small>Email {row.email || row.loginEmail}</small> : null}
        </span>
      </button>)}

      {hiddenCount ? <div className="member-search-more">
        還有 {hiddenCount} 位符合。請再輸入 1～2 個字、Email 片段、手機末碼或會員編號縮小範圍。
      </div> : null}

      {!props.results.length ? <p>找不到符合條件的會員。</p> : null}
    </div> : null}
  </div>;
}
