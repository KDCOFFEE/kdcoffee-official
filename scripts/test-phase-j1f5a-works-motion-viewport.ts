import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
// @ts-expect-error Node test execution requires explicit extension.
import { resolveWorksPageCms, validateWorksPageCms } from "../lib/worksPageCms.ts";

let passed=0; const check=(name:string,value:unknown)=>{assert.ok(value,name);passed++;console.log(`PASS ${passed}: ${name}`)};
const source=await readFile("app/works/page.tsx","utf8"); const runtime=await readFile("components/works/WorksMotionRuntime.tsx","utf8");
const legacy=resolveWorksPageCms(undefined,{monthLabel:"九月",intro:"豆單"});
check("missing legacy fields resolve Hero load and Catalog/Grid viewport defaults", legacy.motion.hero.triggerOnViewport===false&&legacy.motion.catalogIntro.triggerOnViewport===true&&legacy.motion.productGrid.triggerOnViewport===true);
const resolved=resolveWorksPageCms({schemaVersion:1,motion:{hero:{enabled:true,preset:"fade-up",durationMs:600,delayMs:0,distancePx:20,staggerMs:0,triggerOnViewport:true},catalogIntro:{enabled:true,preset:"fade",durationMs:500,delayMs:0,distancePx:0,staggerMs:0,triggerOnViewport:false},productGrid:{enabled:true,preset:"slide-left",durationMs:700,delayMs:100,distancePx:30,staggerMs:150,triggerOnViewport:true}}},{monthLabel:"九月",intro:"豆單"});
check("each section independently preserves viewport trigger",resolved.motion.hero.triggerOnViewport&& !resolved.motion.catalogIntro.triggerOnViewport&&resolved.motion.productGrid.triggerOnViewport);
let rejected=false;try{validateWorksPageCms({schemaVersion:1,motion:{hero:{triggerOnViewport:"yes"}}} as never)}catch{rejected=true}check("invalid viewport trigger is rejected",rejected);
check("public DOM marks Hero Catalog and Grid targets",source.includes('data-works-motion-target="hero"')&&source.includes('data-works-motion-target="catalogIntro"')&&source.includes('data-works-motion-target="productGrid"'));
check("runtime plays load motion immediately and viewport motion only after intersection",runtime.includes("if (!setting.triggerOnViewport) { play(); return; }")&&runtime.includes("new IntersectionObserver")&&runtime.includes("entry.isIntersecting"));
check("runtime disconnects after play and restores visible content on observer failure",runtime.includes("observer.disconnect()")&&runtime.includes('if (!("IntersectionObserver" in window)) { nodes.forEach(markWorksMotionRevealed); return; }')&&!source.includes("opacity:0")&&!source.includes("visibility:hidden"));
check("runtime applies product grid stagger and respects reduced motion",runtime.includes("index * (target === \"productGrid\" ? setting.staggerMs : 0)")&&runtime.includes("prefers-reduced-motion: reduce"));
check("card hover is excluded from viewport observation",runtime.includes('["hero", "heroMedia", "catalogIntro", "productGrid"] as const')&&!runtime.includes('data-works-motion-target="cardHover"'));
console.log(`Phase J.1F.5A Works viewport motion: ${passed} PASS`);
