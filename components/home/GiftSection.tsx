export default function GiftSection() {
  return (
    <section id="gift" className="section gift-section">
      <div className="section-shell gift-grid">
        <div className="gift-visual" aria-hidden="true">
          <div className="gift-box back"><span>KD</span></div>
          <div className="gift-box front"><div className="gift-logo">KD COFFEE</div><div className="gift-line" /><small>PRECISION HOT AIR ROASTING</small></div>
          <span className="gift-bean gb1" /><span className="gift-bean gb2" /><span className="gift-bean gb3" />
        </div>
        <div className="gift-copy">
          <p className="section-kicker">COFFEE GIFT</p>
          <h2 className="section-title">把一段風味旅程，<br />送給重要的人。</h2>
          <p>從日常分享、節慶贈禮到企業客製，KD Coffee 咖啡禮盒以精品耳掛與精選豆款組合，讓收禮的人從打開盒子的那刻開始感受心意。</p>
          <ul><li>精品耳掛咖啡多款組合</li><li>節慶與企業客製服務</li><li>食品級充氮保鮮包裝</li></ul>
          <a href="#contact" className="button button-primary">洽詢禮盒方案</a>
        </div>
      </div>
    </section>
  );
}
