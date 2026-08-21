"use client";
import { useEffect,useState } from "react";
import MediaUploader from "@/components/admin/MediaUploader";
import { validateHomepageCampaigns } from "@/lib/homepageCampaignValidation";
import { home004IneligibilityReasons, resolveHome004Recommendations } from "@/lib/home004Recommendations";
import { localImageMedia, resolveMediaAsset, type MediaAsset } from "@/lib/media";

type ProductOption={slug:string;name:string;active?:boolean;status?:string;purchasable:boolean;inMonthlyMenu:boolean;hasAvailableSku:boolean};
type Payload={homepage:any;products:ProductOption[]};
type CampaignSectionValue={enabled?:boolean;eyebrow?:string;title?:string;intro?:string;displayLimit?:number};
type CampaignValue={id?:string;adminName?:string;enabled?:boolean;sort?:number;eyebrow?:string;title?:string;description?:string;details?:string[];ctaLabel?:string;ctaHref?:string;secondaryLabel?:string;secondaryHref?:string;note?:string;image?:string;media?:MediaAsset;startDate?:string;endDate?:string;placements?:string[]};
type SetHomepagePath=(path:(string|number)[],value:unknown)=>void;
type UploadHomepageImage=(file:File,path:(string|number)[],assetId:string,seoName?:string,assetGroup?:string)=>Promise<MediaAsset>;
const sectionOrder=["home002","home003","home004","home005","home006","home007","home008","home009","home010"];
const sectionNames:any={home002:"品牌價值",home003:"開始選擇",home004:"第一次購買推薦",home005:"一包咖啡的旅程",home006:"專屬烘焙",home007:"藝術系列",home008:"真實工作室",home009:"真實評價",home010:"最後購買引導"};
export default function HomepageManager(){
 const [data,setData]=useState<Payload|null>(null);const [message,setMessage]=useState("讀取中…");const [saving,setSaving]=useState(false);
 useEffect(()=>{fetch("/api/admin/homepage",{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject(new Error("讀取失敗"))).then(v=>{setData(v);setMessage("")}).catch(e=>setMessage(e.message))},[]);
 const setPath=(path:(string|number)[],value:any)=>setData(cur=>{if(!cur)return cur;const n=structuredClone(cur);let t=n.homepage;for(const k of path.slice(0,-1))t=t[k as any];t[path[path.length-1] as any]=value;return n});
 const uploadImage:UploadHomepageImage=async(file,path,assetId,seoName,assetGroup)=>{setMessage(`上傳 ${assetId}…`);const form=new FormData();form.append("file",file);form.append("desiredName",seoName||`kd-coffee-${assetId.toLowerCase()}`);form.append("artworkSlug","homepage");form.append("assetType",assetId.toLowerCase());if(assetGroup)form.append("assetGroup",assetGroup);const r=await fetch("/api/admin/homepage/upload",{method:"POST",body:form});const j=await r.json();if(!r.ok){const error=j.error||"上傳失敗";setMessage(error);throw new Error(error)}setPath(path,j.path);setMessage(`${assetId} 上傳完成，請按儲存。`);return localImageMedia(j.path)};
 const save=async()=>{if(!data)return;const campaignError=validateHomepageCampaigns(data.homepage.campaigns);if(campaignError){setMessage(campaignError);return}const home004Resolution=resolveHome004Recommendations(data.homepage.home004?.productSlugs,data.products);if(!home004Resolution.valid){setMessage(home004Resolution.errors[0]);return}setSaving(true);setMessage("儲存中…");try{const r=await fetch("/api/admin/homepage",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({homepage:data.homepage})});const j=await r.json();setMessage(r.ok?"首頁 v3 已儲存。":"儲存失敗："+(j.error||"未知錯誤"))}finally{setSaving(false)}};
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
   <div className="span-two"><MediaUploader label="HOME001｜Hero 圖片／影片" usage="hero" value={resolveMediaAsset(h.hero.media,h.hero.poster)} onImageUpload={file=>uploadImage(file,["hero","poster"],"IMG0001")} onChange={media=>setPath(["hero","media"],media)} onRemove={h.hero.media?()=>setPath(["hero","media"],undefined):undefined}/></div>
  </div></section>
  <CampaignEditor section={h.campaignSection} campaigns={h.campaigns||[]} setPath={setPath} uploadImage={uploadImage}/>
  {sectionOrder.map(key=><SectionEditor key={key} sectionKey={key} name={sectionNames[key]} value={h[key]} setPath={setPath} uploadImage={uploadImage} products={data.products}/>) }
 </div>
}
function CampaignEditor({section,campaigns,setPath,uploadImage}:{section:CampaignSectionValue;campaigns:CampaignValue[];setPath:SetHomepagePath;uploadImage:UploadHomepageImage}){
 const addCampaign=()=>{
  const sort=campaigns.reduce((maximum,campaign)=>Math.max(maximum,Number(campaign.sort||0)),0)+1;
  setPath(["campaigns"],[...campaigns,{id:`campaign-${Date.now()}`,adminName:"新活動",enabled:false,sort,eyebrow:"LATEST AT KD COFFEE",title:"新活動",description:"",details:[],ctaLabel:"了解更多",ctaHref:"/works",secondaryLabel:"",secondaryHref:"",note:"",startDate:"",endDate:"",placements:["frontend_campaign_section","product_pages"]}]);
 };
 const placementsFor=(campaign:CampaignValue)=>Array.isArray(campaign.placements)?campaign.placements:["frontend_campaign_section","product_pages"];
 const setPlacement=(campaign:CampaignValue,index:number,placement:string,enabled:boolean)=>{
  const current=placementsFor(campaign);
  setPath(["campaigns",index,"placements"],enabled?[...new Set([...current,placement])]:current.filter(item=>item!==placement));
 };
 return <section className="cms-panel campaign-editor" id="campaign-management"><div className="cms-panel-head"><div><h2>活動管理</h2><p>這是首頁活動區與作品頁最新活動的共享內容來源。</p></div><div className="campaign-admin-actions"><label className="cms-switch"><input type="checkbox" checked={section?.enabled!==false} onChange={e=>setPath(["campaignSection","enabled"],e.target.checked)}/>啟用首頁活動區</label><button className="cms-secondary-button" type="button" onClick={addCampaign}>＋ 建立活動</button></div></div>
  <div className="cms-grid two">
   <label>區塊英文小標<input value={section?.eyebrow||""} onChange={e=>setPath(["campaignSection","eyebrow"],e.target.value)}/></label>
   <label>區塊標題<input value={section?.title||""} onChange={e=>setPath(["campaignSection","title"],e.target.value)}/></label>
   <label className="span-two">區塊說明<textarea value={section?.intro||""} onChange={e=>setPath(["campaignSection","intro"],e.target.value)}/></label>
   <label>顯示數量上限（0 表示不限制）<input type="number" min="0" step="1" value={Number(section?.displayLimit||0)} onChange={e=>setPath(["campaignSection","displayLimit"],Math.max(0,Number(e.target.value||0)))}/></label>
  </div>
  <div className="campaign-admin-list">{campaigns.map((campaign,index)=><article className="campaign-admin-card" key={campaign.id||index}>
   <div className="campaign-admin-title"><div><b>{campaign.id||`CAMPAIGN-${index+1}`}</b><label className="cms-switch"><input type="checkbox" checked={campaign.enabled!==false} onChange={e=>setPath(["campaigns",index,"enabled"],e.target.checked)}/>啟用</label></div><label>排序 <input type="number" step="1" value={Number(campaign.sort||0)} onChange={e=>setPath(["campaigns",index,"sort"],Number(e.target.value||0))}/></label></div>
    <div className="cms-grid two">
     <label>內部管理名稱<input value={campaign.adminName||campaign.title||""} onChange={e=>setPath(["campaigns",index,"adminName"],e.target.value)}/></label>
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
     <fieldset className="campaign-placement-field span-two"><legend>顯示位置</legend><label><input type="checkbox" checked={placementsFor(campaign).includes("frontend_campaign_section")} onChange={e=>setPlacement(campaign,index,"frontend_campaign_section",e.target.checked)}/>首頁既有活動區</label><label><input type="checkbox" checked={placementsFor(campaign).includes("product_pages")} onChange={e=>setPlacement(campaign,index,"product_pages",e.target.checked)}/>可供作品頁引用</label></fieldset>
    <div className="span-two"><MediaUploader label="Campaign 圖片／影片" usage="content" value={resolveMediaAsset(campaign.media,campaign.image)} onImageUpload={file=>uploadImage(file,["campaigns",index,"image"],`CAMPAIGN-${index+1}`,`kdcoffee-campaign-${campaign.id||index+1}`,"campaign")} onChange={media=>setPath(["campaigns",index,"media"],media)} onRemove={campaign.media?()=>setPath(["campaigns",index,"media"],undefined):undefined}/><label className="media-path-field">既有圖片路徑<input value={campaign.image||""} placeholder={`/images/campaigns/kdcoffee-campaign-${campaign.id||index+1}-v01.webp`} onChange={e=>{const image=e.target.value;setPath(["campaigns",index,"image"],image);if(campaign.media?.type==="image")setPath(["campaigns",index,"media"],image?localImageMedia(image):undefined)}}/></label></div>
   </div>
  </article>)}</div>
 </section>
}
function SectionEditor({sectionKey,name,value,setPath,uploadImage,products}:{sectionKey:string;name:string;value:any;setPath:any;uploadImage:UploadHomepageImage;products:ProductOption[]}){
 const collections=value?.cards||value?.steps||value?.images||value?.items; const collectionKey=value?.cards?"cards":value?.steps?"steps":value?.images?"images":value?.items?"items":"";
 return <section className="cms-panel home-section-editor"><div className="cms-panel-head"><div><h2>{sectionKey.toUpperCase()}｜{name}</h2><p>{value?.purpose||"前台內容管理"}</p></div></div><div className="cms-grid two">
  {value?.title!==undefined?<label>區塊標題<input value={value.title||""} onChange={e=>setPath([sectionKey,"title"],e.target.value)}/></label>:null}
  {value?.intro!==undefined?<label>區塊說明<input value={value.intro||""} onChange={e=>setPath([sectionKey,"intro"],e.target.value)}/></label>:null}
  {value?.text!==undefined?<label className="span-two">主要內文<textarea value={value.text||""} onChange={e=>setPath([sectionKey,"text"],e.target.value)}/></label>:null}
 </div>
 {sectionKey==="home004"?<Home004Editor value={value} products={products} setPath={setPath}/>:null}
 {sectionKey==="home006"?<div className="cms-grid two"><label>按鈕文字<input value={value.button||""} onChange={e=>setPath([sectionKey,"button"],e.target.value)}/></label><label>連結<input value={value.href||""} onChange={e=>setPath([sectionKey,"href"],e.target.value)}/></label><div className="span-two"><MediaUploader label={`${value.imageId||"IMG0601"}｜圖片／影片（圖片建議 1200×900）`} usage="content" value={resolveMediaAsset(value.media,value.image)} onImageUpload={file=>uploadImage(file,[sectionKey,"image"],value.imageId||"IMG0601")} onChange={media=>setPath([sectionKey,"media"],media)} onRemove={value.media?()=>setPath([sectionKey,"media"],undefined):undefined}/></div><label className="span-two">圖片生成提示詞<textarea value={value.prompt||""} onChange={e=>setPath([sectionKey,"prompt"],e.target.value)}/></label></div>:null}
 {collections?<div className="home-card-editor-grid">{collections.map((item:any,index:number)=><article className="home-card-editor" key={item.id||index}><div className="asset-id-row"><b>{item.id||`${sectionKey}-${index+1}`}</b><span>{item.imageId||"文字卡"}</span></div>{item.imageId?<><MediaUploader label={sectionKey==="home003"?`${item.imageId}｜HOME003 情境圖片／影片`:`${item.imageId}｜圖片／影片（圖片建議 ${sectionKey==="home007"?"800×1000":"800×800"}）`} usage="content" value={resolveMediaAsset(item.media,item.image)} onImageUpload={file=>uploadImage(file,[sectionKey,collectionKey,index,"image"],item.imageId,item.seoFilename,sectionKey==="home003"?"home003":undefined)} onChange={media=>setPath([sectionKey,collectionKey,index,"media"],media)} onRemove={item.media?()=>setPath([sectionKey,collectionKey,index,"media"],undefined):undefined}/>{sectionKey==="home003"?<label className="media-path-field">既有圖片路徑<input value={item.image||""} placeholder={`/images/home003/${item.seoFilename}-v01.webp`} onChange={e=>{const image=e.target.value;setPath([sectionKey,collectionKey,index,"image"],image);if(item.media?.type==="image")setPath([sectionKey,collectionKey,index,"media"],image?localImageMedia(image):undefined)}}/></label>:null}</>:null}{sectionKey==="home003"?<div className="scene-file-guidance"><span>建議檔名 <code>{item.seoFilename}</code></span><span>比例 <b>{item.ratio}</b></span><span>尺寸 <b>{item.recommendedSize}</b></span></div>:null}{item.title!==undefined?<label>標題<input value={item.title||""} onChange={e=>setPath([sectionKey,collectionKey,index,"title"],e.target.value)}/></label>:null}{item.text!==undefined?<label>內文<textarea value={item.text||""} onChange={e=>setPath([sectionKey,collectionKey,index,"text"],e.target.value)}/></label>:null}{item.alt!==undefined?<label>SEO ALT<input value={item.alt||""} onChange={e=>setPath([sectionKey,collectionKey,index,"alt"],e.target.value)}/></label>:null}{sectionKey==="home003"?<div className="scene-asset-spec">
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
function PromptField({title,value,onChange}:{title:string;value:string;onChange:(value:string)=>void}){const [copied,setCopied]=useState(false);const copy=async()=>{await navigator.clipboard.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),1500)};return <div className="prompt-field"><div className="prompt-field-head"><strong>{title}</strong><button type="button" onClick={copy}>{copied?"已複製":"一鍵複製"}</button></div><textarea value={value} onChange={e=>onChange(e.target.value)}/></div>}
