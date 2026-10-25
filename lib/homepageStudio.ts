import { HOMEPAGE_PRESENTATION_SECTION_KEYS } from "./homepagePresentation";

export const HOMEPAGE_STUDIO_AREAS = [
  { key: "hero", label: "主視覺", target: "top", roots: ["hero"] },
  { key: "campaignSection", label: "本月活動", target: "monthly-campaign", roots: ["campaignSection", "campaigns"] },
  { key: "home002", label: "品牌價值", target: "home002", roots: ["home002"] },
  { key: "home003", label: "咖啡時刻", target: "home003", roots: ["home003"] },
  { key: "home004", label: "推薦作品", target: "home004", roots: ["home004"] },
  { key: "home005", label: "咖啡製程", target: "home005", roots: ["home005"] },
  { key: "home006", label: "專屬烘焙", target: "home006", roots: ["home006"] },
  { key: "home007", label: "咖啡藝術", target: "home007", roots: ["home007"] },
  { key: "home008", label: "真實工作室", target: "home008", roots: ["home008"] },
  { key: "home009", label: "真實評價", target: "home009", roots: ["home009"] },
  { key: "home010", label: "最後購買引導", target: "home010", roots: ["home010"] },
  { key: "sections", label: "區塊排序", target: "", roots: ["sectionOrder"] },
  { key: "navigation", label: "頁首導覽", target: "", roots: ["navigation"] },
  { key: "visual", label: "全站首頁色彩", target: "", roots: ["visual"] },
  { key: "seo", label: "搜尋與分享", target: "", roots: ["seo"] },
] as const;
export type HomepageStudioArea = typeof HOMEPAGE_STUDIO_AREAS[number]["key"];
export type HomepageStudioDevice = "desktop" | "mobile";

/** JSON CMS values compare by content, including messages with reordered keys. */
export function homepageDraftSnapshot(homepage: unknown): string {
  return JSON.stringify(homepage, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
}

/** All draft state stays in the editor. These helpers never perform I/O. */
export function homepageAreaSnapshot(homepage: Record<string, unknown>, area: HomepageStudioArea) {
  const definition = HOMEPAGE_STUDIO_AREAS.find(item => item.key === area)!;
  const presentation = homepage.presentation as { sections?: Record<string, unknown> } | undefined;
  return JSON.stringify([definition.roots.map(key => homepage[key]), presentation?.sections?.[area]]);
}
export function isHomepagePresentationArea(key: string): key is typeof HOMEPAGE_PRESENTATION_SECTION_KEYS[number] {
  return (HOMEPAGE_PRESENTATION_SECTION_KEYS as readonly string[]).includes(key);
}
