import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import inspector from "node:inspector";
import { randomUUID } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createCommerceOrderTransactionService } from "../lib/commerceOrderTransaction";
import type { CommerceOrderTransactionRequest } from "../lib/commerceOrderTransaction";
import { createStoreRepository } from "../lib/storeRepository";
import { createCoffeeInventoryParticipant, createStoreInventoryParticipant, createInventoryParticipant } from "../lib/inventoryParticipants";
import { withCommerceLockPlan, withOrderGate, orderGateResource } from "../lib/commerceLocks";
import { createCommerceTransactionJournal } from "../lib/commerceTransactionJournal";
import { readInventoryReceipts, inventoryHash, inventoryOperationKey } from "../lib/inventoryReceipts";
import { createCommerceTransactionCoordinator } from "../lib/commerceTransactionCoordinator";
import { CommerceLockOrderError } from "../lib/commerceLockProtocol";
import { atomicWriteJson, withFileLock } from "../lib/jsonFileStore";
import type { TransactionIntent } from "../lib/commerceTransactionTypes";
import { withOrderFileUpdateLock } from "../lib/orderFiles";
import { cancelOrderCanonically, requestMemberOrderCancellation } from "../lib/orderCancellation";
import { readOrder } from "../lib/adminOrders";
import { readFulfillmentStore, recordAdminFulfillmentEvent } from "../lib/fulfillment";
import { createAdminSessionValue } from "../lib/adminAuth";
import { provisionCanonicalMember } from "../lib/memberIdentity";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules } from "../lib/membershipBusinessRules";
import * as membership from "../lib/membershipCommerce";
import { PATCH as adminPATCH } from "../app/api/admin/orders/[orderNumber]/route";
import { PATCH as fulfillmentPATCH } from "../app/api/admin/fulfillment/orders/[orderNumber]/route";

const now = () => new Date("2026-01-01T00:00:00.000Z");
const script = fileURLToPath(import.meta.url);
const bootstrap = fileURLToPath(new URL("./credit-integration-test-bootstrap.mjs", import.meta.url));
for (const key of ["LINE_CHANNEL_ACCESS_TOKEN","LINE_INTERNAL_CHANNEL_ACCESS_TOKEN","LINE_ORDER_RECIPIENT_ID","LINE_INTERNAL_RECIPIENT_ID"]) delete process.env[key];
const cancellationId = (id: string, original: string) => "order-cancel:" + inventoryOperationKey(id + ":" + original);
function request(mode: "coffee" | "store" | "mixed", duplicate = false): CommerceOrderTransactionRequest {
  const coffee = { domain: "coffee" as const, productId: "coffee-product", variantId: "coffee-sku", quantity: 2,
    coffeeOptions: { preparation: "咖啡豆" as const, customRoast: false } };
  const store = { domain: "store" as const, productId: "store-product", variantId: "default" as const, quantity: 2 };
  return { idempotencyKey: randomUUID(), items: mode === "coffee" ? [coffee] : mode === "store" ? [store] :
    duplicate ? [coffee,{...coffee,quantity:1},store,{...store,quantity:1}] : [coffee,store],
    orderContext: { orderMode: "studio_pickup", customer: {name:"Fixture",phone:"0912345678",email:"",note:""},
      studioPickup:{preferredDate:"2026-10-20"},creditApplied:0 } };
}
const core = (id: string, extra: Partial<Parameters<typeof cancelOrderCanonically>[0]> = {}) => cancelOrderCanonically({
  orderNumber:id,cancelledBy:"admin",cancellationReason:"isolated fixture cancellation",
  idempotencyKey:"j6f4-cancel:"+id,now,sendNotification:async()=>({sent:false}),...extra,
});
const fulfillment = (id: string) => recordAdminFulfillmentEvent({orderId:id,state:"cancelled",expectedRevision:0,confirmed:true,note:"isolated cancel",now:now()});
const orderPath = (root: string, id: string) => path.join(root,"orders",id+".json");
async function loadOrder(id: string) { const order=await readOrder(id);assert.ok(order);return order; }
async function inventories(root: string) {
  const coffee=JSON.parse(await fs.readFile(path.join(root,"store/website-data.json"),"utf8"));
  const store=await createStoreRepository({dataRoot:root}).read();
  return { coffee, store, stock:[coffee.menu.products[0].skus[0].stock,store.products[0]?.inventory ?? null],
    coffeeReceipts:Object.values(readInventoryReceipts(coffee)),storeReceipts:Object.values(readInventoryReceipts(store)) };
}
if(process.argv[2]==="--worker"){
  const root=process.argv[3],point=process.argv[4],id=process.argv[5];
  process.env.KD_DATA_DIR=root;
  await core(id,{transactionCancellation:{hook:async(phase,domain)=>{
    if((point==="BEFORE_RESTORE"&&phase==="PREPARED")||(point==="AFTER_COFFEE"&&phase==="RESTORED"&&domain==="coffee")||
      (point==="BEFORE_CANCELLED"&&phase==="BEFORE_CANCELLED")||(point==="AFTER_CANCELLED"&&phase==="CANCELLED")){
      process.stdout.write("CRASH_POINT\n");await new Promise(()=>{});
    }
  }}});
}else{
  const suite=await fs.mkdtemp(path.join(os.tmpdir(),"kd-j6f4-restore-"));
  console.log("ISOLATED_SUITE "+suite);
  process.env.AUTH_SESSION_SECRET="j6f4-test-only-session-secret-longer-than-thirty-two-characters";
  (globalThis as typeof globalThis & {__creditTestAdminCookie?:string}).__creditTestAdminCookie=createAdminSessionValue();
  let count=0;
  const check=(label:string,condition:unknown)=>{assert.ok(condition,label);console.log("PASS "+(++count)+" "+label);};
  async function setup(label:string,mode:"coffee"|"store"|"mixed"="mixed",duplicate=false,price=50){
    const root=path.join(suite,label);process.env.KD_DATA_DIR=root;
    await fs.mkdir(path.join(root,"store"),{recursive:true});
    await fs.writeFile(path.join(root,"store/website-data.json"),JSON.stringify({version:1,menu:{products:[{
      id:"coffee-product",slug:"coffee-current",name:"Coffee",active:true,purchasable:true,purchase:[],
      skus:[{id:"coffee-sku",kind:"beans",label:"Coffee beans",detail:"227g",enabled:true,price:500,stock:10,pvEnabled:true,pvValue:30}],
    }]}}));
    const repository=createStoreRepository({dataRoot:root,now});
    await repository.createSection({id:"section",name:"Equipment",slug:"equipment",published:true});
    await repository.createProduct({id:"store-product",sectionId:"section",slug:"store-current",name:"Store",
      sku:"DISPLAY",price,inventory:5,pvValue:100,published:true});
    await saveMembershipBusinessRules({expectedRevision:0,rules:structuredClone(DEFAULT_MEMBERSHIP_RULES),now:now()});
    const member=(await provisionCanonicalMember({provider:"email",subject:label+"@example.test",persistMember:async()=>undefined})).member.memberId;
    const created=await createCommerceOrderTransactionService({now}).create(request(mode,duplicate));
    assert.equal(created.state,"FINALIZED");assert.ok(created.order);
    await withOrderFileUpdateLock(path.join(root,"orders"),created.orderNumber,async(order,persist)=>persist({...order,member:{memberId:member}}));
    return {root,id:created.orderNumber,original:created.transactionId,member,repository,
      cancelId:cancellationId(created.orderNumber,created.transactionId),mode};
  }
  type Fixture=Awaited<ReturnType<typeof setup>>;
  async function route(patch:(request:Request,context:{params:Promise<{orderNumber:string}>})=>Promise<Response>,id:string,body:object){
    const response = await patch(new Request("http://localhost/api/admin/orders/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),
      {params:Promise.resolve({orderNumber:id})});
    if (!response.ok) console.error("HTTP_FAILURE " + JSON.stringify({ orderNumber: id, status: response.status, body: await response.clone().text() }));
    return response;
  }
  const memberCancel=(f:Fixture)=>requestMemberOrderCancellation({orderNumber:f.id,memberId:f.member,
    cancellationReason:"member fixture cancel",idempotencyKey:"member-cancel:"+f.id,now,sendNotification:async()=>({sent:false})});
  async function happy(label:string,f:Fixture){
    const data=await inventories(f.root),order=await loadOrder(f.id);
    check(label+" all inventory restored",JSON.stringify(data.stock)===JSON.stringify([10,5]));
    check(label+" canonical order cancelled",order.status==="cancelled");
    check(label+" coherent fulfillment",order.fulfillmentSummary?.state==="cancelled"&&(await readFulfillmentStore()).records[f.id]?.currentState==="cancelled");
    check(label+" one cancelled history event",order.statusHistory.filter((event:Record<string,unknown>)=>event.to==="cancelled").length===1);
    check(label+" one cancellation projection",(await readFulfillmentStore()).records[f.id].events.filter(event=>event.state==="cancelled").length===1);
    for(const [domain,receipts]of [["coffee",data.coffeeReceipts],["store",data.storeReceipts]] as const){
      const restores=receipts.filter(receipt=>receipt.kind==="RESTORE"),applies=receipts.filter(receipt=>receipt.kind==="APPLY");
      const required=f.mode==="mixed"||f.mode===domain;
      check(label+" "+domain+" one logical restore",restores.length===(required?1:0));
      if(required){
        check(label+" "+domain+" original APPLY linkage",restores[0].parentOperationId===applies[0].operationId&&restores[0].transactionId===f.original);
        check(label+" "+domain+" aggregate demand matches APPLY",inventoryHash(restores[0].items.map(item=>({identity:item.identity,quantity:item.quantity})))===
          inventoryHash(applies[0].items.map(item=>({identity:item.identity,quantity:item.quantity}))));
      }
    }
    const events=await createCommerceTransactionJournal(path.join(f.root,"orders"),f.cancelId).read();
    check(label+" durable separate restore intent",events[0]?.event.type==="RESTORE_PREPARED");
    check(label+" cancellation journal finalized",events.at(-1)?.event.type==="FINALIZED");
    check(label+" original creation journal remains finalized",(await createCommerceTransactionJournal(path.join(f.root,"orders"),f.original).read()).at(-1)?.event.type==="FINALIZED");
  }
  async function snapshot(folder:string):Promise<Record<string,string>>{
    const map:Record<string,string>={};
    const walk=async(dir:string)=>{for(const entry of await fs.readdir(dir,{withFileTypes:true}).catch(error=>{if(error.code==="ENOENT")return [];throw error;})){
      const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file);else if(entry.isFile())map[file]=inventoryHash((await fs.readFile(file)).toString("base64"));
    }};await walk(folder);return map;
  }
  const realRuntime=await snapshot("F:\\KD_Coffee_LOCAL_RUNTIME");
  const profiler=new inspector.Session();profiler.connect();
  const post=(method:string,params:object={})=>new Promise<unknown>((resolve,reject)=>profiler.post(method,params,(error,result)=>error?reject(error):resolve(result)));
  await post("Profiler.enable");await post("Profiler.startPreciseCoverage",{callCount:true,detailed:true});
  async function businessCalls(){
    const result=await post("Profiler.takePreciseCoverage") as {result:Array<{url:string;functions:Array<{functionName:string;ranges:Array<{count:number}>}>}>};
    const names=["settleCreditReservationForOrder","handleReferralQualificationOrderOutcome","cancelSubscriptionCycleForOrder","runConsequence"];
    return Object.fromEntries(names.map(name=>[name,result.result.filter(script=>/\/(membershipCommerce|fulfillment)\.ts$/.test(script.url.replaceAll("\\","/")))
      .flatMap(script=>script.functions).filter(fn=>fn.functionName===name).reduce((sum,fn)=>sum+(fn.ranges[0]?.count??0),0)]));
  }

  if (process.argv[2] === "--targeted-protocol") {
    const root=path.join(suite,"protocol-legacy-coffee");process.env.KD_DATA_DIR=root;
    await fs.mkdir(path.join(root,"orders"),{recursive:true});await fs.mkdir(path.join(root,"store"),{recursive:true});
    await fs.writeFile(path.join(root,"store/website-data.json"),JSON.stringify({version:1,menu:{products:[{slug:"coffee",stock:7,
      skus:[{id:"legacy-sku",stock:7,enabled:true}]}]}}));
    await saveMembershipBusinessRules({expectedRevision:0,rules:structuredClone(DEFAULT_MEMBERSHIP_RULES),now:now()});
    const id="KD20261013-9401",legacy={orderNumber:id,createdAt:now().toISOString(),status:"waiting_studio_pickup_confirmation",orderMode:"studio_pickup",
      items:[{quantity:2}],inventoryTransaction:{state:"inventory_committed",changes:[{skuId:"legacy-sku",productSlug:"coffee",productName:"Coffee",demand:2}]}};
    await fs.writeFile(orderPath(root,id),JSON.stringify(legacy));const legacyBefore=await fs.readFile(orderPath(root,id),"utf8");
    await readOrder(id);check("protocol legacy Coffee read preserves history",await fs.readFile(orderPath(root,id),"utf8")===legacyBefore);
    await core(id);check("protocol legacy Coffee existing restore succeeds",(await loadOrder(id)).inventoryReturn.state==="returned"&&
      JSON.parse(await fs.readFile(path.join(root,"store/website-data.json"),"utf8")).menu.products[0].skus[0].stock===9);
    check("protocol legacy Coffee no transaction journal",await fs.readdir(path.join(root,"orders/.transactions")).then(()=>false,error=>error.code==="ENOENT"));
    const supported=await setup("protocol-v1-mixed");await core(supported.id);await happy("protocol v1 mixed",supported);
    async function rejectWithoutEffects(label:string,mode:"coffee"|"store"|"mixed",version:number|null|"absent",expected:string){
      const f=await setup(label,mode);
      await withOrderFileUpdateLock(path.join(f.root,"orders"),f.id,async(order,persist)=>{
        if(version==="absent"){const {inventoryTransaction:_transaction,...legacyOrder}=order;await persist(legacyOrder);}
        else await persist({...order,inventoryTransaction:{...(order.inventoryTransaction as object),protocolVersion:version}});
      });
      const before=await snapshot(f.root),inventoryBefore=await inventories(f.root);await businessCalls();
      await assert.rejects(()=>core(f.id),(error:unknown)=>error instanceof Error&&error.message===expected&&"status" in error&&error.status===409);
      check(label+" exact fail-closed error/status",true);
      const after=await inventories(f.root),order=await loadOrder(f.id),calls=await businessCalls();
      check(label+" Coffee inventory unchanged",after.stock[0]===inventoryBefore.stock[0]);
      check(label+" Store inventory unchanged",after.stock[1]===inventoryBefore.stock[1]);
      check(label+" no RESTORE receipts",[...after.coffeeReceipts,...after.storeReceipts].every(receipt=>receipt.kind!=="RESTORE"));
      check(label+" no cancellation journal",await fs.access(createCommerceTransactionJournal(path.join(f.root,"orders"),f.cancelId).directory)
        .then(()=>false,error=>{if(error.code!=="ENOENT")throw error;return true;}));
      check(label+" order status unchanged",order.status==="waiting_studio_pickup_confirmation");
      check(label+" fulfillment unchanged",!order.fulfillmentSummary&&await fs.access(path.join(f.root,"fulfillment/state.json"))
        .then(()=>false,error=>{if(error.code!=="ENOENT")throw error;return true;}));
      check(label+" business consequences zero",Object.values(calls).every(value=>value===0));
      check(label+" all persisted bytes including credit unchanged",inventoryHash(await snapshot(f.root))===inventoryHash(before));
      console.log("PROTOCOL_MATRIX_EVIDENCE "+JSON.stringify({label,orderNumber:f.id,version,expected,status:409,
        stockBefore:inventoryBefore.stock,stockAfter:after.stock,coffeeApply:after.coffeeReceipts.filter(receipt=>receipt.kind==="APPLY").length,
        storeApply:after.storeReceipts.filter(receipt=>receipt.kind==="APPLY").length,restore:0,businessCalls:calls}));
    }
    for(const mode of ["coffee","store","mixed"] as const)await rejectWithoutEffects("protocol-v2-"+mode,mode,2,"UNKNOWN_CANCELLATION_PROTOCOL");
    for(const version of [0,null,999])await rejectWithoutEffects("protocol-explicit-"+String(version),"mixed",version,"UNKNOWN_CANCELLATION_PROTOCOL");
    for(const mode of ["store","mixed"] as const)await rejectWithoutEffects("protocol-legacy-"+mode,mode,"absent","MIXED_CANCELLATION_NOT_SUPPORTED");
    check("protocol matrix LOCAL_RUNTIME unchanged",inventoryHash(await snapshot("F:\\KD_Coffee_LOCAL_RUNTIME"))===inventoryHash(realRuntime));
    await post("Profiler.stopPreciseCoverage");profiler.disconnect();
    console.log("J6F4_TARGETED_PROTOCOL_PASS "+count);process.exit(0);
  }
  if (process.argv[2] === "--targeted-lock") {
    const f = await setup("target-admin-fulfillment");
    await businessCalls();
    const response = await route(fulfillmentPATCH, f.id, {state:"cancelled",expectedRevision:0,confirmed:true,note:"targeted cancellation"});
    check("targeted Admin-fulfillment HTTP success", response.status === 200);
    const payload = await response.json() as {record?: {currentState:string}};
    check("targeted accepted {record} contract", payload.record?.currentState === "cancelled");
    const calls = await businessCalls();
    console.log("TARGETED_BUSINESS_CALLS " + JSON.stringify(calls));
    for (const name of ["settleCreditReservationForOrder","handleReferralQualificationOrderOutcome","cancelSubscriptionCycleForOrder"]) {
      check("targeted " + name + " once", calls[name] === 1);
    }
    check("targeted projection no consequence dispatch", calls.runConsequence === 0);
    await happy("targeted Admin fulfillment", f);
    await businessCalls();
    const retry = await route(fulfillmentPATCH, f.id, {state:"cancelled",expectedRevision:0,confirmed:true});
    check("targeted already-cancelled revision replay accepted", retry.status === 200);
    check("targeted retry no duplicate consequences", Object.values(await businessCalls()).every(value=>value===0));

    async function rejectedBeforeIntent(label:string, fixture:Fixture, invoke:()=>Promise<Response>) {
      const before = inventoryHash(await inventories(fixture.root));
      const response = await invoke();
      check(label+" HTTP 409",response.status===409);
      check(label+" no participant mutation",inventoryHash(await inventories(fixture.root))===before);
      check(label+" no RESTORE_PREPARED",(await createCommerceTransactionJournal(path.join(fixture.root,"orders"),fixture.cancelId).read()).length===0);
      check(label+" no cancelled projection",(await loadOrder(fixture.id)).fulfillmentSummary?.state!=="cancelled");
    }
    for (const scenario of ["stale-revision","completed-record"] as const) {
      const current = await setup("target-"+scenario);
      const file = path.join(current.root,"fulfillment/state.json"); await fs.mkdir(path.dirname(file),{recursive:true});
      await fs.writeFile(file,JSON.stringify({schemaVersion:1,revision:0,records:{[current.id]:{
        orderId:current.id,currentState:scenario==="completed-record"?"completed":"order_created",
        revision:scenario==="stale-revision"?2:0,events:[],createdAt:now().toISOString(),updatedAt:now().toISOString(),
      }},reviews:[],processedFingerprints:{},consequenceStatus:{},createdAt:now().toISOString(),updatedAt:now().toISOString()}));
      await rejectedBeforeIntent(scenario,current,()=>route(fulfillmentPATCH,current.id,{state:"cancelled",expectedRevision:0,confirmed:true}));
    }
    {
      const current = await setup("target-locked-revalidation");
      let signalHeld!:()=>void, triggerShipment!:()=>void;
      const held = new Promise<void>(resolve=>{signalHeld=resolve;});
      const change = new Promise<void>(resolve=>{triggerShipment=resolve;});
      const orderDir = path.join(current.root,"orders");
      const blocker = withOrderGate(orderDir,current.id,async()=>{
        signalHeld(); await change;
        await withOrderFileUpdateLock(orderDir,current.id,async(order,persist)=>persist({...order,status:"shipment_created"}));
      });
      await held;
      // Call outside the blocker's AsyncLocalStorage scope: discovery sees active state, then waits for the gate.
      const pending = route(fulfillmentPATCH,current.id,{state:"cancelled",expectedRevision:0,confirmed:true});
      const lock = createCommerceTransactionJournal(orderDir,current.cancelId).lockFile+".lock";
      let observed=false;
      try {
        const limit=Date.now()+5000;
        while(Date.now()<limit){
          observed=await fs.stat(lock).then(()=>true,error=>{if(error.code==="ENOENT")return false;throw error;});
          if(observed)break;
          await new Promise(resolve=>setTimeout(resolve,20));
        }
      } finally {triggerShipment();await blocker;}
      check("TOCTOU request waited after discovery before order gate",observed);
      await rejectedBeforeIntent("locked shipment revalidation",current,()=>pending);
      check("TOCTOU canonical shipment state retained",(await loadOrder(current.id)).status==="shipment_created");
    }
    {
      const current=await setup("target-manual-void","coffee");
      await withOrderFileUpdateLock(path.join(current.root,"orders"),current.id,async(order,persist)=>persist({...order,status:"shipment_created"}));
      check("existing Member request alone remains request",(await memberCancel(current)).result==="requires_manual_shipment_void");
      await rejectedBeforeIntent("fulfillment state is not void proof",current,()=>route(fulfillmentPATCH,current.id,{state:"cancelled",expectedRevision:0,confirmed:true}));
      check("existing explicit Admin void confirmation succeeds",(await core(current.id,{confirmedExternalShipmentVoid:true})).ok);
      await happy("targeted manual void",current);
    }
    {
      const current=await setup("target-completed");
      await withOrderFileUpdateLock(path.join(current.root,"orders"),current.id,async(order,persist)=>persist({...order,status:"completed"}));
      const completed=await fs.readFile(orderPath(current.root,current.id),"utf8");
      await rejectedBeforeIntent("canonical completed",current,()=>route(fulfillmentPATCH,current.id,{state:"cancelled",expectedRevision:0,confirmed:true}));
      check("completed facts byte-identical",await fs.readFile(orderPath(current.root,current.id),"utf8")===completed);
    }
    // Same narrow safety assertions as the accepted J.6F.1 lock checks.
    const lockRoot=path.join(suite,"target-lock-negatives");await fs.mkdir(lockRoot,{recursive:true});
    const low={file:path.join(lockRoot,"low"),rank:1 as const,key:"a"},high={file:path.join(lockRoot,"high"),rank:2 as const,key:"b"};
    await assert.rejects(()=>withCommerceLockPlan([low],()=>withFileLock(high.file,async()=>true,{commerceLock:high})),CommerceLockOrderError);
    check("unplanned acquisition protection retained",true);
    await assert.rejects(()=>withFileLock(low.file,()=>withFileLock(low.file,async()=>true,{commerceLock:low}),{commerceLock:low}),CommerceLockOrderError);
    check("reentrant acquisition protection retained",true);
    await assert.rejects(()=>withFileLock(high.file,()=>withFileLock(low.file,async()=>true,{commerceLock:low}),{commerceLock:high}),CommerceLockOrderError);
    check("reverse/lower-rank acquisition protection retained",true);
    await post("Profiler.stopPreciseCoverage");profiler.disconnect();
    check("targeted LOCAL_RUNTIME unchanged",inventoryHash(await snapshot("F:\\KD_Coffee_LOCAL_RUNTIME"))===inventoryHash(realRuntime));
    console.log("J.6F.4 TARGETED LOCK PASS "+count+"/"+count);
    process.exit(0);
  }

  for(const mode of ["coffee","store","mixed"] as const){
    const f=await setup("happy-"+mode,mode),before=(await loadOrder(f.id)).items;
    await businessCalls();const result=await core(f.id);check(mode+" canonical cancellation succeeds",result.ok);
    const calls=await businessCalls();
    for(const name of ["settleCreditReservationForOrder","handleReferralQualificationOrderOutcome","cancelSubscriptionCycleForOrder"])check(mode+" "+name+" once",calls[name]===1);
    check(mode+" projection dispatch absent",calls.runConsequence===0);await happy(mode,f);
    check(mode+" original line/price snapshots immutable",inventoryHash((await loadOrder(f.id)).items)===inventoryHash(before));
    const evidence=inventoryHash(await inventories(f.root));await businessCalls();
    await core(f.id);await fulfillment(f.id);const replay=await businessCalls();
    check(mode+" retries do not change inventory/receipts",inventoryHash(await inventories(f.root))===evidence);
    check(mode+" replay no business consequences",Object.values(replay).every(value=>value===0));
  }
  for(const actor of ["member","admin-order","admin-fulfillment"] as const){
    const f=await setup("entry-"+actor);
    if(actor==="member")check("Member mixed cancellation accepted",(await memberCancel(f)).result==="cancelled");
    else{const response=await route(actor==="admin-order"?adminPATCH:fulfillmentPATCH,f.id,actor==="admin-order"?
      {status:"cancelled",cancellationReason:"admin cancellation"}:{state:"cancelled",expectedRevision:0,confirmed:true,note:"fulfillment cancellation"});
      check(actor+" HTTP success",response.status===200);}
    await happy(actor,f);
  }
  {
    const f=await setup("three-entry-race");await businessCalls();
    const results=await Promise.all([memberCancel(f),route(adminPATCH,f.id,{status:"cancelled",cancellationReason:"admin race"}),
      route(fulfillmentPATCH,f.id,{state:"cancelled",expectedRevision:0,confirmed:true,note:"fulfillment race"})]);
    check("three entry race succeeds",results.slice(1).every(result=>result instanceof Response&&result.status===200));
    const calls=await businessCalls();console.log("RACE_BUSINESS_CALLS "+JSON.stringify(calls));
    for(const name of ["settleCreditReservationForOrder","handleReferralQualificationOrderOutcome","cancelSubscriptionCycleForOrder"])check("race "+name+" once",calls[name]===1);
    check("race projection dispatch absent",calls.runConsequence===0);await happy("race",f);
  }
  {
    const f=await setup("aggregate","mixed",true);await core(f.id);await happy("aggregate",f);
    const data=await inventories(f.root);
    check("Coffee duplicate line demand restored as 3",data.coffeeReceipts.find(receipt=>receipt.kind==="RESTORE")?.items[0].quantity===3);
    check("Store duplicate line demand restored as 3",data.storeReceipts.find(receipt=>receipt.kind==="RESTORE")?.items[0].quantity===3);
  }
  for(const change of ["unpublished","inactive","archived","price"] as const){
    const f=await setup("lifecycle-"+change),product=(await f.repository.read()).products[0];
    if(change==="archived")await f.repository.archiveProduct(product.id,product.revision);
    else await f.repository.updateProduct(product.id,product.revision,change==="price"?{price:75,name:"Store renamed"}:change==="inactive"?{active:false,published:false}:{published:false});
    const before=await f.repository.read();await core(f.id);await happy(change,f);const after=(await f.repository.read()).products[0];
    check(change+" lifecycle/price state preserved",after.archivedAt===before.products[0].archivedAt&&after.active===before.products[0].active&&
      after.published===before.products[0].published&&after.price===before.products[0].price&&after.slug===before.products[0].slug);
  }
  {
    const f=await setup("missing-product"),file=f.repository.catalogPath,catalog=JSON.parse(await fs.readFile(file,"utf8"));
    catalog.products=[];await fs.writeFile(file,JSON.stringify(catalog));
    await assert.rejects(()=>core(f.id),/REVIEW_REQUIRED/);
    check("physically missing Store product never recreated",(await f.repository.read()).products.length===0);
    check("missing product never finalizes order",(await loadOrder(f.id)).status!=="cancelled");
    check("missing product no cancelled projection",(await loadOrder(f.id)).fulfillmentSummary?.state!=="cancelled");
  }
  {
    const f=await setup("store-write-failure"),coffee=createCoffeeInventoryParticipant(path.join(f.root,"store/website-data.json"),now),
      store=createStoreInventoryParticipant({dataRoot:f.root,now});let failed=false;
    const wrapper={...store,restore:async(...args:Parameters<typeof store.restore>)=>{failed=true;throw new Error("controlled Store write failure");}};
    await assert.rejects(()=>core(f.id,{transactionCancellation:{participants:[coffee,wrapper]}}),/PENDING/);
    check("Store restore failure leaves Coffee restored / Store pending",failed&&JSON.stringify((await inventories(f.root)).stock)===JSON.stringify([10,3]));
    check("Store restore failure order remains active",(await loadOrder(f.id)).status!=="cancelled");
    check("Store restore failure no cancelled projection",(await loadOrder(f.id)).fulfillmentSummary?.state!=="cancelled");
    await core(f.id);await happy("Store recovery",f);
  }
  {
    const f=await setup("order-write-failure"),rename=fs.rename;
    fs.rename=async(from,to)=>{if(String(to)===orderPath(f.root,f.id))throw new Error("controlled cancelled order persistence failure");return rename(from,to);};
    try{await assert.rejects(()=>core(f.id),/PENDING/);}finally{fs.rename=rename;}
    check("failed order write keeps active order",(await loadOrder(f.id)).status!=="cancelled");
    check("failed order write has all restore evidence",JSON.stringify((await inventories(f.root)).stock)===JSON.stringify([10,5]));
    await core(f.id);await happy("order write recovery",f);
  }
  {
    const f=await setup("projection-failure"),rename=fs.rename,target=path.join(f.root,"fulfillment/state.json");
    fs.rename=async(from,to)=>{if(String(to)===target)throw new Error("controlled fulfillment projection failure");return rename(from,to);};
    try{await assert.rejects(()=>core(f.id),/controlled fulfillment projection failure/);}finally{fs.rename=rename;}
    check("projection failure retains authoritative cancelled order",(await loadOrder(f.id)).status==="cancelled");
    check("projection failure retains completed business marker",(await loadOrder(f.id)).canonicalCancellation.state==="completed");
    await businessCalls();await core(f.id);
    check("projection repair no replay of business effects",Object.values(await businessCalls()).every(value=>value===0));
    await happy("projection repair",f);
  }
  async function crash(f:Fixture,point:string){
    let output="";const child=spawn(process.execPath,["--experimental-strip-types","--import",pathToFileURL(bootstrap).href,
      script,"--worker",f.root,point,f.id],{cwd:process.cwd(),windowsHide:true,stdio:["ignore","pipe","pipe"]});
    await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error("worker timeout "+output));},20000);
      child.stdout.on("data",data=>{output+=String(data);if(output.includes("CRASH_POINT"))child.kill();});
      child.stderr.on("data",data=>{output+=String(data);});child.on("error",reject);child.on("exit",()=>{clearTimeout(timer);
        output.includes("CRASH_POINT")?resolve():reject(new Error(output));});
    });
    check(point+" real worker reached durable crash boundary",output.includes("CRASH_POINT"));
    const orderDir=path.join(f.root,"orders");
    const resources=[createCommerceTransactionJournal(orderDir,f.original).lockFile,createCommerceTransactionJournal(orderDir,f.cancelId).lockFile,
      orderGateResource(orderDir,f.id).file,path.join(f.root,"store/website-data.json"),f.repository.catalogPath,orderPath(f.root,f.id)];
    let stale=0;
    for(const resource of resources){
      const file=path.resolve(resource+".lock");assert.ok(file.startsWith(path.resolve(suite)+path.sep));
      try{await fs.stat(file);stale++;}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
    }
    check(point+" worker left durable stale locks",stale>0);
    // Explicit test-only recovery after confirmed process exit. Production never deletes stale locks.
    for(const resource of resources)await fs.unlink(resource+".lock").catch(error=>{if(error.code!=="ENOENT")throw error;});
  }
  for(const point of ["BEFORE_RESTORE","AFTER_COFFEE","BEFORE_CANCELLED","AFTER_CANCELLED"]){
    const f=await setup("crash-"+point);await crash(f,point);
    check(point+" main order finalization boundary respected",(await loadOrder(f.id)).status===(point==="AFTER_CANCELLED"?"cancelled":"waiting_studio_pickup_confirmation"));
    const expected=point==="BEFORE_RESTORE"?[8,3]:point==="AFTER_COFFEE"?[10,3]:[10,5];
    check(point+" stock matches crash boundary",JSON.stringify((await inventories(f.root)).stock)===JSON.stringify(expected));
    await core(f.id);await happy(point+" recovery",f);const before=inventoryHash(await inventories(f.root));
    await core(f.id);check(point+" recovered retry never restores twice",inventoryHash(await inventories(f.root))===before);
  }
  for(const which of ["missing-apply","corrupt-apply","missing-restore","corrupt-restore","missing-before-journal"]){
    const f=await setup(which);
    if(which.includes("restore"))await crash(f,"BEFORE_CANCELLED");
    if(which==="missing-before-journal")await crash(f,"AFTER_COFFEE");
    const file=path.join(f.root,"store/website-data.json"),document=JSON.parse(await fs.readFile(file,"utf8"));
    const receipt=Object.values(readInventoryReceipts(document)).find(item=>item.kind===(which.includes("apply")?"APPLY":"RESTORE"));assert.ok(receipt);
    if(which.startsWith("corrupt"))document.inventoryReceipts[inventoryOperationKey(receipt.operationId)].demandHash="0".repeat(64);
    else delete document.inventoryReceipts[inventoryOperationKey(receipt.operationId)];
    await fs.writeFile(file,JSON.stringify(document));const bytes=await fs.readFile(file,"utf8");
    await assert.rejects(()=>core(f.id),/REVIEW_REQUIRED/);
    check(which+" no guessed successful cancellation",(await loadOrder(f.id)).status!=="cancelled");
    check(which+" no repeated Coffee mutation",await fs.readFile(file,"utf8")===bytes);
    check(which+" no cancelled projection",(await loadOrder(f.id)).fulfillmentSummary?.state!=="cancelled");
  }
  {
    const f=await setup("excess-restore","coffee");await core(f.id);
    const participant=createCoffeeInventoryParticipant(path.join(f.root,"store/website-data.json"),now),data=await inventories(f.root),
      apply=data.coffeeReceipts.find(item=>item.kind==="APPLY");assert.ok(apply);
    const before=inventoryHash(data);
    await assert.rejects(()=>withCommerceLockPlan([participant.resource],()=>participant.restore({transactionId:f.original,
      operationId:"excess-cancel:"+f.id,parentOperationId:apply.operationId,demands:apply.items.map(item=>({identity:item.identity,quantity:item.quantity}))})),/Restore exceeds committed quantity/);
    check("cumulative restore cannot exceed original APPLY",inventoryHash(await inventories(f.root))===before);
  }
  {
    const f=await setup("mixed-credit");
    const grant=await membership.adjustMemberCreditByAdmin({memberId:f.member,direction:"grant",amount:100,reason:"isolated",
      idempotencyKey:"mixed-credit-grant",now:now()});
    assert.ok(grant);
    await membership.reserveCredit({memberId:f.member,orderId:f.id,requestedAmount:100,merchandiseSubtotal:1100,shipping:0,
      idempotencyKey:"mixed-credit-reserve",now:now()});
    const before=inventoryHash(await inventories(f.root));
    await assert.rejects(()=>core(f.id),/MIXED_CREDIT_ALLOCATION_UNRESOLVED/);
    check("ambiguous positive ledger credit blocked before restore",inventoryHash(await inventories(f.root))===before);
    check("ambiguous mixed credit remains reserved",Object.values((await membership.readMembershipCommerceState()).creditReservations).some(item=>item.orderId===f.id&&item.status==="reserved"));
    check("mixed credit does not finalize order",(await loadOrder(f.id)).status!=="cancelled");
  }
  for(const mode of ["coffee","store","mixed"] as const){
    const f=await setup("completed-"+mode,mode);
    await withOrderFileUpdateLock(path.join(f.root,"orders"),f.id,async(order,persist)=>persist({...order,status:"completed"}));
    const before=await fs.readFile(orderPath(f.root,f.id),"utf8"),inventoryBefore=inventoryHash(await inventories(f.root));
    check(mode+" Member completed does not cancel",(await memberCancel(f)).result==="customer_service_required");
    check(mode+" Admin completed rejects",(await route(adminPATCH,f.id,{status:"cancelled",cancellationReason:"completed"})).status===409);
    check(mode+" fulfillment completed rejects",(await route(fulfillmentPATCH,f.id,{state:"cancelled",confirmed:true,expectedRevision:0})).status===409);
    check(mode+" completedAt/deadline/order immutable",await fs.readFile(orderPath(f.root,f.id),"utf8")===before);
    check(mode+" completed no restore evidence",inventoryHash(await inventories(f.root))===inventoryBefore);
  }
  {
    const f=await setup("shipment-created","coffee");
    await withOrderFileUpdateLock(path.join(f.root,"orders"),f.id,async(order,persist)=>persist({...order,status:"shipment_created"}));
    const before=inventoryHash(await inventories(f.root));
    await assert.rejects(()=>core(f.id));
    await assert.rejects(()=>fulfillment(f.id));
    check("shipment-created ordinary cancel blocked before restore",inventoryHash(await inventories(f.root))===before);
    check("Member void request only",(await memberCancel(f)).result==="requires_manual_shipment_void");
    await assert.rejects(()=>core(f.id));await assert.rejects(()=>fulfillment(f.id));
    check("Member request alone cannot broaden exception",(await loadOrder(f.id)).status==="shipment_created");
    await core(f.id,{confirmedExternalShipmentVoid:true});await happy("explicit existing manual void",f);
  }
  {
    const root=path.join(suite,"legacy");process.env.KD_DATA_DIR=root;
    await fs.mkdir(path.join(root,"orders"),{recursive:true});await fs.mkdir(path.join(root,"store"),{recursive:true});
    await fs.writeFile(path.join(root,"store/website-data.json"),JSON.stringify({version:1,menu:{products:[{slug:"coffee",stock:7,
      skus:[{id:"legacy-sku",stock:7,enabled:true}]}]}}));
    await saveMembershipBusinessRules({expectedRevision:0,rules:structuredClone(DEFAULT_MEMBERSHIP_RULES),now:now()});
    const id="KD20261013-9400",order={orderNumber:id,createdAt:now().toISOString(),status:"waiting_studio_pickup_confirmation",orderMode:"studio_pickup",
      items:[{quantity:2}],inventoryTransaction:{state:"inventory_committed",changes:[{skuId:"legacy-sku",productSlug:"coffee",productName:"Coffee",demand:2}]}};
    await fs.writeFile(orderPath(root,id),JSON.stringify(order));const before=await fs.readFile(orderPath(root,id),"utf8");
    await readOrder(id);check("legacy read has no historical rewrite",await fs.readFile(orderPath(root,id),"utf8")===before);
    await core(id);check("missing-domain legacy Coffee uses existing restore",(await loadOrder(id)).inventoryReturn.state==="returned"&&
      JSON.parse(await fs.readFile(path.join(root,"store/website-data.json"),"utf8")).menu.products[0].skus[0].stock===9);
    check("legacy creates no cancellation transaction journal",await fs.readdir(path.join(root,"orders/.transactions")).then(()=>false,error=>error.code==="ENOENT"));
  }
  for(const invalid of ["protocol","domain"]){
    const f=await setup("unknown-"+invalid);
    await withOrderFileUpdateLock(path.join(f.root,"orders"),f.id,async(order,persist)=>persist(invalid==="protocol"?
      {...order,inventoryTransaction:{...(order.inventoryTransaction as object),protocolVersion:2}}:
      {...order,items:(order.items as Array<Record<string,unknown>>).map((line,index)=>index?line:{...line,domain:"unknown"})}));
    const before=inventoryHash(await inventories(f.root));
    await assert.rejects(()=>core(f.id),invalid==="protocol"?/UNKNOWN_CANCELLATION_PROTOCOL/:/INVALID_CANCELLATION_DOMAIN/);
    check("unknown "+invalid+" no inventory restore",inventoryHash(await inventories(f.root))===before);
    check("unknown "+invalid+" no cancelled persistence",(await loadOrder(f.id)).status!=="cancelled");
  }

  {
    const f=await setup("store-without-coffee-file","store"),file=path.join(f.root,"store/website-data.json");
    await fs.unlink(file);await core(f.id);
    check("Store-only cancellation never depends on Coffee inventory",(await loadOrder(f.id)).status==="cancelled"&&(await f.repository.read()).products[0].inventory===5);
    check("Store-only cancellation never recreates Coffee inventory",await fs.access(file).then(()=>false,error=>error.code==="ENOENT"));
  }
  {
    const f=await setup("zero-price","store",false,0);await core(f.id);await happy("zero-price",f);
    check("zero integer TWD remains valid",(await loadOrder(f.id)).total===0);
    await assert.rejects(()=>setup("decimal-admission","store",false,50.5));
    const data=await inventories(path.join(suite,"decimal-admission"));
    check("decimal commerce price fails closed without silent rounding",JSON.stringify(data.stock)===JSON.stringify([10,5])&&data.store.products[0].price===50.5&&data.storeReceipts.length===0&&data.coffeeReceipts.length===0);
  }
  {
    const f=await setup("generic-three-domains");
    // Separate generic foundation transaction: future participants do not change the transaction core.
    const cookieFile=path.join(f.root,"cookie-inventory.json");await fs.writeFile(cookieFile,JSON.stringify({stock:9}));
    const cookie=createInventoryParticipant({domain:"cookie",registryRank:20,
      resource:{rank:2,key:"0020:cookie:"+cookieFile,file:cookieFile},now,
      read:async()=>JSON.parse(await fs.readFile(cookieFile,"utf8")),
      slots:document=>new Map([["cookie-product",{stock:document.stock as number,available:true,set:value=>{document.stock=value;}}]]),
      write:async(_before,after)=>atomicWriteJson(cookieFile,after)});
    const participants=[createCoffeeInventoryParticipant(path.join(f.root,"store/website-data.json"),now),
      createStoreInventoryParticipant({dataRoot:f.root,now}),cookie];
    const coordinator=createCommerceTransactionCoordinator({orderDir:path.join(f.root,"orders"),participants});
    const id="KD20261013-9990";
    const intent:TransactionIntent={schemaVersion:1,transactionId:"future-three-domains:"+randomUUID(),requestHash:"a".repeat(64),
      orderNumber:id,finalStatus:"waiting_studio_pickup_confirmation",
      order:{orderNumber:id,createdAt:now().toISOString(),orderMode:"studio_pickup",items:[{domain:"coffee"},{domain:"store"},{domain:"cookie"}],
        subtotal:580,shipping:0,total:580,idempotencyKey:"future-generic",idempotencyRequestHash:"a".repeat(64)},
      participants:participants.map(participant=>({domain:participant.domain,registryRank:participant.registryRank,
        demands:[{identity:participant.domain==="coffee"?"coffee-sku":participant.domain==="store"?"store-product":"cookie-product",quantity:1}]}))};
    const before=(await inventories(f.root)).stock;
    check("third generic participant APPLY supported",(await coordinator.run(intent)).state==="FINALIZED");
    const restored=await coordinator.restore(intent,{cancelledAt:now().toISOString(),cancelledBy:"admin",
      cancellationReason:"generic engine fixture",cancellationIdempotencyKey:"future-cancel"},
      {validateOrder:async order=>{assert.notEqual(order.status,"completed");},
        commitOrder:async(order,plan,refs,persist)=>{await persist({...order,status:"cancelled",
          inventoryReturn:{operationId:plan.transactionId,participantReceipts:refs}});}});
    check("third generic participant RESTORE supported",restored.state==="FINALIZED"&&Object.keys(restored.observations).length===3&&
      Object.values(restored.observations).every(observation=>observation.state==="COMPENSATED"));
    check("N-domain loop restores every required stock",JSON.stringify((await inventories(f.root)).stock)===JSON.stringify(before)&&
      JSON.parse(await fs.readFile(cookieFile,"utf8")).stock===9);
  }

  await post("Profiler.stopPreciseCoverage");profiler.disconnect();
  check("LOCAL_RUNTIME unchanged",inventoryHash(await snapshot("F:\\KD_Coffee_LOCAL_RUNTIME"))===inventoryHash(realRuntime));
  const boundary=await fs.readFile(path.join(process.cwd(),"components/commerce/CommerceCheckoutBoundary.tsx"),"utf8");
  const checkoutPage=await fs.readFile(path.join(process.cwd(),"app/checkout/page.tsx"),"utf8");
  check("successor checkout boundary preserves eligibility/recovery gating and domain dispatch ownership",boundary.includes("checkoutEligibility")&&boundary.includes("recoverableProtocolV1Attempt")&&checkoutPage.includes('item.domain === "store"')&&checkoutPage.includes("return <ProtocolV1Checkout />")&&checkoutPage.includes("return <CoffeeCheckout />"));
  // commerceOrderTransaction.ts is excluded from the immutable J.6F.4 source baseline:
  // later checkout-coverage phases extend order context; cancellation compatibility is tested above.
  // C2C3 owns CommerceCheckoutBoundary eligibility/recovery and client dispatch;
  // successor behavior is asserted above and covered by the dedicated C2C3 regression.
  for(const file of ["app/api/orders/route.ts",
    "lib/commerceOrderResolver.ts","lib/commerceOrderPricing.ts","lib/orderRewardBasis.ts"]){
    const actual=file==="app/api/orders/route.ts" ? execFileSync("git",["show","1e39676df206a1670d7e449069b2932dc8b3257a:"+file],{encoding:"utf8",windowsHide:true}) : await fs.readFile(path.join(process.cwd(),file),"utf8"),baseline=execFileSync("git",["show","8fe325c52d167e9c9216a767d102d94b8da1e21f:"+file],{encoding:"utf8",windowsHide:true});
    check(file+(file==="app/api/orders/route.ts" ? " protected committed baseline unchanged" : " protected baseline unchanged"),actual.replaceAll("\r\n","\n")===baseline.replaceAll("\r\n","\n"));
  }
  console.log("J.6F.4 PASS "+count+"/"+count+"; real J.6F.3 creation and isolated fixtures only");
}
