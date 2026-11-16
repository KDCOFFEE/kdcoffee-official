"use client";
import { useRef, useState } from "react";
import SmartLinkPicker from "./SmartLinkPicker";
import MediaUploader from "./MediaUploader";
import ImageLibraryPicker from "./ImageLibraryPicker";
import MediaAltEditor from "./MediaAltEditor";
import { resolveAssetAlt } from "@/lib/assetMetadata";
import { replacementMediaDescription } from "@/lib/mediaAlt";
import { localImageMedia, youtubeMedia, type MediaAsset } from "@/lib/media";
import { normalizeYouTubeVideoId } from "@/lib/youtubeMedia";
import type { AssetRecord } from "@/lib/assets";
import type { CmsLinkProduct, PublishedCmsPage, StructuredCmsLink } from "@/lib/cmsLinks";
import { newBuilderId, type PageBodyLink, type PageBodyMedia } from "@/lib/pageBuilder";

/** Preserve unaffected links when typing or pasting; discard links whose characters changed. */
export function shiftBodyLinks(before:string, after:string, links:PageBodyLink[]):PageBodyLink[] {
  if (before===after) return links;
  let prefix=0;
  while(prefix<before.length && prefix<after.length && before[prefix]===after[prefix]) prefix++;
  let suffix=0;
  while(suffix<before.length-prefix && suffix<after.length-prefix && before[before.length-1-suffix]===after[after.length-1-suffix]) suffix++;
  const oldEnd=before.length-suffix; const delta=after.length-before.length;
  return links.flatMap(item=> {
    if (item.end<=prefix) return [item];
    if (item.start>=oldEnd) return [{...item,start:item.start+delta,end:item.end+delta}];
    return [];
  });
}

/** Inserting/deleting text adjusts anchors; editing across an anchor keeps its media at the edit boundary. */
export function shiftBodyMedia(before:string,after:string,media:PageBodyMedia[]):PageBodyMedia[] {
  if(before===after) return media;
  let prefix=0;
  while(prefix<before.length&&prefix<after.length&&before[prefix]===after[prefix]) prefix++;
  let suffix=0;
  while(suffix<before.length-prefix&&suffix<after.length-prefix&&before[before.length-1-suffix]===after[after.length-1-suffix]) suffix++;
  const oldEnd=before.length-suffix, delta=after.length-before.length;
  return media.map(item=>({...item,position:item.position<=prefix?item.position:item.position>=oldEnd?item.position+delta:prefix}));
}

type Props={body:string;links:PageBodyLink[];media:PageBodyMedia[];onChange:(body:string,links:PageBodyLink[],media:PageBodyMedia[])=>void;products:CmsLinkProduct[];pages:PublishedCmsPage[];assets:AssetRecord[];onAssetAdded:(asset:AssetRecord)=>void};
export default function PageInlineLinkEditor({body,links,media,onChange,products,pages,assets,onAssetAdded}:Props) {
  const textareaRef=useRef<HTMLTextAreaElement|null>(null);
  const [selection,setSelection]=useState<{start:number;end:number;text:string}|null>(null);
  const [cursor,setCursor]=useState<number|null>(null);
  const [adding,setAdding]=useState(false);
  const [pickerOpen,setPickerOpen]=useState(false);
  const [youtubeUrl,setYoutubeUrl]=useState("");
  const capture=()=>{const input=textareaRef.current;if(!input)return;const {selectionStart:start,selectionEnd:end}=input;setCursor(start);setSelection(start<end?{start,end,text:body.slice(start,end)}:null);};
  const safePosition=()=>{
    const wanted=Math.max(0,Math.min(body.length,cursor ?? body.length));
    const within=links.find(item=>item.start<wanted&&wanted<item.end);
    return within?within.end:wanted;
  };
  const saveMedia=(next:PageBodyMedia[])=>onChange(body,links,next);
  const addMedia=(asset:MediaAsset)=>{
    if(media.length>=12){alert("同一文字區塊最多 12 個文章媒體。");return;}
    const position=safePosition();
    const description=replacementMediaDescription(undefined,asset,"文章媒體");
    const next:PageBodyMedia={id:newBuilderId("bodymedia"),enabled:true,position,...description,media:asset,alt:description.alt||""};
    saveMedia([...media,next]);
  };
  async function uploadImage(file:File):Promise<MediaAsset> {
    const form=new FormData();form.append("file",file);
    const response=await fetch("/api/admin/pages/images",{method:"POST",body:form});
    const data=await response.json() as {error?:string;asset?:AssetRecord;media?:MediaAsset};
    if(!response.ok||!data.asset||!data.media)throw new Error(data.error||"圖片上傳失敗。");
    onAssetAdded(data.asset);
    return {...data.media,alt:resolveAssetAlt({alt:data.asset.alt})};
  }
  const chooseAsset=(asset:AssetRecord)=>{addMedia({...localImageMedia(asset.path),alt:resolveAssetAlt({alt:asset.alt})});setPickerOpen(false);};
  const addYoutube=()=>{try{const id=normalizeYouTubeVideoId(youtubeUrl);addMedia(youtubeMedia(id,youtubeUrl));setYoutubeUrl("");}catch{alert("請輸入有效的 YouTube 影片網址。");}};
  const setMedia=(id:string,patch:Partial<PageBodyMedia>)=>saveMedia(media.map(item=>item.id===id?{...item,...patch}:item));
  const addLink=(link:StructuredCmsLink)=>{
    if(!selection||body.slice(selection.start,selection.end)!==selection.text)return;
    const others=links.filter(item=>item.end<=selection.start||item.start>=selection.end);
    const inserted:PageBodyLink={id:newBuilderId("bodylink"),...selection,link};
    onChange(body,[...others,inserted].sort((a,b)=>a.start-b.start),media.map(item=>item.position>selection.start&&item.position<selection.end?{...item,position:selection.end}:item));
    setAdding(false);setSelection(null);
  };
  return <div className="span-two" style={{display:"grid",gap:12}}>
    <label>內容（可自然換行）<textarea ref={textareaRef} value={body} maxLength={5000} onChange={event=>{const next=event.target.value;onChange(next,shiftBodyLinks(body,next,links),shiftBodyMedia(body,next,media));setCursor(event.target.selectionStart);}} onSelect={capture}/></label>
    <div className="page-inline-link-tools">
      <button type="button" className="cms-secondary-button" disabled={!selection||adding} onClick={()=>setAdding(true)}>＋ 將選取文字設成連結</button>
      <small>{selection?"已選取：「"+selection.text+"」":"先選取要連結的文字；插入媒體請將游標放在要顯示的位置"}</small>
    </div>
    {adding?<section className="owner-surface" style={{padding:16}}><strong>設定文字連結：{selection?.text}</strong><SmartLinkPicker editorId="body-inline-link-new" label="選擇連結目標" value={null} onChange={addLink} products={products} pages={pages}/><button type="button" className="cms-secondary-button" onClick={()=>setAdding(false)}>取消</button></section>:null}
    {links.length>0?<section className="owner-surface" style={{padding:16}}><strong>已設定的內文連結（{links.length}）</strong>{[...links].sort((a,b)=>a.start-b.start).map(item=><div key={item.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginTop:10}}><span>{item.text}</span><button type="button" className="cms-secondary-button" onClick={()=>onChange(body,links.filter(v=>v.id!==item.id),media)}>移除連結</button></div>)}</section>:null}
    <section className="page-subeditor page-media-editor">
      <header><div><h3>文章內圖片／影片</h3><p>先把文字游標放在希望顯示的位置，再使用既有素材庫或上傳。圖片 SEO／Alt 與影片播放均沿用原系統；移除只解除本頁引用。</p></div></header>
      <div className="media-add-panel"><div className="page-image-actions">
        <button type="button" className="cms-secondary-button" disabled={media.length>=12} onClick={()=>setPickerOpen(true)}>從既有素材庫插入圖片</button>
        <MediaUploader label="插入圖片或影片" contextKey="cms-inline-body" usage="content" showPreview={false} onImageUpload={uploadImage} imageActionLabel="上傳圖片並插入" videoActionLabel="上傳影片並插入" onChange={addMedia}/>
      </div><div className="youtube-add"><label>YouTube 影片網址<input value={youtubeUrl} onChange={event=>setYoutubeUrl(event.target.value)}/></label><button type="button" disabled={!youtubeUrl.trim()||media.length>=12} onClick={addYoutube}>＋插入 YouTube</button></div></div>
      {pickerOpen?<ImageLibraryPicker assets={assets} onChoose={chooseAsset} onClose={()=>setPickerOpen(false)}/>:null}
      {media.length?<div className="page-inline-media-list">{[...media].sort((a,b)=>a.position-b.position).map((item,i)=><article key={item.id} className="owner-surface page-media-card">
        <div className="subeditor-heading"><strong>文章媒體 {i+1}：{item.media.type==="image"?"圖片":item.media.type==="video"?"影片":"YouTube"}</strong></div>
        <MediaUploader label="媒體預覽／替換" contextKey={item.id} value={item.media} usage="content" onImageUpload={uploadImage} imageActionLabel="上傳圖片替換" onChange={value=>setMedia(item.id,replacementMediaDescription(item,value,"文章媒體"))}/>
        <div className="cms-grid two"><MediaAltEditor alt={item.alt} decorative={item.decorative} onChange={v=>setMedia(item.id,v)}/><label>媒體標題（選填）<input maxLength={180} value={item.title||""} onChange={event=>setMedia(item.id,{title:event.target.value})}/></label></div>
        <div className="subeditor-actions"><span>插入位置：內文第 {item.position} 個字元後</span><button type="button" className="cms-secondary-button" onClick={()=>setMedia(item.id,{position:safePosition()})}>移至目前游標位置</button><button type="button" className="cms-secondary-button" onClick={()=>setMedia(item.id,{enabled:!item.enabled})}>{item.enabled?"暫時隱藏":"恢復顯示"}</button><button type="button" className="cms-danger-button" onClick={()=>confirm("確定解除文章中這個媒體引用？不會刪除素材庫原檔。")&&saveMedia(media.filter(v=>v.id!==item.id))}>移除引用</button></div>
      </article>)}</div>:null}
    </section>
  </div>;
}
