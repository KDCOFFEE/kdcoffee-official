import StoreProductCard from "@/components/store/StoreProductCard";
import type { GiftCatalog } from "@/lib/giftPresentation";
import styles from "./GiftExperience.module.css";

const LINE_CONTACT = "https://line.me/R/ti/p/@kdcoffee";
const pointNumber = new Intl.NumberFormat("zh-TW", { maximumSignificantDigits: 21 });

export default function GiftExperience({ model }: { model: GiftCatalog }) {
  const dripGifts = model.groups.find(group => group.slug === "drip-gift")?.gifts ?? [];
  const dripTarget = (slug: string) => dripGifts.some(gift => gift.product.slug === slug) ? "#gift-" + slug : "#drip-gift";
  return <main id="gifts-main" tabIndex={-1} className={styles.main}>
    <header className={styles.hero}>
      <div className={styles.heroVisual}>
        {model.hero?.type === "image" ? <img src={model.hero.url} alt={model.hero.alt || "KD Coffee 咖啡禮盒"} fetchPriority="high" decoding="async" /> : <div className={styles.heroPlaceholder} aria-hidden="true" />}
      </div>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>GIFTS BY KD COFFEE</p>
        <h1>送一份咖啡，也送一段值得慢下來的時間。</h1>
        <p>為日常問候、節慶心意與重要的人，準備一份剛剛好的咖啡禮。</p>
        <a className={styles.primary} href="#gift-categories">挑選禮盒 <span aria-hidden="true">↓</span></a>
      </div>
    </header>

    <section id="gift-categories" className={styles.selector} aria-labelledby="gift-category-heading">
      <h2 id="gift-category-heading">選你想送的方式</h2>
      <nav className={styles.categories} aria-label="依禮盒類型挑選">
        {model.groups.map(group => <a key={group.slug} href={group.slug === "custom-gift" ? "#custom-gifting" : "#" + group.slug}>{group.selectorLabel}</a>)}
      </nav>
    </section>

    <section id="curated-gifts" className={styles.section} aria-labelledby="curated-heading">
      <h2 id="curated-heading">精選禮盒</h2>
      {model.total === 0 && <div className={styles.empty}><p>禮盒正在準備中。</p><p>歡迎先與我們聊聊送禮對象與場合。</p><a className={styles.textLink} href="#custom-gifting">聊聊送禮需求 →</a></div>}
      {model.groups.filter(group => group.slug !== "custom-gift").map(group => <section id={group.slug} key={group.slug} className={styles.productGroup} aria-labelledby={group.slug + "-heading"}>
        <h3 id={group.slug + "-heading"}>{"groupName" in group ? group.groupName : group.name}</h3>
        {group.gifts.length > 0 ? <div className={styles.productGrid}>{group.gifts.map(gift =>
          <StoreProductCard key={gift.product.slug} product={gift.product} id={"gift-" + gift.product.slug} className={styles.giftCard}
            editorial={{
              compact: true, label: gift.label, summary: gift.summary, cta: "查看禮盒 →",
              priceText: gift.product.price === 0 && !gift.product.inStock ? "價格待設定" : undefined,
              pointsText: gift.pvValue > 0 && model.pointDisplayName ? "可獲得 " + pointNumber.format(gift.pvValue) + " " + model.pointDisplayName : undefined,
            }} />
        )}</div> : <p className={styles.groupEmpty}>此系列正在準備中。</p>}
      </section>)}
    </section>

    <section id="gift-selection-help" className={styles.help} aria-labelledby="help-heading">
      <h2 id="help-heading">不知道該選哪一盒？</h2>
      <div className={styles.guidance}>
        <a href={dripTarget("gift-drip10-2")}><h3>想送得輕巧</h3><p>從 10 入耳掛禮盒開始。</p></a>
        <a href={dripTarget("gift-drip20-4")}><h3>想送得更有份量</h3><p>選擇 20～24 入耳掛或雙入咖啡豆禮盒。</p></a>
        <a href="#coffee-gear-gift"><h3>想送一套完整體驗</h3><p>選擇咖啡豆搭配手沖器具的組合。</p></a>
      </div>
    </section>

    <section id="custom-gifting" className={styles.custom} aria-labelledby="custom-heading">
      <span id="custom-gift" className={styles.scrollAlias} aria-hidden="true" />
      <div><p className={styles.eyebrow}>CUSTOM GIFTING</p><h2 id="custom-heading">心意成禮</h2>
        <p>{model.custom?.shortDescription || "依預算、數量與場合，為企業、節慶與重要時刻準備一份專屬心意。"}</p>
        <p className={styles.inquiry}>客製需求請洽詢</p>
      </div>
      <a className={styles.primary} href={LINE_CONTACT} target="_blank" rel="noopener noreferrer">詢問客製禮盒 ↗</a>
    </section>
  </main>;
}
