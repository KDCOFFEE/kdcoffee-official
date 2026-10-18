import type { CoffeeArtwork, PurchaseOption } from "../data/websiteData";
import { isProductListedInWorks } from "./productListing";
import { resolveLineDestination, splitLineReply } from "./lineAutoReplyEngine";
export type LineWelcome = { enabled: boolean; text: string };
export type LineBeanSelection = { productId: string; enabled: boolean; order: number; description: string };
export type LineBeanMenu = { enabled: boolean; title: string; intro: string; emptyText: string; footer: string; products: LineBeanSelection[] };
export const defaultLineWelcome = (): LineWelcome => ({ enabled: false, text: "" });
export const defaultLineBeanMenu = (): LineBeanMenu => ({ enabled: false, title: "本月豆單", intro: "", emptyText: "目前沒有可顯示的已選商品，請開啟本月豆單查看。", footer: "", products: [] });
export const lineProductId = (product: CoffeeArtwork) => product.id || product.slug;
function options(product: CoffeeArtwork) {
  const source = Array.isArray(product.skus) && product.skus.length ? product.skus : product.purchase;
  return (Array.isArray(source) ? source : []).filter((sku: PurchaseOption) => sku && sku.enabled !== false && Number.isFinite(sku.price) && sku.price >= 0 && Number.isInteger(sku.stock ?? product.stock) && Number(sku.stock ?? product.stock) > 0);
}
export function isLineBeanAvailable(product: CoffeeArtwork) {
  return Boolean(product && isProductListedInWorks(product) && product.active !== false && product.status === "active" && product.purchasable !== false && typeof product.name === "string" && product.name.trim() && /^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(product.slug) && options(product).length);
}
export function resolveLineBeans(menu: LineBeanMenu, catalog: readonly CoffeeArtwork[], publicOrigin?: string) {
  return menu.products.filter(item => item.enabled).slice().sort((a,b) => a.order-b.order || a.productId.localeCompare(b.productId)).flatMap(selection => {
    const matches = catalog.filter(product => product && lineProductId(product) === selection.productId);
    const product = matches.length === 1 ? matches[0] : undefined;
    if (!product || !isLineBeanAvailable(product)) return [];
    return [{productId:selection.productId, name:product.name.trim(), description:selection.description || product.shortCopy?.trim() || product.mood?.trim() || "", url:resolveLineDestination("/works/"+encodeURIComponent(product.slug),publicOrigin), price:options(product).map(sku=>[sku.label?.trim(),String(sku.price)].filter(Boolean).join(": ")).join(" / "), details:[product.roast,product.origin,product.process,...(Array.isArray(product.flavors)?product.flavors:[])].filter(v=>typeof v==="string"&&v.trim()).join(" · ")}];
  });
}
export function formatLineBeanMenu(menu: LineBeanMenu, catalog: readonly CoffeeArtwork[], publicOrigin?: string) {
  const beans=resolveLineBeans(menu,catalog,publicOrigin);
  const text=beans.length?[menu.title,menu.intro,...beans.map((bean,index)=>[(index+1)+". "+bean.name,bean.description,bean.details,bean.price,bean.url].filter(Boolean).join("\n")),menu.footer].filter(Boolean).join("\n\n"):menu.emptyText;
  return {text,productIds:beans.map(bean=>bean.productId),messages:splitLineReply(text)};
}
