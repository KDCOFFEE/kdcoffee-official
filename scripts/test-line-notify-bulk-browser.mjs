// Isolated synthetic local server + fresh Chrome profile. No production I/O.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const qa=path.resolve('qa-output/line-notify-bulk-mode1');
const root=await fs.mkdtemp(path.join(qa,'browser-data-'));
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'kd-line-bulk-browser-'));
const origin='http://127.0.0.1:3197',debug='http://127.0.0.1:9317';
const secret=crypto.randomBytes(48).toString('hex');
const configFile=path.join(root,'line-notification-cards/configuration.json');
const initial={version:1,revision:0,events:{'customer.order.confirmed':{overrides:{title:'合成測試自訂標題'},updatedAt:'2026-11-01T00:00:00Z',updatedBy:'synthetic-owner'}}};
await fs.mkdir(path.dirname(configFile),{recursive:true});await fs.writeFile(configFile,JSON.stringify(initial));
const env={...process.env,KD_DATA_DIR:root,ADMIN_SESSION_SECRET:secret,AUTH_SESSION_SECRET:secret,NEXT_TELEMETRY_DISABLED:'1'};
for(const k of Object.keys(env))if(/^(LINE_|GOOGLE_|GMAIL_|RAILWAY_|CLOUDINARY_|RESEND_|KD_MEMBER_BACKUP_)/.test(k))delete env[k];
const log=await fs.open(path.join(qa,'browser-server.log'),'w');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3197','-H','127.0.0.1'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
server.stdout.on('data',d=>log.write(d));server.stderr.on('data',d=>log.write(d));
let chrome,ws,seq=0;const waiting=new Map(),checks=[],failures=[],blocked=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(url){for(let i=0;i<100;i++){try{const r=await fetch(url);if(r.ok)return r;}catch{}await sleep(250);}throw Error('Local QA server/browser unavailable');}
function send(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{waiting.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;}
async function until(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(150);}throw Error('Browser condition failed: '+expression);}
async function click(text){await until(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.includes(${JSON.stringify(text)}));return !!b&&!b.disabled})()`);assert.equal(await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.includes(${JSON.stringify(text)}));if(!b||b.disabled)return false;b.click();return true})()`),true);}
async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(qa,name),Buffer.from(r.data,'base64'));}
try{
 await ready(origin+'/api/health');
 chrome=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync','--disable-extensions','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost','--remote-debugging-address=127.0.0.1','--remote-debugging-port=9317','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 const targets=await (await ready(debug+'/json')).json();ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=waiting.get(m.id);waiting.delete(m.id);if(m.error)p?.reject(Error(m.error.message));else p?.resolve(m.result);}else if(m.method==='Fetch.requestPaused'){const p=m.params;let local=false;try{local=new URL(p.request.url).origin===origin;}catch{}if(local)send('Fetch.continueRequest',{requestId:p.requestId}).catch(()=>{});else{blocked.push(p.request.url.split('?')[0]);send('Fetch.failRequest',{requestId:p.requestId,errorReason:'BlockedByClient'}).catch(()=>{});}}else if(m.method==='Runtime.exceptionThrown')failures.push(m.params.exceptionDetails.text);});
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
 const payload=Buffer.from(JSON.stringify({version:2,adminId:'synthetic-owner',role:'owner',permissions:['members.sensitive.read'],expiresAt:Date.now()+3600000})).toString('base64url');
 const cookie=payload+'.'+crypto.createHmac('sha256',secret).update(payload).digest('base64url');
 await send('Network.setCookie',{name:'kd_admin_session',value:cookie,url:origin,httpOnly:true,sameSite:'Lax'});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:origin+'/admin/notifications/line-cards'});
 await until(`document.body.innerText.includes('LINE 顯示方式批次管理')`);
 await until(`Object.keys(document.querySelector('input[type="checkbox"]')).some(k=>k.startsWith('__reactProps'))`);
 await evaluate(`document.querySelector('section[aria-label="LINE 顯示方式批次管理"]').scrollIntoView()`);
 assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);checks.push('desktop no horizontal overflow');
 assert.equal(await evaluate(`document.querySelectorAll('input[type="checkbox"]:enabled').length>0`),true);
 await evaluate(`document.querySelector('input[type="checkbox"]:enabled').click()`);await click('儲存例外清單');await until(`document.body.innerText.includes('批次例外已儲存；')`);
 const excluded=JSON.parse(await fs.readFile(configFile,'utf8'));assert.equal(excluded.bulkExcludedEventKeys.length,1);assert.deepEqual(excluded.events,initial.events);checks.push('real browser saves exclusions alone without touching overrides');
 await click('檢視變更清單');await until(`!!document.querySelector('[aria-label="批次確認清單"]')`);await screenshot('desktop-review.png');
 await click('確認套用這');await until(`document.body.innerText.includes('已完整套用')`);const applied=JSON.parse(await fs.readFile(configFile,'utf8'));assert.equal(applied.revision,2);assert.deepEqual(applied.events[excluded.bulkExcludedEventKeys[0]],initial.events[excluded.bulkExcludedEventKeys[0]]);assert.equal(applied.events['customer.order.confirmed'].overrides.title,initial.events['customer.order.confirmed'].overrides.title);checks.push('review then atomic mode save preserves exception and custom title');
 await send('Page.reload');await until(`document.body.innerText.includes('LINE 顯示方式批次管理')`);await sleep(500);assert.equal(await evaluate(`document.querySelectorAll('input[type="checkbox"]:checked').length`),1);checks.push('reload keeps saved exception and modes');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate(`document.querySelector('section[aria-label="LINE 顯示方式批次管理"]').scrollIntoView()`);await sleep(250);
 assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),true);await screenshot('mobile-panel.png');checks.push('390px mobile panel fits viewport');
 assert.deepEqual(failures,[]);checks.push('no browser runtime exceptions');
 await fs.writeFile(path.join(qa,'browser-results.json'),JSON.stringify({checks,blockedExternalRequests:blocked,failures,syntheticOnly:true},null,2));
 console.log(`BROWSER ${checks.length} checks PASS; localhost synthetic data only.`);
}catch(error){
 if(ws?.readyState===1){await screenshot('browser-diagnostic.png').catch(()=>{});await fs.writeFile(path.join(qa,'browser-diagnostic.json'),JSON.stringify({error:String(error),failures,blocked,dom:await evaluate(`({readyState:document.readyState,scripts:[...document.scripts].filter(e=>e.src).map(e=>e.src),text:document.body.innerText.slice(0,1200),checkboxes:[...document.querySelectorAll('input[type="checkbox"]')].slice(0,3).map(e=>({keys:Object.keys(e),checked:e.checked,disabled:e.disabled})),buttons:[...document.querySelectorAll('button')].slice(0,15).map(e=>({text:e.textContent,disabled:e.disabled}))})`)},null,2));}
 throw error;
}finally{
 if(ws?.readyState===1){await send('Browser.close').catch(()=>{});ws.close();}chrome?.kill();server.kill();await sleep(1000);await log.close();
 assert.ok(profile.startsWith(path.join(os.tmpdir(),'kd-line-bulk-browser-')));await fs.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:250});
}
