import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import * as nodeModule from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveOrderRewardBasis } from "../lib/orderRewardBasis";
import { inventoryHash } from "../lib/inventoryReceipts";

type TestLoadContext = object;
type TestLoadResult = {
  format?: string | null;
  source?: string | ArrayBuffer | SharedArrayBuffer | Uint8Array;
  shortCircuit?: boolean;
};
// registerHooks uses synchronous hooks; only the load surface used below is described.
type TestNextLoad = (url: string, context: TestLoadContext) => TestLoadResult;
type TestLoadHook = (url: string, context: TestLoadContext, nextLoad: TestNextLoad) => TestLoadResult;
type TestRegisterHooks = (hooks: { load: TestLoadHook }) => unknown;
const nodeModuleWithHooks = nodeModule as typeof nodeModule & { registerHooks?: TestRegisterHooks };
const registerHooks = nodeModuleWithHooks.registerHooks;
if (typeof registerHooks !== "function") {
  throw new Error("This J.6F.2A test requires node:module.registerHooks at runtime.");
}

const script = fileURLToPath(import.meta.url);
const bootstrap = fileURLToPath(new URL("./member-auth-test-bootstrap.mjs", import.meta.url));
const timestamp = new Date("2026-10-12T06:37:00.000Z");
const worker = process.argv[2] === "--baseline-worker";
if (worker) {
  registerHooks({ load(url: string, context: TestLoadContext, nextLoad: TestNextLoad) {
    for (const file of ["lib/membershipCommerce.ts", "lib/fulfillment.ts"]) {
      if (url === pathToFileURL(path.join(process.cwd(), file)).href) return {
        format: "module-typescript",
        source: execFileSync("git", ["show", "HEAD:" + file], { cwd: process.cwd(), encoding: "utf8", windowsHide: true }),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  } });
}
for (const key of ["LINE_INTERNAL_CHANNEL_ACCESS_TOKEN","LINE_CHANNEL_ACCESS_TOKEN","LINE_INTERNAL_RECIPIENT_ID","LINE_ORDER_RECIPIENT_ID"]) delete process.env[key];

function sample(credit = 0, domains: "legacy" | "coffee" | "store" | "mixed" | "unknown" = "legacy") {
  const coffee = { ...(domains === "legacy" ? {} : {domain:"coffee"}), name:"Coffee", slug:"coffee",
    optionId:"coffee-sku", quantity:2, unitPrice:domains === "mixed" || domains === "unknown" ? 350 : 500,
    lineTotal:domains === "mixed" || domains === "unknown" ? 700 : 1000, basePV:35, effectivePV:30 };
  const store = {domain:domains === "unknown" ? "unknown" : "store", productId:"store-product", variantId:"default",
    name:"Store", slug:"store", quantity:4, unitPrice:130, lineTotal:520, basePV:999, effectivePV:999};
  const items = domains === "store" ? [store] : domains === "mixed" || domains === "unknown" ? [coffee,store] : [coffee];
  const subtotal = domains === "store" ? 520 : domains === "mixed" || domains === "unknown" ? 1220 : 1000;
  return { items, subtotal, shipping:60, totalBeforeCredit:subtotal+60, total:subtotal+60-credit,
    credit: {appliedAmount:credit, ...(credit ? {reservationId:"fixture-credit-proof"} : {})} };
}
async function scenario(root: string, domains: Parameters<typeof sample>[1], credit = 0, guest = false) {
  process.env.KD_DATA_DIR = root;
  const commerce = await import("../lib/membershipCommerce");
  const rulesApi = await import("../lib/membershipBusinessRules");
  const identity = await import("../lib/memberIdentity");
  const fulfillment = await import("../lib/fulfillment");
  const admin = await import("../lib/adminOrders");
  const storage = await import("../lib/storagePaths");
  assert.equal(storage.getOrdersDir(), path.join(root,"orders"));
  const source = await identity.ensureLegacyCanonicalMember({memberId:"member-j6f2a-source",identities:[{provider:"email",subject:"j6f2a-source@example.test"}]});
  const referrer = await identity.ensureLegacyCanonicalMember({memberId:"member-j6f2a-referrer",identities:[{provider:"email",subject:"j6f2a-referrer@example.test"}]});
  const rules = structuredClone(rulesApi.DEFAULT_MEMBERSHIP_RULES);
  rules.referral.selfPurchaseEligibilityMode = "first_completed_order";
  rules.referral.selfPurchaseRewardTiers.enabled = false;
  rules.referral.selfPurchaseRewardRate = 5;
  rules.referral.referralRewardCalculationMode = "paid_amount";
  rules.referral.payoutQualification.validConsumption.includeCreditDiscount = false;
  rules.referral.payoutQualification.validConsumption.includeShipping = false;
  rules.referral.referralMonthlyCreditCap = 0;
  await rulesApi.saveMembershipBusinessRules({expectedRevision:0,rules,now:new Date("2026-01-01T00:00:00.000Z")});
  await commerce.assignReferralRelationship({referrerMemberId:referrer.memberId,referredMemberId:source.memberId,
    idempotencyKey:"fixture-relation",now:new Date("2026-01-02T00:00:00.000Z")},{assertMember:async()=>undefined});
  const orderNumber = "KD20261012-9001";
  const attribution = {version:1 as const,referrerMemberId:referrer.memberId,referralCode:commerce.referralCodeForMember(referrer.memberId),
    attributedAt:"2026-10-01T00:00:00.000Z",expiresAt:"2026-11-01T00:00:00.000Z",source:"member-share-link" as const,
    ruleVersionId:1,rewardRate:5,calculationBasis:"paid_amount" as const,calculationBaseValue:1220,pvRewardMoneyValue:1,
    baseWaitingDays:1,returnProtectionDays:14,reversalPolicy:"cancel-pending-and-reverse-released" as const,roundingMode:"round-half-up" as const};
  const order = { ...sample(credit,domains), orderNumber, createdAt:"2026-10-01T00:00:00.000Z",
    status:"waiting_studio_pickup_confirmation",orderMode:"studio_pickup",customer:{name:"Fixture"},
    studioPickup:{preferredDate:"2026-10-12"},member:guest?null:{memberId:source.memberId},
    ...(guest ? {retailPromotionAttribution:attribution} : {}),
    inventoryTransaction:{state:"inventory_committed",changes:[{skuId:"fixture-sku",demand:2}]},
    lineNotification:{sent:false} };
  await fs.mkdir(storage.getOrdersDir(),{recursive:true});
  const file = path.join(storage.getOrdersDir(),orderNumber+".json");
  await fs.writeFile(file,JSON.stringify(order));
  const inventoryFiles = [path.join(root,"store","website-data.json"),path.join(root,"store-domain","catalog.json")];
  for(const inventoryFile of inventoryFiles){await fs.mkdir(path.dirname(inventoryFile),{recursive:true});await fs.writeFile(inventoryFile,JSON.stringify({fixture:true,inventory:9,inventoryReceipts:{}}));}
  const inventoryBefore = await Promise.all(inventoryFiles.map(file=>fs.readFile(file,"utf8")));
  const preparing = await fulfillment.recordAdminFulfillmentEvent({orderId:orderNumber,state:"preparing",expectedRevision:0,now:new Date("2026-10-12T01:00:00.000Z")});
  const ready = await fulfillment.recordAdminFulfillmentEvent({orderId:orderNumber,state:"ready_for_store_pickup",expectedRevision:preparing.record.revision,now:new Date("2026-10-12T02:00:00.000Z")});
  const completed = await fulfillment.recordAdminFulfillmentEvent({orderId:orderNumber,state:"completed",expectedRevision:ready.record.revision,confirmed:true,now:timestamp});
  const saved = (await admin.readOrder(orderNumber))!;
  const state = await commerce.readMembershipCommerceState();
  const rewardList = Object.values(state.referralRewards).filter(item=>item.sourceOrderNumber===orderNumber);
  const consumption = Object.values(state.validConsumptionEvents).find(item=>item.sourceOrderId===orderNumber);
  const oldBasis = {
    pv:order.items.reduce((sum,item)=>sum+Math.max(0,Number(item.effectivePV||item.basePV||0))*Math.max(1,Number(item.quantity||1)),0),
    quantity:order.items.reduce((sum,item)=>sum+Math.max(0,Number(item.quantity)||0),0),
    merchandiseAmount:Math.max(0,order.subtotal-credit),
  };
  const summary = {
    ...oldBasis,
    self:rewardList.filter(item=>item.rewardType==="self_purchase").reduce((sum,item)=>sum+item.calculatedCreditAmount,0),
    referral:rewardList.filter(item=>item.rewardType!=="self_purchase").reduce((sum,item)=>sum+item.calculatedCreditAmount,0),
    consumptionAmount:consumption?.validConsumptionAmount ?? null,consumptionPV:consumption?.validConsumptionPV ?? null,
  };
  return {root,commerce,rulesApi,fulfillment,admin,storage,source,referrer,order,orderNumber,file,ready,completed,saved,state,
    inventoryFiles,inventoryBefore,summary,attribution};
}
if(worker){
  const ctx=await scenario(process.argv[3],"legacy",Number(process.argv[4]));
  process.stdout.write("BASELINE_RESULT "+JSON.stringify(ctx.summary)+"\n");
}else{
  const savedRoot=process.env.KD_DATA_DIR;
  const suite=await fs.mkdtemp(path.join(os.tmpdir(),"kd-j6f2a-"));
  let checks=0;
  const check=async(label:string,operation:()=>unknown|Promise<unknown>)=>{await operation();checks++;process.stdout.write("PASS "+String(checks).padStart(3,"0")+" "+label+"\n");};
  const fixtureRoot=(name:string)=>path.join(suite,name);
  try{
    const baseline:Record<string,Awaited<ReturnType<typeof scenario>>["summary"]>={};
    for(const credit of [0,200]){
      const result=await promisify(execFile)(process.execPath,["--experimental-strip-types","--import",pathToFileURL(bootstrap).href,script,"--baseline-worker",fixtureRoot("baseline-"+credit),String(credit)],{cwd:process.cwd(),windowsHide:true});
      const line=result.stdout.split(/\r?\n/).find(line=>line.startsWith("BASELINE_RESULT "));
      assert.ok(line,"Baseline worker must complete the original production path");
      baseline[String(credit)]=JSON.parse(line.slice("BASELINE_RESULT ".length));
    }
    await check("unchanged HEAD known Coffee fixture: 60 PV, 2 units, 1000 paid, self/referral 50 each",()=>{
      assert.deepEqual(baseline["0"],{pv:60,quantity:2,merchandiseAmount:1000,self:50,referral:50,consumptionAmount:1000,consumptionPV:60});
    });
    for(const domain of ["legacy","coffee"] as const)for(const credit of [0,200]){
      const ctx=await scenario(fixtureRoot(domain+"-"+credit),domain,credit);
      await check(domain+" Coffee actual rewards and consumption match unchanged HEAD, credit "+credit,()=>assert.deepEqual(ctx.summary,baseline[String(credit)]));
      await check(domain+" Coffee basis preserves existing PV/quantity/paid amount, credit "+credit,()=>{
        const b=resolveOrderRewardBasis(ctx.order);assert.equal(b.monetaryBasisStatus,"resolved");
        assert.equal(b.coffeeEffectivePV,baseline[String(credit)].pv);assert.equal(b.coffeeEligibleQuantity,baseline[String(credit)].quantity);
        assert.equal(b.rewardMerchandiseAmount,baseline[String(credit)].merchandiseAmount);
      });
      await check(domain+" Coffee read/classification never backfills domain or rewrites file",async()=>{
        const before=await fs.readFile(ctx.file,"utf8");resolveOrderRewardBasis((await ctx.admin.readOrder(ctx.orderNumber))!);
        assert.equal(await fs.readFile(ctx.file,"utf8"),before);
        if(domain==="legacy")assert.ok(ctx.saved.items.every((item:Record<string,unknown>)=>!("domain" in item)));
      });
    }
    await check("preserve distinct existing effectivePV=0 fulfillment/qualification semantics",()=>{
      const b=resolveOrderRewardBasis({subtotal:10,items:[{quantity:1,basePV:10,effectivePV:0}]});
      assert.equal(b.coffeeEffectivePV,10);assert.equal(b.coffeeValidConsumptionPV,0);
    });
    const store=await scenario(fixtureRoot("store"),"store");
    await check("Store phantom PV and quantities never count as Coffee",()=>{
      const b=resolveOrderRewardBasis(store.order);assert.equal(b.coffeeEligible,false);assert.equal(b.coffeeBasePV,0);assert.equal(b.coffeeEffectivePV,0);assert.equal(b.coffeeEligibleQuantity,0);assert.equal(b.coffeeMerchandiseSubtotal,0);
    });
    await check("Store-only completion creates no Coffee self/referral/valid consumption",()=>{
      assert.equal(store.summary.self,0);assert.equal(store.summary.referral,0);assert.equal(store.summary.consumptionAmount,null);
      assert.equal(Object.keys(store.state.validConsumptionEvents).length,0);
    });
    await check("direct Store self/referral/subscription reward entrypoints fail closed",async()=>{
      assert.deepEqual(await store.commerce.createSelfPurchaseRewardFromFulfillment({sourceMemberId:store.source.memberId,orderId:store.orderNumber,paidAmountBasis:520,basePV:999,idempotencyKey:"store-direct-self",now:timestamp}),[]);
      for(const rewardType of ["new_referral","subscription"] as const)assert.deepEqual(await store.commerce.createReferralRewardsFromFulfillment({sourceMemberId:store.source.memberId,orderId:store.orderNumber,rewardType,paidAmountBasis:520,basePV:999,idempotencyKey:"store-direct-"+rewardType,now:timestamp}),[]);
      assert.equal(Object.keys((await store.commerce.readMembershipCommerceState()).subscriptions).length,0);
    });
    const mixed=await scenario(fixtureRoot("mixed"),"mixed");
    await check("mixed/no-credit uses Coffee 700, never whole subtotal 1220",()=>{
      const b=resolveOrderRewardBasis(mixed.order);assert.equal(b.rewardMerchandiseAmount,700);assert.equal(b.coffeeMerchandiseSubtotal,700);
      assert.equal(b.coffeeEffectivePV,60);assert.equal(b.coffeeEligibleQuantity,2);
    });
    await check("mixed/no-credit actual self/referral rewards and qualification exclude Store",()=>{
      assert.equal(mixed.summary.self,35);assert.equal(mixed.summary.referral,35);assert.equal(mixed.summary.consumptionAmount,700);assert.equal(mixed.summary.consumptionPV,60);
    });
    await check("mixed cannot create subscription reward even with generic order shape",async()=>{
      assert.deepEqual(await mixed.commerce.createReferralRewardsFromFulfillment({sourceMemberId:mixed.source.memberId,orderId:mixed.orderNumber,rewardType:"subscription",paidAmountBasis:1220,idempotencyKey:"mixed-subscription",now:timestamp}),[]);
    });
    const blocked=await scenario(fixtureRoot("mixed-credit"),"mixed",200);
    await check("mixed/credit preserves Coffee classification but has NO guessed monetary basis",()=>{
      const b=resolveOrderRewardBasis(blocked.order);assert.equal(b.monetaryBasisStatus,"mixed_credit_allocation_unresolved");assert.equal(b.rewardMerchandiseAmount,null);assert.equal(b.coffeeMerchandiseSubtotal,700);assert.equal(b.coffeeEffectivePV,60);
    });
    await check("mixed/credit issues no monetary rewards or consumption/qualification",()=>{
      assert.equal(blocked.summary.self,0);assert.equal(blocked.summary.referral,0);assert.equal(blocked.summary.consumptionAmount,null);
      assert.equal(Object.keys(blocked.state.qualificationRounds).length,0);
    });
    await check("mixed/credit completes successfully but leaves reward consequence retryable",async()=>{
      assert.equal(blocked.saved.status,"completed");assert.equal(blocked.completed.record.currentState,"completed");
      assert.equal((await blocked.fulfillment.readFulfillmentStore()).consequenceStatus[blocked.completed.event!.eventId],"failed");
      assert.ok(blocked.saved.completedAt);assert.ok(blocked.saved.completion.returnDeadline);
    });
    await check("mixed/credit direct reward creators cannot bypass unresolved allocation",async()=>{
      assert.deepEqual(await blocked.commerce.createSelfPurchaseRewardFromFulfillment({sourceMemberId:blocked.source.memberId,orderId:blocked.orderNumber,paidAmountBasis:500,idempotencyKey:"blocked-self",now:timestamp}),[]);
      assert.deepEqual(await blocked.commerce.createReferralRewardsFromFulfillment({sourceMemberId:blocked.source.memberId,orderId:blocked.orderNumber,rewardType:"new_referral",paidAmountBasis:1020,idempotencyKey:"blocked-ref",now:timestamp}),[]);
      assert.equal(await blocked.commerce.recordValidConsumptionFromCompletedOrder({memberId:blocked.source.memberId,orderId:blocked.orderNumber,idempotencyKey:"blocked-valid",now:timestamp}),null);
    });
    const unknown=await scenario(fixtureRoot("unknown"),"unknown");
    await check("unknown explicit domain fails closed without reopening completed order",()=>{
      assert.equal(resolveOrderRewardBasis(unknown.order).monetaryBasisStatus,"unknown_domain");assert.equal(unknown.summary.self,0);assert.equal(unknown.summary.referral,0);assert.equal(unknown.summary.consumptionAmount,null);assert.equal(unknown.saved.status,"completed");
    });
    await check("explicit null/blank/invalid domains never become legacy Coffee",()=>{
      for(const domain of [null,"","COFFEE",1])assert.equal(resolveOrderRewardBasis({subtotal:700,items:[{domain,quantity:1,lineTotal:700,basePV:60}]}).monetaryBasisStatus,"unknown_domain");
    });
    await check("mixed missing/unsafe/inconsistent line totals fail closed",()=>{
      for(const amount of [undefined,0.5,-1,Infinity,Number.MAX_SAFE_INTEGER]){
        const value=sample(0,"mixed");value.items[0].lineTotal=amount as number;
        assert.equal(resolveOrderRewardBasis(value).monetaryBasisStatus,"invalid_mixed_snapshot");
      }
    });
    for(const [name,domain,credit]of [["guest-mixed","mixed",0],["guest-mixed-credit","mixed",200],["guest-store","store",0]] as const){
      const ctx=await scenario(fixtureRoot(name),domain,credit,true);
      await check(name+" retail snapshot cannot leak Store paid amount",()=>{
        const rewards=Object.values(ctx.state.retailPromotionRewards);
        if(domain==="mixed"&&credit===0){assert.equal(rewards.length,1);assert.equal(rewards[0].eligibleMerchandiseAmount,700);assert.equal(rewards[0].calculationBaseValue,700);assert.equal(rewards[0].calculatedCreditAmount,35);}
        else assert.equal(rewards.length,0);
      });
      await check(name+" direct retail creator cannot bypass canonical classification",async()=>{
        const reward=await ctx.commerce.createRetailPromotionRewardFromFulfillment({orderId:ctx.orderNumber,attribution:ctx.attribution,eligibleMerchandiseAmount:1220,idempotencyKey:name+"-direct",now:timestamp});
        if(domain==="mixed"&&credit===0)assert.equal(reward?.calculationBaseValue,700);else assert.equal(reward,null);
      });
      await check(name+" retail pending projection excludes Store and ambiguous credit",async()=>{
        const pending={...ctx.order,orderNumber:"KD20261012-9002",status:"waiting_studio_pickup_confirmation"};
        await fs.writeFile(path.join(ctx.storage.getOrdersDir(),pending.orderNumber+".json"),JSON.stringify(pending));
        const center=await ctx.commerce.getMemberRetailPromotionCenter(ctx.referrer.memberId);
        const rows=center.history.filter(item=>item.status==="pending_completion");
        if(domain==="mixed"&&credit===0){assert.equal(rows.length,1);assert.equal(rows[0].eligibleSales,700);assert.equal(rows[0].calculationBaseValue,700);assert.equal(rows[0].rewardAmount,35);}
        else assert.equal(rows.length,0);
      });
    }
    for(const ctx of [mixed,blocked,store,unknown]){
      process.env.KD_DATA_DIR=ctx.root;
      await check(path.basename(ctx.root)+" retries cannot duplicate reward or rewrite completion",async()=>{
        const stateBefore=await ctx.commerce.readMembershipCommerceState();
        const completionBefore=inventoryHash(ctx.saved.completion);
        await ctx.fulfillment.recordAdminFulfillmentEvent({orderId:ctx.orderNumber,state:"completed",expectedRevision:ctx.ready.record.revision,confirmed:true,now:new Date(timestamp.getTime()+60000)});
        const stateAfter=await ctx.commerce.readMembershipCommerceState();
        assert.equal(Object.keys(stateAfter.referralRewards).length,Object.keys(stateBefore.referralRewards).length);
        const order=(await ctx.admin.readOrder(ctx.orderNumber))!;assert.equal(order.status,"completed");assert.equal(order.completedAt,ctx.saved.completedAt);assert.equal(inventoryHash(order.completion),completionBefore);
      });
      await check(path.basename(ctx.root)+" completion cannot be reopened",()=>assert.rejects(()=>ctx.fulfillment.recordAdminFulfillmentEvent({orderId:ctx.orderNumber,state:"cancelled",expectedRevision:ctx.completed.record.revision,confirmed:true}),ctx.fulfillment.FulfillmentError));
      await check(path.basename(ctx.root)+" inventory/receipts/journals never mutate",async()=>{
        assert.deepEqual(await Promise.all(ctx.inventoryFiles.map(file=>fs.readFile(file,"utf8"))),ctx.inventoryBefore);
        assert.deepEqual((await ctx.admin.readOrder(ctx.orderNumber))!.inventoryTransaction,ctx.order.inventoryTransaction);
        await assert.rejects(()=>fs.stat(path.join(ctx.root,"orders",".transactions")),{code:"ENOENT"});
      });
    }
    process.env.KD_DATA_DIR=blocked.root;
    await check("Admin rule changes do not recompute completedAt or returnDeadline",async()=>{
      const before=(await blocked.admin.readOrder(blocked.orderNumber))!;
      const rulesStore=await blocked.rulesApi.readMembershipRulesStore();
      const rules=structuredClone(rulesStore.versions.at(-1)!.rules);rules.referral.referralRewardReturnProtectionDays=30;
      await blocked.rulesApi.saveMembershipBusinessRules({expectedRevision:rulesStore.revision,rules,now:new Date("2026-10-13T00:00:00.000Z")});
      await blocked.fulfillment.recordAdminFulfillmentEvent({orderId:blocked.orderNumber,state:"completed",expectedRevision:blocked.ready.record.revision,confirmed:true,now:new Date("2026-10-13T01:00:00.000Z")});
      const after=(await blocked.admin.readOrder(blocked.orderNumber))!;assert.equal(after.completedAt,before.completedAt);assert.deepEqual(after.completion,before.completion);
    });
    await check("shared persistence refuses completion metadata rewrite after reward block",()=>assert.rejects(()=>blocked.admin.withStoredOrderUpdateLock(blocked.orderNumber,async(order,persist)=>persist({...order,completion:{...order.completion,returnDeadline:"2027-01-01T15:59:59.999Z"}}))));
    process.stdout.write("J.6F.2A reward domain isolation: "+checks+"/"+checks+" PASS; isolated fixtures only.\n");
  }finally{
    if(savedRoot===undefined)delete process.env.KD_DATA_DIR;else process.env.KD_DATA_DIR=savedRoot;
    assert.ok(path.resolve(suite).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(suite,{recursive:true,force:true});
  }
}
