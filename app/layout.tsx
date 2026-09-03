import type { Metadata } from "next";
import Script from "next/script";
import { CartProvider } from "@/components/commerce/CartProvider";
import FloatingCart from "@/components/commerce/FloatingCart";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://kdcoffee1962.com"),
  title: { default: "KD Coffee 咖啡藝術工坊", template: "%s｜KD Coffee" },
  description: "高雄精品咖啡工坊。自製流床式熱風烘豆機，搭配紅外線熱顯像與職人杯測，呈現乾淨、清楚、有層次的咖啡風味。",
  openGraph: { title: "KD Coffee 咖啡藝術工坊", description: "讓咖啡，回到它原本的樣子。", locale: "zh_TW", type: "website" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant" suppressHydrationWarning><body><CartProvider>{children}<FloatingCart /></CartProvider><Script id="works-motion-bootstrap" strategy="beforeInteractive">{`(function(){var root=document.documentElement;root.dataset.worksMotionCapable="true";window.addEventListener("works-motion-runtime-ready",function(){root.dataset.worksMotionRuntimeReady="true"},{once:true});window.setTimeout(function(){if(!root.dataset.worksMotionRuntimeReady){delete root.dataset.worksMotionCapable;}},1500);})();`}</Script></body></html>;
}
