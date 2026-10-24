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
 if(!doc)return base;const seo=doc.seo;
 return {...base,title:seo.title||base.title,description:seo.description||base.description,openGraph:{...base.openGraph,title:seo.socialTitle||seo.title||base.openGraph?.title,description:seo.socialDescription||seo.description||base.openGraph?.description,...(seo.image?{images:[{url:seo.image.url,alt:seo.image.alt}]}:{})}};
}
