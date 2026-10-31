import "server-only";
import {withOrderGate} from "./commerceLocks";
import fs from "node:fs/promises";
import path from "node:path";
import {withStoredOrderUpdateLock} from "./adminOrders";
import {readMembershipCommerceState,validateMembershipCommerceState} from "./membershipCommerce";
import {atomicWriteJson,withFileLock} from "./jsonFileStore";
import {getMembershipCommerceStateFile,getOrdersDir,getPersistentDataRoot,getWebsiteDataFile} from "./storagePaths";
import {withReturnInventoryLocks,ReturnStockEvidenceError,type ReturnStockOperation} from "./returnInventoryTransaction";
import {InventoryReceiptError,inventoryHash,inventoryOperationKey,normalizeInventoryDemand,findInventoryReceipt,type InventoryReceipt} from "./inventoryReceipts";
import {resolveReturnLineEvidence} from "./orderCompletion";
import {originalEconomicFingerprint as fingerprint} from "./orderRewardBasis";
import {appendSettlementEvent,assertSettlementPrefix,planApprovedReturnSettlement,projectReturnSettlements,returnInventorySummary,type SettlementEffect} from "./returnSettlementLedger";
type RecordValue=Record<string,unknown>;
function prove(value:unknown):asserts value {if(!value)throw new ReturnStockEvidenceError("original_inventory_identity_requires_review");}
function record(value:unknown):RecordValue {prove(value && typeof value === "object" && !Array.isArray(value));return value as RecordValue;}
/** Read-only compatibility for ORIGINAL protocol-1 journals; no writer/coordinator/order allocator. */
async function originalJournal(transactionId:string):Promise<Array<RecordValue>> {
  const directory=path.join(getOrdersDir(),".transactions",inventoryOperationKey(transactionId));
  const stat=await fs.lstat(directory);prove(stat.isDirectory()&&!stat.isSymbolicLink());
  const names=(await fs.readdir(directory)).filter(name=>!name.startsWith(".")).sort();prove(names.length>1&&names.length<=10000);
  const output:RecordValue[]=[];
  for(const [sequence,name] of names.entries()) {
    prove(name===String(sequence).padStart(8,"0")+".json");const file=path.join(directory,name),info=await fs.lstat(file);prove(info.isFile()&&!info.isSymbolicLink()&&info.size<=2*1024*1024);
    let raw:unknown;try{raw=JSON.parse(await fs.readFile(file,"utf8"));}catch{throw new ReturnStockEvidenceError("invalid_original_journal");}
    const envelope=record(raw),event=record(envelope.event);
    prove(envelope.schemaVersion===1&&envelope.sequence===sequence&&envelope.previousHash===(output.at(-1)?.hash??null)
      && envelope.hash===inventoryHash({schemaVersion:1,sequence,previousHash:envelope.previousHash,event}));
    prove((sequence===0)===(event.type==="PREPARED"));output.push(envelope);
  }
  prove(record(output.at(-1)!.event).type==="FINALIZED");return output;
}
async function targetFor(order:RecordValue,effect:SettlementEffect,state:Awaited<ReturnType<typeof readMembershipCommerceState>>,stockFiles:string[],now:Date):Promise<{file:string;operation:ReturnStockOperation}> {
  prove(order.status==="completed" && order.orderNumber===effect.orderId);
  const request=state.returnEvents?.find(event=>event.type==="RETURN_REQUESTED"&&event.returnRequestId===effect.returnRequestId&&event.orderId===effect.orderId);
  prove(request?.type==="RETURN_REQUESTED"&&fingerprint(order.completion)===fingerprint(request.completion));
  const proof=resolveReturnLineEvidence({orderNumber:effect.orderId,status:"completed",completion:request.completion});prove(proof.status==="resolved");
  const line=proof.lines.find(item=>item.returnLineRef===effect.returnLineRef);prove(line&&line.snapshot.inventoryManaged!==false);
  const tx=record(order.inventoryTransaction);prove(tx.state==="inventory_committed" && !order.inventoryReturn);
  let domain:"coffee"|"store",identity:string,source:string,parent:string,originalQuantity:number;
  if(tx.protocolVersion===undefined) {
    domain="coffee";prove(typeof tx.beforeWebsiteSha256==="string"&&/^[a-f0-9]{64}$/.test(tx.beforeWebsiteSha256)
      && typeof tx.afterWebsiteSha256==="string"&&/^[a-f0-9]{64}$/.test(tx.afterWebsiteSha256)&&tx.beforeWebsiteSha256!==tx.afterWebsiteSha256
      && typeof tx.committedAt==="string"&&Number.isFinite(Date.parse(tx.committedAt))&&Array.isArray(tx.changes)&&tx.changes.length>0);
    const changes=tx.changes.map(record);const ids=new Set<string>();
    for(const change of changes){prove(typeof change.skuId==="string"&&change.skuId&&!ids.has(change.skuId)&&typeof change.productSlug==="string");ids.add(change.skuId);
      prove(Number.isSafeInteger(change.beforeStock)&&Number.isSafeInteger(change.afterStock)&&Number(change.afterStock)>=0&&Number(change.beforeStock)-Number(change.afterStock)===change.demand);}
    const demands=proof.lines.map(item=>{prove((item.snapshot.domain===undefined||item.snapshot.domain==="coffee")&&typeof item.snapshot.optionId==="string"&&typeof item.snapshot.slug==="string");
      prove(changes.some(change=>change.skuId===item.snapshot.optionId&&change.productSlug===item.snapshot.slug));return {identity:item.snapshot.optionId,quantity:item.originalQuantity};});
    prove(fingerprint(normalizeInventoryDemand(demands))===fingerprint(normalizeInventoryDemand(changes.map(item=>({identity:String(item.skuId),quantity:Number(item.demand)})))));
    prove(typeof line.snapshot.optionId==="string");identity=line.snapshot.optionId;
    originalQuantity=Number(changes.find(item=>item.skuId===identity)!.demand);
    source="production-stock:"+fingerprint([effect.orderId,tx]);parent=source;
  }else {
    prove(tx.protocolVersion===1&&typeof tx.transactionId==="string"&&typeof tx.intentHash==="string");
    let journal:Array<RecordValue>;try{journal=await originalJournal(tx.transactionId);}catch{throw new ReturnStockEvidenceError("invalid_original_journal");}
    const first=record(journal[0].event),intent=record(first.intent),original=record(intent.order);
    prove(intent.transactionId===tx.transactionId&&intent.orderNumber===effect.orderId&&inventoryHash(intent)===tx.intentHash
      && Array.isArray(original.items)&&fingerprint(original.items)===fingerprint(proof.lines.map(item=>item.snapshot))&&Array.isArray(intent.participants));
    prove(line.snapshot.domain==="coffee"||line.snapshot.domain==="store");domain=line.snapshot.domain;
    const rawIdentity=domain==="coffee"?line.snapshot.variantId:line.snapshot.productId;prove(typeof rawIdentity==="string"&&(domain!=="store"||line.snapshot.variantId==="default"));identity=rawIdentity;
    const participant=intent.participants.map(record).find(item=>item.domain===domain);prove(participant&&participant.registryRank===(domain==="coffee"?0:10)&&Array.isArray(participant.demands));
    const originalDemands=proof.lines.filter(item=>item.snapshot.domain===domain).map(item=>{const value=domain==="coffee"?item.snapshot.variantId:item.snapshot.productId;prove(typeof value==="string");return {identity:value,quantity:item.originalQuantity};});
    prove(fingerprint(normalizeInventoryDemand(originalDemands))===fingerprint(normalizeInventoryDemand(participant.demands as Array<{identity:string;quantity:number}>)));
    source=tx.transactionId;parent="apply:"+inventoryOperationKey(source+":"+domain);
    originalQuantity=normalizeInventoryDemand(originalDemands).find(item=>item.identity===identity)!.quantity;
  }
  const root=getPersistentDataRoot(),file=domain==="coffee"?getWebsiteDataFile():path.join(root,"store-domain/catalog.json");prove(stockFiles.includes(file));
  if(tx.protocolVersion===1) {
    const document=JSON.parse(await fs.readFile(file,"utf8")),apply=findInventoryReceipt(document,parent);prove(apply&&apply.kind==="APPLY"&&apply.transactionId===source&&apply.domain===domain
      && !findInventoryReceipt(document,"compensate:"+inventoryOperationKey(source+":"+domain))&&Array.isArray(tx.participantReceipts)
      && tx.participantReceipts.map(record).some(item=>item.domain===domain&&item.operationId===parent&&item.receiptHash===inventoryHash(apply)));
    prove(fingerprint(normalizeInventoryDemand(apply.items))===fingerprint(normalizeInventoryDemand(proof.lines.filter(item=>item.snapshot.domain===domain).map(item=>({identity:String(domain==="coffee"?item.snapshot.variantId:item.snapshot.productId),quantity:item.originalQuantity})))));
  }
  return {file,operation:{operationId:"return-stock:"+fingerprint(effect.effectId),transactionId:source,parentOperationId:parent,domain,identity,
    quantity:effect.approvedQuantity,originalQuantity,productSlug:typeof line.snapshot.slug==="string"?line.snapshot.slug:undefined,now}};
}
export type ReturnInventoryRuntime={stateFilePath?:string;now?:Date;hook?:(phase:"BEFORE_RESTORE"|"AFTER_RESTORE",effect:SettlementEffect)=>Promise<void>};
/** Approval/outbox already committed. Existing inventory -> order -> commerce locks;
 * atomic stock+return receipt survives a crash before settlement APPLIED append. */
export async function applyApprovedReturnInventory(orderNumber:string,returnRequestId:string,runtime:ReturnInventoryRuntime={}) {
  prove(/^KD[0-9-]+$/.test(orderNumber)&&returnRequestId&&returnRequestId.length<=200);
  const stateFile=runtime.stateFilePath??getMembershipCommerceStateFile(),root=getPersistentDataRoot(),now=runtime.now??new Date();
  const stockFiles:string[]=[];
  if(root)for(const file of [getWebsiteDataFile(),path.join(root,"store-domain/catalog.json")])if(await fs.stat(file).then(()=>true,error=>{if(error.code==="ENOENT")return false;throw error;}))stockFiles.push(file);
  const run=(restore:(file:string,operation:ReturnStockOperation)=>Promise<InventoryReceipt>)=>withStoredOrderUpdateLock(orderNumber,order=>withFileLock(stateFile,async()=>{
    const state=await readMembershipCommerceState(stateFile),approval=state.returnEvents?.find(item=>item.type==="RETURN_APPROVED"&&item.orderId===orderNumber&&item.returnRequestId===returnRequestId);
    if(approval?.type!=="RETURN_APPROVED")return returnInventorySummary(state,returnRequestId);
    let prefix=structuredClone(state.returnSettlementEvents??[]);
    const persist=async()=>{assertSettlementPrefix(prefix,state.returnSettlementEvents??[]);validateMembershipCommerceState(state);state.revision++;state.updatedAt=now.toISOString();await atomicWriteJson(stateFile,state);prefix=structuredClone(state.returnSettlementEvents??[]);};
    planApprovedReturnSettlement(state,approval,now.toISOString());if((state.returnSettlementEvents?.length??0)!==prefix.length)await persist();
    for(const effect of projectReturnSettlements(state).filter(item=>item.returnRequestId===returnRequestId&&item.effectType==="inventory_restore"&&["pending","failed"].includes(item.status))) {
      let receipt:InventoryReceipt;
      try {const target=await targetFor(order,effect,state,stockFiles,now);await runtime.hook?.("BEFORE_RESTORE",effect);receipt=await restore(target.file,target.operation);await runtime.hook?.("AFTER_RESTORE",effect);}
      catch(error){const manual=error instanceof ReturnStockEvidenceError||error instanceof InventoryReceiptError;appendSettlementEvent(state,{effectId:effect.effectId,recordedAt:now.toISOString(),type:manual?"MANUAL_REVIEW_REQUIRED":"FAILED",reason:manual?"original_inventory_identity_requires_review":"inventory_restore_retry_required"});await persist();continue;}
      appendSettlementEvent(state,{effectId:effect.effectId,type:"APPLIED",receipt,recordedAt:now.toISOString()});await persist();
    }
    return returnInventorySummary(state,returnRequestId);
  },{timeoutMs:15000}));
  if(!root)return run(async()=>{throw new ReturnStockEvidenceError();});
  return withOrderGate(getOrdersDir(),orderNumber,()=>withReturnInventoryLocks({scopeFile:path.join(root,"membership-commerce/.return-settlement-locks",fingerprint([orderNumber,returnRequestId])),stockFiles},run),{timeoutMs:15000});
}
