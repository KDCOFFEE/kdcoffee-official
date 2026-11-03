import { withSiteSocialImage } from "@/lib/siteSocialImage";
import { rootMetadata } from "@/lib/socialMetadata";
import type { Metadata } from "next";
import { Suspense } from "react";
import { CartProvider } from "@/components/commerce/CartProvider";
import ReferralAttributionCapture from "@/components/member/ReferralAttributionCapture";
import RetailPromotionShareButton from "@/components/member/RetailPromotionShareButton";
import FloatingCart from "@/components/commerce/FloatingCart";
import WorksMotionBootstrapClient from "@/components/works/WorksMotionBootstrapClient";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> { return withSiteSocialImage(rootMetadata); }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant" data-works-motion-capable="true"><body><CartProvider><Suspense fallback={null}><ReferralAttributionCapture /></Suspense>{children}<RetailPromotionShareButton /><FloatingCart /></CartProvider><WorksMotionBootstrapClient /></body></html>;
}
