import Link from "next/link";
import type { HomepageData } from "@/data/homepageData";
import KdMedia from "@/components/media/KdMedia";
import { resolveMediaAsset } from "@/lib/media";

export default function SalesHero({ homepageData }: { homepageData: HomepageData }) {
  const hero = homepageData.hero;
  const lines = Array.isArray(hero.titleLines) && hero.titleLines.length
    ? hero.titleLines
    : ["不用先懂咖啡，", "第一包就選到你真正喜歡的味道。"];

  return (
    <section id="top" className="sales-hero">
      {resolveMediaAsset(hero.media) ? (
        <KdMedia media={resolveMediaAsset(hero.media)} alt="KD Coffee 首頁主視覺" className="sales-hero-video" fallbackImageUrl={hero.poster} backgroundVideo eager />
      ) : hero.videoWebm || hero.videoMp4 ? (
        <video className="sales-hero-video" autoPlay muted loop playsInline poster={hero.poster} aria-label="KD Coffee 熱風烘焙畫面">
          {hero.videoWebm ? <source src={hero.videoWebm} type="video/webm" /> : null}
          {hero.videoMp4 ? <source src={hero.videoMp4} type="video/mp4" /> : null}
        </video>
      ) : hero.poster ? <img className="sales-hero-video" src={hero.poster} alt="KD Coffee 首頁主視覺" /> : null}
      <div className="sales-hero-overlay" />
      <div className="sales-hero-shell">
        <div className="sales-hero-copy">
          <p className="sales-kicker">{hero.eyebrow || "KD COFFEE 咖啡藝術工坊"}</p>
          <h1>{lines.map((line, index) => <span key={`${line}-${index}`}>{line}</span>)}</h1>
          <p className="sales-hero-lead">{hero.lead || "從花香、果香到溫暖甜感，我們幫你把複雜的咖啡資訊，變成一個容易做對的選擇。"}</p>
          <div className="sales-hero-actions">
            <Link className="sales-primary" href={hero.buttonHref || "#beginner"}>{hero.buttonLabel || "幫我挑第一包咖啡"}</Link>
            <Link className="sales-secondary" href="#products">直接看本月作品</Link>
          </div>
          <div className="sales-proof-row" aria-label="購買重點">
            <span>小量新鮮烘焙</span><span>7-ELEVEN 取貨付款</span><span>工作室自取</span>
          </div>
        </div>
        <div className="sales-hero-panel">
          <p>今天想找哪一種？</p>
          <Link href="#beginner"><b>01</b><span><strong>第一次喝精品咖啡</strong><small>先看入門首選，不怕買錯</small></span><i>→</i></Link>
          <Link href="/works"><b>02</b><span><strong>依風味慢慢挑</strong><small>花香、果香、甜感一次看</small></span><i>→</i></Link>
          <Link href="#monthly-campaign"><b>03</b><span><strong>耳掛試喝與送禮</strong><small>輕鬆喝、安心送</small></span><i>→</i></Link>
          <Link href="/works"><b>04</b><span><strong>老客人快速回購</strong><small>直接進入本月完整豆單</small></span><i>→</i></Link>
        </div>
      </div>
    </section>
  );
}
