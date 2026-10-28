"use client";

import { cloneElement, useId, useRef, useState, type ReactElement, type KeyboardEvent } from "react";
import { SERVICE_CATEGORIES, SERVICE_SOURCES, validateServiceDocument, type ServiceCard, type ServiceCategory, type ServiceConfig, type ServiceDocument, type ServiceFaq, type ServiceSource, type ServiceState } from "@/lib/customerServiceContent";
import ServiceIcon from "@/components/customer-service/ServiceIcon";
import CustomerServiceHeroEditor from "./CustomerServiceHeroEditor";
import styles from "./CustomerServiceManager.module.css";

type TextConfig = Exclude<keyof ServiceConfig, "hero">;
const configFields: Array<[TextConfig, string, number]> = [["title", "頁面標題", 100], ["subtitle", "英文小標", 100], ["intro", "簡介", 1200], ["announcement", "公告", 1200], ["serviceHours", "客服時間", 300], ["line", "LINE 網址", 600], ["facebook", "Facebook 網址", 600], ["email", "客服 Email", 160], ["phone", "客服電話", 40]];
const sections = [["page", "頁面 / Hero"], ["cards", "快速服務"], ["faqs", "FAQ"], ["contact", "聯絡方式"], ["status", "預覽 / 狀態"]] as const;
type Section = typeof sections[number][0];
const defaultSources: Partial<Record<ServiceCategory, ServiceSource>> = { orders: "orders", delivery: "delivery", cancellation: "cancellation", kd: "kd", subscription: "subscription", coffee: "coffee" };
const sourceCategory: Partial<Record<ServiceSource, ServiceCategory>> = { orders: "orders", delivery: "delivery", cancellation: "cancellation", returns: "cancellation", kd: "kd", credit: "kd", subscription: "subscription", coffee: "coffee" };
function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return <div className={styles.field}><label htmlFor={id}>{label}</label>{cloneElement(children, { id })}</div>;
}
function RowActions({ label, open, controls, index, length, edit, move }: { label: string; open: boolean; controls: string; index: number; length: number; edit: () => void; move: (direction: number) => void }) {
  return <div className={styles.rowActions}><button type="button" aria-expanded={open} aria-controls={open ? controls : undefined} aria-label={(open ? "收合" : "編輯") + label} onClick={edit}>{open ? "收合" : "編輯"}</button><button type="button" disabled={index === 0} onClick={() => move(-1)} aria-label={"上移" + label}>↑</button><button type="button" disabled={index === length - 1} onClick={() => move(1)} aria-label={"下移" + label}>↓</button></div>;
}
export default function CustomerServiceManager({ initial }: { initial: ServiceState }) {
  const [state, setState] = useState(initial), [document, setDocument] = useState<ServiceDocument>(() => structuredClone(initial.document));
  const [section, setSection] = useState<Section>("page"), [openFaq, setOpenFaq] = useState<string | null>(null), [openCard, setOpenCard] = useState<string | null>(null);
  const [faqQuery, setFaqQuery] = useState(""), [faqCategory, setFaqCategory] = useState("all"), [faqPage, setFaqPage] = useState(0);
  const [saving, setSaving] = useState(false), [uploading, setUploading] = useState(false), [message, setMessage] = useState(""), [failed, setFailed] = useState(false);
  const uploadLock = useRef(false), saveLock = useRef(false);
  const dirty = JSON.stringify(document) !== JSON.stringify(state.document), busy = saving || uploading;
  const config = (key: TextConfig, value: string) => setDocument(current => ({ ...current, config: { ...current.config, [key]: value } }));
  const card = (id: string, patch: Partial<ServiceCard>) => setDocument(current => ({ ...current, cards: current.cards.map(item => item.id === id ? { ...item, ...patch } : item) }));
  const faq = (id: string, patch: Partial<ServiceFaq>) => setDocument(current => ({ ...current, faqs: current.faqs.map(item => item.id === id ? { ...item, ...patch } : item) }));
  const reorder = (key: "cards" | "faqs", id: string, direction: number) => setDocument(current => {
    const items = [...current[key]].sort((a, b) => a.sortOrder - b.sortOrder), index = items.findIndex(item => item.id === id), next = index + direction;
    if (index < 0 || next < 0 || next >= items.length) return current;
    [items[index], items[next]] = [items[next], items[index]];
    return { ...current, [key]: items.map((item, i) => ({ ...item, sortOrder: i * 10 })) };
  });
  const remove = (key: "cards" | "faqs", id: string) => { setDocument(current => ({ ...current, [key]: current[key].filter(item => item.id !== id) })); if (key === "faqs") setOpenFaq(null); else setOpenCard(null); };
  const chooseSection = (next: Section) => { setSection(next); setOpenFaq(null); setOpenCard(null); };
  const tabKeys = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = sections.findIndex(item => item[0] === section), next = event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : (index + (["ArrowDown", "ArrowRight"].includes(event.key) ? 1 : -1) + sections.length) % sections.length;
    chooseSection(sections[next][0]); event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
  };
  async function save() {
    if (saveLock.current || uploadLock.current) return;
    setFailed(false); setMessage("");
    const normalized = { ...document, faqs: document.faqs.map(item => ({ ...item, keywords: item.keywords.map(word => word.trim()).filter(Boolean) })) };
    try { validateServiceDocument(normalized); } catch (error) { setFailed(true); setMessage((error as Error).message); return; }
    saveLock.current = true; setSaving(true);
    try {
      const response = await fetch("/api/admin/customer-service", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: state.revision, document: normalized }) });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || "儲存失敗，草稿已保留。");
      setState(next); setDocument(structuredClone(next.document)); setMessage("客服內容已儲存。");
    } catch (error) { setFailed(true); setMessage((error as Error).message); }
    finally { saveLock.current = false; setSaving(false); }
  }
  const sortedCards = [...document.cards].sort((a, b) => a.sortOrder - b.sortOrder);
  const sortedFaqs = [...document.faqs].sort((a, b) => a.sortOrder - b.sortOrder);
  const query = faqQuery.normalize("NFKC").trim().toLocaleLowerCase("zh-TW");
  const filteredFaqs = sortedFaqs.filter(item => (faqCategory === "all" || item.category === faqCategory) && (!query || (item.question + " " + item.keywords.join(" ")).normalize("NFKC").toLocaleLowerCase("zh-TW").includes(query)));
  const pages = Math.max(1, Math.ceil(filteredFaqs.length / 20)), currentPage = Math.min(faqPage, pages - 1), visibleFaqs = filteredFaqs.slice(currentPage * 20, (currentPage + 1) * 20);
  const configEditor = (contact: boolean) => <div className={styles.fields}>{configFields.filter((_, index) => contact ? index >= 4 : index < 4).map(([key, label, maxLength]) => <Field label={label} key={key}>{["intro", "announcement", "serviceHours"].includes(key) ? <textarea rows={3} value={document.config[key]} maxLength={maxLength} onChange={event => config(key, event.target.value)} /> : <input value={document.config[key]} maxLength={maxLength} onChange={event => config(key, event.target.value)} />}</Field>)}</div>;
  const addFaq = () => {
    const item: ServiceFaq = { id: "faq-" + crypto.randomUUID(), category: "other", question: "新問題", answer: "請填寫一般服務說明", keywords: [], source: "editorial", ctaLabel: "", ctaHref: "", enabled: false, sortOrder: Math.min(10000, Math.max(0, ...document.faqs.map(entry => entry.sortOrder)) + 10) };
    setDocument(current => ({ ...current, faqs: [...current.faqs, item] })); setFaqQuery(""); setFaqCategory("all"); setFaqPage(Math.floor(document.faqs.length / 20)); setOpenFaq(item.id);
  };
  return <div className={styles.manager}>
    <header className={styles.header}><div><p className={styles.eyebrow}>CUSTOMER SERVICE CONTENT</p><h1>客服中心內容</h1><p>編輯客服頁面、服務說明與聯絡管道。</p></div><a href="/customer-service" target="_blank" rel="noreferrer">查看公開頁面 ↗</a></header>
    <div className={styles.workspace}>
      <nav className={styles.navigation} role="tablist" aria-label="客服管理區域">{sections.map(([id, label]) => <button type="button" role="tab" id={"service-tab-" + id} key={id} aria-selected={section === id} aria-controls={"service-panel-" + id} tabIndex={section === id ? 0 : -1} disabled={busy} onClick={() => chooseSection(id)} onKeyDown={tabKeys}>{label}{id === "faqs" && <span>{document.faqs.length}</span>}{id === "cards" && <span>{document.cards.length}</span>}</button>)}</nav>
      <div className={styles.content}>
        {message && <p className={failed ? styles.error : styles.success} role={failed ? "alert" : "status"}>{message}</p>}
        <fieldset className={styles.editor} disabled={busy}>
          {sections.filter(([id]) => id !== section).map(([id]) => <section hidden key={id} role="tabpanel" id={"service-panel-" + id} aria-labelledby={"service-tab-" + id}/>)}
          <section className={styles.section} role="tabpanel" id={"service-panel-" + section} aria-labelledby={"service-tab-" + section}>
            {section === "page" && <><h2>頁面與 Hero</h2>{configEditor(false)}<CustomerServiceHeroEditor value={document.config.hero} saved={state.document.config.hero} disabled={busy} onChange={hero => setDocument(current => ({ ...current, config: { ...current.config, hero } }))} onUploadingChange={active => { uploadLock.current = active; setUploading(active); }}/></>}
            {section === "contact" && <><h2>聯絡方式</h2><p>留空的管道不會顯示；客服時間未設定時沿用留言提示。</p>{configEditor(true)}</>}
            {section === "cards" && <><div className={styles.sectionHeader}><div><h2>快速服務卡</h2><p>選擇一張服務卡編輯，上下移動調整順序。</p></div><button type="button" disabled={document.cards.length >= 30} onClick={() => { const item: ServiceCard = { id: "service-" + crypto.randomUUID(), title: "新服務卡", description: "請填寫服務說明", link: "#contact", enabled: false, sortOrder: Math.min(10000, Math.max(0, ...document.cards.map(entry => entry.sortOrder)) + 10) }; setDocument(current => ({ ...current, cards: [...current.cards, item] })); setOpenCard(item.id); }}>新增服務卡</button></div>
              <div className={styles.list}>{sortedCards.map((item, index) => <article className={styles.listItem} key={item.id}>
                <div className={styles.compactRow}><span className={styles.icon}><ServiceIcon name={item.id}/></span><div className={styles.rowSummary}><strong>{item.title || "新服務卡"}</strong><small>排序 {item.sortOrder} · {item.enabled ? "啟用中" : "未啟用"}</small></div><RowActions label={item.title || "新服務卡"} open={openCard === item.id} controls={"card-editor-" + item.id} index={index} length={sortedCards.length} edit={() => setOpenCard(openCard === item.id ? null : item.id)} move={direction => reorder("cards", item.id, direction)}/></div>
                {openCard === item.id && <fieldset id={"card-editor-" + item.id} className={styles.item} data-service-editor="card"><legend>編輯服務卡</legend><div className={styles.fields}><Field label="服務標題"><input value={item.title} maxLength={100} onChange={event => card(item.id, { title: event.target.value })}/></Field><Field label="服務說明"><textarea value={item.description} maxLength={300} onChange={event => card(item.id, { description: event.target.value })}/></Field><Field label="服務連結"><input value={item.link} maxLength={600} onChange={event => card(item.id, { link: event.target.value })}/></Field><Field label="服務排序"><input type="number" min={0} max={10000} value={item.sortOrder} onChange={event => card(item.id, { sortOrder: Number(event.target.value) })}/></Field></div><label className={styles.check}><input type="checkbox" checked={item.enabled} onChange={event => card(item.id, { enabled: event.target.checked })}/>啟用服務卡</label><button type="button" className={styles.danger} aria-label={"刪除" + (item.title || "新服務卡")} onClick={() => remove("cards", item.id)}>刪除此服務卡</button></fieldset>}
              </article>)}</div></>}
            {section === "faqs" && <><div className={styles.sectionHeader}><div><h2>常見問題</h2><p>每次編輯一題；正式來源的回答仍由系統提供。</p></div><button type="button" disabled={document.faqs.length >= 150} onClick={addFaq}>新增問題</button></div>
              <div className={styles.filters}><label className={styles.field}>搜尋問題、關鍵字<input type="search" value={faqQuery} onChange={event => { setFaqQuery(event.target.value); setFaqPage(0); }}/></label><label className={styles.field}>篩選 FAQ 分類<select aria-label="篩選 FAQ 分類" value={faqCategory} onChange={event => { setFaqCategory(event.target.value); setFaqPage(0); }}><option value="all">全部分類</option>{SERVICE_CATEGORIES.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label></div>
              <p className={styles.hint} role="status">{filteredFaqs.length} 題 · 第 {currentPage + 1} / {pages} 頁</p>
              <div className={styles.list}>{visibleFaqs.map(item => { const index = sortedFaqs.findIndex(entry => entry.id === item.id); return <article key={item.id} className={styles.listItem}>
                <div className={styles.compactRow}><div className={styles.rowSummary}><small>{String(index + 1).padStart(2, "0")} · {SERVICE_CATEGORIES.find(category => category.id === item.category)?.label} · {item.enabled ? "啟用中" : "未啟用"}</small><strong>{item.question || "新問題"}</strong></div><RowActions label={item.question || "新問題"} open={openFaq === item.id} controls={"faq-editor-" + item.id} index={index} length={sortedFaqs.length} edit={() => setOpenFaq(openFaq === item.id ? null : item.id)} move={direction => reorder("faqs", item.id, direction)}/></div>
                {openFaq === item.id && <fieldset id={"faq-editor-" + item.id} className={styles.item} data-service-editor="faq"><legend>編輯問題</legend><div className={styles.fields}>
                  <Field label="問題分類"><select value={item.category} onChange={event => { const category = event.target.value as ServiceCategory; faq(item.id, { category, source: defaultSources[category] || "editorial", answer: "" }); }}>{SERVICE_CATEGORIES.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}</select></Field>
                  <Field label="回答來源"><select value={item.source} onChange={event => { const source = event.target.value as ServiceSource; faq(item.id, { source, category: sourceCategory[source] || "other", answer: "" }); }}>{Object.entries(SERVICE_SOURCES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field>
                  <Field label="問題"><input value={item.question} maxLength={200} onChange={event => faq(item.id, { question: event.target.value })}/></Field>
                  <Field label="回答"><textarea value={item.source === "editorial" ? item.answer : "此回答引用「" + SERVICE_SOURCES[item.source] + "」，請在公開頁面查看目前說明。"} readOnly={item.source !== "editorial"} rows={4} maxLength={4000} onChange={event => faq(item.id, { answer: event.target.value })}/></Field>
                  <Field label="關鍵字（以逗號分隔）"><input value={item.keywords.join(",")} maxLength={1500} onChange={event => faq(item.id, { keywords: event.target.value.split(/[,，]/u) })}/></Field>
                  <Field label="問題排序"><input type="number" min={0} max={10000} value={item.sortOrder} onChange={event => faq(item.id, { sortOrder: Number(event.target.value) })}/></Field>
                  <Field label="相關連結名稱"><input value={item.ctaLabel} maxLength={100} onChange={event => faq(item.id, { ctaLabel: event.target.value })}/></Field>
                  <Field label="相關連結網址"><input value={item.ctaHref} maxLength={600} onChange={event => faq(item.id, { ctaHref: event.target.value })}/></Field>
                </div><label className={styles.check}><input type="checkbox" checked={item.enabled} onChange={event => faq(item.id, { enabled: event.target.checked })}/>啟用問題</label><button type="button" className={styles.danger} aria-label={"刪除" + (item.question || "新問題")} onClick={() => remove("faqs", item.id)}>刪除此問題</button></fieldset>}
              </article>; })}</div>
              {!filteredFaqs.length && <p className={styles.hint}>找不到符合的問題，請調整搜尋或分類。</p>}
              {pages > 1 && <div className={styles.pagination}><button type="button" disabled={currentPage === 0} onClick={() => { setFaqPage(currentPage - 1); setOpenFaq(null); }}>上一頁</button><span>{currentPage + 1} / {pages}</span><button type="button" disabled={currentPage === pages - 1} onClick={() => { setFaqPage(currentPage + 1); setOpenFaq(null); }}>下一頁</button></div>}
            </>}
            {section === "status" && <><h2>預覽 / 發布狀態</h2><dl className={styles.overview}><dt>已儲存版本</dt><dd>{state.revision}</dd><dt>目前草稿</dt><dd>{dirty ? "有未儲存變更" : "已同步"}</dd><dt>套用方式</dt><dd>儲存成功後即套用客服公開頁面。</dd></dl><a className={styles.previewLink} href="/customer-service" target="_blank" rel="noreferrer">查看已儲存公開頁面 ↗</a><p className={styles.hint}>圖片預覽在「頁面 / Hero」。儲存失敗或版本衝突時，草稿會保留。</p></>}
          </section>
        </fieldset>
        <div className={styles.toolbar}><span>版本 {state.revision}・{dirty ? "有未儲存變更" : "已同步"}{uploading ? "・圖片上傳中" : ""}</span><button type="button" disabled={busy} onClick={() => { if (!dirty || window.confirm("重新載入會捨棄尚未儲存的客服內容，確定繼續？")) window.location.reload(); }}>重新載入</button><button type="button" className={styles.save} disabled={busy || !dirty} onClick={() => void save()}>{saving ? "儲存中…" : "儲存客服內容"}</button></div>
      </div>
    </div>
  </div>;
}
