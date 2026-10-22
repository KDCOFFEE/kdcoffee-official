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
    const i = cursor++, bank = slots;
    if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
    return [bank[i], (value: any) => { bank[i] = typeof value === "function" ? value(bank[i]) : value; }];
  },
  useRef: (initial: any) => { const i = cursor++; return slots[i] ??= { current: initial }; },
  useEffect: () => {},
  useMemo: (fn: Function) => fn(),
  useCallback: (fn: Function) => fn,
};
(globalThis as any).__purchaseModeHooks = hooks;
(globalThis as any).__purchaseModeCart = () => cart;
const reactURL = pathToFileURL(path.resolve("node_modules/react/index.js")).href;
const { registerHooks } = nodeModule as any;
const registration = registerHooks({
  resolve(specifier: string, context: { parentURL?: string }, next: any) {
    if (specifier.endsWith(".module.css")) return { url: "data:text/javascript,export default new Proxy({}, {get:(_,key)=>String(key)});", shortCircuit: true };
    if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
    if (specifier === "react" && /\/(?:app\/checkout\/page|components\/commerce\/(?:ProtocolV1Checkout|CartProvider|CheckoutPresentation))\.tsx(?:\?baseline)?$/.test(context.parentURL || "")) {
      return { url: "data:text/javascript," + encodeURIComponent("export * from " + JSON.stringify(reactURL) + ";export {default} from " + JSON.stringify(reactURL) + ";export const useState=(v)=>globalThis.__purchaseModeHooks.useState(v);export const useRef=(v)=>globalThis.__purchaseModeHooks.useRef(v);export const useEffect=()=>{};export const useMemo=(fn)=>globalThis.__purchaseModeHooks.useMemo(fn);export const useCallback=(fn)=>globalThis.__purchaseModeHooks.useCallback(fn);"), shortCircuit: true };
    }
    if (specifier.endsWith("CartProvider") && /\/(?:app\/checkout\/page|components\/commerce\/(?:ProtocolV1Checkout|CommerceCheckoutBoundary))\.tsx(?:\?baseline)?$/.test(context.parentURL || "")) {
      return { url: "data:text/javascript,export const useCart=()=>globalThis.__purchaseModeCart();", shortCircuit: true };
    }
    if (specifier === "next/navigation") return { url: "data:text/javascript,export const useRouter=()=>({push:(url)=>globalThis.__summaryNavigate(url)});export const usePathname=()=>'/checkout';", shortCircuit: true };
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



const {default:Page}=await import(pathToFileURL(path.resolve("app/checkout/page.tsx")).href);
const {default:Protocol}=await import(pathToFileURL(path.resolve("components/commerce/ProtocolV1Checkout.tsx")).href);
const {default:Boundary}=await import(pathToFileURL(path.resolve("components/commerce/CommerceCheckoutBoundary.tsx")).href);
const {CartProvider}=await import(pathToFileURL(path.resolve("components/commerce/CartProvider.tsx")).href);
const shared=await import(pathToFileURL(path.resolve("components/commerce/CheckoutPresentation.tsx")).href);
for(const component of Object.values(shared))pureComponents.add(component as Function);
const {cartLineKey}=await import("../lib/commerceCart");
const {CURRENT_CART_STORAGE_KEY,readCartStorage}=await import("../lib/commerceCartStorage");
const coffee={domain:"coffee" as const,productId:"coffee-a",variantId:"beans-a",slug:"coffee-a",name:"Coffee",optionLabel:"半磅咖啡豆",optionDetail:"227g",unitPrice:700,quantity:1,quantityLimit:5,coffeeOptions:{customRoast:false}};
const store={domain:"store" as const,productId:"store-a",variantId:"default" as const,slug:"store-a",name:"Store",unitPrice:1000,quantity:1,quantityLimit:5};
const gift={...store,productId:"gift-a",slug:"gift-a",name:"Gift"};
const rules={
 pickup:{earliestStandardDate:"2026-10-25",earliestCustomRoastDate:"2026-10-28",blockedDates:[]},
 shipping:{homeDeliveryShippingFee:80,homeDeliveryCodFee:25,subscriptionFreeShipping:false,subscriptionShippingFee:60,sevenElevenShippingFee:60,subscriptionShippingDiscount:0},
 payment:{atmTransfer:{configured:false,bankName:"",bankCode:"",branchName:"",accountName:"",accountNumber:"",instructions:"",bankbookImageUrl:null,showBankbookImageAtCheckout:false}},
 openingYearFreeShipping:{enabled:false,startDate:"",endDate:"",shippingMethods:[]},
 subscription:{discountPercent:100,intervalsDays:[30],customCycleEnabled:false,customCycleMinDays:7,customCycleMaxDays:365,earliestDate:"2026-10-25"},
 credit:{uiMode:"use-or-not",automaticallyUseMaximum:false},money:{roundingMode:"round-down"}
};
const storageMap=new Map<string,string>();
const storage={getItem:(key:string)=>storageMap.get(key)??null,setItem:(key:string,value:string)=>{storageMap.set(key,value);},removeItem:(key:string)=>{storageMap.delete(key);}};
let providerSlots:any[]=[],checkoutSlots:any[]=[],activeComponent:Function|undefined;
let nativeDialogCalls=0,navigations:string[]=[],networkCalls=0;
(globalThis as any).__summaryNavigate=(url:string)=>navigations.push(url);
const oldWindow=Object.getOwnPropertyDescriptor(globalThis,"window"),oldFetch=globalThis.fetch;
Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:storage,sessionStorage:storage,confirm:()=>{nativeDialogCalls++;throw new Error("Native confirmation forbidden");}}});
globalThis.fetch=async()=>{networkCalls++;throw new Error("Unexpected network call in isolated summary test");};
function renderProvider(){
 slots=providerSlots;cursor=0;
 cart=(CartProvider({children:null}) as Element).props.value;
 return cart;
}
async function setup(items:readonly any[]){
 providerSlots=[];checkoutSlots=[];activeComponent=undefined;storageMap.clear();navigations=[];
 storage.setItem(CURRENT_CART_STORAGE_KEY,JSON.stringify({version:16,items:structuredClone(items),migration:{completed:true,unresolved:[],notices:[]}}));
 await renderProvider().retryMigration();
 renderProvider();assert.equal(cart.ready,true);
 return renderCheckout();
}
function renderCheckout(){
 renderProvider();slots=checkoutSlots;cursor=0;
 const page=Page() as Element;
 const Component=(((page.props.children as Element).type as Function)() as Element).type as Function;
 if(activeComponent!==Component){checkoutSlots=[];slots=checkoutSlots;cursor=0;activeComponent=Component;}
 Component();
 if(Component===Protocol){slots[5]={kind:"MEMBER",member:{displayName:"Owner"}};slots[6]=structuredClone(rules);}
 else{slots[4]={displayName:"Owner"};slots[5]=true;slots[15]=structuredClone(rules);}
 cursor=0;return expandUI(Component());
}
function expandUI(value:any):any {
 if(Array.isArray(value))return value.map(expandUI);
 if(!React.isValidElement(value))return value;
 const e=value as Element;
 if(typeof e.type==="function"&&pureComponents.has(e.type))return expandUI((e.type as Function)(e.props));
 if(e.type==="dialog" && e.props.ref && !e.props.ref.current){
  e.props.ref.current={open:false,showModal(){this.open=true;},close(){this.open=false;}};
 }
 return React.cloneElement(e,{children:expandUI(e.props.children)});
}
const text=(value:any):string=>Array.isArray(value)?value.map(text).join(""):React.isValidElement(value)?text((value as Element).props.children):value==null||typeof value==="boolean"?"":String(value);
const control=(tree:any,item:any,verb:string)=>find(tree,e=>e.type==="button"&&e.props["aria-label"]===verb+" "+item.name+" 數量");
const row=(tree:any,item:any)=>find(tree,e=>e.props.className==="summary-item"&&text(e).includes(item.name));
const del=(tree:any,item:any)=>find(row(tree,item),e=>e.props.className==="cart-remove-button");
function click(button:Element){assert.notEqual(button.props.disabled,true);button.props.onClick();}
function assertState(item:any,quantity:number){
 renderProvider();assert.equal(cart.items.find((v:any)=>cartLineKey(v)===cartLineKey(item))?.quantity,quantity);
 const saved=readCartStorage(storage);assert.equal(saved.kind,"current");
 if(saved.kind==="current")assert.equal(saved.envelope.items.find(v=>cartLineKey(v)===cartLineKey(item))?.quantity,quantity);
}
function assertTotals(tree:any,subtotal:number,total:number){
 const summary=find(tree,e=>e.type==="aside");assert.equal(find(summary,e=>e.type==="h2").props.children,"訂單摘要");
 const subtotalLine=find(summary,e=>e.props.className==="summary-line"&&text(e).startsWith("商品小計"));
 assert.equal(text(subtotalLine),"商品小計NT$ "+subtotal.toLocaleString("zh-TW"));
 const totalLine=find(summary,e=>e.props.className==="summary-total");
 assert.ok(text(totalLine).endsWith("NT$ "+total.toLocaleString("zh-TW")));
 assert.equal(summary.props.className,"checkout-summary");
}

function removal(tree:any,item:any){return find(tree,e=>e.type==="dialog"&&e.props["aria-labelledby"]==="checkout-remove-"+encodeURIComponent(cartLineKey(item))+"-title");}
function action(dialog:Element,label:string){return find(dialog,e=>e.type==="button"&&e.props.children===label);}
function openDelete(tree:any,item:any){
 const before=storage.getItem(CURRENT_CART_STORAGE_KEY);click(del(tree,item));
 const dialog=removal(tree,item);assert.equal(dialog.props.ref.current.open,true);
 assert.equal(storage.getItem(CURRENT_CART_STORAGE_KEY),before);return dialog;
}
function confirmDelete(tree:any,item:any){const dialog=openDelete(tree,item);click(action(dialog,"確認移除"));}
const unavailable=(tree:any)=>find(tree,e=>e.props.role==="status"&&e.props.children==="此訂單無法使用定期配送");
try{
 for(const [label,item] of [["Coffee",coffee],["Store",store],["Gift",gift]] as const){
  let tree=await setup([item]);
  check(label+" + and normal - use actual provider without opening removal dialog",()=>{
   click(control(tree,item,"增加"));tree=renderCheckout();assertState(item,2);
   assert.equal(removal(tree,item).props.ref.current.open,false);
   assert.ok(text(row(tree,item)).includes("NT$ "+(item.unitPrice*2).toLocaleString("zh-TW")));
   assertTotals(tree,item.unitPrice*2,item.domain==="coffee"?1460:2000);
   click(control(tree,item,"減少"));tree=renderCheckout();assertState(item,1);
   assert.equal(removal(tree,item).props.ref.current.open,false);assertTotals(tree,item.unitPrice,item.unitPrice+60);
  });
  check(label+" quantity-one decrement opens last-line branded confirmation before mutation",()=>{
   const before=storage.getItem(CURRENT_CART_STORAGE_KEY);click(control(tree,item,"減少"));
   const dialog=removal(tree,item);assert.equal(dialog.props.ref.current.open,true);
   assert.ok(text(dialog).includes("這是訂單中的最後一項商品。"));
   assert.ok(text(dialog).includes("移除後購物車將變成空的，您可以再回到作品區或商店重新選購。"));
   assert.equal(storage.getItem(CURRENT_CART_STORAGE_KEY),before);
   click(action(dialog,"保留商品"));assert.equal(dialog.props.ref.current.open,false);
   assert.equal(storage.getItem(CURRENT_CART_STORAGE_KEY),before);assertState(item,1);assert.deepEqual(navigations,[]);
  });
  check(label+" final-item confirmation empties canonical cart and keeps /works destination",()=>{
   const dialog=openDelete(tree,item);click(action(dialog,"確認移除"));
   renderProvider();assert.equal(cart.items.length,0);assert.equal(cart.checkoutEligibility,"EMPTY");
   const saved=readCartStorage(storage);assert.equal(saved.kind,"current");if(saved.kind==="current")assert.equal(saved.envelope.items.length,0);
   assert.deepEqual(navigations,["/works"]);
   click(action(dialog,"確認移除"));assert.deepEqual(navigations,["/works"]); // Closed modal cannot apply twice.
   const empty=Boundary({children:null});assert.equal(find(empty,e=>e.type==="h1").props.children,"購物車目前是空的");
  });
 }
 let three=await setup([coffee,store,gift]);
 check("three lines: deleting middle line requests confirmation; cancel is unchanged",()=>{
  const before=storage.getItem(CURRENT_CART_STORAGE_KEY),dialog=openDelete(three,store);
  assert.ok(text(dialog).includes("這項商品將從您的訂單中移除。"));
  assert.ok(text(dialog).includes("確認後，訂單金額與相關優惠將依目前購物車內容重新計算。"));
  assert.equal(text(dialog).includes("這是訂單中的最後一項商品。"),false);
  click(action(dialog,"保留商品"));assert.equal(dialog.props.ref.current.open,false);
  assert.equal(storage.getItem(CURRENT_CART_STORAGE_KEY),before);assert.deepEqual(navigations,[]);
 });
 check("three lines: confirmed middle removal preserves other two and Store gate",()=>{
  confirmDelete(three,store);three=renderCheckout();assert.equal(cart.items.length,2);
  assertState(coffee,1);assertState(gift,1);assertTotals(three,1700,1700);unavailable(three);
  assert.deepEqual(navigations,[]);
 });
 let minimum=await setup([coffee,store,gift]);
 check("non-final quantity-one minus also confirms instead of persisting zero",()=>{
  const before=storage.getItem(CURRENT_CART_STORAGE_KEY);click(control(minimum,store,"減少"));
  const dialog=removal(minimum,store);assert.equal(dialog.props.ref.current.open,true);
  assert.equal(storage.getItem(CURRENT_CART_STORAGE_KEY),before);
  click(action(dialog,"確認移除"));minimum=renderCheckout();
  assert.equal(cart.items.length,2);assertState(coffee,1);assertState(gift,1);assertTotals(minimum,1700,1700);
 });
 for(const [label,item] of [["Coffee+Store",store],["Coffee+Gift",gift]] as const){
  let tree=await setup([coffee,item]);
  check(label+" lines independently editable with actual provider storage",()=>{
   click(control(tree,coffee,"增加"));tree=renderCheckout();assertState(coffee,2);assertState(item,1);
   click(control(tree,item,"增加"));tree=renderCheckout();assertState(item,2);assertState(coffee,2);assertTotals(tree,3400,3400);
  });
  check(label+" every-line Coffee deletion confirms and leaves Store restriction",()=>{
   const before=storage.getItem(CURRENT_CART_STORAGE_KEY);const dialog=openDelete(tree,coffee);
   click(action(dialog,"保留商品"));assert.equal(storage.getItem(CURRENT_CART_STORAGE_KEY),before);
   confirmDelete(tree,coffee);tree=renderCheckout();assert.equal(cart.items.length,1);assertState(item,2);
   assertTotals(tree,2000,2000);unavailable(tree);assert.equal(activeComponent,Protocol);
  });
  tree=await setup([coffee,item]);
  check(label+" confirmed Store/Gift removal re-evaluates Coffee eligibility",()=>{
   confirmDelete(tree,item);tree=renderCheckout();assert.equal(cart.items.length,1);assertState(coffee,1);
   assert.equal(cart.checkoutEligibility,"ELIGIBLE");assert.deepEqual(navigations,[]);assertTotals(tree,700,760);
   assert.notEqual(activeComponent,Protocol);
   const subscription=find(tree,e=>e.type==="input"&&e.props.type==="checkbox"&&Object.hasOwn(e.props,"aria-disabled"));
   assert.equal(subscription.props["aria-disabled"],false);subscription.props.onChange({target:{checked:true}});
   assert.equal(find(renderCheckout(),e=>e.type==="input"&&Object.hasOwn(e.props,"aria-disabled")).props.checked,true);
  });
 }
 for(const [label,items,mixed] of [["Store-only",[store],false],["Gift-only",[gift],false],["Coffee+Store",[coffee,store],true],["Coffee+Gift",[coffee,gift],true]] as const){
  const tree=await setup(items);
  check(label+" independent unavailable message and correct explanation without invented savings",()=>{
   unavailable(tree);assert.equal(elements(tree).some(e=>e.type==="input"&&e.props.type==="checkbox"),false);
   const dialog=find(tree,e=>e.type==="dialog"&&e.props["aria-labelledby"]==="store-subscription-title");
   const before=storage.getItem(CURRENT_CART_STORAGE_KEY);
   click(find(tree,e=>e.type==="button"&&e.props.children==="了解原因"));assert.equal(dialog.props.ref.current.open,true);
   assert.ok(text(dialog).includes("定期配送目前適用於指定咖啡商品。"));
   assert.ok(text(dialog).includes("這筆訂單中包含禮盒、器具或其他一般商品，因此本次無法使用定期配送。"));
   assert.equal(text(dialog).includes("想使用定期配送？"),mixed);
   assert.equal(text(dialog).includes("若將符合條件的咖啡商品另外下單，即可依原有規則選擇定期配送。"),mixed);
   assert.equal(text(dialog).includes("您仍可以使用目前的方式正常完成本次訂單。"),!mixed);
   assert.doesNotMatch(text(dialog),/NT\$|節省|折/);
   click(action(dialog,"我知道了"));assert.equal(dialog.props.ref.current.open,false);
   assert.equal(storage.getItem(CURRENT_CART_STORAGE_KEY),before);assert.deepEqual(navigations,[]);
  });
 }
 let focusTree=await setup([coffee,store]);
 check("confirmed removal restores lost focus to remaining summary without stealing retained focus",()=>{
  let frame:FrameRequestCallback|undefined,focused=0;
  const previous=Object.getOwnPropertyDescriptor(globalThis,"document");
  const body={},retained={};const doc={body,activeElement:body,querySelector:(selector:string)=>{assert.equal(selector,"aside.checkout-summary button:not(:disabled)");return {focus:()=>{focused++;}};}};
  Object.defineProperty(globalThis,"document",{configurable:true,value:doc});
  window.requestAnimationFrame=fn=>{frame=fn;return 1;};
  try{
   confirmDelete(focusTree,store);focusTree=renderCheckout();assertState(coffee,1);
   assert.ok(frame);frame(0);assert.equal(focused,1);
   doc.activeElement=retained;frame(0);assert.equal(focused,1);
  }finally{
   delete (window as any).requestAnimationFrame;
   if(previous)Object.defineProperty(globalThis,"document",previous);else delete (globalThis as any).document;
  }
 });
 let atmTree=await setup([coffee]);
 check("Coffee ATM explanation and COD-switch suggestion remain separate and functional",()=>{
  checkoutSlots[3]="home_delivery";checkoutSlots[11]="atm_transfer";atmTree=renderCheckout();
  const checkbox=find(atmTree,e=>e.type==="input"&&Object.hasOwn(e.props,"aria-disabled"));
  assert.equal(checkbox.props["aria-disabled"],true);checkbox.props.onChange({target:{checked:true}});
  atmTree=renderCheckout();
  assert.equal(find(atmTree,e=>e.props.id==="subscription-atm-block-title").props.children,"ATM 轉帳無法使用定期配送");
  assert.ok(text(atmTree).includes("ATM 轉帳僅提供本次單次宅配訂單。為避免後續每期付款與配送中斷，宅配定期配送目前固定使用「貨到付款」。"));
  click(find(atmTree,e=>e.type==="button"&&text(e)==="改用貨到付款並啟用定期配送"));
  atmTree=renderCheckout();assert.equal(checkoutSlots[11],"cash_on_delivery");assert.equal(checkoutSlots[12],true);
  assert.equal(find(atmTree,e=>e.type==="input"&&Object.hasOwn(e.props,"aria-disabled")).props["aria-disabled"],false);
  assert.equal(elements(atmTree).some(e=>e.props.children==="此訂單無法使用定期配送"),false);
 });
 let limited=await setup([{...gift,quantityLimit:2}]);
 check("existing inventory bound and invalid-zero rejection remain unchanged",()=>{
  click(control(limited,gift,"增加"));limited=renderCheckout();assert.equal(control(limited,gift,"增加").props.disabled,true);
  assert.equal(cart.updateQuantity(cartLineKey(gift),0),false);assertState(gift,2);cart.updateQuantity(cartLineKey(gift),99);assertState(gift,2);
 });
 const secondCoffee={...coffee,coffeeOptions:{customRoast:false,preparation:"咖啡粉"}};
 let siblings=await setup([{...coffee,quantityLimit:3},{...secondCoffee,quantityLimit:3}]);
 check("shared SKU inventory remains canonical across separate coffee lines",()=>{
  click(control(siblings,coffee,"增加"));siblings=renderCheckout();
  const plus=elements(siblings).filter(e=>e.type==="button"&&e.props["aria-label"]==="增加 Coffee 數量");
  assert.equal(plus.length,2);assert.ok(plus.every(e=>e.props.disabled===true));assertState(coffee,2);assertState(secondCoffee,1);
 });
 let locked=await setup([store]);
 check("dispatch/storage failure blocks cart buttons and modal confirmation",()=>{
  for(const index of [14,4]){
   const dialog=openDelete(locked,store);checkoutSlots[index]=true;locked=renderCheckout();
   assert.equal(control(locked,store,"增加").props.disabled,true);
   assert.equal(control(locked,store,"減少").props.disabled,true);assert.equal(del(locked,store).props.disabled,true);
   const before=storage.getItem(CURRENT_CART_STORAGE_KEY);
   action(removal(locked,store),"確認移除").props.onClick();assert.equal(storage.getItem(CURRENT_CART_STORAGE_KEY),before);
   dialog.props.ref.current.close();checkoutSlots[index]=false;locked=renderCheckout();
  }
 });
 check("protected engines/data unchanged; no native confirm, network, or invented pricing",()=>{
  execFileSync("git",["diff","--exit-code","89d13bd30000968f8b59294c28609b2d8bb40473","--","lib","app/api","data","public/data","components/commerce/CartProvider.tsx","app/cart/page.tsx"]);
  const ui=readFileSync("components/commerce/CheckoutPresentation.tsx","utf8")+readFileSync("components/commerce/ProtocolV1Checkout.tsx","utf8");
  assert.doesNotMatch(ui,/window\.confirm|window\.alert|previewMembershipPrice|applyPercentage|discountPercent/);
  assert.equal(networkCalls,0);assert.equal(nativeDialogCalls,0);
 });
 console.log(checks+" PASS / 0 FAIL");
}finally{
 registration.deregister();globalThis.fetch=oldFetch;
 if(oldWindow)Object.defineProperty(globalThis,"window",oldWindow);else delete (globalThis as any).window;
}
