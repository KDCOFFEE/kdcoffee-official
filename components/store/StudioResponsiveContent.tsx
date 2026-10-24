import type { ReactNode } from "react";
import type { StudioPresentation, StudioTextField } from "@/lib/storeContentPresentation";
import styles from "./StoreContentPresentation.module.css";
/** CSS viewport resolution keeps SSR and the preview iframe on the same content rule. */
export function StudioText({value,presentation,field,mobileValue}:{value:string;presentation?:StudioPresentation;field?:StudioTextField;mobileValue?:string}){
 const content=presentation?.mobile?.content;
 const overridden=mobileValue!==undefined || !!(field&&content&&Object.hasOwn(content,field));
 if(!overridden)return <>{value}</>;
 const mobile=mobileValue!==undefined?mobileValue:content![field!] as string;
 return <><span className={styles.desktopText}>{value}</span><span className={styles.mobileText} data-empty={mobile===""?"true":undefined}>{mobile}</span></>;
}
export function StudioVariants({desktop,mobile,enabled}:{desktop:ReactNode;mobile:ReactNode;enabled:boolean}){
 if(!enabled)return <>{desktop}</>;
 return <div className={styles.responsiveBlock}><div className={styles.desktopBlock}>{desktop}</div><div className={styles.mobileBlock}>{mobile}</div></div>;
}
