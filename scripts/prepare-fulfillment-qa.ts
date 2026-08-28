import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const target = process.env.QA_DATA_DIR;
if (!target || !path.basename(target).startsWith("kd-fulfillment-i2a-qa")) throw new Error("QA_DATA_DIR 必須是專用的 kd-fulfillment-i2a-qa* 目錄");
const dataDir=target;
await rm(dataDir,{recursive:true,force:true}); await mkdir(path.join(dataDir,"orders"),{recursive:true});
process.env.KD_DATA_DIR=dataDir; process.env.AUTH_SESSION_SECRET||="phase-i2a-qa-secret-long-enough";
const auth=await import("../lib/memberAuth");
const fulfillment=await import("../lib/fulfillment");
const email="phase-i2a-qa@example.test",password="Phase-I2A-QA-2026";
const member=await auth.registerEmailMember(email,password);
if (!member) throw new Error("無法建立隔離式 QA 會員");
const memberId=member.id;
await auth.updateMemberProfile(member.id,{pickupName:"履約介面測試會員",phone:"0912345678",favoriteStore:{id:"TEST01",name:"測試門市",address:"台北市測試路 1 號"}});
async function order(orderNumber:string,orderMode:"711_cod"|"studio_pickup") { const value={orderNumber,createdAt:"2026-08-18T02:00:00.000Z",status:orderMode==="711_cod"?"waiting_merchant_create_cod_shipment":"waiting_studio_pickup_confirmation",orderMode,customer:{name:"履約介面測試會員",phone:"0912345678",email},member:{memberId},store:orderMode==="711_cod"?{id:"TEST01",name:"測試門市",address:"台北市測試路 1 號"}:undefined,studioPickup:orderMode==="studio_pickup"?{preferredDate:"2026-08-29",preferredTime:"14:00"}:undefined,items:[{slug:"qa-coffee",name:"測試咖啡",optionLabel:"半磅咖啡豆",quantity:1,lineTotal:1000}],subtotal:1000,shipping:60,total:1060,inventoryTransaction:{state:"inventory_committed"},lineNotification:{sent:true}}; await writeFile(path.join(dataDir,"orders",`${orderNumber}.json`),`${JSON.stringify(value,null,2)}\n`); }
const seven="KD20260828-9201",pickup="KD20260828-9202"; await order(seven,"711_cod"); await order(pickup,"studio_pickup");
const defaults=await fulfillment.readLogisticsSettings(); await fulfillment.saveLogisticsSettings({expectedRevision:defaults.revision,notificationEmail:"kdcoffee.tw@gmail.com",automaticTrackingEnabled:true,pickupDeadlineDays:7,expiryPolicy:"manual_review",trackedEvents:{orderCreated:true,shipped:true,arrived:true,completed:true}});
await fulfillment.associateExternalFulfillment({orderId:seven,externalOrderId:"CMTEST009201",externalShipmentId:"ETEST9201"});
let record=(await fulfillment.readFulfillmentStore()).records[seven]; if (!record) throw new Error("找不到 7-ELEVEN QA 履約紀錄"); await fulfillment.recordAdminFulfillmentEvent({orderId:seven,state:"preparing",expectedRevision:record.revision,now:new Date("2026-08-18T03:00:00Z")});
record=(await fulfillment.readFulfillmentStore()).records[seven]; await fulfillment.recordAdminFulfillmentEvent({orderId:seven,state:"shipped",expectedRevision:record.revision,now:new Date("2026-08-19T03:00:00Z")});
record=(await fulfillment.readFulfillmentStore()).records[seven]; await fulfillment.recordAdminFulfillmentEvent({orderId:seven,state:"arrived_at_pickup_store",expectedRevision:record.revision,now:new Date("2026-08-20T03:00:00Z")});
await fulfillment.evaluatePickupDeadlines({now:new Date("2026-08-28T03:00:00Z")});
record=fulfillment.fulfillmentRecordForOrder(await fulfillment.readFulfillmentStore(),(await (await import("../lib/adminOrders")).readOrder(pickup))!); await fulfillment.recordAdminFulfillmentEvent({orderId:pickup,state:"preparing",expectedRevision:record.revision,now:new Date("2026-08-27T03:00:00Z")});
record=(await fulfillment.readFulfillmentStore()).records[pickup]; await fulfillment.recordAdminFulfillmentEvent({orderId:pickup,state:"ready_for_store_pickup",expectedRevision:record.revision,now:new Date("2026-08-28T02:00:00Z")});
console.log(JSON.stringify({dataDir,email,password,adminOrder:seven}));
