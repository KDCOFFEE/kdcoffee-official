import { storeHeroMotionDraft } from "./storeHeroMotionEditor";
import { publicStoreHero } from "./storeHero";
import "server-only";
import { createStoreRepository } from "./storeRepository";
import { readGiftCmsState, GiftCmsNotFoundError } from "./giftCmsStore";
import { DEFAULT_GIFT_LANDING, giftProductFallback, storeLandingDefaults } from "./giftCms";
import { selectPublicGiftCatalog } from "./giftPresentation";
import { findPublicStoreProductBySlug, selectPublicStoreIndex } from "./storePublicSelectors";
import { getAssetLibrary } from "./assets";
import { readPointDisplayName } from "./pointDisplayNameStore";

export async function readGiftCmsIndex(allProducts = false) {
  const catalog = await createStoreRepository().read();
  return catalog.products.filter(p => allProducts || p.productType === "gift").map(p => ({ id: p.id, slug: p.slug, name: p.name, sku: p.sku, published: p.published && p.active && !p.archivedAt, archived: Boolean(p.archivedAt), thumbnail: p.heroMedia?.type === "image" ? p.heroMedia.url : p.heroMedia?.posterUrl, category: catalog.categories.find(c => c.id === p.categoryId)?.name || "未分類" }));
}
export async function readGiftCmsEditor(slug?: string, allProducts = false) {
  const [catalog, cms, library, pointDisplayName] = await Promise.all([createStoreRepository().read(), readGiftCmsState(), getAssetLibrary(), readPointDisplayName()]);
  const source = slug ? catalog.products.find(p => p.slug === slug && (allProducts || p.productType === "gift")) : undefined;
  if (slug && !source) throw new GiftCmsNotFoundError();
  // Authenticated Admin preview only. Public routes always use the original catalog.
  const preview = structuredClone(catalog);
  for (const s of preview.sections) { s.active = true; s.published = true; s.archivedAt = null; }
  for (const c of preview.categories) { c.active = true; c.archivedAt = null; }
  for (const p of preview.products) if (allProducts || p.productType === "gift") { p.active = true; p.published = true; p.archivedAt = null; }
  const publicModel = selectPublicGiftCatalog(catalog, pointDisplayName, cms);
  const previewIncludesDraft = publicModel.total === 0;
  // Draft cards remain useful in Admin, but their media is not a public Hero.
  // Preserve any real public fallback (including a public custom gift).
  const model = previewIncludesDraft ? { ...selectPublicGiftCatalog(preview, pointDisplayName, cms), hero: publicModel.hero } : publicModel;
  const defaults = selectPublicGiftCatalog(preview, pointDisplayName);
  const cardDefault = source ? defaults.groups.flatMap(g => g.gifts).find(g => g.product.slug === source.slug) : undefined;
  const publicStoreModel=selectPublicStoreIndex(catalog);
  const storePreviewIncludesDraft=publicStoreModel.products.totalItems===0;
  const storeDefaults=storeLandingDefaults(publicStoreHero(catalog.settings?.hero),catalog);
  // New canonical categories/sections become editable without resetting existing copy.
  // This is an in-memory read projection only; no initialization or migration on GET.
  const storeDocument=structuredClone(cms.storeLanding ?? storeDefaults);
  for(const key of ["sections","categories"] as const){const known=new Set(storeDocument.navigation[key].map(n=>n.id));storeDocument.navigation[key].push(...storeDefaults.navigation[key].filter(n=>!known.has(n.id)));}
  return {
    studioMode: allProducts,
    storeHeroMotion: {revision:catalog.revision,settings:storeHeroMotionDraft(catalog.settings?.hero)},
    storePreviewIncludesDraft,
    storePointDisplayName:pointDisplayName,
    storeCardContext:Object.fromEntries(catalog.products.map(p=>[p.slug,{card:cms.products[p.id]?.card||null,pvValue:p.pvValue}])),
    storeModel: { ...(storePreviewIncludesDraft?selectPublicStoreIndex(preview):publicStoreModel), hero: publicStoreHero(catalog.settings?.hero) },
    storeDefaults,
    navigationSources:{sections:catalog.sections.map(s=>({id:s.id,slug:s.slug})),categories:catalog.categories.map(s=>({id:s.id,slug:s.slug}))},
    defaultDocument: source ? giftProductFallback(source) : allProducts ? storeDefaults : structuredClone(DEFAULT_GIFT_LANDING),
    revision: cms.revision,
    document: source ? cms.products[source.id] ?? giftProductFallback(source) : allProducts ? storeDocument : cms.landing ?? structuredClone(DEFAULT_GIFT_LANDING),
    landing: cms.landing ?? structuredClone(DEFAULT_GIFT_LANDING),
    model,
    previewIncludesDraft,
    assets: library.assets.filter(a => a.status === "active" && a.path),
    product: source ? { id: source.id, slug: source.slug, name: source.name, sku: source.sku, published: source.published, active: source.active, archived: Boolean(source.archivedAt), preview: findPublicStoreProductBySlug(preview, source.slug)!, pvValue: source.pvValue, pointDisplayName, cardDefault: { label: cardDefault?.label || (source.featured ? "精選" : ""), summary: cardDefault?.summary || "" } } : null,
  };
}
export type GiftCmsEditorPayload = Awaited<ReturnType<typeof readGiftCmsEditor>>;
