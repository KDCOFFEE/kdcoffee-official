# MEMBER CENTER DISPLAY COPY / LABELS MANAGEMENT — FINAL REPORT

日期：2026-10-01。專案：F:\KD_Coffee_Studio_v15.6.0_UIUX_DEV_20260814。

## VERDICT

DISPLAY COPY ONLY 實作與本 Phase 驗證已完成，等待 Owner diff review／驗收。沒有修改會員制度、回饋計算、資格判斷、KD 點／抵用金換算、ledger、internal business identifiers、訂單、履約或歷史資料。

**不可宣稱所有既有 regression 全綠。** `test:phase-i4b3e1` 有一項已直接證實存在於乾淨 HEAD 的 payout assertion failure；本 Phase 未修改其 production authority 或測試。其他下列已執行 suites 通過。嚴格要求「所有 Regression PASS」的 Definition of Done 尚有此 baseline 例外，須 Owner 確認，不能在此 DISPLAY COPY Phase 擅自修正回饋制度。

最後狀態：UNSTAGED / UNCOMMITTED / NOT PUSHED / NOT DEPLOYED。

## A. Modified files

本 Phase 修改 23 個既有檔案。以下清單不把原本 Owner／runtime dirty files 算成本 Phase 修改。

### Admin 入口：1

- app/admin/page.tsx：只新增「會員中心顯示文字與說明」入口。

### Member 顯示邊界：19

- app/member/page.tsx
- app/member/reset-password/page.tsx
- components/member/EmailAuthForms.tsx
- components/member/KdShareDialog.tsx
- components/member/MemberAvatarForm.tsx
- components/member/MemberMobileDisclosure.tsx
- components/member/MemberProfileForm.tsx
- components/member/MemberQualificationProgress.tsx
- components/member/MemberQualificationSummary.tsx
- components/member/MemberReferralCenter.tsx
- components/member/MemberReferralOrgChart.tsx
- components/member/MemberSectionNav.tsx
- components/member/MemberSubscriptionExperience.tsx
- components/member/PhoneAuthForms.tsx
- components/member/ResetPasswordForm.tsx
- components/member/RetailPromotionCenter.tsx
- components/member/RewardLedgerCompactCard.tsx
- components/member/RewardSourceOrderSummaryCard.tsx
- components/member/RewardWaitingDisclosure.tsx

只加入文字／accessible attributes 的 resolution wrappers，保留原 JSX element、props、事件、表單值、分支與計算。預設情況不新增 DOM wrapper；編輯後含換行的文字以安全 plain-text span 支援換行。

`MemberSubscriptionExperience.tsx` 為 MIXED Owner dirty file：不是以 HEAD 版本覆蓋；19 檔 AST 基準取自本 Phase 開始時的實際 working tree，移除新 copy wrappers 後全部一致，包含既有 Owner subscription 工作。

### 既有 source assertion 測試適配：3

- scripts/test-phase-j5d7b-member-center-ia.mts
- scripts/test-phase-member-referral-rewards-ia.mts
- scripts/test-phase-member-center-home-activity.mts

使用 `defaultMemberCopySource` 還原預設文案 render boundaries 後執行原有 assertions；另外獨立 AST digest／SSR tests 防止 adapter 掩蓋邏輯或 DOM 改變。Home／Activity 舊測試的 hash listener 名稱、`/member#...` 路徑、pending summary source assertions 更新為目前 HEAD 已有的 route-sync／canonical summary 實作；沒有為此改 production navigation／reward calculations。

## B. Added files

本 Phase 新增 18 個檔案（含本報告）：

1. app/admin/member-center/copy/page.tsx
2. app/api/admin/member-center-copy/route.ts
3. app/api/member/display-copy/route.ts
4. app/member/layout.tsx
5. components/admin/MemberCenterCopyManager.tsx
6. components/admin/MemberCenterCopyManager.module.css
7. components/member/MemberCenterCopyProvider.tsx
8. lib/memberCenterCopyCatalog.ts
9. lib/memberCenterCopy.ts
10. lib/memberCenterCopyStore.ts
11. scripts/audit-member-center-copy.mjs
12. scripts/member-copy-render-boundary-digest.mjs
13. scripts/member-copy-test-bootstrap.mjs
14. scripts/fixtures/member-copy-render-boundary-baseline.json
15. scripts/test-member-center-copy.mts
16. scripts/serve-member-copy-qa.mts
17. docs/MEMBER_CENTER_COPY_AUDIT.md
18. docs/MEMBER_CENTER_COPY_FINAL_REPORT.md

未新增 dependency，未修改 package.json 的既有 Owner changes。

## C. Copy audit / keys created

完整來源、行號、分類、預設／template 與 tokens 見 `docs/MEMBER_CENTER_COPY_AUDIT.md`；完整 805 keys／metadata 見 `lib/memberCenterCopyCatalog.ts`。

盤點 26 個 route／component／presentation helper 來源，共 1049 occurrences：STATIC 916、DYNAMIC 67、BUSINESS GENERATED 50、NOT SAFE TO EDIT 16。相同預設文字共用 definition，共 805 centralized definitions；不是 805 個 business identifiers。

主要具名 copy keys：

| Copy key | 原預設文字 |
| --- | --- |
| member.rewards.storeCredit.title | 抵用金 |
| member.rewards.kdPoints.title | KD點 |
| member.rewards.kdPoints.spacedTitle | KD 點 |
| member.referral.generation1.title | 第 1 代推薦回饋 |
| member.referral.generation2.title | 第 2 代推薦回饋 |
| member.referral.generation3.title | 第 3 代推薦回饋 |
| member.selfPurchase.title | 自己的消費 |
| member.pendingReward.title | 待入帳回饋 |
| member.retailPromotion.title | 推廣零售回饋 |
| member.rewards.title | 我的回饋 |
| member.subscription.title | 我的定期配送 |
| member.orders.fulfillment.orderCreated.label | 訂單成立 |
| member.orders.fulfillment.shipped.label | 已交寄 |
| member.orders.fulfillment.arrived.label | 已到店 |
| member.orders.fulfillment.ready.label | 可以取貨 |
| member.orders.fulfillment.suspectedUncollected.label | 疑似逾期未取 |
| member.orders.fulfillment.uncollected.label | 未取貨 |
| member.orders.fulfillment.review.label | 需要人工確認 |

其他 keys 採 `member.<group>.<category>.<default-text digest>`，只屬 copy namespace。未 rename enum、ledger type、program key 或 referral／reward identifier。Imported fulfillment captions 只在 member 最後呈現時套用文案；原 `lib/fulfillmentTypes.ts` map 未改。

## D. Dynamic tokens supported

目前實際 catalog 使用 17 種 token 名稱：

`creditAmount`, `date`, `generation`, `memberName`, `percentage`, `pointName`, `pointName2`, `remainingPoints`, `requiredPoints`, `requiredPoints6`, `value1`, `value2`, `value3`, `value4`, `value5`, `windowDays`, `windowDays4`。

這不是每個欄位皆可使用的 global whitelist。每個 definition 有自己精確 whitelist／中文用途，Admin 顯示該欄位允許 tokens；數字後綴區分同一句內不同原始值，value tokens 保留盤點中原畫面既有格式化資料。未為尚不存在的資料自行新增 token。

Tokens 使用原 UI 已格式化的值；resolver 不重算金額、資格、比例、日期、視窗或身份。所有該欄位原 tokens 必須保留，不能以固定數字替代。資料不回寫至 domain、表單值或比較條件。

## E. Admin UI location / persistence

入口：Admin 營運中心 → 會員中心顯示文字與說明。

URL：`/admin/member-center/copy`。

15 分組：會員首頁、KD 點、抵用金、導覽、推薦回饋／組織圖與分享、自購回饋、零售／待入帳回饋、資格／等待、定期配送、訂單相關說明、提示文字、空狀態、按鈕、帳戶資料、會員登入與密碼。

支援搜尋、用途、預設文字、目前編輯值、允許 token／中文用途、預覽、恢復預設與儲存狀態。只有 Owner 可讀寫管理 API；PUT 沿用 same-origin 驗證。非 Owner／未登入拒絕；無 percentages、threshold、conversion、release-days 或其他 Business Rules controls。

獨立 JSON namespace：本機 `data/member-center/display-copy.json`；Railway／KD_DATA_DIR 沿用既有 persistent data root 的 `member-center/display-copy.json`。沒有 database／CMS SaaS，沒有碰其他 persisted stores。

讀取不存在／壞檔時只回傳 defaults，不初始化、不修復寫入。只有經 Owner 驗證的 save 才以既有 file-lock／atomic JSON writer 寫入 copy file，使用 revision 防止覆寫競爭；stale revision 回 409。

會員初始 server render 載入 overrides；no-store API、同源 BroadcastChannel、回到視窗／可見與路由切換 refresh 取得更新，失敗保留目前安全文案。無 reload、無任意長延遲、無背景輪詢。

## F. Fallback / safety

Admin valid override → centralized default → caller safe fallback。

- 缺檔／corrupt JSON／舊欄位／未知 key／空白或無效 override：忽略無效設定，使用 default。
- 缺必要 token data：回 safe fallback，不顯示 `undefined`、`null` 或 internal key。
- 僅 plain text；拒絕 HTML、script brackets、控制字元、任意 JS expression、未知 tokens、移除 required tokens、超過 4000 字元。
- React 正常 escape 資料，無 eval、無 dangerouslySetInnerHTML。
- API input 驗證與頁面即時提示皆有；錯誤文案不使 Member Center crash。
- 公開 member display-copy API 只回傳 copy version／revision／overrides，不包含會員／ledger／authentication 資料。

## G. Copy tests / display verification

Focused copy command：

```text
node --experimental-strip-types --import ./scripts/member-auth-test-bootstrap.mjs --import ./scripts/member-copy-test-bootstrap.mjs scripts/test-member-center-copy.mts
```

**PASS：863 checks**，包括 805 catalog defaults、CASE A label rename、CASE B dynamic token、CASE C missing fallback、invalid tokens／HTML／length、corrupt store、no read initialization、revision conflict、concurrent one-winner save、canonical DTO comparison、SSR／DOM／native props 與 19 個 pre-phase AST digests。

實際 RewardLedgerCompactCard SSR：`第 1 代推薦回饋` → `好友分享回饋`，NT$18、17.5 KD點、5%、待符合資格、原訂單編號與 DOM structure 不變。Fixture credit 300／qualification false／ledger records 不變。真正 canonical dashboard／referral DTOs 在相同 frozen time 下，copy save 前後 deep-equal。

隔離 production QA service／HTTP integration PASS：未登入與非 Owner 401、Owner GET 200、cross-origin 403、invalid HTML 400、save／public read 200、stale revision 409、restore defaults 200、isolated commerce-state bytes unchanged。

使用 computer-use skill 進行實際瀏覽器顯示驗證，全部在獨立 temporary storage、測試會員／測試 credentials／本機測試服務執行，沒有向真實 Owner data 儲存文案。

- Desktop 1440px PASS；Mobile 375px／320px PASS，無水平 overflow。
- Admin 儲存「可用折抵額」→「我的咖啡折抵額」後 member 顯示更新，餘額仍 300 元。
- `{user.balance * 10}` 被拒絕，儲存 disabled。
- 既有 `尚差 {remainingPoints}` 文案改為 `再累積 {remainingPoints}，即可達成本期資格。`；member 顯示 `再累積 NT$1,500，即可達成本期資格。`，原門檻 1500／progress 0 不變。
- Navigation／reward dialog／close 後互動可用；原 MemberMobileDisclosure hydration 與 deep-link sequencing 不重構。
- 最後 Admin 增加細部分組後，TypeScript／ESLint／SSR／standard production build 通過；已完成的瀏覽器截圖為原分組版本，未宣稱其顯示最後的 15 分組。

截圖在 workspace 外的既有 visualization directory：member-copy-desktop.png、member-copy-mobile-375.png、member-copy-mobile.png（320px）、member-copy-admin.png、member-copy-qualification-mobile.png（320px）。

隔離 QA 服務已停止；3 個確認含本 Phase 測試會員 marker 的 temporary QA directories 已刪除，只有可重新生成的 test fixtures，未刪除主專案／Owner 檔案。

## H. TypeScript result

`npx tsc --noEmit`：PASS，最後收尾再次執行 exit 0。

Focused ESLint：PASS，最後再次涵蓋 23 個修改檔案及所有新增 TS／TSX／script source，無 errors／warnings。

`git diff --check`：PASS。既有 LF／CRLF 提醒不是 whitespace error；未 normalize Owner 檔案。

## I. Build result

`npm run build`：PASS，最後一次為正常 production configuration，不是隔離 QA 的臨時 site URL override。Build ID：`wWeYuk4XFeApWhCTHq2rT`。

既有 NFT tracing warning 指向 next.config.ts／lib/persistentStorageInit.ts／instrumentation.ts，這些檔案未改；不影響 build exit 0。Node test runner 的 typeless-package warning 也未藉此改 package.json。

## J. Existing regression result

以下為此 Phase 已完成的驗證結果；恢復後保留結果，不無故重做已完成項目。

| Suite | 結果 |
| --- | --- |
| test:membership-commerce | PASS 41 |
| test:membership-experience | PASS 36 |
| test:order-checkout-regression | PASS |
| test:phase-i4b3d0 qualification authority | PASS 30 |
| test:phase-i4b3d1 authority coverage | PASS 41 |
| test:phase-i4b3e0 maturation | PASS 39 |
| test:phase-i4b3e2 payout notification | PASS 14 |
| test:phase-i4a2 credit | PASS 11 |
| test:phase-j5d7 retail promotion | PASS 51 |
| test:phase-j5d7b member-center IA | PASS 33 |
| test-phase-reward-ledger-compact-ux.ts | PASS 70 |
| test-phase-reward-source-order-consistency.ts | PASS 64 |
| test-phase-reward-safety-waiting-status-ux.mts | PASS 83 |
| test-phase-j5d6b2-reward-status-display.mts | PASS 12 |
| test-phase-member-dashboard-reward-deep-link.mts | PASS 39 |
| test-phase-member-referral-rewards-ia.mts | PASS 67 |
| test-phase-member-login-switch-hydration.mts | PASS 34 |
| test-phase-member-center-home-activity.mts | PASS 24 |
| test-phase-reward-source-safety-release-gate.mts | PASS 17 |
| test-phase-reward-release-notification-isolation.mts | PASS 13 |
| test:phase-i4b3e1 | FAIL：已證實乾淨 HEAD 亦失敗 |

### Baseline exception — direct evidence

Suite：`scripts/test-phase-i4b3e1-referral-payout.ts`。

Assertion：`missing Maturation record blocks payout`，line 97，expected `true`／actual `false`；前 6 checks 通過。

相同測試在 exact clean HEAD `9aa18cceea15a42cc9a2109fbc41a89bcc332ea9` 的 temporary git archive 執行，得到相同前 6 PASS／同一 assertion／同一 expected-actual。基準 source／suite 直接來自 commit，不使用本 Phase 修改版本；只以 junction 使用現有 dependencies，未拷貝 modified sources。Temporary archive／dependency junction 已安全移除，主專案 node_modules 保留。

分類：PRE-EXISTING BASELINE FAILURE，不是依較新 suite 通過而推測。`membershipCommerce.ts` 與 payout suite 本 Phase diff 為空；沒有自動修測試／maturation／release authority。

## K. Protected files / final diff safety review

已完成 phase 前後 SHA-256 比較：`data/**`、`public/data/**`、`public/uploads/**` 共 174 個檔案，無新增／刪除／內容改變。加上 `app/globals.css`、`package.json`，共 176 檔 byte-identical。

包括：

- data/fulfillment/state.json
- data/member-identity/registry.json
- data/membership-commerce/commerce-state.json
- data/membership-commerce/business-rules.json
- public/data/assets.json
- public/data/homepage.json
- public/data/pages.json
- public/data/website-data.json
- 所有已存在的 uploads／member avatars／訂單／會員歷史資料。

這是對 phase 起點 working tree 的比較，不是把 legitimate Owner dirty files 回復成 HEAD。原本 dirty 的 runtime／CMS JSON、globals.css、package.json、Owner test／manifest／README／backup／qa-output 全部保留。

MIXED subscription component 唯一 intentional bytes change 為 copy wrappers；其 phase 前既有 executable AST（含 Owner changes）相同。

最終 source diff：

- `lib/membershipCommerce.ts`：無 diff。
- membership rules／policies／reward calculator／ledger authority／referral attribution／auth／orders API／checkout／fulfillment／cancel／stock restore：沒有本 Phase implementation change。
- `lib/fulfillmentTypes.ts`：無 diff；只解析 final rendered caption。
- 19 member source 的條件／事件／表單值／calculation／canonical links／hydration implementation 保留，AST proof PASS。
- 新 store 唯一 write target 為獨立 copy JSON；無讀取時 migration／初始化其他 data。
- 沒有 reward／member record migration，沒有重新命名 business keys，沒有改 percentage／threshold／conversion／timeline。
- 沒有 Member Center redesign；新 styles 只屬新增 Admin editor。
- 主專案 `data/member-center/display-copy.json` 目前不存在：測試沒有留下真實設定／初始化 production copy store。

## L. Git status / handoff

Branch：`j5d7b-reward-cron-notification-isolation`。

HEAD：`9aa18cceea15a42cc9a2109fbc41a89bcc332ea9`，與 phase baseline 相同。

Index：empty；本 Phase 沒有執行 git add／commit／push／deploy。

工作樹包含本 Phase 23 modified／18 added files，以及原本 Owner dirty／untracked material。`git diff --stat` 的 32 個 tracked dirty files 包含原本 runtime／Owner 工作，不能當成純本 Phase diff，也不能 wholesale stage。

原本非本 Phase tracked dirty files 保留：app/globals.css、data/fulfillment/state.json、data/membership-commerce/business-rules.json、package.json、public/data/assets.json、public/data/homepage.json、public/data/pages.json、public/data/website-data.json、scripts/test-phase-j3a-member-referral-invite.mjs。MemberSubscriptionExperience.tsx 含兩者來源，日後如獲准 staging 必須分離 hunks。

原本 untracked PATCH_MANIFEST*／README*／runtime backup／uploads／member avatars／qa-output／scripts/test-phase-j5c2a-order-status-refresh-sync.mjs 不屬本 Phase，不得順手 stage。

### Owner QA steps

1. Owner 登入 Admin，進入 `/admin/member-center/copy`，選分組／搜尋主要 label，修改並儲存。
2. 回到 Member Center，確認文案更新；原餘額、資格、reward 數字與歷史紀錄相同。
3. 編輯 dynamic template，保留所有該欄位 tokens；確認數值仍來自原系統。試未知 expression 應拒絕。
4. 「恢復預設」後儲存，確認 default；375／320px 檢查文字長度與換行。
5. Review 23／18 phase 檔案與 mixed subscription hunks，確認 baseline payout failure 的接受／另案處理方式。

等待 Owner review。UNCOMMITTED / NOT PUSHED / NOT DEPLOYED；沒有暫存任何檔案。

### Final git status --short

```text
 M app/admin/page.tsx
 M app/globals.css
 M app/member/page.tsx
 M app/member/reset-password/page.tsx
 M components/member/EmailAuthForms.tsx
 M components/member/KdShareDialog.tsx
 M components/member/MemberAvatarForm.tsx
 M components/member/MemberMobileDisclosure.tsx
 M components/member/MemberProfileForm.tsx
 M components/member/MemberQualificationProgress.tsx
 M components/member/MemberQualificationSummary.tsx
 M components/member/MemberReferralCenter.tsx
 M components/member/MemberReferralOrgChart.tsx
 M components/member/MemberSectionNav.tsx
 M components/member/MemberSubscriptionExperience.tsx
 M components/member/PhoneAuthForms.tsx
 M components/member/ResetPasswordForm.tsx
 M components/member/RetailPromotionCenter.tsx
 M components/member/RewardLedgerCompactCard.tsx
 M components/member/RewardSourceOrderSummaryCard.tsx
 M components/member/RewardWaitingDisclosure.tsx
 M data/fulfillment/state.json
 M data/membership-commerce/business-rules.json
 M package.json
 M public/data/assets.json
 M public/data/homepage.json
 M public/data/pages.json
 M public/data/website-data.json
 M scripts/test-phase-j3a-member-referral-invite.mjs
 M scripts/test-phase-j5d7b-member-center-ia.mts
 M scripts/test-phase-member-center-home-activity.mts
 M scripts/test-phase-member-referral-rewards-ia.mts
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
?? README_J2B3.txt
?? README_J2B3A.txt
?? README_J5D5_H1.md
?? _runtime_corruption_backup_20260907-125649/
?? app/admin/member-center/
?? app/api/admin/member-center-copy/
?? app/api/member/display-copy/
?? app/member/layout.tsx
?? components/admin/MemberCenterCopyManager.module.css
?? components/admin/MemberCenterCopyManager.tsx
?? components/member/MemberCenterCopyProvider.tsx
?? docs/MEMBER_CENTER_COPY_AUDIT.md
?? docs/MEMBER_CENTER_COPY_FINAL_REPORT.md
?? lib/memberCenterCopy.ts
?? lib/memberCenterCopyCatalog.ts
?? lib/memberCenterCopyStore.ts
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
?? scripts/audit-member-center-copy.mjs
?? scripts/fixtures/
?? scripts/member-copy-render-boundary-digest.mjs
?? scripts/member-copy-test-bootstrap.mjs
?? scripts/serve-member-copy-qa.mts
?? scripts/test-member-center-copy.mts
?? scripts/test-phase-j5c2a-order-status-refresh-sync.mjs
```
