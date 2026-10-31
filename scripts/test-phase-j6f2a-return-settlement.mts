/* eslint-disable react/no-children-prop -- Non-JSX fixture Provider overload requires its children prop. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { runInventoryOrderTransaction } from "../lib/orderInventoryTransaction";
import { legacyReturnStockFixture, legacyReturnJournalDirectory } from "./return-settlement-fixture-support";
import { withStoredOrderUpdateLock, readOrder } from "../lib/adminOrders";
import { prepareOrderCompletionWrite } from "../lib/orderCompletion";
import { executeOrderReturnCommand, readMembershipCommerceState, validateMembershipCommerceState, recordValidConsumptionFromCompletedOrder, readReturnConsumptionReductions } from "../lib/membershipCommerce";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules, getActiveMembershipRules } from "../lib/membershipBusinessRules";
import { getReturnWorkflow, adminReturnAction } from "../lib/returnWorkflow";
import { applyApprovedReturnInventory } from "../lib/returnInventorySettlement";
import { projectReturnSettlements, returnInventorySummary } from "../lib/returnSettlementLedger";
import { originalEconomicFingerprint } from "../lib/orderRewardBasis";
import { readReturnStockReceipts } from "../lib/returnInventoryTransaction";
import { POST } from "../app/api/admin/returns/[orderNumber]/route";
import { createAdminSessionValue, adminCookieName } from "../lib/adminAuth";
import Provider from "../components/member/MemberCenterCopyProvider";
import MemberReturnWorkflow from "../components/member/MemberReturnWorkflow";
import { AdminReturnDetail } from "../components/admin/AdminReturnWorkflow";

const script = fileURLToPath(import.meta.url), bootstrap = new URL("./return-settlement-test-bootstrap.mjs", import.meta.url).href;
for (const key of ["LINE_CHANNEL_ACCESS_TOKEN","LINE_INTERNAL_CHANNEL_ACCESS_TOKEN","LINE_INTERNAL_RECIPIENT_ID"]) delete process.env[key];
process.env.RETURN_REQUEST_LINE_NOTIFICATION_ENABLED = "false";
process.env.AUTH_SESSION_SECRET = "j6f2a-isolated-auth-secret-longer-than-thirty-two";
process.env.ADMIN_SESSION_SECRET = "j6f2a-isolated-admin-secret-longer-than-thirty-two";
if (process.argv[2]?.startsWith("--worker")) {
  process.env.KD_DATA_DIR = process.argv[3];
  await applyApprovedReturnInventory(process.argv[4], process.argv[5], process.argv[2] === "--worker-crash" ? { hook: async phase => { if (phase === "AFTER_RESTORE") process.exit(81); } } : {});
} else {
  const suite = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f2a-settlement-"));
  const oldRoot = process.env.KD_DATA_DIR;
  // Self-contained guard: no ignored QA report/backup file is needed to run this suite.
  async function snapshot(root:string, start="", output:Record<string,string>={}):Promise<Record<string,string>> {
    const entries=await fs.readdir(path.join(root,start),{withFileTypes:true}).catch((error:NodeJS.ErrnoException)=>{if(error.code==="ENOENT")return [];throw error;});
    for(const entry of entries){if(["node_modules",".next","qa-output",".git","tsconfig.tsbuildinfo"].includes(entry.name))continue;const relative=path.join(start,entry.name);if(entry.isDirectory())await snapshot(root,relative,output);else if(entry.isFile())output[relative.replaceAll("\\","/")]=createHash("sha256").update(await fs.readFile(path.join(root,relative))).digest("hex");}
    return output;
  }
  const protectedFiles:Record<string,string>={};
  for(const dir of ["data","public/data","public/uploads"])await snapshot(process.cwd(),dir,protectedFiles);
  for(const name of await fs.readdir(process.cwd()))if(/^README|^PATCH_MANIFEST/.test(name)&&(await fs.stat(name)).isFile())protectedFiles[name]=createHash("sha256").update(await fs.readFile(name)).digest("hex");
  const priorSource="F:/KD_Coffee_Studio_J6F1_RETURN_DEV_20261028";
  const priorSnapshot=await snapshot(priorSource);
  const baseline={protectedFiles,previous:{source:priorSource,files:Object.entries(priorSnapshot).map(([path,sha256])=>({path,sha256}))}};
  let count = 0, sequence = 0;
  const check = async (label: string, fn: () => unknown | Promise<unknown>) => { await fn(); console.log("PASS " + (++count) + " " + label); };
  type Mode = "coffee" | "store" | "mixed";
  async function fixture(mode: Mode = "coffee", legacy = false) {
    const root = path.join(suite, "case-" + (++sequence)); process.env.KD_DATA_DIR = root;
    await fs.mkdir(path.join(root, "store"), { recursive: true });
    await fs.writeFile(path.join(root,"store/website-data.json"), JSON.stringify({ version: 1, menu: { products: [{ id: "coffee-product", slug: "coffee-original", name: "Coffee", active: true, purchasable: true,
      skus: [{ id: "coffee-sku", kind: "beans", label: "Coffee", detail: "227g", enabled: true, price: 500, stock: 20, pvEnabled: true, pvValue: 20 }] }] } }));
    const catalogPath=path.join(root,"store-domain/catalog.json");
    const repository={catalogPath,read:async()=>JSON.parse(await fs.readFile(catalogPath,"utf8"))};
    await fs.mkdir(path.dirname(catalogPath),{recursive:true});await fs.writeFile(catalogPath,JSON.stringify({schemaVersion:1,revision:0,products:[{id:"store-product",inventory:30}]}));
    await saveMembershipBusinessRules({ expectedRevision: 0, rules: structuredClone(DEFAULT_MEMBERSHIP_RULES) });
    const created = legacy ? await (async () => {
      const result = await runInventoryOrderTransaction({ websiteFile: path.join(root,"store/website-data.json"), orderDir: path.join(root,"orders"),
        initialOrderNumber: "KD20261029-" + (50000 + sequence), generateOrderNumber: () => "KD20261029-" + (50000 + sequence),
        items: [{ slug: "coffee-original", optionId: "coffee-sku", optionLabel: "Coffee", quotedUnitPrice: 500, quantity: 10, preparationLabel: "咖啡豆" }],
        buildOrder: (orderNumber,priced) => ({ order: { orderNumber, createdAt: new Date().toISOString(), orderMode: "studio_pickup", status: "waiting_studio_pickup_confirmation", customer: { name: "Legacy Fixture" }, ...priced }, lineText: "isolated" }) });
      return { state: result.finalized ? "FINALIZED" : "PENDING", order: result.order, orderNumber: result.orderNumber };
    })() : await legacyReturnStockFixture(root,"KD20261029-"+(50000+sequence),mode);
    assert.equal(created.state, "FINALIZED"); assert.ok(created.order);
    await withStoredOrderUpdateLock(created.orderNumber, async (order,persist) => {
      await persist(await prepareOrderCompletionWrite(order, { ...order, status: "completed", member: { memberId: "isolated-member" } }) as typeof order);
    });
    const order = await readOrder(created.orderNumber); assert.ok(order);
    const view = await getReturnWorkflow(created.orderNumber, "isolated-member");
    const refs = view.lines.map(line => line.returnLineRef);
    const bytes = await fs.readFile(path.join(root,"orders",created.orderNumber+".json"), "utf8");
    return { root, id: created.orderNumber, refs, bytes, repository, mode };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const activate = (f: Fixture) => { process.env.KD_DATA_DIR = f.root; };
  async function request(f: Fixture, quantity: number, index = 0) {
    activate(f);
    const result = await executeOrderReturnCommand({ orderNumber: f.id, actor: { actorId: "isolated-member", authority: "customer" },
      command: { type: "RETURN_REQUESTED", lines: [{ returnLineRef: f.refs[index], quantity }], conditionAcknowledgement: { itemsComplete: true, unopenedUnusedWhereApplicable: true } },
      reason: "isolated return", idempotencyKey: randomUUID(), authorizeOrder: () => {} });
    assert.equal(result.status,"applied"); if(result.status!=="applied")throw Error("Request failed");return result.event.returnRequestId;
  }
  async function stock(f: Fixture) {
    const coffee = JSON.parse(await fs.readFile(path.join(f.root,"store/website-data.json"),"utf8"));
    const store = await f.repository.read(); return [coffee.menu.products[0].skus[0].stock, store.products[0].inventory];
  }
  async function state(f: Fixture) { return readMembershipCommerceState(path.join(f.root,"membership-commerce/commerce-state.json")); }
  async function approve(f: Fixture, rid: string, quantity?: number, key = "approve-"+rid, index = 0) {
    activate(f);return adminReturnAction(f.id,"owner",{ action: "approve", returnRequestId: rid, reason: "reviewed", idempotencyKey: key,
      ...(quantity !== undefined ? { approvedLines: [{ returnLineRef: f.refs[index], quantity }] } : {}) });
  }
  async function approveOutbox(f: Fixture, rid: string, quantity: number, index = 0) {
    activate(f);const result=await executeOrderReturnCommand({ orderNumber:f.id, actor:{actorId:"owner",authority:"reviewer"},command:{type:"RETURN_APPROVED",returnRequestId:rid,approvedLines:[{returnLineRef:f.refs[index],quantity}]},reason:"reviewed",idempotencyKey:"outbox-"+rid,authorizeOrder:()=>{} });assert.equal(result.status,"applied");return result;
  }
  async function worker(f: Fixture, rid: string) {
    await new Promise<void>((resolve,reject)=>{ const child=spawn(process.execPath,["--experimental-strip-types","--import",bootstrap,script,"--worker",f.root,f.id,rid],{windowsHide:true,stdio:["ignore","pipe","pipe"]});let output="";child.stdout.on("data",data=>{output+=data;});child.stderr.on("data",data=>{output+=data;});child.on("error",reject);child.on("exit",code=>code===0?resolve():reject(Error(output))); });
  }
  try {
    const no = await fixture(), initial = await stock(no), rid = await request(no,4);
    await check("requested stock +0 and no settlement effects", async()=>{assert.deepEqual(await stock(no),initial);assert.equal(projectReturnSettlements(await state(no)).length,0);});
    await adminReturnAction(no.id,"owner",{action:"lock",returnRequestId:rid,reason:"processing",idempotencyKey:"lock"});
    await check("processing lock stock +0", async()=>assert.deepEqual(await stock(no),initial));
    await adminReturnAction(no.id,"owner",{action:"reject",returnRequestId:rid,reason:"not eligible",idempotencyKey:"reject"});
    await check("rejected stock +0 and no inventory effect", async()=>{assert.deepEqual(await stock(no),initial);assert.equal(projectReturnSettlements(await state(no)).length,0);});
    const withdrawn=await request(no,2);
    await executeOrderReturnCommand({orderNumber:no.id,actor:{actorId:"isolated-member",authority:"customer"},command:{type:"RETURN_WITHDRAWN",returnRequestId:withdrawn},reason:"withdrawn",idempotencyKey:"withdraw",authorizeOrder:()=>{}});
    await check("withdrawn stock +0", async()=>assert.deepEqual(await stock(no),initial));
    const f=await fixture(), r=await request(f,4), beforeState=await state(f);
    await approve(f,r,3);
    await check("Coffee request 4 / approve 3 restores exactly +3", async()=>assert.deepEqual(await stock(f),[13,30]));
    await check("partial remainder is rejected and quantity projection is accurate", async()=>{const view=await getReturnWorkflow(f.id);assert.equal(view.requests[0].approvedLines?.[0].quantity,3);assert.equal(view.requests[0].rejectedLines?.[0].quantity,1);assert.equal(view.lines[0].approvedQuantity,3);assert.equal(view.lines[0].remainingReturnableQuantity,7);});
    await approve(f,r,3);
    await check("same approval retry adds +0", async()=>assert.deepEqual(await stock(f),[13,30]));
    await check("APPLIED receipt uses original APPLY linkage and exact quantity", async()=>{const effect=projectReturnSettlements(await state(f)).find(item=>item.effectType==="inventory_restore")!;assert.equal(effect.status,"applied");assert.equal(effect.receipt?.items[0].quantity,3);assert.ok(effect.receipt?.parentOperationId?.startsWith("apply:"));});
    await check("payment remains future; zero-credit effect settles without wallet mutation", async()=>{const effects=projectReturnSettlements(await state(f)).filter(item=>item.effectType!=="inventory_restore");assert.equal(effects.length,2);assert.equal(effects.find(item=>item.effectType==="payment_refund")?.status,"pending_future_settlement");const credit=effects.find(item=>item.effectType==="member_credit_restore");assert.equal(credit?.status,"applied");assert.equal(credit?.creditResult?.restoredAmount,0);});
    await check("no member-credit balance mutation", async()=>{const after=await state(f);assert.deepEqual(after.creditEntries,beforeState.creditEntries);assert.deepEqual(after.creditReservations,beforeState.creditReservations);});
    await check("completed source order and payment bytes never changed", async()=>assert.equal(await fs.readFile(path.join(f.root,"orders",f.id+".json"),"utf8"),f.bytes));
    const multi=await fixture(), a=await request(multi,2);await approve(multi,a,2);const b=await request(multi,3);
    await check("multiple returns pending B restores no additional stock", async()=>assert.deepEqual(await stock(multi),[12,30]));
    await approve(multi,b,1);await approve(multi,a,2);await approve(multi,b,1);
    await check("multiple partial approvals cumulatively restore 2+1 exactly once", async()=>{assert.deepEqual(await stock(multi),[13,30]);assert.equal((await getReturnWorkflow(multi.id)).lines[0].approvedQuantity,3);});
    const store=await fixture("store"), sr=await request(store,4);await approve(store,sr,3);
    await check("Store restores correct Store product only", async()=>assert.deepEqual(await stock(store),[20,23]));
    const legacyCoffee=await fixture("coffee",true), legacyId=await request(legacyCoffee,4);await approve(legacyCoffee,legacyId,3);await approve(legacyCoffee,legacyId,3);
    await check("Production committed Coffee evidence supports partial idempotent restoration without checkout changes",async()=>assert.deepEqual(await stock(legacyCoffee),[13,30]));
    const concurrent=await fixture(), cr=await request(concurrent,4);
    const globals=globalThis as typeof globalThis & {__returnCookies?:Record<string,string>};globals.__returnCookies={[adminCookieName]:createAdminSessionValue({adminId:"owner",role:"owner"})};
    const http=()=>POST(new Request("http://localhost:3161/api/admin/returns/"+concurrent.id,{method:"POST",headers:{Origin:"http://localhost:3161","Content-Type":"application/json"},body:JSON.stringify({action:"approve",returnRequestId:cr,reason:"reviewed",idempotencyKey:"duplicate-http",approvedLines:[{returnLineRef:concurrent.refs[0],quantity:3}]})}),{params:Promise.resolve({orderNumber:concurrent.id})});
    const responses=await Promise.all([http(),http()]);
    await check("concurrent duplicate HTTP approvals both succeed without duplicate stock", async()=>{assert.ok(responses.every(response=>response.status===200));assert.deepEqual(await stock(concurrent),[13,30]);});
    const racing=await fixture(), rr=await request(racing,3);await approveOutbox(racing,rr,3);
    await check("approval and pending outbox are persisted atomically before any restore", async()=>{assert.deepEqual(await stock(racing),[10,30]);assert.equal(returnInventorySummary(await state(racing),rr).status,"pending");});
    await Promise.all([worker(racing,rr),worker(racing,rr)]);
    await check("concurrent separate processes restore stock once", async()=>assert.deepEqual(await stock(racing),[13,30]));
    const retry=await fixture(), retryId=await request(retry,3);await approveOutbox(retry,retryId,3);
    await applyApprovedReturnInventory(retry.id,retryId,{hook:async phase=>{if(phase==="BEFORE_RESTORE")throw Error("temporary failure");}});
    await check("transient failure preserves approval and retryable FAILED effect", async()=>{assert.deepEqual(await stock(retry),[10,30]);assert.equal(returnInventorySummary(await state(retry),retryId).status,"failed");assert.equal((await getReturnWorkflow(retry.id)).requests[0].status,"approved");});
    await worker(retry,retryId);await worker(retry,retryId);
    await check("fresh process retries FAILED effect then replays with +0", async()=>assert.deepEqual(await stock(retry),[13,30]));
    const crash=await fixture(), crashId=await request(crash,3);await approveOutbox(crash,crashId,3);
    const exited=spawnSync(process.execPath,["--experimental-strip-types","--import",bootstrap,script,"--worker-crash",crash.root,crash.id,crashId],{encoding:"utf8",windowsHide:true});assert.equal(exited.status,81,exited.stderr);
    await check("hard process exit after atomic receipt leaves stock restored and effect pending", async()=>{assert.deepEqual(await stock(crash),[13,30]);assert.equal(returnInventorySummary(await state(crash),crashId).status,"pending");});
    // Match the mature inventory protocol: stale locks are never auto-deleted in production.
    // Explicit fixture-only recovery after the owning worker has definitely exited.
    async function clearDeadFixtureLocks(dir:string):Promise<void>{assert.ok(path.resolve(dir).startsWith(path.resolve(suite)+path.sep));for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await clearDeadFixtureLocks(file);else if(entry.name.endsWith(".lock")){const owner=JSON.parse(await fs.readFile(file,"utf8"));assert.equal(owner.pid,exited.pid);await fs.unlink(file);}}}
    await clearDeadFixtureLocks(crash.root);await worker(crash,crashId);
    await check("hard-crash recovery recognizes receipt and never restores twice", async()=>{assert.deepEqual(await stock(crash),[13,30]);assert.equal(returnInventorySummary(await state(crash),crashId).status,"applied");});
    const manual=await fixture(), manualId=await request(manual,3);await approveOutbox(manual,manualId,3);
    const file=path.join(manual.root,"orders",manual.id+".json"), legacy=JSON.parse(await fs.readFile(file,"utf8"));delete legacy.inventoryTransaction;await fs.writeFile(file,JSON.stringify(legacy));
    await applyApprovedReturnInventory(manual.id,manualId);
    await check("unsupported historical identity fails manual with no guessed stock", async()=>{assert.deepEqual(await stock(manual),[10,30]);assert.equal(returnInventorySummary(await state(manual),manualId).status,"manual_review_required");});
    const mixed=await fixture("mixed"), mr=await request(mixed,2,0), ms=await request(mixed,3,1);await approve(mixed,mr,1);await approve(mixed,ms,2,"store-approve",1);
    await check("mixed Coffee/Store line identities remain separate", async()=>assert.deepEqual(await stock(mixed),[11,22]));
    await check("receipt totals never exceed approved quantities", async()=>{const doc=JSON.parse(await fs.readFile(path.join(mixed.root,"store/website-data.json"),"utf8"));assert.equal(Object.values(readReturnStockReceipts(doc)).filter(item=>item.kind==="RESTORE").reduce((sum,item)=>sum+item.items.reduce((n,line)=>n+line.quantity,0),0),1);});
    const bad=await fixture(), badId=await request(bad,2);
    await check("approval cannot exceed requested quantity", async()=>{await assert.rejects(()=>approve(bad,badId,3));assert.deepEqual(await stock(bad),[10,30]);});
    activate(f);
    await check("member presentation exposes partial decision but no settlement internals", async()=>{const view=await getReturnWorkflow(f.id,"isolated-member"),json=JSON.stringify(view);assert.ok(!json.includes("return-effect:")&&!json.includes("inventorySettlement"));const html=renderToStaticMarkup(createElement(Provider,{initialOverrides:{},children:createElement(MemberReturnWorkflow,{initial:view})}));assert.ok(html.includes("已核准 3 件；未核准 1 件"));assert.ok(!html.includes("庫存回補"));});
    await check("Admin minimum visibility shows completed approved quantity", async()=>{const html=renderToStaticMarkup(createElement(AdminReturnDetail,{initial:await getReturnWorkflow(f.id)}));assert.ok(html.includes("庫存回補"));assert.ok(html.includes("已完成：3 件"));assert.ok(!html.includes("執行退款")&&!html.includes("返還抵用金"));});
    const rewardCase=await fixture();activate(rewardCase);
    await recordValidConsumptionFromCompletedOrder({memberId:"isolated-member",orderId:rewardCase.id,idempotencyKey:"original-consumption"});
    const rewardState=await state(rewardCase), version=await getActiveMembershipRules(), createdAt=new Date().toISOString();
    rewardState.referralRewards["original-point-reward"]={rewardId:"original-point-reward",sourceOrderNumber:rewardCase.id,sourceMemberId:"isolated-member",beneficiaryMemberId:"isolated-member",referralLevel:0,rewardType:"self_purchase",qualificationAuthority:"self_purchase_direct",qualificationStatus:"qualified",calculationMode:"pv",paidAmountBasis:5000,basePV:200,effectivePV:200,discountRatio:1,rewardRate:5,rewardPV:10,pvRewardMoneyValue:2.5,calculatedCreditAmount:25,projectedCreditAmount:25,ruleVersion:version.rulesVersion,ancestrySnapshot:[],monthlyCapAmountSnapshot:0,baseWaitingDaysSnapshot:0,returnProtectionDaysSnapshot:7,totalWaitingDaysSnapshot:7,successfulPickupBusinessDate:createdAt.slice(0,10),releaseEligibleBusinessDate:"2099-01-01",sourceOrderFinalState:"completed",createdAt,eligibleAt:createdAt,scheduledReleaseAt:"2099-01-01T00:00:00Z",releasedAt:null,status:"scheduled",rewardCreditEntryId:null,reversalCreditEntryId:null,reversalPolicySnapshot:"cancel-pending-and-reverse-released",idempotencyKey:"original-point-reward"};
    await fs.writeFile(path.join(rewardCase.root,"membership-commerce/commerce-state.json"),JSON.stringify(rewardState));
    const rewardRequest=await request(rewardCase,4);await approve(rewardCase,rewardRequest,3);
    await check("partial approval D1 reduction uses 3 approved, not 4 requested",async()=>{const reduction=readReturnConsumptionReductions(await state(rewardCase));assert.equal(reduction.length,1);assert.equal(reduction[0].lines[0].approvedQuantity,3);assert.equal(reduction[0].incrementalEconomicReduction,1500);});
    await check("partial approval D reward points follow approved quantity only",async()=>{const view=await getReturnWorkflow(rewardCase.id);assert.equal(view.rewards[0].display.original,10);assert.equal(view.rewards[0].display.effective,7);assert.equal(Object.keys((await state(rewardCase)).creditEntries).length,0);});
    const another=await request(rewardCase,3);await approve(rewardCase,another,1);
    await check("multiple partial decisions preserve cumulative D1/reward attribution",async()=>{const reduction=readReturnConsumptionReductions(await state(rewardCase));assert.equal(reduction.at(-1)?.cumulativeApprovedReturnReduction,2000);assert.equal((await getReturnWorkflow(rewardCase.id)).rewards[0].display.effective,6);assert.deepEqual(await stock(rewardCase),[14,30]);});
    const orphan=structuredClone(await state(rewardCase));delete orphan.returnEvents;
    await check("orphaned settlement evidence is corruption, never silently normalized",()=>assert.throws(()=>validateMembershipCommerceState(orphan)));
    const replaced=await fixture("store"), replacedId=await request(replaced,3);await approveOutbox(replaced,replacedId,3);
    const catalog=await replaced.repository.read();catalog.products[0].id="different-current-product";catalog.products[0].inventory=7;
    await fs.writeFile(replaced.repository.catalogPath,JSON.stringify(catalog));await applyApprovedReturnInventory(replaced.id,replacedId);
    await check("same current slug with different stock identity is never guessed",async()=>{assert.deepEqual(await stock(replaced),[20,7]);assert.equal(returnInventorySummary(await state(replaced),replacedId).status,"manual_review_required");});
    const partialEffects=await fixture("mixed");activate(partialEffects);
    const both=await executeOrderReturnCommand({orderNumber:partialEffects.id,actor:{actorId:"isolated-member",authority:"customer"},command:{type:"RETURN_REQUESTED",lines:[{returnLineRef:partialEffects.refs[0],quantity:2},{returnLineRef:partialEffects.refs[1],quantity:3}],conditionAcknowledgement:{itemsComplete:true,unopenedUnusedWhereApplicable:true}},reason:"mixed fixture",idempotencyKey:"both-lines",authorizeOrder:()=>{}});assert.equal(both.status,"applied");if(both.status!=="applied")throw Error("mixed request failed");
    const bothId=both.event.returnRequestId;
    await executeOrderReturnCommand({orderNumber:partialEffects.id,actor:{actorId:"owner",authority:"reviewer"},command:{type:"RETURN_APPROVED",returnRequestId:bothId},reason:"mixed approved",idempotencyKey:"both-approved",authorizeOrder:()=>{}});
    await applyApprovedReturnInventory(partialEffects.id,bothId,{hook:async(phase,effect)=>{if(phase==="BEFORE_RESTORE"&&effect.returnLineRef===partialEffects.refs[0])throw Error("temporary Coffee failure");}});
    await check("one failed line preserves independent successful inventory effects",async()=>{assert.deepEqual(await stock(partialEffects),[10,23]);const summary=returnInventorySummary(await state(partialEffects),bothId);assert.equal(summary.appliedQuantity,3);assert.equal(summary.status,"failed");});
    await worker(partialEffects,bothId);
    await check("partial-success retry applies only unfinished inventory effect",async()=>{assert.deepEqual(await stock(partialEffects),[12,23]);assert.equal(returnInventorySummary(await state(partialEffects),bothId).appliedQuantity,5);});
    const independent=await fixture(), ia=await request(independent,2), ib=await request(independent,1);await approveOutbox(independent,ia,2);await approveOutbox(independent,ib,1);
    await Promise.all([worker(independent,ia),worker(independent,ib)]);
    await check("independent concurrent return effects conserve cumulative approved quantity",async()=>assert.deepEqual(await stock(independent),[13,30]));
    const corrupt=await fixture(), corruptId=await request(corrupt,3);await approveOutbox(corrupt,corruptId,3);
    const original=await readOrder(corrupt.id);assert.ok(original);
    const journal={directory:legacyReturnJournalDirectory(path.join(corrupt.root,"orders"),String(original.inventoryTransaction.transactionId))};
    await fs.writeFile(path.join(journal.directory,"00000000.json"),"corrupt fixture evidence");await applyApprovedReturnInventory(corrupt.id,corruptId);
    await check("corrupt original inventory journal requires manual review rather than endless retry or guessed stock",async()=>{assert.deepEqual(await stock(corrupt),[10,30]);assert.equal(returnInventorySummary(await state(corrupt),corruptId).status,"manual_review_required");});
    activate(f);
    await check("settlement ledger rejects tampered approved quantity", async()=>{const broken=structuredClone(await state(f)),entry=broken.returnSettlementEvents![0];entry.plan!.approvedQuantity=9;const {hash:unused,...payload}=entry;void unused;entry.hash=originalEconomicFingerprint(payload);assert.throws(()=>validateMembershipCommerceState(broken));});
    await check("original J6F1 worktree and protected data remain byte-identical", async()=>{for(const [file,hash]of Object.entries(baseline.protectedFiles))assert.equal(createHash("sha256").update(await fs.readFile(file)).digest("hex"),hash,file);for(const entry of baseline.previous.files)assert.equal(createHash("sha256").update(await fs.readFile(path.join(baseline.previous.source,entry.path))).digest("hex"),entry.sha256,entry.path);});
    console.log("J.6F.2A SETTLEMENT PASS "+count+"/"+count+"; isolated stock/ledger fixtures; no refund or member-credit restoration.");
  } finally {
    if(oldRoot===undefined)delete process.env.KD_DATA_DIR;else process.env.KD_DATA_DIR=oldRoot;
    assert.ok(path.resolve(suite).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(suite,{recursive:true,force:true});
  }
}
