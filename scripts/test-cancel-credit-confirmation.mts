// Actual hook callbacks/state, isolated fixture; not a browser claim.
import assert from "node:assert/strict";
import { isValidElement } from "react";
import { readFile } from "node:fs/promises";
import { useCancelCreditConfirmation } from "../components/member/CancelCreditConfirmation";
const globals=globalThis as typeof globalThis & {__cancelCreditFixture?:Fixture};
class Fixture {
 slots:unknown[]=[];cursor=0;effects:Array<()=>void>=[];
 useState<T>(initial:T){const i=this.cursor++;if(!(i in this.slots))this.slots[i]=initial;return [this.slots[i] as T,(next:T)=>{this.slots[i]=next;}] as const;}
 useRef<T>(initial:T){return this.useState({current:initial})[0];}
 useId(){return this.useState("cancel-preview-title")[0];}
 useEffect(effect:()=>void,deps:unknown[]){const i=this.cursor++,prev=this.slots[i] as unknown[]|undefined;if(!prev||deps.some((d,j)=>d!==prev[j]))this.effects.push(effect);this.slots[i]=deps;}
 // eslint-disable-next-line react-hooks/rules-of-hooks -- Controlled test fixture executes the real custom hook.
 render(){this.cursor=0;globals.__cancelCreditFixture=this;try{return useCancelCreditConfirmation();}finally{delete globals.__cancelCreditFixture;}}
}
type Node={type:unknown;props:Record<string,unknown>};
function nodes(tree:unknown):Node[]{if(Array.isArray(tree))return tree.flatMap(nodes);if(!isValidElement(tree))return [];const node=tree as Node;return [node,...nodes(node.props.children)];}
class Element { focus(){} }
Object.defineProperty(globalThis,"HTMLElement",{value:Element,configurable:true});
Object.defineProperty(globalThis,"document",{value:{activeElement:new Element()},configurable:true});
let calls=0,count=0;
function check(name:string,f:()=>void){f();console.log(`PASS ${++count}: ${name}`);}
const tick=()=>new Promise(done=>setTimeout(done,0));
function setup(status:number,payload:unknown){
 const fixture=new Fixture();const requests:Array<{url:string;options:RequestInit|undefined}>=[];
 globalThis.fetch=async(input,options)=>{calls++;requests.push({url:String(input),options});return new Response(JSON.stringify(payload),{status});};
 return {fixture,requests};
}
function click(tree:unknown,key:string){const button=nodes(tree).find(n=>n.type==="button"&&nodes(n.props.children).some(c=>c.props.copyKey===key));assert.ok(button,key);(button.props.onClick as ()=>void)();}
const ready={status:"ready",originalAmount:100,restorableAmount:0,expiredAmount:100,otherUnavailableAmount:0,entries:[{amount:100,restorableAmount:0,expiresAt:"2026-11-13T04:00:00Z",expired:true}],generatedAt:"2026-11-13T04:00:00Z"};
{
 const {fixture,requests}=setup(200,ready);let hook=fixture.render(),resolved=false;
 const pending=hook.confirm("KD20261113-1000").then(v=>{resolved=true;return v;});await tick();hook=fixture.render();
 check("confirmation waits for explicit member action",()=>assert.equal(resolved,false));
 check("preview is GET-only no-store and never submits amounts",()=>{assert.equal(requests.length,1);assert.ok(requests[0].url.endsWith("/cancel/credit-preview"));assert.equal(requests[0].options?.cache,"no-store");assert.equal(requests[0].options?.body,undefined);});
 const duplicate=await hook.confirm("KD20261113-1000");check("double click cannot issue a second preview or confirm",()=>{assert.equal(duplicate,false);assert.equal(requests.length,1);});
 click(hook.confirmation,"credit.cancelPreview.back");assert.equal(await pending,false);check("Back rejects cancellation",()=>{});
}
{
 const {fixture}=setup(200,ready);let hook=fixture.render();const pending=hook.confirm("KD20261113-1000");await tick();hook=fixture.render();click(hook.confirmation,"credit.cancelPreview.confirm");assert.equal(await pending,true);check("explicit acknowledgment permits original cancellation callback",()=>{});
}
{
 const {fixture}=setup(200,{status:"none"});const hook=fixture.render();assert.equal(await hook.confirm("KD20261113-1000"),true);check("no-credit skips the extra confirmation",()=>{});
}
for(const status of [401,404]){
 const {fixture}=setup(status,{});let hook=fixture.render();const pending=hook.confirm("KD20261113-1000");await tick();hook=fixture.render();
 check(status+" blocks confirmation",()=>assert.ok(!nodes(hook.confirmation).some(n=>n.props.copyKey==="credit.cancelPreview.confirm")));
 click(hook.confirmation,"credit.cancelPreview.back");assert.equal(await pending,false);
}
{
 const {fixture}=setup(500,{});let hook=fixture.render();const pending=hook.confirm("KD20261113-1000");await tick();hook=fixture.render();
 const content=nodes(hook.confirmation).find(n=>n.props.preview);check("failed preview is explicitly unavailable, not assumed full refund",()=>assert.equal((content?.props.preview as {status:string}).status,"unavailable"));
 const dialog=nodes(hook.confirmation).find(n=>n.type==="dialog")!;let prevented=false;(dialog.props.onCancel as (e:{preventDefault:()=>void})=>void)({preventDefault:()=>{prevented=true;}});assert.equal(await pending,false);check("Escape cancels the pending action",()=>assert.equal(prevented,true));
}
for(const file of ["components/orders/OrderConversation.tsx","components/member/MemberSubscriptionExperience.tsx"]){
 const source=await readFile(file,"utf8");
 check(file+" awaits shared preview before PATCH",()=>{const start=source.indexOf(file.includes("OrderConversation")?"async function cancelOrder(":"async function cancelCurrentDelivery(");const patch=source.indexOf('method: "PATCH"',start);assert.ok(source.indexOf("await cancelCredit.confirm",start)<patch);assert.ok(source.includes("{cancelCredit.confirmation}"));});
}
const orderUi=(await readFile("components/orders/OrderConversation.tsx","utf8")).replace(/\r\n/g,"\n");
check("order confirmation mounts in loaded main screen, not only loading branch",()=>{
 const main=orderUi.indexOf('  return (\n    <section className="order-conversation-card">');
 assert.ok(main>=0);assert.ok(orderUi.indexOf("{cancelCredit.confirmation}",main)>main);
 assert.ok(!orderUi.slice(orderUi.indexOf("  if (loading)"),main).includes("{cancelCredit.confirmation}"));
});
console.log(`TOTAL ${count} PASS / 0 FAIL; ${calls} mocked preview requests. Real component callbacks, isolated hook fixture.`);
