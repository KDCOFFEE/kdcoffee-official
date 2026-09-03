import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// @ts-expect-error Node test execution requires explicit extension.
import { resolveWorksPageCms } from "../lib/worksPageCms.ts";
let passed=0;const check=(n:string,v:unknown)=>{assert.ok(v,n);passed++;console.log(`PASS ${passed}: ${n}`)};
const hero=await readFile("components/works/WorksHeroMedia.tsx","utf8");const runtime=await readFile("components/works/WorksMotionRuntime.tsx","utf8");const css=await readFile("app/globals.css","utf8");
const r=resolveWorksPageCms({schemaVersion:1,motion:{heroMedia:{enabled:true,preset:"scale-reveal",durationMs:1500,delayMs:0,distancePx:0,staggerMs:0,triggerOnViewport:false}}},{monthLabel:"月",intro:"豆"});
check("saved heroMedia config survives resolver",r.motion.heroMedia.enabled&&r.motion.heroMedia.preset==="scale-reveal"&&r.motion.heroMedia.durationMs===1500);
check("actual visual media wrapper owns heroMedia target",hero.includes('className={`works-hero-media-motion ${motionClassName}`}')&&hero.includes('data-works-motion-target="heroMedia"')&&!hero.includes('KdMedia key={selected.media.url} media={selected.media} alt={selected.alt} className="works-hero-media" data-works-motion-target'));
check("wrapper remains the full Hero visual unit for image and video",css.includes('.works-hero-media-motion{position:absolute')&&css.includes('inset:0;width:100%;height:100%'));
check("runtime queries the exact target and maps scale/fade keyframes",runtime.includes('data-works-motion-target="${target}"')&&runtime.includes('"heroMedia"')&&runtime.includes('"scale-reveal"')&&runtime.includes('fade:'));
check("load and viewport paths remain supported",runtime.includes('if (!setting.triggerOnViewport) { play(); return; }')&&runtime.includes('new IntersectionObserver'));
check("media target is isolated from overlay and Hero content",!hero.includes('data-works-motion-target="hero"')&&hero.includes('works-hero-overlay'));
console.log(`Phase J.1F.5C hero media: ${passed} PASS`);
