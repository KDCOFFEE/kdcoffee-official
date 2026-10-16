import type { CSSProperties } from "react";
// @ts-expect-error -- explicit extensions support Node's type-stripping test runner.
import { validateHomepagePresentation } from "./homepageCms.ts";
// @ts-expect-error -- explicit extensions support Node's type-stripping test runner.
import { HOMEPAGE_SECTION_CAPABILITIES, resolveHomepageSectionPresentation } from "./homepagePresentation.ts";
import type { HomepagePresentationKey, HomepageTextSlot } from "./homepagePresentation.ts";
// @ts-expect-error -- explicit extensions support Node's type-stripping test runner.
import { resolveVisualColor, visualColorHex } from "./pageBuilderVisualStyle.ts";

type BindingStyle = CSSProperties & Partial<Record<`--homepage-${string}-base`, string | number>>;
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

/** Data tokens activate only explicitly supplied fields. Legacy declarations,
 * including every responsive fallback, remain in charge when a token is absent.
 * H3.4 can emit matching Mobile variables/tokens and add media-query consumers;
 * neither viewport branching nor new semantic targets will be needed.
 */
export function homepagePresentationProps(style?: CSSProperties) {
  const props: { style?: CSSProperties; "data-homepage-text-base"?: string; "data-homepage-section-base"?: string; "data-homepage-content-base"?: string } = style === undefined ? {} : { style };
  for (const group of ["text", "section", "content"] as const) {
    const explicit = fields[group].filter((field) => Object.hasOwn(style ?? {}, `--homepage-${group}-${field}-base`));
    if (explicit.length) props[`data-homepage-${group}-base`] = explicit.join(" ");
  }
  return props;
}

/** Validate once per renderer entry; resolve only Desktop/Base. All presentation
 * leaves become custom properties, never inline CSS property overrides.
 * Mobile overrides, animation and preset expansion remain inactive.
 */
export function createHomepagePresentationBindings(presentation: unknown) {
  validateHomepagePresentation(presentation);
  return (sectionKey: HomepagePresentationKey) => {
    const resolved = resolveHomepageSectionPresentation(presentation, sectionKey, "desktop");
    const section: BindingStyle = {};
    if (resolved.layout?.paddingTopPx !== undefined) section["--homepage-section-padding-top-base"] = `${resolved.layout.paddingTopPx}px`;
    if (resolved.layout?.paddingBottomPx !== undefined) section["--homepage-section-padding-bottom-base"] = `${resolved.layout.paddingBottomPx}px`;
    if (resolved.background?.mode === "none") section["--homepage-section-background-base"] = "transparent";
    if (resolved.background?.mode === "color" && resolved.background.color !== undefined) {
      section["--homepage-section-background-base"] = visualColorHex(resolveVisualColor(resolved.background.color, "ink"));
    }
    if (resolved.visible !== undefined) section["--homepage-section-visibility-base"] = resolved.visible ? "var(--homepage-visible-display, block)" : "none";
    const contentMaxWidthPx = resolved.layout?.contentMaxWidthPx;
    return {
      // Presentation visibility is CSS-only. Master/content gates remain in JSX.
      sectionStyle: Object.keys(section).length ? section : undefined,
      contentStyle(existing?: CSSProperties): CSSProperties | undefined {
        if (contentMaxWidthPx === undefined) return existing;
        return { ...existing, "--homepage-content-width-base": `${contentMaxWidthPx}px` } as BindingStyle;
      },
      textStyle(slot: HomepageTextSlot): CSSProperties | undefined {
        if (!(HOMEPAGE_SECTION_CAPABILITIES[sectionKey] as readonly HomepageTextSlot[]).includes(slot)) return undefined;
        const text = resolved.text?.[slot];
        if (text === undefined) return undefined;
        const style: BindingStyle = {};
        if (text.fontSizePx !== undefined) style["--homepage-text-font-size-base"] = `${text.fontSizePx}px`;
        if (text.fontWeight !== undefined) style["--homepage-text-font-weight-base"] = weights[text.fontWeight];
        if (text.color !== undefined) style["--homepage-text-color-base"] = visualColorHex(resolveVisualColor(text.color, "ink"));
        if (text.lineHeight !== undefined) style["--homepage-text-line-height-base"] = text.lineHeight;
        if (text.letterSpacingEm !== undefined) style["--homepage-text-letter-spacing-base"] = `${text.letterSpacingEm}em`;
        if (text.alignment !== undefined) style["--homepage-text-alignment-base"] = text.alignment;
        if (text.maxWidthCh !== undefined) style["--homepage-text-max-width-base"] = `${text.maxWidthCh}ch`;
        return Object.keys(style).length ? style : undefined;
      },
    };
  };
}
