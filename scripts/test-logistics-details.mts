import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseSevenElevenEmailSummary, extractSevenElevenShipmentId } from "../lib/sevenElevenEmailSummary";
import { parseSevenElevenEmail } from "../lib/sevenElevenEmailParser";
import { trackLogisticsEmail } from "../lib/logisticsTracking";
import { logisticsNotificationText } from "../lib/logisticsNotificationText";
import type { LogisticsSettings, FulfillmentStore } from "../lib/fulfillmentTypes";

const html = `<table>
<tr><td>賣場名稱：</td><td>測試代客下單區</td></tr>
<tr><td>收件者資訊：</td><td>&nbsp;測*客<br>測試門市 (測試地址) 0912***345</td></tr>
<tr><td>付款方式：</td><td>取貨付款</td></tr>
<tr><td>商品名稱</td><td>單價</td><td>數量</td><td>小計</td></tr>
<tr><td>客戶專屬賣場</td><td>$2,500</td><td>1</td><td>$2,500</td></tr>
<tr><td>測試商品</td><td>$100</td><td>2</td><td>$200</td></tr>
<tr><td colspan="3">運費：</td><td>NT$0&nbsp;</td></tr>
<tr><td colspan="3">訂單總額：</td><td>NT$2,700&nbsp;</td></tr>
<tr><td colspan="4">買家回饋資訊：<br><ol></ol><br>訂單備註：<br><br></td></tr>
</table><a href="https://eservice.7-11.com.tw/E-Tracking/search.aspx">物流查詢</a>`;
const summary = parseSevenElevenEmailSummary(html);
assert.deepEqual(summary, { recipient:"測*客",store:"測試門市 (測試地址)",market:"測試代客下單區",payment:"取貨付款",total:2700,shipping:0,items:[{name:"客戶專屬賣場",quantity:1},{name:"測試商品",quantity:2}] });
assert.equal(extractSevenElevenShipmentId(html), undefined);
assert.equal(extractSevenElevenShipmentId("物流單號：ESERVICE"), undefined);
assert.equal(extractSevenElevenShipmentId('<a href="https://example.test/ETEST0001">物流單號：</a>'), undefined);
assert.equal(extractSevenElevenShipmentId("交貨便代碼：ETEST0001"), "ETEST0001");
assert.equal(parseSevenElevenEmailSummary("取貨期限：2026/10/12\n訂單備註：請先電話聯絡\n\n頁尾").note,"請先電話聯絡");
assert.equal(parseSevenElevenEmailSummary("<script>收件人：錯誤</script>").recipient,undefined);
const root = await mkdtemp(path.join(os.tmpdir(),"kd-logistics-details-"));
const filePath = path.join(root,"state.json");
const now = new Date("2026-10-06T02:00:00Z");
const settings = {internalLineEvents:{orderCreated:true,shipped:true,arrived:true,completed:true}} as LogisticsSettings;
const mail = (subject:string,text:string) => parseSevenElevenEmail({from:"no-reply@sp88.com",subject,text,messageId:subject,receivedAt:now.toISOString()});
const created = mail("賣貨便：訂單成立通知","訂單 CMTEST00001 已成立");
const sent:string[]=[];
const options = {filePath,settings,now,sender:async (text:string)=>{sent.push(text);return {sent:true};}};
try {
  await trackLogisticsEmail(created,options);
  const legacy = JSON.parse(await readFile(filePath,"utf8")) as FulfillmentStore;
  legacy.logisticsTracking!.CMTEST00001.externalShipmentId="ESERVICE";
  await writeFile(filePath,JSON.stringify(legacy));
  await trackLogisticsEmail({...created,summary},options);
  assert.equal(sent.length,1,"enrichment never resends an already sent event");
  const enriched = JSON.parse(await readFile(filePath,"utf8")) as FulfillmentStore;
  const record = enriched.logisticsTracking!.CMTEST00001;
  assert.deepEqual(record.summary,summary);
  assert.equal(record.externalShipmentId,undefined,"legacy URL-derived ID removed");
  assert.deepEqual(enriched.records,{});
  await trackLogisticsEmail({...mail("賣貨便：賣家完成寄貨訂單通知","訂單 CMTEST00001 已交寄"),externalShipmentId:"ETEST0001"},options);
  assert.match(sent[1],/客戶專屬賣場 × 1/);
  assert.match(sent[1],/訂單總額：NT\$2,700/);
  assert.match(sent[1],/交貨便單號：ETEST0001/);
  assert.doesNotMatch(sent[1],/0912|ESERVICE|取貨期限/);
  const arrival = logisticsNotificationText({...record,summary:{...summary,pickupDeadline:"2026/10/12"}},"arrived_at_pickup_store",now.toISOString(),"KDTEST001");
  assert.match(arrival,/取貨期限（郵件）：2026\/10\/12/);
  assert.match(arrival,/admin\/orders\/KDTEST001/);
  const retries:string[]=[];
  const retryOptions = {...options,sender:async(text:string)=>{retries.push(text);return {sent:retries.length>1};}};
  const retryMail={...created,externalOrderId:"CMRETRY00002",summary};
  await trackLogisticsEmail(retryMail,retryOptions);
  await trackLogisticsEmail({...retryMail,summary:{...summary,note:"補充資訊"}},retryOptions);
  assert.equal(retries.length,2);
  assert.equal(retries[0],retries[1],"retry payload stays immutable with its persisted retry key");
  console.log("PASS logistics details: HTML fields, phone omission, explicit IDs, deadlines, enrichment deduplication, next-state summary, immutable retries");
} finally {await rm(root,{recursive:true,force:true});}
