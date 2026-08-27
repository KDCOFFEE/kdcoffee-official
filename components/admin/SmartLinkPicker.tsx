"use client";

import { createContext, useContext, useId, useMemo, useState, type ReactNode } from "react";
import { buildCmsDestinationRegistry, inferCmsLink, resolveCmsLink, type CmsLinkProduct, type CmsLinkType, type CmsLinkValue, type PublishedCmsPage, type StructuredCmsLink } from "@/lib/cmsLinks";

type EditingContextValue = { activeId: string | null; setActiveId: (id: string | null) => void; pages: PublishedCmsPage[] };
const SmartLinkEditingContext = createContext<EditingContextValue | null>(null);

export function SmartLinkEditingProvider({ children, pages = [] }: { children: ReactNode; pages?: PublishedCmsPage[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  return <SmartLinkEditingContext.Provider value={{ activeId, setActiveId, pages }}>{children}</SmartLinkEditingContext.Provider>;
}

const choices: Array<{ type: CmsLinkType; icon: string; label: string; description: string }> = [
  { type: "product", icon: "☕", label: "咖啡作品", description: "選擇全部咖啡或指定作品" },
  { type: "internal", icon: "⌂", label: "網站頁面", description: "前往首頁、會員、購物車等" },
  { type: "section", icon: "●", label: "首頁區塊", description: "前往首頁指定內容" },
  { type: "page", icon: "◇", label: "活動／專題頁面", description: "中秋、春節、新品活動" },
  { type: "external", icon: "◎", label: "外部網站", description: "前往其他網站" },
  { type: "telephone", icon: "☎", label: "電話", description: "讓客人直接撥打電話" },
  { type: "email", icon: "✉", label: "電子郵件", description: "開啟電子郵件聯絡" },
  { type: "line", icon: "◉", label: "LINE／客服", description: "前往安全的客服網址" },
  { type: "custom", icon: "⚙", label: "進階自訂", description: "特殊網址或位置" },
  { type: "none", icon: "—", label: "不設定連結", description: "按鈕不前往其他頁面" },
];

const choice = (type: CmsLinkType) => choices.find((item) => item.type === type) || choices[5];
const initialCategory = (value: CmsLinkValue, input: { products: CmsLinkProduct[]; pages: PublishedCmsPage[] }) => {
  const inferred = inferCmsLink(value, input);
  return inferred.type === "internal" && inferred.target === "works" ? "product" : inferred.type;
};
const initialDraftFor = (type: CmsLinkType, registry: ReturnType<typeof buildCmsDestinationRegistry>): StructuredCmsLink => {
  if (type === "none") return { type: "none" };
  if (["external", "telephone", "email", "line", "custom"].includes(type)) return { type, url: "" };
  return { type, target: registry.find((entry) => entry.category === type)?.id || "" };
};

export default function SmartLinkPicker({ editorId, label, buttonText, value, onChange, products, pages }: { editorId?: string; label: string; buttonText?: string; value: CmsLinkValue; onChange: (value: StructuredCmsLink) => void; products: CmsLinkProduct[]; pages?: PublishedCmsPage[] }) {
  const generatedId = useId().replaceAll(":", "");
  const id = editorId || `smart-link-${generatedId}`;
  const editing = useContext(SmartLinkEditingContext);
  const effectivePages = useMemo(() => pages ?? editing?.pages ?? [], [pages, editing?.pages]);
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = editing ? editing.activeId === id : localExpanded;
  const setExpanded = (next: boolean) => editing ? editing.setActiveId(next ? id : null) : setLocalExpanded(next);
  const input = useMemo(() => ({ products, pages: effectivePages }), [products, effectivePages]);
  const registry = useMemo(() => buildCmsDestinationRegistry(input), [input]);
  const savedResolution = resolveCmsLink(value, input);
  const savedLink = inferCmsLink(value, input);
  const savedCategory = initialCategory(value, input);
  const [step, setStep] = useState<"type" | "destination">("type");
  const [category, setCategory] = useState<CmsLinkType>(savedCategory);
  const [draft, setDraft] = useState<StructuredCmsLink>(savedLink);
  const [search, setSearch] = useState("");
  const draftResolution = resolveCmsLink(draft, input);
  const displayChoice = savedResolution.href === "/works" ? choice("product") : choice(savedCategory);
  const controlId = `${id}-editor`;
  const broken = !savedResolution.valid;

  const open = () => {
    setStep("type"); setCategory(savedCategory); setDraft(savedLink); setSearch(""); setExpanded(true);
  };
  const cancel = () => { setDraft(savedLink); setExpanded(false); };
  const chooseCategory = (type: CmsLinkType) => {
    setCategory(type);
    setDraft(type === "product" ? { type: "internal", target: "works" } : initialDraftFor(type, registry));
    setStep("destination");
  };
  const confirm = () => { if (draftResolution.valid) { onChange(draft); setExpanded(false); } };
  const summaryName = broken ? "原設定目的地已不存在" : savedResolution.href === "/works" ? "全部咖啡作品" : savedResolution.label;

  const destinations = registry.filter((entry) => entry.category === category);
  const productsForChoice = registry.filter((entry) => entry.category === "product" && (!search.trim() || entry.searchText.includes(search.trim().toLocaleLowerCase("zh-TW"))));
  const savedMissing = Boolean(draft.target && !registry.some((entry) => entry.category === draft.type && entry.id === draft.target));

  return <section className={`smart-link-control${expanded ? " is-expanded" : ""}${broken ? " has-warning" : ""}`} aria-labelledby={`${id}-title`}>
    <div className="smart-link-summary-card">
      <strong id={`${id}-title`}>{label}「{buttonText?.trim() || "尚未設定按鈕文字"}」</strong>
      <span>目前連結</span>
      <div className="smart-link-summary-destination"><i aria-hidden="true">{broken ? "!" : displayChoice.icon}</i><b>{summaryName}</b></div>
      {broken ? <small>原設定資料仍已保留。</small> : null}
      <button type="button" aria-expanded={expanded} aria-controls={controlId} onClick={open}>{broken ? "重新選擇" : "修改連結"}</button>
    </div>

    {broken ? <details className="smart-link-diagnostic"><summary>查看原設定</summary><code>{savedLink.target || (typeof value === "string" ? value : "無法辨識")}</code></details> : null}

    {expanded ? <div className="smart-link-flow" id={controlId}>
      {step === "type" ? <>
        <header><small>選擇連結類型</small><h4>這個按鈕要帶客人去哪裡？</h4></header>
        <div className="smart-link-category-grid">
          {choices.map((item) => <button type="button" key={item.type} onClick={() => chooseCategory(item.type)}><i aria-hidden="true">{item.icon}</i><span><strong>{item.label}</strong><small>{item.description}</small></span><b aria-hidden="true">›</b></button>)}
        </div>
        <footer><button type="button" className="smart-link-cancel" onClick={cancel}>取消</button></footer>
      </> : <DestinationStep id={id} category={category} draft={draft} setDraft={setDraft} search={search} setSearch={setSearch} destinations={destinations} products={productsForChoice} savedMissing={savedMissing} valid={draftResolution.valid} onBack={() => setStep("type")} onCancel={cancel} onConfirm={confirm} />}
    </div> : null}
  </section>;
}

function DestinationStep({ id, category, draft, setDraft, search, setSearch, destinations, products, savedMissing, valid, onBack, onCancel, onConfirm }: { id: string; category: CmsLinkType; draft: StructuredCmsLink; setDraft: (value: StructuredCmsLink) => void; search: string; setSearch: (value: string) => void; destinations: ReturnType<typeof buildCmsDestinationRegistry>; products: ReturnType<typeof buildCmsDestinationRegistry>; savedMissing: boolean; valid: boolean; onBack: () => void; onCancel: () => void; onConfirm: () => void }) {
  const title = category === "product" ? "要前往哪個咖啡作品？" : category === "internal" ? "要前往哪個網站頁面？" : category === "section" ? "要前往首頁哪個內容？" : category === "page" ? "選擇活動／專題頁面" : category === "external" ? "要前往哪個外部網站？" : category === "telephone" ? "要撥打哪個電話？" : category === "email" ? "要寄信到哪個電子郵件？" : category === "line" ? "要前往哪個 LINE／客服？" : category === "custom" ? "進階自訂連結" : "不設定連結";
  const rows = category === "product" ? products : destinations;
  return <>
    <button type="button" className="smart-link-back" onClick={onBack}>← 返回選擇連結類型</button>
    <header><small>{choice(category).label}</small><h4>{title}</h4></header>
    <div className="smart-link-step-content">
      {category === "product" ? <label className="smart-link-search" htmlFor={`${id}-search`}>搜尋作品名稱<input id={`${id}-search`} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋作品名稱" /></label> : null}
      {category === "product" ? <div className="smart-link-result-list"><ChoiceRow checked={draft.type === "internal" && draft.target === "works"} label="全部咖啡作品" onClick={() => setDraft({ type: "internal", target: "works" })} />{rows.map((entry) => <ChoiceRow key={entry.id} checked={draft.type === "product" && draft.target === entry.id} label={entry.label} onClick={() => setDraft({ type: "product", target: entry.id })} />)}</div> : null}
      {(category === "internal" || category === "section") ? <div className="smart-link-result-list">{savedMissing ? <ChoiceRow checked label="原設定目的地已不存在" onClick={() => undefined} /> : null}{rows.map((entry) => <ChoiceRow key={entry.id} checked={draft.target === entry.id} label={entry.label} onClick={() => setDraft({ type: category, target: entry.id })} />)}</div> : null}
      {category === "page" ? rows.length === 0 ? <div className="smart-link-page-empty"><i aria-hidden="true">◇</i><strong>目前還沒有活動／專題頁面</strong><span>完成「頁面管理」後，已發布的頁面會自動出現在這裡。</span></div> : <div className="smart-link-result-list">{rows.map((entry) => <ChoiceRow key={entry.id} checked={draft.target === entry.id} label={entry.label} onClick={() => setDraft({ type: "page", target: entry.id })} />)}</div> : null}
      {category === "external" ? <label htmlFor={`${id}-external`}>外部網站網址<input id={`${id}-external`} type="url" inputMode="url" placeholder="https://" value={draft.url || ""} onChange={(event) => setDraft({ type: "external", url: event.target.value })} /><small>請輸入完整的 https:// 網址</small></label> : null}
      {category === "telephone" ? <label htmlFor={`${id}-telephone`}>電話號碼<input id={`${id}-telephone`} type="tel" inputMode="tel" placeholder="08-777-6335" value={draft.url || ""} onChange={(event) => setDraft({ type: "telephone", url: event.target.value })} /><small>顯示格式會保留，撥號時會安全正規化。</small></label> : null}
      {category === "email" ? <label htmlFor={`${id}-email`}>電子郵件<input id={`${id}-email`} type="email" inputMode="email" placeholder="service@example.com" value={draft.url || ""} onChange={(event) => setDraft({ type: "email", url: event.target.value })} /></label> : null}
      {category === "line" ? <label htmlFor={`${id}-line`}>LINE／客服網址<input id={`${id}-line`} type="url" inputMode="url" placeholder="https://" value={draft.url || ""} onChange={(event) => setDraft({ type: "line", url: event.target.value })} /><small>請使用企業既有的完整 https:// 客服網址。</small></label> : null}
      {category === "custom" ? <label htmlFor={`${id}-custom`}>自訂路徑<input id={`${id}-custom`} value={draft.url || ""} onChange={(event) => setDraft({ type: "custom", url: event.target.value })} /><small>只有特殊情況才需要使用。一般連結請使用其他選項。</small></label> : null}
      {category === "none" ? <p className="smart-link-none-note">這個按鈕將不會前往其他頁面。</p> : null}
    </div>
    <footer><button type="button" className="smart-link-cancel" onClick={onCancel}>取消</button>{!(category === "page" && rows.length === 0) ? <button type="button" className="smart-link-confirm" disabled={!valid} onClick={onConfirm}>{category === "none" ? "確認不設定連結" : "確認目的地"}</button> : null}</footer>
  </>;
}

function ChoiceRow({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
  return <button type="button" role="radio" aria-checked={checked} className={checked ? "is-selected" : ""} onClick={onClick}><i aria-hidden="true">{checked ? "●" : "○"}</i><span>{label}</span></button>;
}
