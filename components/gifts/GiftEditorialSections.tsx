import { giftContactHref } from "@/lib/giftCms";
import { resolveStudioContent, studioPresentationProps, type StudioPresentation } from "@/lib/storeContentPresentation";
import { StudioText, StudioVariants } from "@/components/store/StudioResponsiveContent";
import studioStyles from "@/components/store/StoreContentPresentation.module.css";
import type { GiftProductDocument, GiftEditorialSection } from "@/lib/giftCms";
import styles from "./GiftEditorialSections.module.css";
function CopyText({section}:{section:GiftEditorialSection}){
 return <div className={styles.copy}>{section.eyebrow?<p className={styles.eyebrow}>{section.eyebrow}</p>:null}{section.heading?<h2>{section.heading}</h2>:null}{section.subheading?<h3>{section.subheading}</h3>:null}{section.body.split(/\r?\n\s*\r?\n/u).filter(p=>p.trim()).map((p,index)=><p key={index}>{p}</p>)}</div>;
}
function Copy({section}:{section:GiftEditorialSection}){
 const mobile=resolveStudioContent(section,section.presentation,"mobile");
 return <StudioVariants enabled={!!section.presentation?.mobile?.content} desktop={<CopyText section={section}/>} mobile={<CopyText section={mobile}/>}/>;
}
function Picture({image,presentation,gallery=false}:{image:NonNullable<GiftEditorialSection["image"]>;presentation?:StudioPresentation;gallery?:boolean}){
 const caption=gallery?presentation?.mobile?.content?.galleryCaptions?.[image.url]:presentation?.mobile?.content?.caption;
 return <figure><img src={image.url} alt={image.alt} loading="lazy" decoding="async"/>{image.caption||caption!==undefined?<figcaption><StudioText value={image.caption} mobileValue={caption}/></figcaption>:null}</figure>;
}
function Rows({rows}:{rows:GiftEditorialSection["rows"]}){return <dl className={styles.specs}>{rows?.map((row,index)=><div key={index}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>;}
export default function GiftEditorialSections({document,label="禮盒介紹"}:{document:GiftProductDocument;label?:string}){
 return <div className={styles.sections} aria-label={label}>{document.sections.filter(s=>s.enabled).map(section=><section key={section.id} data-studio-layout={section.type} id={"gift-section-"+section.id} className={[styles.section,section.presentation?studioStyles.frame:"",styles[section.width],styles[section.background],section.type==="text_image"?styles.textImage:"",section.mediaPosition==="left"?styles.mediaLeft:""].join(" ")} style={{textAlign:section.alignment,...studioPresentationProps(section.presentation).style}} {...Object.fromEntries(Object.entries(studioPresentationProps(section.presentation)).filter(([key])=>key!=="style"))}>
 {section.type==="rich_text"?<Copy section={section}/>:null}
 {section.type==="image"&&section.image?<><Copy section={{...section,body:""}}/><Picture image={section.image} presentation={section.presentation}/></>:null}
 {section.type==="text_image"?<><Copy section={section}/>{section.image?<Picture image={section.image} presentation={section.presentation}/>:null}</>:null}
 {section.type==="gallery"?<><Copy section={{...section,body:""}}/><div className={styles.gallery} data-studio-gallery>{section.images.map((image,index)=><Picture key={index} image={image} presentation={section.presentation} gallery/>)}</div></>:null}
 {section.type==="banner"?<><Copy section={section}/>{section.image?<Picture image={section.image} presentation={section.presentation}/>:null}{section.cta?<a data-studio-cta data-variant={section.cta.style} className={styles.cta} href={giftContactHref(section.cta.target)}><StudioText value={section.cta.label} presentation={section.presentation} field="ctaLabel"/></a>:null}</>:null}
 {section.type==="specs"?<><Copy section={{...section,body:""}}/><StudioVariants enabled={section.presentation?.mobile?.content?.rows!==undefined} desktop={<Rows rows={section.rows}/>} mobile={<Rows rows={section.presentation?.mobile?.content?.rows}/>}/></>:null}
 </section>)}</div>;
}
