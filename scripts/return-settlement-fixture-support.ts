/** Isolated legacy evidence fixture only; never imported by application code. */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {inventoryHash,inventoryOperationKey,makeInventoryReceipt,addInventoryReceipt,type InventoryReceipts} from "../lib/inventoryReceipts";
export const legacyReturnJournalDirectory=(orderDir:string,transactionId:string)=>path.join(orderDir,".transactions",inventoryOperationKey(transactionId));
export async function legacyReturnStockFixture(root:string,orderNumber:string,mode:"coffee"|"store"|"mixed") {
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));
  const coffeeFile=path.join(root,"store/website-data.json"),catalogPath=path.join(root,"store-domain/catalog.json"),orderDir=path.join(root,"orders");
  const coffee=JSON.parse(await fs.readFile(coffeeFile,"utf8")),store={inventoryReceipts:{} as InventoryReceipts,schemaVersion:1,revision:1,updatedAt:new Date().toISOString(),sections:[],categories:[],products:[{id:"store-product",slug:"store-original",name:"Store",sku:"STORE",inventory:30,price:300,pvValue:20,published:true}]};
  const transactionId="isolated-original-"+orderNumber;
  const items=[...(mode!=="store"?[{domain:"coffee",productId:"coffee-product",variantId:"coffee-sku",slug:"coffee-original",optionId:"coffee-sku",name:"Coffee",quantity:10,unitPrice:500,lineTotal:5000,basePV:20,effectivePV:20}]:[]),...(mode!=="coffee"?[{domain:"store",productId:"store-product",variantId:"default",slug:"store-original",name:"Store",quantity:10,unitPrice:300,lineTotal:3000,pvValue:20}]:[])];
  const participants=items.map(item=>({domain:item.domain,registryRank:item.domain==="coffee"?0:10,demands:[{identity:item.domain==="coffee"?"coffee-sku":"store-product",quantity:10}]}));
  const order={orderNumber,createdAt:new Date().toISOString(),orderMode:"studio_pickup",status:"waiting_studio_pickup_confirmation",customer:{name:"Isolated Fixture"},items,
    subtotal:items.reduce((sum,item)=>sum+item.lineTotal,0),shipping:0,total:items.reduce((sum,item)=>sum+item.lineTotal,0),credit:{appliedAmount:0}};
  const intent={schemaVersion:1,transactionId,requestHash:inventoryHash([orderNumber]),orderNumber,participants,order,finalStatus:order.status};
  const receipts=participants.map(participant=>{const isCoffee=participant.domain==="coffee",beforeStock=isCoffee?20:30;return makeInventoryReceipt({operationId:"apply:"+inventoryOperationKey(transactionId+":"+participant.domain),transactionId,domain:participant.domain,kind:"APPLY",recordedAt:new Date().toISOString(),items:[{identity:participant.demands[0].identity,quantity:10,beforeStock,afterStock:beforeStock-10}]});});
  for(const receipt of receipts){if(receipt.domain==="coffee"){coffee.menu.products[0].skus[0].stock=10;addInventoryReceipt(coffee,receipt);}else{store.products[0].inventory=20;addInventoryReceipt(store,receipt);}}
  const stored={...order,inventoryTransaction:{protocolVersion:1,state:"inventory_committed",transactionId,intentHash:inventoryHash(intent),participantReceipts:receipts.map(receipt=>({domain:receipt.domain,operationId:receipt.operationId,receiptHash:inventoryHash(receipt)}))}};
  await fs.mkdir(path.dirname(catalogPath),{recursive:true});await fs.mkdir(orderDir,{recursive:true});await fs.writeFile(coffeeFile,JSON.stringify(coffee));await fs.writeFile(catalogPath,JSON.stringify(store));await fs.writeFile(path.join(orderDir,orderNumber+".json"),JSON.stringify(stored));
  const directory=legacyReturnJournalDirectory(orderDir,transactionId);await fs.mkdir(directory,{recursive:true});
  let previousHash:string|null=null;
  const events=[{type:"PREPARED",intent},...receipts.map(receipt=>({type:"APPLIED",domain:receipt.domain,receiptHash:inventoryHash(receipt)})),{type:"FINALIZED"}];
  for(const [sequence,event]of events.entries()){const payload:{schemaVersion:number;sequence:number;previousHash:string|null;event:unknown}={schemaVersion:1,sequence,previousHash,event};const envelope={...payload,hash:inventoryHash(payload)};await fs.writeFile(path.join(directory,String(sequence).padStart(8,"0")+".json"),JSON.stringify(envelope));previousHash=envelope.hash;}
  return {state:"FINALIZED",order:stored,orderNumber,repository:{catalogPath,read:async()=>JSON.parse(await fs.readFile(catalogPath,"utf8")) as typeof store}};
}
