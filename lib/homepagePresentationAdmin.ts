// @ts-expect-error -- explicit extensions support the Node regression runner.
import { validateHomepagePresentation } from "./homepageCms.ts";
// @ts-expect-error -- explicit extensions support the Node regression runner.
import { HOMEPAGE_PRESENTATION_SECTION_KEYS, HOMEPAGE_SECTION_CAPABILITIES } from "./homepagePresentation.ts";
import type { HomepagePresentationKey, HomepagePresentationPatch, HomepagePresentationV3, HomepageTextPresentation, HomepageTextSlot } from "./homepagePresentation.ts";

type Layout = NonNullable<HomepagePresentationPatch["layout"]>;
export type HomepageBasePresentationEdit =
  | { group: "text"; slot: HomepageTextSlot; field: keyof HomepageTextPresentation; value: unknown }
  | { group: "layout"; field: keyof Layout; value: unknown }
  | { group: "background"; value: HomepagePresentationPatch["background"] }
  | { group: "visible"; value: boolean | undefined }
  | { group: "animation"; field: keyof NonNullable<HomepagePresentationPatch["animation"]>; value: unknown };

const textFields = ["fontSizePx", "fontWeight", "color", "lineHeight", "letterSpacingEm", "alignment", "maxWidthCh"] as const;
const layoutFields = ["contentMaxWidthPx", "paddingTopPx", "paddingBottomPx"] as const;

// Clone only the edited path. Deletion prunes only its empty ancestors, leaving
// unrelated sections, Mobile data, presets and existing animation untouched.
function editPath(current: Record<string, unknown> | undefined, path: readonly string[], value: unknown): Record<string, unknown> | undefined {
  const [key, ...rest] = path;
  const next = { ...current };
  const child = rest.length ? editPath(current?.[key] as Record<string, unknown> | undefined, rest, value) : value;
  if (child === undefined) delete next[key]; else next[key] = child;
  return Object.keys(next).length ? next : undefined;
}

/** Event-only Base mutation. Rendering the editor never calls this function.
 * undefined means delete; false and zero are real values. Existing validation
 * owns numeric/enum/color safety; this helper additionally enforces capabilities
 * and requires a color when the owner selects a colored background.
 */
export function updateHomepageBasePresentation<T extends { presentation?: HomepagePresentationV3 }>(homepage: T, sectionKey: HomepagePresentationKey, edit: HomepageBasePresentationEdit): T {
  if (!(HOMEPAGE_PRESENTATION_SECTION_KEYS as readonly string[]).includes(sectionKey)) throw new Error("不支援的首頁區塊。");
  validateHomepagePresentation(homepage.presentation);
  let path: string[];
  let value: unknown = edit.value;
  switch (edit.group) {
    case "text":
      if (!(HOMEPAGE_SECTION_CAPABILITIES[sectionKey] as readonly string[]).includes(edit.slot) || !(textFields as readonly string[]).includes(edit.field)) throw new Error("這個區塊不支援此文字設定。");
      path = ["text", edit.slot, edit.field];
      break;
    case "layout":
      if (!(layoutFields as readonly string[]).includes(edit.field)) throw new Error("不支援的留白設定。");
      path = ["layout", edit.field];
      break;
    case "background":
      path = ["background"];
      if (edit.value?.mode === "legacy") value = undefined;
      else if (edit.value !== undefined && (edit.value.mode !== "none" && edit.value.mode !== "color" || edit.value.mode === "color" && edit.value.color === undefined)) throw new Error("請先選擇有效的背景顏色。");
      break;
    case "visible": path = ["visible"]; break;
    case "animation":
      if (sectionKey === "hero" || !["enabled", "preset", "delayMs", "durationMs", "distancePx", "staggerMs"].includes(edit.field)) throw new Error("這個區塊不支援此動畫參數。");
      path = ["animation", edit.field]; break;
    default: throw new Error("不支援的首頁呈現設定。");
  }
  const presentation = editPath(homepage.presentation as Record<string, unknown> | undefined, ["sections", sectionKey, "base", ...path], value);
  // schemaVersion alone carries no owner setting. Remove the root after the
  // last setting is reset, but preserve sections with presets/Mobile/animation.
  const nextPresentation = presentation?.sections === undefined ? undefined : { ...presentation, schemaVersion: 3 };
  validateHomepagePresentation(nextPresentation);
  if (JSON.stringify(homepage.presentation) === JSON.stringify(nextPresentation)) return homepage;
  const next = { ...homepage };
  if (nextPresentation === undefined) delete next.presentation; else next.presentation = nextPresentation;
  return next;
}

// Mobile editing reuses Base leaf/capability validation against an isolated
// patch, then writes only the Mobile branch of the original Homepage.
function hasSettings(value: unknown): boolean {
  if (value === undefined) return false;
  return value !== null && typeof value === "object"
    ? Object.values(value).some(hasSettings) : true;
}

function writeMobile<T extends { presentation?: HomepagePresentationV3 }>(
  homepage: T, sectionKey: HomepagePresentationKey,
  mobile: NonNullable<NonNullable<HomepagePresentationV3["sections"]>[HomepagePresentationKey]>["mobile"],
): T {
  const presentation = editPath(homepage.presentation as Record<string, unknown> | undefined, ["sections", sectionKey, "mobile"], mobile);
  const nextPresentation = presentation?.sections === undefined ? undefined : { ...presentation, schemaVersion: 3 };
  validateHomepagePresentation(nextPresentation);
  if (JSON.stringify(homepage.presentation) === JSON.stringify(nextPresentation)) return homepage;
  const next = { ...homepage };
  if (nextPresentation === undefined) delete next.presentation; else next.presentation = nextPresentation;
  return next;
}

function validateMobileInput(homepage: { presentation?: HomepagePresentationV3 }, sectionKey: HomepagePresentationKey) {
  if (!(HOMEPAGE_PRESENTATION_SECTION_KEYS as readonly string[]).includes(sectionKey)) throw new Error("不支援的首頁區塊。");
  validateHomepagePresentation(homepage.presentation);
}

/** OFF preserves stored values. Empty OFF states carry no owner setting. */
export function updateHomepageMobileEnabled<T extends { presentation?: HomepagePresentationV3 }>(homepage: T, sectionKey: HomepagePresentationKey, enabled: boolean): T {
  validateMobileInput(homepage, sectionKey);
  if (typeof enabled !== "boolean") throw new Error("手機自訂開關必須為布林值。");
  const previous = homepage.presentation?.sections?.[sectionKey]?.mobile;
  const mobile = enabled ? { ...previous, overrideEnabled: true }
    : hasSettings(previous?.overrides) ? { ...previous, overrideEnabled: false } : undefined;
  return writeMobile(homepage, sectionKey, mobile);
}

/** New edits enable a missing Mobile branch; edits to an existing disabled
 * draft keep it disabled. Reset never enables Mobile or copies Base values. */
export function updateHomepageMobilePresentation<T extends { presentation?: HomepagePresentationV3 }>(homepage: T, sectionKey: HomepagePresentationKey, edit: HomepageBasePresentationEdit): T {
  validateMobileInput(homepage, sectionKey);
  const previous = homepage.presentation?.sections?.[sectionKey]?.mobile;
  const isolated: { presentation?: HomepagePresentationV3 } = previous?.overrides === undefined ? {} : {
    presentation: { schemaVersion: 3, sections: { [sectionKey]: { base: previous.overrides } } },
  };
  const patched = updateHomepageBasePresentation(isolated, sectionKey, edit);
  const overrides = patched.presentation?.sections?.[sectionKey]?.base;
  const hasOverrides = hasSettings(overrides);
  const overrideEnabled = previous?.overrideEnabled ?? hasOverrides;
  const mobile = overrideEnabled || hasOverrides
    ? { overrideEnabled, ...(hasOverrides ? { overrides } : {}) } : undefined;
  return writeMobile(homepage, sectionKey, mobile);
}
