const products = [
  { name: "拉斐爾之吻", en: "RAPHAEL'S KISS", taste: "花香・柑橘・蜂蜜甜感", roast: "淺中焙", mark: "R" },
  { name: "莫內花語", en: "MONET BLOSSOM", taste: "白花・莓果・清甜尾韻", roast: "淺焙", mark: "M" },
  { name: "喬托・初醒", en: "GIOTTO AWAKENING", taste: "日曬藝妓・熱帶水果・細緻花香", roast: "淺中焙", mark: "G" },
];

export default function ProductShowcase() {
  return (
    <section id="products" className="section products-section">
      <div className="section-shell">
        <div className="section-heading-row">
          <div><p className="section-kicker">SIGNATURE COLLECTION</p><h2 className="section-title">用藝術家的名字，記住一杯咖啡。</h2></div>
          <p className="section-intro">我們以風味個性為每款咖啡命名。每一款都有不同的香氣、甜感與情緒，也都有屬於自己的故事。</p>
        </div>
        <div className="product-grid">
          {products.map((product) => (
            <article className="product-card" key={product.name}>
              <div className="product-art"><span className="product-orbit" /><span className="product-letter">{product.mark}</span><span className="product-bean bean-one" /><span className="product-bean bean-two" /></div>
              <div className="product-meta"><span>{product.roast}</span><span>227g</span></div>
              <h3>{product.name}</h3><p className="product-en">{product.en}</p><p className="product-taste">{product.taste}</p>
              <a href="#contact" className="product-link">了解這款咖啡 <span>→</span></a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
