import { getAsset } from "@/lib/assets";
const year = new Date().getFullYear();

export default async function Footer() {
  const logo = await getAsset("LOGO002");
  return <footer className="v2-footer home-surface-dark" data-home-reveal="footer">
    <div className="footer-main">
      <a className={`footer-brand ${logo?.path ? "footer-brand-image" : ""}`} href="#top" aria-label="回到首頁頂端">
        {logo?.path ? <img src={logo.path} alt={logo.alt || "KD Coffee 咖啡藝術工坊"}/> : "KD COFFEE"}
      </a>
      <p>咖啡藝術工坊<br/>享受每一口咖啡的驚奇之旅。</p>
    </div>
    <div className="footer-column"><b>VISIT</b><address>高雄市鳳山區過埤路 501 號<br/><a href="https://www.google.com/maps/search/?api=1&query=%E9%AB%98%E9%9B%84%E5%B8%82%E9%B3%B3%E5%B1%B1%E5%8D%80%E9%81%8E%E5%9F%A4%E8%B7%AF501%E8%99%9F" target="_blank" rel="noreferrer">在 Google 地圖開啟 ↗</a></address></div>
    <div className="footer-column"><b>CONNECT</b><nav aria-label="頁尾連結"><a href="https://line.me/R/ti/p/@kdcoffee" target="_blank" rel="noreferrer">LINE @kdcoffee</a><a href="https://www.facebook.com/KDcoffee.tw" target="_blank" rel="noreferrer">Facebook</a><a href="mailto:kdcoffee1962@gmail.com">Email</a></nav></div>
    <div className="footer-bottom"><small>© {year} KD Coffee. All rights reserved.</small><a href="#top">BACK TO TOP ↑</a></div>
  </footer>;
}
