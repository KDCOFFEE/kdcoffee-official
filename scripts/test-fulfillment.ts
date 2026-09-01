import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const testRoot = await mkdtemp(path.join(os.tmpdir(), "kd-fulfillment-i2a-"));
process.env.KD_DATA_DIR = testRoot;
process.env.AUTH_SESSION_SECRET = "isolated-fulfillment-test-secret-2026";

const fulfillment = await import("../lib/fulfillment");
const parser = await import("../lib/sevenElevenEmailParser");
const commerce = await import("../lib/membershipCommerce");
const rules = await import("../lib/membershipBusinessRules");
const identity = await import("../lib/memberIdentity");
const storage = await import("../lib/storagePaths");
const jsonStore = await import("../lib/jsonFileStore");
const adminOrders = await import("../lib/adminOrders");

let count = 0;
function check(letter: string, name: string, condition: unknown) {
  assert.ok(condition, `${letter}. ${name}`);
  count += 1;
  console.log(`PASS ${letter.padEnd(2)} ${name}`);
}

const orderDir = storage.getOrdersDir();
await mkdir(orderDir, { recursive: true });
async function createOrder(orderNumber: string, orderMode: "711_cod"|"studio_pickup", memberId?: string) {
  const order = { orderNumber, createdAt:"2026-08-01T01:00:00.000Z", status:orderMode==="711_cod"?"waiting_merchant_create_cod_shipment":"waiting_studio_pickup_confirmation", orderMode, customer:{name:"測試會員"}, member:memberId?{memberId}:null, store:orderMode==="711_cod"?{id:"TEST01",name:"測試門市",address:"測試地址"}:undefined, studioPickup:orderMode==="studio_pickup"?{preferredDate:"2026-08-03",preferredTime:"14:00"}:undefined, items:[{name:"測試咖啡",quantity:1}], subtotal:1000, shipping:60, total:1060, inventoryTransaction:{state:"inventory_committed"} };
  await writeFile(path.join(orderDir,`${orderNumber}.json`),`${JSON.stringify(order,null,2)}\n`,"utf8");
  return order;
}
async function member(email: string) { return (await identity.provisionCanonicalMember({provider:"email",subject:email,persistMember:async()=>undefined})).member.memberId; }
function item() { return { itemId:"coffee-test-half",packageWeight:"half-pound" as const,quantity:1,roast:"淺中焙",unitPrice:1000,components:[{productId:"coffee-test",weightHalfPounds:1 as const}] }; }
function mail(type: "created"|"shipped"|"arrived"|"completed", cm: string, messageId: string) {
  const subjects = { created:"賣貨便：訂單成立通知",shipped:"賣貨便：賣家完成寄貨訂單通知",arrived:`賣貨便：您的訂單(${cm})已送達`,completed:"賣貨便：買家完成取貨訂單通知" };
  const texts = { created:`賣貨便訂單編號 ${cm} 訂單已成立`,shipped:`賣貨便訂單編號 ${cm} 賣家已完成寄貨，交貨便單號 ETEST0001`,arrived:`訂單 ${cm} 已送達測試門市，等待取貨`,completed:`買家已完成取貨，賣貨便訂單編號 ${cm}` };
  return { from:"7-ELEVEN 賣貨便 <no-reply@sp88.com>",subject:subjects[type],text:texts[type],messageId,receivedAt:"2026-08-05T01:00:00.000Z" };
}

try {
  const initialRules = await rules.readMembershipRulesStore();
  const configured = structuredClone(initialRules.versions[0].rules);
  configured.money.roundingMode = "round-half-up";
  configured.referral.referrerEligibility = { mode:"none" };
  configured.referral.reward = { mode:"fixed",amount:100,repeatedRewards:true };
  configured.subscription.pauseResumeAnchorPolicy = "keep-original";
  await rules.saveMembershipBusinessRules({expectedRevision:0,rules:configured,now:new Date("2026-08-01T00:00:00Z")});
  const defaultSettings = await fulfillment.readLogisticsSettings();
  await fulfillment.saveLogisticsSettings({ expectedRevision:defaultSettings.revision,notificationEmail:"logistics@example.test",automaticTrackingEnabled:true,pickupDeadlineDays:7,expiryPolicy:"manual_review",trackedEvents:{orderCreated:true,shipped:true,arrived:true,completed:true},now:new Date("2026-08-01T00:00:00Z") });

  const cm = "CMTEST000001";
  check("A","訂單成立通知可被辨識",parser.parseSevenElevenEmail(mail("created",cm,"msg-a")).eventType==="order_created");
  check("B","賣家完成寄貨通知可被辨識",parser.parseSevenElevenEmail(mail("shipped",cm,"msg-b")).eventType==="shipped");
  check("C","到店通知可被辨識",parser.parseSevenElevenEmail(mail("arrived",cm,"msg-c")).eventType==="arrived_at_pickup_store");
  check("D","完成取貨通知可被辨識",parser.parseSevenElevenEmail(mail("completed",cm,"msg-d")).eventType==="completed");
  check("E","錯誤寄件者不受信任",!parser.parseSevenElevenEmail({...mail("completed",cm,"msg-e"),from:"someone@example.test"}).recognized);
  check("F","缺少有效外部訂單編號時拒絕",!parser.parseSevenElevenEmail({...mail("completed",cm,"msg-f"),text:"買家已完成取貨",subject:"賣貨便：買家完成取貨訂單通知"}).recognized);

  const unknown = await fulfillment.processSevenElevenEmail(mail("completed","CMUNKNOWN001","msg-g"));
  check("G","未知外部訂單送人工確認",unknown.review===true&&!unknown.mutated);

  const referrer = await member("referrer@example.test");
  const referred = await member("referred@example.test");
  const referrerSubscription=await commerce.createSubscription({memberId:referrer,startedFromOrderId:"referrer-first",anchorDate:"2026-09-01",intervalDays:30,shippingMethod:"studio_pickup",defaultItems:[item()],idempotencyKey:"referrer-sub"});
  await commerce.activateSubscriptionFromPickup({subscriptionId:referrerSubscription.subscriptionId,orderId:"referrer-first",idempotencyKey:"referrer-activate"});
  await commerce.assignReferralRelationship({referrerMemberId:referrer,referredMemberId:referred,idempotencyKey:"relation-i2a"});
  const firstOrder="KD20260828-1001";
  await createOrder(firstOrder,"711_cod",referred);
  const subscription=await commerce.createSubscription({memberId:referred,startedFromOrderId:firstOrder,anchorDate:"2026-09-01",intervalDays:30,shippingMethod:"711_cod",defaultItems:[item()],idempotencyKey:"sub-i2a"});
  await fulfillment.associateExternalFulfillment({orderId:firstOrder,externalOrderId:cm,externalShipmentId:"ETEST0001"});
  const completions=await Promise.all(Array.from({length:10},()=>fulfillment.processSevenElevenEmail(mail("completed",cm,"msg-complete-repeat"))));
  let state=await fulfillment.readFulfillmentStore();
  let commerceState=await commerce.readMembershipCommerceState();
  const record=state.records[firstOrder];
  check("H","相同 Email 重送只建立一筆事件",record.events.filter((event)=>event.state==="completed").length===1);
  check("I","完成後收到到店通知不會倒退",(await fulfillment.processSevenElevenEmail(mail("arrived",cm,"msg-arrived-late"))).mutated===false&&(await fulfillment.readFulfillmentStore()).records[firstOrder].currentState==="completed");
  check("J","完成取貨重送只執行一次結果",completions.length===10&&await commerce.getGiftProgress(subscription.subscriptionId)===1);
  check("T","成功取貨啟動等待中的定期購",commerceState.subscriptions[subscription.subscriptionId].status==="active");
  check("U","完成取貨進入贈品與延遲推薦獎勵邏輯",Object.values(commerceState.referralRewards).filter((entry)=>entry.sourceOrderNumber===firstOrder&&entry.status==="scheduled").length===1&&Object.values(commerceState.creditEntries).filter((entry)=>entry.sourceType==="referral").length===0);
  check("U1","可信完成取貨只建立一筆有效消費事件",Object.values(commerceState.validConsumptionEvents).filter((entry)=>entry.sourceOrderId===firstOrder).length===1);

  const pickupOrder="KD20260828-1002";
  await createOrder(pickupOrder,"studio_pickup");
  await fulfillment.recordAdminFulfillmentEvent({orderId:pickupOrder,state:"preparing",expectedRevision:0,now:new Date("2026-08-02T01:00:00Z")});
  let pickupRecord=fulfillment.fulfillmentRecordForOrder(await fulfillment.readFulfillmentStore(),(await adminOrders.readOrder(pickupOrder))!);
  await fulfillment.recordAdminFulfillmentEvent({orderId:pickupOrder,state:"ready_for_store_pickup",expectedRevision:pickupRecord.revision,now:new Date("2026-08-02T02:00:00Z")});
  pickupRecord=(await fulfillment.readFulfillmentStore()).records[pickupOrder];
  await fulfillment.recordAdminFulfillmentEvent({orderId:pickupOrder,state:"completed",expectedRevision:pickupRecord.revision,confirmed:true,note:"現場確認",now:new Date("2026-08-03T02:00:00Z")});
  pickupRecord=(await fulfillment.readFulfillmentStore()).records[pickupOrder];
  check("K","Admin 工作室自取流程完成",pickupRecord.currentState==="completed");

  const concurrentOrder="KD20260828-1003", concurrentCm="CMTEST000003";
  await createOrder(concurrentOrder,"711_cod");
  await fulfillment.associateExternalFulfillment({orderId:concurrentOrder,externalOrderId:concurrentCm});
  const concurrentRecord=(await fulfillment.readFulfillmentStore()).records[concurrentOrder];
  const concurrentResults=await Promise.allSettled([fulfillment.recordAdminFulfillmentEvent({orderId:concurrentOrder,state:"completed",expectedRevision:concurrentRecord.revision,confirmed:true}),fulfillment.processSevenElevenEmail(mail("completed",concurrentCm,"msg-concurrent"))]);
  check("L","Admin 與 Email 同時完成仍只有一筆完成事件",concurrentResults.some((result)=>result.status==="fulfilled")&&(await fulfillment.readFulfillmentStore()).records[concurrentOrder].events.filter((event)=>event.state==="completed").length===1);

  const deadlineOrder="KD20260828-1004", deadlineCm="CMTEST000004", deadlineMember=await member("deadline@example.test");
  await createOrder(deadlineOrder,"711_cod",deadlineMember);
  const deadlineSub=await commerce.createSubscription({memberId:deadlineMember,startedFromOrderId:deadlineOrder,anchorDate:"2026-09-01",intervalDays:30,shippingMethod:"711_cod",defaultItems:[item()],idempotencyKey:"deadline-sub"});
  await fulfillment.associateExternalFulfillment({orderId:deadlineOrder,externalOrderId:deadlineCm});
  const beforeArrival=(await fulfillment.readFulfillmentStore()).records[deadlineOrder];
  await fulfillment.recordAdminFulfillmentEvent({orderId:deadlineOrder,state:"arrived_at_pickup_store",expectedRevision:beforeArrival.revision,now:new Date("2026-08-05T00:00:00Z")});
  let deadlineRecord=(await fulfillment.readFulfillmentStore()).records[deadlineOrder];
  check("M","到店後依七天設定計算期限",deadlineRecord.pickupDeadline==="2026-08-12T00:00:00.000Z");
  await fulfillment.evaluatePickupDeadlines({now:new Date("2026-08-13T00:00:00Z")});
  deadlineRecord=(await fulfillment.readFulfillmentStore()).records[deadlineOrder];
  check("N","期限經過後標記疑似未取",deadlineRecord.currentState==="suspected_uncollected");
  check("O","預設疑似未取不自動處罰會員",(await commerce.readMembershipCommerceState()).subscriptions[deadlineSub.subscriptionId].status==="pending_activation");
  const uncollected=await fulfillment.recordAdminFulfillmentEvent({orderId:deadlineOrder,state:"uncollected",expectedRevision:deadlineRecord.revision,confirmed:true,note:"後台確認未取貨",now:new Date("2026-08-13T01:00:00Z")});
  deadlineRecord=(await fulfillment.readFulfillmentStore()).records[deadlineOrder];
  commerceState=await commerce.readMembershipCommerceState();
  check("P","Admin 可確認未取貨",uncollected.record.currentState==="uncollected");
  check("Q","ORDER_UNCOLLECTED 只發出一次",deadlineRecord.events.filter((event)=>event.state==="uncollected").length===1);
  check("R","會員未取貨政策只執行一次",commerceState.subscriptions[deadlineSub.subscriptionId].status==="terminated"&&commerceState.events.filter((event)=>event.type==="gift_progress_reset"&&event.orderId===deadlineOrder).length===1);
  check("S","未取貨不發推薦獎勵",!Object.values(commerceState.creditEntries).some((entry)=>entry.sourceReference.includes(deadlineOrder)));
  check("V","人工修正保留操作者與理由",deadlineRecord.events.at(-1)?.actor==="後台管理員"&&deadlineRecord.events.at(-1)?.note==="後台確認未取貨");
  const stale=await Promise.allSettled([fulfillment.recordAdminFulfillmentEvent({orderId:deadlineOrder,state:"completed",expectedRevision:0,confirmed:true})]);
  check("W","舊版次更新遭拒",stale[0].status==="rejected");

  const uniqueOrder="KD20260828-1005"; await createOrder(uniqueOrder,"711_cod");
  const duplicateLink=await Promise.allSettled([fulfillment.associateExternalFulfillment({orderId:uniqueOrder,externalOrderId:cm})]);
  check("X","外部訂單編號保持唯一",duplicateLink[0].status==="rejected");

  const ambiguousA="KD20260828-1006", ambiguousB="KD20260828-1007", ambiguousCm="CMAMBIG00001";
  await createOrder(ambiguousA,"711_cod"); await createOrder(ambiguousB,"711_cod");
  state=await fulfillment.readFulfillmentStore();
  const timestamp="2026-08-01T00:00:00.000Z";
  state.records[ambiguousA]={orderId:ambiguousA,currentState:"order_created",revision:0,externalOrderId:ambiguousCm,events:[],createdAt:timestamp,updatedAt:timestamp};
  state.records[ambiguousB]={orderId:ambiguousB,currentState:"order_created",revision:0,externalOrderId:ambiguousCm,events:[],createdAt:timestamp,updatedAt:timestamp};
  await jsonStore.atomicWriteJson(storage.getFulfillmentStateFile(),state);
  const ambiguous=await fulfillment.processSevenElevenEmail(mail("completed",ambiguousCm,"msg-ambiguous"));
  check("Y","歷史資料出現模糊對應時送人工確認",ambiguous.review===true&&!ambiguous.mutated);

  const renewalOrder="KD20260828-1008"; await createOrder(renewalOrder,"studio_pickup",referred);
  const active=commerceState.subscriptions[subscription.subscriptionId];
  const cycle=await commerce.generateSubscriptionCycle({subscriptionId:active.subscriptionId,sequence:1,plannedDate:"2026-10-01",idempotencyKey:"price-cycle"});
  const locked=await commerce.lockSubscriptionCycle({cycleId:cycle.cycleId,shipping:60,idempotencyKey:"price-lock"});
  await commerce.createOrderFromCycle({cycleId:cycle.cycleId,orderId:renewalOrder,idempotencyKey:"price-order"});
  const priceBefore=JSON.stringify(locked.pricingSnapshot);
  await fulfillment.recordAdminFulfillmentEvent({orderId:renewalOrder,state:"completed",expectedRevision:0,confirmed:true});
  const priceAfter=JSON.stringify((await commerce.readMembershipCommerceState()).cycles[cycle.cycleId].pricingSnapshot);
  check("Z","履約事件不重算已鎖定商務價格",priceAfter===priceBefore);

  const finalStore=await fulfillment.readFulfillmentStore();
  check("AA","事件紀錄不含顧客聯絡資料",!JSON.stringify(finalStore).match(/referrer@example|referred@example|測試地址/));
  check("AB","Gmail 保持未連線且無憑證欄位",(await fulfillment.readLogisticsSettings()).gmailConnection.status==="not_connected"&&!JSON.stringify(await fulfillment.readLogisticsSettings()).match(/accessToken|refreshToken|password/i));
  console.log(`\nPhase I.2A fulfillment foundation: ${count} assertions PASS`);
} finally {
  await rm(testRoot,{recursive:true,force:true});
}
