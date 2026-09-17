"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AdminMemberDetail, AdminMemberDirectoryDiagnostic, AdminMemberDirectoryRow } from "@/lib/adminMemberDirectory";
import type { AdminOrganizationGraph } from "@/lib/adminMemberOrganization";
import { searchAdminMembers } from "@/lib/adminMemberSearch";
import { AdminMemberDetailPanel } from "./AdminMemberDetailPanel";
import { AdminMemberDirectoryList } from "./AdminMemberDirectoryList";
import { AdminMemberSearch } from "./AdminMemberSearch";
import { AdminOrganizationGraph as OrganizationGraphView } from "./AdminOrganizationGraph";
import styles from "./AdminMemberDirectory.module.css";

type DirectoryPayload = {
  revisionToken: string;
  generatedAt: string;
  rows: AdminMemberDirectoryRow[];
  diagnostics: AdminMemberDirectoryDiagnostic[];
  sourceCounts: { members: number; identities: number; orders: number; subscriptions: number; referrals: number };
};

type OrganizationPayload = AdminOrganizationGraph & { revisionToken: string; generatedAt: string };

async function privateJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || `資料讀取失敗 (${response.status})`);
  return body as T;
}

export function AdminMemberDirectory() {
  const [directory, setDirectory] = useState<DirectoryPayload | null>(null);
  const [organization, setOrganization] = useState<OrganizationPayload | null>(null);
  const [query, setQuery] = useState("");
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [focusMemberId, setFocusMemberId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminMemberDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const restoreFocus = useRef<HTMLElement | null>(null);

  const loadBase = useCallback(async () => {
    setError("");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const [nextDirectory, nextOrganization] = await Promise.all([
        privateJson<DirectoryPayload>("/api/admin/member-directory"),
        privateJson<OrganizationPayload>("/api/admin/member-directory/organization"),
      ]);
      if (nextDirectory.revisionToken === nextOrganization.revisionToken) {
        setDirectory(nextDirectory);
        setOrganization(nextOrganization);
        return;
      }
    }
    throw new Error("Live data revision 在讀取期間持續變動，已拒絕合併不一致的目錄與組織圖。");
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      loadBase().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "資料讀取失敗"));
    });
    return () => cancelAnimationFrame(frame);
  }, [loadBase]);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailError("");
    const target = restoreFocus.current;
    restoreFocus.current = null;
    requestAnimationFrame(() => target?.focus());
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (detailOpen) {
        closeDetail();
        return;
      }
      if (directoryOpen) setDirectoryOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDetail, detailOpen, directoryOpen]);

  const openMember = useCallback(async (memberId: string, trigger: HTMLElement) => {
    restoreFocus.current = trigger;
    setDirectoryOpen(false);
    setSelectedMemberId(memberId);
    setFocusMemberId(null);
    requestAnimationFrame(() => setFocusMemberId(memberId));
    setDetailOpen(true);
    setDetail(null);
    setLoadingDetail(true);
    setDetailError("");
    try {
      const next = await privateJson<AdminMemberDetail>(`/api/admin/member-directory/${encodeURIComponent(memberId)}`);
      if (directory && next.revisionToken !== directory.revisionToken) {
        await loadBase();
        throw new Error("會員資料在開啟時已更新，目錄已重新同步；請再選一次會員。");
      }
      setDetail(next);
    } catch (reason) {
      setDetail(null);
      setDetailError(reason instanceof Error ? reason.message : "會員資料讀取失敗");
    } finally {
      setLoadingDetail(false);
    }
  }, [directory, loadBase]);

  const searchResults = useMemo(() => directory ? searchAdminMembers(directory.rows, query) : [], [directory, query]);

  const openMemberFromSearch = useCallback((memberId: string, trigger: HTMLElement) => {
    setQuery("");
    void openMember(memberId, trigger);
  }, [openMember]);

  return <main className={styles.root}>
    <header className={styles.header}>
      <div><p>OWNER · LIVE CANONICAL DATA</p><h1>會員資料與組織圖</h1><span>唯讀營運檢視，不會修改會員、訂單、權益或推薦關係。</span></div>
      <a href="/admin">返回營運中心</a>
    </header>
    {error ? <section className={styles.fatal}><strong>無法安全讀取會員資料</strong><p>{error}</p><button type="button" onClick={() => loadBase().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "資料讀取失敗"))}>重新讀取</button></section> : null}
    {!directory || !organization ? (!error ? <p className={styles.loading}>正在建立一致的 live data snapshot…</p> : null) : <>
      <section className={styles.summary} aria-label="資料摘要">
        <span><b>{directory.sourceCounts.members}</b> 位會員</span><span><b>{directory.sourceCounts.orders}</b> 筆訂單</span><span><b>{organization.counts.currentRelationships}</b> 個有效推薦關係</span><span><b>{organization.counts.roots}</b> 個 root</span><small>Revision {directory.revisionToken.slice(0, 12)} · {new Date(directory.generatedAt).toLocaleString("zh-TW")}</small>
      </section>

      <div className={styles.workspace}>
        <div className={styles.workspaceToolbar}>
          <AdminMemberSearch query={query} onQueryChange={setQuery} results={searchResults} onSelect={openMemberFromSearch} />
          <button
            type="button"
            className={styles.directoryTrigger}
            aria-expanded={directoryOpen}
            aria-controls="admin-member-directory-drawer"
            onClick={() => {
              if (directoryOpen) {
                setDirectoryOpen(false);
              } else {
                setDetailOpen(false);
                setDirectoryOpen(true);
              }
            }}
          >
            會員目錄 <span>{directory.rows.length}</span>
          </button>
        </div>

        <OrganizationGraphView graph={organization} selectedMemberId={selectedMemberId} focusMemberId={focusMemberId} onSelect={openMember} />

        {directoryOpen ? <aside id="admin-member-directory-drawer" className={`${styles.drawer} ${styles.directoryDrawer}`} aria-label="完整會員目錄">
          <header className={styles.drawerHeader}>
            <div><small>OWNER ONLY</small><h2>完整會員目錄</h2><p>{directory.rows.length} 位會員</p></div>
            <button type="button" aria-label="關閉會員目錄" onClick={() => setDirectoryOpen(false)}>×</button>
          </header>
          <AdminMemberDirectoryList rows={directory.rows} selectedMemberId={selectedMemberId} onSelect={openMember} />
        </aside> : null}

        {detailOpen ? <div className={`${styles.drawer} ${styles.detailDrawer}`}>
          <AdminMemberDetailPanel detail={detail} loading={loadingDetail} error={detailError} onClose={closeDetail} />
        </div> : null}
      </div>
    </>}
  </main>;
}
