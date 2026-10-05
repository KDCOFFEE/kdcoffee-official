# PV.5 Owner final review — 36 items

READY FOR STAGING REVIEW. No commit / push / deploy / Railway production volume access. Cropped positions were intentionally stopped according to the Owner rule. Current base commit 5026097097ac8ad935be7a4e722050e790edb9a1 on j5d7b-reward-cron-notification-isolation.

1. 中斷前成果：新增角色、promote 八張原 WebP、11 組遷移安全測試、23→25 隔離合併、61 檔保護、build/Cart/Checkout/mini 60/60、八 URL/hash。由現有檔案/log 複核，未重新建立素材或網站。
2. 中斷位置為實際頁面/crop QA。續跑完成父層裁切與 Mobile/Admin QA、停止不適合位置、12th resolver-preservation test、更新隔離候選與必要最終驗證、三份文件及本回報。發現裁切及 Hero fallback 後才因程式變更重跑 build。
3. Production flow：/data/store/website-data.json → assets.productVisual + pageLayout.listAsset → resolver → component → URL → Next public-static match（檔案存在時優先），否則既有 upload route → /data/uploads/artworks。實際 HTTP static bytes 與 volume handler 均另驗 8/8；完整 precedence 見 PV5_PRODUCTION_IMAGE_FLOW.md。
4. 八款 field：均新增 assets.productVisual.path、listAsset=productVisual。productAsset 保留原值；新 master 在不合適的 product-stage STOP。
5. 八款 production WebP paths 與核准 hash：

| PRODUCT | FIELD / SELECTOR | PRODUCTION URL | SHA256 |
| --- | --- | --- | --- |
| P00001 喬托・初醒 | assets.productVisual.path; pageLayout.listAsset=productVisual | /uploads/artworks/giotto-awakening/kdcoffee-giotto-awakening-product-visual-v01.webp | 18c84ecbb1d192c664c24c973fd8dde830ee5608366c627078eca522f419c73c |
| P00002 達文西盛宴 | assets.productVisual.path; pageLayout.listAsset=productVisual | /uploads/artworks/davinci-feast/kdcoffee-davinci-feast-product-visual-v01.webp | 25bf104203f0cf1bf50f7742e3ca1a1b701210ea5f43756d941d0f287f5c7357 |
| P00003 莫內花語 | assets.productVisual.path; pageLayout.listAsset=productVisual | /uploads/artworks/monet-floral/kdcoffee-monet-floral-product-visual-v01.webp | e03424252767a4a5ac0b9ab1d63c6d9da6d1ee1a1d79eea430e6ee526368b715 |
| P00005 范戴克・騎士 | assets.productVisual.path; pageLayout.listAsset=productVisual | /uploads/artworks/vandyck-knight/kdcoffee-vandyck-knight-product-visual-v01.webp | 7297762dbbf4708ef4375a320a877fac143917bba0c104e233c2af2bc4b9c76a |
| P00009 林布蘭・奇蹟 | assets.productVisual.path; pageLayout.listAsset=productVisual | /uploads/artworks/rembrandt-miracle/kdcoffee-rembrandt-miracle-product-visual-v01.webp | e4f9d9f604f6317f1649d44b267909551487d52fce9440f230a0e51eec363d40 |
| P00007 拉斐爾之吻 | assets.productVisual.path; pageLayout.listAsset=productVisual | /uploads/artworks/raphael-kiss/kdcoffee-raphael-kiss-product-visual-v01.webp | 0adb9045568fc57e3369272c96e341f740a56a33ce433caad803a78cf6fedd73 |
| P00024 艾克・柔影 | assets.productVisual.path; pageLayout.listAsset=productVisual | /uploads/artworks/eyck-soft-shadow/kdcoffee-eyck-soft-shadow-product-visual-v01.webp | c1d976a8f52d82c44c0520b02ba5ffb6bda1f49d20ed557d8d033dc2295df5f3 |
| P00025 拉圖爾・曙光 | assets.productVisual.path; pageLayout.listAsset=productVisual | /uploads/artworks/la-tour-dawn/kdcoffee-la-tour-dawn-product-visual-v01.webp | 1a0fc08f6343cd0e4b73433f324ba8b2ca8f13b59d9bfc782c7d93e141cd729e |

6. URL：8/8 HTTP 200，image/webp，1600×2000；隔離 production runtime，非 review server。HTTP 使用 repository public file（max-age=0）；另對實際 volume route handler 做 8/8 status/hash（max-age=3600），沒有混稱。
7. Hash：8/8 approved source = promoted WebP = isolated runtime HTTP body SHA256。無重新輸出/壓縮/生圖。
8. Page matrix：已完成 PV5_PAGE_IMAGE_MATRIX.md。Works/Home/Admin 4:5 卡通過；其餘有明確 STOP/DEFER，不能宣稱全部位置完成新圖接線。
9. Crop：24 個實際 Desktop/Mobile master 顯示位置 PASS；過度裁切框的新圖已停用。產品照、Related、豆單、Page Builder需 layout-specific variant／QA；Admin 小縮圖使用 full-image link。
10. Hero/artwork：8/8 原 Hero/ArtworkCover/MainVisual/ProductPhoto/Label asset objects 與既有用途保留。林布蘭 hidden detail 404、兩款 draft 原 Hero 直連 200 均為預期。
11. Migration：scripts/migrate-pv5-product-visuals.mjs；manifest bootstrap/patches/pv5-approved-product-visuals-v01.json。
12. dry-run：PASS，零 data/backup/media/lock 寫入；預設模式。
13. conflict stop：PASS，ID/slug、重複 key、已有不同 visual/role/media、unsafe draft 均停止。
14. stale snapshot：PASS，--apply 必須有 reviewed SHA256，SHA 不符零 mutation。
15. backup/restore：PASS，寫入前 exact raw backup + receipt；CAS rollback 還原原始 JSON bytes；不刪原有或新複製 media。
16. idempotency：PASS，第二次 apply 無 duplicate records/references/files，無額外 backup；完整 tree-hash no-op。
17. 隔離模擬：23→25 PASS；未使用 live Railway snapshot；final list-only merge 重新從 exact 原始備份 apply，舊候選只在隔離資料中 rollback。
18. P00024/P00025：Admin API 25 records 可見，unlisted/unpublished/unpurchasable、stock0、purchase[]、skus[]、無 price/root selling SKU；偽造 option 下單被拒絕。
19. Existing23：business semantic projection PASS；17 untargeted records exact。6 原核准商品只新增 visual + list selector；原 price/SKU/inventory/copy/order 等保留。不能把 visual 欄位已變更稱為整筆完全相同。
20. Protected runtime：61 個原有其他檔案 SHA256 PASS；原本機407 content hashes PASS、400 original untracked 仍 untracked、原刪除 zip 状態保留。只證明隔離與本機，不是假稱比較 live production。
21. TypeScript：PASS（候選 tsc --noEmit --incremental false，exit0）。
22. Production build：PASS（現有 npm run build / Next16.2.10），118 built route entries。既有 persistentStorageInit NFT tracing warning 非 fatal；未改 build 設定。原 working-tree .next 未動。
23. Cart：PASS，現有 order/cart/checkout regression。
24. Checkout：PASS，價格篡改拒絕與 canonical pricing preserved；兩 draft 拒絕。
25. Mini-cart：60/60 PASS（既有 source/behavior assertions；未下真實訂單）。
26. Works/Product：PASS，八 list resolver 正確、stopped-layout legacy resolver preserved、Admin 25、public listing unchanged、draft safe。
27. PRODUCTION REQUIRED（15）：

- components/admin/ProductManager.tsx
- scripts/migrate-pv5-product-visuals.mjs
- bootstrap/patches/pv5-approved-product-visuals-v01.json
- public/uploads/artworks/giotto-awakening/kdcoffee-giotto-awakening-product-visual-v01.webp
- public/uploads/artworks/davinci-feast/kdcoffee-davinci-feast-product-visual-v01.webp
- public/uploads/artworks/monet-floral/kdcoffee-monet-floral-product-visual-v01.webp
- public/uploads/artworks/vandyck-knight/kdcoffee-vandyck-knight-product-visual-v01.webp
- public/uploads/artworks/rembrandt-miracle/kdcoffee-rembrandt-miracle-product-visual-v01.webp
- public/uploads/artworks/raphael-kiss/kdcoffee-raphael-kiss-product-visual-v01.webp
- public/uploads/artworks/eyck-soft-shadow/kdcoffee-eyck-soft-shadow-product-visual-v01.webp
- public/uploads/artworks/la-tour-dawn/kdcoffee-la-tour-dawn-product-visual-v01.webp
- lib/productVisualAssets.ts
- app/works/[slug]/page.tsx
- app/monthly-menu/page.tsx
- components/page-builder/PageBuilderRenderer.tsx

28. TEST REQUIRED：scripts/test-pv5-product-visuals.mjs（12 groups）。
29. DOCUMENTATION REQUIRED（4）：

- _image_review/product_visual_series/pv5_wiring/PV5_PRODUCTION_IMAGE_FLOW.md
- _image_review/product_visual_series/pv5_wiring/PV5_VOLUME_SYNC_PLAN.md
- _image_review/product_visual_series/pv5_wiring/PV5_PAGE_IMAGE_MATRIX.md
- _image_review/product_visual_series/pv5_wiring/PV5_OWNER_REPORT.md

30. LOCAL-ONLY / EXCLUDED：整個 pv5_wiring/local-only/（inspect/setup/simulation/runtime/http/integrity/doc-writing helpers、raw JSON snapshots、logs、HTML responses、browser screenshots）、外部隔離 build/volume、原400 local files 與原8 dirty paths。既有 QA/master archival assets 已在5026097，不重複加入。
31. STAGED FILE LIST（預定 20，下方 staging verification 將記錄 actual）：

- _image_review/product_visual_series/pv5_wiring/PV5_OWNER_REPORT.md
- _image_review/product_visual_series/pv5_wiring/PV5_PAGE_IMAGE_MATRIX.md
- _image_review/product_visual_series/pv5_wiring/PV5_PRODUCTION_IMAGE_FLOW.md
- _image_review/product_visual_series/pv5_wiring/PV5_VOLUME_SYNC_PLAN.md
- app/monthly-menu/page.tsx
- app/works/[slug]/page.tsx
- bootstrap/patches/pv5-approved-product-visuals-v01.json
- components/admin/ProductManager.tsx
- components/page-builder/PageBuilderRenderer.tsx
- lib/productVisualAssets.ts
- public/uploads/artworks/davinci-feast/kdcoffee-davinci-feast-product-visual-v01.webp
- public/uploads/artworks/eyck-soft-shadow/kdcoffee-eyck-soft-shadow-product-visual-v01.webp
- public/uploads/artworks/giotto-awakening/kdcoffee-giotto-awakening-product-visual-v01.webp
- public/uploads/artworks/la-tour-dawn/kdcoffee-la-tour-dawn-product-visual-v01.webp
- public/uploads/artworks/monet-floral/kdcoffee-monet-floral-product-visual-v01.webp
- public/uploads/artworks/raphael-kiss/kdcoffee-raphael-kiss-product-visual-v01.webp
- public/uploads/artworks/rembrandt-miracle/kdcoffee-rembrandt-miracle-product-visual-v01.webp
- public/uploads/artworks/vandyck-knight/kdcoffee-vandyck-knight-product-visual-v01.webp
- scripts/migrate-pv5-product-visuals.mjs
- scripts/test-pv5-product-visuals.mjs

32. git diff --cached --stat：完成 exact-path staging 後記錄於下方。
33. git status --short：完成 staging 後記錄於下方；原8 tracked dirty、400 original untracked 必須保持 local-only。
34. 現在只 deploy code，新圖會完整出現嗎？NO。既有 persistent canonical JSON/upload volume 不會自動套用 patch；code 本身只提供素材、角色/裁切停止 guard、顯示與 migration 工具。即使之後 apply，也只有符合 live eligibility 的卡片顯示，兩 draft 與 hidden 林布蘭不會公開。
35. 是否仍須 production volume migration apply？YES，需 Owner 獨立批准、review actual live dry-run/backup/conflicts；本輪沒有 live-volume 讀寫。
36. 安全順序：Owner PV.5 review → approved commit → approved push → approved clean CLI code deploy → actual live dry-run/review → separately approved migration apply → live URL/cards/flags QA。先部署 guard 再 apply，避免舊 renderer 將新 list refs 塞入 cropped Related/thumbnail。Deferred variants 不在本次 scope；需另批。

WAIT FOR OWNER PV.5 FINAL REVIEW. DO NOT COMMIT / PUSH / DEPLOY / WRITE PRODUCTION VOLUME.

## Actual staging verification

20/20 exact selected files staged. Protected-file check PASS; tested source/manifest/test/8 binary assets match index (text compared with Git line-ending normalization). Original 8 unstaged tracked paths remain untouched and unstaged; original 400 untracked remain local-only, with 407 baseline content hashes verified. There are 495 total untracked files including previous/current local-only QA artifacts; this is not a claim that the total is only 400.

Branch: j5d7b-reward-cron-notification-isolation
HEAD: 5026097097ac8ad935be7a4e722050e790edb9a1

git diff --cached --stat:

```text
 .../pv5_wiring/PV5_OWNER_REPORT.md                 | 327 +++++++++++++++
 .../pv5_wiring/PV5_PAGE_IMAGE_MATRIX.md            |  63 +++
 .../pv5_wiring/PV5_PRODUCTION_IMAGE_FLOW.md        |  57 +++
 .../pv5_wiring/PV5_VOLUME_SYNC_PLAN.md             |  47 +++
 app/monthly-menu/page.tsx                          |   4 +-
 app/works/[slug]/page.tsx                          |   4 +-
 .../patches/pv5-approved-product-visuals-v01.json  | 467 +++++++++++++++++++++
 components/admin/ProductManager.tsx                |   7 +-
 components/page-builder/PageBuilderRenderer.tsx    |   2 +-
 lib/productVisualAssets.ts                         |   6 +-
 .../kdcoffee-davinci-feast-product-visual-v01.webp | Bin 0 -> 2076538 bytes
 ...coffee-eyck-soft-shadow-product-visual-v01.webp | Bin 0 -> 2307368 bytes
 ...coffee-giotto-awakening-product-visual-v01.webp | Bin 0 -> 2325888 bytes
 .../kdcoffee-la-tour-dawn-product-visual-v01.webp  | Bin 0 -> 2601120 bytes
 .../kdcoffee-monet-floral-product-visual-v01.webp  | Bin 0 -> 2346122 bytes
 .../kdcoffee-raphael-kiss-product-visual-v01.webp  | Bin 0 -> 2196076 bytes
 ...offee-rembrandt-miracle-product-visual-v01.webp | Bin 0 -> 2568138 bytes
 ...kdcoffee-vandyck-knight-product-visual-v01.webp | Bin 0 -> 2383196 bytes
 scripts/migrate-pv5-product-visuals.mjs            | 227 ++++++++++
 scripts/test-pv5-product-visuals.mjs               | 145 +++++++
 20 files changed, 1346 insertions(+), 10 deletions(-)
```

git diff --cached --name-only:

```text
_image_review/product_visual_series/pv5_wiring/PV5_OWNER_REPORT.md
_image_review/product_visual_series/pv5_wiring/PV5_PAGE_IMAGE_MATRIX.md
_image_review/product_visual_series/pv5_wiring/PV5_PRODUCTION_IMAGE_FLOW.md
_image_review/product_visual_series/pv5_wiring/PV5_VOLUME_SYNC_PLAN.md
app/monthly-menu/page.tsx
app/works/[slug]/page.tsx
bootstrap/patches/pv5-approved-product-visuals-v01.json
components/admin/ProductManager.tsx
components/page-builder/PageBuilderRenderer.tsx
lib/productVisualAssets.ts
public/uploads/artworks/davinci-feast/kdcoffee-davinci-feast-product-visual-v01.webp
public/uploads/artworks/eyck-soft-shadow/kdcoffee-eyck-soft-shadow-product-visual-v01.webp
public/uploads/artworks/giotto-awakening/kdcoffee-giotto-awakening-product-visual-v01.webp
public/uploads/artworks/la-tour-dawn/kdcoffee-la-tour-dawn-product-visual-v01.webp
public/uploads/artworks/monet-floral/kdcoffee-monet-floral-product-visual-v01.webp
public/uploads/artworks/raphael-kiss/kdcoffee-raphael-kiss-product-visual-v01.webp
public/uploads/artworks/rembrandt-miracle/kdcoffee-rembrandt-miracle-product-visual-v01.webp
public/uploads/artworks/vandyck-knight/kdcoffee-vandyck-knight-product-visual-v01.webp
scripts/migrate-pv5-product-visuals.mjs
scripts/test-pv5-product-visuals.mjs
```

git status --short:

```text
 D KD_Coffee_Launcher_v5.2.2.zip
A  _image_review/product_visual_series/pv5_wiring/PV5_OWNER_REPORT.md
A  _image_review/product_visual_series/pv5_wiring/PV5_PAGE_IMAGE_MATRIX.md
A  _image_review/product_visual_series/pv5_wiring/PV5_PRODUCTION_IMAGE_FLOW.md
A  _image_review/product_visual_series/pv5_wiring/PV5_VOLUME_SYNC_PLAN.md
M  app/monthly-menu/page.tsx
M  app/works/[slug]/page.tsx
A  bootstrap/patches/pv5-approved-product-visuals-v01.json
M  components/admin/ProductManager.tsx
M  components/page-builder/PageBuilderRenderer.tsx
 M data/fulfillment/state.json
 M data/membership-commerce/business-rules.json
M  lib/productVisualAssets.ts
 M public/data/assets.json
 M public/data/homepage.json
 M public/data/pages.json
 M public/data/website-data.json
A  public/uploads/artworks/davinci-feast/kdcoffee-davinci-feast-product-visual-v01.webp
A  public/uploads/artworks/eyck-soft-shadow/kdcoffee-eyck-soft-shadow-product-visual-v01.webp
A  public/uploads/artworks/giotto-awakening/kdcoffee-giotto-awakening-product-visual-v01.webp
A  public/uploads/artworks/la-tour-dawn/kdcoffee-la-tour-dawn-product-visual-v01.webp
A  public/uploads/artworks/monet-floral/kdcoffee-monet-floral-product-visual-v01.webp
A  public/uploads/artworks/raphael-kiss/kdcoffee-raphael-kiss-product-visual-v01.webp
A  public/uploads/artworks/rembrandt-miracle/kdcoffee-rembrandt-miracle-product-visual-v01.webp
A  public/uploads/artworks/vandyck-knight/kdcoffee-vandyck-knight-product-visual-v01.webp
A  scripts/migrate-pv5-product-visuals.mjs
 M scripts/test-phase-j3a-member-referral-invite.mjs
A  scripts/test-pv5-product-visuals.mjs
?? AI_CORE_GENERATION_SET.md
?? IMAGE_AUDIT.md
?? IMAGE_GENERATION_PLAN.md
?? KD_Coffee_Launcher_v5.2.2.rar
?? KD_Coffee_Launcher_v5.2.3_LINE_AUTO_2B_QA.zip
?? KD_Coffee_Launcher_v5.2.3_LINE_AUTO_2B_QA/
?? KD_Coffee_Launcher_v5.2.4_LINE_AUTO_3_QA.zip
?? KD_Coffee_Launcher_v5.2.4_LINE_AUTO_3_QA/
?? PATCH_MANIFEST.txt
?? PATCH_MANIFEST_J2B3B1.txt
?? PATCH_MANIFEST_J2B3B_HOTFIX.txt
?? PATCH_MANIFEST_J2C.txt
?? PATCH_MANIFEST_J2C1.txt
?? PATCH_MANIFEST_J2C2.txt
?? PATCH_MANIFEST_J5A.txt
?? PATCH_MANIFEST_J5B.txt
?? PATCH_MANIFEST_J5C1.txt
?? PATCH_MANIFEST_J5C1_H2.txt
?? PATCH_MANIFEST_J5C2.txt
?? PATCH_MANIFEST_J5C2A.txt
?? PATCH_MANIFEST_J5C2A_H1.txt
?? PATCH_MANIFEST_J5C3.txt
?? PATCH_MANIFEST_J5D5_H1.json
?? PATCH_MANIFEST_J5D5_MEMBER_BACKUP.json
?? PRODUCT_VISUAL_REVIEW.md
?? README_J2B3.txt
?? README_J2B3A.txt
?? README_J5D5_H1.md
?? REAL_ASSET_REQUIREMENTS.md
?? _image_review/product_visual_phase_pv1/
?? _image_review/product_visual_phase_pv1a/
?? _image_review/product_visual_series/GALLERY_ALL_SIX_PROOF.jpg
?? _image_review/product_visual_series/GALLERY_DESKTOP_PROOF.jpg
?? _image_review/product_visual_series/GALLERY_MOBILE_PROOF.jpg
?? _image_review/product_visual_series/PROTECTED_HASH_CHECK.txt
?? _image_review/product_visual_series/PV1B_PV3_REPORT.md
?? _image_review/product_visual_series/SERIES_QA_RECORD.txt
?? _image_review/product_visual_series/audit/
?? _image_review/product_visual_series/build-review.cjs
?? _image_review/product_visual_series/composite-product.cjs
?? _image_review/product_visual_series/davinci-feast/COMPOSITING_QA_v01.txt
?? _image_review/product_visual_series/davinci-feast/background/background-native-v01.png
?? _image_review/product_visual_series/davinci-feast/background/generation-prompt-v01.txt
?? _image_review/product_visual_series/davinci-feast/final/
?? _image_review/product_visual_series/davinci-feast/mask/
?? _image_review/product_visual_series/eyck-soft-shadow/COMPOSITING_QA_v01.txt
?? _image_review/product_visual_series/eyck-soft-shadow/final/
?? _image_review/product_visual_series/eyck-soft-shadow/mask/
?? _image_review/product_visual_series/finalize-report.cjs
?? _image_review/product_visual_series/giotto-awakening/COMPOSITING_QA_v02.txt
?? _image_review/product_visual_series/giotto-awakening/final/
?? _image_review/product_visual_series/giotto-awakening/mask/
?? _image_review/product_visual_series/git-status-short.txt
?? _image_review/product_visual_series/git-status-start.txt
?? _image_review/product_visual_series/la-tour-dawn/COMPOSITING_QA_v01.txt
?? _image_review/product_visual_series/la-tour-dawn/final/
?? _image_review/product_visual_series/la-tour-dawn/mask/
?? _image_review/product_visual_series/monet-floral/COMPOSITING_QA_v01.txt
?? _image_review/product_visual_series/monet-floral/final/
?? _image_review/product_visual_series/monet-floral/mask/
?? _image_review/product_visual_series/pd1_audit/
?? _image_review/product_visual_series/pd1a_audit/
?? _image_review/product_visual_series/pd1a_completion/
?? _image_review/product_visual_series/prepare-series.cjs
?? _image_review/product_visual_series/protected-baseline-pv3.txt
?? _image_review/product_visual_series/pv3a_scale/BODY_MEASUREMENTS.json
?? _image_review/product_visual_series/pv3a_scale/GALLERY_DATA_PV3A.json
?? _image_review/product_visual_series/pv3a_scale/PRODUCT_SCALE_METRICS.json
?? _image_review/product_visual_series/pv3a_scale/PROTECTED_VERIFICATION.json
?? _image_review/product_visual_series/pv3a_scale/SCALE_CONTACT_SHEET.png
?? _image_review/product_visual_series/pv3a_scale/SCALE_QA_GALLERY.jpg
?? _image_review/product_visual_series/pv3a_scale/davinci-feast/SCALE_QA.json
?? _image_review/product_visual_series/pv3a_scale/davinci-feast/SCALE_QA.txt
?? _image_review/product_visual_series/pv3a_scale/davinci-feast/body-bounds-proof.png
?? _image_review/product_visual_series/pv3a_scale/eyck-soft-shadow/SCALE_QA.json
?? _image_review/product_visual_series/pv3a_scale/eyck-soft-shadow/SCALE_QA.txt
?? _image_review/product_visual_series/pv3a_scale/eyck-soft-shadow/body-bounds-proof.png
?? _image_review/product_visual_series/pv3a_scale/gallery.before.html
?? _image_review/product_visual_series/pv3a_scale/gallery.diff
?? _image_review/product_visual_series/pv3a_scale/giotto-awakening/SCALE_QA.json
?? _image_review/product_visual_series/pv3a_scale/giotto-awakening/SCALE_QA.txt
?? _image_review/product_visual_series/pv3a_scale/giotto-awakening/body-bounds-proof.png
?? _image_review/product_visual_series/pv3a_scale/git-head-start.txt
?? _image_review/product_visual_series/pv3a_scale/git-index-start.diff
?? _image_review/product_visual_series/pv3a_scale/git-status-current.txt
?? _image_review/product_visual_series/pv3a_scale/git-status-start.txt
?? _image_review/product_visual_series/pv3a_scale/la-tour-dawn/SCALE_QA.json
?? _image_review/product_visual_series/pv3a_scale/la-tour-dawn/SCALE_QA.txt
?? _image_review/product_visual_series/pv3a_scale/la-tour-dawn/body-bounds-proof.png
?? _image_review/product_visual_series/pv3a_scale/monet-floral/SCALE_QA.json
?? _image_review/product_visual_series/pv3a_scale/monet-floral/SCALE_QA.txt
?? _image_review/product_visual_series/pv3a_scale/monet-floral/body-bounds-proof.png
?? _image_review/product_visual_series/pv3a_scale/normalize-scale.cjs
?? _image_review/product_visual_series/pv3a_scale/products.before.json
?? _image_review/product_visual_series/pv3a_scale/protected-baseline.json
?? _image_review/product_visual_series/pv3a_scale/raphael-kiss/SCALE_QA.json
?? _image_review/product_visual_series/pv3a_scale/raphael-kiss/SCALE_QA.txt
?? _image_review/product_visual_series/pv3a_scale/raphael-kiss/body-bounds-proof.png
?? _image_review/product_visual_series/pv3a_scale/rembrandt-miracle/SCALE_QA.json
?? _image_review/product_visual_series/pv3a_scale/rembrandt-miracle/SCALE_QA.txt
?? _image_review/product_visual_series/pv3a_scale/rembrandt-miracle/body-bounds-proof.png
?? _image_review/product_visual_series/pv3a_scale/update-review.cjs
?? _image_review/product_visual_series/pv3a_scale/vandyck-knight/SCALE_QA.json
?? _image_review/product_visual_series/pv3a_scale/vandyck-knight/SCALE_QA.txt
?? _image_review/product_visual_series/pv3a_scale/vandyck-knight/body-bounds-proof.png
?? _image_review/product_visual_series/pv3a_scale/verify-protected.cjs
?? _image_review/product_visual_series/pv3b_balance/
?? _image_review/product_visual_series/pv4_checkpoint/PV4_OWNER_REPORT.md
?? _image_review/product_visual_series/pv4_checkpoint/local-only/
?? _image_review/product_visual_series/pv4_checkpoint/prepare-checkpoint.cjs
?? _image_review/product_visual_series/pv5_wiring/local-only/
?? _image_review/product_visual_series/raphael-kiss/COMPOSITING_QA_v01.txt
?? _image_review/product_visual_series/raphael-kiss/final/
?? _image_review/product_visual_series/raphael-kiss/mask/
?? _image_review/product_visual_series/rembrandt-miracle/COMPOSITING_QA_v01.txt
?? _image_review/product_visual_series/rembrandt-miracle/final/
?? _image_review/product_visual_series/rembrandt-miracle/mask/
?? _image_review/product_visual_series/review-server.cjs
?? _image_review/product_visual_series/vandyck-knight/COMPOSITING_QA_v01.txt
?? _image_review/product_visual_series/vandyck-knight/final/
?? _image_review/product_visual_series/vandyck-knight/mask/
?? _runtime_corruption_backup_20260907-125649/
?? data/member-center/
?? public/brand/
?? public/uploads/artworks/giotto-awakening/kdcoffee-giotto-awakening-roasted-beans-v01.webp
?? public/uploads/artworks/giotto-awakening/kdcoffee-giotto-awakening-roasted-beans-v02.webp
?? public/uploads/artworks/monthly-menu/
?? public/uploads/artworks/payment/
?? public/uploads/assets/page-builder/kd-coffee-page-8387f2df-ce81-4276-b162-2b2c82af2f87-cdfb0d31697d-v01.webp
?? public/uploads/assets/page-builder/kd-coffee-page-8387f2df-ce81-4276-b162-2b2c82af2f87-fc3c28efdc55-v01.webp
?? public/uploads/assets/page-builder/kd-coffee-page-8387f2df-ce81-4276-b162-2b2c82af2f87-fdb8925dca52-v01.webp
?? public/uploads/assets/page-builder/kd-coffee-page-ae82038b-3e13-4401-b126-aac2067c7af4-a8c3a536110e-v01.webp
?? public/uploads/member-avatars/
?? qa-output/
?? scripts/test-phase-j5c2a-order-status-refresh-sync.mjs
```

NO COMMIT / PUSH / DEPLOY / PRODUCTION VOLUME WRITE. WAIT FOR OWNER PV.5 FINAL REVIEW.
