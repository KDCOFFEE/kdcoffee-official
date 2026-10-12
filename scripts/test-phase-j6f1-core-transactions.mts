import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { recordAdminFulfillmentEvent, readFulfillmentStore, fulfillmentRecordForOrder, synchronizeCompletedOrderFulfillment, FulfillmentError } from "../lib/fulfillment";
import { withFileLock } from "../lib/jsonFileStore";
import { withCommerceLockPlan, orderGateResource } from "../lib/commerceLocks";
import { CommerceLockOrderError } from "../lib/commerceLockProtocol";
import { hasOrderCompletion, returnDeadlineAtTaipeiDayEnd, OrderCompletionIntegrityError } from "../lib/orderCompletion";
import { createOrderFile, withOrderFileUpdateLock } from "../lib/orderFiles";
import { runInventoryOrderTransaction, inspectInventoryCommitState } from "../lib/orderInventoryTransaction";
import { returnCommittedInventoryForCancellation } from "../lib/orderInventoryReturn";
import { inventoryHash, findInventoryReceipt, readInventoryReceipts, makeInventoryReceipt, addInventoryReceipt } from "../lib/inventoryReceipts";
import { createCoffeeInventoryParticipant, createStoreInventoryParticipant, createInventoryParticipant } from "../lib/inventoryParticipants";
import { createCommerceTransactionCoordinator, CommerceTransactionConflictError } from "../lib/commerceTransactionCoordinator";
import { createCommerceTransactionJournal } from "../lib/commerceTransactionJournal";
import { createStoreRepository } from "../lib/storeRepository";
import type { TransactionIntent } from "../lib/commerceTransactionTypes";
import type { WebsiteData } from "../data/websiteData";

const now=()=>new Date("2026-10-12T06:37:00.000Z");
const node=process.execPath, script=fileURLToPath(import.meta.url);
const bootstrap=fileURLToPath(new URL("./member-auth-test-bootstrap.mjs",import.meta.url));
const savedRoot=process.env.KD_DATA_DIR;
function coffeeDocument(){return {version:1,updatedAt:now().toISOString(),menu:{products:[{id:"coffee-id",slug:"coffee-a",name:"Coffee A",active:true,status:"active",stock:10,skus:[{id:"coffee-sku",label:"耳掛",detail:"",kind:"drip",price:100,stock:10,enabled:true}],purchase:[]}]}};}
function intent(id:string,orderNumber="KD20261012-1001",storeQuantity=2):TransactionIntent{
  return {schemaVersion:1,transactionId:id,requestHash:inventoryHash({id,storeQuantity}),orderNumber,
    participants:[{domain:"store",registryRank:10,demands:[{identity:"store-product",quantity:storeQuantity}]},{domain:"coffee",registryRank:0,demands:[{identity:"coffee-sku",quantity:2}]}],
    order:{orderNumber,createdAt:now().toISOString(),orderMode:"711_cod",subtotal:300,shipping:60,total:360,items:[]},finalStatus:"waiting_merchant_create_cod_shipment"};
}
function participants(root:string){
  return [createCoffeeInventoryParticipant(path.join(root,"store","website-data.json"),now),createStoreInventoryParticipant({dataRoot:root,now})];
}
async function fixture(root:string){
  await fs.mkdir(path.join(root,"store"),{recursive:true});await fs.mkdir(path.join(root,"orders"),{recursive:true});
  await fs.writeFile(path.join(root,"store","website-data.json"),JSON.stringify(coffeeDocument()));
  const repo=createStoreRepository({dataRoot:root,now});
  await repo.createSection({id:"section",name:"Equipment",slug:"equipment",published:true});
  await repo.createProduct({id:"store-product",sectionId:"section",slug:"kettle",name:"Kettle",sku:"KETTLE",price:50,inventory:5,pvValue:0,published:true});
}
async function stock(root:string){
  const coffee=JSON.parse(await fs.readFile(path.join(root,"store","website-data.json"),"utf8"));
  const store=await createStoreRepository({dataRoot:root}).read();
  return [coffee.menu.products[0].skus[0].stock,store.products[0].inventory];
}
if(process.argv[2]==="--worker"){
  const root=process.argv[3],phase=process.argv[4];process.env.KD_DATA_DIR=root;
  await createCommerceTransactionCoordinator({orderDir:path.join(root,"orders"),participants:participants(root),hook:async(point,domain)=>{
    if(point===phase&&(point!=="APPLIED"||domain==="coffee")){
      process.stdout.write("CRASH_POINT\n");await new Promise(()=>{});
    }
  }}).run(intent("crash-"+phase));
}else{
  const suiteRoot=await fs.mkdtemp(path.join(os.tmpdir(),"kd-j6f1-core-"));process.env.KD_DATA_DIR=suiteRoot;
  let count=0;
  const test=async(label:string,operation:()=>unknown|Promise<unknown>)=>{await operation();count++;process.stdout.write("PASS "+String(count).padStart(3,"0")+" "+label+"\n");};
  const root=async(name:string)=>{const target=path.join(suiteRoot,name);await fixture(target);return target;};
  const coordinator=(target:string,overrides:Partial<Parameters<typeof createCommerceTransactionCoordinator>[0]>={})=>createCommerceTransactionCoordinator({orderDir:path.join(target,"orders"),participants:participants(target),...overrides});
  try{
    await test("Taipei displayed date remains valid through its final millisecond",()=>assert.equal(returnDeadlineAtTaipeiDayEnd(now().toISOString(),14),"2026-10-26T15:59:59.999Z"));
    await test("zero-day protection ends at completion calendar day's end",()=>assert.equal(returnDeadlineAtTaipeiDayEnd("2026-10-12T00:00:00.000Z",0),"2026-10-12T15:59:59.999Z"));
    await test("Taipei calendar conversion handles UTC previous-date boundary",()=>assert.equal(returnDeadlineAtTaipeiDayEnd("2026-10-11T18:00:00.000Z",0),"2026-10-12T15:59:59.999Z"));
    await test("deadline rolls month and year without a timestamp-time cutoff",()=>assert.equal(returnDeadlineAtTaipeiDayEnd("2026-12-31T06:00:00.000Z",1),"2027-01-01T15:59:59.999Z"));
    for(const days of [-1,0.5,366,NaN])await test("invalid protection days rejected "+days,()=>assert.throws(()=>returnDeadlineAtTaipeiDayEnd(now().toISOString(),days)));
    await test("completed evidence survives status projection inconsistency",()=>assert.equal(hasOrderCompletion({status:"uncollected",statusHistory:[{to:"completed"}]}),true));
    const terminal=await root("terminal");process.env.KD_DATA_DIR=terminal;
    await createOrderFile(path.join(terminal,"orders"),"KD20261012-2001",{orderNumber:"KD20261012-2001",status:"ready_for_pickup",orderMode:"711_cod"},()=>{throw new Error("collision");});
    const first=await withOrderFileUpdateLock(path.join(terminal,"orders"),"KD20261012-2001",async(order,persist)=>persist({...order,status:"completed",statusHistory:[{to:"completed",at:now().toISOString()}]}));
    const completion=first.completion as Record<string,unknown>;
    await test("first completion persists canonical timestamp",()=>assert.equal(first.completedAt,now().toISOString()));
    await test("first completion snapshots the existing return setting",()=>assert.equal(typeof completion.returnProtectionDaysSnapshot,"number"));
    await test("first completion persists rules version and immutable end-of-day deadline",()=>{assert.equal(typeof completion.rulesVersion,"number");assert.match(String(completion.returnDeadline),/T15:59:59\.999Z$/);});
    for(const status of ["cancelled","uncollected","ready_for_pickup","new_order"])await test("shared persistence blocks completed -> "+status,()=>assert.rejects(()=>withOrderFileUpdateLock(path.join(terminal,"orders"),"KD20261012-2001",async(order,persist)=>persist({...order,status})),OrderCompletionIntegrityError));
    await test("shared persistence blocks completedAt replacement",()=>assert.rejects(()=>withOrderFileUpdateLock(path.join(terminal,"orders"),"KD20261012-2001",async(order,persist)=>persist({...order,completedAt:"2026-10-13T00:00:00.000Z"})),OrderCompletionIntegrityError));
    await test("shared persistence blocks completion snapshot deletion",()=>assert.rejects(()=>withOrderFileUpdateLock(path.join(terminal,"orders"),"KD20261012-2001",async(order,persist)=>{const next={...order};delete next.completion;return persist(next);}),OrderCompletionIntegrityError));
    await test("shared persistence blocks original completed event deletion",()=>assert.rejects(()=>withOrderFileUpdateLock(path.join(terminal,"orders"),"KD20261012-2001",async(order,persist)=>persist({...order,statusHistory:[]})),OrderCompletionIntegrityError));
    await test("unrelated completed-order update preserves original completion",async()=>{const next=await withOrderFileUpdateLock(path.join(terminal,"orders"),"KD20261012-2001",async(order,persist)=>persist({...order,note:"updated"}));assert.deepEqual(next.completion,first.completion);});
    await createOrderFile(path.join(terminal,"orders"),"KD20261012-2002",{orderNumber:"KD20261012-2002",status:"completed",orderMode:"711_cod"},()=>{throw new Error("collision");});
    await test("historical completed order is not deadline-backfilled",async()=>{const next=await withOrderFileUpdateLock(path.join(terminal,"orders"),"KD20261012-2002",async(order,persist)=>persist({...order,note:"legacy"}));assert.equal(next.completion,undefined);assert.equal(next.completedAt,undefined);});
    const fulfillmentFile=path.join(terminal,"fulfillment","state.json");await fs.mkdir(path.dirname(fulfillmentFile),{recursive:true});
    const fulfillment=await readFulfillmentStore(fulfillmentFile);
    fulfillment.records["KD20261012-2001"]={orderId:"KD20261012-2001",currentState:"arrived_at_pickup_store",revision:1,events:[],createdAt:now().toISOString(),updatedAt:now().toISOString()};
    await fs.writeFile(fulfillmentFile,JSON.stringify(fulfillment));
    await test("fulfillment cannot turn completed order into uncollected through stale projection",()=>assert.rejects(()=>recordAdminFulfillmentEvent({orderId:"KD20261012-2001",state:"uncollected",expectedRevision:1,confirmed:true}),FulfillmentError));
    await test("member/admin fulfillment projection respects canonical completion",()=>assert.equal(fulfillmentRecordForOrder(fulfillment,first as never).currentState,"completed"));
    await test("Admin completion projection synchronization is idempotent",async()=>{
      await withOrderFileUpdateLock(path.join(terminal,"orders"),"KD20261012-2001",async order=>synchronizeCompletedOrderFulfillment(order as never));
      const before=await fs.readFile(fulfillmentFile,"utf8");
      await withOrderFileUpdateLock(path.join(terminal,"orders"),"KD20261012-2001",async order=>synchronizeCompletedOrderFulfillment(order as never));
      assert.equal(await fs.readFile(fulfillmentFile,"utf8"),before);
    });
    const lockRoot=path.join(suiteRoot,"locks");await fs.mkdir(lockRoot);
    const low={file:path.join(lockRoot,"low"),rank:1 as const,key:"a"},high={file:path.join(lockRoot,"high"),rank:2 as const,key:"b"};
    await test("canonical plan sorts resources before acquisition",()=>withCommerceLockPlan([high,low],async()=>assert.equal(true,true)));
    await test("reverse dynamic acquisition fails before waiting",()=>assert.rejects(()=>withFileLock(high.file,()=>withFileLock(low.file,async()=>true,{commerceLock:low}),{commerceLock:high}),CommerceLockOrderError));
    await test("sealed callback cannot discover an additional higher lock",()=>assert.rejects(()=>withCommerceLockPlan([low],()=>withFileLock(high.file,async()=>true,{commerceLock:high})),CommerceLockOrderError));
    await test("duplicate lock resources are rejected",()=>assert.rejects(()=>withCommerceLockPlan([low,low],async()=>true)));
    await test("same-resource reentrant acquisition is rejected",()=>assert.rejects(()=>withFileLock(low.file,()=>withFileLock(low.file,async()=>true,{commerceLock:low}),{commerceLock:low}),CommerceLockOrderError));
    const invalidJson=await root("invalid-json"),jsonEngine=coordinator(invalidJson);
    for(const [label,value] of [["undefined",undefined],["NaN",NaN],["Infinity",Infinity],["Date",now()],["bigint",BigInt(1)]] as const){
      await test("non-JSON intent is rejected before journal or inventory writes: "+label,async()=>{
        const invalid=intent("invalid-json-"+label);invalid.order.extra=value;
        await assert.rejects(()=>jsonEngine.run(invalid),/lossless bounded JSON/);
        assert.equal((await createCommerceTransactionJournal(path.join(invalidJson,"orders"),invalid.transactionId).read()).length,0);
        assert.deepEqual(await stock(invalidJson),[10,5]);
      });
    }
    await test("cyclic intent is rejected before transaction preparation",async()=>{
      const invalid=intent("invalid-json-cycle");invalid.order.extra=invalid.order;
      await assert.rejects(()=>jsonEngine.run(invalid),/lossless bounded JSON/);
      assert.equal((await createCommerceTransactionJournal(path.join(invalidJson,"orders"),invalid.transactionId).read()).length,0);
    });
    await test("valid JSON null fields survive restart and receipt recovery",async()=>{
      const valid=intent("valid-json");valid.order.extra=null;
      assert.equal((await jsonEngine.run(valid)).state,"FINALIZED");
      assert.equal((await jsonEngine.recover(valid.transactionId)).state,"FINALIZED");
    });
    const success=await root("success"),engine=coordinator(success),input=intent("success");
    await test("two-domain transaction finalizes only after both durable receipts",async()=>{const result=await engine.run(input);assert.equal(result.state,"FINALIZED");assert.equal(Object.keys(result.observations).length,2);});
    await test("canonical participant changes are applied exactly once",async()=>assert.deepEqual(await stock(success),[8,3]));
    await test("same intent replays finalization without inventory mutation",async()=>{assert.equal((await engine.run(input)).state,"FINALIZED");assert.deepEqual(await stock(success),[8,3]);});
    await test("recover finalized transaction remains idempotent",async()=>{assert.equal((await engine.recover("success")).state,"FINALIZED");assert.deepEqual(await stock(success),[8,3]);});
    await test("same transaction with changed demand conflicts",()=>assert.rejects(()=>engine.run({...input,participants:input.participants.map(p=>({...p,demands:p.demands.map(d=>({...d,quantity:3}))}))}),CommerceTransactionConflictError));
    await test("order contains apply receipt references for every required domain",async()=>{const order=JSON.parse(await fs.readFile(path.join(success,"orders",input.orderNumber+".json"),"utf8"));assert.equal(order.inventoryTransaction.participantReceipts.length,2);});
    await test("Store Admin updates retain durable inventory receipts",async()=>{const repo=createStoreRepository({dataRoot:success,now}),catalog=await repo.read();const before=catalog.inventoryReceipts;await repo.updateProduct("store-product",catalog.products[0].revision,{name:"Renamed"});assert.deepEqual((await repo.read()).inventoryReceipts,before);});
    await test("recovery tolerates unrelated catalog revisions using receipts",async()=>{assert.equal((await engine.recover("success")).state,"FINALIZED");assert.deepEqual(await stock(success),[8,3]);});
    const failure=await root("failure");
    await test("Coffee apply then Store rejection compensates Coffee once",async()=>{assert.equal((await coordinator(failure).run(intent("failure",undefined,99))).state,"ABORTED");assert.deepEqual(await stock(failure),[10,5]);});
    await test("abort retry cannot compensate inventory twice",async()=>{assert.equal((await coordinator(failure).recover("failure")).state,"ABORTED");assert.deepEqual(await stock(failure),[10,5]);});
    await test("aborted order never exposes inventory_committed",async()=>{const order=JSON.parse(await fs.readFile(path.join(failure,"orders","KD20261012-1001.json"),"utf8"));assert.notEqual(order.inventoryTransaction.state,"inventory_committed");});
    const unknown=await root("unknown"),unknownAdapters=participants(unknown);
    unknownAdapters[1]={...unknownAdapters[1],inspect:async()=>({state:"UNKNOWN"})};
    await test("unknown participant fails closed before applying any domain",async()=>{assert.equal((await coordinator(unknown,{participants:unknownAdapters}).run(intent("unknown"))).state,"REVIEW_REQUIRED");assert.deepEqual(await stock(unknown),[10,5]);});
    await test("durable manual-review gate cannot auto-finalize on later retry",async()=>{assert.equal((await coordinator(unknown).recover("unknown")).state,"REVIEW_REQUIRED");assert.deepEqual(await stock(unknown),[10,5]);});
    const finalWrite=await root("final-write"),finalIntent=intent("final-write");
    await test("final order write failure leaves both apply receipts pending",async()=>{
      const result=await coordinator(finalWrite,{writeFinalOrder:async()=>{throw new Error("Injected finalize write failure");}}).run(finalIntent);
      assert.equal(result.state,"PENDING");assert.deepEqual(await stock(finalWrite),[8,3]);
    });
    await test("finalize retry never repeats either domain decrement",async()=>{assert.equal((await coordinator(finalWrite).recover("final-write")).state,"FINALIZED");assert.deepEqual(await stock(finalWrite),[8,3]);});
    const compensate=await root("compensate"),compAdapters=participants(compensate);
    compAdapters[0]={...compAdapters[0],restore:async()=>{throw new Error("Injected restore write failure");}};
    await test("failed compensation remains blocked with durable abort intent",async()=>{
      assert.equal((await coordinator(compensate,{participants:compAdapters}).run(intent("compensate",undefined,99))).state,"PENDING");assert.deepEqual(await stock(compensate),[8,5]);
    });
    await test("compensation-pending recovery restores once and aborts",async()=>{assert.equal((await coordinator(compensate).recover("compensate")).state,"ABORTED");assert.deepEqual(await stock(compensate),[10,5]);});
    const ioAfter=await root("io-after"),ioAdapters=participants(ioAfter),normalApply=ioAdapters[0].apply;
    ioAdapters[0]={...ioAdapters[0],apply:async operation=>{await normalApply(operation);throw new Error("IO error after publication");}};
    await test("post-publication apply error is resolved by durable receipt",async()=>{assert.equal((await coordinator(ioAfter,{participants:ioAdapters}).run(intent("io-after"))).state,"FINALIZED");assert.deepEqual(await stock(ioAfter),[8,3]);});
    const concurrent=await root("concurrent");
    await test("concurrent buyers do not oversell either inventory domain",async()=>{
      const results=await Promise.all([1,2,3].map(n=>coordinator(concurrent).run(intent("buyer-"+n,"KD20261012-400"+n))));
      assert.equal(results.filter(result=>result.state==="FINALIZED").length,2);assert.equal(results.filter(result=>result.state==="ABORTED").length,1);
      assert.deepEqual(await stock(concurrent),[6,1]);
    });
    const third=await root("third"),thirdFile=path.join(third,"future.json");await fs.writeFile(thirdFile,JSON.stringify({stock:4}));
    const thirdAdapter=createInventoryParticipant({domain:"future",registryRank:20,resource:{file:thirdFile,rank:2,key:"0020:future:"+thirdFile},
      read:async()=>JSON.parse(await fs.readFile(thirdFile,"utf8")),
      slots:document=>new Map([["future-id",{stock:document.stock as number,set:value=>{document.stock=value;},available:true}]]),
      write:async(_before,after)=>{await fs.writeFile(thirdFile,JSON.stringify(after));}});
    await test("coordinator supports a third registered domain without a two-domain special case",async()=>{
      const input=intent("third");input.participants.push({domain:"future",registryRank:20,demands:[{identity:"future-id",quantity:1}]});
      assert.equal((await coordinator(third,{participants:[...participants(third),thirdAdapter]}).run(input)).state,"FINALIZED");
      assert.equal(JSON.parse(await fs.readFile(thirdFile,"utf8")).stock,3);
    });
    await test("N-domain Coffee participant rejects a public receipt target",()=>assert.throws(()=>createCoffeeInventoryParticipant(path.join(process.cwd(),"public","data","website-data.json"))));
    const partial=await root("restore"),adapter=participants(partial)[1],apply={transactionId:"restore",operationId:"restore-apply",demands:[{identity:"store-product",quantity:3}]};
    await withCommerceLockPlan([adapter.resource],async()=>{await adapter.apply(apply);});
    await test("partial Store restore persists linked durable receipt",()=>withCommerceLockPlan([adapter.resource],async()=>{await adapter.restore({...apply,operationId:"restore-one",parentOperationId:apply.operationId,demands:[{identity:"store-product",quantity:1}]});assert.deepEqual(await stock(partial),[10,3]);}));
    await test("partial restore retry does not increase inventory twice",()=>withCommerceLockPlan([adapter.resource],async()=>{await adapter.restore({...apply,operationId:"restore-one",parentOperationId:apply.operationId,demands:[{identity:"store-product",quantity:1}]});assert.deepEqual(await stock(partial),[10,3]);}));
    await test("cumulative restore cannot exceed original apply",()=>withCommerceLockPlan([adapter.resource],()=>assert.rejects(()=>adapter.restore({...apply,operationId:"restore-excess",parentOperationId:apply.operationId,demands:[{identity:"store-product",quantity:3}]}))));
    await test("restore cannot invent an original apply receipt",()=>withCommerceLockPlan([adapter.resource],()=>assert.rejects(()=>adapter.restore({...apply,operationId:"restore-forged",parentOperationId:"missing",demands:[{identity:"store-product",quantity:1}]}))));
    await test("same restore ID with a changed quantity is rejected",()=>withCommerceLockPlan([adapter.resource],()=>assert.rejects(()=>adapter.restore({...apply,operationId:"restore-one",parentOperationId:apply.operationId,demands:[{identity:"store-product",quantity:2}]}))));
    const live=await root("coffee-live");process.env.KD_DATA_DIR=live;
    const transaction=await runInventoryOrderTransaction({websiteFile:path.join(live,"store","website-data.json"),orderDir:path.join(live,"orders"),items:[{slug:"coffee-a",optionId:"coffee-sku",optionLabel:"耳掛",quotedUnitPrice:100,quantity:2}],initialOrderNumber:"KD20261012-3001",generateOrderNumber:()=>{throw new Error("unexpected collision");},now,buildOrder:orderNumber=>({order:{orderNumber,createdAt:now().toISOString(),status:"waiting_merchant_create_cod_shipment",orderMode:"711_cod"},lineText:"Coffee"})});
    await test("existing Coffee transaction persists apply metadata",()=>{assert.equal(transaction.finalized,true);assert.equal(typeof (transaction.order.inventoryTransaction as {operationId?:string}).operationId,"string");});
    const originalMetadata=transaction.order.inventoryTransaction as Parameters<typeof inspectInventoryCommitState>[0];
    const coffeeFile=path.join(live,"store","website-data.json"),coffeeState=JSON.parse(await fs.readFile(coffeeFile,"utf8"));coffeeState.version+=1;await fs.writeFile(coffeeFile,JSON.stringify(coffeeState));
    await test("Coffee commit recovery does not depend on entire-file hash",async()=>assert.equal(inspectInventoryCommitState(originalMetadata,await fs.readFile(coffeeFile,"utf8")),"inventory_committed"));
    let cancelled={...transaction.order,status:"cancelled"} as typeof transaction.order;
    const returned=await returnCommittedInventoryForCancellation({order:cancelled as never,websiteFile:coffeeFile,now,persistOrder:async order=>{cancelled=order;}});
    await test("Coffee cancellation restores using the original durable apply",async()=>{assert.equal(returned.state,"returned");assert.deepEqual(await stock(live),[10,5]);});
    const afterReturn=JSON.parse(await fs.readFile(coffeeFile,"utf8"));afterReturn.version+=1;afterReturn.menu.products[0].skus[0].stock=7;afterReturn.menu.products[0].stock=7;await fs.writeFile(coffeeFile,JSON.stringify(afterReturn));
    await test("restore receipt prevents double restore after unrelated stock change",async()=>{const replay=await returnCommittedInventoryForCancellation({order:cancelled as never,websiteFile:coffeeFile,now,persistOrder:async order=>{cancelled=order;}});assert.equal(replay.state,"already_returned");assert.deepEqual(await stock(live),[7,5]);});
    await test("receipt validation rejects corrupted stock deltas",()=>{const document={};assert.throws(()=>addInventoryReceipt(document,makeInventoryReceipt({operationId:"bad",transactionId:"bad",domain:"coffee",kind:"APPLY",recordedAt:now().toISOString(),items:[{identity:"sku",quantity:1,beforeStock:4,afterStock:4}]})));});
    await test("unregistered domain cannot be silently omitted",()=>assert.rejects(()=>engine.run({...input,transactionId:"unknown-domain",participants:[...input.participants,{domain:"future",registryRank:20,demands:[{identity:"x",quantity:1}]}]})));
    for(const phase of ["APPLIED","BEFORE_FINALIZE"]){
      const crash=await root("crash-"+phase);process.env.KD_DATA_DIR=crash;
      let transcript="";
      const child=spawn(node,["--experimental-strip-types","--import",pathToFileURL(bootstrap).href,script,"--worker",crash,phase],{cwd:process.cwd(),stdio:["ignore","pipe","pipe"],windowsHide:true});
      const killed=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error("Crash worker timeout "+transcript));},20000);child.stdout.on("data",data=>{transcript+=String(data);if(transcript.includes("CRASH_POINT"))child.kill();});child.stderr.on("data",data=>{transcript+=String(data);});child.on("error",reject);child.on("exit",()=>{clearTimeout(timer);transcript.includes("CRASH_POINT")?resolve():reject(new Error(transcript));});});
      await killed;
      await test("actual worker crash leaves no finalized order "+phase,async()=>{const order=JSON.parse(await fs.readFile(path.join(crash,"orders","KD20261012-1001.json"),"utf8"));assert.equal(order.status,"inventory_pending");});
      const locks:string[]=[];const collect=async(dir:string)=>{for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await collect(file);else if(entry.name.endsWith(".lock"))locks.push(file);}};await collect(crash);
      await test("crashed worker's stale locks remain for explicit recovery "+phase,()=>assert.ok(locks.length>0));
      // Test-only maintenance after the worker's exit. Never remove production/still-owned locks.
      for(const file of locks){assert.ok(path.resolve(file).startsWith(path.resolve(suiteRoot)+path.sep));await fs.unlink(file);}
      await test("crash recovery uses durable receipts without repeated decrement "+phase,async()=>{assert.equal((await coordinator(crash).recover("crash-"+phase)).state,"FINALIZED");assert.deepEqual(await stock(crash),[8,3]);});
      await test("second recovery is idempotent "+phase,async()=>{assert.equal((await coordinator(crash).recover("crash-"+phase)).state,"FINALIZED");assert.deepEqual(await stock(crash),[8,3]);});
    }
    const damaged=await root("damaged");await coordinator(damaged).run(intent("damaged"));const journal=createCommerceTransactionJournal(path.join(damaged,"orders"),"damaged");const event=path.join(journal.directory,"00000000.json");await fs.writeFile(event,"{broken");
    await test("corrupt transaction journal fails closed",async()=>{assert.equal((await coordinator(damaged).recover("damaged")).state,"REVIEW_REQUIRED");assert.deepEqual(await stock(damaged),[8,3]);});
    const source=await fs.readFile("lib/commerceTransactionCoordinator.ts","utf8");
    await test("foundation has no reward/wallet/subscription/notification side effects",()=>assert.doesNotMatch(source,/membershipCommerce|sendInternalLineNotification|createSubscription|reserveCredit/));
    await test("Store checkout remains gated outside this phase",async()=>assert.match(await fs.readFile("lib/commerceCart.ts","utf8"),/items\.some\(item => item\.domain === "store"\).*STORE_CHECKOUT_NOT_ENABLED/));
    process.stdout.write("J.6F.1 Phase 1: "+count+"/"+count+" PASS; isolated fixtures only.\n");
  }finally{
    if(savedRoot===undefined)delete process.env.KD_DATA_DIR;else process.env.KD_DATA_DIR=savedRoot;
    assert.ok(path.resolve(suiteRoot).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(suiteRoot,{recursive:true,force:true});
  }
}
