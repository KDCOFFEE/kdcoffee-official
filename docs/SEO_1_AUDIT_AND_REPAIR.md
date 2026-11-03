# SEO.1 — KD Coffee SEO 與社群分享稽核／修復報告

日期：2026-11-03（Asia/Taipei）。分支：`gallery-living-gallery`。開始時 HEAD：`d9961cf`。

已實作並完成本機 production build 驗證。沒有 commit、push 或 deploy。正式站尚未套用本次程式。平台端重新抓取／快取刷新及真實 LINE、Facebook、Messenger、X 分享顯示，仍需在 Owner 核准並部署後驗收；本報告不把 HTML 通過當作平台端已驗收。

## 1. 已證實的根因（修改前完成調查）

直接匿名 GET 正式站及原本本機伺服器，以 Facebook crawler User-Agent 讀取 HTML：

| 路由 | 正式站原本 og:image | 其他證據 |
| --- | --- | --- |
| `/` | 無 | root Open Graph 根本未宣告 images；Twitter 自動退回 summary |
| `/works` | 無 | CMS 未設定 shareImage 時，子頁輸出 undefined images；沒有全站備援 |
| `/works/giotto-awakening` | 有 | 使用產品真實圖片，但使用非 www 網域；缺 canonical、og:url，title 重複加品牌 |
| `/monthly-menu` | 無 | 只設定一般 title/description，繼承沒有圖片的 root OG |
| `/gallery` | 無 | 現行程式依賴可選圖片／LOGO001；正式站實際沒有可用輸出，缺共同備援 |
| `/gifts` | 無 | 沒有 CMS SEO 圖片時直接省略 OG/Twitter images |

素材庫現有 `LOGO005`（分享預覽圖）是 `status: missing`，path 空白。沒有找到已完成的 1200×630 全站 KD 分享卡。原本沒有 app/opengraph-image.* 或 twitter-image.* 補救這些空值。

首頁以一般瀏覽器、Facebook、Twitterbot、LINE User-Agent 取得的原始 HTML 均沒有 og:image。因此這是已證實的輸出缺漏，不能以社群快取作唯一解釋。

第二個實測缺陷：root metadataBase 原為 `https://kdcoffee1962.com`，而既有官方 origin helper 使用 `https://www.kdcoffee1962.com`。產品原始 og:image 的非 www URL 在本次驗證環境 DNS 查詢回傳 ENOTFOUND；相同圖片的 www URL 回傳 200 image/webp。這是本次環境的查詢證據，不宣稱已完成全球 DNS 調查。

正式站 KD Logo 的 www URL 匿名回傳 200、image/png、無 redirect、無 cookie／登入要求。產品圖片的 www URL 也匿名回傳 200。故不能把所有缺圖概括成圖片授權問題。正式站與本機 CMS 資料不同：本機 Works 已有 shareImage、Gallery 可取得 Logo，但正式站上述頁面仍無圖。

原始逐頁 metadata：`qa-output/seo/baseline.json`。精確正式站圖片 URL 結果：`qa-output/seo/production-image-checks.json`。

## 2. 既有架構與採用方式

- Next.js 16.4.3 App Router。先閱讀安裝版本內 metadata、generateMetadata、robots、sitemap 文件，確認 nested OG/Twitter 採 shallow replacement，不能依賴 root 深層合併。
- Root layout 提供 metadata 基礎；各頁使用 metadata 或 generateMetadata。
- Works CMS：`systemPages.works.seo`，包含 title、description、shareImage。
- Gallery CMS：既有 `gallerySeoSettings`、`gallerySeo` 與素材庫選圖；保留自訂 SEO/social 文案。
- Store／Gifts：沿用既有 metadata helpers、Store Content Studio、Gift CMS，以及 `STORE_SEO_PUBLIC_ENABLED` 發布開關。
- Page Builder：沿用已發布 snapshot 的 seoTitle／seoDescription，補 canonical 與分享 metadata。
- 素材庫：沿用原本 `LOGO005` 全站分享圖欄位，沒有新增 Admin SEO 系統、資料表或寫入受保護 JSON。
- 既有 Gallery CollectionPage／ItemList JSON-LD 保留。
- 現有 favicon.ico 保留；沒有 manifest、apple-icon 或 twitter/opengraph-image 檔案；未捏造新圖示或把影片當分享圖。

## 3. 本次修改的既有檔案

公開頁／root：

```
app/layout.tsx
app/page.tsx
app/works/page.tsx
app/works/[slug]/page.tsx
app/monthly-menu/page.tsx
app/gallery/page.tsx
app/gifts/page.tsx
app/store/page.tsx
app/store/[slug]/page.tsx
app/pages/[slug]/page.tsx
app/customer-service/page.tsx
app/robots.ts
```

既有 SEO helpers 與相關測試：

```
lib/gallerySeo.ts
lib/giftPresentation.ts
lib/storePublicMetadata.ts
lib/storeContentStudio.ts
scripts/test-phase-j1f6-works-public-seo.ts
scripts/test-gallery-seo.mts
scripts/test-seo-a2.1-index-safety.mts
```

舊測試原本固定要求相對 canonical、歷史 git diff 或過去 sitemap 範圍。本次改為符合 www absolute canonical、目前已核准的 Gallery／客服 sitemap 與安全備援的預期；保留發布開關、私有資料排除、CMS 設定、SSR 與資料不變檢查。

## 4. 新增檔案

```
lib/socialMetadata.ts
lib/siteSocialImage.ts
lib/brandStructuredData.ts
scripts/test-social-metadata.mts
scripts/verify-social-metadata.mjs
docs/SEO_1_AUDIT_AND_REPAIR.md
```

`qa-output/seo/` 是既有 gitignore 排除的本機驗證證據；沒有新增產品素材。

## 5–8. 修復後逐頁 OG 結果

以下來自本機正式版 build 的 HTTP 回應，不是只看 TypeScript 物件：

| 頁面 | OG 標題來源 | 分享圖來源 | canonical |
| --- | --- | --- | --- |
| 首頁 | KD 咖啡藝術工坊｜KD Coffee 精品咖啡 | LOGO005；目前未設定，使用既有 KD Logo PNG | www 正式站 `/` |
| Works 列表 | Works CMS SEO title | 既有 CMS shareImage，本機是 1800×844 WebP | `/works` |
| 喬托・初醒詳情 | 真實 product.name＋品牌 | 原有 hero，1024×1536 WebP | `/works/giotto-awakening` |
| Monthly Menu | 本月豆單專屬標題／描述 | video.posterUrl → background.image → 全站備援；本機目前使用 Logo | `/monthly-menu` |
| Gallery | Gallery CMS 或原核准預設 | Gallery SEO 圖 → LOGO005 → 既有 Logo | `/gallery` |
| Gifts | Gift CMS 或原預設禮盒文案 | Gift SEO 圖 → 全站備援 | `/gifts` |
| Store | Store Content Studio 或原預設 | Store SEO 圖 → 全站備援 | `/store` |

每頁均具備 og:title、og:description、og:url、og:image、twitter:card、twitter:title、twitter:description、twitter:image 與 canonical。Twitter 統一 summary_large_image，與同頁 OG 使用同一圖片。siteName、zh_TW locale、website type 均明確提供。

圖片 URL 為絕對 HTTPS，站內圖片一律 www。備援 Logo 明確宣告真實尺寸 2000×2000；專屬圖片沒有已驗證尺寸欄位時不捏造為 1200×630。正式分享卡仍待 Owner 提供。

Monthly Menu 播放與背景 normalization 程式未修改；Gallery 的 animation、media、navigation、history 與 query 選作品行為未修改。`/gallery?work=...` 的 canonical 維持 `/gallery`。

## 9. Canonical／推薦參數

確認現有 ReferralAttributionCapture 使用 `ref`，沒有發明新參數。Canonical 與 OG URL 由固定公開路徑建立，排除 query／fragment；例如 `/works/giotto-awakening?ref=ABC123&utm_source=line` 指向乾淨的 www 作品 canonical。

未修改 runtime navigation、分享 URL 建立、referral capture、cookie、推薦歸因、PV 或 reward accounting。Store 原本「查詢頁 noindex」政策保留。所有新的 canonical 不信任 Host／forwarded headers 或訪客輸入。

## 10. Structured data

- 首頁增加 Organization 與 WebSite，使用既有品牌名稱、官方 URL、品牌描述、zh-Hant。
- 作品詳情增加 Product 與 BreadcrumbList，只使用實際作品名稱、描述、圖片與公開 URL。
- 不輸出 Offer、價格、availability、評分、評論、電話、地址、營業時間或社群帳號。
- Gallery 既有 CollectionPage／ItemList 保留；JSON 安全序列化防止 script 結束字元注入。
- 未新增 LocalBusiness，因本次未取得足夠權威商家地址／聯絡資料。

## 11. Robots／sitemap

robots 保持公開內容與商品圖片可抓取，增加 Admin、API、Member、Cart、Checkout、Orders、私人備份及會員頭像／訂單通知圖等路徑的 disallow。原有私人 layout 的 noindex／nofollow 保留。Store／Gifts 的 SEO 發布開關保留，未擅自啟用。

sitemap 本身無需修改：原有清單已包含首頁、Works、Gallery、Monthly Menu、客服、真實公開 Works、已發布 Page Builder 頁。Store／Gifts 與 Store 商品仍受既有發布開關控制，排除隱藏／草稿商品與私人路由。

## 12–16. 測試與驗證結果

| 驗證 | 結果 |
| --- | --- |
| 新增 SEO.1 語意／圖片安全／CMS 備援測試 | 33 PASS |
| 既有 Works SEO | 15 PASS |
| 既有 Gallery SEO／SSR | 7 PASS |
| 既有 Gallery SEO Settings | 8 PASS |
| 既有 SEO-A2.1 發布與索引安全 | 51 PASS；52 個私人頁面受 layout 保護 |
| 既有 Monthly Menu video A–G 測試 | PASS |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0；30/30 靜態頁產生完成 |
| 正式版 HTTP metadata | 7 路由 × 4 User-Agent = 28 PASS |
| 匿名圖片 HTTP／解碼 | 3 張圖片全部 200、無 redirect、正確 Content-Type 並可解碼 |
| `git diff --check` | exit 0 |

User-Agent：Mozilla/5.0、facebookexternalhit/1.1、Twitterbot/1.0、Line/1.0。社群 User-Agent 的九項必要 metadata 都在 head，且四者 metadata 相同。測試使用實際存在的 `giotto-awakening`，並在各頁附加 ref／utm 驗證 canonical 未污染。

本機站內圖片 HTTP 檢查將 www 站內路徑對應到本機正式版伺服器；這證明部署內容的路由回應，不宣稱尚未部署的專屬素材已存在於正式站。既有備援 Logo 另已對正式 www URL 取得匿名 200 image/png。

完整正式版結果：`qa-output/seo/rendered.json`。各測試、TypeScript、build 與 diff-check 輸出也在同目錄。測試命令範例：

```
node --experimental-strip-types --import ./scripts/member-auth-test-bootstrap.mjs scripts/test-social-metadata.mts
node --experimental-strip-types --import ./scripts/member-auth-test-bootstrap.mjs scripts/test-phase-j1f6-works-public-seo.ts
node --experimental-strip-types --import ./scripts/gallery-test-bootstrap.mjs scripts/test-gallery-seo.mts
node --experimental-strip-types --import ./scripts/gallery-test-bootstrap.mjs scripts/test-gallery-seo-settings.mts
node --experimental-strip-types --import ./scripts/member-auth-test-bootstrap.mjs scripts/test-seo-a2.1-index-safety.mts
node --experimental-strip-types --import ./scripts/member-auth-test-bootstrap.mjs scripts/test-monthly-menu-video.ts
node scripts/verify-social-metadata.mjs http://127.0.0.1:3101
```

建置有既有 dynamic filesystem tracing 警告，涉及既有 storage／commerce 程式；本次未改動那些受保護流程。最初 sandbox 內編譯停滯，改用核准的 sandbox 外建置後完成；中間新增測試 fixture 型別錯誤已修正，以上為最後結果。

## 17. 受保護路徑驗證

開始修改前對 `data/**`、`public/data/**`、`public/uploads/**` 全部檔案建立 SHA-256，比對完成後：102／102 檔案完全相同，無新增、無刪除、無內容異動。`qa-output/seo/protected-result.json` 保存比對結果。

工作區原有 `public/data/website-data.json` 與 Launcher config 修改；沒有還原、重設或覆寫。原有未追蹤 Gallery 文件／QA 腳本也保留。Commerce、Member、Order、Fulfillment、Returns、pricing、SKU、inventory、subscription 與 reward 程式沒有本次修改。

## 19. Owner 仍需提供的圖片

**需要一張最終 1200×630 KD Coffee 品牌分享卡，建議不透明 JPEG／PNG。** 必須使用真實 KD 品牌／自有素材與可讀文字；本次沒有生成假產品、假品牌圖或改動任何作品 artwork。

建議沿用 Admin 素材庫既有 `LOGO005`「分享預覽圖」上傳並啟用，程式已自動讀取該欄位。若採程式內靜態資產，預留路徑為 `public/seo/kd-coffee-social-share.jpg`；僅放入該路徑不會自動啟用，須同時將 LOGO005 指向該公開路徑。沒有對不存在的預留圖片輸出 OG URL。

目前 2000×2000 透明 Logo 只是可抓取的暫時備援，並非已完成的 1200×630 精品品牌分享卡。Owner 核准圖片與程式、部署後，仍需以真實社群平台重新抓取驗證縮圖與裁切。

## 18. 精確 git status --short

下方保留本次結束時的完整輸出，包含原有變更與新增報告本身。

```text
 M KD_Coffee_Launcher_v5.2.2/KD_Coffee_Launcher_v5.2.2/KD_LAUNCHER_CONFIG.json
 M app/customer-service/page.tsx
 M app/gallery/page.tsx
 M app/gifts/page.tsx
 M app/layout.tsx
 M app/monthly-menu/page.tsx
 M app/page.tsx
 M app/pages/[slug]/page.tsx
 M app/robots.ts
 M app/store/[slug]/page.tsx
 M app/store/page.tsx
 M app/works/[slug]/page.tsx
 M app/works/page.tsx
 M lib/gallerySeo.ts
 M lib/giftPresentation.ts
 M lib/storeContentStudio.ts
 M lib/storePublicMetadata.ts
 M public/data/website-data.json
 M scripts/test-gallery-seo.mts
 M scripts/test-phase-j1f6-works-public-seo.ts
 M scripts/test-seo-a2.1-index-safety.mts
?? docs/GALLERY_EXISTING_ARCHITECTURE.md
?? docs/GALLERY_FUTURE_ADMIN_FIELDS.md
?? docs/GALLERY_QA_NOTES.md
?? docs/SEO_1_AUDIT_AND_REPAIR.md
?? lib/brandStructuredData.ts
?? lib/siteSocialImage.ts
?? lib/socialMetadata.ts
?? scripts/gallery-qa-cloudinary-env.mjs
?? scripts/seed-gallery-editorial-qa.mts
?? scripts/serve-gallery-owner-qa.mjs
?? scripts/test-gallery-atmosphere.mts
?? scripts/test-gallery-homepage-controls.mts
?? scripts/test-gallery-qa-environment.mjs
?? scripts/test-gallery-upload-readiness.mts
?? scripts/test-social-metadata.mts
?? scripts/verify-social-metadata.mjs
```
