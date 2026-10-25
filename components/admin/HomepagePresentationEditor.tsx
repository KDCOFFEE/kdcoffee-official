"use client";

import { createContext, useCallback, useContext, useEffect, useId, useState, type ReactNode } from "react";
import { HOMEPAGE_PRESENTATION_NUMBER_RULES, HOMEPAGE_SECTION_CAPABILITIES, type HomepagePresentationKey, type HomepagePresentationPatch, type HomepagePresentationV3, type HomepageTextSlot } from "@/lib/homepagePresentation";
import { describeHomepageContent, HOMEPAGE_CONTENT_SOURCES, HOMEPAGE_CONTENT_SLOT_LABELS, type HomepageContentDescription, type HomepageContentExample, type HomepageContentInput, type HomepageContentProduct } from "@/lib/homepageContent";
import type { CmsLinkRegistryInput } from "@/lib/cmsLinks";
import type { HomepageBasePresentationEdit } from "@/lib/homepagePresentationAdmin";
import { HOMEPAGE_MOTION_PRESETS, HOMEPAGE_SECTION_MOTION_DEFAULTS, resolveSectionMotion, type HomepageMotionSectionKey, type HomepageSectionMotion } from "@/lib/homepageCms";
import { VISUAL_ALIGNMENT_PRESETS, VISUAL_COLOR_PRESETS, VISUAL_WEIGHT_PRESETS, resolveVisualColor, visualColorHex, type VisualColorValue } from "@/lib/pageBuilderVisualStyle";

export const HOMEPAGE_TEXT_SLOT_LABELS = HOMEPAGE_CONTENT_SLOT_LABELS;
type ContentContext = { homepage: HomepageContentInput; products: HomepageContentProduct[]; pages?: CmsLinkRegistryInput["pages"]; draft?: boolean };
const weightLabels = { light: "細", regular: "一般", semibold: "中粗", bold: "粗" };
const alignmentLabels = { left: "靠左", center: "置中", right: "靠右" };
const colorLabels = { ink: "墨黑", coffee: "深咖啡", "warm-gray": "暖灰", ivory: "米白", gold: "KD 金", white: "柔白" };
const selectStyle = { width: "100%", minHeight: 44, padding: "9px 10px", border: "1px solid #d5ccc2", background: "#fff", color: "#30271f", font: "inherit" } as const;
type NumericField = "fontSizePx" | "lineHeight" | "letterSpacingEm" | "maxWidthCh" | "contentMaxWidthPx" | "paddingTopPx" | "paddingBottomPx";
const numericLabels: Record<NumericField, [string, string]> = {
  fontSizePx: ["字級", "px"], lineHeight: ["行高", "倍"], letterSpacingEm: ["字距", "em"], maxWidthCh: ["最大文字寬度", "字元"],
  contentMaxWidthPx: ["內容最大寬度", "px"], paddingTopPx: ["上方留白", "px"], paddingBottomPx: ["下方留白", "px"],
};
type PresentationContextValue = {
  device?: "desktop" | "mobile";
  content?: ContentContext;
  presentation?: HomepagePresentationV3;
  onEdit: (section: HomepagePresentationKey, edit: HomepageBasePresentationEdit) => void;
  onMobileEdit?: (section: HomepagePresentationKey, edit: HomepageBasePresentationEdit) => void;
  onMobileToggle?: (section: HomepagePresentationKey, enabled: boolean) => void;
  reportIssue: (id: string, message?: string) => void;
  issues: Record<string, string>;
};
const PresentationContext = createContext<PresentationContextValue | null>(null);
export function useHomepageEditorDevice() { return useContext(PresentationContext)?.device; }

/** Draft-only UI state. Opening/expanding controls never initializes CMS data. */
export function HomepagePresentationProvider({ presentation, content, device, onEdit, onMobileEdit, onMobileToggle, onValidityChange, children }: {
  device?: "desktop" | "mobile";
  presentation?: HomepagePresentationV3;
  content?: ContentContext;
  onEdit: PresentationContextValue["onEdit"];
  onMobileEdit?: PresentationContextValue["onMobileEdit"];
  onMobileToggle?: PresentationContextValue["onMobileToggle"];
  onValidityChange: (invalid: boolean) => void;
  children: ReactNode;
}) {
  const [issues, setIssues] = useState<Record<string, string>>({});
  const reportIssue = useCallback((id: string, message?: string) => setIssues((current) => {
    if (current[id] === message) return current;
    const next = { ...current };
    if (message) next[id] = message; else delete next[id];
    return next;
  }), []);
  const invalid = Object.keys(issues).length > 0;
  useEffect(() => onValidityChange(invalid), [invalid, onValidityChange]);
  return <PresentationContext.Provider value={{ presentation, content, device, onEdit, onMobileEdit, onMobileToggle, reportIssue, issues }}>
    {invalid ? <p className="cms-message" role="alert">呈現設定尚有未完成的輸入，請修正或選擇「沿用目前設計」後再儲存。</p> : null}
    {children}
  </PresentationContext.Provider>;
}

function NumberField({ field, value, onChange, issueId, reportIssue, inheritLabel = "沿用目前設計", inheritedHint, explicitLabel = "已設定" }: {
  inheritLabel?: string; inheritedHint?: string; explicitLabel?: string;
  field: NumericField; value?: number; onChange: (value: number | undefined) => void;
  issueId: string; reportIssue: PresentationContextValue["reportIssue"];
}) {
  const id = useId();
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const [error, setError] = useState("");
  const rule = HOMEPAGE_PRESENTATION_NUMBER_RULES[field];
  const [label, unit] = numericLabels[field];
  useEffect(() => { setDraft(value === undefined ? "" : String(value)); }, [value]);
  useEffect(() => () => reportIssue(issueId), [issueId, reportIssue]);
  const reset = () => { setDraft(""); setError(""); reportIssue(issueId); onChange(undefined); };
  return <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
    <label htmlFor={id}>{label}（{unit}）<input id={id} type="number" min={rule.min} max={rule.max} step={"step" in rule ? rule.step : "any"} value={draft} placeholder={inheritLabel} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => {
      const input = event.currentTarget;
      setDraft(input.value);
      if (input.value === "" && !input.validity.badInput) { reset(); return; }
      const number = input.valueAsNumber;
      if (!Number.isFinite(number) || number < rule.min || number > rule.max || ("step" in rule && !Number.isInteger(number / rule.step))) {
        const message = `請輸入 ${rule.min}–${rule.max} ${unit}${"step" in rule ? " 的整數" : ""}。`;
        setError(message); reportIssue(issueId, message); return;
      }
      setError(""); reportIssue(issueId); onChange(number);
    }} /></label>
    <small className="cms-help">{value === undefined ? inheritedHint ?? "目前由網站版型決定" : `${explicitLabel}：${value} ${unit}`} · 範圍 {rule.min}–{rule.max} {unit}</small>
    <button type="button" className="cms-secondary-button" style={{ justifySelf: "start" }} disabled={value === undefined && draft === "" && !error} onClick={reset}>{inheritLabel}</button>
    {error ? <p id={`${id}-error`} role="alert">{error}</p> : null}
  </div>;
}

// Existing Works/VisualStyleStudio color controls are file-private/coupled.
// Keep this small Homepage equivalent; reuse their canonical safe primitives.
function ColorField({ label, value, onChange, allowInherit = true, inheritLabel = "沿用目前設計", inheritedHint }: {
  inheritLabel?: string; inheritedHint?: string;
  label: string; value?: VisualColorValue; onChange: (value: VisualColorValue | undefined) => void; allowInherit?: boolean;
}) {
  const preset = VISUAL_COLOR_PRESETS.find((preset) => preset === value);
  return <fieldset className="cms-item-card"><legend>{label}</legend>
    <p className="cms-help">{value === undefined ? (allowInherit ? inheritedHint ?? inheritLabel : "請選擇顏色後才會套用") : value.startsWith("#") ? `自訂顏色 ${value.toUpperCase()}` : preset ? colorLabels[preset] : "自訂顏色"}</p>
    <div className="homepage-color-swatches">
      {VISUAL_COLOR_PRESETS.map((preset) => <button type="button" key={preset} aria-label={`${label}：${colorLabels[preset]}`} aria-pressed={value === preset} onClick={() => onChange(preset)}><i style={{ backgroundColor: visualColorHex(preset) }} /><span>{colorLabels[preset]}</span></button>)}
      <label className="homepage-custom-color"><span>選擇自訂顏色</span><input type="color" aria-label={`${label}：自訂顏色`} value={visualColorHex(value ?? "ink")} onChange={(event) => onChange(resolveVisualColor(event.currentTarget.value, "ink"))} /></label>
    </div>
    {allowInherit ? <button type="button" className="cms-secondary-button" disabled={value === undefined} onClick={() => onChange(undefined)}>{inheritLabel}</button> : null}
  </fieldset>;
}

export function HomepagePresentationEditor({ sectionKey }: { sectionKey: HomepagePresentationKey }) {
  const context = useContext(PresentationContext);
  if (!context) return null;
  return <SectionPresentationEditor sectionKey={sectionKey} context={context} />;
}

export function HomepageAnimationEditor({ sectionKey }: { sectionKey: HomepageMotionSectionKey }) {
  const context = useContext(PresentationContext);
  return context?.device ? <StudioAnimationFields sectionKey={sectionKey} context={context} /> : null;
}


function describeValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "顯示" : "隱藏";
  if (typeof value === "string") {
    if (value in weightLabels) return weightLabels[value as keyof typeof weightLabels];
    if (value in alignmentLabels) return alignmentLabels[value as keyof typeof alignmentLabels];
    if (value in colorLabels) return colorLabels[value as keyof typeof colorLabels];
  }
  return String(value);
}

function SectionPresentationEditor({ sectionKey, context }: { sectionKey: HomepagePresentationKey; context: PresentationContextValue }) {
  const section = context.presentation?.sections?.[sectionKey];
  const base = section?.base;
  const mobile = section?.mobile;
  const enabled = mobile?.overrideEnabled === true;
  const descriptions = context.content ? describeHomepageContent(context.content.homepage, sectionKey, context.content.products, context.content.pages) : undefined;
  const hasIssue = Object.keys(context.issues).some((key) => key.startsWith(`${sectionKey}.`));
  if (context.device) {
    const isMobile = context.device === "mobile";
    return <section aria-label={isMobile ? "手機呈現設定" : "桌機呈現設定"}>
      {isMobile ? <p className="cms-help">{enabled && mobile?.overrides ? "手機自訂 · 未覆寫欄位與桌機同步" : "與桌機同步 · 直接編輯即可建立手機自訂"}</p> : null}
      {isMobile ? <><label className="cms-switch"><input type="checkbox" checked={enabled} onChange={event => context.onMobileToggle?.(sectionKey, event.currentTarget.checked)} />啟用手機自訂</label>{!enabled && mobile?.overrides ? <p className="cms-help">手機自訂目前暫停套用，下方保留原設定。重新啟用或編輯任一欄位會恢復套用；恢復同步則會刪除覆寫。</p> : null}</> : null}
      {isMobile && mobile?.overrides ? <button type="button" onClick={() => {
        // Reset deletes every leaf. Turning the enable flag off alone retains overrides.
        const patch = mobile.overrides!;
        for (const [slot, fields] of Object.entries(patch.text || {})) for (const field of Object.keys(fields)) context.onMobileEdit?.(sectionKey, { group: "text", slot: slot as HomepageTextSlot, field: field as keyof NonNullable<typeof fields>, value: undefined });
        for (const field of Object.keys(patch.layout || {})) context.onMobileEdit?.(sectionKey, { group: "layout", field: field as keyof NonNullable<HomepagePresentationPatch["layout"]>, value: undefined });
        context.onMobileEdit?.(sectionKey, { group: "background", value: undefined });
        context.onMobileEdit?.(sectionKey, { group: "visible", value: undefined });
        for (const field of Object.keys(patch.animation || {})) context.onMobileEdit?.(sectionKey, { group: "animation", field: field as keyof HomepageSectionMotion, value: undefined });
        context.onMobileToggle?.(sectionKey, false);
      }}>全部恢復與桌機同步</button> : null}
      <PresentationFields key={`${sectionKey}-${context.device}`} sectionKey={sectionKey} context={context} mode={isMobile ? "mobile" : "base"} patch={isMobile ? mobile?.overrides : base} base={isMobile ? base : undefined} descriptions={isMobile ? undefined : descriptions} />
      {sectionKey !== "hero" ? <StudioAnimationFields sectionKey={sectionKey} context={context} /> : <p className="cms-help">主視覺採既有電影式分段進場，時間與開關位於「內容與媒體」。目前兩種裝置共用此進場序列。</p>}
    </section>;
  }
  return <details className="cms-panel cms-collapsible homepage-base-presentation">
    <summary><div><h3>呈現設定</h3><p>{hasIssue ? "請完成輸入後再儲存" : enabled ? "已啟用手機自訂" : base && Object.keys(base).some((key) => key !== "animation") ? "已自訂共用樣式" : "沿用目前設計"}</p></div><span>展開／收合</span></summary>
    <div className="cms-panel-body">
      {context.content ? <p className="cms-help">{context.content.draft ? "以下為目前未儲存草稿的內容摘要。" : "以下為目前已讀取資料的內容摘要。"}僅說明內容與啟用條件；尚未量測實際字級、色彩或桌機／手機顯示結果。下方數值為自訂設定。</p> : null}
      <PresentationFields sectionKey={sectionKey} context={context} mode="base" patch={base} descriptions={descriptions} />
      <section className="cms-item-card" style={{ marginTop: 24 }} aria-label="手機版呈現設定">
        <h3>手機版</h3>
        <label className="cms-switch"><input type="checkbox" checked={enabled} disabled={!context.onMobileToggle} onChange={(event) => context.onMobileToggle?.(sectionKey, event.currentTarget.checked)} />啟用手機自訂</label>
        <p className="cms-help">儲存後，手機版設定會在螢幕寬度 600px 以下套用至公開首頁；未設定的欄位會沿用 Desktop／共用設定。</p>
        {enabled
          ? <PresentationFields sectionKey={sectionKey} context={context} mode="mobile" patch={mobile?.overrides} base={base} />
          : <p className="cms-help">目前沿用 Desktop／共用設定。{mobile?.overrides ? "已儲存的手機自訂內容會保留，重新啟用即可繼續編輯。" : ""}</p>}
      </section>
    </div>
  </details>;
}

function CurrentContent({ description }: { description: HomepageContentDescription }) {
  const renderExample = (item: HomepageContentExample, index: number) => <li key={index} style={{ marginBottom: 10 }}>
    {item.role ? <small>{item.role}</small> : null}
    <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      {item.text.trim() ? item.text.length > 240 ? <details><summary>{item.text.slice(0, 160)}…（展開完整內容）</summary><p style={{ whiteSpace: "pre-wrap" }}>{item.text}</p></details> : item.text : "目前沒有內容"}
    </div>
    <small>內容來源：{HOMEPAGE_CONTENT_SOURCES[item.source]} · 內容編輯：{item.editableWhere}</small>
    {item.reason && item.reason !== description.reason ? <p className="cms-help">{item.reason}</p> : null}
  </li>;
  return <section className="cms-item-card" aria-label={`${description.label}目前內容`} data-homepage-content-description>
    <p><strong>{description.label}</strong></p>
    <p>目前內容{description.total > 1 ? `（共 ${description.total} 項）` : ""}</p>
    {description.reason ? <p className="cms-help">{description.reason}</p> : null}
    {description.total ? <ul style={{ margin: 0, paddingLeft: 20 }}>
      {description.examples.slice(0, 3).map(renderExample)}
    </ul> : <><p>目前沒有內容</p><small>內容來源：{description.sources.map(source => HOMEPAGE_CONTENT_SOURCES[source]).join("／")} · 內容編輯：{description.editableWhere}</small></>}
    {description.total > 3 ? <details><summary>查看其餘 {description.total - 3} 項</summary><ul style={{ paddingLeft: 20 }}>{description.examples.slice(3).map(renderExample)}</ul></details> : null}
    <p className="cms-help">影響範圍：{description.impact}</p>
  </section>;
}

/** The same controls serve Base and sparse Mobile; inherited hints never enter
 * the input values or mutation payloads. Only the edited leaf is submitted. */
function PresentationFields({ sectionKey, context, mode, patch, base, descriptions }: {
  sectionKey: HomepagePresentationKey; context: PresentationContextValue; mode: "base" | "mobile";
  patch?: HomepagePresentationPatch; base?: HomepagePresentationPatch;
  descriptions?: Partial<Record<HomepageTextSlot, HomepageContentDescription>>;
}) {
  const { onEdit, onMobileEdit, reportIssue } = context;
  const slots = HOMEPAGE_SECTION_CAPABILITIES[sectionKey];
  const isMobile = mode === "mobile";
  const inheritLabel = isMobile ? context.device ? "恢復與桌機同步" : "沿用 Desktop" : "沿用目前設計";
  const inheritHint = (value: unknown, unit = "") => value === undefined ? "沿用 Desktop／網站設計" : `沿用 Desktop：${describeValue(value)}${unit}`;
  const [choosingColor, setChoosingColor] = useState(false);
  const background = patch?.background;
  const backgroundMode = choosingColor ? "color" : background?.mode === "none" || background?.mode === "color" ? background.mode : "";
  const needsColor = backgroundMode === "color" && background?.color === undefined;
  const backgroundIssue = `${sectionKey}.${mode}.background`;
  useEffect(() => { reportIssue(backgroundIssue, needsColor ? "請選擇背景顏色。" : undefined); return () => reportIssue(backgroundIssue); }, [backgroundIssue, needsColor, reportIssue]);
  const edit = (value: HomepageBasePresentationEdit) => isMobile ? onMobileEdit?.(sectionKey, value) : onEdit(sectionKey, value);
  const numericValue = (target: HomepagePresentationPatch | undefined, field: NumericField, slot?: HomepageTextSlot) => slot
    ? target?.text?.[slot]?.[field as "fontSizePx" | "lineHeight" | "letterSpacingEm" | "maxWidthCh"]
    : target?.layout?.[field as "contentMaxWidthPx" | "paddingTopPx" | "paddingBottomPx"];
  const number = (field: NumericField, slot?: HomepageTextSlot) => <NumberField key={field} field={field} issueId={`${sectionKey}.${mode}.${slot ?? "layout"}.${field}`} reportIssue={reportIssue}
    value={numericValue(patch, field, slot)} inheritLabel={inheritLabel} inheritedHint={isMobile ? inheritHint(numericValue(base, field, slot), ` ${numericLabels[field][1]}`) : undefined} explicitLabel={isMobile ? "手機自訂" : "已設定"}
    onChange={(value) => slot ? edit({ group: "text", slot, field: field as "fontSizePx" | "lineHeight" | "letterSpacingEm" | "maxWidthCh", value }) : edit({ group: "layout", field: field as "contentMaxWidthPx" | "paddingTopPx" | "paddingBottomPx", value })} />;
  const hint = (value: unknown, inherited: unknown) => isMobile ? <small className="cms-help">{value === undefined ? inheritHint(inherited) : `手機自訂：${describeValue(value)}`}</small> : null;
  const backgroundHint = base?.background?.mode === "none" ? "沿用 Desktop：無背景" : base?.background?.mode === "color" && base.background.color !== undefined ? `沿用 Desktop：背景顏色 ${describeValue(base.background.color)}` : "沿用 Desktop／網站設計";
  return <section data-presentation-mode={mode} aria-label={isMobile ? "手機版呈現欄位" : "Desktop 共用呈現欄位"}>
      <h3>{isMobile ? "手機自訂設定" : "Desktop / 共用設定"}</h3>
      <p className="cms-help">{isMobile ? "只儲存手機明確設定的欄位；未自訂的欄位沿用 Desktop。" : "桌機與手機共用；未自訂的欄位沿用目前設計。修改後按「儲存全部」套用。"}</p>
      <h4>基本設定</h4>
      <label style={{ display: "grid", gap: 7 }}>{isMobile ? "手機顯示狀態" : "共用顯示狀態"}<select style={selectStyle} value={patch?.visible === undefined ? "inherit" : patch.visible ? "show" : "hide"} onChange={(event) => edit({ group: "visible", value: event.currentTarget.value === "inherit" ? undefined : event.currentTarget.value === "show" })}>
        <option value="inherit">{isMobile ? inheritLabel : "沿用區塊設定"}</option><option value="show">顯示</option><option value="hide">隱藏</option>
      </select></label>{hint(patch?.visible, base?.visible)}<p className="cms-help">這是版面顯示設定；上方的區塊啟用開關仍是總開關。</p>
      <h4>文字樣式</h4>
      <div style={{ display: "grid", gap: 10 }}>{slots.map((slot) => {
        const text = patch?.text?.[slot];
        const inherited = base?.text?.[slot];
        return <details className="cms-item-card" key={slot}>
          <summary style={{ cursor: "pointer" }}><strong>{HOMEPAGE_TEXT_SLOT_LABELS[slot]}</strong> · {text && Object.keys(text).length ? isMobile ? "手機自訂" : "已自訂" : inheritLabel}</summary>
          {!isMobile && descriptions?.[slot] ? <CurrentContent description={descriptions[slot]!} /> : null}
          <div className="cms-grid two" style={{ marginTop: 16, alignItems: "start" }}>
            {number("fontSizePx", slot)}
            <label>字重<select style={selectStyle} value={text?.fontWeight ?? ""} onChange={(event) => edit({ group: "text", slot, field: "fontWeight", value: event.currentTarget.value || undefined })}><option value="">{inheritLabel}</option>{VISUAL_WEIGHT_PRESETS.map((weight) => <option key={weight} value={weight}>{weightLabels[weight]}</option>)}</select>{hint(text?.fontWeight, inherited?.fontWeight)}</label>
            <label>對齊<select style={selectStyle} value={text?.alignment ?? ""} onChange={(event) => edit({ group: "text", slot, field: "alignment", value: event.currentTarget.value || undefined })}><option value="">{inheritLabel}</option>{VISUAL_ALIGNMENT_PRESETS.map((alignment) => <option key={alignment} value={alignment}>{alignmentLabels[alignment]}</option>)}</select>{hint(text?.alignment, inherited?.alignment)}</label>
          </div>
          <ColorField label="文字顏色" value={text?.color} inheritLabel={inheritLabel} inheritedHint={isMobile ? inheritHint(inherited?.color) : undefined} onChange={(value) => edit({ group: "text", slot, field: "color", value })} />
          <details className="cms-item-card"><summary>更多文字設定</summary><div className="cms-grid two">{number("lineHeight", slot)}{number("letterSpacingEm", slot)}{number("maxWidthCh", slot)}</div><p className="cms-help">最大文字寬度只限制這段文字的閱讀寬度，不影響整個區塊。</p></details>
        </details>;
      })}</div>
      <details className="cms-item-card" style={{ marginTop: 16 }}><summary>版面與留白</summary><div className="cms-grid two">{number("contentMaxWidthPx")}{number("paddingTopPx")}{number("paddingBottomPx")}</div><p className="cms-help">內容最大寬度限制文字與主要內容；不會裁切滿版背景。</p></details>
      <details className="cms-item-card" style={{ marginTop: 16 }}><summary>背景</summary>
        <label style={{ display: "grid", gap: 7 }}>背景設定<select style={selectStyle} value={backgroundMode} onChange={(event) => {
          const next = event.currentTarget.value;
          setChoosingColor(next === "color");
          if (next !== "color") { reportIssue(backgroundIssue); edit({ group: "background", value: next === "none" ? { mode: "none" } : undefined }); }
        }}><option value="">{inheritLabel}</option><option value="none">無背景</option><option value="color">背景顏色</option></select></label>
        {isMobile && !backgroundMode ? <p className="cms-help">{backgroundHint}</p> : null}
        {backgroundMode === "color" ? <ColorField label="背景顏色" value={background?.color} allowInherit={false} onChange={(color) => { if (color !== undefined) { setChoosingColor(false); reportIssue(backgroundIssue); edit({ group: "background", value: { mode: "color", color } }); } }} /> : null}
      </details>
  </section>;
}

const animationNames: Record<string, string> = { none: "無動畫", fade: "淡入", "fade-up": "由下淡入", "slide-left": "由左滑入", "slide-right": "由右滑入", "scale-reveal": "縮放揭示", editorial: "精品敘事" };
function StudioAnimationFields({ sectionKey, context }: { sectionKey: HomepageMotionSectionKey; context: PresentationContextValue }) {
  const mobile = context.device === "mobile", stored = context.presentation?.sections?.[sectionKey];
  const legacy = (context.content?.homepage as unknown as Record<string, { motion?: unknown }>)?.[sectionKey]?.motion;
  const desktop = { ...resolveSectionMotion(legacy, sectionKey), ...stored?.base?.animation };
  const patch = mobile ? stored?.mobile?.overrides?.animation : stored?.base?.animation;
  const effective = { ...desktop, ...(mobile && stored?.mobile?.overrideEnabled ? patch : {}) };
  const edit = (field: keyof HomepageSectionMotion, value: unknown) => (mobile ? context.onMobileEdit : context.onEdit)?.(sectionKey, { group: "animation", field, value });
  const state = (field: keyof HomepageSectionMotion) => mobile ? patch?.[field] === undefined ? "與桌機同步" : "手機自訂" : patch?.[field] === undefined ? "沿用區塊動畫" : "桌機自訂";
  const reset = (field: keyof HomepageSectionMotion) => <button type="button" disabled={patch?.[field] === undefined} onClick={() => edit(field, undefined)}>{mobile ? "恢復與桌機同步" : "沿用區塊動畫"}</button>;
  return <details className="cms-item-card" open><summary><strong>動畫</strong></summary>
    <p className="cms-help">沿用首頁既有進場機制；減少動態偏好仍優先生效。右側可重播真實區塊。</p>
    <label className="cms-switch"><input type="checkbox" checked={effective.enabled} onChange={event => edit("enabled", event.target.checked)} />啟用動畫 · {state("enabled")}</label>{reset("enabled")}
    <label>進場方式 · {state("preset")}<select style={selectStyle} value={effective.preset} onChange={event => edit("preset", event.target.value)}>{HOMEPAGE_MOTION_PRESETS.map(value => <option key={value} value={value}>{animationNames[value]}</option>)}</select></label>{reset("preset")}
    <div className="cms-grid two">{(["durationMs", "delayMs", "distancePx", "staggerMs"] as const).map(field => {
      const rule = HOMEPAGE_PRESENTATION_NUMBER_RULES[field], labels = { durationMs: "時間（ms）", delayMs: "延遲（ms）", distancePx: "距離（px）", staggerMs: "項目間隔（ms）" };
      return <div key={field}><label>{labels[field]} · {state(field)}<input type="range" min={rule.min} max={rule.max} step={rule.step} value={effective[field]} onChange={event => edit(field, Number(event.target.value))} /></label><output>{effective[field]}</output>{reset(field)}</div>;
    })}</div>
    <button type="button" onClick={() => {
      for (const field of ["enabled", "preset", "delayMs", "durationMs", "distancePx", "staggerMs"] as const) edit(field, mobile ? undefined : HOMEPAGE_SECTION_MOTION_DEFAULTS[sectionKey][field]);
    }}>{mobile ? "動畫恢復與桌機同步" : "恢復此區塊預設動畫"}</button>
  </details>;
}
