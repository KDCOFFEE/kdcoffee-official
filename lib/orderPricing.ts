import type { WebsiteData } from "../data/websiteData";
import { resolveSkuOption, validateSkuDemand } from "./orderStockValidation";

export type RequestedItem = {
  slug: string;
  optionId?: string;
  optionLabel: string;
  quotedUnitPrice: number;
  preparationLabel?: string;
  customRoast?: boolean;
  roastLevel?: string;
  roastNote?: string;
  quantity: number;
};

export class OrderPriceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderPriceConflictError";
  }
}

const ALLOWED_ROAST_LEVELS = ["淺焙", "淺中焙", "中焙", "中深焙"];

export function priceOrderFromWebsiteData(live: WebsiteData, items: RequestedItem[]) {
  if (!Array.isArray(items) || !items.length) throw new Error("購物車沒有商品");
  let subtotal = 0;
  const resolved = items.map((item) => {
    const product = live.menu.products.find((entry) => entry.slug === item.slug && entry.active !== false && entry.status !== "hidden");
    if (!product || product.purchasable === false || product.status === "sold_out") throw new Error("商品不存在、已下架或暫停供應");
    const source = Array.isArray(product.skus) && product.skus.length ? product.skus : product.purchase;
    const option = resolveSkuOption(Array.isArray(source) ? source : [], item.optionId, item.optionLabel);
    if (!option || option.enabled === false) throw new Error(`${product.name} 的規格目前無法供應`);
    const unitPrice = Math.max(0, Number(option.price) || 0);
    if (typeof item.quotedUnitPrice !== "number" || !Number.isFinite(item.quotedUnitPrice) || item.quotedUnitPrice < 0) {
      throw new OrderPriceConflictError(`「${product.name}｜${String(option.label || "規格")}」價格資訊已更新，請重新確認購物車後再送出訂單。`);
    }
    if (item.quotedUnitPrice !== unitPrice) {
      throw new OrderPriceConflictError(
        `「${product.name}｜${String(option.label || "規格")}」價格已由 NT$${item.quotedUnitPrice.toLocaleString("zh-TW")} 更新為 NT$${unitPrice.toLocaleString("zh-TW")}，請重新確認購物車後再送出訂單。`,
      );
    }
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error("商品數量不正確");
    const descriptor = `${option.label || ""} ${option.detail || ""} ${option.kind || ""}`;
    const isDrip = /耳掛|drip/i.test(descriptor);
    const isHalfPound = !isDrip && /半磅|咖啡豆|227g|beans/i.test(descriptor);
    const preparationLabel = String(item.preparationLabel || "").trim().slice(0, 30);
    const customRoast = item.customRoast === true;
    let roastLevel = "";
    let roastNote = "";
    if (customRoast) {
      if (!isHalfPound || quantity < 4) throw new Error(`${product.name} 的專屬烘焙需同一款半磅商品達 4 包（2 磅）`);
      roastLevel = String(item.roastLevel || "").trim();
      if (!ALLOWED_ROAST_LEVELS.includes(roastLevel)) throw new Error(`${product.name} 請選擇正確的專屬烘焙度`);
      roastNote = String(item.roastNote || "").trim().slice(0, 160);
    }
    subtotal += unitPrice * quantity;
    return {
      pricedItem: {
        slug: product.slug,
        name: product.name,
        optionId: option.id,
        optionLabel: option.label,
        optionDetail: option.detail,
        preparationLabel,
        customRoast,
        roastLevel: customRoast ? roastLevel : undefined,
        roastNote: customRoast ? roastNote : undefined,
        unitPrice,
        quantity,
        lineTotal: unitPrice * quantity,
      },
      skuDemand: {
        skuId: option.id,
        productName: String(product.name || "商品"),
        optionLabel: String(option.label || "規格"),
        stock: option.stock,
        quantity,
      },
    };
  });
  const skuDemand = validateSkuDemand(resolved.map((item) => item.skuDemand));
  const priced = resolved.map((item) => item.pricedItem);
  const shipping = subtotal >= 1500 ? 0 : 60;
  return {
    priced: { items: priced, subtotal, shipping, total: subtotal + shipping },
    skuDemand,
  };
}
