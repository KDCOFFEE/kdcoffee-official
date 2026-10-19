import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { WorksArtworkOwnerReadResult } from "../lib/worksArtworkOwnerReadService.ts";
import type { WorksArtworkOwnerProjection } from "../lib/worksArtworkReadModel.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const routeId = "app/api/admin/works/[slug]/owner-read/route.ts";
const allowed = new Set(["worksArtworkOwnerReadService","worksArtworkOwnerProjection","worksArtworkFieldRegistry","worksArtworkReadModel","worksArtworkSourceTrace","worksArtworkContract","worksArtworkValidation","productVisualAssets","productPageContent","productPageContentValidation","productPageSections","cleanRoastingMedia","media","productListing","storagePaths","adminAuth","adminAuthorization"].map(n => "lib/" + n + ".ts").concat(routeId));
const modules = new Map<string, { exports: any }>();
const jar = new Map<string, string>();
const marker = "W32A3_PRIVATE_INTERNAL_MARKER";
const originalFetch = globalThis.fetch;
const originalSecret = process.env.ADMIN_SESSION_SECRET;
process.env.ADMIN_SESSION_SECRET = crypto.randomBytes(48).toString("hex");
let network = 0, writes = 0, reads = 0, projections = 0, traceCalls = 0, cookieReads = 0;
let content = "", readError: unknown, cookieError: unknown;
let projectionFault: ((input: any) => any) | undefined;
let traceFault: ((original: (...args: any[]) => any, args: any[]) => any) | undefined;
let canonicalPath: string;
globalThis.fetch = async () => { network++; throw Error("Network forbidden"); };

// Existing Admin-test seam: only supply Next's cookie request context.
// Real session signing/parsing, expiry, Admin guard and role checks stay real.
// The finite module allowlist also forbids importing HTTP/email/LINE transports.
function load(id: string): any {
  assert.ok(allowed.has(id), "Unexpected dependency");
  if (modules.has(id)) return modules.get(id)!.exports;
  const source = readFileSync(path.join(root, id), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const m = { exports: {} }; modules.set(id, m);
  new Function("require","module","exports",compiled)((s: string) => {
    if (s === "server-only") return {};
    if (s === "next/headers") return { cookies: async () => {
      cookieReads++; if (cookieError) throw cookieError;
      return { get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined };
    } };
    if (s === "crypto") return crypto;
    if (s === "path") return path;
    if (s === "node:fs/promises") return new Proxy({}, { get(_target, key) {
      if (key !== "readFile") { writes++; throw Error("Unexpected filesystem API"); }
      return async (file: string, encoding: string) => {
        reads++; assert.equal(file, canonicalPath); assert.equal(encoding, "utf8");
        if (readError) throw readError;
        return content;
      };
    } });
    assert.ok(s.startsWith("./") || s.startsWith("../") || s.startsWith("@/"), "Forbidden runtime dependency");
    let p = s.startsWith("@/") ? s.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(id), s));
    if (!p.endsWith(".ts")) p += ".ts";
    return load(p);
  }, m, m.exports);
  return m.exports;
}
const groups = ["Auth","Lookup / errors","Canonical 25","Semantics","Safety / detachment","Architecture"] as const;
type Group = typeof groups[number];
const counts = Object.fromEntries(groups.map(g => [g, { pass: 0, fail: 0 }])) as Record<Group,{pass:number;fail:number}>;
async function check(g: Group, name: string, fn: () => void | Promise<void>) {
  try { await fn(); counts[g].pass++; }
  catch { counts[g].fail++; console.error("FAIL " + g + ": " + name); }
}
function freeze<T>(v: T): T {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    for (const d of Object.values(Object.getOwnPropertyDescriptors(v))) if (Object.hasOwn(d,"value")) freeze(d.value);
    Object.freeze(v);
  }
  return v;
}
function good(r: WorksArtworkOwnerReadResult): WorksArtworkOwnerProjection { assert.ok(r.ok); return r.data; }
function field(r: WorksArtworkOwnerProjection, id: string) { const f = r.fields.find(f => f.id === id); assert.ok(f); return f; }

try {
  const route = load(routeId) as typeof import("../app/api/admin/works/[slug]/owner-read/route.ts");
  const service = load("lib/worksArtworkOwnerReadService.ts") as typeof import("../lib/worksArtworkOwnerReadService.ts");
  const auth = load("lib/adminAuth.ts") as typeof import("../lib/adminAuth.ts");
  const authorization = load("lib/adminAuthorization.ts") as typeof import("../lib/adminAuthorization.ts");
  const projection = load("lib/worksArtworkOwnerProjection.ts");
  const trace = load("lib/worksArtworkSourceTrace.ts");
  const registry = load("lib/worksArtworkFieldRegistry.ts");
  const listing = load("lib/productListing.ts") as typeof import("../lib/productListing.ts");
  canonicalPath = load("lib/storagePaths.ts").getWebsiteDataFile();
  const originalProjection = projection.projectWorksArtworkOwner;
  projection.projectWorksArtworkOwner = (input: any) => { projections++; return projectionFault ? projectionFault(input) : originalProjection(input); };
  const originalTrace = trace.traceWorksArtwork;
  trace.traceWorksArtwork = (...args: any[]) => { traceCalls++; return traceFault ? traceFault(originalTrace,args) : originalTrace(...args); };
  const canonicalBytes = readFileSync(path.join(root,"public/data/website-data.json"));
  const ownerBytes = readFileSync(path.join(root,"public/data/homepage.json"));
  const canonical = freeze(JSON.parse(canonicalBytes.toString("utf8")));
  const products = canonical.menu.products as Record<string,any>[];
  const inputBefore = JSON.stringify(canonical), registryBefore = JSON.stringify(registry.WORKS_OWNER_FIELD_REGISTRY);
  assert.equal(products.length,25);
  const base = freeze({ name:"Artwork",slug:"review-art",id:"art-id",sku:"art-sku",mood:"Story",shortCopy:"Intro",subtitle:"Sub",flavors:["Floral"],inMonthlyMenu:true });
  const ownerToken = auth.createAdminSessionValue({adminId:"a3-test-owner",role:"owner"});
  const adminToken = auth.createAdminSessionValue({adminId:"a3-test-operator",role:"admin"});
  const legacyPayload = Buffer.from(JSON.stringify({role:"admin",expiresAt:Date.now()+600000})).toString("base64url");
  const legacyToken = legacyPayload + "." + crypto.createHmac("sha256",process.env.ADMIN_SESSION_SECRET!).update(legacyPayload).digest("base64url");
  function reset(data: unknown = canonical) {
    content = JSON.stringify(data); reads = projections = traceCalls = cookieReads = 0;
    readError = cookieError = undefined; projectionFault = traceFault = undefined;
  }
  function owner() { jar.clear(); jar.set(auth.adminCookieName,ownerToken); }
  async function request(slug: unknown, context?: any) {
    return route.GET(new Request("https://owner.test/api/admin/works/art/owner-read"), context ?? { params: Promise.resolve({slug}) });
  }
  async function errorResponse(status: number, code: string, ...references: unknown[]) {
    const slug = references.length ? references[0] : products[0].slug;
    const response = await request(slug), body = await response.json();
    assert.equal(response.status,status); assert.equal(body.ok,false); assert.equal(body.error.code,code);
    assert.deepEqual(Object.keys(body).sort(),["error","ok"]); assert.deepEqual(Object.keys(body.error).sort(),["code","message"]);
    assert.ok(!JSON.stringify(body).includes(marker)); assert.ok(!response.headers.has("set-cookie"));
    assert.match(response.headers.get("cache-control") ?? "",/no-store/);
    return body;
  }
  for (const slug of [products[0].slug,"missing-artwork","../private"]) await check("Auth","missing Admin session precedes reference/existence " + slug,async()=>{
    reset(); jar.clear(); const a = await errorResponse(401,"UNAUTHENTICATED",slug); assert.equal(reads,0); assert.equal(projections,0);
    assert.deepEqual(a,service.worksArtworkOwnerReadFailure("UNAUTHENTICATED"));
  });
  await check("Auth","normal member/email/spoofed cookie is not Admin",async()=>{
    reset();jar.clear();jar.set("kd_member_session",marker);jar.set("email","owner@example.test");
    await errorResponse(401,"UNAUTHENTICATED");assert.equal(reads,0);
  });
  for(const [name,value] of [["unsigned","cookie-present"],["tampered",ownerToken.slice(0,-1)+(ownerToken.endsWith("a")?"b":"a")],["expired",auth.createAdminSessionValue({now:new Date(Date.now()-13*60*60*1000)})]]) await check("Auth",name+" session rejected",async()=>{
    reset();jar.clear();jar.set(auth.adminCookieName,value);await errorResponse(401,"UNAUTHENTICATED");assert.equal(reads,0);
  });
  for(const [name,value] of [["operator",adminToken],["legacy",legacyToken]]) for(const slug of [products[0].slug,"missing-artwork","../private"]) await check("Auth",name+" cannot infer artwork existence "+slug,async()=>{
    reset();jar.clear();jar.set(auth.adminCookieName,value);await errorResponse(403,"FORBIDDEN",slug);assert.equal(reads,0);assert.equal(projections,0);
  });
  for(const authorized of [false,true]) await check("Auth","denial before params access "+authorized,async()=>{
    reset();jar.clear();if(authorized)jar.set(auth.adminCookieName,adminToken);let touched=0;
    const response=await request("",{get params(){touched++;throw Error(marker)}});
    assert.equal(response.status,authorized?403:401);assert.equal(touched,0);assert.equal(reads,0);
  });
  await check("Auth","real established guard validates Owner",async()=>{
    reset();owner();const session=await authorization.requireAdminAuthenticated();assert.equal(session.role,"owner");assert.equal(session.legacy,false);
  });
  await check("Auth","authorized success once with private cache headers",async()=>{
    reset();owner();const response=await request(products[0].slug),body=await response.json();
    assert.equal(response.status,200);assert.equal(body.ok,true);assert.deepEqual(Object.keys(body),["ok","data"]);
    assert.equal(reads,1);assert.equal(projections,1);assert.ok(traceCalls<=20);
    assert.equal(cookieReads,1);assert.equal(response.headers.get("vary"),"Cookie");assert.match(response.headers.get("cache-control")??"",/private.*no-store/);assert.ok(!response.headers.has("set-cookie"));
  });
  for(const value of [""," ","../x","..\\x","F:\\private\\x","/srv/private/x","%2e%2e%2fx","%252e%252e%252fx","a/b","a\\b","a?secret=x","a#x","x".repeat(129),null,undefined,{},[],25]) await check("Lookup / errors","invalid reference "+typeof value+":"+String(value).slice(0,12),async()=>{
    reset();owner();const direct=await service.readWorksArtworkOwnerModel(value);assert.deepEqual(direct,service.worksArtworkOwnerReadFailure("INVALID_ARTWORK_REFERENCE"));assert.equal(reads,0);assert.equal(projections,0);
    await errorResponse(400,"INVALID_ARTWORK_REFERENCE",value);assert.equal(reads,0);
  });
  await check("Lookup / errors","unknown slug never falls back to first Product",async()=>{
    reset();owner();await errorResponse(404,"ARTWORK_NOT_FOUND","unlisted-review-art");assert.equal(reads,1);assert.equal(projections,0);
    assert.deepEqual(await service.readWorksArtworkOwnerModel("unlisted-review-art"),service.worksArtworkOwnerReadFailure("ARTWORK_NOT_FOUND"));
  });
  const invalidSources:any[]=[null,[],{}, {menu:null},{menu:{products:{}}},{menu:{products:[null]}},{menu:{products:[{name:"No slug"}]}},{menu:{products:[{name:"Unsafe slug",slug:"../private"}]}},{menu:{products:[base,base]}},{menu:{products:[base,{name:"Other",slug:"dup"},{name:"Other too",slug:"dup"}]}},{menu:{products:Array.from({length:1001},(_,i)=>({name:"Art",slug:"art-"+i}))}}];
  for(let i=0;i<invalidSources.length;i++) await check("Lookup / errors","invalid canonical contract "+i,async()=>{
    reset(invalidSources[i]);owner();await errorResponse(500,"ARTWORK_SOURCE_INVALID",base.slug);assert.equal(projections,0);
  });
  for(const text of ["{bad-json","x".repeat(8*1024*1024+1)]) await check("Lookup / errors","malformed/oversized canonical text "+text.length,async()=>{
    reset();content=text;owner();await errorResponse(500,"ARTWORK_SOURCE_INVALID");assert.equal(projections,0);
  });
  for(const code of ["ENOENT","EACCES"]) await check("Lookup / errors","missing/unreadable source "+code+" never initializes",async()=>{
    reset();owner();readError=Object.assign(Error("/srv/private/"+marker),{code});await errorResponse(500,"INTERNAL_ERROR");assert.equal(writes,0);assert.equal(projections,0);
  });
  for(const product of [{...base,name:""},{...base,name:"“/srv/private/"+marker+"”"},{...base,worksPage:{contractVersion:999,revision:1,fields:{}}}]) await check("Lookup / errors","projection failure is safe 500 "+JSON.stringify("worksPage" in product ? product.worksPage : product.name).slice(0,30),async()=>{
    reset({menu:{products:[product]}});owner();await errorResponse(500,"OWNER_READ_MODEL_FAILED",base.slug);assert.equal(projections,1);
  });
  await check("Lookup / errors","unexpected projection exception never leaks",async()=>{
    reset();owner();projectionFault=()=>{throw Error("/srv/private/"+marker)};await errorResponse(500,"INTERNAL_ERROR");
  });
  await check("Lookup / errors","projection failure details never returned",async()=>{
    reset();owner();projectionFault=()=>({ok:false,errors:[{code:marker,label:marker}]});await errorResponse(500,"OWNER_READ_MODEL_FAILED");
  });
  await check("Lookup / errors","malformed A1 remains safe fatal",async()=>{
    reset();owner();traceFault=()=>({ok:true,value:{}});await errorResponse(500,"OWNER_READ_MODEL_FAILED");
  });
  await check("Lookup / errors","session internal error safely handled before IO",async()=>{
    reset();owner();cookieError=Error(marker);await errorResponse(500,"INTERNAL_ERROR");assert.equal(reads,0);
  });
  await check("Lookup / errors","authorized params failure safely handled",async()=>{
    reset();owner();const response=await request("",{get params(){throw Error(marker)}});assert.equal(response.status,500);assert.deepEqual(await response.json(),service.worksArtworkOwnerReadFailure("INTERNAL_ERROR"));assert.equal(reads,0);
  });

  for(const product of products) await check("Canonical 25",product.slug,async()=>{
    reset();const inputCopy=JSON.stringify(product);const r=good(await service.readWorksArtworkOwnerModel(product.slug));
    assert.equal(reads,1);assert.equal(projections,1);assert.ok(traceCalls>0&&traceCalls<=20);
    assert.equal(field(r,"identity.name").value,product.name);assert.equal(field(r,"system.slug").value,product.slug);
    assert.equal(r.fields.length,52);assert.equal(r.sections.length,10);assert.equal(r.capability,"READ_ONLY");assert.equal(r.contract,"DISPLAY_ONLY_NOT_WRITE_PAYLOAD");
    assert.deepEqual(r.warnings,[]);assert.equal(r.systemInfo.namespace,"LEGACY_UNMANAGED");assert.equal(r.systemInfo.worksRevision,null);
    assert.equal(r.systemInfo.contractVersion,null);assert.equal(r.futureCandidates.length,0);assert.ok(!Object.hasOwn(product,"worksPage"));assert.ok(!Object.hasOwn(product,"revision"));assert.ok(!Object.hasOwn(product,"token"));
    assert.ok(r.fields.every(f=>f.editing.editableHere===false&&(f.source.binding as string)!=="PRODUCTION_BOUND"));assert.equal(field(r,"media.hero").source.binding,"MODEL_ONLY");
    assert.equal(JSON.stringify(product),inputCopy);assert.equal(r.publicStates.worksList.state,listing.isProductListedInWorks(product)?"YES":"NO");assert.equal(r.publicStates.worksList.basis,"CALLER_DERIVED");
    assert.equal(r.publicStates.detailPage.state,"UNKNOWN");assert.equal(r.publicStates.purchase.state,"UNKNOWN");assert.equal(r.commerceSummary.availability,"unknown");
  });
  await check("Canonical 25","no Product initialization / runtime file mutation",()=>{
    assert.equal(JSON.stringify(canonical),inputBefore);assert.deepEqual(readFileSync(path.join(root,"public/data/website-data.json")),canonicalBytes);assert.deepEqual(readFileSync(path.join(root,"public/data/homepage.json")),ownerBytes);assert.equal(writes,0);
  });
  for(const [label,product,key]of [["mood",base,"product.mood"],["short",{...base,mood:""},"product.shortCopy"],["subtitle",{...base,mood:"",shortCopy:""},"product.subtitle"]]) await check("Semantics","story selected source "+label,async()=>{
    reset({menu:{products:[product]}});const result=good(await service.readWorksArtworkOwnerModel(base.slug));assert.equal(field(result,"content.story").source.key,key);
  });
  for(const product of [{...base,status:"hidden"},{...base,status:"sold_out",showWhenSoldOut:false},{...base,status:"discontinued"},{...base,inMonthlyMenu:false},{...base,inMonthlyMenu:true}]) await check("Semantics","canonical Works selector "+JSON.stringify(product),async()=>{
    reset({menu:{products:[product]}});const result=good(await service.readWorksArtworkOwnerModel(base.slug));assert.equal(result.publicStates.worksList.state,listing.isProductListedInWorks(product)?"YES":"NO");assert.equal(result.publicStates.detailPage.state,"UNKNOWN");
  });
  for(const related of [undefined,{productIds:[]},{productIds:["b","a"],title:"Related title"}]) await check("Semantics","Related manual/auto "+JSON.stringify(related),async()=>{
    const other=[{name:"A",slug:"a",inMonthlyMenu:true},{name:"B",slug:"b",inMonthlyMenu:true}];const product={...base,...(related===undefined?{}:{relatedProducts:related})},catalog=[product,...other];
    reset({menu:{products:catalog}});const result=good(await service.readWorksArtworkOwnerModel(base.slug));const expected=originalProjection({product,catalog,publicStates:{worksList:"YES"}});assert.ok(expected.ok);assert.deepEqual(result,expected.value);
  });
  await check("Semantics","Commerce remains unknown despite raw SKU/stock/publish fields",async()=>{
    reset({menu:{products:[{...base,stock:100,purchasable:true,publish:{website:true},skus:[{price:700,stock:100}],purchase:[{price:500}],commerceSummary:{priceText:"Invented"}}]}});const r=good(await service.readWorksArtworkOwnerModel(base.slug));
    assert.deepEqual(r.commerceSummary,{priceText:null,availability:"unknown",variantLabels:[],availableChoiceCount:null});assert.equal(r.publicStates.purchase.state,"UNKNOWN");
  });
  await check("Semantics","Gallery failure remains local through HTTP",async()=>{
    const p={...base,pageLayout:{galleryAssets:["isolated"]},assets:{hero:{path:"/uploads/hero.webp"},isolated:{path:"/uploads/gallery.webp",caption:"Gallery marker"}},relatedProducts:{productIds:["a"]}},catalog=[p,{name:"A",slug:"a"}];
    reset({menu:{products:catalog}});owner();const healthy=good((await(await request(base.slug)).json()) as WorksArtworkOwnerReadResult);let injections=0;
    traceFault=(original,args)=>{if(args[0]?.assets?.isolated?.caption==="Gallery marker"){injections++;return{ok:false,errors:[{code:"UNSAFE_OR_UNSUPPORTED_SNAPSHOT",ruleId:"artwork",message:marker}]}}return original(...args)};
    const response=await request(base.slug),broken=good(await response.json());assert.equal(response.status,200);assert.equal(injections,1);assert.equal(broken.warnings.length,1);assert.equal(broken.warnings[0].fieldId,"media.gallery");
    assert.deepEqual(broken.fields.filter(f=>f.id!=="media.gallery"),healthy.fields.filter(f=>f.id!=="media.gallery"));assert.deepEqual(broken.relatedWorks,healthy.relatedWorks);assert.ok(!JSON.stringify(broken).includes(marker));
  });
  await check("Safety / detachment","nested private Product/Commerce/source markers excluded from HTTP",async()=>{
    const p=freeze({...base,private:{marker},session:{token:marker},skus:[{private:marker}],purchase:[{private:marker}],assets:{hero:{path:"/uploads/hero.webp",private:{marker}}},relatedProducts:{productIds:["a"],private:{marker}}});
    const catalog=freeze([p,{name:"Other",slug:"a",private:{marker}}]);const data=freeze({menu:{products:catalog},private:{marker}}),before=JSON.stringify(data);
    reset(data);owner();const response=await request(base.slug),text=await response.text();assert.equal(response.status,200);assert.ok(!text.includes(marker));const body=JSON.parse(text);
    assert.deepEqual(Object.keys(body),["ok","data"]);assert.ok(!Object.hasOwn(body,"product"));assert.ok(!Object.hasOwn(body.data,"catalog"));assert.equal(JSON.stringify(data),before);
  });
  await check("Safety / detachment","returned DTO mutation cannot affect future reads / registry",async()=>{
    const catalog=[{...base,assets:{hero:{path:"/uploads/hero.webp"}},relatedProducts:{productIds:["a"]}},{name:"Other",slug:"a"}];reset({menu:{products:catalog}});
    const before=content,first:any=good(await service.readWorksArtworkOwnerModel(base.slug)),expected=JSON.stringify(first);
    (field(first,"identity.name") as any).value="Changed";field(first,"media.hero").source.trace!.media!.role="Changed";first.relatedWorks.items[0].name="Changed";first.commerceSummary.variantLabels.push("Changed");
    assert.equal(content,before);assert.equal(JSON.stringify(good(await service.readWorksArtworkOwnerModel(base.slug))),expected);assert.equal(JSON.stringify(registry.WORKS_OWNER_FIELD_REGISTRY),registryBefore);
  });
  await check("Safety / detachment","A-B-A and changed canonical source never use stale DTO",async()=>{
    reset();const a=await service.readWorksArtworkOwnerModel(products[0].slug),b=await service.readWorksArtworkOwnerModel(products[1].slug),again=await service.readWorksArtworkOwnerModel(products[0].slug);assert.deepEqual(a,again);assert.notDeepEqual(a,b);
    reset({menu:{products:[{...base,mood:"New current story"}]}});assert.equal(field(good(await service.readWorksArtworkOwnerModel(base.slug)),"content.story").value,"New current story");
    reset({menu:{products:[base]}});assert.equal(field(good(await service.readWorksArtworkOwnerModel(base.slug)),"content.story").value,base.mood);
  });
  await check("Architecture","server boundary and narrow dependencies",()=>{
    const s=readFileSync(path.join(root,"lib/worksArtworkOwnerReadService.ts"),"utf8"),r=readFileSync(path.join(root,routeId),"utf8");
    assert.match(s,/import "server-only"/);assert.match(s,/readFile\(getWebsiteDataFile\(\), "utf8"\)/);assert.match(s,/projectWorksArtworkOwner\(/);
    assert.doesNotMatch(s,/getLiveWebsiteData\s*\(|writeFile|mkdir|atomicWrite|withFileLock|fetch\s*\(|createStoreRepository|readPageStore/);
    assert.match(r,/requireAdminAuthenticated\(\)/);assert.match(r,/session\.role !== "owner"/);assert.match(r,/AdminAuthorizationError\(403\)/);
    assert.deepEqual(Object.keys(route).sort(),["GET","dynamic","runtime"]);assert.equal(route.runtime,"nodejs");assert.equal(route.dynamic,"force-dynamic");
  });
  await check("Architecture","all six ambiguous IDs remain blocked",()=>{
    assert.deepEqual([...registry.OWNER_BLOCKED_COPY_IDS],[4,8,16,18,20,29]);assert.equal(Object.keys(registry.WORKS_OWNER_FIELD_REGISTRY).length,52);
  });
  await check("Architecture","read-only in-process test has no writes/network",()=>{assert.equal(writes,0);assert.equal(network,0);assert.deepEqual(readFileSync(path.join(root,"public/data/homepage.json")),ownerBytes)});
} finally {
  globalThis.fetch=originalFetch;
  if(originalSecret===undefined)delete process.env.ADMIN_SESSION_SECRET;else process.env.ADMIN_SESSION_SECRET=originalSecret;
}
let passed=0,failed=0;
for(const group of groups){passed+=counts[group].pass;failed+=counts[group].fail;console.log(group+": "+counts[group].pass+" PASS / "+counts[group].fail+" FAIL")}
console.log("W3.2A-3 OWNER READ TRANSPORT: "+passed+" PASS / "+failed+" FAIL");
if(failed)process.exitCode=1;
