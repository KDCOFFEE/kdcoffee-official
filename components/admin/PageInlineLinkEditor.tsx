"use client";
import { useRef, useState } from "react";
import SmartLinkPicker from "./SmartLinkPicker";
import type { CmsLinkProduct, PublishedCmsPage, StructuredCmsLink } from "@/lib/cmsLinks";
import { newBuilderId, type PageBodyLink } from "@/lib/pageBuilder";

/** Keep unaffected ranges stable through ordinary typing/paste; discard links touched by edits. */
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

export default function PageInlineLinkEditor({body,links,onChange,products,pages}:{body:string;links:PageBodyLink[];onChange:(body:string,links:PageBodyLink[])=>void;products:CmsLinkProduct[];pages:PublishedCmsPage[]}) {
  const textareaRef=useRef<HTMLTextAreaElement|null>(null);
  const [selection,setSelection]=useState<{start:number;end:number;text:string}|null>(null);
  const [adding,setAdding]=useState(false);
  const capture=()=>{const input=textareaRef.current;if(!input) return;const {selectionStart:start,selectionEnd:end}=input;setSelection(start<end?{start,end,text:body.slice(start,end)}:null);};
  const add=(link:StructuredCmsLink)=>{
    if(!selection || body.slice(selection.start,selection.end)!==selection.text) return;
    const others=links.filter(item=>item.end<=selection.start||item.start>=selection.end);
    const inserted:PageBodyLink={id:newBuilderId("bodylink"),...selection,link};
    onChange(body,[...others,inserted].sort((a,b)=>a.start-b.start));
    setAdding(false);setSelection(null);
  };
  return <div className="span-two" style={{display:"grid",gap:12}}>
    <label>內容（可自然換行）<textarea ref={textareaRef} value={body} maxLength={5000} onChange={event=>{const next=event.target.value;onChange(next,shiftBodyLinks(body,next,links));}} onSelect={capture}/></label>
    <div className="page-inline-link-tools">
      <button type="button" className="cms-secondary-button" disabled={!selection || adding} onClick={()=>setAdding(true)}>＋ 將選取文字設成連結</button>
      <small>{selection ? "已選取：「" + selection.text + "」" : "先在上方內文選取需要連結的文字"}</small>
    </div>
    {adding?<section className="owner-surface" style={{padding:16}}><strong>設定文字連結：{selection?.text}</strong><SmartLinkPicker editorId="body-inline-link-new" label="選擇連結目標" value={null} onChange={add} products={products} pages={pages}/><button type="button" className="cms-secondary-button" onClick={()=>setAdding(false)}>取消</button></section>:null}
    {links.length>0?<section className="owner-surface" style={{padding:16}}><strong>已設定的內文連結（{links.length}）</strong>{[...links].sort((a,b)=>a.start-b.start).map(item=><div key={item.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginTop:10}}><span>{item.text}</span><button type="button" className="cms-secondary-button" onClick={()=>onChange(body,links.filter(v=>v.id!==item.id))}>移除連結</button></div>)}</section>:null}
  </div>;
}
