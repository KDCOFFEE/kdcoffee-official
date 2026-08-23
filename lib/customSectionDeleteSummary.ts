import type { ProductCustomSection } from "./productCustomSections";

export type ProductCustomSectionDeleteSummary = {
  contentItems: string[];
  hasCloudinaryMedia: boolean;
  isEditoriallyEmpty: boolean;
};

function hasText(value: unknown) {
  return typeof value === "string" && Boolean(value.trim());
}

export function summarizeProductCustomSectionForDelete(section: ProductCustomSection): ProductCustomSectionDeleteSummary {
  const contentItems: string[] = [];
  let hasEditorialContent = false;

  if (section.type === "text") {
    hasEditorialContent = [section.content.eyebrow, section.content.heading, section.content.body].some(hasText);
    if (hasEditorialContent) contentItems.push("標題與文案");
  } else if (section.content.items.length) {
    hasEditorialContent = true;
    contentItems.push(`${section.content.items.length} 個特色項目`);
  }

  const media = section.media;
  if (media?.provider === "youtube") contentItems.push("1 個 YouTube 影片");
  if (media?.provider === "cloudinary") contentItems.push(media.asset.type === "image" ? "1 張圖片" : "1 支影片");
  contentItems.push("已設定版位");
  if (section.animation?.enabled) contentItems.push("已設定動畫");

  return {
    contentItems,
    hasCloudinaryMedia: media?.provider === "cloudinary",
    isEditoriallyEmpty: !hasEditorialContent && !media,
  };
}

export function removeProductCustomSectionLocally(sections: readonly ProductCustomSection[], sectionId: string) {
  return sections.filter((section) => section.id !== sectionId);
}
