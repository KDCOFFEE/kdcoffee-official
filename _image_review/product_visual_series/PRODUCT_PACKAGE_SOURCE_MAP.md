# PRODUCT PACKAGE SOURCE MAP — APPROVED V1

2026-10-05 · OWNER APPROVED · 8 款真實包裝與 final 僅使用下表版本。完整來源／去背／背景／scaled layer／mask／shadow／PNG／WebP 路徑與 SHA-256：[Approved manifest](pv4_checkpoint/APPROVED_ASSET_MANIFEST.json)。所有相對路徑以本文件目錄為基準。

| PRODUCT | CANONICAL ID / SLUG | ARTIST | OWNER REAL SOURCE | SAVED SOURCE | APPROVED FINAL PNG / WEBP |
| --- | --- | --- | --- | --- | --- |
| 喬托・初醒 | P00001 / giotto-awakening | GIOTTO | 20260930_184457-Photoroom (4).png | [source](giotto-awakening/source-package/source-package-v02.png) | [PNG](pv3a_scale/giotto-awakening/final-composite-pv3a.png) / [WebP](pv3a_scale/giotto-awakening/final-composite-pv3a.webp) |
| 達文西盛宴 | P00002 / davinci-feast | LEONARDO DA VINCI | 20260930_181350-Photoroom.png | [source](davinci-feast/source-package/source-package-v01.png) | [PNG](pv3a_scale/davinci-feast/final-composite-pv3a.png) / [WebP](pv3a_scale/davinci-feast/final-composite-pv3a.webp) |
| 莫內花語 | P00003 / monet-floral | CLAUDE MONET | 20260930_181420-Photoroom.png | [source](monet-floral/source-package/source-package-v01.png) | [PNG](pv3a_scale/monet-floral/final-composite-pv3a.png) / [WebP](pv3a_scale/monet-floral/final-composite-pv3a.webp) |
| 范戴克・騎士 | P00005 / vandyck-knight | ANTHONY VAN DYCK | 20260930_181249-Photoroom.png | [source](vandyck-knight/source-package/source-package-v01.png) | [PNG](pv3a_scale/vandyck-knight/final-composite-pv3a.png) / [WebP](pv3a_scale/vandyck-knight/final-composite-pv3a.webp) |
| 林布蘭・奇蹟 | P00009 / rembrandt-miracle | REMBRANDT | 20260930_181318-Photoroom.png | [source](rembrandt-miracle/source-package/source-package-v01.png) | [PNG](pv3a_scale/rembrandt-miracle/final-composite-pv3a.png) / [WebP](pv3a_scale/rembrandt-miracle/final-composite-pv3a.webp) |
| 拉斐爾之吻 | P00007 / raphael-kiss | RAPHAEL | 20260930_181336-Photoroom.png | [source](raphael-kiss/source-package/source-package-v01.png) | [PNG](pv3a_scale/raphael-kiss/final-composite-pv3a.png) / [WebP](pv3a_scale/raphael-kiss/final-composite-pv3a.webp) |
| 艾克・柔影 | P00024 / eyck-soft-shadow | JAN VAN EYCK | 20260930_181343-Photoroom.png | [source](eyck-soft-shadow/source-package/source-package-v01.png) | [PNG](pv3a_scale/eyck-soft-shadow/final-composite-pv3a.png) / [WebP](pv3a_scale/eyck-soft-shadow/final-composite-pv3a.webp) |
| 拉圖爾・曙光 | P00025 / la-tour-dawn | GEORGES DE LA TOUR | 20260930_181427-Photoroom.png | [source](la-tour-dawn/source-package/source-package-v01.png) | [PNG](pv3a_scale/la-tour-dawn/final-composite-pv3a.png) / [WebP](pv3a_scale/la-tour-dawn/final-composite-pv3a.webp) |

喬托只選教堂／初醒插畫 v02，舊 181311 原片與 v01 成品不進 checkpoint；范戴克選 181249，181257 替代角度不進 checkpoint。沒有 AI 假造 Logo、包裝、標籤或產品文字。

每款固定 pipeline：Owner 原片 → existing whole package cutout → 單一圖層等比例 Lanczos3（或原尺度）→ 以 actual body bounds 定位 → 依底部輪廓重建 contact / cast / ambient shadow → original background 合成 → approved PNG / lossless WebP。Alpha ≥192、最大 8-connected component、行列支持門檻排除 halo；不是只依 alpha 全框。

[Deterministic verify/reproduce recipe](pv4_checkpoint/REPRODUCE_APPROVED_FINALS.cjs) 預設只在記憶體驗證；不需要 AI 重新生成。重製新副本必須明確傳入 --write，且只輸出 pv4_checkpoint/reproduced/。不得覆寫核准檔案。執行環境版本保存在 manifest。

兩款新增資料唯一 canonical 檔：public/data/website-data.json 的 menu.products，P00024 / eyck-soft-shadow、P00025 / la-tour-dawn。未開賣、stock=0、無價／無 sale SKU。其 existing public image dependencies 保留 PD.1A 媒體，與本次批准的 PV.3A final 各有用途；本階段沒有替換網站圖片。

[Owner Approval](PRODUCT_VISUAL_APPROVAL_V1.md) · [File selection](pv4_checkpoint/CHECKPOINT_FILE_SELECTION.md)
