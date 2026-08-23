/* eslint-disable @typescript-eslint/no-explicit-any */
import { resolveProductPageContent } from "@/lib/productPageContent";
import type { ProductSectionKey } from "@/lib/productPageSections";

const sectionNames: Record<ProductSectionKey, string> = {
  "product-hero": "商品主視覺與作品識別",
  "select-your-coffee": "選擇咖啡",
  "flavor-notes": "風味筆記",
  "coffee-profile": "咖啡資料",
  "clean-roasting": "乾淨的烘焙",
  campaigns: "最新活動",
  "related-products": "推薦比較作品",
  "before-you-order": "購買前須知",
};

export function productSectionChineseName(sectionKey: ProductSectionKey) {
  return sectionNames[sectionKey];
}

export default function ProductPageContentPreview({ product, sectionKey }: { product: Record<string, any>; sectionKey: ProductSectionKey }) {
  const resolved = resolveProductPageContent(product);
  let heading = "";
  let preview = "";

  if (sectionKey === "product-hero") {
    heading = resolved[sectionKey].title;
    preview = [resolved[sectionKey].artist, resolved[sectionKey].lead].filter(Boolean).join("｜");
  } else if (sectionKey === "select-your-coffee") {
    heading = resolved[sectionKey].eyebrow;
    preview = resolved[sectionKey].description || "商品規格、數量與購買控制使用系統規則";
  } else if (sectionKey === "flavor-notes") {
    heading = resolved[sectionKey].heading;
    preview = resolved[sectionKey].flavors.join("、") || "尚未設定風味";
  } else if (sectionKey === "coffee-profile") {
    heading = resolved[sectionKey].heading;
    preview = [product.origin, product.process, product.roast].filter(Boolean).join("｜");
  } else if (sectionKey === "clean-roasting") {
    heading = resolved[sectionKey].heading;
    preview = resolved[sectionKey].proofs.map((proof) => `${proof.title}｜${proof.body}`).join("　");
  } else if (sectionKey === "campaigns") {
    heading = resolved[sectionKey].heading;
    preview = resolved[sectionKey].description || "活動內容引用首頁的共享活動資料";
  } else if (sectionKey === "related-products") {
    heading = resolved[sectionKey].heading;
    preview = resolved[sectionKey].description || "商品名稱、風味、價格與圖片來自被引用商品";
  } else {
    heading = resolved[sectionKey].heading;
    preview = resolved[sectionKey].description || resolved[sectionKey].lockedFaqs[0]?.question || "";
  }

  return <div className="product-page-content-preview">
    <strong>{heading}</strong>
    <span>{preview}</span>
    <small>{resolved.raw[sectionKey] ? "目前使用：商品覆寫" : "目前使用：既有商品資料／全站預設"}</small>
  </div>;
}
