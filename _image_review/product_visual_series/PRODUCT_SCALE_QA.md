# KD COFFEE PRODUCT SCALE QA — PV.3A

2026-10-05。8 款 1600 × 2000（4:5）成品尺度統一完成；只更新本地審稿素材，網站／商品／Works／CMS／價格／SKU／庫存／production 圖像未改。OWNER APPROVED（PV.4）。

## Reference 與判斷

Reference：**喬托・初醒 CURRENT PACKAGE v02**。比較原 Gallery 的喬托、莫內、拉斐爾後，喬托的真實袋身 59.10% 最接近目標且主體／留白平衡自然；莫內 63.10% 過大、拉斐爾 50.50% 過小。喬托保留尺寸；其餘依袋型維持 56.20%–59.10% 的小幅差異，不製成完全同尺寸模板。

## Auto metrics（actual body bounds）

SCALE ADJUSTMENT 是相對原整包圖層的線性尺寸變化，不是面積變化。

| PRODUCT | CANVAS SIZE | PACKAGE BODY HEIGHT PX | PACKAGE HEIGHT % | BOTTOM Y % | HORIZONTAL CENTER % | SCALE ADJUSTMENT % | PASS / FAIL |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 喬托・初醒 | 1600 × 2000 | 1182 | 59.10% | 85.50% | 50.03% | +0.00% | PASS |
| 達文西盛宴 | 1600 × 2000 | 1160 | 58.00% | 84.50% | 50.00% | +14.18% | PASS |
| 莫內花語 | 1600 × 2000 | 1170 | 58.50% | 85.50% | 50.03% | -7.34% | PASS |
| 范戴克・騎士 | 1600 × 2000 | 1179 | 58.95% | 85.50% | 50.00% | +0.00% | PASS |
| 林布蘭・奇蹟 | 1600 × 2000 | 1170 | 58.50% | 85.50% | 50.00% | +12.38% | PASS |
| 拉斐爾之吻 | 1600 × 2000 | 1160 | 58.00% | 85.50% | 50.03% | +14.87% | PASS |
| 艾克・柔影 | 1600 × 2000 | 1159 | 57.95% | 85.50% | 50.00% | +17.51% | PASS |
| 拉圖爾・曙光 | 1600 × 2000 | 1124 | 56.20% | 85.50% | 50.03% | +0.00% | PASS |

## 調整前後

原階段的 height 包含 alpha edge margin；本輪採 actual body 測量，所以提供兩種原數值，避免把量測方式差異當成縮放。

| PRODUCT | 原報表 alpha 高度 % | 原實際袋身高度 % | 調整後實際袋身高度 % | 處理 |
| --- | ---: | ---: | ---: | --- |
| 喬托・初醒 | 59.45% | 59.10% | 59.10% | 保留尺寸；移位／重算陰影 |
| 達文西盛宴 | 51.15% | 50.80% | 58.00% | 放大 |
| 莫內花語 | 63.50% | 63.10% | 58.50% | 縮小 |
| 范戴克・騎士 | 59.25% | 58.95% | 58.95% | 保留尺寸；移位／重算陰影 |
| 林布蘭・奇蹟 | 52.45% | 52.05% | 58.50% | 放大 |
| 拉斐爾之吻 | 50.75% | 50.50% | 58.00% | 放大 |
| 艾克・柔影 | 49.65% | 49.35% | 57.95% | 放大 |
| 拉圖爾・曙光 | 56.50% | 56.20% | 56.20% | 保留尺寸；移位／重算陰影 |

## Body bounds 方法

讀既有 package-cutout RGBA，不用整張 source 黑底／padding 長寬。主要量測使用 alpha ≥ 192 的最大 8-connected component，移除零星 detached specks，並要求行／列有至少 1% 的支持像素（最少 4 個）排除透明 halo 與單像素突點。另用 alpha ≥ 128 做 sensitivity comparison；八款原袋身高度差異為 0–2 px。來源尺寸、body box、support 門檻與 sensitivity 詳列 [approved body measurements](pv4_checkpoint/APPROVED_ASSET_MANIFEST.json)。量測框與 debug 證據不列入 checkpoint。

量測僅用於尺度計算，**沒有裁除或重畫原包裝邊緣**。整個 cutout 單一圖層用保比例 width-only Lanczos3 縮放，RGBA／alpha 一起處理；沒有單獨 resample label、拉伸或變形。整包來源、原 cutout、原 mask、原背景、上一版 final 均保留。

## Fidelity 定義與結果

縮放必然產生重採樣像素，所以「保真 PASS」不是宣稱放大後每個 raster pixel 等於未縮放原片。PASS 驗證：原檔 SHA 未改、縮放圖層完全等於同一整包 transform 的預期 RGBA、沒有 label 獨立處理、保比例尺寸只存在小於 0.1% 的整數像素四捨五入誤差、成品的不透明包裝像素與縮放圖層差異 0、alpha blend 差異 0、PNG 與 lossless WebP 解碼完全一致。三款未縮放的圖層 RGBA 與原 cutout 完全一致。**8/8 PASS**，細節見 [approved metrics / fidelity](pv4_checkpoint/APPROVED_ASSET_MANIFEST.json)。

## 位置與陰影

袋身水平中心 50.00%–50.03%（半像素定位四捨五入）；底部 85.50%，達文西因石平台前缘調整為 84.50%。全數在 83%–87%。測量的是實際袋身 bbox 底端的 exclusive edge；透明 halo 不主導定位。

以新袋身 width／height 與下緣 alpha 輪廓重建三層 grounding：局部 contact shadow、ambient grounding、依原光方向的 soft cast shadow。每張陰影保留為獨立 grounding-shadow.png；不是縮放或沿用上一版 shadow。原 1600 × 2000 background master 直接解碼使用，沒有重生成、重裁切、重新著色或改圖檔。

## QA checklist

- [x] 8/8 Product visual height 55%–61%。
- [x] 底部位置一致、horizontal centered、主體保留充足留白。
- [x] Whole-package fidelity PASS，無 label separate resampling、無拉伸。
- [x] Contact／cast／ambient shadow 依新尺寸重算。
- [x] 同尺寸 grid 與成品接觸表已目視檢查：包裝自然站立、沒有明顯浮空／沉入平台或尺寸落差。
- [x] 原背景、包裝、網站與商品資料 SHA 保護檢查，結果見 [checkpoint validation](pv4_checkpoint/CHECKPOINT_VALIDATION.md)。


## PV.4 approved checkpoint

Owner 已明確核准八款。原始 QA 分數與幾何結果保留；圖像未修改。舊候選、debug 截圖、完整 Git 日誌與本機 server 產物不列入 checkpoint。

[Approval](PRODUCT_VISUAL_APPROVAL_V1.md) · [Hashes / geometry / fidelity / balance evidence](pv4_checkpoint/APPROVED_ASSET_MANIFEST.json) · [Validation](pv4_checkpoint/CHECKPOINT_VALIDATION.md) · [Review](PRODUCT_SERIES_OWNER_REVIEW.html)
