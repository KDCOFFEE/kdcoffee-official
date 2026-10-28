import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ServiceExplorer from "@/components/customer-service/ServiceExplorer";
import RecentServiceOrders from "@/components/customer-service/RecentServiceOrders";
import ServiceIcon from "@/components/customer-service/ServiceIcon";
import styles from "@/components/customer-service/CustomerService.module.css";
import { readCustomerServicePage } from "@/lib/customerServiceSources";
import { getCanonicalPublicSiteOrigin } from "@/lib/publicSiteOrigin";
import { serviceHeroPosition } from "@/lib/customerServiceHero";
import { resolveServiceHero } from "@/lib/customerServiceHeroServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const { config } = await readCustomerServicePage();
  return { title: config.title, description: config.intro.replace(/\s+/gu, " "), alternates: { canonical: `${getCanonicalPublicSiteOrigin()}/customer-service` }, openGraph: { title: `${config.title}｜KD Coffee`, description: config.intro.replace(/\s+/gu, " "), url: `${getCanonicalPublicSiteOrigin()}/customer-service`, locale: "zh_TW", type: "website" } };
}
export default async function CustomerServicePage() {
  const { config, cards, faqs, contentUnavailable } = await readCustomerServicePage();
  const hero = await resolveServiceHero(config.hero);
  const channels = [
    { label: "LINE", detail: "訂購、選豆與服務詢問", value: config.line, cta: "加入好友", href: config.line },
    { label: "Facebook", detail: "品牌消息與服務詢問", value: config.facebook, cta: "前往粉專", href: config.facebook },
    { label: "Email", detail: "把詳細問題告訴我們", value: config.email, cta: "寄送信件", href: config.email ? `mailto:${encodeURIComponent(config.email).replace(/%40/gi, "@")}` : "" },
    { label: "Phone", detail: "透過電話與我們聯繫", value: config.phone, cta: "撥打電話", href: config.phone ? `tel:${config.phone.replace(/[ ()-]/g, "")}` : "" },
  ].filter(channel => channel.href);
  const services = <section key="quick-services" id="quick-services" className={styles.services} aria-labelledby="quick-services-title"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>AT YOUR SERVICE</p><h2 id="quick-services-title">讓我們為你指引</h2></div><p>從這裡，找到需要的服務。</p></div><div className={styles.serviceGrid}>{cards.map(card => <a className={styles.serviceCard} href={card.link} key={card.id}><span className={styles.cardTop}><span className={styles.serviceSymbol}><ServiceIcon name={card.id}/></span><span className={styles.cardArrow} aria-hidden="true">↗</span></span><h3>{card.title}</h3><p>{card.description}</p></a>)}</div>{!cards.length && <p className={styles.empty}>需要協助嗎？請閱讀常見問題，或聯絡下方客服管道。</p>}</section>;
  return <div className={styles.shell} id="top">
    <a className={styles.skipLink} href="#service-main">跳至客服中心內容</a>
    <Header />
    <main id="service-main" className={styles.main}>
      <nav className={styles.breadcrumb} aria-label="麵包屑"><Link href="/">首頁</Link><span aria-hidden="true">/</span><span aria-current="page">客服中心</span></nav>
      <ServiceExplorer faqs={faqs} services={services} visual={<figure key={hero.src} className={styles.heroVisual} style={hero.position === "original" ? undefined : { "--cs-hero-position": serviceHeroPosition(hero) } as CSSProperties}><picture style={{ position: "absolute", inset: 0 }}><Image src={hero.src} alt={hero.alt} fill sizes="(max-width: 640px) 100vw, 42vw" loading="eager" fetchPriority="high"/></picture><figcaption><span>KD COFFEE · EVERYDAY CARE</span><p>每一杯，都值得用心。</p></figcaption></figure>} hero={<>
        <p className={styles.eyebrow}>{config.subtitle}</p><h1>{config.title}</h1>
        <p className={styles.intro}>{config.intro}</p>
        {config.announcement && <aside className={styles.announcement} aria-label="客服公告">{config.announcement}</aside>}
        {contentUnavailable && <p role="status" className={styles.notice}>部分服務內容暫時無法更新，請透過下方管道聯絡我們。</p>}
      </>} />
      <RecentServiceOrders />
      <section id="contact" className={styles.contact} aria-labelledby="service-contact-title">
        <div className={styles.contactHeading}><div className={styles.contactIntro}><p className={styles.eyebrow}>LET’S TALK COFFEE</p><h2 id="service-contact-title">想和我們聊聊？</h2><p>關於咖啡，或每一份訂購的期待。<br/>選擇方便的方式，讓我們陪你找到答案。</p></div><div className={styles.hours}><ServiceIcon name="clock"/><div><h3>客服時間</h3><p>{config.serviceHours || "客服時間尚未公告，歡迎先透過以下管道留言。"}</p></div></div></div>
        <div className={styles.channels}>{channels.map(channel => <a key={channel.label} href={channel.href} className={styles.channel} rel={channel.href.startsWith("https:") ? "noreferrer" : undefined}><span className={styles.channelHeading}><span className={styles.channelIcon}><ServiceIcon name={channel.label}/></span><strong>{channel.label}</strong></span><span className={styles.channelBody}>{(channel.label === "LINE" || channel.label === "Facebook") && <small>{channel.detail}</small>}{channel.label !== "Facebook" && <span className={styles.channelData}>{channel.label === "LINE" ? "@kdcoffee" : channel.value}</span>}</span><span className={styles.channelCta}>{channel.cta}<span aria-hidden="true">→</span></span></a>)}{!channels.length && <div className={styles.empty}><p>客服聯絡方式尚未公告。</p><a href="/member#orders" className={styles.textLink}>已有訂單？前往訂單詢問 ↗</a></div>}</div>
      </section>
      <section id="keep-exploring" className={styles.related} aria-labelledby="service-related-title">
        <p className={styles.eyebrow}>KEEP EXPLORING</p><h2 id="service-related-title">讓咖啡，繼續陪伴日常。</h2>
        <nav className={styles.exploreGrid} aria-label="繼續探索">
          <Link className={styles.exploreCard} href="/works"><span className={styles.exploreMeta}><ServiceIcon name="coffee"/><span>Coffee</span><span aria-hidden="true">→</span></span><strong>咖啡作品</strong><small>探索不同作品與風味</small></Link>
          <Link className={styles.exploreCard} href="/monthly-menu"><span className={styles.exploreMeta}><ServiceIcon name="selection"/><span>Monthly Selection</span><span aria-hidden="true">→</span></span><strong>本月豆單</strong><small>看看這個月的推薦</small></Link>
          <Link className={styles.exploreCard} href="/store"><span className={styles.exploreMeta}><ServiceIcon name="store"/><span>Store</span><span aria-hidden="true">→</span></span><strong>選物商店</strong><small>咖啡器具與日常選物</small></Link>
          <Link className={styles.exploreCard} href="/gifts"><span className={styles.exploreMeta}><ServiceIcon name="gifts"/><span>Gifts</span><span aria-hidden="true">→</span></span><strong>禮盒</strong><small>把一份咖啡心意送出去</small></Link>
        </nav>
        <nav className={styles.utilityLinks} aria-label="會員與工作室服務"><Link href="/member">會員中心</Link><Link href="/member#rewards">KD／回饋明細</Link><Link href="/member#subscription">定期配送</Link><a href="#service-location">工作室資訊</a></nav>
      </section>
    </main>
    <div id="service-location"><Footer /></div>
  </div>;
}
