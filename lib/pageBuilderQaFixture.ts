import type { PageBuilderSection, PageDraft } from "./pageBuilder";

const motion = { enabled: true, preset: "fade-up" as const, delayMs: 0, durationMs: 850, distancePx: 22, staggerMs: 110 };
const landscapeVideo = {
  type: "video" as const,
  url: "https://res.cloudinary.com/sd4wjx7m/video/upload/c_limit,q_auto,vc_h264:high:4.0,w_1920/v1/kd-coffee/videos/1919f85e-9ae5-4c7c-ba02-fdfed97b5922.mp4?_a=BAMAAAcg0",
  provider: "cloudinary" as const,
  publicId: "kd-coffee/videos/1919f85e-9ae5-4c7c-ba02-fdfed97b5922",
  posterUrl: "https://res.cloudinary.com/sd4wjx7m/video/upload/c_limit,f_auto,q_auto,w_1600/v1/kd-coffee/videos/1919f85e-9ae5-4c7c-ba02-fdfed97b5922.jpg?_a=BAMAAAcg0",
  width: 1920,
  height: 1080,
};

const sections: PageBuilderSection[] = [
  {
    id: "qa-hero-campaign", type: "hero", enabled: true, eyebrow: "KD COFFEE · SEASONAL EDITION", title: "今年中秋，", headlineLine2: "送一盒真正用心烘焙的咖啡。", body: "月光照亮相聚的餐桌，也照亮一份被仔細挑選的心意。我們以三款風味清晰的咖啡作品，為今年中秋準備一盒值得慢慢分享的禮物。", theme: "dark", layout: "media-left", presentation: "hero-cinematic", motion,
    ctas: [{ id: "qa-hero-cta-primary", enabled: true, label: "探索本季作品", stylePreset: "primary", link: { type: "internal", target: "works" } }, { id: "qa-hero-cta-secondary", enabled: true, label: "閱讀品牌理念", stylePreset: "text", link: { type: "section", target: "home007" } }],
    media: [{ id: "qa-hero-media-main", enabled: true, media: landscapeVideo, alt: "咖啡沖煮與光影交織的季節形象", title: "SUMMER AWAKENING / 2026" }], items: [], products: [],
  },
  {
    id: "qa-story-curation", type: "mediaText", enabled: true, eyebrow: "01 · THE CURATION", title: "一幅畫，一方風土，一杯有記憶的咖啡", body: "KD Coffee 從藝術作品出發，沿著色彩、筆觸與時代氣息尋找對應的產區風味。每一次烘焙，都在明亮與厚度之間保留作品真正的個性。", theme: "warm", layout: "media-right", presentation: "story-offset", motion,
    ctas: [{ id: "qa-story-cta-more", enabled: true, label: "認識我們的選豆方式", stylePreset: "text", link: { type: "section", target: "home007" } }],
    media: [{ id: "qa-story-media-portrait", enabled: true, media: { type: "image", url: "/uploads/artworks/davinci-feast/kdcoffee-davinci-feast-artwork-cover-v01.webp", provider: "local", width: 1200, height: 1600 }, alt: "達文西盛宴咖啡藝術作品包裝", title: "DA VINCI FEAST" }], items: [], products: [],
  },
  {
    id: "qa-gallery-process", type: "gallery", enabled: true, eyebrow: "02 · FROM BEAN TO ARTWORK", title: "風味成形的片刻", body: "產地、火候與時間在工作室交會。橫幅影像承接敘事，直幅細節保留手作的呼吸。", theme: "media", layout: "filmstrip", presentation: "gallery-feature", motion, ctas: [], items: [], products: [],
    media: [
      { id: "qa-gallery-media-one", enabled: true, media: { type: "image", url: "/uploads/artworks/giotto-awakening/kdcoffee-giotto-awakening-hero-desktop-v01.webp", provider: "local", width: 1800, height: 1080 }, alt: "喬托覺醒咖啡作品橫幅", title: "ORIGIN" },
      { id: "qa-gallery-media-two", enabled: true, media: landscapeVideo, alt: "咖啡工作室製作過程", title: "ROASTING" },
      { id: "qa-gallery-media-three", enabled: true, media: { type: "image", url: "/uploads/artworks/davinci-feast/kdcoffee-davinci-feast-main-visual-v02.webp", provider: "local", width: 1600, height: 1200 }, alt: "達文西盛宴咖啡主視覺", title: "TASTING" },
    ],
  },
  {
    id: "qa-features-values", type: "features", enabled: true, eyebrow: "03 · OUR APPROACH", title: "不追求喧鬧，只留下清晰而深刻的味道", body: "從產地判讀到出杯，我們以三個原則守住每件咖啡作品的完整性。", theme: "warm", layout: "grid", presentation: "features-numbered", motion, ctas: [], media: [], products: [],
    items: [
      { id: "qa-feature-origin", enabled: true, title: "風土清晰", body: "以乾淨甜感為基準，讓產區的花香、果實與質地自然浮現。" },
      { id: "qa-feature-roast", enabled: true, title: "精準烘焙", body: "依照每批豆況調整曲線，在發展度與活力之間取得平衡。" },
      { id: "qa-feature-story", enabled: true, title: "藝術策展", body: "用熟悉的藝術語言建立風味入口，讓品飲成為可被記住的體驗。" },
    ],
  },
  {
    id: "qa-products-selection", type: "products", enabled: true, eyebrow: "04 · CURATED WORKS", title: "本季精選咖啡作品", body: "三種截然不同的風味性格，為清晨、午後與夜晚各留一杯。", theme: "media", layout: "grid", presentation: "products-featured", motion, ctas: [], media: [], items: [],
    products: [{ id: "qa-product-giotto", enabled: true, productSlug: "giotto-awakening" }, { id: "qa-product-davinci", enabled: true, productSlug: "davinci-feast" }, { id: "qa-product-monet", enabled: true, productSlug: "monet-floral" }],
  },
  {
    id: "qa-closing-contact", type: "cta", enabled: true, eyebrow: "VISIT · TASTE · TALK", title: "把下一段咖啡風景，帶回你的日常", body: "歡迎到高雄工作室試飲，或讓我們透過 LINE 為你挑選合適的咖啡作品。", theme: "dark", layout: "media-top", presentation: "cta-dark", motion, media: [], items: [], products: [],
    ctas: [{ id: "qa-closing-cta-works", enabled: true, label: "探索全部作品", stylePreset: "primary", link: { type: "internal", target: "works" } }, { id: "qa-closing-cta-line", enabled: true, label: "LINE 專人選豆", stylePreset: "secondary", link: { type: "line", url: "https://line.me/R/ti/p/@kdcoffee" } }, { id: "qa-closing-cta-phone", enabled: true, label: "電話聯絡", stylePreset: "text", link: { type: "telephone", url: "tel:+88677777777" } }],
  },
];

export const PAGE_BUILDER_QA_FIXTURE: PageDraft = { title: "H.2C9B.2 Mid-Autumn Campaign QA", seoTitle: "", seoDescription: "", sections };
