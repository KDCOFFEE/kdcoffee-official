import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import * as nodeModule from "node:module";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HOMEPAGE_STUDIO_AREAS, homepageAreaSnapshot } from "../lib/homepageStudio";
import { HOMEPAGE_SECTION_CAPABILITIES, resolveHomepageSectionPresentation } from "../lib/homepagePresentation";
import { updateHomepageBasePresentation as base, updateHomepageMobilePresentation as mobile, updateHomepageMobileEnabled as toggle } from "../lib/homepagePresentationAdmin";
import { resolveHomepageStudioMotion } from "../lib/homepageStudioMotion";
import { validateHomepageCms, resolveHomepageMotion } from "../lib/homepageCms";
import type { HomepageData } from "../data/homepageData";
const qaDir = process.env.HOMEPAGE_STUDIO_QA_DIR || path.join(os.tmpdir(), "KD_Homepage_Studio_QA");
const registerHooks=(nodeModule as unknown as {registerHooks:(hooks:{resolve:(specifier:string,context:unknown,next:(s:string,c:unknown)=>unknown)=>unknown})=>{deregister:()=>void}}).registerHooks;
const runtime = JSON.parse(await fs.readFile(path.join(qaDir, "runtime.json"), "utf8"));
const exact = await fs.readFile(path.join(runtime.root, "production-homepage.json"), "utf8");
const offline = await fs.readFile(path.join(runtime.root, "store/homepage.json"), "utf8");
const fixture = (): HomepageData => JSON.parse(exact);
const unconfigured = (): HomepageData => { const data = fixture(); delete data.presentation; return data; };
let count = 0;
const check = async (label: string, run: () => unknown | Promise<unknown>) => { await run(); console.log("PASS " + (++count) + " " + label); };
await check("Exact protected production Homepage v1599 validates without migration", () => assert.equal(validateHomepageCms(fixture()), true));
await check("All 11 public sections have exactly one Studio area", () => {
  assert.equal(new Set(HOMEPAGE_STUDIO_AREAS.map(item=>item.key)).size,15);
  for (const section of Object.keys(HOMEPAGE_SECTION_CAPABILITIES)) assert.equal(HOMEPAGE_STUDIO_AREAS.filter(item=>item.key===section).length,1);
});
const fieldMap = JSON.parse(await fs.readFile(path.join(qaDir, "field-map.json"), "utf8"));
await check("100% original editable control templates accounted for", () => { assert.equal(fieldMap.unmapped,0); assert.equal(fieldMap.preservedOrRelocated,fieldMap.baselineControlTemplates); });
for (const [key, slots] of Object.entries(HOMEPAGE_SECTION_CAPABILITIES)) {
  await check(key + " all typography roles retain sparse Desktop/Mobile behavior", () => {
    for (const slot of slots) {
      let data = base(unconfigured(),key as never,{ group:"text",slot,field:"fontSizePx",value:48 });
      assert.equal(resolveHomepageSectionPresentation(data.presentation,key as never,"mobile").text?.[slot]?.fontSizePx,48);
      data = mobile(data,key as never,{group:"text",slot,field:"fontSizePx",value:30});
      data = base(data,key as never,{group:"text",slot,field:"fontSizePx",value:52});
      assert.equal(resolveHomepageSectionPresentation(data.presentation,key as never,"desktop").text?.[slot]?.fontSizePx,52);
      assert.equal(resolveHomepageSectionPresentation(data.presentation,key as never,"mobile").text?.[slot]?.fontSizePx,30);
      data = mobile(data,key as never,{group:"text",slot,field:"fontSizePx",value:undefined});
      assert.equal(data.presentation?.sections?.[key as keyof typeof HOMEPAGE_SECTION_CAPABILITIES]?.mobile?.overrides?.text?.[slot]?.fontSizePx,undefined);
      assert.equal(resolveHomepageSectionPresentation(data.presentation,key as never,"mobile").text?.[slot]?.fontSizePx,52);
      assert.deepEqual(JSON.parse(JSON.stringify(data)).presentation,data.presentation);
    }
  });
}
await check("Local draft edit and device/area changes do not mutate source",()=> {
  const data=fixture(), original=JSON.stringify(data);
  base(data,"home002",{group:"layout",field:"paddingTopPx",value:72});
  homepageAreaSnapshot(data as unknown as Record<string,unknown>,"hero");
  assert.equal(JSON.stringify(data),original);
});
await check("Mobile spacing remains independent and reset resumes latest Desktop",()=> {
  let data=base(unconfigured(),"home002",{group:"layout",field:"paddingTopPx",value:64});
  data=mobile(data,"home002",{group:"layout",field:"paddingTopPx",value:24});
  data=base(data,"home002",{group:"layout",field:"paddingTopPx",value:80});
  assert.equal(resolveHomepageSectionPresentation(data.presentation,"home002","mobile").layout?.paddingTopPx,24);
  data=mobile(data,"home002",{group:"layout",field:"paddingTopPx",value:undefined});
  assert.equal(resolveHomepageSectionPresentation(data.presentation,"home002","mobile").layout?.paddingTopPx,80);
});
await check("Existing disabled Mobile draft can be re-enabled without materializing Desktop",()=> {
  let data=mobile(fixture(),"home002",{group:"visible",value:false});
  data=toggle(data,"home002",false); data=toggle(data,"home002",true);
  assert.equal(data.presentation?.sections?.home002?.mobile?.overrides?.visible,false);
});
for (const section of Object.keys(HOMEPAGE_SECTION_CAPABILITIES).filter(k=>k!=="hero")) {
 await check(section+" animation inherits, overrides, independently updates, resets and round-trips",()=> {
  let data=base(unconfigured(),section as never,{group:"animation",field:"durationMs",value:1200});
  const legacy=(data as unknown as Record<string,{motion?:unknown}>)[section].motion;
  assert.equal(resolveHomepageStudioMotion(data.presentation,section as never,legacy,"mobile").durationMs,1200);
  data=mobile(data,section as never,{group:"animation",field:"durationMs",value:800});
  data=base(data,section as never,{group:"animation",field:"durationMs",value:1600});
  assert.equal(resolveHomepageStudioMotion(data.presentation,section as never,legacy,"mobile").durationMs,800);
  assert.equal(resolveHomepageStudioMotion(data.presentation,section as never,legacy,"desktop").durationMs,1600);
  data=mobile(data,section as never,{group:"animation",field:"durationMs",value:undefined});
  assert.equal(resolveHomepageStudioMotion(data.presentation,section as never,legacy,"mobile").durationMs,1600);
  assert.deepEqual(JSON.parse(JSON.stringify(data)).presentation,data.presentation);
 });
}
await check("Unconfigured animation preserves exact legacy resolved parameters",()=> {
  for(const key of Object.keys(HOMEPAGE_SECTION_CAPABILITIES).filter(k=>k!=="hero"))assert.deepEqual(resolveHomepageStudioMotion(undefined,key as never,undefined,"desktop"),resolveHomepageMotion(undefined,key as never));
});
await check("Unsafe motion/CSS parameters and Hero engine replacement are rejected",()=> {
  assert.throws(()=>base(fixture(),"hero",{group:"animation",field:"durationMs",value:800}));
  assert.throws(()=>base(fixture(),"home002",{group:"animation",field:"durationMs",value:100000}));
  assert.throws(()=>base(fixture(),"home002",{group:"animation",field:"preset",value:"raw-css"}));
});
const { default: Homepage } = await import("../components/home/HomepageV3");
const props={homepageData:fixture() as never,products:[],pages:[]};
const oldFile=path.join(qaDir,"baseline-homepage.tsx");
await fs.writeFile(oldFile,execFileSync("git",["show","b9bbf614f4a3feaf886e9fab26a6ecdc787b761f:components/home/HomepageV3.tsx"],{encoding:"utf8"}));
const rootRequire=nodeModule.createRequire(import.meta.url);
const baselineHook=registerHooks({resolve(specifier,context,next){
 if((context as {parentURL?:string}).parentURL===pathToFileURL(oldFile).href && ["next/link","next/link.js","react/jsx-runtime"].includes(specifier)) return next(pathToFileURL(rootRequire.resolve(specifier==="next/link"?"next/link.js":specifier)).href,context);
 return next(specifier,context);
}});
const { default: Baseline }=await import(pathToFileURL(oldFile).href);
await check("Exact production Homepage SSR is byte-identical to accepted renderer before edits",()=>assert.equal(renderToStaticMarkup(React.createElement(Homepage,props)),renderToStaticMarkup(React.createElement(Baseline,props))));
await check("Unsaved text, media and typography use the real renderer without persistence",()=> {
 const data=base(fixture(),"home002",{group:"text",slot:"title",field:"fontSizePx",value:51});data.home002!.title="UNSAVED STUDIO TITLE";
 const html=renderToStaticMarkup(React.createElement(Homepage,{...props,homepageData:data as never}));
 assert.ok(html.includes("UNSAVED STUDIO TITLE"));assert.ok(html.includes("--homepage-text-font-size-base:51px"));assert.equal(String(fixture().home002!.title).includes("UNSAVED"),false);
});
// Authenticated canonical API tests: only a fresh TEMP data root, no network.
const root=await fs.mkdtemp(path.join(os.tmpdir(),"KD_Homepage_API_Test_"));
await fs.mkdir(path.join(root,"store"),{recursive:true});
for(const file of ["homepage","website-data","pages","assets"])await fs.copyFile(path.join(runtime.root,"store",file+".json"),path.join(root,"store",file+".json"));
process.env.KD_DATA_DIR=root;delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.ADMIN_SESSION_SECRET=crypto.randomBytes(48).toString("hex");
const globalCookie=globalThis as unknown as {__homepageStudioCookie?:string};
baselineHook.deregister();
const hook=registerHooks({resolve(specifier,context,next){if(specifier==="next/headers")return{url:"data:text/javascript,export async function cookies(){return {get:()=>globalThis.__homepageStudioCookie?{value:globalThis.__homepageStudioCookie}:undefined}}",shortCircuit:true};return next(specifier,context)}});
// storagePaths/getHomepageData may already be loaded by SSR; the API resolves
// its own canonical path after KD_DATA_DIR is set.
const api=await import("../app/api/admin/homepage/route");
const auth=await import("../lib/adminAuth");
const request=(homepage:unknown)=>new Request("http://localhost/api/admin/homepage",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({homepage})});
await check("Public GET/PUT remain unauthenticated 401, with no mutation",async()=> {assert.equal((await api.GET()).status,401);assert.equal((await api.PUT(request(JSON.parse(offline)))).status,401);assert.equal(await fs.readFile(path.join(root,"store/homepage.json"),"utf8"),offline)});
globalCookie.__homepageStudioCookie=auth.createAdminSessionValue();
await check("Authenticated GET retains canonical production data and version",async()=> {const result=await (await api.GET()).json();assert.equal(result.homepage.version,JSON.parse(offline).version);});
await check("Authenticated save persists sparse settings in same canonical file",async()=> {
 const value=base(JSON.parse(offline),"home002",{group:"text",slot:"title",field:"fontSizePx",value:53});
 const response=await api.PUT(request(value));assert.equal(response.status,200,await response.text());
 const saved=JSON.parse(await fs.readFile(path.join(root,"store/homepage.json"),"utf8"));assert.equal(saved.presentation.sections.home002.base.text.title.fontSizePx,53);assert.equal(saved.version,value.version+1);
});
await check("Stale version fails with 409 and preserves latest saved document",async()=> {
 const before=await fs.readFile(path.join(root,"store/homepage.json"),"utf8");assert.equal((await api.PUT(request(JSON.parse(offline)))).status,409);assert.equal(await fs.readFile(path.join(root,"store/homepage.json"),"utf8"),before);
});
await check("SEO asset selection remains compatible with canonical media validation",async()=> {
 const value=JSON.parse(await fs.readFile(path.join(root,"store/homepage.json"),"utf8"));
 value.seo.shareImage={media:{type:"image",provider:"local",url:"/images/kd-fluid-bed-poster.webp"},alt:"QA share image"};
 const response=await api.PUT(request(value));assert.equal(response.status,200,await response.text());
});
hook.deregister();delete globalCookie.__homepageStudioCookie;
await check("No duplicate canonical Homepage or Mobile tree introduced",async()=> {
 const files=await fs.readdir(path.join(root,"store"));assert.ok(!files.includes("homepage-mobile.json"));assert.ok(!files.includes("homepage-v2.json"));
});
await check("Production backup and QA original exact source remain unchanged",async()=>assert.equal(await fs.readFile(path.join(runtime.root,"production-homepage.json"),"utf8"),exact));
console.log("Homepage Studio focused: "+count+" checks PASS.");
