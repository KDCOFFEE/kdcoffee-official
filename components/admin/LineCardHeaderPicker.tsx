"use client";
import Image from 'next/image';
import {useState} from 'react';
import type {AssetRecord} from '@/lib/assets';
import {isLineCardHeaderAsset,resolveLineCardHeaderAsset} from '@/lib/lineCardHeaderAssets';
import AssetUploadButton from './AssetUploadButton';
import ImageLibraryPicker from './ImageLibraryPicker';
import css from './LineNotificationCardStudio.module.css';
export default function LineCardHeaderPicker({assetId,assets,disabled,onSelect,onAsset}:{assetId:string;assets:AssetRecord[];disabled:boolean;onSelect:(id:string)=>void;onAsset:(asset:AssetRecord)=>void}){
 const [library,setLibrary]=useState<AssetRecord[]>([]),[open,setOpen]=useState(false),[loading,setLoading]=useState(false),[notice,setNotice]=useState('');
 const selected=resolveLineCardHeaderAsset(assetId,assets);
 async function choose(){setLoading(true);setNotice('');try{const response=await fetch('/api/admin/assets?purpose=line-card-header',{cache:'no-store'});const result=await response.json();if(!response.ok||!Array.isArray(result.assets))throw Error(result.error||'素材庫無法讀取。');setLibrary(result.assets.filter(isLineCardHeaderAsset));setOpen(true);}catch(error){setNotice((error as Error).message);}finally{setLoading(false);}}
 return <section className={css.headerPicker} aria-label="自訂抬頭圖片"><p>建議尺寸：960 × 320 px · 建議比例：3:1<br/>支援 JPG、PNG、WebP，最大 5 MB。預覽與 LINE 皆使用置中 3:1 裁切。</p>
 {selected?<div className={css.selectedAsset}><Image src={selected.path} alt={selected.alt||selected.name} width={180} height={60} unoptimized/><div><strong>{selected.name}</strong><small>{selected.displaySize||selected.recommendedSize}</small></div></div>:assetId?<p>原圖片已無法使用，目前顯示系列預設；請更換圖片。</p>:null}
 <div className={css.editorActions}><button type="button" disabled={disabled||loading} onClick={()=>void choose()}>{loading?'讀取素材庫…':assetId?'更換圖片':'從素材庫選擇'}</button>
 <AssetUploadButton uploadUrl="/api/admin/assets/upload?purpose=line-card-header" accept="image/jpeg,image/png,image/webp" disabled={disabled} onError={setNotice} onUploaded={asset=>{onAsset(asset);onSelect(asset.id);setNotice('圖片已加入素材庫並選入草稿，請儲存卡片設定。');}}/>
 <button type="button" disabled={disabled} onClick={()=>onSelect('')}>恢復系列預設</button></div><p>上傳不會自動儲存卡片；捨棄草稿後，圖片仍保留在素材庫。</p>
 {notice?<p role="status">{notice}</p>:null}
 {open?<div onKeyDown={event=>{if(event.key==='Escape')setOpen(false);}}><ImageLibraryPicker showCategory title="選擇 LINE 抬頭圖片" assets={library} onClose={()=>setOpen(false)} onChoose={asset=>{onAsset(asset);onSelect(asset.id);setOpen(false);}}/></div>:null}
 </section>;
}
