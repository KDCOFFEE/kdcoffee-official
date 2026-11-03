# PHASE ADMIN.UX.1 完成報告

分支：gallery-living-gallery。HEAD：638b6f0。僅完成本機 Admin 文案與介面整理，沒有暫存、提交、推送或部署。

## 1. 本階段修改的確切檔案（19）

- [app/admin/homepage/page.tsx](F:/KD_Coffee_Studio_RECOVERED_20261103/app/admin/homepage/page.tsx)
- [components/admin/AssetUploadButton.tsx](F:/KD_Coffee_Studio_RECOVERED_20261103/components/admin/AssetUploadButton.tsx)
- [components/admin/CustomerServiceHeroEditor.tsx](F:/KD_Coffee_Studio_RECOVERED_20261103/components/admin/CustomerServiceHeroEditor.tsx)
- [components/admin/CustomerServiceManager.tsx](F:/KD_Coffee_Studio_RECOVERED_20261103/components/admin/CustomerServiceManager.tsx)
- [components/admin/GallerySeoControls.tsx](F:/KD_Coffee_Studio_RECOVERED_20261103/components/admin/GallerySeoControls.tsx)
- [components/admin/GiftCmsEditor.tsx](F:/KD_Coffee_Studio_RECOVERED_20261103/components/admin/GiftCmsEditor.tsx)
- [components/admin/GlobalSocialImageSettings.tsx](F:/KD_Coffee_Studio_RECOVERED_20261103/components/admin/GlobalSocialImageSettings.tsx)
- [components/admin/HomepageContentStudio.tsx](F:/KD_Coffee_Studio_RECOVERED_20261103/components/admin/HomepageContentStudio.tsx)
- [components/admin/HomepageSocialImageSettings.tsx](F:/KD_Coffee_Studio_RECOVERED_20261103/components/admin/HomepageSocialImageSettings.tsx)
- [components/admin/LogoManager.tsx](F:/KD_Coffee_Studio_RECOVERED_20261103/components/admin/LogoManager.tsx)
- [components/admin/PageBuilderManager.tsx](F:/KD_Coffee_Studio_RECOVERED_20261103/components/admin/PageBuilderManager.tsx)
- [components/admin/ProductManager.tsx](F:/KD_Coffee_Studio_RECOVERED_20261103/components/admin/ProductManager.tsx)
- [components/admin/SocialImageField.tsx](F:/KD_Coffee_Studio_RECOVERED_20261103/components/admin/SocialImageField.tsx)
- [components/admin/StoreLandingFields.tsx](F:/KD_Coffee_Studio_RECOVERED_20261103/components/admin/StoreLandingFields.tsx)
- [components/admin/WorksPageManager.tsx](F:/KD_Coffee_Studio_RECOVERED_20261103/components/admin/WorksPageManager.tsx)
- [scripts/test-gallery-seo-settings.mts](F:/KD_Coffee_Studio_RECOVERED_20261103/scripts/test-gallery-seo-settings.mts)
- [scripts/test-phase-j1f6-works-public-seo.ts](F:/KD_Coffee_Studio_RECOVERED_20261103/scripts/test-phase-j1f6-works-public-seo.ts)
- [scripts/test-seo1d-social-ux.mts](F:/KD_Coffee_Studio_RECOVERED_20261103/scripts/test-seo1d-social-ux.mts)
- [scripts/test-social-image-admin.mts](F:/KD_Coffee_Studio_RECOVERED_20261103/scripts/test-social-image-admin.mts)

## 2. 本階段新增的確切檔案（5）

- [components/admin/SocialImageField.module.css](F:/KD_Coffee_Studio_RECOVERED_20261103/components/admin/SocialImageField.module.css)
- [scripts/prepare-admin-ux1.mts](F:/KD_Coffee_Studio_RECOVERED_20261103/scripts/prepare-admin-ux1.mts)
- [scripts/test-admin-ux1.mts](F:/KD_Coffee_Studio_RECOVERED_20261103/scripts/test-admin-ux1.mts)
- [scripts/test-admin-ux1-browser.mjs](F:/KD_Coffee_Studio_RECOVERED_20261103/scripts/test-admin-ux1-browser.mjs)
- [docs/ADMIN_UX1_REPORT.md](F:/KD_Coffee_Studio_RECOVERED_20261103/docs/ADMIN_UX1_REPORT.md)

## 3. 共用元件

SocialImageField 統一為暖色中性卡片：標題、平台用途、完整比例圖片預覽、自然語言說明、上傳／素材庫／移除操作，以及單一尺寸提示。未設定時顯示「尚未設定專屬分享圖片」。有圖片時顯示「更換圖片」與「移除設定」。移除提醒只在有圖片時低調呈現。上傳元件增加選用 showStatus 呈現參數，預設維持原樣；分享卡片與已有通知的客服主視覺避免重複上傳訊息。

加入正確標題與說明關聯、鍵盤焦點樣式、素材庫 Escape 關閉、Tab 焦點循環與關閉後返回按鈕。保留原生 button、input、details、圖片替代文字及 disabled 行為；沒有新增通知系統。

## 4. 首頁

以「首頁分享設定」區段連接「首頁內容工作室」，統一間距與區隔。主欄位改為「首頁分享圖片」，移除重複平台與尺寸說明。儲存、重新整理、未儲存提示使用一般營運文案。工作室只調整必要的外部整合與顯示文字。

## 5. 客服中心

「頁面 / Hero」改為「頁面與主視覺」，內含頁面基本資料、主視覺圖片、客服中心分享圖片。桌機／手機預覽與圖片描述改為中文；說明清楚交代未設定時使用客服主視覺及全站預設圖。FAQ、卡片、聯絡資訊及內容驗證邏輯未變。

## 6. 商店首頁

顯示標籤改為「搜尋與分享」，保留 tab=seo 與內部 seo 值。分為「搜尋顯示設定」（搜尋結果標題／說明）與「分享顯示設定」（分享標題／說明／商店首頁分享圖片）。既有預覽、儲存與商品設定行為保留。

## 7. 全站預設圖片

改為「全站預設分享圖片」，以「當頁面沒有設定自己的分享圖片時，會使用這張圖片。」說明用途。Logo 的規格、路徑與檔名欄位收在原生「圖片規格與進階設定」，主要操作改為圖片描述與檔名的自然用語。

## 8. 其他使用處

作品頁：作品頁分享圖片；作品：作品分享圖片；藝廊：藝廊分享圖片；禮盒：禮盒頁分享圖片；一般頁面：分享圖片。各處保留原有 onChange/onUploaded 的資料轉換與未設定時的解析方式。作品資料／圖片與影片／歷程等導覽，以及作品圖片、頁面結構預覽的相關標籤改為中文。

## 9. 響應式與畫面檢查

CSS 限定於共用分享圖片模組，沒有修改全站 CSS。卡片依實際可用寬度自動換成單欄；低於 768px 操作按鈕完整排列，預覽填滿可用寬度，文字可換行，分享圖片按鈕至少 44px。

使用本機正式版、隔離的 Owner 測試登入及合成測試圖片，檢查以下每一組組合的空白／有圖片狀態，共 20 組、40 張畫面：

| 路徑 | 1440 | 1024 | 768 | 430 | 390 |
|---|---|---|---|---|---|
| /admin/homepage | 通過 | 通過 | 通過 | 通過 | 通過 |
| /admin/customer-service | 通過 | 通過 | 通過 | 通過 | 通過 |
| /admin/store/content/landing?tab=seo | 通過 | 通過 | 通過 | 通過 | 通過 |
| /admin/logo#social-share | 通過 | 通過 | 通過 | 通過 | 通過 |

20 組均無水平溢位；圖片成功載入；平台與尺寸各出現一次；分享卡片沒有 Open Graph、Hero、Desktop、Mobile、fallback、備援等詞。已人工檢視五種寬度的畫面拼圖與手機空白狀態。此為本機隔離測試，沒有登入或修改正式站 Owner 資料。

畫面證據：[qa-output/admin-ux1/homepage-review.png](F:/KD_Coffee_Studio_RECOVERED_20261103/qa-output/admin-ux1/homepage-review.png)、[qa-output/admin-ux1/service-review.png](F:/KD_Coffee_Studio_RECOVERED_20261103/qa-output/admin-ux1/service-review.png)、[qa-output/admin-ux1/store-review.png](F:/KD_Coffee_Studio_RECOVERED_20261103/qa-output/admin-ux1/store-review.png)、[qa-output/admin-ux1/global-review.png](F:/KD_Coffee_Studio_RECOVERED_20261103/qa-output/admin-ux1/global-review.png)、[qa-output/admin-ux1/empty-review.png](F:/KD_Coffee_Studio_RECOVERED_20261103/qa-output/admin-ux1/empty-review.png)。

## 10. 移除或簡化的技術用語

主要欄位移除 Open Graph；Hero 改主視覺；Desktop/Mobile 改桌機版／手機版；SEO 標題與說明改搜尋結果標題與說明；fallback／備援改為「未設定時，會使用…」。移除過度大寫的管理頁標頭、作品素材的內部名稱及容易混淆的重新載入／同步描述。

## 11. 刻意保留的用語

LINE、Facebook、Messenger、YouTube、Logo 為平台或常用品牌名稱；JPG、PNG、WebP、SVG、PDF、px 等為辨識圖片格式與尺寸所需。Logo 的 Apple Touch Icon 用來辨識裝置圖示規格。作品編號、SKU 與公開網址維持可辨識的原值，且不更動商務管理。內部變數、元件 API、seo、desktop/mobile、assetId、LOGO005、路由與儲存鍵保留。原始檔案路徑與規格可在 Logo 進階設定查看。

## 12. 資料與儲存行為

沒有資料遷移、Owner 資料填入或原始素材刪除。首頁仍寫 PageStore.systemPages.homepage.seo.socialImage；客服仍寫 document.config.socialImage；商店仍寫 storeLanding.seo.image（url、alt、caption）；全站預設仍使用 LOGO005。Page Builder、作品、藝廊、禮盒的欄位及轉換維持原樣。

瀏覽器實際操作確認選取回呼仍回傳 path/alt/assetId、首頁與客服儲存值相同、商店儲存值相同。上傳沿用原 API、檔案限制與 multipart file/create 契約；瀏覽器使用攔截回應驗證回呼，既有 29 項整合測試另驗證真正的隔離上傳。移除只清除設定引用並保留圖片。

## 13. 搜尋及社群分享行為

沒有修改 metadata 解析、優先順序、canonical、Open Graph、Twitter、LINE crawler、htmlLimitedBots、Cloudinary、公開頁面或 API。32 組頁面／瀏覽器與爬蟲回應相符，3 張匿名圖片回應成功。所有 lib、API、公開 app 檔案及 next.config.ts 的保護指紋一致。

## 14. 測試結果

| 測試 | 結果 |
|---|---|
| 新增 Admin UX 單元測試 | 14 PASS |
| SEO.1D 分享操作與儲存 | 22 PASS |
| SEO.1B 分享圖片管理與實際上傳 | 29 PASS |
| 社群 metadata | 33 PASS |
| 私有頁面索引防護 | 51 PASS |
| Works 公開 SEO | 15 PASS |
| Gallery 搜尋分享設定 | 8 PASS |
| Customer Service | 15 PASS |
| 合計 | 187 PASS |
| 瀏覽器實際操作 | 6 PASS |
| 響應式畫面組合 | 20 PASS（空白／有圖共 40 張） |
| HTTP metadata | 32 PASS |
| 匿名圖片 | 3 PASS |

原測試僅更新對應的 Owner 顯示文字斷言，沒有削弱儲存、解析或資料安全斷言。瀏覽器操作包含素材選擇、鍵盤關閉與焦點回復、上傳契約、移除及三個頁面的實際儲存。

執行記錄與 browser-results.json 位於 [qa-output/admin-ux1](F:/KD_Coffee_Studio_RECOVERED_20261103/qa-output/admin-ux1)。新增測試使用 prepare-admin-ux1.mts 產生固定於 qa-output/admin-ux1/runtime 的可拋棄內容，與真實 data/public/data/public/uploads 分離。

## 15–17. TypeScript、正式建置與差異檢查

- npx tsc --noEmit：通過，0 錯誤。
- npm run build：通過（Next.js 16.4.3 / Turbopack）。
- git diff --check：通過，0 空白錯誤。Git 僅提示既有 LF/CRLF 工作目錄轉換政策。

## 18. 受保護資料

本階段開始前保存 SHA-256，完成後重新列舉並比對：590 → 590，0 變更、0 新增、0 刪除。範圍包含 data/**、public/data/**、public/uploads/**、lib/**、app/api/**、非 Admin 的 app 檔案、components/commerce、components/member、components/store，以及 next.config.ts。

public/data/website-data.json 與 KD_LAUNCHER_CONFIG.json 原本已有未提交修改；沒有將它們當成本階段修改，也沒有覆蓋它們。既有 Gallery 文件／腳本同樣保留。沒有更動購物車、結帳、訂單、定價、SKU、庫存、出貨、退換貨、會員驗證、訂閱、獎勵或推薦會計程式。

## OWNER BEFORE / AFTER

| BEFORE | AFTER |
|---|---|
| 首頁社群分享縮圖（Open Graph） | 首頁分享圖片 |
| 頁面 / Hero | 頁面與主視覺 |
| Desktop 桌機 / Mobile 手機 | 桌機版 / 手機版 |
| SEO 標題 / SEO 說明 | 搜尋結果標題 / 搜尋結果說明 |
| 預設社群分享縮圖（Open Graph） | 全站預設分享圖片 |
| 上傳替換圖片 / 更換素材庫圖片 | 更換圖片 / 從素材庫選擇 |
| 移除分享圖片 | 移除設定 |
| 備援順序與工程說明 | 未設定時，會使用全站預設分享圖片。 |

## 19. 完成時的確切 git status --short

```text
 M KD_Coffee_Launcher_v5.2.2/KD_Coffee_Launcher_v5.2.2/KD_LAUNCHER_CONFIG.json
 M app/admin/homepage/page.tsx
 M components/admin/AssetUploadButton.tsx
 M components/admin/CustomerServiceHeroEditor.tsx
 M components/admin/CustomerServiceManager.tsx
 M components/admin/GallerySeoControls.tsx
 M components/admin/GiftCmsEditor.tsx
 M components/admin/GlobalSocialImageSettings.tsx
 M components/admin/HomepageContentStudio.tsx
 M components/admin/HomepageSocialImageSettings.tsx
 M components/admin/LogoManager.tsx
 M components/admin/PageBuilderManager.tsx
 M components/admin/ProductManager.tsx
 M components/admin/SocialImageField.tsx
 M components/admin/StoreLandingFields.tsx
 M components/admin/WorksPageManager.tsx
 M public/data/website-data.json
 M scripts/test-gallery-seo-settings.mts
 M scripts/test-phase-j1f6-works-public-seo.ts
 M scripts/test-seo1d-social-ux.mts
 M scripts/test-social-image-admin.mts
?? components/admin/SocialImageField.module.css
?? docs/ADMIN_UX1_REPORT.md
?? docs/GALLERY_EXISTING_ARCHITECTURE.md
?? docs/GALLERY_FUTURE_ADMIN_FIELDS.md
?? docs/GALLERY_QA_NOTES.md
?? scripts/gallery-qa-cloudinary-env.mjs
?? scripts/prepare-admin-ux1.mts
?? scripts/seed-gallery-editorial-qa.mts
?? scripts/serve-gallery-owner-qa.mjs
?? scripts/test-admin-ux1-browser.mjs
?? scripts/test-admin-ux1.mts
?? scripts/test-gallery-atmosphere.mts
?? scripts/test-gallery-homepage-controls.mts
?? scripts/test-gallery-qa-environment.mjs
?? scripts/test-gallery-upload-readiness.mts
```

停止於本機可供檢閱的變更。NO COMMIT / NO PUSH / NO DEPLOY。
