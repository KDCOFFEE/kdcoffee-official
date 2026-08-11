import Link from "next/link";
import { getLiveWebsiteData } from "@/data/websiteData";

export default async function BeginnerGuide() {
  const live = await getLiveWebsiteData();
  const products = live.menu.products.filter((p) => p.inMonthlyMenu && p.status === "active");
  const beginner = products.find((p) => p.tag?.includes("入門")) || products.find((p) => p.showOnHomepage) || products[0];
  const fruity = products.find((p) => p.flavors.some((f) => /水蜜桃|莓|柑橘|葡萄柚|檸檬|水果/.test(f))) || products[1];
  const gift = products.find((p) => p.purchase.some((o) => o.label.includes("耳掛"))) || products[2];
  const cards = [
    { label: "怕太酸、怕太苦", title: "第一次喝精品咖啡", copy: "從接受度高、甜感清楚的作品開始，最不容易踩雷。", product: beginner, cta: "看入門首選" },
    { label: "喜歡果茶般香氣", title: "想喝明亮水果香", copy: "選擇果香清楚、口感乾淨的淺焙或淺中焙作品。", product: fruity, cta: "看果香推薦" },
    { label: "方便沖、也適合送人", title: "耳掛試喝與送禮", copy: "不需要器材，每包獨立充氮，第一次購買與送禮都輕鬆。", product: gift, cta: "看耳掛作品" },
  ].filter((item) => item.product);
  return (
    <section id="beginner" className="beginner-guide section-light">
      <div className="beginner-shell">
        <header><p className="eyebrow dark">CHOOSE WITH CONFIDENCE</p><h2>不知道怎麼選？<br />先從你的需求開始。</h2><p>不需要先研究產區、品種與處理法。先告訴我們你想喝什麼感覺，再認識咖啡也不遲。</p></header>
        <div className="beginner-grid">{cards.map((item, index) => <article key={item.title}><span>0{index + 1}</span><small>{item.label}</small><h3>{item.title}</h3><p>{item.copy}</p><div className="beginner-product"><b>{item.product!.name}</b><em>NT$ {Math.min(...item.product!.purchase.map((o) => o.price)).toLocaleString("zh-TW")} 起</em></div><Link href={`/works/${item.product!.slug}`}>{item.cta} <i>→</i></Link></article>)}</div>
      </div>
    </section>
  );
}
