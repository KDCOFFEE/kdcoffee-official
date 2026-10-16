"use client";

import { createContext, useCallback, useContext, useEffect, useId, useState, type ReactNode } from "react";
import { HOMEPAGE_PRESENTATION_NUMBER_RULES, HOMEPAGE_SECTION_CAPABILITIES, type HomepagePresentationKey, type HomepagePresentationV3, type HomepageTextSlot } from "@/lib/homepagePresentation";
import type { HomepageBasePresentationEdit } from "@/lib/homepagePresentationAdmin";
import { VISUAL_ALIGNMENT_PRESETS, VISUAL_COLOR_PRESETS, VISUAL_WEIGHT_PRESETS, resolveVisualColor, visualColorHex, type VisualColorValue } from "@/lib/pageBuilderVisualStyle";

export const HOMEPAGE_TEXT_SLOT_LABELS: Record<HomepageTextSlot, string> = {
  eyebrow: "前導小標", title: "主標題", intro: "引言／說明文字", body: "內文", closing: "結尾文字",
  cta: "按鈕文字", cardTitle: "卡片標題", cardBody: "卡片內文", metadata: "輔助資訊",
};
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
  presentation?: HomepagePresentationV3;
  onEdit: (section: HomepagePresentationKey, edit: HomepageBasePresentationEdit) => void;
  reportIssue: (id: string, message?: string) => void;
  issues: Record<string, string>;
};
const PresentationContext = createContext<PresentationContextValue | null>(null);

/** Draft-only UI state. Opening/expanding controls never initializes CMS data. */
export function HomepagePresentationProvider({ presentation, onEdit, onValidityChange, children }: {
  presentation?: HomepagePresentationV3;
  onEdit: PresentationContextValue["onEdit"];
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
  return <PresentationContext.Provider value={{ presentation, onEdit, reportIssue, issues }}>
    {invalid ? <p className="cms-message" role="alert">呈現設定尚有未完成的輸入，請修正或選擇「沿用目前設計」後再儲存。</p> : null}
    {children}
  </PresentationContext.Provider>;
}

function NumberField({ field, value, onChange, issueId, reportIssue }: {
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
    <label htmlFor={id}>{label}（{unit}）<input id={id} type="number" min={rule.min} max={rule.max} step={"step" in rule ? rule.step : "any"} value={draft} placeholder="沿用目前設計" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => {
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
    <small className="cms-help">{value === undefined ? "目前由網站版型決定" : `已設定：${value} ${unit}`} · 範圍 {rule.min}–{rule.max} {unit}</small>
    <button type="button" className="cms-secondary-button" style={{ justifySelf: "start" }} disabled={value === undefined && draft === "" && !error} onClick={reset}>沿用目前設計</button>
    {error ? <p id={`${id}-error`} role="alert">{error}</p> : null}
  </div>;
}

// Existing Works/VisualStyleStudio color controls are file-private/coupled.
// Keep this small Homepage equivalent; reuse their canonical safe primitives.
function ColorField({ label, value, onChange, allowInherit = true }: {
  label: string; value?: VisualColorValue; onChange: (value: VisualColorValue | undefined) => void; allowInherit?: boolean;
}) {
  const preset = VISUAL_COLOR_PRESETS.find((preset) => preset === value);
  return <fieldset className="cms-item-card"><legend>{label}</legend>
    <p className="cms-help">{value === undefined ? (allowInherit ? "沿用目前設計" : "請選擇顏色後才會套用") : value.startsWith("#") ? `自訂顏色 ${value.toUpperCase()}` : preset ? colorLabels[preset] : "自訂顏色"}</p>
    <div className="homepage-color-swatches">
      {VISUAL_COLOR_PRESETS.map((preset) => <button type="button" key={preset} aria-label={`${label}：${colorLabels[preset]}`} aria-pressed={value === preset} onClick={() => onChange(preset)}><i style={{ backgroundColor: visualColorHex(preset) }} /><span>{colorLabels[preset]}</span></button>)}
      <label className="homepage-custom-color"><span>選擇自訂顏色</span><input type="color" aria-label={`${label}：自訂顏色`} value={visualColorHex(value ?? "ink")} onChange={(event) => onChange(resolveVisualColor(event.currentTarget.value, "ink"))} /></label>
    </div>
    {allowInherit ? <button type="button" className="cms-secondary-button" disabled={value === undefined} onClick={() => onChange(undefined)}>沿用目前設計</button> : null}
  </fieldset>;
}

export function HomepagePresentationEditor({ sectionKey }: { sectionKey: HomepagePresentationKey }) {
  const context = useContext(PresentationContext);
  if (!context) return null;
  return <SectionPresentationEditor sectionKey={sectionKey} context={context} />;
}

function SectionPresentationEditor({ sectionKey, context }: { sectionKey: HomepagePresentationKey; context: PresentationContextValue }) {
  const { presentation, onEdit, reportIssue, issues } = context;
  const base = presentation?.sections?.[sectionKey]?.base;
  const slots = HOMEPAGE_SECTION_CAPABILITIES[sectionKey];
  const [choosingColor, setChoosingColor] = useState(false);
  const background = base?.background;
  const mode = choosingColor ? "color" : background?.mode === "none" || background?.mode === "color" ? background.mode : "";
  const needsColor = mode === "color" && background?.color === undefined;
  const backgroundIssue = `${sectionKey}.background`;
  useEffect(() => { reportIssue(backgroundIssue, needsColor ? "請選擇背景顏色。" : undefined); return () => reportIssue(backgroundIssue); }, [backgroundIssue, needsColor, reportIssue]);
  const edit = (value: HomepageBasePresentationEdit) => onEdit(sectionKey, value);
  const number = (field: NumericField, slot?: HomepageTextSlot) => <NumberField key={field} field={field} issueId={`${sectionKey}.${slot ?? "layout"}.${field}`} reportIssue={reportIssue}
    value={slot ? base?.text?.[slot]?.[field as "fontSizePx" | "lineHeight" | "letterSpacingEm" | "maxWidthCh"] : base?.layout?.[field as "contentMaxWidthPx" | "paddingTopPx" | "paddingBottomPx"]}
    onChange={(value) => slot ? edit({ group: "text", slot, field: field as "fontSizePx" | "lineHeight" | "letterSpacingEm" | "maxWidthCh", value }) : edit({ group: "layout", field: field as "contentMaxWidthPx" | "paddingTopPx" | "paddingBottomPx", value })} />;
  const hasIssue = Object.keys(issues).some((key) => key.startsWith(`${sectionKey}.`));
  return <details className="cms-panel cms-collapsible homepage-base-presentation">
    <summary><div><h3>呈現設定</h3><p>{hasIssue ? "請完成輸入後再儲存" : base && Object.keys(base).some((key) => key !== "animation") ? "已自訂共用樣式" : "沿用目前設計"}</p></div><span>展開／收合</span></summary>
    <div className="cms-panel-body">
      <h3>Desktop / 共用設定</h3><p className="cms-help">桌機與手機共用；未自訂的欄位沿用目前設計。修改後按「儲存全部」套用。</p>
      <h4>基本設定</h4>
      <label style={{ display: "grid", gap: 7 }}>共用顯示狀態<select style={selectStyle} value={base?.visible === undefined ? "inherit" : base.visible ? "show" : "hide"} onChange={(event) => edit({ group: "visible", value: event.currentTarget.value === "inherit" ? undefined : event.currentTarget.value === "show" })}>
        <option value="inherit">沿用區塊設定</option><option value="show">顯示</option><option value="hide">隱藏</option>
      </select></label><p className="cms-help">這是版面顯示設定；上方的區塊啟用開關仍是總開關。</p>
      <h4>文字樣式</h4>
      <div style={{ display: "grid", gap: 10 }}>{slots.map((slot) => {
        const text = base?.text?.[slot];
        return <details className="cms-item-card" key={slot}>
          <summary style={{ cursor: "pointer" }}><strong>{HOMEPAGE_TEXT_SLOT_LABELS[slot]}</strong> · {text && Object.keys(text).length ? "已自訂" : "沿用目前設計"}</summary>
          <div className="cms-grid two" style={{ marginTop: 16, alignItems: "start" }}>
            {number("fontSizePx", slot)}
            <label>字重<select style={selectStyle} value={text?.fontWeight ?? ""} onChange={(event) => edit({ group: "text", slot, field: "fontWeight", value: event.currentTarget.value || undefined })}><option value="">沿用目前設計</option>{VISUAL_WEIGHT_PRESETS.map((weight) => <option key={weight} value={weight}>{weightLabels[weight]}</option>)}</select></label>
            <label>對齊<select style={selectStyle} value={text?.alignment ?? ""} onChange={(event) => edit({ group: "text", slot, field: "alignment", value: event.currentTarget.value || undefined })}><option value="">沿用目前設計</option>{VISUAL_ALIGNMENT_PRESETS.map((alignment) => <option key={alignment} value={alignment}>{alignmentLabels[alignment]}</option>)}</select></label>
          </div>
          <ColorField label="文字顏色" value={text?.color} onChange={(value) => edit({ group: "text", slot, field: "color", value })} />
          <details className="cms-item-card"><summary>更多文字設定</summary><div className="cms-grid two">{number("lineHeight", slot)}{number("letterSpacingEm", slot)}{number("maxWidthCh", slot)}</div><p className="cms-help">最大文字寬度只限制這段文字的閱讀寬度，不影響整個區塊。</p></details>
        </details>;
      })}</div>
      <details className="cms-item-card" style={{ marginTop: 16 }}><summary>版面與留白</summary><div className="cms-grid two">{number("contentMaxWidthPx")}{number("paddingTopPx")}{number("paddingBottomPx")}</div><p className="cms-help">內容最大寬度限制文字與主要內容；不會裁切滿版背景。</p></details>
      <details className="cms-item-card" style={{ marginTop: 16 }}><summary>背景</summary>
        <label style={{ display: "grid", gap: 7 }}>背景設定<select style={selectStyle} value={mode} onChange={(event) => {
          const next = event.currentTarget.value;
          setChoosingColor(next === "color");
          if (next !== "color") { reportIssue(backgroundIssue); edit({ group: "background", value: next === "none" ? { mode: "none" } : undefined }); }
        }}><option value="">沿用目前設計</option><option value="none">無背景</option><option value="color">背景顏色</option></select></label>
        {mode === "color" ? <ColorField label="背景顏色" value={background?.color} allowInherit={false} onChange={(color) => { if (color !== undefined) { setChoosingColor(false); reportIssue(backgroundIssue); edit({ group: "background", value: { mode: "color", color } }); } }} /> : null}
      </details>
    </div>
  </details>;
}
