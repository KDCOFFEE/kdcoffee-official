import Image from 'next/image';
import {CARD_TOKENS,type ResolvedNotificationCard} from '@/lib/lineNotificationCards';
import {composeLineCard} from '@/lib/lineCardPresentation';
import css from './LineNotificationCardStudio.module.css';

export default function LineNotificationCardPreview({card,compact=false}:{card:ResolvedNotificationCard;compact?:boolean}){
 const visual=composeLineCard(card);
 return <div className={compact?css.thumbnail:css.device}>
  <article className={css.bubble} style={{background:CARD_TOKENS.background,color:CARD_TOKENS.text}} aria-label={card.title}>
   <div className={css.brandStrip}><span>KD COFFEE STUDIO</span><span>{CARD_TOKENS.families[card.family]}</span></div>
   <Image className={css.hero} src={visual.imagePath} alt={visual.art.alt} width={960} height={320} unoptimized/>
   <div className={css.cardContent}>
    <h3>{card.title}</h3>
    {visual.showStatus?<span className={css.status} style={{color:CARD_TOKENS.tones[card.status.tone],background:visual.family.wash}}><span aria-hidden="true">•</span> {card.status.label}</span>:null}
    <p className={css.intro}>{card.intro}</p>
    {visual.showHighlight?<dl className={css.highlight} style={{background:visual.family.wash}}><div><dt>{visual.highlight.label}</dt><dd className={visual.highlight.key==='orderNumber'?css.orderHighlight:undefined}>{visual.highlight.value}</dd></div>{visual.highlightSupporting.map(row=><div className={css.highlightSupporting} key={row.key}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>:null}
    {visual.details.length?<dl className={css.detailGrid}>{visual.details.map(row=><div key={row.key}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>:null}
    {card.secondaryText?<p className={css.secondary}>{card.secondaryText}</p>:null}
    <div className={css.ctaArea}><span className={css.previewCta} style={{background:visual.family.accent}}>{card.cta.label}<span aria-hidden="true"> →</span></span></div>
    <footer>{card.footerText}</footer>
   </div>
  </article>
 </div>;
}
