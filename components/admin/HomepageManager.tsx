"use client";
import { ChangeEvent,useEffect,useState } from "react";
import { validateHomepageCampaignDates } from "@/lib/homepageCampaignValidation";
import { home004IneligibilityReasons, resolveHome004Recommendations } from "@/lib/home004Recommendations";

type ProductOption={slug:string;name:string;active?:boolean;status?:string;purchasable:boolean;inMonthlyMenu:boolean;hasAvailableSku:boolean};
type Payload={homepage:any;products:ProductOption[]};
type CampaignSectionValue={enabled?:boolean;eyebrow?:string;title?:string;intro?:string;displayLimit?:number};
type CampaignValue={id?:string;enabled?:boolean;sort?:number;eyebrow?:string;title?:string;description?:string;details?:string[];ctaLabel?:string;ctaHref?:string;secondaryLabel?:string;secondaryHref?:string;note?:string;image?:string;startDate?:string;endDate?:string};
type SetHomepagePath=(path:(string|number)[],value:unknown)=>void;
type UploadHomepageAsset=(event:ChangeEvent<HTMLInputElement>,path:(string|number)[],assetId:string,seoName?:string,assetGroup?:string)=>Promise<void>;
const sectionOrder=["home002","home003","home004","home005","home006","home007","home008","home009","home010"];
const sectionNames:any={home002:"品牌價值",home003:"開始選擇",home004:"第一次購買推薦",home005:"一包咖啡的旅程",home006:"專屬烘焙",home007:"藝術系列",home008:"真實工作室",home009:"真實評價",home010:"最後購買引導"};
export default function HomepageManager(){
 const [data,setData]=useState<Payload|null>(null);const [message,setMessage]=useState("讀取中…");const [saving,setSaving]=useState(false);
 useEffect(()=>{fetch("/api/admin/homepage",{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject(new Error("讀取失敗"))).then(v=>{setData(v);setMessage("")}).catch(e=>setMessage(e.message))},[]);
 const setPath=(path:(string|number)[],value:any)=>setData(cur=>{if(!cur)return cur;const n=structuredClone(cur);let t=n.homepage;for(const k of path.slice(0,-1))t=t[k as any];t[path[path.length-1] as any]=value;return n});
 const upload=async(e:ChangeEvent<HTMLInputElement>,path:(string|number)[],assetId:string,seoName?:string,assetGroup?:string)=>{const f=e.target.files?.[0];if(!f)return;setMessage(`上傳 ${assetId}…`);const form=new FormData();form.append("file",f);form.append("desiredName",seoName||`kd-coffee-${assetId.toLowerCase()}`);form.append("artworkSlug","homepage");form.append("assetType",assetId.toLowerCase());if(assetGroup)form.append("assetGroup",assetGroup);const r=await fetch("/api/admin/homepage/upload",{method:"POST",body:form});const j=await r.json();if(!r.ok){setMessage(j.error||"上傳失敗");return}setPath(path,j.path);setMessage(`${assetId} 上傳完成，請按儲存。`);e.target.value=""};
 const save=async()=>{if(!data)return;const dateError=validateHomepageCampaignDates(data.homepage.campaigns);if(dateError){setMessage(dateError);return}const home004Resolution=resolveHome004Recommendations(data.homepage.home004?.productSlugs,data.products);if(!home004Resolution.valid){setMessage(home004Resolution.errors[0]);return}setSaving(true);setMessage("儲存中…");try{const r=await fetch("/api/admin/homepage",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({homepage:data.homepage})});const j=await r.json();setMessage(r.ok?"首頁 v3 已儲存。":"儲存失敗："+(j.error||"未知錯誤"))}finally{setSaving(false)}};
 if(!data)return <p>{message}</p>;const h=data.homepage;
 return <div className="homepage-manager v3-admin">
  <div className="cms-toolbar"><div><p className="eyebrow dark">HOMEPAGE v3 CONTROL CENTER</p><h1>首頁成交版管理</h1><p>前台 HOME001～HOME010 與這裡一一對應。每張圖都有編號、尺寸、ALT 與生成提示詞。</p></div><div className="cms-toolbar-actions"><a href="/" target="_blank">預覽首頁 ↗</a><button onClick={save} disabled={saving}>{saving?"儲存中…":"儲存全部"}</button></div></div>
  {message?<div className="cms-message">{message}</div>:null}
  <section className="cms-panel"><div className="cms-panel-head"><div><h2>HOME001｜Hero 烘豆影片</h2><p>保留目前真實烘豆影片，首頁只放品牌訊息與購買入口。</p></div></div><div className="cms-grid two">
   <label>品牌小標<input value={h.hero.eyebrow||""} onChange={e=>setPath(["hero","eyebrow"],e.target.value)}/></label>
   <label>主按鈕<input value={h.hero.buttonLabel||""} onChange={e=>setPath(["hero","buttonLabel"],e.target.value)}/></label>
   <label>標題第一行<input value={h.hero.titleLines?.[0]||""} onChange={e=>setPath(["hero","titleLines"],[e.target.value,h.hero.titleLines?.[1]||""])}/></label>
   <label>標題第二行<input value={h.hero.titleLines?.[1]||""} onChange={e=>setPath(["hero","titleLines"],[h.hero.titleLines?.[0]||"",e.target.value])}/></label>
   <label className="span-two">核心文案<textarea value={h.hero.lead||""} onChange={e=>setPath(["hero","lead"],e.target.value)}/></label>
   <Media label="VID0001｜Hero MP4" value={h.hero.videoMp4} accept="video/mp4" onUpload={e=>upload(e,["hero","videoMp4"],"VID0001")}/>
   <Media label="IMG0001｜Hero Poster 1920×1080" value={h.hero.poster} accept="image/*" onUpload={e=>upload(e,["hero","poster"],"IMG0001")}/>
  </div></section>
  <CampaignEditor section={h.campaignSection} campaigns={h.campaigns||[]} setPath={setPath} upload={upload}/>
  {sectionOrder.map(key=><SectionEditor key={key} sectionKey={key} name={sectionNames[key]} value={h[key]} setPath={setPath} upload={upload} products={data.products}/>) }
 </div>
}
function CampaignEditor({section,campaigns,setPath,upload}:{section:CampaignSectionValue;campaigns:CampaignValue[];setPath:SetHomepagePath;upload:UploadHomepageAsset}){
 return <section className="cms-panel campaign-editor"><div className="cms-panel-head"><div><h2>Monthly Campaign｜本月活動</h2><p>首頁 HOME003 與 HOME004 之間的期間限定活動。</p></div><label className="cms-switch"><input type="checkbox" checked={section?.enabled!==false} onChange={e=>setPath(["campaignSection","enabled"],e.target.checked)}/>啟用活動區</label></div>
  <div className="cms-grid two">
   <label>區塊英文小標<input value={section?.eyebrow||""} onChange={e=>setPath(["campaignSection","eyebrow"],e.target.value)}/></label>
   <label>區塊標題<input value={section?.title||""} onChange={e=>setPath(["campaignSection","title"],e.target.value)}/></label>
   <label className="span-two">區塊說明<textarea value={section?.intro||""} onChange={e=>setPath(["campaignSection","intro"],e.target.value)}/></label>
   <label>顯示數量上限（0 表示不限制）<input type="number" min="0" step="1" value={Number(section?.displayLimit||0)} onChange={e=>setPath(["campaignSection","displayLimit"],Math.max(0,Number(e.target.value||0)))}/></label>
  </div>
  <div className="campaign-admin-list">{campaigns.map((campaign,index)=><article className="campaign-admin-card" key={campaign.id||index}>
   <div className="campaign-admin-title"><div><b>{campaign.id||`CAMPAIGN-${index+1}`}</b><label className="cms-switch"><input type="checkbox" checked={campaign.enabled!==false} onChange={e=>setPath(["campaigns",index,"enabled"],e.target.checked)}/>啟用</label></div><label>排序 <input type="number" step="1" value={Number(campaign.sort||0)} onChange={e=>setPath(["campaigns",index,"sort"],Number(e.target.value||0))}/></label></div>
   <div className="cms-grid two">
    <label>英文小標<input value={campaign.eyebrow||""} onChange={e=>setPath(["campaigns",index,"eyebrow"],e.target.value)}/></label>
    <label>活動標題<input value={campaign.title||""} onChange={e=>setPath(["campaigns",index,"title"],e.target.value)}/></label>
    <label className="span-two">活動說明<textarea value={campaign.description||""} onChange={e=>setPath(["campaigns",index,"description"],e.target.value)}/></label>
    <label className="span-two">活動細節（每行一項）<textarea value={(campaign.details||[]).join("\n")} onChange={e=>setPath(["campaigns",index,"details"],e.target.value.split(/\r?\n/))}/></label>
    <label>主要 CTA 文字<input value={campaign.ctaLabel||""} onChange={e=>setPath(["campaigns",index,"ctaLabel"],e.target.value)}/></label>
    <label>主要 CTA 連結<input value={campaign.ctaHref||""} onChange={e=>setPath(["campaigns",index,"ctaHref"],e.target.value)}/></label>
    <label>次要 CTA 文字<input value={campaign.secondaryLabel||""} onChange={e=>setPath(["campaigns",index,"secondaryLabel"],e.target.value)}/></label>
    <label>次要 CTA 連結<input value={campaign.secondaryHref||""} onChange={e=>setPath(["campaigns",index,"secondaryHref"],e.target.value)}/></label>
    <label>活動註記<input value={campaign.note||""} onChange={e=>setPath(["campaigns",index,"note"],e.target.value)}/></label>
    <label>開始日期<input type="date" value={campaign.startDate||""} onChange={e=>setPath(["campaigns",index,"startDate"],e.target.value)}/></label>
    <label>結束日期<input type="date" value={campaign.endDate||""} onChange={e=>setPath(["campaigns",index,"endDate"],e.target.value)}/></label>
    <Media label="Campaign 圖片" value={campaign.image} accept="image/*" onUpload={e=>upload(e,["campaigns",index,"image"],`CAMPAIGN-${index+1}`,`kdcoffee-campaign-${campaign.id||index+1}`,"campaign")} onPathChange={path=>setPath(["campaigns",index,"image"],path)} pathPlaceholder={`/images/campaigns/kdcoffee-campaign-${campaign.id||index+1}-v01.webp`}/>
   </div>
  </article>)}</div>
 </section>
}
function SectionEditor({sectionKey,name,value,setPath,upload,products}:{sectionKey:string;name:string;value:any;setPath:any;upload:any;products:ProductOption[]}){
 const collections=value?.cards||value?.steps||value?.images||value?.items; const collectionKey=value?.cards?"cards":value?.steps?"steps":value?.images?"images":value?.items?"items":"";
 return <section className="cms-panel home-section-editor"><div className="cms-panel-head"><div><h2>{sectionKey.toUpperCase()}｜{name}</h2><p>{value?.purpose||"前台內容管理"}</p></div></div><div className="cms-grid two">
  {value?.title!==undefined?<label>區塊標題<input value={value.title||""} onChange={e=>setPath([sectionKey,"title"],e.target.value)}/></label>:null}
  {value?.intro!==undefined?<label>區塊說明<input value={value.intro||""} onChange={e=>setPath([sectionKey,"intro"],e.target.value)}/></label>:null}
  {value?.text!==undefined?<label className="span-two">主要內文<textarea value={value.text||""} onChange={e=>setPath([sectionKey,"text"],e.target.value)}/></label>:null}
 </div>
 {sectionKey==="home004"?<Home004Editor value={value} products={products} setPath={setPath}/>:null}
 {sectionKey==="home006"?<div className="cms-grid two"><label>按鈕文字<input value={value.button||""} onChange={e=>setPath([sectionKey,"button"],e.target.value)}/></label><label>連結<input value={value.href||""} onChange={e=>setPath([sectionKey,"href"],e.target.value)}/></label><Media label={`${value.imageId||"IMG0601"}｜建議 1200×900`} value={value.image} accept="image/*" onUpload={(e:any)=>upload(e,[sectionKey,"image"],value.imageId||"IMG0601")}/><label className="span-two">圖片生成提示詞<textarea value={value.prompt||""} onChange={e=>setPath([sectionKey,"prompt"],e.target.value)}/></label></div>:null}
 {collections?<div className="home-card-editor-grid">{collections.map((item:any,index:number)=><article className="home-card-editor" key={item.id||index}><div className="asset-id-row"><b>{item.id||`${sectionKey}-${index+1}`}</b><span>{item.imageId||"文字卡"}</span></div>{item.imageId?<Media label={sectionKey==="home003"?`${item.imageId}｜HOME003 情境圖片`:`${item.imageId}｜建議 ${sectionKey==="home007"?"800×1000":"800×800"}`} value={item.image} accept="image/*" onUpload={(e:any)=>upload(e,[sectionKey,collectionKey,index,"image"],item.imageId,item.seoFilename,sectionKey==="home003"?"home003":undefined)} onPathChange={sectionKey==="home003"?(path:string)=>setPath([sectionKey,collectionKey,index,"image"],path):undefined} pathPlaceholder={sectionKey==="home003"?`/images/home003/${item.seoFilename}-v01.webp`:undefined}/>:null}{sectionKey==="home003"?<div className="scene-file-guidance"><span>建議檔名 <code>{item.seoFilename}</code></span><span>比例 <b>{item.ratio}</b></span><span>尺寸 <b>{item.recommendedSize}</b></span></div>:null}{item.title!==undefined?<label>標題<input value={item.title||""} onChange={e=>setPath([sectionKey,collectionKey,index,"title"],e.target.value)}/></label>:null}{item.text!==undefined?<label>內文<textarea value={item.text||""} onChange={e=>setPath([sectionKey,collectionKey,index,"text"],e.target.value)}/></label>:null}{item.alt!==undefined?<label>SEO ALT<input value={item.alt||""} onChange={e=>setPath([sectionKey,collectionKey,index,"alt"],e.target.value)}/></label>:null}{sectionKey==="home003"?<div className="scene-asset-spec">
 <div className="scene-spec-grid"><label>英文情境標籤<input value={item.eyebrow||""} onChange={e=>setPath([sectionKey,collectionKey,index,"eyebrow"],e.target.value)}/></label><label>按鈕文字<input value={item.button||""} onChange={e=>setPath([sectionKey,collectionKey,index,"button"],e.target.value)}/></label><label>建議尺寸<input value={item.recommendedSize||""} onChange={e=>setPath([sectionKey,collectionKey,index,"recommendedSize"],e.target.value)}/></label><label>圖片比例<input value={item.ratio||""} onChange={e=>setPath([sectionKey,collectionKey,index,"ratio"],e.target.value)}/></label><label className="span-two">圖片類型<input value={item.imageType||""} onChange={e=>setPath([sectionKey,collectionKey,index,"imageType"],e.target.value)}/></label><label className="span-two">SEO 檔名（不含副檔名）<input value={item.seoFilename||""} onChange={e=>setPath([sectionKey,collectionKey,index,"seoFilename"],e.target.value)}/></label></div>
 <PromptField title="完整圖片生成提示詞" value={item.prompt||""} onChange={(v:string)=>setPath([sectionKey,collectionKey,index,"prompt"],v)}/>
 <PromptField title="Negative Prompt" value={item.negativePrompt||""} onChange={(v:string)=>setPath([sectionKey,collectionKey,index,"negativePrompt"],v)}/>
 </div>:item.prompt!==undefined?<label>圖片生成提示詞<textarea value={item.prompt||""} onChange={e=>setPath([sectionKey,collectionKey,index,"prompt"],e.target.value)}/></label>:null}{item.href!==undefined?<label>連結<input value={item.href||""} onChange={e=>setPath([sectionKey,collectionKey,index,"href"],e.target.value)}/></label>:null}</article>)}</div>:null}
 </section>
}
function Home004Editor({value,products,setPath}:{value:{productSlugs?:unknown[]};products:ProductOption[];setPath:SetHomepagePath}){
 const slugs=Array.isArray(value.productSlugs)?value.productSlugs:[];
 const resolution=resolveHome004Recommendations(slugs,products);
 const selected=new Set(slugs.filter((slug:unknown)=>typeof slug==="string"&&slug));
 return <div className="home004-admin-editor">
  {!resolution.valid?<div className="cms-message" role="alert">{resolution.errors.join(" ")}</div>:null}
  <div className="cms-grid three">{[0,1,2].map(i=>{const current=typeof slugs[i]==="string"?slugs[i]:"";const currentExists=products.some(product=>product.slug===current);return <label key={i}>推薦作品 {i+1}<select value={current} onChange={e=>{const next=[...slugs];next[i]=e.target.value;setPath(["home004","productSlugs"],next)}}>
   <option value="">請選擇</option>
   {current&&!currentExists?<option value={current} disabled>{current}｜商品不存在</option>:null}
   {products.map(product=>{const reasons=home004IneligibilityReasons(product);const duplicate=selected.has(product.slug)&&product.slug!==current;const invalid=reasons.length>0;const suffix=invalid?`｜不可推薦：${reasons.join("、")}`:!product.hasAvailableSku?"｜暫時售罄":"";return <option key={product.slug} value={product.slug} disabled={(invalid||duplicate)&&product.slug!==current}>{product.name}{suffix}</option>})}
  </select></label>})}</div>
 </div>;
}
function Media({label,value,accept,onUpload,onPathChange,pathPlaceholder}:{label:string;value?:string;accept:string;onUpload:(e:ChangeEvent<HTMLInputElement>)=>void;onPathChange?:(value:string)=>void;pathPlaceholder?:string}){return <div className="media-field"><label>{label}</label>{onPathChange?<label className="media-path-field">圖片路徑<input value={value||""} placeholder={pathPlaceholder} onChange={e=>onPathChange(e.target.value)}/></label>:null}<MediaPreview value={value} isImage={accept.startsWith("image")}/><label className="upload-label">選擇檔案<input type="file" accept={accept} onChange={onUpload}/></label></div>}

function MediaPreview({value,isImage}:{value?:string;isImage:boolean}){const [failedSrc,setFailedSrc]=useState("");const showImage=Boolean(value)&&isImage&&failedSrc!==value;return showImage?<img src={value} alt="目前圖片" onError={()=>setFailedSrc(value||"")}/>:<small>{value&&isImage?"圖片無法載入，請確認路徑。":value||"尚未上傳"}</small>}

function PromptField({title,value,onChange}:{title:string;value:string;onChange:(value:string)=>void}){const [copied,setCopied]=useState(false);const copy=async()=>{await navigator.clipboard.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),1500)};return <div className="prompt-field"><div className="prompt-field-head"><strong>{title}</strong><button type="button" onClick={copy}>{copied?"已複製":"一鍵複製"}</button></div><textarea value={value} onChange={e=>onChange(e.target.value)}/></div>}
