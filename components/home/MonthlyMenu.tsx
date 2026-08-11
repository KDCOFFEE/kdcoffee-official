import Link from "next/link";
import { getLiveWebsiteData } from "@/data/websiteData";

export default async function MonthlyMenu() {
  const live = await getLiveWebsiteData();
  const products = live.menu.products.filter((product) => product.inMonthlyMenu && product.status !== "hidden" && product.status !== "discontinued").sort((a,b)=>Number(a.sort||0)-Number(b.sort||0));
  const featured = products.filter((product) => product.showOnHomepage && (product.status !== "sold_out" || product.showWhenSoldOut !== false)).slice(0, 3);
  return <section id="products" className="home-works section-light sales-products">
    <div className="home-works-shell">
      <header className="home-works-head"><div><p className="eyebrow dark">BEST PICKS THIS MONTH</p><h2>本月最值得先喝的 3 款</h2></div><div className="home-works-intro"><p>先看少數真正推薦的作品，快速比較風味、價格與適合對象。</p><Link href="/works">瀏覽全部 {products.length} 款 <span>→</span></Link></div></header>
      <div className="home-works-grid sales-product-grid">{featured.map((product, index) => {
        const minPrice = Math.min(...product.purchase.map((item) => item.price));
        const suitable = product.tag?.includes("入門") ? "第一次喝精品咖啡" : product.flavors.slice(0,2).join("、");
        return <article className="sales-product-card" key={product.slug}>
          <Link className={`work-cover visual-${product.visualTone}`} href={`/works/${product.slug}`}>
            {product.cover ? <img src={product.cover} alt={`${product.name} 主視覺`} /> : null}
            <span className="cover-index">TOP {index + 1}</span><span className="cover-artist">{product.artist}</span><div className="cover-art" aria-hidden="true"><i/><b/><em/></div>{product.tag ? <span className="cover-tag">{product.tag}</span> : null}
          </Link>
          <div className="sales-product-copy"><div><p className="sales-suitable">適合｜{suitable}</p><h3>{product.name}</h3><p>{product.shortCopy || product.subtitle}</p><div className="sales-flavors">{product.flavors.slice(0,4).map((f) => <span key={f}>{f}</span>)}</div></div><div className="sales-product-bottom"><p><small>售價</small><strong>NT$ {minPrice.toLocaleString("zh-TW")} 起</strong></p><Link href={`/works/${product.slug}`}>查看與購買 <span>→</span></Link></div></div>
        </article>})}</div>
      <Link className="all-works-button" href="/works"><span>查看本月完整豆單與價格</span><i aria-hidden="true">→</i></Link>
    </div>
  </section>;
}
