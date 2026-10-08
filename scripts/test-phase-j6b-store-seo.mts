import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createStoreRepository, StoreRevisionConflictError } from "../lib/storeRepository";
import { validateStoreCatalog, validateStoreProduct, StoreValidationError } from "../lib/storeValidation";

type Test = (label: string, operation: () => unknown | Promise<unknown>) => Promise<void>;
export async function runStoreSeoTests(test: Test, root: string) {
  // Shared J.6B worker writes at this same deterministic instant.
  const timestamp = "2026-10-08T00:00:00.000Z";
  const repository = createStoreRepository({dataRoot:root, now:()=>new Date(timestamp)});
  await repository.createSection({id:"seo-section", name:"SEO", slug:"seo", published:true});
  const input = (id: string, extra: Record<string, unknown> = {}) => ({id,name:"商品名稱",slug:id,sku:id,sectionId:"seo-section",price:300,inventory:5,pvValue:0.125,...extra});
  const current = async () => (await repository.read()).products.find(p=>p.id==="seo-both")!;
  const disk = async () => ({bytes:await fs.readFile(repository.catalogPath,"utf8"),backups:(await fs.readdir(path.join(root,"store-domain/backups"))).sort()});
  const reject = async (operation: () => unknown | Promise<unknown>, errorType: typeof StoreValidationError | typeof StoreRevisionConflictError = StoreValidationError) => {
    const before=await disk(); await assert.rejects(async()=>operation(),errorType); assert.deepEqual(await disk(),before);
  };
  await test("SEO: legacy Product without SEO validates and loads",async()=>{
    const legacy=await repository.createProduct(input("seo-legacy")); validateStoreProduct(legacy); validateStoreCatalog(await repository.read());
    assert.equal(Object.hasOwn(legacy,"seoTitle"),false); assert.equal(Object.hasOwn(legacy,"seoDescription"),false);
  });
  await test("SEO: title alone is accepted",async()=>{const p=await repository.createProduct(input("seo-title",{seoTitle:"手動標題"})); assert.equal(p.seoTitle,"手動標題"); assert.equal(Object.hasOwn(p,"seoDescription"),false);});
  await test("SEO: description alone is accepted",async()=>{const p=await repository.createProduct(input("seo-description",{seoDescription:"手動說明"})); assert.equal(p.seoDescription,"手動說明"); assert.equal(Object.hasOwn(p,"seoTitle"),false);});
  await test("SEO: both fields are accepted",async()=>{const p=await repository.createProduct(input("seo-both",{seoTitle:"手動標題",seoDescription:"手動說明",published:true})); assert.equal(p.seoTitle,"手動標題"); assert.equal(p.seoDescription,"手動說明");});
  await test("SEO: fresh repository round-trip preserves title",async()=>{const p=(await createStoreRepository({dataRoot:root}).read()).products.find(p=>p.id==="seo-both")!; assert.equal(p.seoTitle,"手動標題");});
  await test("SEO: fresh repository round-trip preserves description",async()=>{const p=(await createStoreRepository({dataRoot:root}).read()).products.find(p=>p.id==="seo-both")!; assert.equal(p.seoDescription,"手動說明");});
  await test("SEO: absent fields remain absent through unrelated save",async()=>{const p=(await repository.read()).products.find(p=>p.id==="seo-legacy")!; await repository.updateProduct(p.id,p.revision,{inventory:8}); const saved=(await repository.read()).products.find(p=>p.id===p.id)!; assert.equal(Object.hasOwn(saved,"seoTitle"),false); assert.equal(Object.hasOwn(saved,"seoDescription"),false);});
  for(const [key,max] of [["seoTitle",160],["seoDescription",500]] as const) {
    await test(`SEO: non-string ${key} is rejected on create`,()=>reject(()=>repository.createProduct(input("seo-invalid",{[key]:42}))));
    await test(`SEO: non-string ${key} is rejected on update`,async()=>{const p=await current(); await reject(()=>repository.updateProduct(p.id,p.revision,{[key]:null}));});
    await test(`SEO: excessive ${key} is rejected on create`,()=>reject(()=>repository.createProduct(input("seo-invalid",{[key]:"x".repeat(max+1)}))));
    await test(`SEO: excessive ${key} is rejected on update`,async()=>{const p=await current(); await reject(()=>repository.updateProduct(p.id,p.revision,{[key]:"x".repeat(max+1)}));});
  }
  await test("SEO: blank create values normalize to absent",async()=>{const p=await repository.createProduct(input("seo-blank",{seoTitle:"  ",seoDescription:"\n\t"})); assert.equal(Object.hasOwn(p,"seoTitle"),false); assert.equal(Object.hasOwn(p,"seoDescription"),false);});
  await test("SEO: unrelated save preserves manual values without synthesizing fallback",async()=>{const p=await current(); const saved=await repository.updateProduct(p.id,p.revision,{shortDescription:"自動說明來源"}); assert.equal(saved.seoTitle,p.seoTitle); assert.equal(saved.seoDescription,p.seoDescription);});
  await test("SEO: SEO edits preserve established published slug and other domain fields",async()=>{const p=await current(); const saved=await repository.updateProduct(p.id,p.revision,{seoTitle:"新標題",seoDescription:"新說明"}); for(const key of ["slug","price","inventory","pvValue","sectionId","sku","productType","subscriptionEligible","published"] as const)assert.equal(saved[key],p[key]); assert.deepEqual(saved.gallery,p.gallery); assert.deepEqual(saved.specifications,p.specifications); assert.equal(saved.revision,p.revision+1);});
  await test("SEO: name edit does not change published slug",async()=>{const p=await current(); const saved=await repository.updateProduct(p.id,p.revision,{name:"新商品名稱"}); assert.equal(saved.slug,p.slug);});
  await test("SEO: stale revision cannot overwrite manual values",async()=>{const p=await current(); await reject(()=>repository.updateProduct(p.id,p.revision-1,{seoTitle:"stale"}),StoreRevisionConflictError);});
  await test("SEO: blank patch clears only explicitly supplied SEO field",async()=>{const p=await current(); const saved=await repository.updateProduct(p.id,p.revision,{seoTitle:" "}); assert.equal(Object.hasOwn(saved,"seoTitle"),false); assert.equal(saved.seoDescription,p.seoDescription);});
  await test("SEO: boundary lengths accepted and explicit manual text preserved",async()=>{const p=await current(); const saved=await repository.updateProduct(p.id,p.revision,{seoTitle:"x".repeat(160),seoDescription:"x".repeat(500)}); assert.equal(saved.seoTitle?.length,160); assert.equal(saved.seoDescription?.length,500);});
  await test("SEO: independent writers keep optimistic revision protection",async()=>{
    const p=await current();
    type WorkerResult = { title: string; code: number | null; stdout: string; stderr: string };
    const worker=(title:string)=>new Promise<WorkerResult>((resolve,reject)=>{
      const child=spawn(process.execPath,["--experimental-strip-types","--import",pathToFileURL(path.resolve("scripts/member-auth-test-bootstrap.mjs")).href,path.resolve("scripts/test-phase-j6b-store-domain.mts"),"--worker",root,p.id,String(p.revision),JSON.stringify({seoTitle:title})],{cwd:process.cwd(),env:process.env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
      let stdout="",stderr="";
      child.stdout.on("data",data=>{stdout+=String(data);});
      child.stderr.on("data",data=>{stderr+=String(data);});
      child.on("error",error=>reject(Error(JSON.stringify({title,stdout,stderr,error:String(error)}))));
      child.on("close",code=>resolve({title,code,stdout,stderr}));
    });
    const results=await Promise.all([worker("writer-a"),worker("writer-b")]);
    console.log("SEO worker diagnostics: "+JSON.stringify(results));
    assert.deepEqual(results.map(result=>result.code).sort(),[0,42],JSON.stringify(results));
    const saved=await current(); assert.equal(saved.revision,p.revision+1); assert.ok(["writer-a","writer-b"].includes(saved.seoTitle!)); assert.equal(saved.pvValue,p.pvValue);
  });
  await test("SEO: archive preserves manual values and existing domain semantics",async()=>{const p=await current(); const saved=await repository.archiveProduct(p.id,p.revision); assert.equal(saved.seoTitle,p.seoTitle); assert.equal(saved.seoDescription,p.seoDescription); assert.equal(saved.pvValue,p.pvValue); assert.equal(saved.slug,p.slug); assert.equal(saved.published,false); assert.equal(saved.active,false); assert.equal(saved.revision,p.revision+1); assert.ok(saved.archivedAt); validateStoreCatalog(await repository.read());});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"kd-j6b-seo-"));
  let passed=0;
  try {
    await runStoreSeoTests(async(label,operation)=>{try{await operation();console.log(`PASS ${++passed} ${label}`);}catch(error){console.error(`FAIL ${label}`);throw error;}},root);
    console.log(`J.6B Store SEO: ${passed}/${passed} PASS`);
  } finally {await fs.rm(root,{recursive:true,force:true});}
}
