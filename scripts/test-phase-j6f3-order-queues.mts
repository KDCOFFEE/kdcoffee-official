import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {projectAdminOrderQueue,projectAdminInquiryQueue,isActionableOrder} from '../lib/adminOrderOperations';
import {assessOrderInquiryState,listPendingOrderInquiries,markOrderInquiryResolved,appendOrderMessage,createOrderInquiryLineAlertText,markOrderInquiryAlertClaimed} from '../lib/orderConversation';
import {AdminQueueView,selectAdminQueue} from '../components/admin/AdminOrderQueues';
import type {StoredOrder} from '../lib/adminOrders';
let count=0;function check(name:string,run:()=>void){run();console.log('PASS '+(++count)+' '+name);}
const msg=(id:string,createdAt:string,authorType:'customer'|'admin'='customer')=>({id,actionId:id,createdAt,authorType,channel:'order_page',message:'詢問 '+id});
const base={orderMode:'home_delivery',customer:{name:'QA 會員'},total:500,privateBank:'never-serialize',orderMessages:[]};
const orders:StoredOrder[]=[
 {...base,orderNumber:'KD20261031-9401',status:'new_order',createdAt:'2026-10-30T10:00:00Z',orderMessages:[msg('one','2026-10-31T02:00:00Z')]},
 {...base,orderNumber:'KD20261031-9402',status:'shipped',createdAt:'2026-10-29T10:00:00Z',orderMessages:[msg('old','2026-10-30T01:00:00Z'),msg('latest','2026-10-31T03:00:00Z')]},
 {...base,orderNumber:'KD20261031-9403',status:'completed',createdAt:'2026-10-31T10:00:00Z',orderMessages:[msg('resolved','2026-10-31T01:00:00Z'),msg('reply','2026-10-31T04:00:00Z','admin')]},
 {...base,orderNumber:'KD20261031-9404',status:'cancelled',createdAt:'2026-10-30T11:00:00Z'},
];const before=JSON.stringify(orders),rows=projectAdminOrderQueue(orders),inquiries=projectAdminInquiryQueue(orders);
const render=(kind:'orders'|'inquiries',filter='actionable',search='')=>renderToStaticMarkup(createElement(AdminQueueView,{rows:kind==='orders'?rows:inquiries,kind,filter,search,onFilter:()=>{},onSearch:()=>{}}));
check('order actionable definition equals homepage unfinished semantics',()=>assert.deepEqual(rows.filter(r=>r.actionable).map(r=>r.orderNumber),orders.filter(o=>!['completed','cancelled'].includes(o.status)).map(o=>o.orderNumber)));
check('terminal completed and cancelled excluded',()=>{assert.equal(isActionableOrder({status:'completed'}),false);assert.equal(isActionableOrder({status:'cancelled'}),false);});
check('existing unknown/nonterminal status remains actionable without new state',()=>assert.equal(isActionableOrder({status:'legacy'}),true));
check('default component initializes actionable filter',()=>assert.ok(readFileSync('components/admin/AdminOrderQueues.tsx','utf8').includes("useState('actionable')")));
check('order default hides terminal records',()=>{const h=render('orders');assert.ok(h.includes('9401')&&h.includes('9402'));assert.ok(!h.includes('9403')&&!h.includes('9404'));});
check('order summary contains 2 actionable, 1 completed, 1 cancelled',()=>{const h=render('orders');for(const s of ['待處理訂單（2）','已完成（1）','已取消（1）'])assert.ok(h.includes(s));});
check('actionable oldest order first',()=>assert.deepEqual(selectAdminQueue(rows,'orders','actionable','').map(r=>r.orderNumber),[orders[1].orderNumber,orders[0].orderNumber]));
check('all view actionable precedes newest history',()=>assert.deepEqual(selectAdminQueue(rows,'orders','all','').map(r=>r.orderNumber),[orders[1].orderNumber,orders[0].orderNumber,orders[2].orderNumber,orders[3].orderNumber]));
check('all view separates groups in operational order',()=>{const h=render('orders','all');assert.ok(h.indexOf('<h2>待處理')<h.indexOf('<h2>已完成／歷史'));});
check('order action uses primary existing detail link',()=>assert.match(render('orders'),/class="primary" href="\/admin\/orders\/KD20261031-9402">處理訂單/));
check('terminal CTA is secondary history',()=>assert.match(render('orders','completed'),/class="secondary" href="\/admin\/orders\/KD20261031-9403">查看紀錄/));
check('pending inquiry badge only appears on orders needing reply',()=>{assert.ok(render('orders').includes('有待回覆詢問'));assert.ok(!render('orders','completed').includes('有待回覆詢問'));});
check('order number and member search stay within selected filter',()=>{assert.equal(selectAdminQueue(rows,'orders','actionable','9403').length,0);assert.equal(selectAdminQueue(rows,'orders','all','QA 會員').length,4);});
check('inquiry projection includes customer conversations only',()=>assert.equal(inquiries.length,3));
check('inquiry pending equals authoritative assessment for every row',()=>{for(const row of inquiries)assert.equal(row.actionable,assessOrderInquiryState(orders.find(o=>o.orderNumber===row.orderNumber)!).pending);});
check('inquiry count matches homepage pending helper',()=>assert.equal(inquiries.filter(r=>r.actionable).length,listPendingOrderInquiries(orders).length));
check('inquiry unresolved counts 1 and 2',()=>assert.deepEqual(inquiries.filter(r=>r.actionable).map(r=>r.unresolved),[1,2]));
check('oldest unanswered message wins even when newest message is later',()=>{assert.equal(inquiries[1].waitingSince,'2026-10-30T01:00:00Z');assert.equal(selectAdminQueue(inquiries,'inquiries','actionable','')[0].orderNumber,orders[1].orderNumber);});
check('inquiry default excludes resolved history',()=>{const h=render('inquiries');assert.ok(h.includes('9401')&&h.includes('9402'));assert.ok(!h.includes('9403'));});
check('inquiry summary distinguishes orders from unresolved message count',()=>{const h=render('inquiries');assert.ok(h.includes('待處理詢問（2）'));assert.ok(h.includes('已處理（1）'));assert.ok(h.includes('尚待回覆訊息（3 則）'));});
check('pending CTA is primary reply and existing order detail',()=>assert.match(render('inquiries'),/class="primary" href="\/admin\/orders\/KD20261031-9402">查看並回覆/));
check('resolved CTA is secondary history and no next-step promise',()=>{const h=render('inquiries','history');assert.ok(h.includes('查看紀錄'));assert.ok(!h.includes('下一步'));});
check('inquiry all groups pending before history',()=>{const h=render('inquiries','all');assert.ok(h.indexOf('<h2>待處理')<h.indexOf('<h2>已處理／歷史'));});
check('inquiry search includes latest customer message',()=>assert.equal(selectAdminQueue(inquiries,'inquiries','all','resolved').length,1));
check('history newest resolution/reply first',()=>{const newer=projectAdminInquiryQueue([{...orders[2],orderNumber:'KD20261031-9405',orderConversationState:{resolvedAt:'2026-11-01T01:00:00Z',resolvedThroughMessageId:'resolved'}}])[0];assert.equal(selectAdminQueue([...inquiries,newer],'inquiries','history','')[0].orderNumber,newer.orderNumber);});
check('explicit resolution without reply uses existing evidence and invents no reply time',()=>{const resolved=markOrderInquiryResolved(orders[0],new Date('2026-10-31T05:00:00Z'));const projected=projectAdminInquiryQueue([resolved.order])[0];assert.equal(projected.actionable,false);assert.equal(projected.lastReplyAt,undefined);assert.equal(projected.historyAt,'2026-10-31T05:00:00.000Z');});
check('new customer message reopens existing resolved conversation',()=>{const resolved=markOrderInquiryResolved(orders[0]).order;const next=appendOrderMessage({order:resolved,actionId:'new-action',authorType:'customer',message:'再詢問',now:new Date('2026-11-01T00:00:00Z')});assert.equal(projectAdminInquiryQueue([next.order])[0].actionable,true);});
check('inquiry alert claim does not resolve pending message',()=>{const claimed=markOrderInquiryAlertClaimed(orders[0],orders[0].orderMessages[0]);assert.equal(assessOrderInquiryState(claimed).pending,true);assert.ok(createOrderInquiryLineAlertText(orders[0].orderNumber).includes(orders[0].orderNumber));});
check('projection DTO excludes private order fields',()=>{assert.ok(!JSON.stringify(rows).includes('never-serialize'));assert.ok(!JSON.stringify(inquiries).includes('never-serialize'));});
check('projection, searching and sorting never mutate persisted inputs',()=>assert.equal(JSON.stringify(orders),before));
console.log('ADMIN ORDER/INQUIRY QUEUES '+count+' PASS; pure fixtures, no real sends or writes');
