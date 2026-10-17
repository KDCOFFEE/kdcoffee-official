import type { CSSProperties } from "react";
// @ts-expect-error -- explicit extensions support Node's type-stripping test runner.
import { validateHomepagePresentation } from "./homepageCms.ts";
// @ts-expect-error -- explicit extensions support Node's type-stripping test runner.
import { HOMEPAGE_SECTION_CAPABILITIES, resolveHomepageSectionPresentation } from "./homepagePresentation.ts";
import type { HomepagePresentationKey, HomepagePresentationPatch, HomepageTextSlot } from "./homepagePresentation.ts";
// @ts-expect-error -- explicit extensions support Node's type-stripping test runner.
import { resolveVisualColor, visualColorHex } from "./pageBuilderVisualStyle.ts";

type Viewport = "base" | "mobile";
type BindingStyle = CSSProperties & Partial<Record<`--homepage-${string}-${Viewport}`, string | number>>;
type BindingProps = { style?: CSSProperties } & Partial<Record<`data-homepage-${"text" | "section" | "content"}-${Viewport}`, string>>;
const weights = { light: 400, regular: 500, semibold: 600, bold: 700 } as const;
const fields = {
  text: ["font-size", "font-weight", "color", "line-height", "letter-spacing", "alignment", "max-width"],
  section: ["padding-top", "padding-bottom", "background", "visibility"],
  content: ["width"],
} as const;

export function mergeHomepageStyles(...styles: Array<CSSProperties | undefined>): CSSProperties | undefined {
  const defined = styles.filter((style) => style !== undefined);
  return defined.length ? Object.assign({}, ...defined) : undefined;
}

/** Own-property tokens activate only explicit fields. Absent fields leave every
 * legacy responsive declaration in charge; no viewport-specific SSR markup.
 */
export function homepagePresentationProps(style?: CSSProperties) {
  const props: BindingProps = style === undefined ? {} : { style };
  for (const viewport of ["base", "mobile"] as const) {
    for (const group of ["text", "section", "content"] as const) {
      const explicit = fields[group].filter((field) => Object.hasOwn(style ?? {}, `--homepage-${group}-${field}-${viewport}`));
      if (explicit.length) props[`data-homepage-${group}-${viewport}`] = explicit.join(" ");
    }
  }
  return props;
}

const definedStyle = (style: BindingStyle) => Object.keys(style).length ? style : undefined;

/** Background is a mode/color pair, not a numeric leaf. "legacy" is inert, as
 * in Base bindings and the Admin reset. Partial persisted patches may inherit
 * the other member from Base, but never copy inherited colors to Mobile vars.
 * An incomplete color mode without a usable color remains inert.
 */
function backgroundValue(patch: HomepagePresentationPatch | undefined, base?: HomepagePresentationPatch): string | undefined {
  const background = patch?.background;
  if (background === undefined || background.mode === "legacy") return undefined;
  const mode = background.mode ?? base?.background?.mode;
  if (mode === "none") return background.mode === "none" ? "transparent" : undefined;
  if (mode !== "color") return undefined;
  if (background.color !== undefined) return visualColorHex(resolveVisualColor(background.color, "ink"));
  if (background.mode === "color" && base?.background?.color !== undefined) return "var(--homepage-section-background-color-base)";
  return undefined;
}

/** Validate once; Desktop/Base resolution is retained. Mobile comes ONLY from
 * enabled, raw sparse overrides, never the logically merged Mobile resolver.
 * Animation and preset expansion are deliberately not serialized.
 */
export function createHomepagePresentationBindings(presentation: unknown) {
  validateHomepagePresentation(presentation);
  return (sectionKey: HomepagePresentationKey) => {
    const base = resolveHomepageSectionPresentation(presentation, sectionKey, "desktop");
    const stored = presentation?.sections?.[sectionKey];
    const mobile = stored?.mobile?.overrideEnabled === true ? stored.mobile.overrides : undefined;
    const patches = [["base", base], ["mobile", mobile]] as const;
    const section: BindingStyle = {};
    // A mode-only Mobile patch can reuse an explicitly stored Base color even
    // when Base mode is none/legacy. Keep that color in a Base variable only.
    if (mobile?.background?.mode === "color" && mobile.background.color === undefined && base.background?.color !== undefined) {
      section["--homepage-section-background-color-base"] = visualColorHex(resolveVisualColor(base.background.color, "ink"));
    }
    for (const [viewport, patch] of patches) {
      if (patch?.layout?.paddingTopPx !== undefined) section[`--homepage-section-padding-top-${viewport}`] = `${patch.layout.paddingTopPx}px`;
      if (patch?.layout?.paddingBottomPx !== undefined) section[`--homepage-section-padding-bottom-${viewport}`] = `${patch.layout.paddingBottomPx}px`;
      const background = backgroundValue(patch, viewport === "mobile" ? base : undefined);
      if (background !== undefined) section[`--homepage-section-background-${viewport}`] = background;
      if (patch?.visible !== undefined) section[`--homepage-section-visibility-${viewport}`] = patch.visible ? "var(--homepage-visible-display, block)" : "none";
    }
    return {
      // Presentation visibility is CSS-only. Master/content gates remain in JSX.
      sectionStyle: definedStyle(section),
      contentStyle(existing?: CSSProperties): CSSProperties | undefined {
        const style: BindingStyle = {};
        for (const [viewport, patch] of patches) {
          if (patch?.layout?.contentMaxWidthPx !== undefined) style[`--homepage-content-width-${viewport}`] = `${patch.layout.contentMaxWidthPx}px`;
        }
        return Object.keys(style).length ? { ...existing, ...style } : existing;
      },
      textStyle(slot: HomepageTextSlot): CSSProperties | undefined {
        if (!(HOMEPAGE_SECTION_CAPABILITIES[sectionKey] as readonly HomepageTextSlot[]).includes(slot)) return undefined;
        const style: BindingStyle = {};
        for (const [viewport, patch] of patches) {
          const text = patch?.text?.[slot];
          if (text === undefined) continue;
          if (text.fontSizePx !== undefined) style[`--homepage-text-font-size-${viewport}`] = `${text.fontSizePx}px`;
          if (text.fontWeight !== undefined) style[`--homepage-text-font-weight-${viewport}`] = weights[text.fontWeight];
          if (text.color !== undefined) style[`--homepage-text-color-${viewport}`] = visualColorHex(resolveVisualColor(text.color, "ink"));
          if (text.lineHeight !== undefined) style[`--homepage-text-line-height-${viewport}`] = text.lineHeight;
          if (text.letterSpacingEm !== undefined) style[`--homepage-text-letter-spacing-${viewport}`] = `${text.letterSpacingEm}em`;
          if (text.alignment !== undefined) style[`--homepage-text-alignment-${viewport}`] = text.alignment;
          if (text.maxWidthCh !== undefined) style[`--homepage-text-max-width-${viewport}`] = `${text.maxWidthCh}ch`;
        }
        return definedStyle(style);
      },
    };
  };
}
