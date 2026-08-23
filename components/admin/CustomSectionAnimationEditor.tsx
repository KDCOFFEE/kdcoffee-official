"use client";

import {
  PRODUCT_ANIMATION_EFFECTS,
  PRODUCT_ANIMATION_THRESHOLDS,
  PRODUCT_ANIMATION_TRIGGERS,
  normalizeProductSectionAnimation,
  type ProductSectionAnimationConfig,
} from "@/lib/productPageAnimations";
import type { ProductCustomSection } from "@/lib/productCustomSections";
import {
  customSectionAnimationEffectLabels,
  customSectionAnimationThresholdLabels,
  customSectionAnimationTriggerLabels,
} from "./productCustomSectionAdminLabels";

export default function CustomSectionAnimationEditor({ section, onChange }: { section: ProductCustomSection; onChange: (next: ProductCustomSection) => void }) {
  const animation = normalizeProductSectionAnimation(section.animation);
  const update = (change: Partial<ProductSectionAnimationConfig>) => onChange({ ...section, animation: { ...animation, ...change, children: undefined } });
  return <fieldset className="custom-section-editor-group"><legend>Section 進場動畫</legend>
    <label className="custom-section-check"><input type="checkbox" checked={animation.enabled === true} onChange={(event) => update({ enabled: event.target.checked })} />啟用進場動畫</label>
    <label>動畫效果<select value={animation.effect} onChange={(event) => update({ effect: event.target.value as ProductSectionAnimationConfig["effect"] })}>{PRODUCT_ANIMATION_EFFECTS.map((effect) => <option key={effect} value={effect}>{customSectionAnimationEffectLabels[effect]}</option>)}</select></label>
    <label>觸發方式<select value={animation.trigger} onChange={(event) => update({ trigger: event.target.value as ProductSectionAnimationConfig["trigger"] })}>{PRODUCT_ANIMATION_TRIGGERS.map((trigger) => <option key={trigger} value={trigger}>{customSectionAnimationTriggerLabels[trigger]}</option>)}</select></label>
    <label>動畫時間（毫秒）<input type="number" min="200" max="1500" step="100" value={animation.durationMs} onChange={(event) => update({ durationMs: Number(event.target.value) })} /><small>數字越大，動畫越慢。</small></label>
    <label>延遲時間（毫秒）<input type="number" min="0" max="2000" step="100" value={animation.delayMs} onChange={(event) => update({ delayMs: Number(event.target.value) })} /><small>進入畫面後，等待多久才開始動畫。</small></label>
    {animation.trigger === "viewport" ? <label>進入畫面比例<select value={animation.threshold} onChange={(event) => update({ threshold: event.target.value as ProductSectionAnimationConfig["threshold"] })}>{PRODUCT_ANIMATION_THRESHOLDS.map((threshold) => <option key={threshold} value={threshold}>{customSectionAnimationThresholdLabels[threshold]}</option>)}</select></label> : null}
    <label>播放方式<select value={animation.once === false ? "repeat" : "once"} onChange={(event) => update({ once: event.target.value !== "repeat" })}><option value="once">只播放一次</option><option value="repeat">每次重新進入</option></select></label>
  </fieldset>;
}
