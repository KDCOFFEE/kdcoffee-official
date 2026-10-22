import assert from "node:assert/strict";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as nodeModule from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";
import React from "react";


let checks = 0;
function check(label: string, action: () => void) {
  action(); console.log("PASS " + (++checks) + " " + label);
}
type Element = React.ReactElement<Record<string, any>>;
const pureComponents = new Set<Function>();
function elements(value: any): Element[] {
  if(Array.isArray(value)) return value.flatMap(elements);
  if(!React.isValidElement(value)) return [];
  const e=value as Element;
  if(e.type===React.Fragment) return elements(e.props.children);
  if(typeof e.type==="function"&&pureComponents.has(e.type)) return elements((e.type as Function)(e.props));
  return [e,...elements(e.props.children)];
}
function find(tree: any, predicate: (element: Element) => boolean) {
  const value = elements(tree).find(predicate);
  assert.ok(value, "Expected UI element"); return value;
}
let slots: any[] = [], cursor = 0, cart: any;
const hooks = {
  useState: (initial: any) => {
    const i = cursor++;
    if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
    return [slots[i], (value: any) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
  },
  useRef: (initial: any) => { const i = cursor++; return slots[i] ??= { current: initial }; },
  useEffect: () => {},
};
(globalThis as any).__purchaseModeHooks = hooks;
(globalThis as any).__purchaseModeCart = () => cart;
const reactURL = pathToFileURL(path.resolve("node_modules/react/index.js")).href;
const { registerHooks } = nodeModule as any;
const registration = registerHooks({
  resolve(specifier: string, context: { parentURL?: string }, next: any) {
    if (specifier.endsWith(".module.css")) return { url: "data:text/javascript,export default new Proxy({}, {get:(_,key)=>String(key)});", shortCircuit: true };
    if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
    if (specifier === "react" && /\/(?:app\/checkout\/page|components\/commerce\/(?:ProtocolV1Checkout|CheckoutPresentation))\.tsx(?:\?baseline)?$/.test(context.parentURL || "")) {
      return { url: "data:text/javascript," + encodeURIComponent("export * from " + JSON.stringify(reactURL) + ";export {default} from " + JSON.stringify(reactURL) + ";export const useState=(v)=>globalThis.__purchaseModeHooks.useState(v);export const useRef=(v)=>globalThis.__purchaseModeHooks.useRef(v);export const useEffect=()=>{};"), shortCircuit: true };
    }
    if (specifier.endsWith("CartProvider") && /\/(?:app\/checkout\/page|components\/commerce\/(?:ProtocolV1Checkout|CommerceCheckoutBoundary))\.tsx(?:\?baseline)?$/.test(context.parentURL || "")) {
      return { url: "data:text/javascript,export const useCart=()=>globalThis.__purchaseModeCart();", shortCircuit: true };
    }
    if (specifier === "next/navigation") return { url: "data:text/javascript,export const useRouter=()=>({push(){}});export const usePathname=()=>'/checkout';", shortCircuit: true };
    if (specifier === "next/link") return { url: "data:text/javascript,import React from " + JSON.stringify(reactURL) + ";export default function Link({children,...props}){return React.createElement('a',props,children);}", shortCircuit: true };
    if (specifier.startsWith("@/") || (specifier.startsWith(".") && context.parentURL?.startsWith("file:"))) {
      const base = specifier.startsWith("@/") ? path.resolve(specifier.slice(2)) : fileURLToPath(new URL(specifier, context.parentURL));
      for (const candidate of [base, base + ".ts", base + ".tsx"]) {
        if (existsSync(candidate) && !candidate.endsWith(".css")) return next(pathToFileURL(candidate).href, context);
      }
    }
    return next(specifier, context);
  },
  load(url: string, context: unknown, next: any) {
    if (url.endsWith(".tsx") || url.endsWith(".tsx?baseline")) return { format: "module", source: ts.transpileModule("import React from 'react';\n" + (url.endsWith("?baseline") ? execFileSync("git", ["show", "89d13bd30000968f8b59294c28609b2d8bb40473:app/checkout/page.tsx"]).toString() : readFileSync(fileURLToPath(url), "utf8")), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React },
    }).outputText, shortCircuit: true };
    return next(url, context);
  },
});


const baseline = "89d13bd30000968f8b59294c28609b2d8bb40473";
const headSource = (file: string) => execFileSync("git", ["show", baseline + ":" + file]).toString();
const {default:Page}=await import(pathToFileURL(path.resolve("app/checkout/page.tsx")).href);
const {default:BaselinePage}=await import(pathToFileURL(path.resolve("app/checkout/page.tsx")).href+"?baseline");
const {default:Protocol}=await import(pathToFileURL(path.resolve("components/commerce/ProtocolV1Checkout.tsx")).href);
const shared=await import(pathToFileURL(path.resolve("components/commerce/CheckoutPresentation.tsx")).href);
for(const component of Object.values(shared)) pureComponents.add(component as Function);
const {coffeeCheckoutItems,validateUnifiedCartItem}=await import("../lib/commerceCart");
const coffee={domain:"coffee" as const,productId:"coffee-a",variantId:"beans-a",slug:"coffee-a",name:"Coffee",optionLabel:"半磅咖啡豆",optionDetail:"227g",unitPrice:700,quantity:1,quantityLimit:20,coffeeOptions:{customRoast:false}};
const store={domain:"store" as const,productId:"store-a",variantId:"default" as const,slug:"store-a",name:"Store",unitPrice:1000,quantity:1};
const gift={...store,productId:"gift-a",slug:"gift-a",name:"Gift"};
const rules={
 pickup:{earliestStandardDate:"2026-10-25",earliestCustomRoastDate:"2026-10-28",blockedDates:[]},
 shipping:{homeDeliveryShippingFee:80,homeDeliveryCodFee:25},
 payment:{atmTransfer:{configured:false,bankName:"",bankCode:"",branchName:"",accountName:"",accountNumber:"",instructions:"",bankbookImageUrl:null,showBankbookImageAtCheckout:false}},
 openingYearFreeShipping:{enabled:false,startDate:"",endDate:"",shippingMethods:[]}
};
function flow(pageFn=Page){const page=pageFn() as Element;return ((page.props.children as Element).type as Function)() as Element;}
function coffeeRender(pageFn=Page,patch:Record<number,any>={}){
 slots=[];cursor=0;cart={items:[coffee],subtotal:700,ready:true,getCoffeeCheckoutItems:()=>coffeeCheckoutItems([coffee])};
 const Component=flow(pageFn).type as ()=>Element;Component();slots[4]={displayName:"Member"};slots[5]=true;
 Object.assign(slots,patch);
 const render=()=>{cursor=0;return Component();};return {render,tree:render()};
}
function protocolRender(items:readonly any[],patch:Record<number,any>={}){
 slots=[];cursor=0;cart={items,getProtocolV1CheckoutItems:()=>items};
 assert.equal(flow().type,Protocol);Protocol();slots[5]={kind:"GUEST"};slots[6]=structuredClone(rules);Object.assign(slots,patch);
 const render=()=>{cursor=0;return Protocol();};return {render,tree:render()};
}
function checkbox(tree:any){return find(tree,e=>e.type==="input"&&e.props.type==="checkbox"&&Object.hasOwn(e.props,"aria-disabled"));}
function functionNode(source:string,name:string){
 const ast=ts.createSourceFile("fixture.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let result:ts.FunctionDeclaration|undefined;
 function visit(node:ts.Node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)result=node;ts.forEachChild(node,visit);}
 visit(ast);assert.ok(result,name);return {node:result,ast};
}
function namedFunction(source:string,name:string){const {node,ast}=functionNode(source,name);return node.getText(ast).replace(/\r\n/g,"\n");}
function beforePresentation(source:string,name:string){
 const {node,ast}=functionNode(source,name);
 return node.body!.statements.filter(n=>!ts.isReturnStatement(n) && !(ts.isFunctionDeclaration(n) && n.name?.text==="requestCheckoutItemRemoval")).map(n=>n.getText(ast).replace(/\r\n/g,"\n")).join("\n");
}
// Evaluate only our pure shared components; preserve all existing interactive components as opaque children.
function uiShape(value:any):any[]{
 if(Array.isArray(value))return value.flatMap(uiShape);
 if(value==null||typeof value==="boolean")return [];
 if(!React.isValidElement(value))return [value];
 const e=value as Element;
 if(e.type===React.Fragment)return uiShape(e.props.children);
 if(e.type==="dialog" && String(e.props["aria-labelledby"]).startsWith("checkout-remove-")) return [];
 if(typeof e.type==="function"&&pureComponents.has(e.type))return uiShape((e.type as Function)(e.props));
 const props=Object.fromEntries(Object.entries(e.props).filter(([k])=>k!=="children").map(([k,v])=>[k,typeof v==="function"?"[handler]":v]));
 return [{type:typeof e.type==="string"?e.type:(e.type as Function).name,props,children:uiShape(e.props.children)}];
}
try{
 for(const [label,patch] of [
  ["eligible member",{}],["guest",{4:null}],["home ATM",{3:"home_delivery",11:"atm_transfer"}],
  ["home COD",{3:"home_delivery",11:"cash_on_delivery"}],["studio",{3:"studio_pickup"}],
  ["zero credit",{16:{availableBalance:0,maximumUsable:0,minimumPayable:0}}],
  ["usable credit",{16:{availableBalance:200,maximumUsable:100,minimumPayable:0}}],
  ["subscription selected",{12:true}]
 ] as const)check("Coffee exact baseline rendered structure: "+label,()=>{
  const actual=uiShape(coffeeRender(Page,patch).tree);
  const expected=uiShape(coffeeRender(BaselinePage,patch).tree);
  assert.deepEqual(actual,expected);
 });
 check("Coffee valid delivery retains selectable original subscription checkbox",()=>{
  const c=coffeeRender();assert.equal(checkbox(c.tree).props["aria-disabled"],false);
  checkbox(c.tree).props.onChange({target:{checked:true}});
  assert.equal(checkbox(c.render()).props.checked,true);
  assert.ok(elements(c.render()).some(e=>e.type==="strong"&&e.props.children==="定期配送設定"));
 });
 check("Coffee home-delivery ATM retains original restriction and exact explanation",()=>{
  const c=coffeeRender(Page,{3:"home_delivery",11:"atm_transfer"});
  assert.equal(checkbox(c.tree).props["aria-disabled"],true);
  checkbox(c.tree).props.onChange({target:{checked:true}});
  const tree=c.render();assert.equal(checkbox(tree).props.checked,false);
  assert.equal(find(tree,e=>e.props.id==="subscription-atm-block-title").props.children,"ATM 轉帳無法使用定期配送");
  assert.equal(elements(tree).some(e=>e.props.children==="了解原因"),false);
 });
 check("Coffee shared home-delivery callback preserves clearing subscription and address prefill",()=>{
  const c=coffeeRender(Page,{12:true,6:"Owner",7:"0912345678"});
  find(c.tree,e=>e.type==="input"&&e.props.value==="home_delivery").props.onChange();
  assert.equal(slots[3],"home_delivery");assert.equal(slots[12],false);
  assert.equal(slots[10].recipientName,"Owner");assert.equal(slots[10].phone,"0912345678");
 });
 check("Coffee credit positive-only visibility remains unchanged",()=>{
  for(const [balance,visible] of [[0,false],[200,true]] as const){
   const tree=coffeeRender(Page,{16:{availableBalance:balance,maximumUsable:100,minimumPayable:0}}).tree;
   assert.equal(elements(tree).some(e=>e.props.copyKey==="credit.checkout.title"),visible);
  }
 });
 for(const [name,items] of [["Store",[store]],["Gift",[gift]],["Coffee+Store",[coffee,store]],["Coffee+Gift",[coffee,gift]]] as const){
  check(name+" uses canonical Store classification and cannot select subscription",()=>{
   items.forEach(item=>assert.deepEqual(validateUnifiedCartItem(item),item));
   const {tree}=protocolRender(items);assert.throws(()=>coffeeCheckoutItems(items));
   find(tree,e=>e.props.role==="status"&&e.props.children==="此訂單無法使用定期配送");
   assert.equal(elements(tree).some(e=>e.type==="input"&&e.props.type==="checkbox"),false);
   assert.equal(find(tree,e=>e.type==="h1").props.children,"選擇配送方式");
   const headings=elements(tree).filter(e=>e.type==="h2").map(e=>e.props.children);
   assert.ok(headings.includes("訂單摘要"));assert.equal(headings.includes("本次商品"),false);
   assert.ok(headings.includes("取貨方式"));assert.ok(headings.includes("從這次開始定期配送"));
   const summary=find(tree,e=>e.type==="aside");
   assert.equal(summary.props.className,"checkout-summary");
   const summaryItems=elements(summary).filter(e=>e.props.className==="summary-item");
   assert.equal(summaryItems.length,items.length);
   assert.ok(items.every(item=>elements(summary).some(e=>Array.isArray(e.props.children)&&e.props.children.includes(item.name))));
   assert.equal(elements(tree).some(e=>e.props.copyKey?.startsWith("credit.")),false);
   assert.equal(elements(tree).some(e=>e.props.name==="requestedCredit"),false);
   assert.equal(elements(tree).some(e=>e.props.className==="field-help"&&String(e.props.children).includes("不適用定期配送")),false);
   const dialog=find(tree,e=>e.type==="dialog");
   assert.equal(dialog.props["aria-labelledby"],"store-subscription-title");
   assert.equal(dialog.props["aria-describedby"],"store-subscription-copy");
   assert.deepEqual(elements(dialog).filter(e=>e.type==="p").map(e=>e.props.children),[
    "定期配送目前適用於指定咖啡商品。",
    "這筆訂單中包含禮盒、器具或其他一般商品，因此本次無法使用定期配送。",
    items.some(item=>item.domain==="coffee") ? "若將符合條件的咖啡商品另外下單，即可依原有規則選擇定期配送。" : "您仍可以使用目前的方式正常完成本次訂單。"]);
   assert.equal(find(dialog,e=>e.type==="h2").props.children,"關於定期配送");
   let opened=0,closed=0;dialog.props.ref.current={showModal(){opened++;},close(){closed++;}};
   find(tree,e=>e.type==="button"&&e.props.children==="了解原因").props.onClick();
   find(dialog,e=>e.type==="button"&&e.props.children==="我知道了").props.onClick();
   assert.equal(opened,1);assert.equal(closed,1);
  });
 }
 check("Store presentation retains actual shipping/payment selection and quote",()=>{
  const c=protocolRender([store]);
  const summary=()=>find(c.render(),e=>e.type==="aside");
  assert.deepEqual(find(summary(),e=>e.props.className==="summary-total").props.children[1].props.children,"NT$ 1,060");
  find(c.tree,e=>e.type==="input"&&e.props.value==="home_delivery").props.onChange();
  const home=c.render();
  assert.equal(find(home,e=>e.type==="input"&&e.props.value==="atm_transfer").props.disabled,true);
  assert.equal(find(home,e=>e.type==="input"&&e.props.value==="cash_on_delivery").props.checked,true);
  assert.equal(find(summary(),e=>e.props.className==="summary-total").props.children[1].props.children,"NT$ 1,105");
  find(home,e=>e.type==="input"&&e.props.value==="studio_pickup").props.onChange();
  assert.equal(find(summary(),e=>e.props.className==="summary-total").props.children[1].props.children,"NT$ 1,000");
  assert.equal(find(c.render(),e=>e.props.name==="pickupDate").props.min,rules.pickup.earliestStandardDate);
 });
 check("configured Store ATM remains selectable and state stays separate from Coffee",()=>{
  const fixture=structuredClone(rules);fixture.payment.atmTransfer.configured=true;
  const c=protocolRender([gift],{6:fixture,10:"home_delivery"});
  const atm=find(c.tree,e=>e.type==="input"&&e.props.value==="atm_transfer");
  assert.equal(atm.props.disabled,false);atm.props.onChange();
  assert.equal(find(c.render(),e=>e.type==="input"&&e.props.value==="atm_transfer").props.checked,true);
 });
 check("Store member remains credit-ineligible in shared presentation",()=>{
  const {tree}=protocolRender([gift],{5:{kind:"MEMBER",member:{displayName:"Owner"}}});
  assert.ok(elements(tree).some(e=>e.props.children==="已帶入會員常用資料，請確認本次收件資訊。"));
  assert.equal(elements(tree).some(e=>e.props.copyKey?.startsWith("credit.")),false);
 });
 check("Store checking/errors still fail closed",()=>{
  for(const patch of [{6:null},{4:true},{5:{kind:"ERROR"}},{7:true},{14:true}]){
   const {tree}=protocolRender([store],patch);
   assert.equal(find(tree,e=>e.type==="button"&&e.props.type==="submit").props.disabled,true);
  }
 });
 check("recoverable attempt remains frozen without editable form or subscription controls",()=>{
  slots=[];cursor=0;cart={items:[gift],getProtocolV1CheckoutItems:()=>[gift],recoverableProtocolV1Attempt:true};
  const tree=Protocol();assert.equal(elements(tree).some(e=>e.type==="dialog"||e.type==="form"),false);
  assert.equal(find(tree,e=>e.type==="h1").props.children,"確認此筆結帳嘗試");
  find(tree,e=>e.type==="button"&&e.props.children==="重試同一筆訂單");
 });
 check("Coffee logic before presentation remains exactly baseline",()=>{
  const file="app/checkout/page.tsx";
  assert.equal(beforePresentation(readFileSync(file,"utf8"),"CoffeeCheckout"),beforePresentation(headSource(file),"CoffeeCheckout"));
  assert.equal(namedFunction(readFileSync(file,"utf8"),"CheckoutFlow"),namedFunction(headSource(file),"CheckoutFlow"));
 });
 check("Store logic before presentation remains exactly baseline plus dialog ref only",()=>{
  const file="components/commerce/ProtocolV1Checkout.tsx";
  const current=readFileSync(file,"utf8").replace(/  const storeSubscriptionDialog = useRef<HTMLDialogElement>\(null\);\r?\n/,"").replace("recoverableProtocolV1Attempt, updateQuantity, removeItem }","recoverableProtocolV1Attempt }");
  assert.equal(beforePresentation(current,"ProtocolV1Checkout"),beforePresentation(headSource(file),"ProtocolV1Checkout"));
  assert.equal(namedFunction(current,"send"),namedFunction(headSource(file),"send"));
 });
 check("backend, cart, credit, rewards, subscription engines and real data remain untouched",()=>{
  execFileSync("git",["diff","--exit-code",baseline,"--","lib","app/api","data","public/data","app/globals.css","components/commerce/CartProvider.tsx","components/commerce/CommerceCheckoutBoundary.tsx"]);
  const admission=readFileSync("lib/commerceCheckoutAdmission.ts","utf8");
  assert.match(admission,/hasStore && subscriptionPresent/);assert.match(admission,/STORE_SUBSCRIPTION_NOT_SUPPORTED/);
  assert.match(admission,/hasStore && \(requestedCredit > 0 \|\| creditApplied > 0\)/);
 });
 check("branded confirmation delegates canonical removal and preserves empty-cart destination",()=>{
  const source=readFileSync("components/commerce/CheckoutPresentation.tsx","utf8");
  assert.doesNotMatch(source,/window\.confirm|window\.alert/);
  assert.match(namedFunction(source,"removeCheckoutItem"),/removeItem\(key\);\s*if \(items.length === 1\) router.push\("\/works"\)/);
  assert.match(namedFunction(readFileSync("app/checkout/page.tsx","utf8"),"requestCheckoutItemRemoval"),/removeCheckoutItem\(key, items, removeItem, router\)/);
  assert.ok(source.includes("if (disabled || !dialog.current?.open) return;"));
 });
 console.log(checks+" PASS / 0 FAIL");
}finally{registration.deregister();}
