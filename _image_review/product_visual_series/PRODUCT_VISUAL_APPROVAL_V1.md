# PRODUCT VISUAL APPROVAL V1 — KD COFFEE

APPROVAL STATUS: **OWNER APPROVED**

Owner 在本次對話明確授予 Final Visual Approval：APPROVED。記錄日期：2026-10-05（Asia/Taipei）。此核准只涵蓋以下固定雜湊版本的商品主視覺與 checkpoint staging；commit 仍待 Owner 另行核准。

## APPROVED PRODUCTS

1. 喬托・初醒
2. 達文西盛宴
3. 莫內花語
4. 范戴克・騎士
5. 林布蘭・奇蹟
6. 拉斐爾之吻
7. 艾克・柔影
8. 拉圖爾・曙光

## APPROVED STANDARD

- 1600×2000；4:5。
- Package body scale 55%–61%；實測 56.20%–59.10%。
- Bottom position 84.5%–85.5%。
- Real package pixels preserved：單一整包圖層等比例縮放；沒有單獨重採樣標籤、改色或重繪。5 款整包使用 Lanczos3 縮放，因此不是與未縮放原片逐像素相同；相對預期整包縮放結果 RGBA 完全一致，3 款原尺度保持。
- No AI-redrawn package；no AI-redrawn label。
- Background-only generation allowed；本階段没有生成任何背景或包裝。
- Final compositing required；保留真實來源、原始去背、核准縮放圖層、alpha mask、重建接地陰影及背景。

## QA RESULTS

- PV.3A result：8/8 SCALE PASS。Reference：喬托・初醒 CURRENT PACKAGE v02。
- PV.3B result：8/8 BALANCE PASS；TUNE=0；所有 final 與 PV.3A 核准檔案相同。
- Package fidelity result：8/8 PASS；整包預期縮放 RGBA 相同；opaque composite mismatch=0；alpha blend mismatch=0；PNG / lossless WebP 解碼像素一致。
- Commercial readiness result：8/8 PASS（視覺品質）；不等同開賣授權。

## DATA / RELEASE BOUNDARY

艾克・柔影（Jan van Eyck）與拉圖爾・曙光（Georges de La Tour）已有 canonical Works/Product 基礎資料；Admin 可載入；active=false、status=coming_soon、purchasable=false、stock=0、publish.website=false、purchase=[]、skus=[]；無 price / sku 欄位，沒有猜價或假 SKU。未出現在公開列表、不能下單。既有已知 slug 的直接 Works 詳情仍可能顯示，現有 unpublished 狀態不等於私密路由。

Canonical public 圖像引用保留 PD.1A 建立資料時的 4 個必要媒體檔；PV.4 核准 final 16 個 PNG/WebP 僅作 checkpoint／Review 保存，本階段没有更換網站既有圖片或資料。

## TRACEABILITY

- [Approved assets / hashes / geometry / QA](pv4_checkpoint/APPROVED_ASSET_MANIFEST.json)
- [Exact file selection](pv4_checkpoint/CHECKPOINT_FILE_SELECTION.md)
- [Validation](pv4_checkpoint/CHECKPOINT_VALIDATION.md)
- [Source map](PRODUCT_PACKAGE_SOURCE_MAP.md)
- [Scale QA](PRODUCT_SCALE_QA.md)
- [Balance QA](PRODUCT_VISUAL_BALANCE_QA.md)
- [Owner Review](PRODUCT_SERIES_OWNER_REVIEW.html)

STOP BEFORE COMMIT。NO COMMIT / NO PUSH / NO DEPLOY。WAIT FOR OWNER COMMIT APPROVAL。
