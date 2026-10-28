"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode, type KeyboardEvent } from "react";
import { SERVICE_CATEGORIES, filterServiceFaqs, type ResolvedServiceFaq, type ServiceCategory } from "@/lib/customerServiceContent";
import styles from "./CustomerService.module.css";

type FaqView = ServiceCategory | "featured" | "all";
const FEATURED_LIMIT = 6;
const REVEAL_STEP = 8;

export default function ServiceExplorer({ hero, visual, services, faqs }: { hero: ReactNode; visual: ReactNode; services: ReactNode; faqs: ResolvedServiceFaq[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FaqView>("featured");
  const [openId, setOpenId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(REVEAL_STEP);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const prefix = useId();
  useEffect(() => {
    const followAnchor = () => {
      const id = window.location.hash.replace("#faq-", "");
      const next = !window.location.hash || window.location.hash === "#faq" || id === "featured" ? "featured"
        : id === "all" ? "all" : SERVICE_CATEGORIES.find(item => item.id === id)?.id;
      if (next) { setCategory(next); setQuery(""); setOpenId(null); setVisibleCount(REVEAL_STEP); }
    };
    followAnchor();
    window.addEventListener("hashchange", followAnchor);
    return () => window.removeEventListener("hashchange", followAnchor);
  }, []);
  const allFaqs = useMemo(() => filterServiceFaqs(faqs, "all", ""), [faqs]);
  const results = useMemo(() => {
    const matching = filterServiceFaqs(faqs, category === "featured" ? "all" : category, query);
    return category === "featured" && !query.trim() ? matching.slice(0, FEATURED_LIMIT) : matching;
  }, [faqs, category, query]);
  const visibleResults = results.slice(0, visibleCount);
  const categoryLabel = category === "featured" ? "熱門問題" : category === "all" ? "全部問題" : SERVICE_CATEGORIES.find(item => item.id === category)?.label;
  const chooseCategory = (next: FaqView) => {
    setCategory(next); setOpenId(null); setVisibleCount(REVEAL_STEP);
    // Align the URL with selection so repeated Quick Service anchors still select their category.
    window.history.replaceState(null, "", next === "featured" ? "#faq" : `#faq-${next}`);
  };
  const updateQuery = (next: string) => { setQuery(next); setOpenId(null); setVisibleCount(REVEAL_STEP); };
  const revealMore = () => {
    const firstNew = visibleResults.length;
    setVisibleCount(count => count + REVEAL_STEP);
    requestAnimationFrame(() => list.current?.querySelectorAll<HTMLButtonElement>("button[data-faq-trigger]")[firstNew]?.focus());
  };
  const accordionKeys = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(list.current?.querySelectorAll<HTMLButtonElement>("button[data-faq-trigger]") ?? []);
    const index = buttons.indexOf(event.currentTarget);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };
  return <>
    <header className={styles.hero}>
      {visual}
      <div className={styles.heroContent}>
      {hero}
      <form className={styles.search} role="search" aria-label="搜尋常見問題" onSubmit={event => { event.preventDefault(); document.getElementById("faq")?.scrollIntoView(); }}>
        <label htmlFor="service-search">想了解什麼？</label>
        <div className={styles.searchField}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
          <input id="service-search" ref={input} type="search" value={query} maxLength={200} onChange={event => updateQuery(event.target.value)} placeholder="搜尋訂單、取貨、KD 點數…" aria-controls="service-faq-results" />
          {query && <button type="button" aria-label="清除搜尋" onClick={() => { updateQuery(""); input.current?.focus(); }}>清除</button>}
          <button className={styles.searchSubmit} type="submit" aria-label="查看搜尋結果">搜尋 <span aria-hidden="true">↗</span></button>
        </div>
        <p>可搜尋問題、關鍵字與回答內容。</p>
      </form>
      </div>
    </header>
    {services}
    <section id="faq" className={styles.faq} aria-labelledby="service-faq-title">
      {SERVICE_CATEGORIES.map(item => <span className={styles.anchor} id={`faq-${item.id}`} key={item.id} />)}
      <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>FAQ & GUIDANCE</p><h2 id="service-faq-title">常見問題</h2></div><p>從熱門問題開始，或選擇你需要的主題。</p></div>
      <div className={styles.faqLayout}>
        <aside className={styles.categories} aria-label="常見問題分類">
          <p className={styles.categoryLabel}>問題分類</p>
          <div className={styles.categoryButtons} role="group" aria-label="選擇問題分類">
            <button type="button" aria-controls="service-faq-results" aria-pressed={category === "featured"} onClick={() => chooseCategory("featured")}><span className={styles.categoryName}>熱門問題</span><span className={styles.categoryCount} aria-hidden="true">{Math.min(allFaqs.length, FEATURED_LIMIT)}</span></button>
            <button type="button" aria-controls="service-faq-results" aria-pressed={category === "all"} onClick={() => chooseCategory("all")}><span className={styles.categoryName}>全部問題</span><span className={styles.categoryCount} aria-hidden="true">{allFaqs.length}</span></button>
            {SERVICE_CATEGORIES.map(item => <button type="button" key={item.id} aria-controls="service-faq-results" aria-pressed={category === item.id} onClick={() => chooseCategory(item.id)}><span className={styles.categoryName}>{item.label}</span><span className={styles.categoryCount} aria-hidden="true">{allFaqs.filter(faq => faq.category === item.id).length}</span></button>)}
          </div>
          <label className={styles.mobileCategories}>問題分類<select aria-label="問題分類" value={category} onChange={event => chooseCategory(event.target.value as FaqView)}><option value="featured">熱門問題</option><option value="all">全部問題</option>{SERVICE_CATEGORIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        </aside>
        <div id="service-faq-results" ref={list} className={styles.faqResults}>
          <p className={styles.resultCount} role="status" aria-live="polite"><strong>{categoryLabel}</strong><span>{query.trim() ? `・「${query}」搜尋結果` : ""} / {results.length} 則</span>{visibleResults.length < results.length && <span className={styles.visibleCount}>目前顯示 {visibleResults.length} 則</span>}</p>
          {visibleResults.map(item => {
            const expanded = item.id === openId, triggerId = `${prefix}-${item.id}-trigger`, regionId = `${prefix}-${item.id}-answer`;
            return <article className={styles.faqItem} key={item.id} data-open={expanded || undefined}>
              <h3><button type="button" id={triggerId} aria-expanded={expanded} aria-controls={regionId} data-faq-trigger onClick={() => setOpenId(expanded ? null : item.id)} onKeyDown={accordionKeys}><span className={styles.faqNumber} aria-hidden="true">Q</span><span>{item.question}</span><span className={styles.toggle} aria-hidden="true">{expanded ? "−" : "+"}</span></button></h3>
              <div id={regionId} role="region" aria-labelledby={triggerId} hidden={!expanded} className={styles.answer}>
                <p>{item.answer}</p>
                {item.ctaHref && <a className={styles.textLink} href={item.ctaHref} rel={item.ctaHref.startsWith("https:") ? "noreferrer" : undefined}>{item.ctaLabel} <span aria-hidden="true">↗</span></a>}
              </div>
            </article>;
          })}
          {visibleResults.length < results.length && <button className={styles.showMore} type="button" aria-controls="service-faq-results" onClick={revealMore}>顯示更多 <span>還有 {results.length - visibleResults.length} 則</span><span aria-hidden="true">＋</span></button>}
          {!results.length && <div className={styles.empty}><h3>還沒找到你想問的？</h3><p>試試其他關鍵字，或直接聯絡我們。</p>{query && <button type="button" onClick={() => { updateQuery(""); input.current?.focus(); }}>清除搜尋條件</button>}<a href="#contact">聯絡客服 ↗</a></div>}
        </div>
      </div>
    </section>
  </>;
}
