"use client";
import { useEffect, useState } from "react";
import { beanFields, type BeanField, type LineAutoReplySettings, type LineReplyResult } from "@/lib/lineAutoReplyTypes";
import styles from "./LineAutoReplyManager.module.css";

type Product = { productId:string; name:string; available:boolean; description:string };
const fieldNames:Record<BeanField,string> = {price:"價格",roast:"焙度",origin:"產地",process:"處理法",flavors:"風味",variety:"品種",altitude:"海拔",status:"供應狀態",productUrl:"商品購買連結"};
const categories = {beanMenu:"豆單",rule:"一般規則",fallback:"未命中預設回覆",noReply:"不回覆"};
function Text({label,value,onChange,max=1000,multiline=false}:{label:string;value:string;onChange:(v:string)=>void;max?:number;multiline?:boolean}) {
  return <label className={styles.field}><span>{label}</span>{multiline?<textarea aria-label={label} value={value} maxLength={max} rows={3} onChange={e=>onChange(e.target.value)}/>:<input aria-label={label} value={value} maxLength={max} onChange={e=>onChange(e.target.value)}/>}</label>;
}
function Toggle({label,value,onChange}:{label:string;value:boolean;onChange:(v:boolean)=>void}) {
  return <label className={styles.toggle}><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/><span>{label}</span></label>;
}
function Mode({value,onChange}:{value:"exact"|"contains";onChange:(v:"exact"|"contains")=>void}) {
  return <label className={styles.field}><span>比對方式</span><select aria-label="比對方式" value={value} onChange={e=>onChange(e.target.value as "exact"|"contains")}><option value="exact">整句完全符合</option><option value="contains">訊息包含關鍵字</option></select></label>;
}
function prepared(settings:LineAutoReplySettings) {
  return {...settings,beanMenu:{...settings.beanMenu,keywords:settings.beanMenu.keywords.map(k=>k.trim()).filter(Boolean)},rules:settings.rules.map(r=>({...r,keywords:r.keywords.map(k=>k.trim()).filter(Boolean)}))};
}
export default function LineAutoReplyManager() {
  const [draft,setDraft]=useState<LineAutoReplySettings|null>(null),[products,setProducts]=useState<Product[]>([]);
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState(""),[dirty,setDirty]=useState(false);
  const [sample,setSample]=useState(""),[result,setResult]=useState<LineReplyResult|null>(null),[selected,setSelected]=useState("");
  async function load() {
    setBusy(true);setError("");
    try {const response=await fetch("/api/admin/line-auto-reply",{cache:"no-store"});const body=await response.json();if(!response.ok)throw new Error(body.error);setDraft(body.settings);setProducts(body.products);setDirty(false);setResult(null);}
    catch {setError("無法讀取設定。請確認登入狀態，或請管理人員檢查設定檔。");} finally {setBusy(false);}
  }
  useEffect(()=>{void load();},[]);
  function change(next:LineAutoReplySettings) {setDraft(next);setDirty(true);setResult(null);setNotice("");}
  if (!draft) return <section className={styles.root}><p role="alert">{error||"正在讀取設定…"}</p><button type="button" disabled={busy} onClick={()=>void load()}>重新讀取</button></section>;
  const settings=draft,menu=settings.beanMenu;
  function updateMenu(patch:Partial<LineAutoReplySettings["beanMenu"]>) {change({...settings,beanMenu:{...menu,...patch}});}
  function updateRule(index:number,patch:Partial<LineAutoReplySettings["rules"][number]>) {change({...settings,rules:settings.rules.map((r,i)=>i===index?{...r,...patch}:r)});}
  function move(kind:"rules"|"products",index:number,direction:number) {
    const rows=kind==="rules"?[...settings.rules]:[...menu.products],target=index+direction;
    if(target<0||target>=rows.length)return;
    [rows[index],rows[target]]=[rows[target],rows[index]];
    if(kind==="rules")change({...settings,rules:(rows as LineAutoReplySettings["rules"]).map((r,i)=>({...r,order:i}))});
    else updateMenu({products:(rows as LineAutoReplySettings["beanMenu"]["products"]).map((r,i)=>({...r,order:i}))});
  }
  async function submit(simulate=false) {
    setBusy(true);setError("");setNotice("");
    try {
      const response=await fetch(simulate?"/api/admin/line-auto-reply/simulate":"/api/admin/line-auto-reply",{method:simulate?"POST":"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(simulate?{message:sample,settings:prepared(settings)}:{expectedRevision:settings.revision,settings:prepared(settings)})});
      const body=await response.json();if(!response.ok)throw new Error(body.error||"操作失敗。");
      if(simulate)setResult(body.result);else{setDraft(body.settings);setDirty(false);setResult(null);setNotice("設定已儲存。");}
    } catch(e){setError(e instanceof Error?e.message:"操作失敗。");}finally{setBusy(false);}
  }
  function ordering(kind:"rules"|"products",index:number,length:number) {
    return <div className={styles.actions}><button type="button" aria-label="向上移動" disabled={index===0} onClick={()=>move(kind,index,-1)}>上移</button><button type="button" aria-label="向下移動" disabled={index===length-1} onClick={()=>move(kind,index,1)}>下移</button></div>;
  }
  return <div className={styles.root}>
    <div className={styles.status}><strong>自動回覆：{settings.enabled?"已啟用":"關閉"}</strong><span>{dirty?"尚有未儲存變更":"已儲存設定"}</span><span>最後更新：{settings.revision?new Date(settings.updatedAt).toLocaleString("zh-TW"):"尚未儲存"}</span></div>
    <p role="status">{notice}</p>{error?<p role="alert" className={styles.error}>{error}</p>:null}
    <fieldset disabled={busy} className={styles.editor}>
      <section><h2>自動回覆總設定</h2><Toggle label="啟用 LINE 自動回覆" value={settings.enabled} onChange={enabled=>change({...settings,enabled})}/><p>關閉時不會自動回覆。一般規則與豆單設定仍會保留。</p></section>
      <section><h2>豆單回覆設定</h2><Toggle label="啟用豆單回覆" value={menu.enabled} onChange={enabled=>updateMenu({enabled})}/>
        <div className={styles.grid}><Mode value={menu.matchMode} onChange={matchMode=>updateMenu({matchMode})}/><Text label="豆單關鍵字（每行一個）" value={menu.keywords.join("\n")} onChange={v=>updateMenu({keywords:v.split("\n")})} max={3030} multiline/>
          <Text label="標題" value={menu.title} onChange={title=>updateMenu({title})} max={200}/><Text label="前言" value={menu.intro} onChange={intro=>updateMenu({intro})} multiline/>
          <Text label="操作與購買說明" value={menu.helpText} onChange={helpText=>updateMenu({helpText})} multiline/><Text label="結尾文字" value={menu.footer} onChange={footer=>updateMenu({footer})} multiline/>
          <Text label="沒有可顯示商品時的回覆（留空則不回覆）" value={menu.emptyStateReply} onChange={emptyStateReply=>updateMenu({emptyStateReply})} max={4500} multiline/>
          <Text label="總連結文字" value={menu.ctaLabel} onChange={ctaLabel=>updateMenu({ctaLabel})} max={100}/><Text label="總連結網址（HTTPS，留空則隱藏）" value={menu.ctaUrl} onChange={ctaUrl=>updateMenu({ctaUrl})} max={2000}/>
          <Text label="商品供應狀態的顯示文字" value={menu.availableText} onChange={availableText=>updateMenu({availableText})} max={100}/>
        </div><h3>商品資訊與顯示名稱</h3><p>勾選要顯示的欄位，並填入客人會看到的名稱。名稱留空時該欄位不顯示；價格旁的幣別可寫在名稱中。</p>
        <div className={styles.grid}>{beanFields.map(key=><div key={key} className={styles.fieldRow}><Toggle label={fieldNames[key]} value={menu.displayFields[key]} onChange={enabled=>updateMenu({displayFields:{...menu.displayFields,[key]:enabled}})}/><Text label={`${fieldNames[key]}的客人顯示名稱`} value={menu.labels[key]} onChange={label=>updateMenu({labels:{...menu.labels,[key]:label}})} max={40}/></div>)}</div>
        <h3>豆單商品與順序</h3><p>只引用現有商品。未公開、暫停購買、售完或沒有可購買庫存的商品會自動略過，價格與庫存由原商品後台管理。</p>
        <div className={styles.actions}><label>加入商品<select aria-label="加入商品" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">請選擇商品</option>{products.filter(p=>!menu.products.some(s=>s.productId===p.productId)).map(p=><option key={p.productId} value={p.productId}>{p.name}{p.available?"":"（目前不顯示）"}</option>)}</select></label>
          <button type="button" disabled={!selected||menu.products.length>=50} onClick={()=>{const p=products.find(p=>p.productId===selected);updateMenu({products:[...menu.products,{productId:selected,enabled:p?.available===true,order:menu.products.length,lineDescriptionOverride:""}]});setSelected("");}}>加入豆單</button></div>
        {menu.products.map((selection,index)=>{const product=products.find(p=>p.productId===selection.productId);return <article className={styles.card} key={selection.productId}><h4>{index+1}. {product?.name||selection.productId}</h4><small>{product?.available?"目前可顯示":"目前不可顯示，回覆時會略過"}</small>
          <Toggle label="在 LINE 豆單顯示" value={selection.enabled} onChange={enabled=>updateMenu({products:menu.products.map((p,i)=>i===index?{...p,enabled}:p)})}/>
          <Text label="LINE 專用商品說明（留空則使用原商品短說明）" value={selection.lineDescriptionOverride} onChange={lineDescriptionOverride=>updateMenu({products:menu.products.map((p,i)=>i===index?{...p,lineDescriptionOverride}:p)})} max={800} multiline/>
          <details><summary>目前原商品說明</summary><p>{product?.description||"尚無商品說明"}</p><small>參考編號：{selection.productId}</small></details>
          {ordering("products",index,menu.products.length)}<button type="button" onClick={()=>updateMenu({products:menu.products.filter((_,i)=>i!==index)})}>移除商品</button></article>;})}
        <small>豆單最後儲存：{settings.revision?new Date(menu.updatedAt).toLocaleString("zh-TW"):"尚未儲存"}</small>
      </section>
      <section><h2>一般回覆規則</h2><p>豆單優先；一般規則按優先順序由小到大，只回覆第一個有內容的符合規則。相同順序依規則編號排列。</p>
        <button type="button" disabled={settings.rules.length>=100} onClick={()=>{const now=new Date().toISOString();change({...settings,rules:[...settings.rules,{id:`rule-${crypto.randomUUID()}`,enabled:false,name:"",order:Math.max(-1,...settings.rules.map(r=>r.order))+1,matchMode:"exact",keywords:[],replyText:"",createdAt:now,updatedAt:now}]});}}>新增規則</button>
        {settings.rules.map((rule,index)=><article className={styles.card} key={rule.id}><h3>{rule.name||`規則 ${index+1}`}</h3><Toggle label="啟用這個規則" value={rule.enabled} onChange={enabled=>updateRule(index,{enabled})}/>
          <div className={styles.grid}><Text label="規則名稱（只在後台顯示）" value={rule.name} onChange={name=>updateRule(index,{name})} max={100}/><label className={styles.field}><span>優先順序</span><input type="number" min={0} max={1000000} value={rule.order} onChange={e=>updateRule(index,{order:Number(e.target.value)})}/></label>
            <Mode value={rule.matchMode} onChange={matchMode=>updateRule(index,{matchMode})}/><Text label="關鍵字（每行一個）" value={rule.keywords.join("\n")} onChange={v=>updateRule(index,{keywords:v.split("\n")})} max={3030} multiline/></div>
          <Text label="客人回覆文字" value={rule.replyText} onChange={replyText=>updateRule(index,{replyText})} max={4500} multiline/>
          {ordering("rules",index,settings.rules.length)}<button type="button" onClick={()=>change({...settings,rules:settings.rules.filter((_,i)=>i!==index)})}>刪除規則</button>
          <details><summary>更新資訊</summary><small>{rule.id}・建立 {new Date(rule.createdAt).toLocaleString("zh-TW")}・更新 {new Date(rule.updatedAt).toLocaleString("zh-TW")}</small></details>
        </article>)}
      </section>
      <section><h2>未命中預設回覆</h2><Toggle label="啟用未命中回覆" value={settings.fallback.enabled} onChange={enabled=>change({...settings,fallback:{...settings.fallback,enabled}})}/>
        <Text label="預設回覆文字（留空則不回覆）" value={settings.fallback.text} onChange={text=>change({...settings,fallback:{...settings.fallback,text}})} max={4500} multiline/></section>
      <section><h2>測試自動回覆</h2><p>使用畫面上尚未儲存的設定與目前商品資料模擬，不會發送 LINE 訊息。</p><Text label="客人輸入的訊息" value={sample} onChange={v=>{setSample(v);setResult(null);}} max={5000} multiline/>
        <button type="button" onClick={()=>void submit(true)}>預覽回覆</button>
        {result?<div className={styles.preview}><dl><dt>整理後的訊息</dt><dd>{result.normalizedMessage||"（空白）"}</dd><dt>符合類型</dt><dd>{categories[result.category]}</dd><dt>符合關鍵字</dt><dd>{result.keyword||"—"}</dd>{result.ruleId?<><dt>符合規則</dt><dd>{result.ruleName}（{result.ruleId}）</dd></>:null}{result.productIds.length?<><dt>豆單商品</dt><dd>{result.productIds.map(id=>products.find(p=>p.productId===id)?.name||id).join("、")}</dd></>:null}</dl><h3>客人實際回覆內容</h3>
          <pre>{result.text||"不會發送回覆"}</pre>{result.reason==="reply-too-long"?<p role="alert">內容超過 LINE 單次回覆上限，請減少商品或縮短說明。</p>:null}<small>共 {result.messages.length} 則文字訊息，透過一次回覆送出。</small></div>:null}
      </section>
      <div className={styles.save}><button type="button" onClick={()=>void submit()}>儲存所有設定</button><button type="button" onClick={()=>void load()}>重新載入已儲存設定</button></div>
    </fieldset>
  </div>;
}
