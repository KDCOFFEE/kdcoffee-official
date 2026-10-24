import type { StoreHeroSettings, StoreHeroTiming, StoreHeroPatch } from "./storeTypes";
import { DEFAULT_STORE_HERO, resolveStoreHeroTiming } from "./storeHero";
/** In-memory projection of existing Store settings, never a CMS storage namespace. */
export type StoreHeroMotionDraft = Pick<StoreHeroSettings, "motionEnabled" | "timing">;
export function storeHeroMotionDraft(hero?: StoreHeroSettings): StoreHeroMotionDraft {
 return {...(hero?.motionEnabled !== undefined ? {motionEnabled:hero.motionEnabled}:{}),...(hero?.timing !== undefined ? {timing:structuredClone(hero.timing)}:{})};
}
export function storeHeroMotionPatch(before:StoreHeroMotionDraft,after:StoreHeroMotionDraft):StoreHeroPatch|undefined {
 const patch:StoreHeroPatch={};
 if(before.motionEnabled!==after.motionEnabled)patch.motionEnabled=after.motionEnabled??null;
 if(JSON.stringify(before.timing)!==JSON.stringify(after.timing))patch.timing=after.timing===undefined?null:structuredClone(after.timing);
 return Object.keys(patch).length?patch:undefined;
}
/** Same milliseconds, step and sequence resolver as the former Store Hero controls. */
export function changeStoreHeroTiming(draft:StoreHeroMotionDraft,key:keyof StoreHeroTiming,seconds:number):StoreHeroMotionDraft {
 if(!Number.isFinite(seconds)||seconds<0||seconds>10)throw new Error("時間需介於 0～10 秒。");
 const exact=Math.round(seconds*1000),ms=exact===DEFAULT_STORE_HERO.timing[key]?exact:Math.round(exact/100)*100;
 const timing={...draft.timing,[key]:ms},resolved=resolveStoreHeroTiming(timing);
 timing[key]=resolved[key];
 if(resolved.leadStart!==(timing.leadStart??DEFAULT_STORE_HERO.timing.leadStart))timing.leadStart=resolved.leadStart;
 return {...draft,timing};
}
