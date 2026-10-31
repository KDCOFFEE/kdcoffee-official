"use client";
import {useEffect,useId,useRef,useState} from "react";
import {searchRefundBanks} from "@/lib/taiwanRefundBanks";
import styles from "./ReturnWorkflow.module.css";
export default function RefundBankCombobox({disabled,error,label,placeholder,onEdited}:{disabled:boolean;error?:string;label:string;placeholder:string;onEdited?:()=>void}){
 const id=useId(),list=useRef<HTMLUListElement>(null),[value,setValue]=useState(""),[open,setOpen]=useState(false),[active,setActive]=useState(-1);
 const options=searchRefundBanks(value).slice(0,30);const choose=(index:number)=>{const bank=options[index];if(bank){setValue(bank.code+"｜"+bank.name);setOpen(false);setActive(-1);onEdited?.();}};
 useEffect(()=>{if(open&&active>=0)list.current?.children[active]?.scrollIntoView({block:"nearest"});},[open,active]);
 function move(next:number){if(!options.length){setActive(-1);setOpen(false);return;}const index=Math.max(0,Math.min(options.length-1,next));setActive(index);setOpen(true);}
 return <label className={styles.bankSearch}>{label}<input name="refund_bank" autoComplete="off" maxLength={100} disabled={disabled} role="combobox" aria-autocomplete="list" aria-expanded={open&&options.length>0} aria-controls={id+"-options"} aria-activedescendant={open&&active>=0?id+"-"+active:undefined} aria-invalid={!!error} aria-describedby={error?id+"-error":undefined} placeholder={placeholder} value={value} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onChange={e=>{setValue(e.target.value);setActive(-1);setOpen(true);}} onKeyDown={e=>{if(e.key==="ArrowDown"){e.preventDefault();move(active+1);}else if(e.key==="ArrowUp"){e.preventDefault();move(active<0?options.length-1:active-1);}else if(e.key==="Enter"&&open&&active>=0){e.preventDefault();choose(active);}else if(e.key==="Escape"){e.preventDefault();setOpen(false);}}}/>
 {open&&options.length?<ul id={id+"-options"} ref={list} role="listbox" className={styles.bankOptions}>{options.map((bank,index)=><li id={id+"-"+index} key={bank.code} role="option" aria-selected={index===active} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(index)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();choose(index);}}}><span>{bank.code}｜</span>{bank.name}</li>)}</ul>:<ul id={id+"-options"} role="listbox" hidden/>}
 {error?<small id={id+"-error"} className={styles.fieldError} role="alert">{error}</small>:null}</label>;
}
