import FluidBedRoaster from "./FluidBedRoaster";

export default function Hero() {
  return (
    <section id="top" className="hero-v3">
      <div className="hero-v3-grid">
        <div className="hero-v3-copy">
          <p className="hero-v3-kicker"><span />PRECISION HOT AIR ROASTING</p>
          <h1>
            讓風味被看見，<br />
            <em>不是被烘焙掩蓋。</em>
          </h1>
          <p className="hero-v3-lead">
            自研流床式熱風烘焙，讓咖啡豆沿著中央熱風上升、向外翻轉並自然回落。
            以更乾淨、均勻的受熱，呈現花香、果香、甜感與清楚層次。
          </p>
          <div className="hero-v3-actions">
            <a className="button button-primary" href="#products">探索精品咖啡</a>
            <a className="hero-v3-text-link" href="#roasting">觀看烘焙原理 <span>↗</span></a>
          </div>
          <div className="hero-v3-specs" aria-label="KD Coffee 烘焙特色">
            <div><strong>01</strong><span>中央上升<br />外圈回落</span></div>
            <div><strong>02</strong><span>紅外線熱顯像<br />精準控溫</span></div>
            <div><strong>03</strong><span>淺至中焙<br />保留原始風味</span></div>
          </div>
        </div>
        <FluidBedRoaster />
      </div>
      <div className="hero-v3-edge-copy">KD COFFEE · FLUID BED ROASTING · KAOHSIUNG</div>
    </section>
  );
}
