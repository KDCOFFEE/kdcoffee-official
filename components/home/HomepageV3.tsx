import Link from "next/link";
import type { HomepageData } from "@/data/homepageData";
import HomepageSceneMedia from "@/components/home/HomepageSceneMedia";
import MonthlyCampaign from "@/components/home/MonthlyCampaign";
import Home004ProductMedia from "@/components/home/Home004ProductMedia";
import { hasAvailableHome004Sku, resolveHome004Recommendations } from "@/lib/home004Recommendations";
import { resolveListAsset } from "@/lib/productVisualAssets";

type Product = {
  slug:string; name:string; subtitle?:string; shortCopy?:string; cover?:string; poster?:string;
  active?:boolean; status?:string; purchasable?:boolean; inMonthlyMenu?:boolean; skus?:unknown;
  assets?:Record<string,unknown>; pageLayout?:Record<string,unknown>;
  purchase?:Array<{label:string;detail:string;price:number;kind?:string}>;
};

function Media({src,alt,id}:{src?:string;alt:string;id:string}){
  return <div className="v3-media">{src?<img src={src} alt={alt}/>:<div className="v3-media-placeholder"><b>{id}</b><span>請至後台上傳圖片</span></div>}</div>;
}

export default function HomepageV3({homepageData,products}:{homepageData:HomepageData & any;products:Product[]}){
 const h:any=homepageData;
 const hero=h.hero||{};
 const why=h.home002||{};
 const entries=h.home003||{};
 const starter=h.home004||{};
 const process=h.home005||{};
 const roast=h.home006||{};
 const art=h.home007||{};
 const studio=h.home008||{};
 const reviews=h.home009||{};
 const cta=h.home010||{};
 const home004Resolution=resolveHome004Recommendations(starter.productSlugs,products);
 const selected=home004Resolution.recommendations;
 return <>
  <section id="top" className="v3-hero">
   <video className="v3-hero-video" autoPlay muted loop playsInline poster={hero.poster} aria-label="KD Coffee 真實烘豆影片">
    {hero.videoWebm?<source src={hero.videoWebm} type="video/webm"/>:null}
    {hero.videoMp4?<source src={hero.videoMp4} type="video/mp4"/>:null}
   </video><div className="v3-hero-shade"/>
   <div className="v3-hero-content">
    <p className="v3-eyebrow">{hero.eyebrow}</p>
    <h1>{(hero.titleLines||[]).map((x:string,i:number)=><span key={i}>{x}</span>)}</h1>
    <p className="v3-hero-lead">{hero.lead}</p>
    <div className="v3-actions"><Link className="v3-button primary" href={hero.buttonHref||"#home003"}>{hero.buttonLabel||"開始挑咖啡"}</Link><Link className="v3-button ghost" href={hero.secondaryHref||"#home004"}>{hero.secondaryLabel||"本月作品"}</Link></div>
    <div className="v3-trust"><span>不用登入即可購買</span><span>7-ELEVEN 取貨付款</span><span>工作室自取</span></div>
   </div>
  </section>

  <section id="home002" className="v3-section v3-why">
   <div className="v3-why-heading">
    <p className="v3-section-code">HOME002 · WHY KD COFFEE</p>
    <div className="v3-why-title-row">
     <h2>{why.title}</h2>
     <p>{why.intro}</p>
    </div>
   </div>
   <div className="v3-value-grid">{(why.cards||[]).map((c:any,index:number)=><article key={c.id} className="v3-value-card">
    <div className="v3-value-media">
     {c.image?<img src={c.image} alt={c.alt||c.title}/>:<div className="v3-value-placeholder"><span>{c.imageId}</span><strong>{["自製流床式熱風烘豆機","紅外線熱顯像與杯測","少量庫存與充氮包裝","工作室包裝與出貨"][index]||"待補品牌照片"}</strong><small>請至後台 HOME002 上傳真實照片</small></div>}
    </div>
    <div className="v3-card-copy">
     <div className="v3-card-number">{String(index+1).padStart(2,"0")}</div>
     <small>{c.id}</small><h3>{c.title}</h3><p>{c.text}</p>
    </div>
   </article>)}</div>
   <p className="v3-why-closing">你買到的不只是咖啡，還有每一個我們願意多花時間完成的細節。</p>
  </section>

  <section id="home003" className="v3-section v3-entry v3-scenes">
   <header className="v3-section-head centered"><p>HOME003 · COFFEE MOMENTS</p><h2>{entries.title}</h2><div>{entries.intro}</div></header>
   <div className="v3-scene-grid">{(entries.cards||[]).map((c:any,index:number)=><Link key={c.id} className={`v3-scene-card ${index===0?"featured":""}`} href={c.href||"/works"}>
    <HomepageSceneMedia src={c.image} alt={c.alt||c.title} imageId={c.imageId} label={c.eyebrow||c.title} recommendedSize={c.recommendedSize}/>
    <div className="v3-scene-copy"><small>{c.eyebrow||c.id}</small><h3>{c.title}</h3><p>{c.text}</p><b>{c.button||"開始"}<span>→</span></b></div>
   </Link>)}</div>
  </section>

  <MonthlyCampaign homepageData={homepageData}/>

  <section id="home004" className="v3-section v3-starter">
   <header className="v3-section-head"><p>HOME004 · FIRST ORDER</p><h2>{starter.title}</h2><div>{starter.intro}</div></header>
   {!home004Resolution.valid?<p className="v3-home004-notice">部分推薦作品目前暫時無法顯示，請由後台重新確認推薦設定。</p>:null}
   <div className="v3-product-grid">{selected.map(p=>{const listAsset=resolveListAsset(p);return <article className="v3-product" key={p.slug}><Link href={`/works/${p.slug}`}><Home004ProductMedia src={listAsset?.path} alt={listAsset?.alt||p.name} imageId={`ART-${p.slug}`}/></Link><div>{!hasAvailableHome004Sku(p)?<span className="v3-sold-out-badge">暫時售罄</span>:null}<h3>{p.name}</h3><p>{p.shortCopy||p.subtitle}</p><div className="v3-price-row">{(p.purchase||[]).slice(0,2).map(x=><span key={x.label}>{x.label}<b>NT${x.price}</b></span>)}</div><Link className="v3-text-link" href={`/works/${p.slug}`}>查看作品與規格 →</Link></div></article>})}</div>
  </section>

  <section id="home005" className="v3-section v3-process">
   <header className="v3-section-head centered"><p>HOME005 · FROM BEAN TO CUP</p><h2>{process.title}</h2><div>{process.intro}</div></header>
   <div className="v3-process-grid">{(process.steps||[]).map((s:any,i:number)=><article key={s.id}><Media src={s.image} alt={s.alt||s.title} id={s.imageId}/><span>{String(i+1).padStart(2,"0")}</span><h3>{s.title}</h3><p>{s.text}</p></article>)}</div>
  </section>

  <section id="home006" className="v3-section v3-roast-service">
   <div className="v3-roast-copy"><p>HOME006 · PERSONAL ROAST SERVICE</p><h2>{roast.title}</h2><div>{roast.text}</div><ul>{(roast.points||[]).map((x:string)=><li key={x}>{x}</li>)}</ul><Link className="v3-button primary" href={roast.href||"/works"}>{roast.button||"查看適用作品"}</Link></div><Media src={roast.image} alt={roast.alt||roast.title} id={roast.imageId||"IMG0601"}/>
  </section>

  <section id="home007" className="v3-section v3-art"><header className="v3-section-head"><p>HOME007 · COFFEE AS ART</p><h2>{art.title}</h2><div>{art.text}</div></header><div className="v3-art-strip">{(art.cards||[]).map((c:any)=><article key={c.id}><Media src={c.image} alt={c.alt||c.title} id={c.imageId}/><h3>{c.title}</h3><p>{c.text}</p></article>)}</div></section>

  <section id="home008" className="v3-section v3-studio"><div><p>HOME008 · OUR STUDIO</p><h2>{studio.title}</h2><div>{studio.text}</div></div><div className="v3-studio-grid">{(studio.images||[]).map((x:any)=><Media key={x.id} src={x.image} alt={x.alt||studio.title} id={x.imageId}/>)}</div></section>

  {reviews.enabled!==false?<section id="home009" className="v3-section v3-reviews"><header className="v3-section-head centered"><p>HOME009 · REAL VOICES</p><h2>{reviews.title}</h2><div>{reviews.intro}</div></header><div className="v3-review-grid">{(reviews.items||[]).length?(reviews.items||[]).map((r:any)=><blockquote key={r.id}><p>「{r.text}」</p><footer>{r.name}<span>{r.source}</span></footer></blockquote>):<div className="v3-review-empty">尚未新增真實評價。後台可新增 Google、Facebook 或 LINE 的真實回饋。</div>}</div></section>:null}

  <section id="home010" className="v3-final"><p>HOME010</p><h2>{cta.title}</h2><div>{cta.text}</div><Link className="v3-button light" href={cta.href||"/works"}>{cta.button||"開始挑咖啡"}</Link></section>
 </>;
}
