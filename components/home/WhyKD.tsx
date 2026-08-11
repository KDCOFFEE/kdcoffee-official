const reasons = [
  {
    no: "01",
    title: "乾淨，不靠焦苦撐味道",
    body: "以流床式熱風讓咖啡豆均勻受熱，減少火焰直烤帶來的厚重焦味，讓花香、果香與自然甜感更容易被喝見。",
    label: "CLEAN FLAVOR",
  },
  {
    no: "02",
    title: "每一鍋，都重新觀察",
    body: "咖啡豆會改變，氣候也會改變。我們不把烘焙當成固定公式，而是透過溫度、熱顯像與實際杯測，為每一批重新調整。",
    label: "CAREFUL ROASTING",
  },
  {
    no: "03",
    title: "小工坊，更能在意細節",
    body: "從烘焙、杯測到包裝都由我們親自完成。不是追求大量生產，而是確認這支咖啡真的值得分享，才讓它來到你的杯子裡。",
    label: "SMALL BATCH",
  },
];

export default function WhyKD() {
  return (
    <section id="why-kd" className="why-kd">
      <div className="why-kd-shell">
        <header className="why-kd-head">
          <div>
            <p className="eyebrow">WHY KD COFFEE</p>
            <h2>
              我們做的每一件事，<br />
              最後都要回到風味。
            </h2>
          </div>
          <p>
            不需要先懂烘焙理論。你只需要在喝下第一口時，感受到咖啡乾淨、清楚，而且自然好喝。
          </p>
        </header>

        <div className="why-kd-grid">
          {reasons.map((reason) => (
            <article className="why-kd-card" key={reason.no}>
              <div className="why-kd-card-top">
                <span>{reason.no}</span>
                <small>{reason.label}</small>
              </div>
              <div className="why-kd-mark" aria-hidden="true">
                <i />
                <b />
                <i />
              </div>
              <h3>{reason.title}</h3>
              <p>{reason.body}</p>
            </article>
          ))}
        </div>

        <div className="why-kd-foot">
          <p>讓咖啡，回到它原本的樣子。</p>
          <a href="#contact">認識與訂購 <span aria-hidden="true">↗</span></a>
        </div>
      </div>
    </section>
  );
}
