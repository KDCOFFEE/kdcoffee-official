import Link from "next/link";
import CartLink from "@/components/commerce/CartLink";
import MemberLink from "@/components/member/MemberLink";
import HeaderNavigation from "@/components/layout/HeaderNavigation";
import { getCurrentMember } from "@/lib/memberAuth";
import { getAsset } from "@/lib/assets";

export default async function Header() {
  const [member, logo] = await Promise.all([getCurrentMember(), getAsset("LOGO001")]);
  return <header className="v2-header">
    <Link className={`brand ${logo?.path ? "brand-image" : ""}`} href="/#top" aria-label="KD Coffee 首頁">
      {logo?.path ? <img src={logo.path} alt={logo.alt || "KD Coffee 咖啡藝術工坊"}/> : <><span>KD</span><b>COFFEE</b></>}
    </Link>
    <HeaderNavigation />
    <div className="header-actions"><MemberLink initialName={member?.displayName || ""}/><CartLink compact/></div>
  </header>;
}
