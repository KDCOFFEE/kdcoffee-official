"use client";
/* eslint-disable @next/next/no-img-element -- Native uploaded images, matching existing attachment storage and thumbnails. */
import {useEffect,useRef,useState} from "react";
import {createPortal} from "react-dom";
import styles from "./AttachmentLightbox.module.css";
export default function AttachmentLightbox({src,alt,imageClassName,width,height,loading}:{src:string;alt:string;imageClassName?:string;width?:number;height?:number;loading?:"lazy"|"eager"}){
 const [open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null),dialog=useRef<HTMLDialogElement>(null),closeButton=useRef<HTMLButtonElement>(null);
 function close(){dialog.current?.close();setOpen(false);trigger.current?.focus({preventScroll:true});}
 useEffect(()=>{if(!open)return;const modal=dialog.current;if(!modal)return;const previousOverflow=document.body.style.overflow;document.body.style.overflow="hidden";if(!modal.open)modal.showModal();closeButton.current?.focus({preventScroll:true});return()=>{document.body.style.overflow=previousOverflow;};},[open]);
 return <><button ref={trigger} type="button" className={styles.trigger} aria-haspopup="dialog" aria-label={"放大查看："+alt} onClick={()=>setOpen(true)}><img src={src} alt={alt} className={imageClassName} width={width} height={height} loading={loading}/></button>
 {open?createPortal(<dialog ref={dialog} className={styles.dialog} aria-modal="true" aria-label={"圖片預覽："+alt} onCancel={event=>{event.preventDefault();close();}} onClose={()=>{setOpen(false);trigger.current?.focus({preventScroll:true});}} onClick={event=>{if(event.target===event.currentTarget)close();}}>
 <button ref={closeButton} type="button" className={styles.close} aria-label="關閉圖片預覽" onClick={close}>×</button><img className={styles.fullImage} src={src} alt={alt}/>
 </dialog>,document.body):null}</>;
}
