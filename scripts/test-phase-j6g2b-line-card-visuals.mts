import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import sharp from 'sharp';
import {LINE_CARD_CATALOG} from '../lib/lineNotificationCardCatalog';
import {renderLineFlex} from '../lib/lineFlexRenderer';
import {composeLineCard,LINE_CARD_FAMILY_ART} from '../lib/lineCardPresentation';
import Preview from '../components/admin/LineNotificationCardPreview';
import Studio,{filterLineCards} from '../components/admin/LineNotificationCardStudio';

let checks=0;
const fallback:Record<string,string>={};
for(const def of LINE_CARD_CATALOG){
 const result=renderLineFlex(def.eventKey,def.previewSample);assert.ok(result.ok);if(!result.ok)continue;
 const visual=composeLineCard(result.card),html=renderToStaticMarkup(createElement(Preview,{card:result.card}));
 const hero=result.flex.contents.hero as {url:string;aspectRatio:string};
 assert.equal(hero.url,visual.imageUrl);assert.equal(hero.aspectRatio,'3:1');
 assert.equal(new URL(hero.url).origin,'https://www.kdcoffee1962.com');
 assert.ok(html.includes(visual.imagePath));
 assert.ok(html.includes(visual.highlight.value));
 assert.deepEqual([...visual.details.map(row=>row.key),...visual.highlightSupporting.map(row=>row.key),...(visual.highlight.key?[visual.highlight.key]:[])].sort(),result.card.rows.map(row=>row.key).sort());
 assert.ok(!/token|fingerprint|PRIVATE-SENTINEL/.test(JSON.stringify(result.flex)));
 assert.ok(Buffer.byteLength(JSON.stringify(result.flex))<24000);
 if(def.recipient==='admin'){const review=def.eventKey==='admin.return.request_received';assert.equal(visual.highlight.label,review?'目前進度':'下一步');assert.equal(visual.highlight.value,review?result.card.status.label:result.card.cta.label);}
 fallback[def.eventKey]=result.plainTextFallback;checks++;
}
assert.equal(checks,77);
assert.equal(createHash('sha256').update(JSON.stringify(fallback)).digest('hex'),'43a94e605707dc840c9c1573fcb1d141ca74959bdab4a1c0fb4530fea45b8706');
checks++;
for(const art of Object.values(LINE_CARD_FAMILY_ART)){
 const file='public/images/line-cards/'+art.file;const metadata=await sharp(file).metadata();
 assert.equal(metadata.width,960);assert.equal(metadata.height,320);assert.equal(metadata.format,'jpeg');assert.ok(fs.statSync(file).size<100000);checks++;
}
assert.equal(new Set(Object.values(LINE_CARD_FAMILY_ART).map(art=>art.file)).size,7);
const refund=LINE_CARD_CATALOG.find(d=>d.eventKey==='customer.return.refund_completed')!;
const r=renderLineFlex(refund.eventKey,refund.previewSample);assert.ok(r.ok);if(r.ok){const v=composeLineCard(r.card);assert.equal(v.highlight.value,'NT$500');assert.equal(v.highlight.label,'退款金額');}
checks++;
const referral=LINE_CARD_CATALOG.find(d=>d.eventKey==='customer.reward.referral')!;const referralCard=renderLineFlex(referral.eventKey,referral.previewSample);assert.ok(referralCard.ok);if(referralCard.ok)assert.equal(composeLineCard(referralCard.card).highlight.value,'100 抵用金');checks++;
const order=LINE_CARD_CATALOG.find(d=>d.eventKey==='customer.order.confirmed')!;
const o=renderLineFlex(order.eventKey,order.previewSample);assert.ok(o.ok);if(o.ok)assert.equal(composeLineCard(o.card).highlight.key,'orderNumber');checks++;
const studio=renderToStaticMarkup(createElement(Studio));assert.ok(studio.includes('aria-label="卡片系列"'));assert.ok(!/<textarea|type="submit"|<form/.test(studio));
for(const [family,art]of Object.entries(LINE_CARD_FAMILY_ART)){assert.ok(studio.includes(art.file));assert.ok(filterLineCards(family==='ADMIN'?'admin':'customer',family,'').length);}
assert.ok(filterLineCards('customer','RETURN','退款').length);assert.equal(filterLineCards('admin','ADMIN','不存在的事件').length,0);checks++;
console.log('J6G2B '+checks+' visual checks PASS; 77 events, seven assets, fallback byte-identical; no sends.');
