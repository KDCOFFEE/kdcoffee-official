// @ts-expect-error -- explicit extensions support the Node type-stripping runner.
import { resolveCmsLink } from "./cmsLinks.ts";
import type { CmsLinkRegistryInput, CmsLinkValue } from "./cmsLinks.ts";

/** Homepage CTA eligibility only. Never changes global CmsLink disabled-state
 * semantics. Legacy copy is allowed only for a truly absent label; configured
 * destinations are always required, with no invented href fallback.
 */
export function resolveHomepageCta(
  { label, href, enabled, legacyLabel }: { label?: unknown; href?: CmsLinkValue; enabled?: boolean; legacyLabel?: string },
  registry: CmsLinkRegistryInput = {},
) {
  const text = label === undefined ? legacyLabel : label;
  if (enabled === false || typeof text !== "string" || !text.trim()) return undefined;
  const link = resolveCmsLink(href, registry);
  if (!link.valid || !link.href) return undefined;
  return { label: text, value: href, href: link.href };
}
