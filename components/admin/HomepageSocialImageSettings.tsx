"use client";

import { useEffect, useRef, useState } from "react";
import type { AssetRecord } from "@/lib/assets";
import { HOMEPAGE_SEO_LIMITS, type HomepageSeo } from "@/lib/pageBuilder";
import SocialImageField from "./SocialImageField";
import styles from "./SocialImageField.module.css";

const endpoint = "/api/admin/pages";
const fields = ["title", "description", "socialImage"] as const;

type Settings = {
  version: number;
  seo?: HomepageSeo;
  assets: AssetRecord[];
  defaults: { title: string; description: string; image: { url: string } };
  effective: { title: string; description: string; image: { url: string }; imageIsCustom: boolean };
};

const changed = (draft: HomepageSeo, saved: HomepageSeo, key: typeof fields[number]) =>
  JSON.stringify(draft[key] ?? null) !== JSON.stringify(saved[key] ?? null);

async function readSettings(): Promise<Settings> {
  const response = await fetch(endpoint + "?scope=homepageSeo", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "暫時無法讀取首頁搜尋與分享設定。");
  return data;
}
export default function HomepageSocialImageSettings() {
  const [settings, setSettings] = useState<Settings>();
  const [draft, setDraft] = useState<HomepageSeo>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const lock = useRef(false);
  const saved = settings?.seo ?? {};
  const dirty = fields.some(key => changed(draft, saved, key));

  function applySettings(next: Settings) {
    setSettings(next);
    setDraft(next.seo ?? {});
    setConflict(false);
    setNeedsReload(false);
  }

  useEffect(() => {
    void readSettings().then(applySettings).catch(error => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);

  async function reload() {
    if (lock.current || (dirty && !window.confirm("重新整理會捨棄尚未儲存的編輯，確定繼續？"))) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try { applySettings(await readSettings()); }
    catch (error) { setMessage(error instanceof Error ? error.message : "讀取失敗。"); }
    finally { lock.current = false; setBusy(false); }
  }

  async function save() {
    if (!settings || lock.current || conflict || needsReload || !dirty) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    const edits = fields.filter(key => changed(draft, saved, key));
    const payload = Object.fromEntries(edits.map(key => [key === "socialImage" ? "image" : key, draft[key] ?? null]));
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, scope: "homepageSeo", version: settings.version }),
      });
      if (response.status === 409) {
        setNeedsReload(true);
        const latest = await readSettings();
        const current = latest.seo ?? {};
        setSettings(latest);
        setDraft({
          title: edits.includes("title") ? draft.title : current.title,
          description: edits.includes("description") ? draft.description : current.description,
          socialImage: edits.includes("socialImage") ? draft.socialImage : current.socialImage,
        });
        setConflict(true);
        setNeedsReload(false);
        setMessage("設定已由其他視窗更新。你的編輯仍在表單中，請比對目前生效值再決定是否儲存。");
        return;
      }
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "儲存失敗，編輯已保留。");
      }
      setNeedsReload(true);
      applySettings(await readSettings());
      setMessage("設定已儲存。");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "儲存失敗。";
      setMessage(detail + " 如無法確認最新設定，請重新整理後再儲存。");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return <section id="homepage-social-share" className={`${styles.settings} ${styles.homepageSettings}`} aria-labelledby="homepage-search-share-title">
    <h2 id="homepage-search-share-title">首頁搜尋與分享設定</h2>
    <p>Google 可能自行改寫搜尋結果的標題與摘要。儲存後才會套用至首頁。</p>
    {settings && <div className={styles.homepageSeoFields}>
      {(["title", "description"] as const).map(key => {
        const label = key === "title" ? "Google 搜尋標題" : "Google 搜尋描述";
        const limit = HOMEPAGE_SEO_LIMITS[key];
        const input = {
          id: `homepage-seo-${key}`,
          value: draft[key] ?? "",
          maxLength: limit,
          disabled: busy,
          "aria-describedby": `homepage-seo-count-${key}`,
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            setDraft(current => ({ ...current, [key]: event.target.value })),
        };
        return <div key={key}>
          <label htmlFor={input.id}>{label}（正在編輯）</label>
          {key === "title" ? <input {...input} /> : <textarea rows={3} {...input} />}
          <small id={`homepage-seo-count-${key}`}>{input.value.length} / {limit} 字，留白使用品牌預設</small>
          <button type="button" disabled={busy || !draft[key]} onClick={() => setDraft(current => ({ ...current, [key]: undefined }))}>恢復預設</button>
          <p>目前生效（{saved[key]?.trim() ? "自訂" : "品牌預設"}）：{settings.effective[key]}</p>
          <p>品牌預設：{settings.defaults[key]}</p>
        </div>;
      })}
    </div>}
    <SocialImageField variant="compact" label="首頁分享圖片" help="未設定或圖片失效時，會使用全站預設分享圖片。"
      value={draft.socialImage ?? undefined} assets={settings?.assets ?? []} disabled={busy || !settings}
      onChange={socialImage => setDraft(current => ({ ...current, socialImage }))}
      onBusy={active => { lock.current = active; setBusy(active); }}
      onUploaded={asset => setSettings(current => current && { ...current, assets: [asset, ...current.assets] })} />
    {settings && <p>目前生效（{settings.effective.imageIsCustom ? "自訂" : "品牌預設"}）：<a href={settings.effective.image.url} target="_blank" rel="noreferrer">查看分享圖片</a>
      {settings.effective.imageIsCustom && <> · <a href={settings.defaults.image.url} target="_blank" rel="noreferrer">查看品牌預設分享圖片</a></>}</p>}
    <div className={styles.footer}>
      <button type="button" className={styles.primary} disabled={busy || !settings || !dirty || conflict || needsReload} onClick={() => void save()}>儲存設定</button>
      <button type="button" className={styles.secondary} disabled={busy} onClick={() => void reload()}>重新整理</button>
      {conflict && <button type="button" disabled={busy} onClick={() => { setConflict(false); setMessage("已核對最新設定。請按儲存設定提交你的編輯。"); }}>已核對，保留我的編輯</button>}
      {dirty && <p>尚有未儲存的變更</p>}
      {message && (!dirty || message !== "設定已儲存。") && <p role="status">{message}</p>}
    </div>
  </section>;
}
