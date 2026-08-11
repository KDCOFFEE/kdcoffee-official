import { getAsset } from "@/lib/assets";

export default async function BrandStory() {
  const mainImage = await getAsset("IMG0002");
  const infrared = await getAsset("IMG0003");
  const cupping = await getAsset("IMG0004");
  return <section id="brand-story" className="brand-story-section">
    <div className="brand-story-shell">
      <header className="brand-story-intro">
        <p className="eyebrow">BUILT FOR FLAVOR</p>
        <h2>我們不是先買一台烘豆機，<br/>而是先決定，想做出什麼樣的咖啡。</h2>
        <p>我們喜歡乾淨、透明、有層次的風味。市面上的設備可以烘出好咖啡，卻始終沒有一台完全符合我們心中想像的方式，所以我們決定自己開始設計與修改。</p>
      </header>
      <div className="brand-story-feature">
        <div className="brand-story-media">
          {mainImage?.path ? <img src={mainImage.path} alt={mainImage.alt}/> : <div className="asset-placeholder"><b>IMG0002</b><span>請在後台補上「品牌故事主圖」</span><small>建議 1600×1200 px｜4:3</small></div>}
        </div>
        <div className="brand-story-copy">
          <span>01 · 自製流床式熱風烘豆機</span>
          <h3>市面上找不到我們想要的風味，於是我們自己打造。</h3>
          <p>我們改風道、改測溫、改控制方式，也一次次重新杯測。不是為了炫耀設備，而是因為每一次修改，最後都必須回到杯中的風味。</p>
          <blockquote>不是為了與眾不同，而是因為好的咖啡，值得花更多心思去完成。</blockquote>
        </div>
      </div>
      <div className="brand-story-cards">
        <article><div className="brand-story-card-media">{infrared?.path ? <img src={infrared.path} alt={infrared.alt}/> : <div className="asset-placeholder compact"><b>IMG0003</b><span>紅外線熱顯像照片</span></div>}</div><span>02 · 看見溫度</span><h3>用紅外線熱顯像，觀察每一鍋真正的變化。</h3><p>數字不是目的，而是幫助我們理解咖啡豆如何吸收與釋放熱能，讓調整不只依靠猜測。</p></article>
        <article><div className="brand-story-card-media">{cupping?.path ? <img src={cupping.path} alt={cupping.alt}/> : <div className="asset-placeholder compact"><b>IMG0004</b><span>杯測與風味驗證照片</span></div>}</div><span>03 · 回到杯中</span><h3>每一筆紀錄，最後都要經過實際杯測。</h3><p>真正重要的不是曲線漂不漂亮，而是咖啡喝起來是否乾淨、清楚，而且保留它原本的個性。</p></article>
      </div>
      <footer className="brand-story-end"><p>一杯好咖啡，不是從設備開始，而是從不願意妥協開始。</p><a href="/works">看看我們做出的咖啡 →</a></footer>
    </div>
  </section>;
}
