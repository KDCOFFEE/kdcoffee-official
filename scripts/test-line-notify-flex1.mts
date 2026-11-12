import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import LineNotificationCardEditor from '../components/admin/LineNotificationCardEditor';
import {membershipCardContext,orderCardContext,returnCardContext} from '../lib/customerLineCardEvents';
import {supportsCardPresentation} from '../lib/lineCardDeliverySupport';
import {prepareCustomerLinePresentation} from '../lib/customerLinePresentation';
import {sendCustomerLineNotification} from '../lib/customerNotificationDelivery';
import {sendInternalLineNotification} from '../lib/internalLineNotifications';
import {readLineCardConfig,writeLineCardConfig,getLineCardConfigFile} from '../lib/lineCardConfigStore';
import {readMembershipCommerceState,type NotificationEvent} from '../lib/membershipCommerce';
import {deliverNextMembershipNotification} from '../lib/memberNotificationAutomation';
import {getMembershipCommerceStateFile,getMembersDir} from '../lib/storagePaths';
import {returnOpsFixture} from './return-ops-test-support';

// Run with line-card-test-bootstrap.mjs: all real network requests are blocked.
const root=await fs.mkdtemp(path.join(os.tmpdir(),'kd-line-flex1-'));
for(const key of Object.keys(process.env))if(/^(RAILWAY_|LINE_|GMAIL_|GOOGLE_|SMTP_|RESEND_)/.test(key))delete process.env[key];
process.env.KD_DATA_DIR=root;
process.env.LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN='synthetic-customer-token';
process.env.LINE_INTERNAL_CHANNEL_ACCESS_TOKEN='synthetic-internal-token';
process.env.LINE_INTERNAL_RECIPIENT_ID='synthetic-admin';
const original='原始會員通知文字，不含私人資料。';
let checks=0;
async function test(name:string,run:()=>unknown|Promise<unknown>){await run();checks++;console.log('PASS '+name);}
const notice=(eventType:NotificationEvent['eventType'],safeData:NotificationEvent['safeData']):NotificationEvent=>({
  notificationId:'synthetic-'+eventType,eventType,sourceEvent:'synthetic-source-'+eventType,
  memberId:'synthetic-member',channels:['line'],status:'pending',createdAt:'2026-11-12T00:00:00.000Z',safeData,
});
async function flex(key:string){const store=await readLineCardConfig();await writeLineCardConfig({eventKey:key,action:'save',expectedRevision:store.revision,actor:'owner',overrides:{presentationMode:'flex'}});}
const cases=[
  {event:'referral_conversion' as const,key:'customer.reward.referral',field:'rewardAmount',amount:753},
  {event:'credit_issued' as const,key:'customer.reward.credit_issued',field:'amount',amount:537},
];
try{
  for(const item of cases){
    const n=notice(item.event,{[item.field]:item.amount,bankAccount:'PRIVATE-SENTINEL',qualificationStatus:'awaiting_completion'});
    const before=structuredClone(n),context=membershipCardContext(n)!;
    await test(item.event+' maps existing catalog and only authoritative numeric field',()=>{
      assert.equal(context.eventKey,item.key);assert.deepEqual(context.data,{[item.field]:item.amount});
      assert.equal(supportsCardPresentation(item.key),true);assert.deepEqual(n,before);
    });
    await test(item.event+' absent mode preserves exact text',async()=>assert.deepEqual((await prepareCustomerLinePresentation(original,context)).message,{type:'text',text:original}));
    await flex(item.key);
    await test(item.event+' Owner editor exposes saved Flex mode',async()=>{
      const html=renderToStaticMarkup(createElement(LineNotificationCardEditor,{eventKey:item.key,store:await readLineCardConfig(),onSaved:()=>{},onDirty:()=>{},onClose:()=>{}}));
      assert.ok(html.includes('aria-label="LINE 顯示方式"'));assert.ok(html.includes('value="flex" selected=""'));
    });
    await test(item.event+' actual sender emits saved Flex with real amount, no preview or private data',async()=>{
      let calls=0;
      const result=await sendCustomerLineNotification({userId:'synthetic-member',template:{eventType:item.event,subject:'synthetic',text:original},cardContext:context,retryKey:'existing-retry-key',fetcher:async(url,input)=>{
        calls++;assert.equal(String(url),'https://api.line.me/v2/bot/message/push');
        const body=JSON.parse(String(input?.body));assert.equal(body.messages[0].type,'flex');
        assert.ok(body.messages[0].altText);assert.equal(body.messages[0].contents.type,'bubble');
        const payload=JSON.stringify(body);assert.ok(payload.includes(String(item.amount)));assert.ok(!payload.includes('100 抵用金'));assert.ok(!payload.includes('PRIVATE-SENTINEL'));assert.ok(!payload.includes('awaiting_completion'));
        assert.equal(new Headers(input?.headers).get('X-Line-Retry-Key'),'existing-retry-key');return Response.json({});
      }});
      assert.equal(calls,1);assert.equal(result.status,'sent');assert.equal(result.diagnostics?.requestedPresentation,'flex');assert.equal(result.diagnostics?.deliveredPresentation,'flex');
    });
    for(const invalid of [undefined,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'100',...(item.event==='credit_issued'?[0]:[])]){
      await test(item.event+' invalid amount '+String(invalid)+' uses diagnosable text fallback',async()=>{
        const invalidNotice=notice(item.event,{[item.field]:invalid} as NotificationEvent['safeData']);
        const r=await prepareCustomerLinePresentation(original,membershipCardContext(invalidNotice));
        assert.deepEqual(r.message,{type:'text',text:original});assert.equal(r.requestedPresentation,'flex');assert.equal(r.deliveredPresentation,'text');assert.equal(r.fallbackReason,'PRE_SEND_RENDER_FAILURE');
      });
    }
  }
  await test('zero referral update is valid status information, never asserted as new credit',async()=>{
    const r=await prepareCustomerLinePresentation(original,membershipCardContext(notice('referral_conversion',{rewardAmount:0})));
    assert.equal(r.message.type,'flex');assert.ok(JSON.stringify(r.message).includes('是否可使用請以會員中心紀錄為準'));
  });
  const {GET:simulate}=await import('../app/api/admin/notifications/line-cards/simulate/route');
  const {adminCookieName,createAdminSessionValue}=await import('../lib/adminAuth');
  process.env.ADMIN_SESSION_SECRET='synthetic-flex1-owner-secret-over-32-characters';
  (globalThis as typeof globalThis&{__returnCookies?:Record<string,string>}).__returnCookies={[adminCookieName]:createAdminSessionValue({role:'owner',adminId:'owner'})};
  for(const item of cases)await test(item.event+' simulation resolves real template, not an undefined event',async()=>{
    const response=await simulate(new Request('http://localhost/api/admin/notifications/line-cards/simulate?eventKey='+item.key));
    assert.equal(response.status,200);const result=await response.json();assert.equal(result.message.type,'flex');
    assert.ok(!result.originalText.includes('undefined'));assert.ok(result.originalText.includes(item.event==='referral_conversion'?'推薦回饋':'入帳'));
  });
  await test('Owner text mode retains existing image and copy overrides',async()=>{
    const key='customer.reward.credit_issued',store=await readLineCardConfig();
    await writeLineCardConfig({eventKey:key,action:'save',expectedRevision:store.revision,actor:'owner',overrides:{presentationMode:'text',headerAsset:'RETURN',title:'Owner 既有文案'}});
    const bytes=await fs.readFile(getLineCardConfigFile());
    assert.deepEqual((await prepareCustomerLinePresentation(original,membershipCardContext(notice('credit_issued',{amount:537})))).message,{type:'text',text:original});
    assert.deepEqual(await fs.readFile(getLineCardConfigFile()),bytes);
    const updated=await readLineCardConfig();await writeLineCardConfig({eventKey:key,action:'save',expectedRevision:updated.revision,actor:'owner',overrides:{...updated.events[key].overrides,presentationMode:'flex'}});
    const p=await prepareCustomerLinePresentation(original,membershipCardContext(notice('credit_issued',{amount:537})));
    assert.equal(p.message.type,'flex');assert.ok(JSON.stringify(p.message).includes('/images/line-cards/return.jpg'));assert.ok(JSON.stringify(p.message).includes('Owner 既有文案'));
  });
  await test('credit expiry and gift milestones retain actual event fields',async()=>{
    for(const [event,key,data]of [
      ['credit_expiring','customer.reward.credit_expiring',{amount:81,expiresOn:'2026-11-30'}],
      ['gift_eligible','customer.reward.gift_milestone',{fulfillmentNumber:6}],
    ] as const){await flex(key);const r=await prepareCustomerLinePresentation(original,membershipCardContext(notice(event,data)));assert.equal(r.message.type,'flex');assert.ok(JSON.stringify(r.message).includes(event==='gift_eligible'?'6':'81'));}
  });
  await test('existing order context keeps canonical order and pickup fields',()=>{
    const r=orderCardContext({orderNumber:'KD20261112-1',createdAt:'2026-11-12T00:00:00Z',status:'ready_for_pickup',orderMode:'studio_pickup',studioPickup:{preferredDate:'2026-11-13',preferredTime:'14:00'}},'studio_ready_for_pickup');
    assert.deepEqual(r?.data,{orderNumber:'KD20261112-1',pickupDate:'2026-11-13',pickupTime:'14:00'});
    assert.equal(returnCardContext('return_request_rejected','KD20261112-2')?.data.orderNumber,'KD20261112-2');
  });
  await test('internal render failure reports text fallback without false Flex success',async()=>{
    await flex('admin.return.request_received');let calls=0;
    const r=await sendInternalLineNotification(original,{attempts:1,retryKey:'retained-key',cardContext:{eventKey:'admin.return.request_received',data:{}},fetcher:async(_url,input)=>{
      calls++;const body=JSON.parse(String(input?.body));assert.deepEqual(body.messages,[{type:'text',text:original}]);assert.equal(new Headers(input?.headers).get('X-Line-Retry-Key'),'retained-key');return Response.json({});
    }});
    assert.equal(calls,1);assert.equal(r.sent,true);assert.equal(r.diagnostics?.requestedPresentation,'flex');assert.equal(r.diagnostics?.deliveredPresentation,'text');assert.equal(r.diagnostics?.fallbackReason,'PRE_SEND_RENDER_FAILURE');
  });
  await test('member queue still claims once, records delivery, and never changes economic data',async()=>{
    const file=getMembershipCommerceStateFile(),state=await readMembershipCommerceState();
    state.notifications=cases.map(c=>notice(c.event,{[c.field]:c.amount}));
    await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(state));
    await fs.mkdir(getMembersDir(),{recursive:true});await fs.writeFile(path.join(getMembersDir(),'synthetic-member.json'),JSON.stringify({id:'synthetic-member',lineUserId:'U'+'a'.repeat(32),createdAt:'2026-11-12T00:00:00Z',lastLoginAt:'2026-11-12T00:00:00Z'}));
    const economicBefore={credits:state.creditEntries,rewards:state.referralRewards,conversions:state.referralConversions};let sends=0;
    for(const item of cases){
      await flex(item.key);
      const options={notificationId:'synthetic-'+item.event,lineFetcher:async(_url:unknown,input?:RequestInit)=>{sends++;const body=JSON.parse(String(input?.body));assert.equal(body.messages[0].type,'flex');assert.ok(JSON.stringify(body).includes(String(item.amount)));return Response.json({});}};
      await Promise.all([deliverNextMembershipNotification(options),deliverNextMembershipNotification(options)]);await deliverNextMembershipNotification(options);
    }
    const after=await readMembershipCommerceState();assert.equal(sends,2);assert.ok(after.notifications.every(n=>n.status==='delivered'));assert.deepEqual({credits:after.creditEntries,rewards:after.referralRewards,conversions:after.referralConversions},economicBefore);
  });
  // Existing return fixture creates synthetic authoritative events through unchanged business rules.
  for(const event of ['return_request_received','return_request_approved','return_request_rejected'] as const){
    const fixture=await returnOpsFixture();
    try{
      if(event==='return_request_approved')await fixture.transition('RETURN_APPROVED');
      if(event==='return_request_rejected')await fixture.transition('RETURN_REJECTED');
      process.env.LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN='synthetic-customer-token';
      const key={return_request_received:'customer.return.received',return_request_approved:'customer.return.approved',return_request_rejected:'customer.return.rejected'}[event];await flex(key);
      await test(event+' real delivery path uses authoritative source order and same retry identity',async()=>{
        const state=await readMembershipCommerceState(),n=state.notifications.find(n=>n.eventType===event)!;assert.ok(n);let calls=0;
        const originalEvents=structuredClone(state.returnEvents),originalOrder=await fs.readFile(fixture.file);
        const options={notificationId:n.notificationId,lineFetcher:async(_url:unknown,input?:RequestInit)=>{calls++;const body=JSON.parse(String(input?.body));assert.equal(body.messages[0].type,'flex');assert.ok(JSON.stringify(body).includes(fixture.orderNumber));assert.ok(!JSON.stringify(body).includes(fixture.bank.account));assert.ok(new Headers(input?.headers).get('X-Line-Retry-Key'));return Response.json({});}};
        await deliverNextMembershipNotification(options);await deliverNextMembershipNotification(options);assert.equal(calls,1);assert.deepEqual((await readMembershipCommerceState()).returnEvents,originalEvents);assert.deepEqual(await fs.readFile(fixture.file),originalOrder);
      });
    }finally{await fixture.cleanup();}
  }
  console.log('LINE.NOTIFY.FLEX.1 '+checks+' checks PASS; synthetic data only; no real network or notices.');
}finally{
  assert.ok(root.startsWith(path.join(os.tmpdir(),'kd-line-flex1-')));await fs.rm(root,{recursive:true,force:true});
}
