import { socialPageMetadata } from "./socialMetadata";
import { studioCardEditorial } from "./storeContentPresentation";
import "server-only";
import type { Metadata } from "next";
import { createStoreRepository } from "./storeRepository";
import { readGiftCmsState } from "./giftCmsStore";
import { readPointDisplayName } from "./pointDisplayNameStore";
import type { StoreLandingDocument } from "./giftCms";
/** Only selector-approved slugs enter public card presentation. */
export async function readStoreContentPresentation(publicSlugs: string[] = []) {
 const state=await readGiftCmsState(),catalog=await createStoreRepository().read(),pointName=state.storeLanding?await readPointDisplayName():"";
 const editorial: Record<string,{label?:string;summary?:string;pointsText?:string}>={};
 for(const p of catalog.products)if(publicSlugs.includes(p.slug)){
   const card=state.products[p.id]?.card;
   if(card || (state.storeLanding && p.pvValue>0))editorial[p.slug]=studioCardEditorial(card,p.pvValue,pointName,Boolean(state.storeLanding&&state.storeLanding.cards.pointStyle!=="hidden"));
 }
 const navigation=state.storeLanding?{sections:state.storeLanding.navigation.sections.flatMap(n=>{const s=catalog.sections.find(s=>s.id===n.id);return s?[{...n,slug:s.slug}]:[]}),categories:state.storeLanding.navigation.categories.flatMap(n=>{const s=catalog.categories.find(s=>s.id===n.id);return s?[{...n,slug:s.slug}]:[]})}:undefined;
 return {document:state.storeLanding,editorial,navigation};
}
/** Canonical/robots/filter rules remain owned by the Store SEO gate. */
export function storeContentMetadata(base: Metadata, doc?: StoreLandingDocument): Metadata {
 if (!doc) return base;
 const seo = doc.seo;
 const title = seo.title || (typeof base.openGraph?.title === "string" ? base.openGraph.title : "商店｜KD 咖啡藝術工坊");
 const description = seo.description || base.description || undefined;
 const social = socialPageMetadata({ path: "/store", title: seo.socialTitle || title,
   description: seo.socialDescription || description, images: [seo.image?.url, doc.hero.image?.url], imageAlt: seo.image?.alt });
 return { ...base, title: { absolute: title }, description, openGraph: social.openGraph, twitter: social.twitter };
}
