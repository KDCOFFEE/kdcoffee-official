import Link from "next/link";
import CartLink from "@/components/commerce/CartLink";
import MemberLink from "@/components/member/MemberLink";
import HeaderNavigation from "@/components/layout/HeaderNavigation";
import { getCurrentMember } from "@/lib/memberAuth";
import { getAsset } from "@/lib/assets";
import { getHomepageData } from "@/data/homepageData";
import { getLiveWebsiteData } from "@/data/websiteData";
import { publishedPageRegistry } from "@/lib/pageBuilder";
import { readPageStore } from "@/lib/pageBuilderStore";
import { resolveHomepageNavigation } from "@/lib/homepageCms";

export default async function Header() {
  const [member, logo, homepage, website, pageStore] = await Promise.all([
    getCurrentMember(),
    getAsset("LOGO001"),
    getHomepageData().catch(() => null),
    getLiveWebsiteData().catch(() => null),
    readPageStore().catch(() => null),
  ]);
  const navigation = resolveHomepageNavigation(homepage?.navigation)
    .filter((item) => item.enabled !== false && item.label.trim())
    .map((item) => ({ id: item.id, label: item.label, href: item.href }));
  const products = website?.menu?.products || [];
  const pages = pageStore ? publishedPageRegistry(pageStore) : [];
  return <header className="v2-header">
    <Link className={`brand ${logo?.path ? "brand-image" : ""}`} href="/#top" aria-label="KD Coffee 首頁">
      {logo?.path ? <img src={logo.path} alt={logo.alt || "KD Coffee 咖啡藝術工坊"}/> : <><span>KD</span><b>COFFEE</b></>}
    </Link>
    <HeaderNavigation items={navigation} products={products} pages={pages} />
    <div className="header-actions"><MemberLink initialName={member ? member.displayName?.trim() || "KD Coffee 會員" : ""}/><CartLink compact/></div>
  </header>;
}
