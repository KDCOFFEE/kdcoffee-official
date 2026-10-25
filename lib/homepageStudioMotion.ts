import { resolveHomepageSectionPresentation, type HomepagePresentationV3, type HomepagePresentationViewport } from "./homepagePresentation";
import { resolveHomepageMotion, type HomepageMotionSectionKey } from "./homepageCms";
/** Sparse overlays parameterize the existing engine. Missing settings are inert. */
export function resolveHomepageStudioMotion(presentation: HomepagePresentationV3 | undefined, section: HomepageMotionSectionKey, legacy: unknown, device: HomepagePresentationViewport) {
  const animation = resolveHomepageSectionPresentation(presentation, section, device).animation;
  const original = resolveHomepageMotion(legacy, section);
  return animation ? resolveHomepageMotion({ ...original, ...animation }, section) : original;
}
