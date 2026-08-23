import {
  PRODUCT_CUSTOM_SECTION_MAX_COUNT,
  createProductCustomFeatureId,
  createProductCustomSectionId,
  type ProductCustomSection,
  type ProductCustomSectionType,
} from "./productCustomSections";
import { parseYouTubeUrl } from "./youtubeMedia";

export function isYouTubeAdminActionReady(url: string, title: string) {
  if (!title.trim()) return false;
  try {
    parseYouTubeUrl(url);
    return true;
  } catch {
    return false;
  }
}

export function createAdminCustomSectionDraft({
  type,
  sections,
  createSectionId = createProductCustomSectionId,
  createFeatureId = createProductCustomFeatureId,
}: {
  type: ProductCustomSectionType;
  sections: readonly ProductCustomSection[];
  createSectionId?: () => string;
  createFeatureId?: () => string;
}): ProductCustomSection {
  if (sections.length >= PRODUCT_CUSTOM_SECTION_MAX_COUNT) {
    throw new Error(`已達 ${PRODUCT_CUSTOM_SECTION_MAX_COUNT} 個 Section 上限。`);
  }
  const order = Math.min(1000, Math.max(0, ...sections.filter((section) => section.placement === "page_bottom").map((section) => section.order)) + 10);
  const base = { id: createSectionId(), enabled: false, placement: "page_bottom" as const, order };
  return type === "text"
    ? { ...base, type: "text", adminName: "新純文案 Section", layout: "standard", content: { heading: "新自訂 Section" } }
    : { ...base, type: "features", adminName: "新重點特色 Section", layout: "grid", content: { heading: "重點特色", items: [{ id: createFeatureId(), title: "新特色", body: "請輸入特色內容。" }] } };
}
