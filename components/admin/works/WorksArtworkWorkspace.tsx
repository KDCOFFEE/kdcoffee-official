"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { OwnerReadField, OwnerSectionId, WorksArtworkOwnerProjection } from "@/lib/worksArtworkReadModel";
import styles from "./WorksArtworkWorkspace.module.css";

type Model = WorksArtworkOwnerProjection;
type ProblemStatus = 400 | 401 | 403 | 404 | 500;
export type WorkspaceReadResult = { ok: true; data: Model } | { ok: false; status: ProblemStatus };
const sectionIntro: Record<OwnerSectionId, string> = {
  overview: "先看作品目前的內容與各區狀態，再選擇要了解的區域。",
  pageContent: "閱讀作品目前的文字，並確認每段內容的來源與修改位置。",
  productFacts: "商品資料仍由商品後台管理；各欄會說明目前的顯示位置。",
  purchase: "售價與購買由商品／商務設定管理，這裡只呈現已確認的摘要。",
  media: "依素材角色檢視來源。縮圖不代表公開頁已成功載入或採用該素材。",
  relatedWorks: "依目前的推薦模式與順序呈現，不會在此新增推薦。",
  presentation: "檢視已知的外觀狀態；目前尚未開放在此調整。",
  animation: "檢視已知的進場效果來源；目前尚未開放在此調整。",
  searchAndShare: "確認搜尋與分享內容，以及目前實際採用的來源。",
  systemInfo: "供核對與排查使用，不影響內容完整度。",
};
const categoryLabels: Record<Model["completeness"][number]["category"], string> = {
  productFacts: "商品基本資料", pageContent: "頁面內容", media: "圖片與影片", searchAndShare: "搜尋與分享", purchase: "售價與購買",
};
const completeLabels: Record<Model["completeness"][number]["state"], string> = {
  COMPLETE: "完整", NEEDS_ATTENTION: "需要留意", OPTIONAL: "選填內容", NOT_APPLICABLE: "目前不適用", READ_ONLY_ISSUE: "來源待確認",
};
const impacts: Record<OwnerReadField["impact"][number], string> = {
  ARTWORK_DETAIL: "這件作品的公開頁", WORKS_LIST: "作品列表", PRODUCT_REFERENCES: "其他商品參照",
  COMMERCE: "售價與購買", SEARCH_SHARE: "搜尋與分享", SHARED_SITE: "網站共用內容", SYSTEM_ONLY: "僅系統資訊",
};
const visibilityLabels: Record<OwnerReadField["display"]["visibility"], string> = {
  visible: "依目前內容規則可顯示", empty: "目前沒有可顯示內容", disabled: "已明確停用",
  suppressed: "依目前規則不顯示", unknown: "公開呈現尚待確認",
};
const bindingLabels: Record<OwnerReadField["source"]["binding"], string> = {
  CURRENT_PUBLIC_PARITY_VERIFIED: "已比對既有公開內容規則；此處為唯讀摘要。",
  MODEL_ONLY: "僅確認資料來源，尚未完整驗證公開呈現。",
  FUTURE_CANDIDATE: "尚未套用至公開頁的內容提案。",
  UNAVAILABLE: "來源或公開呈現需要確認。",
};
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string => typeof v === "string" ? v : "";
const field = (model: Model, id: string) => model.fields.find(item => item.id === id);

// Check the transport boundary, never reconstruct fields or their source decisions.
function ownerDto(value: unknown): value is Model {
  if (!record(value) || value.schemaVersion !== 1 || value.capability !== "READ_ONLY" || value.contract !== "DISPLAY_ONLY_NOT_WRITE_PAYLOAD") return false;
  if (!Array.isArray(value.fields) || value.fields.length !== 52 || !Array.isArray(value.sections) || value.sections.length !== 10 ||
      !Array.isArray(value.completeness) || !Array.isArray(value.futureCandidates) || !Array.isArray(value.warnings) ||
      !record(value.publicStates) || !record(value.commerceSummary) || !record(value.relatedWorks) || !record(value.systemInfo)) return false;
  return value.fields.every(f => record(f) && typeof f.id === "string" && typeof f.label === "string" &&
    typeof f.statusLabel === "string" && record(f.source) && typeof f.source.label === "string" &&
    record(f.display) && Array.isArray(f.display.locations) && Array.isArray(f.impact) &&
    record(f.editing) && record(f.editing.destination)) &&
    value.sections.every(s => record(s) && typeof s.id === "string" && Object.hasOwn(sectionIntro, s.id) && typeof s.label === "string" && Array.isArray(s.fieldIds)) &&
    value.completeness.every(c => record(c) && typeof c.category === "string" && Object.hasOwn(categoryLabels, c.category) &&
      typeof c.state === "string" && Object.hasOwn(completeLabels, c.state) && Array.isArray(c.fieldIds)) &&
    ["detailPage", "worksList", "purchase"].every(k => record(value.publicStates) && record(value.publicStates[k]) &&
      ["YES", "NO", "UNKNOWN"].includes(value.publicStates[k].state as string)) &&
    Array.isArray(value.relatedWorks.items) && ["MANUAL", "AUTO_LEGACY", "UNAVAILABLE"].includes(value.relatedWorks.mode as string) &&
    Array.isArray(value.commerceSummary.variantLabels);
}

export async function readOwnerWorkspace(slug: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<WorkspaceReadResult> {
  try {
    const response = await fetcher("/api/admin/works/" + encodeURIComponent(slug) + "/owner-read", {
      method: "GET", cache: "no-store", credentials: "same-origin", redirect: "error", signal,
    });
    if (!response.ok) return { ok: false, status: [400, 401, 403, 404].includes(response.status) ? response.status as ProblemStatus : 500 };
    const body: unknown = await response.json();
    if (!record(body) || body.ok !== true || !ownerDto(body.data) || field(body.data, "system.slug")?.value !== slug) return { ok: false, status: 500 };
    return { ok: true, data: body.data };
  } catch { return { ok: false, status: 500 }; }
}

function Breadcrumb() {
  return <nav className={styles.breadcrumb} aria-label="所在位置"><Link href="/admin">營運中心</Link><span aria-hidden="true">／</span><Link href="/admin/works">作品列表設定</Link><span aria-hidden="true">／</span><span>單件作品</span></nav>;
}

export function WorkspaceProblem({ status, retry }: { status: ProblemStatus; retry?: () => void }) {
  const messages = {
    400: ["作品網址不正確", "請從正確的作品網址重新開啟。"],
    401: ["請先登入後台", "登入後，再重新開啟這件作品。"],
    403: ["沒有此工作區權限", "此作品檢視工作區目前僅供 Owner 使用。"],
    404: ["找不到這件作品", "作品可能已移除，或目前網址不正確。"],
    500: ["暫時無法載入作品", "目前無法安全取得作品內容，請稍後再試。"],
  } as const;
  return <main className={styles.shell}><Breadcrumb /><section className={styles.problem} role="alert">
    <p className={styles.eyebrow}>作品管理 · 唯讀檢視</p><h1>{messages[status][0]}</h1><p>{messages[status][1]}</p>
    <div className={styles.actions}>{status === 401 && <Link href="/admin/login">前往後台登入</Link>}
      {status === 500 && retry && <button type="button" onClick={retry}>重新載入</button>}
      <Link href="/admin">返回營運中心</Link></div>
  </section></main>;
}

export function WorkspaceLoading() {
  return <main className={styles.shell} aria-busy="true"><Breadcrumb /><p role="status">正在載入作品內容…</p>
    <div className={styles.skeletonHeader} aria-hidden="true"><i /><div><i /><i /></div></div>
    <div className={styles.skeletonBody} aria-hidden="true"><i /><div>{[1, 2, 3].map(n => <i key={n} />)}</div></div>
  </main>;
}

// Only local public images are rendered. Remote media references stay as text;
// no probing, metadata request, video autoplay or browser-fallback emulation.
export function localPreview(value: unknown): string | null {
  if (typeof value !== "string" || !/^\/(?:uploads|images)\/[A-Za-z0-9_./-]+\.(?:webp|png|jpe?g|avif|gif)$/i.test(value)) return null;
  return value.split("/").some(p => p === "." || p === "..") ? null : value;
}
function Thumbnail({ path, label, compact = false }: { path: unknown; label: string; compact?: boolean }) {
  const src = localPreview(path);
  return src ? <img className={compact ? styles.thumbnail : styles.preview} src={src} alt={label} width={compact ? 64 : 160} height={compact ? 64 : 120} loading="lazy" referrerPolicy="no-referrer" /> : null;
}

function EditLocation({ item }: { item: OwnerReadField }) {
  const d = item.editing.destination;
  const allowed = item.editing.capability === "EXTERNAL_EDITOR" && d.href === "/admin/products" &&
    ["PRODUCT_ADMIN", "COMMERCE_ADMIN", "MEDIA_ADMIN"].includes(d.kind);
  if (allowed) return <Link className={styles.editLink} href={d.href!}>{d.label}<span aria-hidden="true"> ↗</span></Link>;
  return <span className={styles.muted}>{item.editing.capability === "SYSTEM_ONLY" ? "僅供系統維護" :
    item.editing.capability === "WRITE_NOT_CONNECTED" ? "此處尚未開放編輯" : "目前尚無可用的後台編輯入口"}</span>;
}

function CopyValue({ value }: { value: OwnerReadField["value"] }) {
  if (typeof value === "string") return <p className={styles.copy}>{value}</p>;
  if (typeof value === "number") return <p className={styles.copy}>{value}</p>;
  if (typeof value === "boolean") return <p>{value ? "是" : "否"}</p>;
  if (Array.isArray(value)) return <ul className={styles.valueList}>{value.map((item, i) => <li key={i}><CopyValue value={item} /></li>)}</ul>;
  if (record(value)) return <div className={styles.copy}>{typeof value.title === "string" && <strong>{value.title}</strong>}
    {typeof value.body === "string" && <p>{value.body}</p>}{typeof value.caption === "string" && <p>{value.caption}</p>}</div>;
  return <p className={styles.muted}>尚未設定</p>;
}
function MediaValue({ item }: { item: OwnerReadField }) {
  const layers = item.source.trace?.media;
  const resources: { label: string; url: string }[] = [];
  if (item.id === "media.roasted") {
    // The DTO has already selected primary media; trace layers are provenance only.
    for (const entry of Array.isArray(item.value) ? item.value : []) {
      if (record(entry) && typeof entry.primary === "string" && entry.primary) {
        resources.push({ label: typeof entry.caption === "string" && entry.caption ? entry.caption : "目前素材", url: entry.primary });
      }
    }
  } else if (layers) {
    for (const [label, resource] of [["已設定素材", layers.configured], ["預覽圖片", layers.poster], ["相容素材", layers.fallback]] as const) {
      if (resource) resources.push({ label, url: resource.url });
    }
  } else {
    const value = item.value;
    const items = Array.isArray(value) ? value : record(value) && Array.isArray(value.items) ? value.items : [value];
    for (const entry of items) {
      if (record(entry)) {
        const url = typeof entry.path === "string" ? entry.path : typeof entry.src === "string" ? entry.src : typeof entry.url === "string" ? entry.url : null;
        if (url !== null) resources.push({ label: typeof entry.caption === "string" && entry.caption ? entry.caption : "目前素材", url });
      } else if (typeof entry === "string") resources.push({ label: "目前素材", url: entry });
    }
  }
  return <div className={styles.mediaList}>{resources.length ? resources.map((r, i) => <div key={i} className={styles.mediaItem}>
    <Thumbnail path={r.url} label={item.label + "素材縮圖"} /><div><strong>{r.label}</strong><p className={styles.assetReference}>{r.url}</p></div>
  </div>) : <p className={styles.muted}>{Array.isArray(item.value) && item.hasValue ? "目前清單沒有可顯示的素材" : "尚未設定可顯示素材"}</p>}
    <p className={styles.muted}>僅檢視素材來源，不檢查載入結果。</p></div>;
}

function FieldValue({ item, model }: { item: OwnerReadField; model: Model }) {
  if (item.id.startsWith("public.")) {
    const key = item.id.slice(7) as keyof Model["publicStates"];
    const state = model.publicStates[key].state;
    return <p>{state === "UNKNOWN" ? key === "purchase" ? "購買狀態目前尚無可確認來源" : "目前尚無可確認來源" :
      state === "YES" ? key === "worksList" ? "依目前列表規則會列出" : key === "purchase" ? "已確認可購買" : "已確認可開啟" :
        key === "worksList" ? "依目前列表規則不會列出" : key === "purchase" ? "已確認目前不可購買" : "已確認目前不可開啟"}</p>;
  }
  if (item.id === "purchase.summary") {
    const c = model.commerceSummary;
    return <div className={styles.copy}><p>{c.priceText === null ? "目前尚未接入正式售價摘要" : c.priceText === "" ? "售價摘要已留白" : c.priceText}</p>
      <p>{({ unknown: "供應狀態來源待確認", available: "目前可供應", sold_out: "目前售完（不代表內容不完整）", unavailable: "目前不供應" })[c.availability]}</p>
      {c.variantLabels.length > 0 && <ul>{c.variantLabels.map((label, i) => <li key={i}>{label}</li>)}</ul>}
      {c.availableChoiceCount !== null && <p>可購買規格數：{c.availableChoiceCount}</p>}</div>;
  }
  if (item.state === "invalid") return <p>來源需要確認，暫不顯示這項內容。</p>;
  if (item.state === "explicit-blank") return <p>已明確留白</p>;
  if (item.state === "disabled") return <p>已明確停用</p>;
  if (item.state === "suppressed") return <p>依目前規則不顯示</p>;
  if (item.id === "presentation.status" && item.value === "EXISTING_SITE_BEHAVIOR") return <p>目前沿用既有網站外觀，此處尚未開放調整。</p>;
  if (item.id === "animation.status" && item.value === "ABSENT") return <p>目前沒有獨立進場效果設定</p>;
  if (item.id === "animation.status" && item.value === "SOURCE_EXISTS_RENDERING_UNVERIFIED") return <p>已有進場效果來源，公開呈現仍待確認</p>;
  if (item.id === "media.roasted" && Array.isArray(item.value) && item.value.length === 0) {
    const configuration = item.source.trace?.configurationState;
    if (configuration === "GALLERY_CONFIGURED_EMPTY") return <p>已明確設定為空清單</p>;
    if (configuration === "GALLERY_FILTERED_EMPTY") return <p className={styles.muted}>目前清單沒有可顯示的素材</p>;
  }
  if (!item.hasValue) return <p className={styles.muted}>尚未設定</p>;
  if (Array.isArray(item.value) && item.value.length === 0 && item.state === "explicit") return <p>已明確設定為空清單</p>;
  if (item.section === "media" || item.id === "identity.thumbnail" || item.id === "search.image") return <MediaValue item={item} />;
  return <CopyValue value={item.value} />;
}

export function WorkspaceField({ item, model }: { item: OwnerReadField; model: Model }) {
  const trace = item.source.trace;
  return <article className={styles.fieldCard} data-owner-field={item.id}>
    <header className={styles.fieldHead}><h3>{item.label}</h3><span className={styles.state}>{item.statusLabel}</span></header>
    <span className={styles.microLabel}>目前內容</span><FieldValue item={item} model={model} />
    {item.warning && <p className={styles.warning} role="note">{item.warning.label}</p>}
    <div className={styles.sourceLine}><span>資料來源</span><strong>{item.source.label}</strong></div>
    <p className={styles.location}>顯示位置：{item.display.locations.join("、") || "目前沒有已確認的公開顯示位置"}</p>
    <details className={styles.details}><summary>來源與影響說明</summary>
      <dl><dt>目前顯示狀態</dt><dd>{visibilityLabels[item.display.visibility]}</dd>
        <dt>公開呈現確認</dt><dd>{bindingLabels[item.source.binding]}</dd>
        <dt>影響範圍</dt><dd>{item.impact.map(v => impacts[v]).join("、") || "目前沒有已確認的公開影響"}</dd>
        <dt>來源使用方式</dt><dd>{trace?.isInherited ? "使用繼承內容" : trace?.isFallback ? "主要來源未採用，目前使用相容來源。" : trace?.isLegacy ? "使用既有相容內容" : "依目前來源資料呈現"}</dd>
      </dl>
      {trace && <details className={styles.technical}><summary>系統判讀資訊</summary><dl>
        <dt>來源識別</dt><dd><code>{item.source.key}</code></dd><dt>規則識別</dt><dd><code>{trace.ruleId}</code></dd>
        <dt>相容來源層數</dt><dd>{trace.fallbackDepth}</dd></dl></details>}
    </details>
    {item.source.binding === "MODEL_ONLY" && <p className={styles.bindingNote}>{bindingLabels.MODEL_ONLY}</p>}
    {item.source.binding === "FUTURE_CANDIDATE" && <p className={styles.bindingNote}>{bindingLabels.FUTURE_CANDIDATE}</p>}
    <footer className={styles.editLocation}><span>目前修改方式</span><EditLocation item={item} /></footer>
  </article>;
}

export function Completeness({ model }: { model: Model }) {
  return <section className={styles.completeness} aria-labelledby="completeness-title"><h3 id="completeness-title">各區內容狀態</h3>
    <p className={styles.muted}>依各區需要的內容分別檢視；選填、停用項目與系統識別不以百分比計分。</p>
    <div className={styles.categoryGrid}>{model.completeness.map(c => <article key={c.category}>
      <span>{categoryLabels[c.category]}</span><strong>{completeLabels[c.state]}</strong>
      {c.required > 0 && <small>必要內容 {c.completed} / {c.required}</small>}
      {c.state === "OPTIONAL" && <small>選填內容不降低必要內容完整度</small>}
      {c.state === "NOT_APPLICABLE" && <small>目前不需要填寫</small>}
      {c.state === "READ_ONLY_ISSUE" && <small>等待正式資料來源確認</small>}
      {c.state === "NEEDS_ATTENTION" && <ul>{c.fieldIds.map(id => <li key={id}>{field(model, id)?.label || "有內容需要確認"}</li>)}</ul>}
    </article>)}</div></section>;
}

function Related({ model }: { model: Model }) {
  const r = model.relatedWorks;
  return <section className={styles.relatedSummary}><h3>目前推薦方式</h3>
    <p>{r.mode === "MANUAL" ? "手動指定" : r.mode === "AUTO_LEGACY" ? "自動相容推薦" : "推薦來源需要確認"}</p>
    {r.mode === "MANUAL" && r.configuredCount === 0 ? <p>目前明確設定為不顯示相關作品</p> :
      r.items.length ? <ol>{r.items.map((item, i) => <li key={i}>{item.name === null ? "作品名稱尚待確認" : item.name}</li>)}</ol> :
        <p>{r.mode === "MANUAL" ? "指定的作品目前沒有可顯示項目，請確認來源。" : "目前沒有可顯示的推薦作品。"}</p>}
  </section>;
}

export function WorkspaceSection({ model, section }: { model: Model; section: OwnerSectionId }) {
  const config = model.sections.find(s => s.id === section);
  if (!config) return null;
  const items = config.fieldIds.map(id => field(model, id)).filter((f): f is OwnerReadField => f !== undefined);
  const future = items.filter(f => f.completenessRole === "EXCLUDED" && f.editing.capability === "WRITE_NOT_CONNECTED");
  const current = items.filter(f => !future.includes(f));
  const cards = <div className={styles.cards}>{current.map(item => <WorkspaceField key={item.id} item={item} model={model} />)}</div>;
  return <>
    {section === "overview" && <Completeness model={model} />}
    {section === "relatedWorks" && <Related model={model} />}
    {section === "systemInfo" ? <details className={styles.systemInfo}><summary>展開系統資訊</summary>
      <p className={styles.muted}>本頁只讀取既有資料，不會建立內容版本或寫入憑證。</p>{cards}
      <dl><dt>讀取契約</dt><dd><code>{model.contract}</code></dd><dt>命名空間</dt><dd><code>{model.systemInfo.namespace}</code></dd>
        <dt>作品內容版本</dt><dd>{model.systemInfo.worksRevision === null ? "尚未建立" : model.systemInfo.worksRevision}</dd></dl></details> : cards}
    {future.length > 0 && <details className={styles.future}><summary>後續可擴充項目 · {future.length} 項</summary>
      <p className={styles.muted}>已保留內容模型，目前尚未開放編輯，也不代表已在公開頁呈現。</p>
      <div className={styles.cards}>{future.map(item => <WorkspaceField key={item.id} item={item} model={model} />)}</div></details>}
    {model.futureCandidates.some(f => f.section === section) && <details className={styles.future}><summary>尚未套用的內容提案</summary>
      {model.futureCandidates.filter(f => f.section === section).map(item => <WorkspaceField key={item.id} item={item} model={model} />)}</details>}
  </>;
}

export function OwnerWorkspaceView({ model, slug }: { model: Model; slug: string }) {
  const [selected, setSelected] = useState<OwnerSectionId>("overview");
  const [navOpen, setNavOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusAfterSelection = useRef(false);
  useEffect(() => { if (focusAfterSelection.current) { heading.current?.focus(); focusAfterSelection.current = false; } }, [selected, navOpen]);
  const name = text(field(model, "identity.name")?.value);
  const english = text(field(model, "identity.nameEn")?.value);
  const artist = text(field(model, "identity.artist")?.value);
  const tag = text(field(model, "identity.tag")?.value);
  const thumbnail = field(model, "identity.thumbnail")?.value;
  const section = model.sections.find(s => s.id === selected)!;
  return <main className={styles.shell}><Breadcrumb />
    <header className={styles.context}><div className={styles.identity}>
      <div className={styles.identityImage}>{record(thumbnail) && localPreview(thumbnail.path) ? <Thumbnail path={thumbnail.path} label={name + "作品縮圖"} compact /> : <span aria-hidden="true">作</span>}</div>
      <div className={styles.identityCopy}><p className={styles.eyebrow}>作品管理</p><h1>{name}</h1>
        {english && <p className={styles.english}>{english}</p>}<p className={styles.artist}>{artist}{artist && tag ? " · " : ""}{tag}</p>
        <small className={styles.slug}>/works/{slug}</small></div></div>
      <div className={styles.contextActions}><span className={styles.readOnly}>目前為唯讀檢視</span>
        <a className={styles.publicLink} href={"/works/" + encodeURIComponent(slug)} target="_blank" rel="noopener noreferrer">查看公開頁 <span aria-hidden="true">↗</span><span className={styles.srOnly}>（另開分頁）</span></a></div>
    </header>
    <div className={styles.workspace}>
      <aside className={styles.rail}><button type="button" className={styles.navToggle} aria-expanded={navOpen} aria-controls="artwork-section-nav" onClick={() => setNavOpen(!navOpen)}>
        <span>目前區域：{section.label}</span><span aria-hidden="true">{navOpen ? "－" : "＋"}</span></button>
        <nav id="artwork-section-nav" className={styles.sectionNav} data-open={navOpen} aria-label="作品內容區域">
          <p className={styles.navCaption}>作品內容</p>{model.sections.map((s, i) => <button type="button" key={s.id}
            data-section-nav={s.id} className={s.id === "systemInfo" ? styles.systemNav : undefined} aria-current={s.id === selected ? "location" : undefined}
            onClick={() => { focusAfterSelection.current = true; setSelected(s.id); setNavOpen(false); }}>
            <span className={styles.navNumber} aria-hidden="true">{String(i + 1).padStart(2, "0")}</span><span>{s.label}</span>
            {s.id === selected && <span className={styles.srOnly}>目前區域</span>}</button>)}
        </nav>
      </aside>
      <section className={styles.content} aria-labelledby="artwork-section-title"><header className={styles.sectionHeader}>
        <p className={styles.eyebrow}>唯讀內容檢視</p><h2 id="artwork-section-title" tabIndex={-1} ref={heading}>{section.label}</h2><p>{sectionIntro[selected]}</p>
      </header><WorkspaceSection key={selected} model={model} section={selected} /></section>
    </div>
  </main>;
}

export default function WorksArtworkWorkspace({ slug }: { slug: string }) {
  const [state, setState] = useState<{ slug: string; result: WorkspaceReadResult | null }>({ slug, result: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ slug, result: null });
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    void readOwnerWorkspace(slug, controller.signal).then(result => { if (active) setState({ slug, result }); }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [slug, attempt]);
  const result = state.slug === slug ? state.result : null;
  if (!result) return <WorkspaceLoading />;
  if (!result.ok) return <WorkspaceProblem status={result.status} retry={() => setAttempt(n => n + 1)} />;
  return <OwnerWorkspaceView key={slug} model={result.data} slug={slug} />;
}
