import { StudioText } from "./StudioResponsiveContent";
import { Fragment, type ReactNode } from "react";
import type { StoreLandingDocument } from "@/lib/giftCms";
import { studioPresentationProps } from "@/lib/storeContentPresentation";
import GiftEditorialSections from "@/components/gifts/GiftEditorialSections";
import styles from "./StoreContentPresentation.module.css";
export default function StoreLandingSections({document,hero,categories,products}:{document?:StoreLandingDocument;hero:ReactNode;categories:ReactNode;products:ReactNode}){
 if(!document)return <>{hero}{categories}{products}</>;
 const builtins={hero,categories,products};
 const intro=(s:StoreLandingDocument["sections"][number])=>s.type==="builtin"&&s.id!=="hero"?<>{s.eyebrow||s.presentation?.mobile?.content?.eyebrow!==undefined?<p><StudioText value={s.eyebrow||""} presentation={s.presentation} field="eyebrow"/></p>:null}{s.id==="categories"&&(s.heading||s.presentation?.mobile?.content?.heading!==undefined)?<h2><StudioText value={s.heading||""} presentation={s.presentation} field="heading"/></h2>:null}{s.body||s.presentation?.mobile?.content?.body!==undefined?<p><StudioText value={s.body||""} presentation={s.presentation} field="body"/></p>:null}</>:null;
 return <>{document.sections.filter(s=>s.enabled).map(s=>s.type==="builtin"?<Fragment key={s.id}>{s.presentation?<div className={styles.frame} {...studioPresentationProps(s.presentation,s.id==="hero"?48:28,16)}>{intro(s)}{builtins[s.id]}</div>:<>{intro(s)}{builtins[s.id]}</>}</Fragment>:<GiftEditorialSections key={s.id} label="商店內容" document={{schemaVersion:1,card:{label:null,summary:null},sections:[s]}}/>)}</>;
}
export function storeCardStyle(cards?:StoreLandingDocument["cards"]){return cards?{"--studio-card-ratio":({original:"4 / 3",square:"1 / 1",landscape:"4 / 3",portrait:"3 / 4"})[cards.imageRatio],"--studio-card-title":cards.titleSize+"px","--studio-card-price":cards.priceSize+"px",...(cards.secondarySize!==null?{"--studio-card-secondary":cards.secondarySize+"px"}:{}),"--studio-card-spacing":cards.spacing+"px","--studio-point-weight":cards.pointStyle==="regular"?600:400} as import("react").CSSProperties:undefined;}
