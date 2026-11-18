import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/adminAuthorization";
import { getLiveWebsiteData } from "@/data/websiteData";
import { resolveWorksProductListing } from "@/lib/productListing";
import { isWorksCardSoldOut } from "@/lib/worksCardMarker";
import { readProductionSourceCheck } from "@/lib/googleProductProductionSourceCheck";
import { PRODUCTION_DIAGNOSTIC_REASONS } from "@/lib/googleProductProductionSourceCheckContract";
import styles from "./GoogleProductsDashboard.module.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const skuReasonText: Record<string, string> = {
  missing_persisted_skus: "尚無正式儲存的商品規格",
  missing_preparation_kind: "咖啡豆／咖啡粉形式待確認",
  beans_ground_unverified: "咖啡豆／咖啡粉形式待驗證",
  duplicate_persisted_sku: "商品規格編號重複",
  invalid_sku_price: "售價資料需檢查",
  invalid_sku_stock: "庫存資料需檢查",
  invalid_sku_fields: "商品規格資料需補齊",
};

/** The public Works page is the single authority for which coffee artworks appear.
 * The production diagnostic remains independent and does NOT authorize Google publication. */
export default async function GoogleProductsAdminPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (session.legacy || session.role !== "owner") {
    return <main className="admin-page">
      <header className="admin-topbar"><div><p className="eyebrow dark">KD COFFEE STUDIO</p><h1>無法存取</h1></div><Link href="/admin">返回營運中心</Link></header>
      <section className="admin-panel"><h2>僅限工作室 Owner 使用</h2><p>目前帳號無權檢視商品來源診斷。</p></section>
    </main>;
  }

  // Both reads occur only after Owner authorization. The public Works read is
  // authoritative for display; any read failure is fail-closed (no fallback catalog).
  const [liveResult, diagnosticResult] = await Promise.allSettled([
    getLiveWebsiteData(),
    readProductionSourceCheck(),
  ]);
  const publicReadable = liveResult.status === "fulfilled";
  const products = publicReadable ? resolveWorksProductListing(liveResult.value.menu.products) : [];
  const soldOutCount = products.filter(isWorksCardSoldOut).length;
  const result = diagnosticResult.status === "fulfilled" ? diagnosticResult.value : null;
  const diagnostics = result?.coffee.diagnostics ?? [];
  const checksBySlug = new Map(diagnostics.filter(item => item.slug).map(item => [item.slug, item]));
  const incompleteVisible = products.filter(product => checksBySlug.get(product.slug)?.skuIncomplete).length;

  return <main className={`admin-page ${styles.root}`}>
    <header className="admin-topbar">
      <div><p className="eyebrow dark">KD COFFEE STUDIO · 商品管理</p><h1>Google 商品同步管理</h1>
        <p className={styles.subtitle}>以網站目前公開展示的商品為準，輕鬆掌握資料準備進度。</p>
      </div>
      <Link href="/admin">返回工作室營運中心</Link>
    </header>

    <section className={styles.hero} aria-label="Google 同步狀態">
      <div className={styles.heroCopy}>
        <span className={styles.eyebrow}>GOOGLE PRODUCT STUDIO</span>
        <h2>先整理好商品，再安心連接 Google。</h2>
        <p>商品清單會隨前台公開狀態更新；這裡只查看資料，不會改動網站價格、庫存或商品。</p>
      </div>
      <div className={styles.heroStatus}>
        <span className={styles.statusLabel}>目前同步狀態</span>
        <strong>尚未啟用</strong>
        <span>Merchant Center 尚未連線</span>
      </div>
    </section>

    <section className={styles.overview} aria-label="管理概覽">
      <article className={styles.metric}><span>前台公開咖啡作品</span><strong>{publicReadable ? products.length : "—"}</strong><small>只計入顧客在 Works 看得到的作品</small></article>
      <article className={styles.metric}><span>其中已售完</span><strong>{publicReadable ? soldOutCount : "—"}</strong><small>公開展示的售完作品仍保留</small></article>
      <article className={styles.metric}><span>公開作品待補規格</span><strong>{publicReadable && result?.state === "diagnostic_complete" ? incompleteVisible : "—"}</strong><small>僅供基本欄位檢查，不代表可發布</small></article>
    </section>

    <section className={styles.catalog} aria-labelledby="catalog-heading">
      <div className={styles.sectionHead}>
        <div><span className={styles.eyebrow}>PUBLIC CATALOG</span><h2 id="catalog-heading">前台公開商品</h2>
          <p>依照網站目前的展示方式整理，不包含未公開、已隱藏或已下架的作品。</p>
        </div>
      </div>
      <nav className={styles.categoryGrid} aria-label="商品分類">
        <a className={`${styles.category} ${styles.categoryActive}`} href="#coffee-list" aria-current="location">
          <span className={styles.categorySymbol} aria-hidden="true">☕</span><span><strong>咖啡作品</strong><small>{publicReadable ? `${products.length} 款前台公開` : "資料讀取中斷"}</small></span>
        </a>
        <div className={styles.category} aria-label="禮盒商品尚未接入診斷">
          <span className={styles.categorySymbol} aria-hidden="true">◇</span><span><strong>禮盒商品</strong><small>公開來源待接入</small></span>
        </div>
        <div className={styles.category} aria-label="Store 商品尚未接入診斷">
          <span className={styles.categorySymbol} aria-hidden="true">▣</span><span><strong>生活選物 Store</strong><small>公開來源待接入</small></span>
        </div>
      </nav>
      <div className={styles.listHead} id="coffee-list">
        <div><h3>咖啡作品</h3><p>與前台 <Link href="/works" target="_blank" rel="noopener noreferrer">全部咖啡 / Works</Link> 共用公開展示規則</p></div>
        <span className={styles.count}>{publicReadable ? `${products.length} 款作品` : "來源待確認"}</span>
      </div>
      {!publicReadable ? <div className={styles.empty} role="status">暫時無法讀取前台正式商品資料。已停止顯示清單，避免將舊資料誤認為公開商品。</div> :
        products.length === 0 ? <div className={styles.empty}>目前前台沒有公開展示的咖啡作品。</div> :
        <div className={styles.products}>{products.map(product => {
          const soldOut = isWorksCardSoldOut(product);
          const check = checksBySlug.get(product.slug);
          return <article key={product.slug} className={styles.product}>
            <div className={styles.productMain}><span className={styles.productIcon} aria-hidden="true">☕</span>
              <div><strong>{product.name}</strong><small>{check ? `已記錄 ${check.persistedSkuEntries ?? "—"} 筆規格` : "規格檢查待確認"}</small></div>
            </div>
            <div className={styles.productActions}>
              <span className={soldOut ? styles.soldOut : styles.publicStatus}>{soldOut ? "公開・已售完" : "公開展示"}</span>
              {check?.skuIncomplete ? <span className={styles.needsCheck}>規格待補</span> : null}
              <Link href={`/works/${product.slug}`} target="_blank" rel="noopener noreferrer">查看前台作品 ↗</Link>
            </div>
          </article>;
        })}</div>}
      <p className={styles.note}>售完狀態與顯示資格沿用 Works 前台現有規則；本清單不代表 Google 可刊登或商品可以結帳。</p>
    </section>

    <section className={styles.bottom} aria-label="後續準備事項">
      <div className={styles.nextSteps}>
        <span className={styles.eyebrow}>NEXT STEPS</span><h2>接下來要完成的事</h2>
        <div className={styles.task}><span>01</span><p>確認各商品的實際交易資料與可發布規格</p></div>
        <div className={styles.task}><span>02</span><p>核准每個商品與規格的對應圖片</p></div>
        <div className={styles.task}><span>03</span><p>接入禮盒、Store 的前台公開商品來源</p></div>
        <div className={styles.task}><span>04</span><p>完成 Merchant Center 連線與發布審核</p></div>
      </div>
      <details className={styles.technical}>
        <summary>進階資料檢查 <span>給需要核對來源的管理者</span></summary>
        <div className={styles.technicalBody}>
          <p>正式來源診斷：{result?.state === "diagnostic_complete" ? "基本檢查完成" : "未完成或暫時無法讀取"}</p>
          <p>全庫資料核對（非公開清單）：作品 {result?.coffee.productCount ?? "—"} 款，儲存規格 {result?.coffee.rawPersistedSkuEntries ?? "—"} 筆，基本商業驗證 {result?.coffee.validatedSkuCount ?? "—"} 筆。</p>
          <p>發布資格：仍禁止發布。任何資料檢查結果都不代表已取得 Google 發布授權。</p>
          {result?.reasons?.length ? <ul>{result.reasons.map(reason => <li key={reason}>{PRODUCTION_DIAGNOSTIC_REASONS[reason]}</li>)}</ul> : null}
          {products.some(product => checksBySlug.get(product.slug)?.reasons.length) ? <details>
            <summary>查看公開作品的規格檢查提醒</summary>
            <ul>{products.filter(product => checksBySlug.get(product.slug)?.reasons.length).map(product => <li key={product.slug}>
              <strong>{product.name}：</strong>{checksBySlug.get(product.slug)!.reasons.map(reason => skuReasonText[reason] ?? "待人工確認").join("、")}
            </li>)}</ul>
          </details> : null}
        </div>
      </details>
    </section>
  </main>;
}
