import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/adminAuthorization";
import { readProductionSourceCheck } from "@/lib/googleProductProductionSourceCheck";
import { PRODUCTION_DIAGNOSTIC_REASONS } from "@/lib/googleProductProductionSourceCheckContract";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const skuReasonText: Record<string, string> = {
  missing_persisted_skus: "缺少正式儲存的 SKU",
  missing_preparation_kind: "缺少咖啡豆／咖啡粉形式設定",
  beans_ground_unverified: "豆／粉形式尚未完成驗證",
  duplicate_persisted_sku: "SKU 編號重複",
  invalid_sku_price: "SKU 售價資料不符合規格",
  invalid_sku_stock: "SKU 庫存資料不符合規格",
  invalid_sku_fields: "SKU 欄位不完整或格式錯誤",
};

const showCount = (value: number | null) => value === null ? "待確認" : String(value);

/** Owner-only server render. Calls the existing read-only service directly: no
 * browser HTTP request, proxy Host dependency, Merchant API or data mutation. */
export default async function GoogleProductsAdminPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (session.legacy || session.role !== "owner") {
    return <main className="admin-page">
      <header className="admin-topbar"><div><p className="eyebrow dark">KD COFFEE STUDIO</p><h1>無法存取</h1></div><Link href="/admin">返回營運中心</Link></header>
      <section className="admin-panel"><h2>此頁僅限 Owner 使用</h2><p>目前帳號無權檢視正式商品來源診斷。</p></section>
    </main>;
  }

  const result = await readProductionSourceCheck();
  const coffee = result.coffee;
  return <main className="admin-page">
    <header className="admin-topbar">
      <div><p className="eyebrow dark">KD COFFEE STUDIO / GOOGLE PRODUCTS</p><h1>Google 商品同步管理</h1></div>
      <Link href="/admin">返回工作室營運中心</Link>
    </header>

    <section className="admin-panel">
      <div className="admin-panel-head"><div><p className="eyebrow dark">SYNC SAFETY</p><h2>Google 商品同步尚未啟用</h2></div></div>
      <p>目前僅提供正式咖啡商品來源的唯讀檢查，沒有連接 Merchant Center、建立 Feed、上傳商品或修改網站庫存。</p>
      <p><strong>發布資格：禁止發布（BLOCKED）</strong>　｜　<strong>Merchant Center 連線：未啟用</strong></p>
      <p>即使下方診斷完成，也不代表商品可以發布到 Google。</p>
    </section>

    <section className="admin-panel">
      <div className="admin-panel-head"><div><p className="eyebrow dark">SOURCE DIAGNOSTIC</p><h2>{result.state === "diagnostic_complete" ? "正式來源讀取完成" : "正式來源尚未通過檢查"}</h2></div></div>
      <p>檢查結果：{result.state === "diagnostic_complete" ? "診斷完成，仍不具備 Google 發布授權" : "受阻；請查看下方原因"}</p>
      <div className="admin-stats">
        <article><small>咖啡作品數</small><strong>{showCount(coffee.productCount)}</strong></article>
        <article><small>正式儲存 SKU 筆數</small><strong>{showCount(coffee.rawPersistedSkuEntries)}</strong></article>
        <article><small>驗證通過的 SKU 筆數</small><strong>{showCount(coffee.validatedSkuCount)}</strong></article>
        <article><small>SKU 不完整作品數</small><strong>{showCount(coffee.skuIncompleteProductCount)}</strong></article>
      </div>
      <p>持久化來源：{coffee.physicalState === "present" ? "檔案存在" : coffee.physicalState === "missing" ? "檔案不存在" : "尚未證實"}　｜　商業資料：{coffee.commercialValidation === "valid_projection" ? "驗證成功" : coffee.commercialValidation === "invalid" ? "驗證失敗" : "尚未檢查"}</p>
      {result.reasons.length > 0 && <div><h3>尚未通過的條件</h3><ul>{result.reasons.map(reason => <li key={reason}>{PRODUCTION_DIAGNOSTIC_REASONS[reason]}</li>)}</ul></div>}
    </section>

    <section className="admin-panel">
      <div className="admin-panel-head"><div><p className="eyebrow dark">COFFEE PRODUCTS</p><h2>各作品資料檢查</h2></div></div>
      {coffee.diagnostics.length === 0 ? <p className="admin-empty">目前沒有可安全顯示的正式商品摘要；這不代表商品目錄為空。</p> :
        coffee.diagnostics.map((product, index) => <article key={`${product.productId ?? product.slug ?? 'unknown'}-${index}`} className="admin-order-row">
          <div><strong>{product.name ?? "未命名作品"}</strong><span>SKU 筆數：{showCount(product.persistedSkuEntries)}・{product.worksListStatus === "listed" ? "作品頁已列出" : "作品頁未列出"}</span></div>
          <div><strong>{product.skuIncomplete ? "資料待補" : "基本 SKU 欄位檢查完成"}</strong><span>{product.reasons.length ? product.reasons.map(reason => skuReasonText[reason] ?? reason).join("、") : "尚需交易、圖片與同步資格驗證"}</span></div>
        </article>)}
      <p className="admin-empty">此清單僅供診斷，不是 Google 商品 Feed，也不能作為實際售價或可售庫存的對外依據。</p>
    </section>
  </main>;
}
