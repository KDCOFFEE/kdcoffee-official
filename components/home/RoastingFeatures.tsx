const features = [
  { no: "01", title: "均勻翻滾", text: "熱風由底部向上推送，讓咖啡豆持續翻滾、均勻受熱，降低局部過熱與焦斑。" },
  { no: "02", title: "乾淨風味", text: "豆子與高溫金屬接觸更少，並減少煙氣反覆沾附，杯中風味更清楚、尾韻更乾淨。" },
  { no: "03", title: "精準控溫", text: "搭配紅外線熱顯像與數據紀錄，掌握每個階段的能量變化，穩定重現理想曲線。" },
];

export default function RoastingFeatures() {
  return (
    <section id="roasting" className="section roasting-section">
      <div className="section-shell">
        <div className="section-heading-row">
          <div><p className="section-kicker light">THE KD DIFFERENCE</p><h2 className="section-title light">精準，不只是一個數字。</h2></div>
          <p className="section-intro light-muted">從熱風流動、豆溫變化到杯中表現，我們用設備與感官共同判斷，讓每一鍋都有清楚的目的。</p>
        </div>
        <div className="feature-grid">
          {features.map((item) => (
            <article className="feature-card" key={item.no}>
              <span className="feature-number">{item.no}</span>
              <div className="feature-icon" aria-hidden="true"><span /><span /><span /></div>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
