# SEO.1B — Owner 可編輯社群分享縮圖

日期：2026-11-03（Asia/Taipei）。延續 SEO.1，分支 `gallery-living-gallery`，HEAD 維持 `d9961cf`。沒有 commit、push 或 deploy，也沒有覆寫 SEO.1 的實作與報告。

## 1–4. 後台位置與操作

以下為本機現有開發站位置；正式站要在 Owner 核准並部署本次程式後才會有新控制。

| 用途 | 確切位置 | 操作 |
| --- | --- | --- |
| 全站預設分享圖 | `http://localhost:3000/admin/logo#social-share` | 「預設社群分享縮圖（Open Graph）」→ 上傳／從素材庫選擇 → 儲存預設分享圖 |
| Coffee Product／Work | `http://localhost:3000/admin/products` | 選擇作品 → **Assets** →「社群分享縮圖（Open Graph）」→ 儲存變更 |
| Works 列表 | `http://localhost:3000/admin/works` | **SEO** →「社群分享縮圖（Open Graph）」→ 儲存全部 |
| Gallery | `http://localhost:3000/admin/pages` | **Gallery SEO 設定** → 分享縮圖 → 儲存 Gallery SEO |
| Gifts 送禮頁 | `http://localhost:3000/admin/store/content/gifts`（原入口 `/admin/gifts/landing`） | **SEO** → 分享縮圖 → 儲存全部 |
| About／品牌故事等 Page Builder 頁 | `http://localhost:3000/admin/pages` → 選擇頁面 → `/admin/pages/<pageId>` | 展開 **SEO 與搜尋結果設定** → 分享縮圖 → 儲存／發布頁面 |

全站正式 URL 對應為 `https://www.kdcoffee1962.com/admin/logo#social-share`。新功能尚未部署。

共用控制顯示縮圖預覽、1200 × 630 px 建議、上傳、素材庫選擇、更換及移除。沒有任意 URL 輸入框。移除只解除引用，不刪除素材。上傳至既有素材庫後，仍需儲存各頁設定；Page Builder 的公開 metadata 只讀已發布 snapshot，不會讀取未發布草稿。

全站／作品皆為選填，不對既有產品批次加欄位、不遷移歷史記錄。本次沒有替 Owner 上傳最終品牌圖片，正式的 1200×630 分享卡仍由 Owner 選擇。

**Monthly Menu 沒有新增獨立上傳欄位。** 現有背景圖／影片 poster 已足以提供權威頁面圖片；另建上傳與儲存入口會重複既有媒體架構。原播放、背景替換、月份與影片清理保護行為不變。

## 5. 實際備援優先順序

- Work 詳情：`assets.socialShare` → 原有 Hero → 原有 product/artwork/list 圖片解析器 → 全站 `LOGO005` → SEO.1 的安全 KD Logo。
- Works 列表：既有 SEO shareImage → 桌機主視覺圖片／影片 poster → `LOGO005` → Logo。
- Monthly Menu：影片 posterUrl → 既有 background.image → `LOGO005` → Logo。影片 URL 永不作為 og:image。
- Gallery：既有 SEO 選圖 → 安全、啟用中的展間背景圖 → `LOGO005` → Logo。沒有改動展間的動畫、媒體或 history／query 行為。
- Gifts：既有 SEO 圖 → Gift CMS Hero 圖 → `LOGO005` → Logo。
- Store Content Studio：既有 SEO 圖 → Store CMS Hero 圖 → `LOGO005` → Logo。
- 一般 Page Builder 頁：已發布 socialImage → 已發布且啟用的頁面主要媒體圖片／poster → `LOGO005` → Logo。

所有候選仍經 SEO.1 安全 URL 過濾；canonical／ref 歸因處理不變。設定後不用修改原始碼，每個頁面的 OG 與 Twitter 使用相同選圖結果。

## 6. 儲存欄位

| 用途 | 沿用的儲存位置與欄位 |
| --- | --- |
| 全站 | 既有 Asset Library，`assets.find(id === "LOGO005").path / alt / status / updatedAt`，沿用 library.version |
| Work 詳情 | 既有 website menu.products 的 `assets.socialShare.{path, alt, assetId, media}`；media 為 image/local。移除保存空 path、移除媒體引用，不影響其他素材 |
| Works 列表 | 既有 PageStore `systemPages.works.seo.shareImage.{media, alt}` |
| Gallery | 既有 PageStore `systemPages.gallery.seo.ogImageAssetId` |
| Gifts | 既有 Gift CMS `landing.seo.image.{url, alt, caption}` |
| 一般頁面 | 既有 PageStore `pages[].draft.socialImage.{path, alt, assetId?}`，發布時進入 `publishedSnapshot.socialImage` |
| Monthly Menu | 沿用 `menu.background.media.posterUrl` 與 `menu.background.image`，沒有新增欄位 |

沒有新增資料庫或 runtime 設定檔。一般頁面 socialImage 是選填欄位，舊記錄缺欄位仍可驗證／讀取。

## 7. 重用的架構與伺服器驗證

- 重用 `AssetUploadButton`、`ImageLibraryPicker` 與 `/api/admin/assets/upload`。
- 既有 uploadWebsiteImageAsset／websiteImages 解碼、最佳化、命名、登記素材庫與 atomic write 流程，新增窄幅 `purpose=social-share`；沒有第二套上傳器。
- 此目的只接受 JPG、PNG、WebP，拒絕影片、SVG、偽裝圖片與不安全內容。沿用既有 bounded multipart handler，單檔 body 以 5 MB 加表單空間為界；上傳結果沿用既有 WebP 最佳化，1200×630 不會放大或強制裁切。
- 新選圖僅接受啟用的本地公開素材庫圖片，不能輸入 external URL、signed URL、blob、localhost、會員頭像、訂單圖或 API/private 路徑。Global／Work／Page Builder 儲存會確認素材仍在素材庫並可安全讀取、解碼。
- 全站設定透過既有 `/api/admin/assets?purpose=social-share`，只更新 LOGO005，使用既有 lock／version。Owner session 與 same-origin 檢查先於上傳／寫入。
- Work 走原 `/api/admin/products` 的 **assets-only** scope；測試確認價格、SKU、stock、roast 與其他產品內容沒有改變。
- Works／Gallery 保留原 PageStore 版本鎖；Gifts 保留原 Gift CMS revision 與備份流程。

## 8. 清理與引用安全

稽核確認現行 `cloudinaryCleanup` 的自動掃描／刪除對象只有 managed Cloudinary **video**。本次新的分享圖上傳與選取刻意沿用既有本地／持久儲存 Asset Library；不新增 Cloudinary resource，因此不參與影片 orphan 判定，沒有需要加入的 Cloudinary 圖片 publicId。

現行沒有會掃描並刪除本地 Asset Library 未使用圖片的自動清理器；因此沒有另造一套引用資料庫或本地刪除掃描器。共用欄位的「移除」只取消設定，來源素材及檔案保留。沒有新增自動 destructive deletion。

測試另確認 Monthly Menu 的 poster 所依賴之 Cloudinary 影片仍被現有 `collectCloudinaryVideoUsage` 收集為使用中。未修改該 canonical collector，也未讓新的本地 OG 圖片進入 Cloudinary 影片刪除範圍。

## 9. SEO.1B 修改的既有檔案

以下是**本階段增量**，並非將 SEO.1 全部重列為本次新增：

```
app/api/admin/assets/route.ts
app/api/admin/assets/upload/route.ts
app/api/admin/pages/[id]/route.ts
app/gallery/page.tsx
app/gifts/page.tsx
app/pages/[slug]/page.tsx
app/works/[slug]/page.tsx
app/works/page.tsx
components/admin/GallerySeoControls.tsx
components/admin/GiftCmsEditor.tsx
components/admin/LogoManager.tsx
components/admin/PageBuilderManager.tsx
components/admin/ProductManager.tsx
components/admin/WorksPageManager.tsx
lib/assetImageUploads.ts
lib/galleryPageAdminStore.ts
lib/gallerySeo.ts
lib/giftCmsStore.ts
lib/giftPresentation.ts
lib/pageBuilder.ts
lib/productMedia.ts
lib/productVisualAssets.ts
lib/socialMetadata.ts
lib/storeContentStudio.ts
lib/worksPageAdminStore.ts
scripts/test-gallery-seo-settings.mts
scripts/test-phase-j1f6-works-public-seo.ts
scripts/verify-social-metadata.mjs
```

最後一項只增加獨立 QA 輸出目錄參數，保留 SEO.1 原驗證證據。測試調整反映共用分享圖控制的新檔案輸入及主視覺備援，沒有刪除原有索引／商務保護測試。

## 10. SEO.1B 新增檔案

```
components/admin/GlobalSocialImageSettings.tsx
components/admin/SocialImageField.tsx
lib/socialImageAdmin.ts
lib/socialImageSettings.ts
scripts/test-social-image-admin.mts
docs/SEO_1B_SOCIAL_IMAGE_ADMIN.md
```

## 11–14. 驗證結果

| 驗證 | 最後結果 |
| --- | --- |
| 新增社群圖片 Admin/API 整合測試 | **29 PASS**；全部寫入 TEMP |
| SEO.1 metadata 回歸 | 33 PASS |
| Works SEO | 15 PASS |
| Works Admin 儲存 | 22 PASS |
| Gallery SEO／SSR | 7 PASS |
| Gallery SEO Settings | 8 PASS |
| Gallery SEO 持久儲存 | 5 PASS |
| SEO-A2.1 索引／私人路由保護 | 51 PASS |
| Page Builder 原契約測試 | PASS |
| Monthly Menu video A–G | PASS |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| 正式版公開頁 HTML | 7 頁 × 4 User-Agent，**28 PASS** |
| 正式版匿名圖片回應 | 3 張全部 200，Content-Type／尺寸／解碼通過，無 redirect |
| `git diff --check` | exit 0 |

新測試直接執行既有 route handlers，涵蓋實際上傳、匿名公開 serving、Global save/reload/remove、版本衝突、Work save/reload/remove、Hero／global 備援、PageStore 發布、Gifts save/reload/remove、JPG/PNG/WebP、偽裝圖片、私人圖片拒絕、原產品不變與 Monthly Menu cleanup 邊界。共用後台控制另以 React SSR 驗證預覽與各操作入口。

正式版 HTML 包含首頁、Works、真實喬托詳情、Monthly Menu、Gallery、Gifts、Store；User-Agent 為 Browser、Facebook、Twitterbot、LINE。保留 SEO.1 的 query-independent canonical 與完整 head metadata。這不代表已部署或已完成真實社群平台快取驗收。

完整舊 Gift CMS 套件需要外部 `GIFT_TEST_FIXTURE`；此環境未提供，該套件未列為通過。本次新增的整合測試已直接驗證 Gift SEO 圖片儲存／移除及不安全來源拒絕。未安裝本機 Playwright，因此沒有宣稱完成後台瀏覽器點選 E2E；實際 API 與 SSR 測試結果如上。

建置保留既有 dynamic filesystem tracing 警告，未修改那些無關流程。Windows sandbox 會阻擋 TEMP 內既有 atomic rename，因此持久儲存測試與建置使用核准的 sandbox 外執行；測試資料仍全部位於獨立 TEMP。證據保存於 `qa-output/seo1b/`。

重跑主要測試：

```
node --experimental-strip-types --import ./scripts/return-workflow-test-bootstrap.mjs scripts/test-social-image-admin.mts
npx tsc --noEmit
npm run build
node scripts/verify-social-metadata.mjs http://127.0.0.1:3101 qa-output/seo1b
git diff --check
```

## 15. 受保護路徑

開始本階段前對 `data/**`、`public/data/**`、`public/uploads/**` 建立 SHA-256：結束時 **102／102 檔案完全相同**，沒有新增、刪除或改寫 runtime/business data。原有 website-data.json 與 Launcher config 修改保留；未 reset、restore、清除或覆寫。

Commerce、checkout、order、fulfillment、return、pricing、SKU、inventory、subscription、reward 程式沒有本次行為修改。Product 僅增加獨立素材欄位及其驗證／metadata 選圖。`qa-output/seo1b/protected-result.json` 保存完整比對結果。

## 16. 精確 git status --short

下方包含 SEO.1、本階段及進場前既有變更；全部維持未 commit 狀態。

```text
 M KD_Coffee_Launcher_v5.2.2/KD_Coffee_Launcher_v5.2.2/KD_LAUNCHER_CONFIG.json
 M app/api/admin/assets/route.ts
 M app/api/admin/assets/upload/route.ts
 M app/api/admin/pages/[id]/route.ts
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
 M components/admin/GallerySeoControls.tsx
 M components/admin/GiftCmsEditor.tsx
 M components/admin/LogoManager.tsx
 M components/admin/PageBuilderManager.tsx
 M components/admin/ProductManager.tsx
 M components/admin/WorksPageManager.tsx
 M lib/assetImageUploads.ts
 M lib/galleryPageAdminStore.ts
 M lib/gallerySeo.ts
 M lib/giftCmsStore.ts
 M lib/giftPresentation.ts
 M lib/pageBuilder.ts
 M lib/productMedia.ts
 M lib/productVisualAssets.ts
 M lib/storeContentStudio.ts
 M lib/storePublicMetadata.ts
 M lib/worksPageAdminStore.ts
 M public/data/website-data.json
 M scripts/test-gallery-seo-settings.mts
 M scripts/test-gallery-seo.mts
 M scripts/test-phase-j1f6-works-public-seo.ts
 M scripts/test-seo-a2.1-index-safety.mts
?? components/admin/GlobalSocialImageSettings.tsx
?? components/admin/SocialImageField.tsx
?? docs/GALLERY_EXISTING_ARCHITECTURE.md
?? docs/GALLERY_FUTURE_ADMIN_FIELDS.md
?? docs/GALLERY_QA_NOTES.md
?? docs/SEO_1B_SOCIAL_IMAGE_ADMIN.md
?? docs/SEO_1_AUDIT_AND_REPAIR.md
?? lib/brandStructuredData.ts
?? lib/siteSocialImage.ts
?? lib/socialImageAdmin.ts
?? lib/socialImageSettings.ts
?? lib/socialMetadata.ts
?? scripts/gallery-qa-cloudinary-env.mjs
?? scripts/seed-gallery-editorial-qa.mts
?? scripts/serve-gallery-owner-qa.mjs
?? scripts/test-gallery-atmosphere.mts
?? scripts/test-gallery-homepage-controls.mts
?? scripts/test-gallery-qa-environment.mjs
?? scripts/test-gallery-upload-readiness.mts
?? scripts/test-social-image-admin.mts
?? scripts/test-social-metadata.mts
?? scripts/verify-social-metadata.mjs
```
