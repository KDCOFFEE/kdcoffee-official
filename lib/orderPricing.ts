import type { WebsiteData } from "../data/websiteData";
import {
  CUSTOM_ROAST_MIN_QUANTITY,
  isAllowedRoastLevel,
  resolvePreparationLabel,
} from "./checkoutRules";
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
    const preparation = resolvePreparationLabel(option, item.preparationLabel);
    if (!preparation.valid) {
      throw new Error(`${product.name} 的咖啡豆／咖啡粉選項不正確`);
    }
    const preparationLabel = preparation.label;
    const customRoast = item.customRoast === true;
    const roastLevel = "";
    const roastNote = "";
    subtotal += unitPrice * quantity;
    return {
      sourceItem: item,
      customRoastSku: option.kind === "beans",
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
        pvEnabled: option.pvEnabled === true,
        basePV: option.pvEnabled === true && Number.isFinite(Number(option.pvValue)) ? Math.max(0, Number(option.pvValue)) : 0,
        discountRatio: 1,
        effectivePV: option.pvEnabled === true && Number.isFinite(Number(option.pvValue)) ? Math.max(0, Number(option.pvValue)) : 0,
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

  for (const item of resolved) {
    if (!item.pricedItem.customRoast) continue;
    if (
      !item.customRoastSku ||
      item.pricedItem.quantity < CUSTOM_ROAST_MIN_QUANTITY
    ) {
      throw new Error(`${item.pricedItem.name} 的專屬烘焙需單一規格達 4 包（2 磅）`);
    }

    const roastLevel = String(item.sourceItem.roastLevel || "").trim();
    if (!isAllowedRoastLevel(roastLevel)) {
      throw new Error(`${item.pricedItem.name} 請選擇正確的專屬烘焙度`);
    }
    item.pricedItem.roastLevel = roastLevel;
    item.pricedItem.roastNote = String(item.sourceItem.roastNote || "")
      .trim()
      .slice(0, 160);
  }
  const skuDemand = validateSkuDemand(resolved.map((item) => item.skuDemand));
  const priced = resolved.map((item) => item.pricedItem);
  const shipping = subtotal >= 1500 ? 0 : 60;
  return {
    priced: { items: priced, subtotal, shipping, total: subtotal + shipping },
    skuDemand,
  };
}
