export default function FluidBedRoaster() {
  return (
    <div className="machine-stage hero-video-stage" aria-label="KD Coffee 真實流床式熱風烘焙影片">
      <div className="machine-orbit orbit-one" />
      <div className="machine-orbit orbit-two" />

      <div className="hero-video-shell">
        <video
          className="hero-roasting-video"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/images/kd-fluid-bed-poster.webp"
          aria-label="咖啡豆在流床式熱風烘豆室中翻滾循環"
        >
          <source src="/videos/kd-fluid-bed-roasting.webm" type="video/webm" />
          <source src="/videos/kd-fluid-bed-roasting.mp4" type="video/mp4" />
        </video>
        <div className="hero-video-glass" aria-hidden="true" />
        <div className="hero-video-vignette" aria-hidden="true" />
      </div>

      <div className="machine-label-left"><span>RETURN FLOW</span><i /></div>
      <div className="machine-label-right"><i /><span>CENTRAL LIFT</span></div>
      <div className="machine-caption"><span>REAL FLUID BED</span><i /><span>PRECISION ROASTING</span></div>
    </div>
  );
}
