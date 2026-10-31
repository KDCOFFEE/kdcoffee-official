import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {LINE_CARD_CATALOG} from '../lib/lineNotificationCardCatalog';
import {renderLineFlex} from '../lib/lineFlexRenderer';
import {composeLineCard,LINE_CARD_HEADER_ASSETS,LINE_CARD_EVENT_ART} from '../lib/lineCardPresentation';
import Preview from '../components/admin/LineNotificationCardPreview';
const previousArtHashes:Record<string,string>={"order.jpg":"f924ed735032655e9350db60bd8d4503e8f31935d5ebc2dd22f81fe49d4473ce","fulfillment.jpg":"0e341e8518558c32318196a844943cbd2892715cff38bef26e9948a38e3575c5","reminder.jpg":"57a5773959f020816be5407394eaf88c23b69759bc6138a2ffb1db06d540a574","reward.jpg":"01ddf0b793951221a7eff4843a839fe6b1285b12d3a7b2f327bd0840d4ecff3c","return.jpg":"27c9e1ff82d8aa04151148396ee6b1bd9078eb21f22d1e54fa202ba1ef25e557","conversation.jpg":"e139d34504d4fd09268532ee517253e68c58531474fddb498a55dcc9455d777d","admin.jpg":"4333d8d4755a6f934c9cd756e49d8addb48d2bd6988971c65738251e48b7ca22"};
let checks=0;
const check=(name:string,run:()=>void)=>{run();checks++;console.log('PASS '+name);};
const resolve=(key:string,labels?:{credit:string;points:string})=>{const def=LINE_CARD_CATALOG.find(d=>d.eventKey===key)!;assert.ok(def);const r=renderLineFlex(key,def.previewSample,labels);assert.ok(r.ok);if(!r.ok)throw Error(key);return r;};
const expected={
 'customer.order.confirmed':'ORDER',
 'customer.order.shipped':'FULFILLMENT',
 'customer.reward.credit_expiring':'REMINDER',
 'customer.reward.referral':'REWARD',
 'customer.return.refund_completed':'RETURN',
 'customer.inquiry.admin_reply':'CONVERSATION',
 'admin.return.request_received':'ADMIN',
} as const;
for(const def of LINE_CARD_CATALOG){check(def.eventKey+' family-safe image and complete semantic rows',()=>{const r=resolve(def.eventKey),v=composeLineCard(r.card);const hero=r.flex.contents.hero as {url:string};assert.equal(hero.url,v.imageUrl);assert.ok(v.imagePath.startsWith('/images/line-cards/'));assert.ok(v.imagePath.endsWith('.jpg'));assert.ok(v.art.meaning&&v.art.cues.length>=3);const represented=[...v.details,...v.highlightSupporting,...(v.highlight.key?r.card.rows.filter(row=>row.key===v.highlight.key):[])];assert.deepEqual(represented.map(row=>row.key).sort(),r.card.rows.map(row=>row.key).sort());assert.ok(!renderToStaticMarkup(createElement(Preview,{card:r.card})).includes(v.family.edition));});}
for(const [key,family]of Object.entries(expected))check(key+' semantic artwork mapping',()=>assert.equal(composeLineCard(resolve(key).card).art.file,LINE_CARD_HEADER_ASSETS[family].file));
check('all seven replaced photos are distinct from previous approved local assets',()=>{const hashes=[];for(const art of Object.values(LINE_CARD_HEADER_ASSETS)){const current=createHash('sha256').update(fs.readFileSync('public/images/line-cards/'+art.file)).digest('hex');const before=previousArtHashes[art.file];assert.notEqual(current,before);hashes.push(current);}assert.equal(new Set(hashes).size,7);});
check('expiry highlights the authoritative credit amount and date together',()=>{const v=composeLineCard(resolve('customer.reward.credit_expiring',{credit:'枚',points:'KD點'}).card);assert.equal(v.highlight.value,'100 枚');assert.equal(v.highlightSupporting.length,1);assert.equal(v.highlightSupporting[0].key,'expiresOn');assert.equal(v.details.length,0);assert.ok(!v.highlight.value.includes('NT$'));});
check('refund highlights amount then method/date/order without mutating source row order',()=>{const r=resolve('customer.return.refund_completed'),before=JSON.stringify(r.card.rows),v=composeLineCard(r.card);assert.equal(v.highlight.value,'NT$500');assert.deepEqual(v.details.map(row=>row.key),['refundMethod','completedAt','orderNumber']);assert.equal(JSON.stringify(r.card.rows),before);});
check('new return highlights pending review; reason stays absent',()=>{const r=resolve('admin.return.request_received'),v=composeLineCard(r.card);assert.equal(v.highlight.value,'待處理');assert.equal(v.showStatus,false);assert.equal(r.card.cta.label,'處理退貨');assert.ok(!r.card.rows.some(row=>/reason|bank|proof/i.test(row.key)));});
check('empty optional refund details do not create empty presentation rows',()=>{const r=renderLineFlex('customer.return.refund_completed',{orderNumber:'KD20261031-1234',refundAmount:500});assert.ok(r.ok);if(r.ok){const v=composeLineCard(r.card);assert.deepEqual(v.details.map(row=>row.key),['orderNumber']);assert.equal(v.highlightSupporting.length,0);}});
check('future variants remain static registry entries, never runtime URLs',()=>{for(const [event,asset]of Object.entries(LINE_CARD_EVENT_ART)){assert.ok(LINE_CARD_CATALOG.some(d=>d.eventKey===event));assert.ok(Object.hasOwn(LINE_CARD_HEADER_ASSETS,asset));}assert.equal(renderLineFlex('customer.order.confirmed',{orderNumber:'KD20261031-1234',imageUrl:'https://evil.test/private.jpg'}).ok,false);});
console.log('J6G2C '+checks+' semantic image and presentation checks PASS; no sends.');
