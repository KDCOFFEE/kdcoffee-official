import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createOrderMessagePreview,orderConversationCardData} from '../lib/orderMessagePreview';
import {appendOrderMessage,assessOrderInquiryState,listPendingOrderInquiries,createOrderInquiryLineAlertText,createOrderReplyNotificationTemplate} from '../lib/orderConversation';
import {POST as customerPost} from '../app/api/orders/[orderNumber]/messages/route';
import {POST as adminPost} from '../app/api/admin/orders/[orderNumber]/messages/route';
import {registerEmailMember,createSessionToken,MEMBER_SESSION_COOKIE} from '../lib/memberAuth';
import {createAdminSessionValue,adminCookieName} from '../lib/adminAuth';
import {getMembersDir} from '../lib/storagePaths';
import {readLineCardConfig,writeLineCardConfig,getLineCardConfigFile} from '../lib/lineCardConfigStore';
import {validateLineCardOverride} from '../lib/lineCardConfiguration';
import {renderLineFlex} from '../lib/lineFlexRenderer';
import {prepareCustomerLinePresentation,prepareInternalLinePresentation} from '../lib/customerLinePresentation';
import {sendInternalLineNotification} from '../lib/internalLineNotifications';
import type {StoredOrder} from '../lib/adminOrders';
import type {AssetRecord} from '../lib/assets';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'kd-line-conversation2-'));
for(const key of Object.keys(process.env))if(/^(RAILWAY_|LINE_|GOOGLE_|GMAIL_|SMTP_|RESEND_)/.test(key))delete process.env[key];
process.env.KD_DATA_DIR=root;process.env.AUTH_SESSION_SECRET='synthetic-conversation-member-secret-over-32-characters';process.env.ADMIN_SESSION_SECRET='synthetic-conversation-admin-secret-over-32-characters';
process.env.LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN='synthetic-customer-token';process.env.LINE_INTERNAL_CHANNEL_ACCESS_TOKEN='synthetic-admin-token';process.env.LINE_INTERNAL_RECIPIENT_ID='synthetic-admin-group';
process.env.RESEND_API_KEY='synthetic-email-token';process.env.MEMBER_EMAIL_FROM='backup-qa@example.test';
const keys=['admin.order.inquiry_received','customer.inquiry.admin_reply'] as const;
const cookies=globalThis as typeof globalThis&{__returnCookies?:Record<string,string>};
const owner=createAdminSessionValue({role:'owner',adminId:'owner'});
const requests:Array<{to:string;messages:Array<Record<string,unknown>>;headers:Headers}>=[];
const emails:Record<string,unknown>[]=[];
let failLine=false,unexpectedNetwork=0,checks=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,input)=>{
  const endpoint=String(url),headers=new Headers(input?.headers);
  if(endpoint==='https://api.line.me/v2/bot/message/push'){
    assert.ok(['Bearer synthetic-customer-token','Bearer synthetic-admin-token'].includes(headers.get('Authorization')??''));
    requests.push({...JSON.parse(String(input?.body)),headers});return Response.json({}, {status:failLine?500:200});
  }
  if(endpoint==='https://api.resend.com/emails'){
    assert.equal(headers.get('Authorization'),'Bearer synthetic-email-token');emails.push(JSON.parse(String(input?.body)));return Response.json({id:'synthetic-email'});
  }
  unexpectedNetwork++;throw Error('Unmocked network forbidden');
};
async function test(name:string,run:()=>unknown|Promise<unknown>){await run();checks++;console.log('PASS '+name);}
async function mode(key:string,value:'text'|'flex'){
  const store=await readLineCardConfig();await writeLineCardConfig({eventKey:key,action:'save',expectedRevision:store.revision,actor:'owner',overrides:{presentationMode:value}});
}
const params=(orderNumber:string)=>({params:Promise.resolve({orderNumber})});
const request=(body:unknown)=>new Request('http://localhost/api/orders/synthetic/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
let sequence=101;
try{
  await test('80 Unicode code points including ellipsis; Chinese is not cut at a surrogate',()=>{
    assert.equal(createOrderMessagePreview('詢'.repeat(80)),'詢'.repeat(80));
    assert.equal(createOrderMessagePreview('詢'.repeat(81)),'詢'.repeat(79)+'…');
    const emoji=createOrderMessagePreview('🙂'.repeat(81))!;assert.equal(Array.from(emoji).length,80);assert.equal(emoji,'🙂'.repeat(79)+'…');
  });
  await test('emoji ZWJ and mixed Chinese/emoji survive; malformed surrogate is omitted',()=>{
    assert.equal(createOrderMessagePreview('想確認 👩‍💻 的取貨安排'),'想確認 👩‍💻 的取貨安排');
    assert.equal(createOrderMessagePreview('壞字\ud800'),undefined);
  });
  await test('newline, whitespace, controls and invisible separators are normalized without mutation',()=>{
    const saved={message:'  請問\n\t 可以\u0000  自取\u200b嗎？  '};assert.deepEqual(orderConversationCardData('KD20261112-101',saved),{orderNumber:'KD20261112-101',messagePreview:'請問 可以 自取嗎?'});assert.ok(saved.message.includes('\u0000'));
  });
  for(const [kind,text]of [
    ['phone','請聯絡 0912-345-678 確認自取'],['email','請使用 qa.member@example.test 聯絡'],
    ['unlabelled bank number','轉給 123456789012345 後確認'],['ID','請比對 A123456789 後回覆'],
    ['fullwidth contact','電話０９１２３４５６７８ 再確認'],['invisible contact','請聯絡09\u200b12345678 確認'],
    ['short numeric code','請確認 123456 之後再回覆'],
  ])await test('best-effort redaction: '+kind,()=>{
    const result=createOrderMessagePreview(text);assert.ok(result);assert.ok(result.includes('〔已遮罩〕'));assert.ok(!result.includes('0912'));assert.ok(!result.includes('qa.member'));assert.ok(!result.includes('123456789'));
  });
  for(const [kind,text]of [
    ['bank context','銀行帳號是 123456789012'],['address','收件地址：合成街一號'],['secret','我的密碼是 SyntheticSecret'],
    ['unlabelled address','請送到合成市測試區測試路一號'],['unlabelled street','合成路三段八十八號可以嗎'],['obfuscated email','請用 qa @ example .test 聯絡'],
    ['HTML','<img src=x onerror=alert(1)>'],['HTML entity','&lt;script&gt;'],['URL','請到 https://example.test/secret 查看'],
    ['JSON','{"type":"bubble","text":"injection"}'],['joiner-obfuscated contact','請聯絡09\u200d12345678 確認'],
    ['blank',' \n\t '],['only redaction','qa@example.test'],['oversize','問'.repeat(4001)],
  ])await test('conservative omission: '+kind,()=>assert.equal(createOrderMessagePreview(text),undefined));
  const orderNumber='KD20261112-101';
  for(const key of keys){
    await test(key+' optional preview: missing, wrong type, unsafe and blank do not break Flex',()=>{
      for(const preview of [undefined,{},42,'','地址：不應顯示','https://example.test','<script>']){
        const r=renderLineFlex(key,{orderNumber,...(preview===undefined?{}:{messagePreview:preview})});assert.ok(r.ok);if(r.ok)assert.ok(!r.card.rows.some(row=>row.key==='messagePreview'));
      }
    });
    await test(key+' safe row only; altText and CTA never contain source content',()=>{
      const r=renderLineFlex(key,{orderNumber,messagePreview:'這是合成本次訊息'});assert.ok(r.ok);if(r.ok){assert.equal(r.card.rows.find(row=>row.key==='messagePreview')?.value,'這是合成本次訊息');assert.ok(!r.flex.altText.includes('合成本次訊息'));assert.ok(!r.card.cta.url.includes('合成本次訊息'));assert.ok(Buffer.byteLength(JSON.stringify(r.flex))<24000);}
      assert.throws(()=>validateLineCardOverride(key,{altText:'{{messagePreview}}'}));assert.throws(()=>validateLineCardOverride(key,{intro:'{{messagePreview}}'}));
    });
    await test(key+' 80 emoji still satisfy the existing 160 UTF-16-unit text bound',()=>{
      const r=renderLineFlex(key,{orderNumber,messagePreview:'🙂'.repeat(80)});assert.ok(r.ok);if(r.ok)assert.equal(r.card.rows.find(row=>row.key==='messagePreview')?.value,'🙂'.repeat(80));
    });
  }
  await test('saved specific message is used even if a newer message is present',()=>{
    const base={orderNumber,createdAt:'2026-11-12T00:00:00Z',orderMode:'home_delivery',status:'confirmed'};
    const first=appendOrderMessage({order:base,actionId:randomUUID(),authorType:'admin',message:'這是指定的較早回覆'});
    const second=appendOrderMessage({order:first.order,actionId:randomUUID(),authorType:'admin',message:'這是另一則較晚回覆'});
    assert.equal(orderConversationCardData(orderNumber,first.message).messagePreview,'這是指定的較早回覆');assert.equal(second.order.orderMessages!.length,2);
  });
  await test('Owner overrides and custom uploaded hero remain unchanged in both modes',async()=>{
    const asset:AssetRecord={id:'QA-OWNER-HERO',category:'qa',name:'Owner 合成圖',usage:'line',path:'/uploads/assets/qa/owner.jpg',recommendedSize:'',displaySize:'',format:'jpg',alt:'Owner 圖',seoStem:'owner',status:'active'};
    for(const key of keys){
      const store=await readLineCardConfig();await writeLineCardConfig({eventKey:key,action:'save',expectedRevision:store.revision,actor:'owner',overrides:{presentationMode:'flex',title:'Owner 自訂標題',headerImageAssetId:asset.id}});
      const snapshot=await readLineCardConfig(),bytes=await fs.readFile(getLineCardConfigFile());
      const p=key==='admin.order.inquiry_received'?await prepareInternalLinePresentation('原文字',{eventKey:key,data:{orderNumber,messagePreview:'合成摘要'}},{readConfig:async()=>snapshot,readAssets:async()=>[asset]}):await prepareCustomerLinePresentation('原文字',{eventKey:key,data:{orderNumber,messagePreview:'合成摘要'}},{readConfig:async()=>snapshot,readAssets:async()=>[asset]});
      assert.equal(p.message.type,'flex');assert.ok(JSON.stringify(p.message).includes(asset.path));assert.ok(JSON.stringify(p.message).includes('Owner 自訂標題'));assert.deepEqual(await fs.readFile(getLineCardConfigFile()),bytes);
    }
  });
  const member=await registerEmailMember('conversation-qa@example.test','Synthetic-Only-Password_2026');assert.ok(member);
  const memberId=member.id;
  const lineUser='U'+'a'.repeat(32);
  await fs.writeFile(path.join(getMembersDir(),member.id+'.json'),JSON.stringify({...member,lineUserId:lineUser}));
  cookies.__returnCookies={[MEMBER_SESSION_COOKIE]:createSessionToken(member.id),[adminCookieName]:owner};
  async function fixture(){
    const number='KD20261112-'+(++sequence),file=path.join(root,'orders',number+'.json');
    const order:StoredOrder={orderNumber:number,createdAt:'2026-11-12T00:00:00Z',orderMode:'home_delivery',status:'confirmed',member:{memberId,lineUserId:lineUser},customer:{name:'合成測試會員',email:'conversation-qa@example.test'},items:[],subtotal:500,total:500,shipping:0,credit:{appliedAmount:0}};
    await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(order));
    return {number,file,read:async()=>JSON.parse(await fs.readFile(file,'utf8')) as StoredOrder};
  }
  await mode(keys[0],'flex');await mode(keys[1],'flex');
  await test('real customer POST: three inquiries, one alert, one pending order, stable claimed ID',async()=>{
    const f=await fixture(),before=requests.length;let firstId='';
    for(const [i,text]of ['第一則合成詢問，內容'.repeat(15),'第二則合成詢問','第三則合成詢問'].entries()){
      const r=await customerPost(request({actionId:randomUUID(),message:text}),params(f.number));assert.equal(r.status,200);const body=await r.json();if(i===0)firstId=body.message.id;
    }
    const persisted=await f.read();assert.equal(requests.length-before,1);const payload=requests[before];assert.equal(payload.to,'synthetic-admin-group');assert.equal(payload.messages[0].type,'flex');
    assert.ok(JSON.stringify(payload.messages).includes(createOrderMessagePreview(String(persisted.orderMessages![0].message))!));assert.ok(!JSON.stringify(payload.messages).includes(String(persisted.orderMessages![0].message)));assert.ok(JSON.stringify(payload.messages).includes(f.number));
    assert.equal(persisted.orderMessages!.length,3);assert.equal(persisted.orderConversationState!.lastAlertedMessageId,firstId);assert.equal(assessOrderInquiryState(persisted).unresolvedCustomerMessages,3);assert.equal(listPendingOrderInquiries([persisted]).length,1);assert.equal(persisted.status,'confirmed');
  });
  await test('concurrent customer POST replay sends exactly once and retains full saved message',async()=>{
    const f=await fixture(),before=requests.length,actionId=randomUUID(),message='請問合成訂單的自取安排';
    const results=await Promise.all(Array.from({length:3},()=>customerPost(request({actionId,message}),params(f.number))));assert.ok(results.every(r=>r.status===200));assert.equal(requests.length-before,1);assert.equal((await f.read()).orderMessages!.length,1);assert.equal((await f.read()).orderMessages![0].message,message);
  });
  await test('real admin reply targets only this member and preserves saved body, financial and return data',async()=>{
    const f=await fixture(),before=requests.length,raw='本次指定回覆內容'.repeat(25),r=await adminPost(request({actionId:randomUUID(),message:raw,channels:['line']}),params(f.number));
    assert.equal(r.status,200);const body=await r.json(),saved=await f.read();assert.equal(saved.orderMessages![0].message,raw);assert.equal(body.message.id,saved.orderMessages![0].id);
    assert.equal(requests.length-before,1);const sent=requests[before];assert.equal(sent.to,lineUser);assert.equal(sent.messages[0].type,'flex');assert.ok(JSON.stringify(sent.messages).includes(createOrderMessagePreview(raw)!));assert.ok(JSON.stringify(sent.messages).includes(f.number));assert.ok(!JSON.stringify(sent.messages).includes(raw));assert.equal(saved.total,500);assert.equal(saved.credit?.appliedAmount,0);assert.equal(saved.status,'confirmed');assert.equal(saved.returnEvents,undefined);
  });
  await test('admin notifyCustomer false saves reply but sends no LINE or Email',async()=>{
    const f=await fixture(),before=requests.length,emailBefore=emails.length;const r=await adminPost(request({actionId:randomUUID(),message:'只保存在網站的合成回覆',notifyCustomer:false,channels:['line','email']}),params(f.number));assert.equal(r.status,200);assert.equal((await f.read()).orderMessages!.length,1);assert.equal(requests.length,before);assert.equal(emails.length,emailBefore);
  });
  await test('a saved reply resolves pending as before; a later inquiry reopens one order with one new alert',async()=>{
    const f=await fixture(),before=requests.length;
    await customerPost(request({actionId:randomUUID(),message:'第一輪合成詢問'}),params(f.number));
    await adminPost(request({actionId:randomUUID(),message:'網站中的合成回覆',notifyCustomer:false,channels:['line']}),params(f.number));
    assert.equal(assessOrderInquiryState(await f.read()).pending,false);
    await customerPost(request({actionId:randomUUID(),message:'下一輪合成詢問'}),params(f.number));
    assert.equal(requests.length-before,2);assert.equal(listPendingOrderInquiries([await f.read()]).length,1);
  });
  await test('admin replay and concurrent replies retain each specific saved message',async()=>{
    const f=await fixture(),before=requests.length,id=randomUUID();
    const send=(actionId:string,message:string)=>adminPost(request({actionId,message,channels:['line']}),params(f.number));
    await Promise.all([send(id,'並行回覆甲'),send(id,'並行回覆甲')]);assert.equal(requests.length-before,1);
    await Promise.all([send(randomUUID(),'並行回覆乙'),send(randomUUID(),'並行回覆丙')]);assert.equal(requests.length-before,3);
    const payloads=requests.slice(before).map(r=>JSON.stringify(r.messages));for(const s of ['並行回覆甲','並行回覆乙','並行回覆丙'])assert.equal(payloads.filter(p=>p.includes(s)).length,1);assert.equal((await f.read()).orderMessages!.length,3);
  });
  await test('text mode messages and Email template remain byte-identical',async()=>{
    await mode(keys[0],'text');await mode(keys[1],'text');let f=await fixture(),before=requests.length;
    await customerPost(request({actionId:randomUUID(),message:'不應出現在文字通知的內容'}),params(f.number));assert.deepEqual(requests[before].messages,[{type:'text',text:createOrderInquiryLineAlertText(f.number)}]);
    f=await fixture();before=requests.length;const emailBefore=emails.length;await adminPost(request({actionId:randomUUID(),message:'不應改變 Email 的回覆內容',channels:['line','email']}),params(f.number));assert.deepEqual(requests[before].messages,[{type:'text',text:createOrderReplyNotificationTemplate(f.number).text}]);assert.equal(emails.length-emailBefore,1);assert.equal(emails[emailBefore].text,createOrderReplyNotificationTemplate(f.number).text);
    await mode(keys[0],'flex');await mode(keys[1],'flex');
  });
  await test('unsafe saved content still sends original valid Flex without preview',async()=>{
    const f=await fixture(),before=requests.length;await customerPost(request({actionId:randomUUID(),message:'銀行帳號為合成敏感資料'}),params(f.number));assert.equal(requests[before].messages[0].type,'flex');assert.ok(!JSON.stringify(requests[before].messages).includes('合成敏感資料'));
  });
  await test('failed alert does not change existing claim/pending frequency',async()=>{
    const f=await fixture(),before=requests.length,id=randomUUID();failLine=true;
    try{await customerPost(request({actionId:id,message:'第一次通知失敗的合成詢問'}),params(f.number));}finally{failLine=false;}
    await customerPost(request({actionId:id,message:'相同操作重放'}),params(f.number));await customerPost(request({actionId:randomUUID(),message:'仍待回覆時第二則留言'}),params(f.number));assert.equal(requests.length-before,1);assert.equal(assessOrderInquiryState(await f.read()).pending,true);
  });
  await test('existing retry key and accepted 409 remain intact with a preview',async()=>{
    let calls=0;const r=await sendInternalLineNotification('原文字',{attempts:1,retryKey:'existing-key',cardContext:{eventKey:keys[0],data:orderConversationCardData('KD20261112-101',{message:'合成詢問'})},fetcher:async(_u,init)=>{calls++;assert.equal(new Headers(init?.headers).get('X-Line-Retry-Key'),'existing-key');return new Response('',{status:409,headers:{'x-line-accepted-request-id':'synthetic-existing'}});}});assert.equal(calls,1);assert.equal(r.sent,true);
  });
  await test('all route payloads roundtrip JSON; no unmocked requests',()=>{for(const r of requests)assert.deepEqual(JSON.parse(JSON.stringify(r.messages)),r.messages);assert.equal(unexpectedNetwork,0);});
  console.log('LINE.NOTIFY.CONVERSATION.2 '+checks+' checks PASS; actual POST handlers and synthetic network only.');
}finally{globalThis.fetch=originalFetch;cookies.__returnCookies={};assert.ok(root.startsWith(path.join(os.tmpdir(),'kd-line-conversation2-')));await fs.rm(root,{recursive:true,force:true});}
