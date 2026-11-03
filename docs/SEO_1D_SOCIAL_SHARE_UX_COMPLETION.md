# SEO.1D — Social Share Admin UX Completion

日期：2026-11-03（Asia/Taipei）。基準：`138392f`，分支 `gallery-living-gallery`。

本階段已完成實作與驗證，沿用 SEO.1／SEO.1B 的 metadata、SocialImageField、素材庫與儲存流程。**沒有 commit、push 或 deploy。** 下列新控制在本機原始碼中完成，正式站仍須 Owner 審核後另行部署。

## 1–9. 三個管理位置、儲存欄位與備援

| 項目 | 後台位置／實際欄位 | 儲存欄位 | 公開分享圖優先順序 |
| --- | --- | --- | --- |
| 首頁 | `/admin/homepage#homepage-social-share` →「首頁 SEO 與社群分享」→「首頁社群分享縮圖（Open Graph）」→「儲存首頁分享圖」 | PageStore `systemPages.homepage.seo.socialImage` | 首頁專屬圖 → 全站 LOGO005 → 目前啟用的 LOGO001 → 固定緊急備援 |
| 客服中心 | `/admin/customer-service` →「頁面 / Hero」→「客服中心社群分享縮圖（Open Graph）」→「儲存客服內容」 | ServiceState `document.config.socialImage` | 客服專屬圖 → 安全且仍可讀取的客服 Hero → LOGO005 → 目前啟用的 LOGO001 → 固定緊急備援 |
| Store 首頁 | `/admin/store/content/landing?tab=seo` →「SEO」→「社群分享縮圖（Open Graph）」→「儲存全部」 | **保留原欄位** Gift CMS `storeLanding.seo.image` | 原 SEO 圖 → Store CMS Hero 圖 → LOGO005 → 目前啟用的 LOGO001 → 固定緊急備援 |

三處都提供預覽、直接上傳、素材庫選取、更換、移除、1200 × 630 px 建議與備援說明。移除只取消引用，不刪除圖片檔。

首頁位於既有首頁後台、原首頁內容工作室上方的獨立 SEO 區塊。原工作室主要管理內容／視覺，而既有 PageStore 已經是系統頁 SEO 設定來源，因此窄幅使用 `systemPages.homepage.seo`，不混入產品、Gallery 或首頁內容 JSON，也沒有新資料庫。首頁 Hero **不會**自動成為分享圖。

首頁及客服的 socialImage 皆為選填 `{ path, alt, assetId? }`。舊記錄沒有欄位仍可讀取，不批次遷移或回寫預設值。

實體儲存位置沿用原 resolver，令 `R` 為設定的持久儲存根目錄：

- 首頁：`R/store/pages.json`；未設定 R 時為 `public/data/pages.json`。沿用 PageStore version／lock／atomic write，僅儲存首頁分享圖設定。
- 客服：`R/customer-service/content.json`；未設定 R 時為 `data/customer-service/content.json`。沿用原 revision、內容文件、備份與儲存按鈕。
- Store：`R/gift-cms/content.json`；未設定 R 時為 `data/gift-cms/content.json`。**`storeLanding.seo.image.{url, alt, caption}` 未改名、未搬移、未遷移。**

Owner 操作時才儲存上述設定；實作與測試沒有直接填入真實 runtime JSON。

## 10–11. 目前品牌 Logo 與緊急備援

共用 `withSiteSocialImage` 沿用原素材庫，依序尋找 active 的 `LOGO005`、`LOGO001`。URL 必須通過既有社群圖片安全檢查；本地素材另外透過原 `assertAssetImageAvailable` 確認登記、路徑與實體檔案仍可讀取。失效、未啟用、遺失或不相容的圖片會往下一層找。

不新增 Logo registry。最終固定備援仍為：

```
https://www.kdcoffee1962.com/uploads/assets/logo/kd-coffee-logo-primary-v05.png
```

此固定圖只作為 OG／Twitter 的最後 fail-safe。頁面已明確指定圖片時不會被全站圖覆蓋；判斷也避免將 Owner 刻意選取的同一 Logo URL 誤當成「未設定」。

目前本機素材庫的 LOGO001 本來就指向 v05，LOGO005 為 missing，所以最終 HTTP 中仍看到 v05 是預期結果。隔離測試使用不同的 active Logo 檔名，已證明更換目前 Logo 後會優先採用新路徑，而非鎖死 v05。

支援的社群圖片仍是既有 JPEG／PNG／WebP；不把 SVG 或影片當作 OG 圖片，也沒有為此建立圖片轉換或另一套上傳系統。

## 正式版驗證發現並修正的相容性問題

1. 首頁新增非同步 metadata 後，正式版 LINE 請求曾將 OG metadata 串流至 head 之外。依安裝版本文件設定 `htmlLimitedBots`，完整保留 Next 16.4.3 原清單，再加上 LINE。新增回歸確認原清單未遺漏，一般瀏覽器仍可使用原本串流設定。
2. 客服既有預設 Hero URL 在本機正式版回傳 404。現在客服 OG 只使用仍在素材庫且可讀取的 Hero，否則繼續使用全站備援。**沒有修改原客服 Hero 的顯示程式或圖片檔。**

## 上傳與清理安全

三個控制共用既有 SocialImageField／AssetUploadButton／ImageLibraryPicker，使用原本 `purpose=social-share` 圖片上傳流程，不接受任意 URL、私人上傳、影片或 signed URL。儲存時沿用素材庫可用性驗證。

新引用全部是既有本地／持久儲存 Asset Library 圖片。現有自動清理只處理 managed Cloudinary 影片，不會把這些新圖片列為影片 orphan；沒有新增本地圖片清理、自動刪除或第二套引用資料庫。取消分享圖設定不會刪除來源素材。

Monthly Menu 的 poster／背景圖片選擇、影片播放及持久儲存未修改。Store 商品詳情沒有新增分享圖欄位，仍按原主圖／影片 poster／圖集自動選圖。兩者僅共同受益於較低層的 active Logo 備援。

## 12. 修改的既有檔案

```
app/admin/homepage/page.tsx
app/api/admin/pages/route.ts
app/page.tsx
app/customer-service/page.tsx
components/admin/CustomerServiceManager.tsx
components/admin/GiftCmsEditor.tsx
components/admin/StoreLandingFields.tsx
lib/customerServiceContent.ts
lib/customerServiceStore.ts
lib/pageBuilder.ts
lib/siteSocialImage.ts
next.config.ts
scripts/test-social-metadata.mts
scripts/verify-social-metadata.mjs
```

既有 metadata 測試的圖片 fixture 補上真實 TEMP 圖檔，以符合新增的檔案可用性檢查。HTTP 驗證腳本增加客服路由。沒有改動產品價格、SKU、庫存、checkout、member auth、訂單、履約、退貨、訂閱或回饋流程。

## 13. 新增檔案

```
components/admin/HomepageSocialImageSettings.tsx
lib/homepageSeo.ts
lib/systemPageSocialMetadata.ts
scripts/test-seo1d-social-ux.mts
docs/SEO_1D_SOCIAL_SHARE_UX_COMPLETION.md
```

## 14–18. 測試與結果

| 驗證 | 結果 |
| --- | --- |
| 新增 SEO.1D focused suite | **22 PASS** |
| 既有 SEO.1 metadata | 33 PASS |
| 既有 SEO.1B social-image Admin | 29 PASS |
| 既有客服內容 | 15 PASS |
| SEO-A2.1 索引／私人路由保護 | 51 PASS |
| Works SEO | 15 PASS |
| Gallery SEO Settings | 8 PASS |
| Page Builder 原契約測試 | PASS |
| Monthly Menu video A–G | PASS |
| `npx tsc --noEmit` | **exit 0** |
| `npm run build` | **exit 0；30/30 靜態頁完成** |
| 正式版 HTML | **8 路由 × 4 User-Agent = 32 PASS** |
| 正式版匿名圖片 | **3 張全部 200、無 redirect、正確 Content-Type 並可解碼** |
| `git diff --check` | **exit 0** |

Focused suite 包含需求 A–N，另驗證 Owner／same-origin、版本衝突、設定移除、舊文件相容、私人／未登記圖片拒絕、遺失 Logo／客服 Hero、原 Next 爬蟲清單與 LINE head 相容性。

Store 控制以 React SSR 確認現代分享圖欄位的上傳／選圖／移除／預覽入口，並透過原 Gift CMS 儲存函式確認仍寫入 `storeLanding.seo.image`。首頁與客服透過實際 API handlers 儲存／重讀；所有這類寫入都使用隔離 fixture root。

正式版 HTTP 涵蓋 `/`、`/works`、真實 `/works/giotto-awakening`、`/monthly-menu`、`/gallery`、`/gifts`、`/store`、`/customer-service`。User-Agent 為 Mozilla、Facebook、Twitterbot、LINE；社群爬蟲必要 metadata 在 head，query 不污染 canonical。

證據：`qa-output/seo1d/` 中的 focused-tests.log、各回歸 log、typescript.log、build.log、rendered.json、diff-check.log。站內圖片以同一路徑對應本機正式版伺服器驗證，沒有聲稱新程式已部署到正式站。真實社群平台快取顯示仍須部署後驗收。

重跑命令：

```
node --experimental-transform-types --import ./scripts/return-workflow-test-bootstrap.mjs scripts/test-seo1d-social-ux.mts
npx tsc --noEmit
npm run build
node scripts/verify-social-metadata.mjs http://127.0.0.1:3101 qa-output/seo1d
git diff --check
```

沿用既有 API 的 TypeScript parameter property，focused suite 使用 Node transform-types 模式。Windows sandbox 對既有 TEMP atomic rename／編譯程序有限制，因此相關儲存測試、TypeScript 與 build 使用核准的 sandbox 外執行；fixture 仍保持隔離。建置中的既有 dynamic filesystem tracing 警告未擴大為無關流程修改。

## 19. 受保護資料與排除範圍

開始前後 SHA-256 比對：`data/**`、`public/data/**`、`public/uploads/**` 的 **102 個檔案完全相同**，無新增、刪除或內容修改。

另外比對下列 5 個排除範圍程式檔案，均 byte-identical：

```
app/monthly-menu/page.tsx
lib/monthlyMenuBackground.ts
components/monthly-menu/MonthlyMenuVideo.tsx
app/store/[slug]/page.tsx
lib/storePublicMetadata.ts
```

共 107 個檔案通過比對。`qa-output/seo1d/protected-result.json` 保存結果。

進場前已有的 Launcher config、website-data.json 修改，以及未追蹤 Gallery 文件／QA 腳本皆保留。沒有 reset、restore、清除、stage 或覆寫這些變更。HEAD 仍是 `138392f`。

## 20. 精確 git status --short

以下包含本階段與進場前既有變更。沒有 staged files、commit、push 或 deploy。

```text
 M KD_Coffee_Launcher_v5.2.2/KD_Coffee_Launcher_v5.2.2/KD_LAUNCHER_CONFIG.json
 M app/admin/homepage/page.tsx
 M app/api/admin/pages/route.ts
 M app/customer-service/page.tsx
 M app/page.tsx
 M components/admin/CustomerServiceManager.tsx
 M components/admin/GiftCmsEditor.tsx
 M components/admin/StoreLandingFields.tsx
 M lib/customerServiceContent.ts
 M lib/customerServiceStore.ts
 M lib/pageBuilder.ts
 M lib/siteSocialImage.ts
 M next.config.ts
 M public/data/website-data.json
 M scripts/test-social-metadata.mts
 M scripts/verify-social-metadata.mjs
?? components/admin/HomepageSocialImageSettings.tsx
?? docs/GALLERY_EXISTING_ARCHITECTURE.md
?? docs/GALLERY_FUTURE_ADMIN_FIELDS.md
?? docs/GALLERY_QA_NOTES.md
?? docs/SEO_1D_SOCIAL_SHARE_UX_COMPLETION.md
?? lib/homepageSeo.ts
?? lib/systemPageSocialMetadata.ts
?? scripts/gallery-qa-cloudinary-env.mjs
?? scripts/seed-gallery-editorial-qa.mts
?? scripts/serve-gallery-owner-qa.mjs
?? scripts/test-gallery-atmosphere.mts
?? scripts/test-gallery-homepage-controls.mts
?? scripts/test-gallery-qa-environment.mjs
?? scripts/test-gallery-upload-readiness.mts
?? scripts/test-seo1d-social-ux.mts
```
