"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import {
  PRODUCT_CUSTOM_SECTION_MAX_COUNT,
  sortProductCustomSections,
  type ProductCustomSection,
  type ProductCustomSectionType,
} from "@/lib/productCustomSections";
import { createAdminCustomSectionDraft } from "@/lib/customSectionAdminActionFeedback";
import { removeProductCustomSectionLocally, summarizeProductCustomSectionForDelete } from "@/lib/customSectionDeleteSummary";
import { normalizeProductSectionAnimation } from "@/lib/productPageAnimations";
import CustomProductSectionEditor from "./CustomProductSectionEditor";
import {
  customSectionAnimationSummary,
  customSectionLayoutLabels,
  customSectionPlacementLabels,
} from "./productCustomSectionAdminLabels";

export default function CustomProductSectionManager({ selected, patch }: { selected: Record<string, any>; patch: (change: Record<string, unknown>) => void }) {
  const [newType, setNewType] = useState<ProductCustomSectionType>("text");
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<string>>(() => new Set());
  const [createdSectionId, setCreatedSectionId] = useState<string>();
  const [creationMessage, setCreationMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState<ProductCustomSection>();
  const creatingRef = useRef(false);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const sections = (Array.isArray(selected.productCustomSections) ? selected.productCustomSections : []) as ProductCustomSection[];
  const atLimit = sections.length >= PRODUCT_CUSTOM_SECTION_MAX_COUNT;
  const updateSections = (next: ProductCustomSection[]) => patch({ productCustomSections: next.length ? next : undefined });

  useEffect(() => {
    if (!createdSectionId) return;
    const card = cardRefs.current.get(createdSectionId);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "start" });
    const frame = requestAnimationFrame(() => card.querySelector<HTMLInputElement>("[data-custom-section-admin-name]")?.focus({ preventScroll: true }));
    creatingRef.current = false;
    setIsCreating(false);
    const highlightTimer = window.setTimeout(() => setCreatedSectionId((current) => current === createdSectionId ? undefined : current), 3000);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(highlightTimer);
    };
  }, [createdSectionId, sections.length]);

  const createSection = () => {
    if (creatingRef.current || atLimit) return;
    creatingRef.current = true;
    setIsCreating(true);
    const section = createAdminCustomSectionDraft({ type: newType, sections });
    setExpandedSectionIds((current) => new Set(current).add(section.id));
    setCreatedSectionId(section.id);
    setCreationMessage(`✓ 已新增『${newType === "text" ? "純文案" : "重點特色"}』Section。新 Section 預設不顯示於前台，完成內容後再開啟『顯示於前台』。`);
    updateSections([...sections, section]);
  };

  const updateExpandedState = (sectionId: string, open: boolean) => {
    setExpandedSectionIds((current) => {
      if (current.has(sectionId) === open) return current;
      const next = new Set(current);
      if (open) next.add(sectionId);
      else next.delete(sectionId);
      return next;
    });
  };

  const confirmDelete = () => {
    if (!pendingDeletion) return;
    updateSections(removeProductCustomSectionLocally(sections, pendingDeletion.id));
    setExpandedSectionIds((current) => {
      const next = new Set(current);
      next.delete(pendingDeletion.id);
      return next;
    });
    setCreatedSectionId((current) => current === pendingDeletion.id ? undefined : current);
    setCreationMessage(`✓ 已從目前編輯狀態移除「${pendingDeletion.adminName}」。還需要按『儲存商品』才會正式儲存此變更。`);
    setPendingDeletion(undefined);
  };

  const deletionSummary = pendingDeletion ? summarizeProductCustomSectionForDelete(pendingDeletion) : undefined;

  return <section className="custom-product-section-manager" aria-labelledby="custom-product-sections-title">
    <div className="custom-product-section-manager-head"><div><h3 id="custom-product-sections-title">自訂 Section</h3><p>可建立純文案或重點特色，並加入經安全驗證的圖片或影片；不支援任意 HTML。新增項目預設不顯示於前台。</p></div><span className="custom-section-count">已建立 {sections.length} / {PRODUCT_CUSTOM_SECTION_MAX_COUNT} 個自訂 Section</span></div>
    <div className="custom-product-section-toolbar"><label>Section 類型<select value={newType} onChange={(event) => setNewType(event.target.value as ProductCustomSectionType)}><option value="text">純文案</option><option value="features">重點特色</option></select></label><button type="button" className="custom-section-primary-action" onClick={createSection} disabled={isCreating || atLimit}>{isCreating ? "新增中…" : "＋新增 Section"}</button></div>
    {atLimit ? <p className="custom-section-limit-message">已達 {PRODUCT_CUSTOM_SECTION_MAX_COUNT} 個 Section 上限。</p> : null}
    {creationMessage ? <p className="custom-section-action-status" role="status" aria-live="polite">{creationMessage}</p> : null}
    {sections.length ? <div className="custom-product-section-admin-list">{sortProductCustomSections(sections).map((section) => {
      const animation = normalizeProductSectionAnimation(section.animation);
      const justCreated = section.id === createdSectionId;
      return <article
        key={section.id}
        ref={(node) => { if (node) cardRefs.current.set(section.id, node); else cardRefs.current.delete(section.id); }}
        data-custom-section-id={section.id}
        className={`${section.enabled ? "is-enabled" : "is-disabled"}${justCreated ? " is-newly-created" : ""}`}
      >
        <div className="custom-product-section-card-head"><div><span className="custom-section-status">{section.enabled ? "顯示" : "隱藏"}</span>{justCreated ? <span className="custom-section-new-badge">剛新增</span> : null}<strong>{section.adminName}</strong><small>{section.type === "text" ? "純文案" : "重點特色"}</small></div><button type="button" className="custom-section-card-delete" onClick={() => setPendingDeletion(section)}>刪除</button></div>
        <dl><div><dt>版位</dt><dd>{customSectionPlacementLabels[section.placement]}</dd></div><div><dt>排序</dt><dd>{section.order}</dd></div><div><dt>版型</dt><dd>{customSectionLayoutLabels[section.layout]}</dd></div><div><dt>前台標題</dt><dd>{section.content.heading || "（未設定）"}</dd></div><div><dt>動畫</dt><dd>{section.animation?.enabled ? customSectionAnimationSummary(animation.effect || "fade", animation.trigger || "viewport", animation.durationMs || 500) : "未啟用"}</dd></div></dl>
        <details open={expandedSectionIds.has(section.id)} onToggle={(event) => updateExpandedState(section.id, event.currentTarget.open)}><summary>編輯此自訂 Section</summary><CustomProductSectionEditor section={section} productSlug={String(selected.slug || "")} onChange={(next) => updateSections(sections.map((entry) => entry.id === section.id ? next : entry))} onDelete={() => setPendingDeletion(section)} /></details>
      </article>;
    })}</div> : <p className="custom-product-section-empty">此商品尚未建立自訂 Section；前台維持既有呈現。</p>}
    {pendingDeletion && deletionSummary ? <div className="cms-modal-backdrop custom-section-delete-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setPendingDeletion(undefined); }}><div className="cms-modal custom-section-delete-modal" role="dialog" aria-modal="true" aria-labelledby="custom-section-delete-title">
      <h2 id="custom-section-delete-title">確定刪除「{pendingDeletion.adminName}」？</h2>
      {deletionSummary.isEditoriallyEmpty ? <p>此 Section 尚未加入文案、特色項目、圖片、影片或 YouTube 媒體。</p> : <><p>此 Section 目前包含：</p><ul>{deletionSummary.contentItems.map((item) => <li key={item}>{item}</li>)}</ul></>}
      <p>刪除後，此 Section 將從目前商品的編輯資料中移除。仍需按「儲存商品」才會正式儲存此變更。</p>
      {deletionSummary.hasCloudinaryMedia ? <p className="custom-section-cloudinary-retention">Cloudinary 上已上傳的圖片／影片不會自動刪除。</p> : null}
      <div className="cms-modal-actions"><button className="cms-secondary-button" type="button" onClick={() => setPendingDeletion(undefined)}>取消</button><button className="custom-section-danger-action" type="button" onClick={confirmDelete}>確定刪除 Section</button></div>
    </div></div> : null}
  </section>;
}
