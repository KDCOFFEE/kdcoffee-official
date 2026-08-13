"use client";

import { useMemo, useState } from "react";

type CleanupAsset = {
  publicId: string;
  displayName: string;
  createdAt?: string;
  bytes?: number;
  format?: string;
  width?: number;
  height?: number;
  duration?: number;
  posterUrl?: string;
  status: "used" | "orphan";
  canDelete: boolean;
};

type CleanupScan = {
  assets: CleanupAsset[];
  total: number;
  used: number;
  orphan: number;
  deletable: number;
};

function formatBytes(bytes?: number) {
  if (!bytes) return "—";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("zh-TW", { hour12: false });
}

export default function CloudinaryVideoManager() {
  const [scan, setScan] = useState<CleanupScan | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [scanning, setScanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  async function scanVideos() {
    setScanning(true);
    setMessage("正在掃描 Cloudinary 影片…");
    setSelected([]);
    try {
      const response = await fetch("/api/admin/media/cleanup", {
        method: "POST",
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "影片掃描失敗。");
      setScan(result);
      setMessage(`掃描完成：共 ${result.total} 支影片，${result.orphan} 支未使用。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "影片掃描失敗。");
    } finally {
      setScanning(false);
    }
  }

  function toggle(publicId: string) {
    setSelected((current) =>
      current.includes(publicId)
        ? current.filter((item) => item !== publicId)
        : [...current, publicId],
    );
  }

  async function deleteSelected() {
    setDeleting(true);
    setMessage("正在重新確認使用狀態並刪除…");
    try {
      const response = await fetch("/api/admin/media/cleanup/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicIds: selected }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "影片刪除失敗。");
      setConfirming(false);
      setSelected([]);
      setMessage(
        `已刪除 ${result.deletedCount} 支；使用中跳過 ${result.skippedInUse} 支；失敗 ${result.failedCount} 支。`,
      );
      await scanVideos();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "影片刪除失敗。");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="cloudinary-cleanup-manager" aria-labelledby="cloudinary-cleanup-title">
      <div className="cloudinary-cleanup-head">
        <div>
          <p className="eyebrow dark">CLOUDINARY VIDEO CLEANUP</p>
          <h2 id="cloudinary-cleanup-title">Cloudinary 影片管理</h2>
          <p>只掃描 KD Coffee 影片資料夾。系統不會自動刪除任何影片。</p>
        </div>
        <button type="button" onClick={scanVideos} disabled={scanning || deleting}>
          {scanning ? "掃描中…" : "掃描 Cloudinary 影片"}
        </button>
      </div>

      {message ? <div className="cms-message">{message}</div> : null}
      {scan ? (
        <>
          <div className="cloudinary-cleanup-summary">
            <article><small>全部影片</small><strong>{scan.total}</strong></article>
            <article><small>使用中</small><strong>{scan.used}</strong></article>
            <article><small>未使用</small><strong>{scan.orphan}</strong></article>
            <article><small>可安全刪除</small><strong>{scan.deletable}</strong></article>
          </div>
          <div className="cloudinary-cleanup-grid">
            {scan.assets.map((asset) => (
              <article className={`cloudinary-cleanup-card ${asset.status}`} key={asset.publicId}>
                <div className="cloudinary-cleanup-preview">
                  {asset.posterUrl ? <img src={asset.posterUrl} alt="" /> : <span>無預覽圖</span>}
                </div>
                <div className="cloudinary-cleanup-card-head">
                  <div><b>{asset.displayName}</b><small>{asset.publicId}</small></div>
                  <span>{asset.status === "used" ? "使用中" : asset.canDelete ? "未使用" : "等待確認"}</span>
                </div>
                <dl>
                  <div><dt>建立時間</dt><dd>{formatDate(asset.createdAt)}</dd></div>
                  <div><dt>檔案</dt><dd>{asset.format?.toUpperCase() || "—"} · {formatBytes(asset.bytes)}</dd></div>
                  <div><dt>尺寸</dt><dd>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : "—"}</dd></div>
                  <div><dt>長度</dt><dd>{asset.duration ? `${asset.duration.toFixed(1)} 秒` : "—"}</dd></div>
                </dl>
                <label className="cloudinary-cleanup-select">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(asset.publicId)}
                    disabled={!asset.canDelete || deleting}
                    onChange={() => toggle(asset.publicId)}
                  />
                  {asset.status === "used"
                    ? "網站仍在使用，禁止刪除"
                    : asset.canDelete
                      ? "選取永久刪除"
                      : "建立未滿一小時，暫不可刪除"}
                </label>
              </article>
            ))}
          </div>
          {scan.assets.length === 0 ? <p className="admin-empty">目前沒有 KD Coffee Cloudinary 影片。</p> : null}
          <div className="cloudinary-cleanup-delete-bar">
            <span>已選取 {selected.length} 支影片</span>
            <button type="button" disabled={!selected.length || deleting} onClick={() => setConfirming(true)}>
              刪除選取影片
            </button>
          </div>
        </>
      ) : null}

      {confirming ? (
        <div className="cms-modal-backdrop" role="presentation">
          <div className="cms-modal cloudinary-cleanup-modal" role="dialog" aria-modal="true" aria-labelledby="cleanup-confirm-title">
            <h2 id="cleanup-confirm-title">確認永久刪除</h2>
            <p>你即將永久刪除 {selected.length} 支 Cloudinary 影片。</p>
            <p>只有目前沒有被 KD Coffee 網站使用的影片才允許刪除。</p>
            <p><strong>此操作無法從 KD Coffee 後台復原。</strong></p>
            <div className="cms-modal-actions">
              <button type="button" className="cms-secondary-button" disabled={deleting} onClick={() => setConfirming(false)}>取消</button>
              <button type="button" disabled={deleting} onClick={deleteSelected}>{deleting ? "再次確認中…" : "再次確認永久刪除"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
