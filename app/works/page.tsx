import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ProductVisualMedia from "@/components/commerce/ProductVisualMedia";
import { getLiveWebsiteData } from "@/data/websiteData";
import { resolveListAsset } from "@/lib/productVisualAssets";

export const metadata={title:"本月咖啡作品｜KD Coffee 咖啡藝術工坊",description:"查看 KD Coffee 本月咖啡作品、風味、價格與購買規格。第一次喝精品咖啡，也能快速找到適合自己的味道。"};
export const dynamic="force-dynamic";

export default async function WorksPage(){
  const live=await getLiveWebsiteData();
  const products=live.menu.products.filter((p:any)=>p.inMonthlyMenu&&p.status!=="hidden"&&p.status!=="discontinued"&&(p.status!=="sold_out"||p.showWhenSoldOut!==false)).sort((a:any,b:any)=>Number(a.sort||0)-Number(b.sort||0));
  return <main className="works-page"><Header/>
    <section className="works-hero sales-catalog-hero"><p className="eyebrow">{live.menu.monthLabel}</p><h1>不用先懂咖啡，<br/>先從你喜歡的味道開始。</h1><p>{live.menu.intro}</p><div className="catalog-jump-links"><a href="#catalog">查看全部作品</a><Link href="/#beginner">不知道怎麼選？看入門推薦</Link></div></section>
    <section className="works-catalog section-light"><div className="works-catalog-head"><span>本月共 {products.length} 件作品</span><p>每張卡片都直接顯示風味、價格與供應狀態。</p></div>
      <div id="catalog" className="works-grid sales-catalog-grid conversion-catalog-grid">{products.map((product:any,index:number)=>{
        const d=product.displayFields||{};
        const facts=[d.origin!==false?product.origin:null,d.process!==false?product.process:null,d.roast!==false?product.roast:null].filter(Boolean);
        const minPrice=product.purchase?.length?Math.min(...product.purchase.map((o:any)=>o.price)):null;
        const soldOut=product.status==='sold_out'||product.purchasable===false;
        const listAsset=resolveListAsset(product);
        return <article className={`catalog-card sales-catalog-card conversion-catalog-card ${soldOut?'is-sold-out':''}`} key={product.slug}>
          <Link className={`catalog-cover visual-${product.visualTone}`} href={`/works/${product.slug}`}><ProductVisualMedia src={listAsset?.path} alt={listAsset?.alt||`${product.name} 主視覺`} className="product-list-image"/><span className="cover-index">{String(index+1).padStart(2,'0')}</span><span className="cover-artist">{product.artist}</span><div className="cover-art" aria-hidden="true"><i/><b/><em/></div>{product.tag?<span className="cover-tag">{product.tag}</span>:null}{soldOut?<span className="sold-out-overlay">暫時售完</span>:null}</Link>
          <div className="catalog-copy"><div><h2>{product.name}</h2>{d.shortCopy!==false?<p>{product.shortCopy || product.subtitle}</p>:null}{product.flavors?.length?<div className="catalog-flavors">{product.flavors.slice(0,4).map((flavor:string)=><span key={flavor}>{flavor}</span>)}</div>:null}{facts.length?<small>{facts.join(' · ')}</small>:null}</div><div className="catalog-commerce conversion-card-commerce"><p><span>{soldOut ? "供應狀態" : "售價"}</span><strong>{soldOut ? "暫時售完" : minPrice!==null ? `NT$ ${minPrice.toLocaleString('zh-TW')} 起` : "歡迎詢問"}</strong></p><Link href={`/works/${product.slug}`}>查看作品 <i>→</i></Link></div></div>
        </article>})}</div>
    </section><Footer/></main>
}
