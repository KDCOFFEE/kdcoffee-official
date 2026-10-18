"use client";
import { useEffect, useState } from "react";
import type { SupportInput, SupportNode, SupportResult, SupportSettings } from "@/lib/lineSupportTypes";
import { memberActionTypes } from "@/lib/lineSupportTypes";
import { defaultLineWelcome, defaultLineBeanMenu } from "@/lib/lineSupportFeatures";
import styles from "./LineAutoReplyManager.module.css";
const kindNames={menu:"導覽目錄",answer:"問答內容",member_action:"會員個人功能"};
const actionNames:Record<string,string>={viewOrders:"我的訂單",viewOrderStatus:"訂單狀態",viewKdPoints:"KD 點數",viewCredits:"抵用金",viewReferralRewards:"推薦回饋",viewSubscriptions:"定期配送",viewMemberCenter:"會員中心"};
function Text({label,value,onChange,max=4500,multiline=false}:{label:string;value:string;onChange:(value:string)=>void;max?:number;multiline?:boolean}){
  return <label className={styles.field}>{label}{multiline?<textarea value={value} maxLength={max} rows={4} onChange={e=>onChange(e.target.value)}/>:<input value={value} maxLength={max} onChange={e=>onChange(e.target.value)}/>}</label>;
}
function Toggle({label,value,onChange}:{label:string;value:boolean;onChange:(value:boolean)=>void}){
  return <label className={styles.toggle}><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/>{label}</label>;
}
function descendants(nodes:SupportNode[],id:string){
  const found=new Set([id]);let changed=true;
  while(changed){changed=false;for(const n of nodes)if(n.parentId&&found.has(n.parentId)&&!found.has(n.id)){found.add(n.id);changed=true;}}
  return found;
}
function Tree({node,settings,selected,onSelect,depth=0}:{node:SupportNode;settings:SupportSettings;selected:string;onSelect:(id:string)=>void;depth?:number}){
  const children=settings.nodes.filter(n=>n.parentId===node.id).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
  return <li><button type="button" className={selected===node.id?styles.selected:undefined} aria-pressed={selected===node.id} onClick={()=>onSelect(node.id)}>
    <span className={node.enabled?styles.on:styles.off}>{node.enabled?"ON":"OFF"}</span> {node.title}<small>{kindNames[node.type]}{node.sourceMetadata.needsOwner?"・待補充":""}</small>
  </button>{children.length&&depth<6?<details open><summary>{children.length} 個下層項目</summary><ul>{children.map(child=><Tree key={child.id} node={child} settings={settings} selected={selected} onSelect={onSelect} depth={depth+1}/>)}</ul></details>:null}</li>;
}
export default function LineAutoReplyManager(){
  const [savedEnabled,setSavedEnabled]=useState(false),[products,setProducts]=useState<Array<{id:string;name:string;available:boolean}>>([]);
  const [draft,setDraft]=useState<SupportSettings|null>(null),[selected,setSelected]=useState("root");
  const [busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
  const [sample,setSample]=useState(""),[mode,setMode]=useState<SupportInput["mode"]>("text"),[postback,setPostback]=useState("");
  const [memberState,setMemberState]=useState("unlinked"),[result,setResult]=useState<SupportResult|null>(null);
  const [lastInput,setLastInput]=useState<SupportInput|null>(null);
  async function load(){
    setBusy(true);setError("");
    try{const response=await fetch("/api/admin/line-auto-reply",{cache:"no-store"}),body=await response.json();if(!response.ok)throw new Error(body.error);
      setDraft(body.settings);setSavedEnabled(body.settings.enabled===true);setProducts(body.products||[]);setSelected(body.settings.rootNodeId);setDirty(false);setResult(null);setNotice("");
    }catch{setError("無法讀取設定，請確認登入狀態或檢查設定檔。");}finally{setBusy(false);}
  }
  useEffect(()=>{void load();},[]);
  function change(next:SupportSettings){setDraft(next);setDirty(true);setResult(null);setNotice("");}
  if(!draft)return <section className={styles.root}><p role="alert">{error||"正在讀取客服導覽…"}</p><button disabled={busy} onClick={()=>void load()}>重新讀取</button></section>;
  const settings=draft,node=settings.nodes.find(n=>n.id===selected)||settings.nodes.find(n=>n.id===settings.rootNodeId)!;
  const welcome=settings.welcome||defaultLineWelcome(),beanMenu=settings.beanMenu||defaultLineBeanMenu();
  const root=settings.nodes.find(n=>n.id===settings.rootNodeId)!;
  const blockedParents=descendants(settings.nodes,node.id);
  function update(patch:Partial<SupportNode>){change({...settings,nodes:settings.nodes.map(n=>n.id===node.id?{...n,...patch}:n)});}
  function add(type:SupportNode["type"]){
    const parent=node.type==="member_action"?node.parentId||settings.rootNodeId:node.id,now=new Date().toISOString();
    const next:SupportNode={id:"node-"+crypto.randomUUID(),parentId:parent,type,enabled:false,title:type==="menu"?"新導覽目錄":type==="answer"?"新問答":"新會員功能",promptText:type==="menu"?"請選擇想了解的項目。":"",keywords:[],matchMode:"exact",replyText:"",linkLabel:type==="member_action"?"開啟會員中心":"",destination:"",memberAction:type==="member_action"?"viewMemberCenter":"",order:settings.nodes.filter(n=>n.parentId===parent).reduce((a,n)=>Math.max(a,n.order),0)+10,
      sourceMetadata:{type:"Owner edited",source:"Owner draft",section:"",classification:"static",needsOwner:true},createdAt:now,updatedAt:now};
    change({...settings,nodes:[...settings.nodes,next]});setSelected(next.id);
  }
  function move(direction:number){
    const siblings=settings.nodes.filter(n=>n.parentId===node.parentId).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id)),index=siblings.findIndex(n=>n.id===node.id),target=index+direction;
    if(target<0||target>=siblings.length)return;[siblings[index],siblings[target]]=[siblings[target],siblings[index]];
    const positions=new Map(siblings.map((n,i)=>[n.id,i*10]));
    change({...settings,nodes:settings.nodes.map(n=>positions.has(n.id)?{...n,order:positions.get(n.id)!}:n)});
  }
  async function submit(input?:SupportInput){
    setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch(input?"/api/admin/line-auto-reply/simulate":"/api/admin/line-auto-reply",{method:input?"POST":"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(input?{input,settings,memberState}:{settings,expectedRevision:settings.revision})});
      const body=await response.json();if(!response.ok)throw new Error(body.error||"操作失敗。");
      if(input){setResult(body.result);setLastInput(input);}else{setDraft(body.settings);setSavedEnabled(body.settings.enabled===true);setDirty(false);setResult(null);setNotice("客服導覽已儲存。");}
    }catch(caught){setError(caught instanceof Error?caught.message:"操作失敗。");}finally{setBusy(false);}
  }
  const simulationInput:SupportInput=mode==="text"?{mode:"text",text:sample}:mode==="node"?{mode:"node",nodeId:node.id}:{mode:"postback",data:postback};
  return <div className={styles.root}>
    <div className={styles.status}><strong>自動回覆狀態：{savedEnabled?"開啟 (ON)":"關閉 (OFF)"}</strong><span>{dirty?"尚有未儲存變更":settings.revision?"已儲存設定":"預設草稿，尚未儲存"}</span><span>版本 {settings.revision}</span></div>
    <p role="status">{notice}</p>{error?<p className={styles.error} role="alert">{error}</p>:null}
    <fieldset disabled={busy} className={styles.editor}>
      <section><h2>正式自動回覆</h2><Toggle label="啟用正式 LINE 自動回覆" value={settings.enabled} onChange={enabled=>change({...settings,enabled})}/><p>草稿開關：{settings.enabled?"開啟":"關閉"}；按下儲存才會變更正式狀態。</p><p>關閉時保留導覽內容。首次讀取的預設草稿不會自動儲存或啟用。</p></section>
      <section><h2>顧客導覽架構</h2><p>選擇左側項目，在右側編輯內容。停用上層時，其下所有項目也不會對客人開放。</p>
        <div className={styles.workspace}>
          <nav className={styles.tree} aria-label="顧客導覽樹"><ul><Tree node={root} settings={settings} selected={node.id} onSelect={setSelected}/></ul></nav>
          <div className={styles.nodeEditor}><h3>編輯：{node.title}</h3><span className={node.enabled?styles.on:styles.off}>{node.enabled?"ON":"OFF"}</span><Toggle label="啟用這個項目" value={node.enabled} onChange={enabled=>update({enabled})}/>
            <div className={styles.grid}><Text label="客人看到的標題 / 按鈕" max={20} value={node.title} onChange={title=>update({title})}/>
              <label className={styles.field}>項目類型<select value={node.type} disabled={node.id===root.id||node.id==="monthly-menu"||settings.nodes.some(n=>n.parentId===node.id)} onChange={e=>{const type=e.target.value as SupportNode["type"];update({type,memberAction:type==="member_action"?"viewMemberCenter":"",destination:type==="member_action"?"":node.destination,linkLabel:type==="member_action"?"開啟會員中心":node.destination?node.linkLabel:""});}}><option value="menu">導覽目錄</option><option value="answer">問答內容</option><option value="member_action">會員個人功能</option></select></label></div>
            {node.id!==root.id?<label className={styles.field}>上層項目<select value={node.parentId||root.id} onChange={e=>update({parentId:e.target.value})}>{settings.nodes.filter(n=>n.type!=="member_action"&&!blockedParents.has(n.id)).map(n=><option key={n.id} value={n.id}>{n.title}</option>)}</select></label>:null}
            <div className={styles.grid}><Text label="同層順序（小的優先）" max={7} value={String(node.order)} onChange={v=>update({order:Number(v)})}/><label className={styles.field}>關鍵字比對<select value={node.matchMode} onChange={e=>update({matchMode:e.target.value as SupportNode["matchMode"]})}><option value="exact">完全符合</option><option value="contains">包含關鍵字</option></select></label></div>
            <Text label="關鍵字（每行一個，最多 30 個）" multiline max={3030} value={node.keywords.join("\n")} onChange={v=>update({keywords:v.split("\n").map(s=>s.trim()).filter(Boolean)})}/>
            <Text label="提示文字" multiline value={node.promptText} onChange={promptText=>update({promptText})}/>
            <Text label="回覆文字" multiline value={node.replyText} onChange={replyText=>update({replyText})}/>
            <div className={styles.replyPreview}>{node.replyText||"尚無回覆文字"}</div>
            {node.type==="member_action"?<label className={styles.field}>會員功能<select value={node.memberAction} onChange={e=>update({memberAction:e.target.value as SupportNode["memberAction"]})}>{memberActionTypes.map(a=><option key={a} value={a}>{actionNames[a]}</option>)}</select></label>:<Text label="安全網站連結（選填）" max={2000} value={node.destination} onChange={destination=>update({destination})}/>}
            <Text label="網站連結按鈕文字" max={20} value={node.linkLabel} onChange={linkLabel=>update({linkLabel})}/>
            <details><summary>內容来源及待補充狀態</summary><p>{node.sourceMetadata.type} · {node.sourceMetadata.source} · {node.sourceMetadata.section}</p><Toggle label="待 Owner 補充或確認" value={node.sourceMetadata.needsOwner} onChange={needsOwner=>update({sourceMetadata:{...node.sourceMetadata,needsOwner,type:"Owner edited",classification:needsOwner?node.sourceMetadata.classification:"static"}})}/></details>
            <div className={styles.actions}><button type="button" onClick={()=>move(-1)} disabled={node.id===root.id}>往上移</button><button type="button" onClick={()=>move(1)} disabled={node.id===root.id}>往下移</button><button type="button" onClick={()=>void submit({mode:"node",nodeId:node.id})}>預覽這個項目</button>
              <button type="button" className={styles.danger} disabled={node.id===root.id||node.id==="monthly-menu"||settings.nodes.some(n=>n.parentId===node.id)} onClick={()=>{change({...settings,nodes:settings.nodes.filter(n=>n.id!==node.id)});setSelected(node.parentId||root.id);}}>刪除沒有下層的項目</button></div>
            <div className={styles.actions}>{(["menu","answer","member_action"] as const).map(type=><button key={type} type="button" disabled={settings.nodes.length>=250} onClick={()=>add(type)}>新增{kindNames[type]}</button>)}</div>
          </div>
        </div>
        <details><summary>全站導覽按鈕文字</summary><div className={styles.grid}>{([["backLabel","返回上層"],["homeLabel","客服首頁"],["previousLabel","上一頁"],["nextLabel","下一頁"]] as const).map(([key,label])=><Text key={key} label={label} max={20} value={settings.navigation[key]} onChange={value=>change({...settings,navigation:{...settings.navigation,[key]:value}})}/>)}</div></details>
      </section>
      <section><h2>問答內容</h2><p>快速前往問答項目；答案與導覽共用同一份內容。完全符合優先於包含關鍵字；同一比對方式依順序及項目編號決定。</p><div className={styles.actions}>{settings.nodes.filter(n=>n.type==="answer").map(n=><button key={n.id} type="button" onClick={()=>setSelected(n.id)}>{n.title}{n.sourceMetadata.needsOwner?"（待補充）":""}</button>)}</div></section>
      <section><h2>會員個人功能</h2><p>只提供登入後的會員中心入口。LINE 不顯示私人訂單、點數金額或推薦名單。</p><div className={styles.actions}>{settings.nodes.filter(n=>n.type==="member_action").map(n=><button key={n.id} type="button" onClick={()=>setSelected(n.id)}>{n.title}</button>)}</div><Text label="尚未連結會員的說明文字" multiline value={settings.unlinkedText} onChange={unlinkedText=>change({...settings,unlinkedText})}/></section>
      <section><h2>加入好友歡迎訊息</h2><Toggle label="啟用歡迎訊息" value={welcome.enabled} onChange={enabled=>change({...settings,welcome:{...welcome,enabled}})}/><Text label="歡迎文字" multiline value={welcome.text} onChange={text=>change({...settings,welcome:{...welcome,text}})}/><p>只處理加入好友事件，總開關關閉時不發送。</p><button type="button" onClick={()=>void submit({mode:"welcome"})}>預覽歡迎訊息</button></section>
      <section><h2>豆單商品選擇</h2><Toggle label="在本月豆單回覆附上已選商品" value={beanMenu.enabled} onChange={enabled=>change({...settings,beanMenu:{...beanMenu,enabled}})}/><p>關閉時使用本月豆單的原有文字與網站連結。僅參照目前商品，隱藏、停用、缺貨或已刪除的商品會略過。</p>
        <Text label="豆單標題" max={200} value={beanMenu.title} onChange={title=>change({...settings,beanMenu:{...beanMenu,title}})}/><Text label="豆單前言" max={1000} multiline value={beanMenu.intro} onChange={intro=>change({...settings,beanMenu:{...beanMenu,intro}})}/><Text label="沒有可用已選商品時的文字" max={1000} multiline value={beanMenu.emptyText} onChange={emptyText=>change({...settings,beanMenu:{...beanMenu,emptyText}})}/><Text label="豆單結尾" max={1000} multiline value={beanMenu.footer} onChange={footer=>change({...settings,beanMenu:{...beanMenu,footer}})}/>
        {beanMenu.products.map((selection,index)=><div className={styles.card} key={selection.productId}><strong>{products.find(p=>p.id===selection.productId)?.name||selection.productId}</strong><Toggle label="包含此商品" value={selection.enabled} onChange={enabled=>change({...settings,beanMenu:{...beanMenu,products:beanMenu.products.map((p,i)=>i===index?{...p,enabled}:p)}})}/><Text label="商品順序（小的優先）" max={7} value={String(selection.order)} onChange={v=>change({...settings,beanMenu:{...beanMenu,products:beanMenu.products.map((p,i)=>i===index?{...p,order:Number(v)}:p)}})}/><Text label="LINE 商品說明（留空使用商品文案）" max={1000} multiline value={selection.description} onChange={description=>change({...settings,beanMenu:{...beanMenu,products:beanMenu.products.map((p,i)=>i===index?{...p,description}:p)}})}/><button type="button" onClick={()=>change({...settings,beanMenu:{...beanMenu,products:beanMenu.products.filter((_,i)=>i!==index)}})}>移除此商品參照</button></div>)}
        <label className={styles.field}>新增商品<select value="" disabled={beanMenu.products.length>=100} onChange={e=>{if(e.target.value)change({...settings,beanMenu:{...beanMenu,products:[...beanMenu.products,{productId:e.target.value,enabled:true,order:beanMenu.products.reduce((max,p)=>Math.max(max,p.order),0)+10,description:""}]}});}}><option value="">選擇商品</option>{products.filter(p=>!beanMenu.products.some(s=>s.productId===p.id)).map(p=><option key={p.id} value={p.id}>{p.name}{p.available?"":"（目前不可回覆）"}</option>)}</select></label>
      </section>
      <section><h2>未命中回覆</h2><Toggle label="啟用未命中回覆" value={settings.fallback.enabled} onChange={enabled=>change({...settings,fallback:{...settings.fallback,enabled}})}/><Text label="未命中時顯示的文字" multiline value={settings.fallback.text} onChange={text=>change({...settings,fallback:{...settings.fallback,text}})}/><Toggle label="附上客服首頁選項" value={settings.fallback.showRootChoices} onChange={showRootChoices=>change({...settings,fallback:{...settings.fallback,showRootChoices}})}/></section>
      <section><h2>模擬測試</h2><p>模擬測試會忽略正式自動回覆總開關，只預覽草稿。不會傳送 LINE 訊息、不會儲存總開關變更，也不查真實會員。</p>
        <div className={styles.grid}><label className={styles.field}>測試入口<select value={mode} onChange={e=>setMode(e.target.value as SupportInput["mode"])}><option value="text">文字問題</option><option value="node">目前選擇的項目</option><option value="postback">按鈕指令</option></select></label><label className={styles.field}>合成會員狀態<select value={memberState} onChange={e=>setMemberState(e.target.value)}><option value="unlinked">尚未連結會員</option><option value="linked">已連結會員</option></select></label></div>
        {mode==="text"?<Text label="客人輸入的訊息" value={sample} onChange={setSample} max={5000} multiline/>:mode==="postback"?<Text label="按鈕指令" value={postback} onChange={setPostback} max={300}/>:<p>預覽：{node.title}</p>}
        <button type="button" onClick={()=>void submit(simulationInput)}>預覽回覆</button>
        {result?<div className={styles.preview}><p>{settings.enabled?"草稿模擬結果":"正式自動回覆目前關閉；以下僅為模擬結果。"}</p><dl>
          <dt>測試入口 / 輸入</dt><dd>{lastInput?.mode} / {lastInput?.mode==="text"?lastInput.text:lastInput?.mode==="node"?lastInput.nodeId:lastInput?.mode==="postback"?lastInput.data:"歡迎訊息"}</dd><dt>節點類型</dt><dd>{result.nodeType?kindNames[result.nodeType]:"—"}</dd>
          <dt>整理後訊息</dt><dd>{result.normalizedMessage||"—"}</dd><dt>符合類型 / 未命中</dt><dd>{result.category} {result.reason}</dd><dt>項目 / 上層</dt><dd>{result.nodeId||"—"} / {result.parentId||"首頁"}</dd><dt>下層項目</dt><dd>{result.childIds.join("、")||"—"}</dd><dt>符合關鍵字</dt><dd>{result.keyword||"—"}</dd><dt>會員功能</dt><dd>{actionNames[result.memberAction]||"—"}</dd><dt>需要登入 / 連結</dt><dd>{result.authenticationRequired?"是":"否"} / {result.linked?"已連結":"未連結或無需查詢"}</dd><dt>網站 CTA</dt><dd>{result.destination||"—"}</dd><dt>按鈕頁次</dt><dd>{result.page+1} / {result.pageCount}</dd>
        </dl><h3>客人實際回覆內容</h3>{result.messages.map((message,index)=><div key={index}><pre>{message.text}</pre><div className={styles.actions}>{message.quickReply?.items.map((item,i)=>item.action.type==="postback"?<button type="button" key={i} onClick={()=>void submit({mode:"postback",data:item.action.type==="postback"?item.action.data:""})}>{item.action.label}</button>:<span className={styles.ctaPreview} key={i}>{item.action.label}：{item.action.uri}</span>)}</div></div>)}{!result.messages.length?<p>不會發送回覆</p>:null}<small>合成會員狀態；模擬器沒有 LINE 網路傳送能力。</small></div>:null}
      </section>
      <div className={styles.save}><button type="button" onClick={()=>void submit()}>儲存所有設定</button><button type="button" onClick={()=>void load()}>重新載入已儲存設定</button></div>
    </fieldset>
  </div>;
}
