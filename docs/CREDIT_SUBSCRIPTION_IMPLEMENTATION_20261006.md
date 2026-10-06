# 抵用金名稱、70% 上限與定期配送實作報告

2026-10-06。以目前工作區及既有未提交變更為基礎完成實作。未 stage、commit、push、deploy，未修改既有 runtime／production 資料。

## 實際支援

| 訂單 | 實際接線 | 選擇來源 |
| --- | --- | --- |
| 一般訂單 | 支援 | 本次結帳選擇，伺服器重新計算 |
| 定期配送首次訂單 | 支援 | 本次結帳選擇控制首單；另外保存後續每期設定 |
| 後續配送訂單 | 支援 | 關閉／每期最高／每期指定，使用本期期次鎖定的設定與政策 |
| 立即補貨 | 支援 | 同一每期設定與 scheduler；保留既有日期、建單時程及 anchor |

舊訂閱沒有 `creditPreference` 時視為關閉，不推定會員同意扣款。設定持續至修改或關閉；已鎖定期次保留原設定，未鎖定期次於鎖定時取最新設定。

依 Owner 回覆：指定 NT$300、當期上限 NT$700、餘額 NT$120，使用剩餘 NT$120。最高模式也在當期上限內使用全部可用餘額；餘額低於上限時扣到 0，高於上限時保留超出部分。

## 上限與呼叫關係

新增獨立 `credit.maximumOrderPercent` 及 `credit.maximumOrderPercentEnabled`。全新設定預設啟用、70%；歷史規則缺少啟用欄位時保持停用，比例顯示值缺值才使用 70%，不改寫舊設定檔。只有明確啟用才強制比例上限；後台可設定 0–100 的整數百分比，與既有 `credit.redemption` 共存。這是本機驗收階段補正後的最終行為。

比例基礎為優惠後商品金額，排除運費及 COD 手續費，向下取整，再與既有固定上限、最低應付、運費適用範圍、零元限制及可用餘額取較小值。商品 NT$1,000、運費 NT$100、COD NT$50：70% 上限為 NT$700，應付 NT$450。既有最低應付計算基礎保留，不加入 COD 費。

以下檔案均位於 `F:/KD_Coffee_Studio_v15.6.0_UIUX_DEV_20260814/`，行號為本報告完成時位置。

| 檔案／行號／函式 | 接線證據 |
| --- | --- |
| `lib/membershipPolicies.ts:137` `maximumCreditRedemption` | 共用上限、向下取整、既有政策與零元限制 |
| `lib/membershipBusinessRules.ts:156,303,633` | 全新設定預設啟用 70、舊規則缺開關維持停用、讀取相容與驗證 |
| `components/admin/MembershipRulesManager.tsx:852` | 後台 06 啟用開關與獨立百分比欄位；`lib/adminRuleHelp.ts:244` 提供政策說明 |
| `lib/orderCredit.ts:15` `applyOrderCredit` | 訂單鎖、會員與庫存完成檢查、保留及訂單折抵快照 |
| `app/api/orders/route.ts:48` `applyCheckoutCredit` | 一般／首次結帳 → 共用 `applyOrderCredit` |
| `app/api/orders/route.ts:54` `ensureCheckoutSubscription` | 新建與重播從原訂單 intent 保存後續設定；未改原單定價或週期 anchor |
| `lib/membershipCommerce.ts:1239` `lockSubscriptionCycle` | 凍結每期設定、既有價格／商品／配送／政策快照；此時不保留額度 |
| `lib/subscriptionOrderScheduler.ts:176` | 庫存完成 → `applyOrderCredit` → 訂單鎖內讀取最新狀態 → `createOrderFromCycle` |
| `app/api/member/subscription/route.ts:148` | `change-credit` 驗證所有權、revision、idempotency，更新後續使用方式 |

`reserveCredit` 在帳本鎖內重新限制上限與餘額，保持既有到期日、發放日、entry ID 順序。前端超額請求與不同訂單併發無法透支。

## 欄位 → 使用位置 → 是否共用名稱

唯一名稱 key 是 `member.rewards.storeCredit.title`。後台清楚標示「抵用金統一顯示名稱（供會員、結帳、訂單及相關提示使用）」。保持原儲存值；目前此 key 沒有 override，使用缺值預設「抵用金」。未移入「KD弊」，未增加定期配送專用名稱。

| Schema key／群組 | 預設模板／用途 | 使用位置 | 是否共用名稱 |
| --- | --- | --- | --- |
| `member.rewards.storeCredit.title` | 抵用金 | 回饋區、每期設定標籤、定期配送折抵、訂單摘要、後台 06 標題 | 直接共用 |
| `member.dashboard.label.3dd941956d` | 可用`{creditName}` | 會員首頁餘額 | 預設是；現有 KD弊 override 保留獨立 |
| `member.dashboard.label.693d81614f` | 筆・預估`{creditName}` NT$ | 首頁預估回饋 | 引用 token 時同步 |
| `member.referral.label.5b29dc001e`、`.tooltip.be6e512f4b`、`.reward.0f78857ceb` | 可用額度、已入帳總覽、帳本提示 | 回饋中心 | 引用 token 時同步 |
| `member.subscription.label.a519a98b2f` | 我的`{creditName}` | 我的抵用金區塊標題；這就是原「定期配送」區內抵用金欄位的用途 | 引用 token 時同步；不是第二個名稱設定 |
| `member.subscription.emptyState.193dab97b4`、`.description.4b6e30e9c5` | 空帳本說明 | 我的抵用金空狀態 | 引用 token 時同步 |
| `member.subscription.description.e63e884dab`、`credit.subscription.lockedHint` | 未鎖定／已鎖定尚未建單提示 | 我的定期配送 | 引用 token 時同步 |
| `member.rewards.label.de7f9bd9d5`、`.label.ccf442cc5e`、`.description.a2e8013bd2` | 預估額度／價值／點數兌換 | 回饋帳本、來源訂單、推廣零售 | 引用 token 時同步；保留既有點數及金額 token |
| `credit.subscription.*` | 三模式、固定金額、持續設定、儲存／成功提示 | 結帳加入定期配送、我的定期配送設定 | 提及名稱者使用共用 token；其餘句子保持可編輯 |
| `credit.checkout.*` | 本次金額、最高金額、可用／上限／自動提示 | 一般與首次結帳 | 引用 token 時同步 |
| `credit.order.*`、`member.subscription.button.b40d17356f` | 取消提示、返還金額／狀態 | 訂單與折抵紀錄 | 引用 token 時同步 |
| `credit.help.*` | 單一說明視窗、政策、運費、最低應付、零元、到期順序、每期模式 | 會員頁、結帳頁各一個共用 dialog | 名稱使用 token；政策數值讀目前有效 API |
| `credit.source.default`、`.adjustment` | 會員`{creditName}`、`{creditName}`調整 | 明確系統衍生來源 | 是；已儲存任意自訂 sourceLabel 保留原文 |
| `credit.notice.*` | 入帳／到期、金額與訂單折抵摘要 | 後續生成通知模板、一般／首單訂單通知文字 | 是，生成時讀同一來源 |
| `credit.system.*` | 使用、餘額／帳本驗證、保留提示 | 相關 API 回應 | 新提示直接指定 key；舊固定 domain 訊息經明確 allowlist 對應 key |
| `member.dashboard.label.622f3c5acb` | 元；已存 override 為枚 | 首頁餘額單位 | 不涉及名稱，保留枚 |

名稱來源與 resolver：`lib/memberCenterCopy.ts:10,41`；原 key 定義：`lib/memberCenterCopyCatalog.ts:5150`；新增模板：`lib/creditCopyCatalog.ts`。相關 JSX 使用明確 copyKey，不依完整預設句型尋找 key。

結帳與訂單新增 layout Provider，沿用同一設定讀取及 focus／visibility／BroadcastChannel 更新方式；伺服器以 `lib/creditDisplayCopy.ts:6` 的 `readCreditDisplayCopy` 讀取同一來源。通知使用 `lib/memberNotificationAutomation.ts:24` 的 `createMembershipNotificationTemplate`。

## 舊文案與 placeholder 相容

先處理 validator／resolver 相容，再加入新 token。缺少 `{creditName}` 的歷史 override 不會丟棄或退回預設；原必填的點數、比例、金額等 token 仍需保留。Resolver 只要求實際選中文案包含的 token，舊句沒有名稱 token 時照原文輸出。

本工作區實際已儲存欄位如下，兩筆均原樣保留：

| Key | 原文 | 結果 |
| --- | --- | --- |
| `member.dashboard.label.3dd941956d` | KD弊 | 繼續獨立顯示；後台提示「此文案尚未引用統一名稱」 |
| `member.dashboard.label.622f3c5acb` | 枚 | 單位保持原值，沒有自動搬移或更正 |

後台列出 token 用途、目前文案預覽、歷史原文與採用預設 `{creditName}` 模板後的預覽。Owner 自行編輯並儲存才更新；不猜測任意自訂詞，不自動替換或搬移。不能宣稱所有歷史文案已自動統一。

隔離測試名稱「測試咖啡金」的預覽例：

- `我的{creditName}` → 我的測試咖啡金。
- `每期自動使用指定{creditName}金額` → 每期自動使用指定測試咖啡金金額。
- `credit.help.policy` 的 `{creditName}`＋`{percent}`：共用名稱與現行 70 可同時注入。
- `credit.notice.amount` 的 `{creditName}`＋`{amount}` → 會員測試咖啡金 NT$ 120 已成功入帳。
- `credit.notice.order` 的名稱、金額與總額 → 會員測試咖啡金：-NT$ 700；折抵後應付：NT$ 450。

歷史 ledger、已發送通知與既有訂單未批次改寫。系統衍生預設／調整來源只在呈現層使用 `sourceCopyKey`；已儲存任意 `sourceLabel` 原文保留，即使含「抵用金」。技術欄位、事件類型、帳本金額、帳本 reason 不隨名稱改動；名稱不影響 70% 或其他商務計算。

## 帳本與重播

- 庫存交易成功後才保留。建單失敗或庫存尚未完成時不新增保留。
- 訂單使用穩定 `order-credit:<orderNumber>` key；訂單鎖及帳本鎖阻止重複扣款與透支。
- ledger 已保留而訂單快照尚未寫入，可接回同一 reservation。確認快照寫入失敗才釋放；IO 回報失敗但已提交時保留；無法確認持久狀態時不盲目釋放，留待重播。
- 失敗已釋放的嘗試可重新保留。安全查詢／結算優先取目前 reserved、再 consumed、再 released，避免拿到舊嘗試。
- scheduler 在與取消共用的訂單鎖內讀取與連結期次。中斷後遇到已取消／完成訂單，接回終態，不重新扣庫存、扣額度或重複累計取貨。
- 成功取貨 consume，取消／未取貨依原流程 release；補上 Admin 直接 completed 的 consume，重播只結算一次。
- 返還遵守原到期日，已到期額度不延長。原取消限制、物流安全、庫存回補與首單啟用流程保留。

## 實際修改檔案

新增：

- `lib/creditCopyCatalog.ts`、`creditDisplayCopy.ts`、`subscriptionCreditPreference.ts`、`orderCredit.ts`
- `app/checkout/layout.tsx`、`app/orders/layout.tsx`
- `components/member/CreditPreferenceFields.tsx`、`SubscriptionCreditEditor.tsx`、`CreditHelpDialog.tsx`
- `scripts/credit-integration-test-bootstrap.mjs`、`scripts/test-credit-subscription-integration.mts`、本報告

修改既有檔：

- 規則／帳本：`lib/membershipRuleTypes.ts`、`membershipBusinessRules.ts`、`membershipPolicies.ts`、`membershipCommerce.ts`、`subscriptionOrderScheduler.ts`、`adminRuleHelp.ts`
- 文案／通知：`lib/memberCenterCopy.ts`、`memberCenterCopyCatalog.ts`、`memberNotificationAutomation.ts`
- API：`app/api/orders/route.ts`、`app/api/member/subscription/route.ts`、`app/api/member/credit/quote/route.ts`、`app/api/member/orders/[orderNumber]/cancel/route.ts`、`app/api/admin/orders/[orderNumber]/route.ts`
- 頁面：`app/checkout/page.tsx`、`app/member/page.tsx`、`app/admin/membership/page.tsx`、`app/globals.css`
- 元件：`components/admin/MemberCenterCopyManager.tsx`、`MembershipRulesManager.tsx`；`components/member/MemberCenterCopyProvider.tsx`、`MemberReferralCenter.tsx`、`MemberSubscriptionExperience.tsx`、`RetailPromotionCenter.tsx`、`RewardLedgerCompactCard.tsx`、`RewardSourceOrderSummaryCard.tsx`；`components/orders/OrderConversation.tsx`
- 回歸：`scripts/test-member-center-copy.mts`、`test-membership-commerce.ts`、`test-phase-i3a-operational-completion.ts`、`test-phase2b-home-delivery.ts`、`fixtures/member-copy-render-boundary-baseline.json`

既有測試調整與 70% 相衝突的期望值；零元案例明確設 100%，單獨驗證原零元規則。呈現 baseline 僅更新本功能實際變動的六個會員檔案，其餘保留；測試標示改為 presentation regression baseline。

## 自動驗證

| 驗證 | 結果 |
| --- | --- |
| Next route typegen；TypeScript noEmit | 通過 |
| 新增隔離整合測試 | 127 checks 通過（驗收修正後重跑） |
| member-center copy | 939 checks 通過（驗收修正後重跑） |
| membership-commerce | 41 通過 |
| subscription inventory | 17 通過 |
| member cancellation | 36 通過 |
| first-order activation | 25 通過 |
| operational completion | 34 通過 |
| home delivery | 44 通過 |
| cancel credit release | 18 通過 |
| subscription roast | 24 通過 |
| order checkout regression | 通過 |
| 修改範圍 ESLint | 0 新增錯誤；既有 img／unused item 警告保留 |
| 程式／測試 git diff --check | 通過 |

廣域 ESLint 包含原有 `scripts/test-phase2b-home-delivery.ts:68` 時會遇到既有 no-explicit-any 錯誤，該行未改。本輪其餘修改範圍與所有新檔 lint 通過，沒有順便修理這個既有問題。

```powershell
node --experimental-strip-types --import ./scripts/credit-integration-test-bootstrap.mjs scripts/test-credit-subscription-integration.mts
```

新增測試使用 mkdtemp 隔離資料、真實會員／規則／帳本／訂單／庫存，只 stub Next request-local／呈現邊界，禁止外部通知網路。涵蓋名稱＋金額／比例、舊 override、明確 key、API 提示、三模式、首單／後續／補貨、低餘額、快照、重播、實際 rename 失敗、提交後 IO 失敗、併發、取消返還與任意歷史 sourceLabel 保留。結束清除自己的暫存資料。

上一輪在 `acceptance-results.json`（2026-10-06 14:41:40，台北時間）記錄：`data`、`public/data`、`public/uploads` 共 188 檔，SHA-256 比對修改 0、新增 0、刪除 0。但原始逐檔基準只保留於當時工作階段，沒有落盤；本次收尾無法獨立重驗這份完整比對。不得把現在的雜湊當成實作前基準。既有未提交資料、資產、launcher 及其他測試變更未回退；詳細證據範圍見下方。

## 原實作階段人工驗收清單（結果見下方本機驗收報告）

應在隔離測試環境操作，避免修改本工作區 runtime／production 資料。原實作階段尚未進行瀏覽器人工驗收；本機驗收已在下方補上實際結果。沒有實際通知發送。

1. `/admin/member-center/copy`：核對統一名稱欄位用途、placeholder／預覽。改測試名稱後，首頁 KD弊 維持原文並提示未引用，枚保留；手動改該句為 `可用{creditName}` 並儲存後才同步。
2. `/admin/membership` 的 06 區：核對獨立 70%、0–100 驗證及原政策共存；調整隔離環境政策後重新開啟說明，核對動態限制。
3. `/checkout`：一般及首單測試超額、最高、低餘額，核對伺服器折抵、運費／COD 排除與應付。加入定期配送時核對本次選擇及後續三模式分開保存。
4. `/member`：首頁、回饋、抵用紀錄、我的定期配送核對名稱、歷史 override、狀態與單一說明；每期指定 NT$300、餘額 NT$120 應使用 NT$120。
5. 隔離 scheduler／原立即補貨流程：核對 reservation、折抵快照、重播不重扣；修改設定不影響已鎖定期次，週期 anchor 不變。
6. `/orders/<orderNumber>`：核對折抵及取消提示；測試可取消單的返還與庫存一次性回補，完成取貨確認 consumed 與重播一致。
7. 隔離環境生成入帳／到期及訂單通知模板，核對名稱與金額；已發送文字與任意歷史來源原文保持不變。

原實作與自動驗證工作保留；下方記錄接續的本機驗收與修正。未部署，未遷移資料。

## 本機驗收與最終收尾完整報告（2026-10-06）

本次完成核對與報告；沒有重新實作或追加正式程式修正。最後成功 production build 使用的 384 個程式／設定檔，與目前工作區 SHA-256 逐檔一致；另外 7 個 bootstrap／入口檔亦一致，因此不重跑 build 或已完成的瀏覽器驗收。僅補跑缺少完整結束紀錄的 TypeScript noEmit，結果退出碼 0。

所有本報告的相對路徑均以 `F:/KD_Coffee_Studio_v15.6.0_UIUX_DEV_20260814/` 為根。驗收證據目錄為 `isolated-tests/credit-acceptance-20261006/`（下稱證據目錄）。

### 功能與修改範圍

1. **70% 獨立上限**：`credit.maximumOrderPercentEnabled` 控制啟用／停用，`credit.maximumOrderPercent` 可修改為 0–100 整數。全新設定預設啟用 70%；舊規則缺開關時保持停用，比例缺值顯示待設定 70%，讀取不改寫資料。共用伺服器計算 `maximumCreditRedemption` 以優惠後商品金額乘比例、向下取整，再取既有固定上限、最低應付、運費範圍、零元限制及餘額的較小值。比例基礎排除运費與 COD，原最低應付計算仍排除 COD。
2. **每期三模式**：不使用／每期自動最高／每期自動指定。最高模式在當期政策上限內使用餘額；指定模式取指定值、當期上限與餘額較小值，指定 300、餘額 120 即使用 120。設定持續至修改或關閉；舊訂閱缺設定視為關閉。一般結帳選擇、首單本次折抵與後續每期設定各依實際用途保存。
3. **單一說明視窗**：我的定期配送整個區塊只有一個使用說明按鈕，不展開長篇說明；支援關閉、捲動、Esc、焦點返回，按鈕不切換選項、不送出表單。目前政策與已鎖定期次政策分開，未鎖定預估使用伺服器報價。手機欄位與 grid 已限制寬度。
4. **統一名稱與可編輯文案**：唯一來源沿用 `member.rewards.storeCredit.title`，缺值才使用「抵用金」。會員、結帳、訂單、API 與未來通知使用共用讀取及明確 copyKey。`{creditName}` 可與 `{percent}`、`{amount}` 等 token 並用。三模式、按鈕、Modal 及相關會員模板仍可於 `/admin/member-center/copy` 編輯。名稱不改變技術欄位或商務計算。
5. **歷史相容**：沒有 `{creditName}` 的已存 override 原样保留；不全域替換、不猜測自訂詞。`member.dashboard.label.3dd941956d` 的「KD弊」保持獨立名稱，`member.dashboard.label.622f3c5acb` 的「枚」保持單位。後台提示未引用統一名稱並提供原文與模板預覽，Owner 編輯儲存後才更新。歷史 ledger、訂單及已發送通知不批次改寫；任意自訂 sourceLabel 保留原文。
6. **共用帳本接線**：一般／首單 `applyCheckoutCredit → applyOrderCredit → reserveCredit`；後續／立即補貨 `lockSubscriptionCycle → scheduler → applyOrderCredit → createOrderFromCycle`。已鎖定期次保留原設定／政策，建單前不提前保留額度。帳本依到期日、發放日、entry ID 排序，訂單與帳本鎖、穩定 key 防止重扣／透支。取消 release、取貨 consume 依既有流程結算一次；失敗與提交後重播有隔離回歸。

功能檔案（同一列省略路徑的檔案沿用該列目錄）：

| 類別 | 實際檔案 |
| --- | --- |
| 新增共用層 | `lib/creditCopyCatalog.ts`、`lib/creditDisplayCopy.ts`、`lib/subscriptionCreditPreference.ts`、`lib/orderCredit.ts` |
| 新增 UI／Provider | `app/checkout/layout.tsx`、`app/orders/layout.tsx`；`components/member/CreditPreferenceFields.tsx`、`SubscriptionCreditEditor.tsx`、`CreditHelpDialog.tsx` |
| 政策／帳本／排程 | `lib/membershipRuleTypes.ts`、`membershipBusinessRules.ts`、`membershipPolicies.ts`、`membershipCommerce.ts`、`subscriptionOrderScheduler.ts`、`adminRuleHelp.ts` |
| 名稱／通知 | `lib/memberCenterCopy.ts`、`memberCenterCopyCatalog.ts`、`memberNotificationAutomation.ts` |
| API | `app/api/orders/route.ts`、`app/api/member/subscription/route.ts`、`app/api/member/credit/quote/route.ts`、`app/api/member/orders/[orderNumber]/cancel/route.ts`、`app/api/admin/orders/[orderNumber]/route.ts` |
| 頁面／樣式 | `app/admin/membership/page.tsx`、`app/member/page.tsx`、`app/checkout/page.tsx`、`app/globals.css` |
| 既有元件 | `components/admin/MemberCenterCopyManager.tsx`、`MembershipRulesManager.tsx`；`components/member/MemberCenterCopyProvider.tsx`、`MemberReferralCenter.tsx`、`MemberSubscriptionExperience.tsx`、`RetailPromotionCenter.tsx`、`RewardLedgerCompactCard.tsx`、`RewardSourceOrderSummaryCard.tsx`；`components/orders/OrderConversation.tsx` |
| 功能回歸 | 新增 `scripts/credit-integration-test-bootstrap.mjs`、`test-credit-subscription-integration.mts`；修改 `scripts/test-member-center-copy.mts`、`test-membership-commerce.ts`、`test-phase-i3a-operational-completion.ts`、`test-phase2b-home-delivery.ts`、`fixtures/member-copy-render-boundary-baseline.json` |
| 本機驗收工具 | 新增 `scripts/credit-local-acceptance.mts`、`credit-local-acceptance-runner.mjs`、`credit-local-network-guard.cjs`；只用於本機隔離環境，沒有加入正式啟動命令 |
| 本次收尾 | 更新本報告；證據目錄新增 `closeout-verify.mjs`、`closeout-verification.json`、`protected-current-closeout.json`、`final-typescript.log`、`git-status-closeout.txt`。未修改上述正式程式檔 |

前一輪本機驗收修正包括：比例啟停與舊規則相容、集中單一 Modal、目前／鎖定政策區分、伺服器預估、手機 select／input 不撐寬。這些修正均在最後 build 快照中；本次没有追加產品修正。

### 瀏覽器人工驗收（沿用已完成操作與現存證據，本次未重跑）

桌機 1280×900、手機 viewport 390×844；20 張 JPG 現存於證據目錄 `evidence/`。本次重新檢視既有手機長頁與桌機 Modal 截圖，沒有重新啟動服務。截圖證明畫面；保存、Esc、重播等互動結果依前一輪已完成操作紀錄與相關 log，不宣稱單張截圖能證明全部互動。

| 驗收項目 | 結果與證據檔 |
| --- | --- |
| `/admin/membership` | 開關停用／儲存／重載、改 65% 再保存、恢復 70% 均完成。舊規則缺開關顯示停用及 70 待設定，讀取前後隔離規則檔雜湊一致。既有最低應付、運費政策正常。`admin-policy.jpg`、`legacy.log` |
| `/admin/member-center/copy` | 欄位清楚標示統一名称用途；測試名「驗收咖啡金」同步到新功能、回饋、結帳、訂單提示。三選項、單一說明按鈕、視窗标题與政策文案可編輯；名稱與比例預覽同步。KD弊／枚保持原文，未引用提示與模板預覽可見。`admin-copy-name.jpg`、`admin-copy-placeholder.jpg`、`admin-copy-legacy-warning.jpg` |
| 會員首頁／回饋 | 首頁仍顯示歷史 KD弊／枚，已引用 token 的區塊顯示驗收咖啡金。`member-dashboard-legacy.jpg`、`rewards-shared-name.jpg` |
| 三模式與保存 | 不使用／每期最高／每期指定均可選；最高保存、指定 300 保存及重新整理後仍为 300。整個定期配送區塊只有一個說明按鈕，桌機／手機無長篇常駐說明，金額欄與儲存按鈕在 viewport 寬度内。`subscription-desktop.jpg`、`subscription-mobile.jpg` |
| Modal 行為 | 關閉、捲動、Esc、焦點返回完成；點說明不改模式或提交。`help-desktop.jpg`、`help-mobile.jpg`、`credit-preference-mobile.jpg` |
| 動態政策 | 40%／最低應付 800、運費可折時預估抵 190、應付 850；只折商品時抵 150、應付 890，說明同步。鎖定期次保留 40%／800／不折運費，與目前 70%／100／可折運費分開显示。`policy-preview-40-800-no.jpg`、`help-current-vs-locked.jpg`、`help-desktop.jpg` |
| 訂單／抵用紀錄 | 一般、首單、後續及立即補貨實際訂單與 reservation 一致，取消狀態與返還標籤使用測試名稱。見下表及 `cancel-return.jpg` |

| 類別／隔離訂單 | 折抵前 | 實際折抵 | 應付 | 驗收證據 |
| --- | ---: | ---: | ---: | --- |
| 一般 `KD20261006-7518` | 1,150 | 700 | 450 | 商品 1,000 × 70%，運費 100、COD 50。`checkout-general.jpg`、`general-order.jpg` |
| 首單 `KD20261006-1974` | 1,150 | 120 | 1,030 | 本次折抵 120，另保存後續指定 300 與 consent。`checkout-first.jpg`、`first-order.jpg` |
| 後續 `KD20261009-143625` | 1,040 | 120 | 920 | 指定 300、餘額 120；優惠後商品 950＋運費 40＋COD 50。重跑不再扣，取消 release 120。`renewal-order.jpg`、`renewal.log`、`scheduler.log` |
| 立即補貨 `KD20261006-091371` | 1,040 | 120 | 920 | 同樣指定 300、餘額 120；重跑不重扣，週期 anchor 不變。`replenishment-order.jpg`、`scheduler.log` |

正式的會員取消 API 在隔離訂單上返還 120；再次重播兩次没有重复返還，`cancel-replay.log` 保存结果。帳本顯示後續單 released、其餘三單 reserved，與各訂單折抵一致。隔離庫存最後 97，對應四筆建單及一筆取消回補；沒有對正式訂單做取消或回補。

### 最終測試與 production build

| 檢查 | 結果／證據 |
| --- | --- |
| production build | 前一輪最後修改後完成，退出碼 0。編譯 25.0 秒、TypeScript 18.9 秒、28 個靜態頁面生成，路由與 traces 完成。`build.log` 最後一次紀錄與 `acceptance-results.json` |
| 快照涵蓋最終修改 | 本次重新比對 384 個程式／設定檔、另外 7 個 bootstrap／入口檔，差異 0。`closeout-verification.json`；此檢查不把刻意隔離的 runtime fixture 當正式資料 |
| 隔離整合 | 127 checks 通過，`final-integration.log` |
| 文案 | 939 checks 通過，`final-copy.log` |
| TypeScript noEmit | 本次補跑退出碼 0，`final-typescript.log`；停用 incremental，不改寫 tsbuildinfo |
| 其他回歸 | 已完成並保留：commerce 41、inventory 17、member cancellation 36、first activation 25、operational 34、home delivery 44、cancel credit 18、roast 24、checkout regression 通過。本次不重跑；部分依前一輪執行紀錄及上方原報告，没有另存獨立 log |
| Lint／diff | 既有修改範圍 lint 無新增錯誤，原 img／unused 警告保留；程式／測試 diff check 通過。廣域 lint 的既有 `test-phase2b-home-delivery.ts:68` no-explicit-any 未處理，不宣稱全專案 lint 通過 |

成功 build 命令（在專案根目錄執行，已有紀錄，本次沒有重建）：

```powershell
node scripts/credit-local-acceptance-runner.mjs snapshot
node scripts/credit-local-acceptance-runner.mjs build
```

runner 在證據目錄 `app/` 的隔離快照執行 `next build --webpack`，資料指向同目錄 `runtime/`，外部網路封鎖。`build.log` 是多次嘗試的累加紀錄，較早存在隔離 fixture／複製缺檔失敗；最后成功段才是最終結果。Next 多 lockfile 警告非阻擋，沒有為消除警告修改正式設定。

本次補跑命令：

```powershell
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

### 資料保護與隔離核對：A／B／C 分開記錄

**A．上一輪已有結果**：`acceptance-results.json` 於台北時間 14:41:40 記錄 `data`、`public/data`、`public/uploads` 共 188 檔，修改 0、新增 0、刪除 0。這是上一輪的比對結果，沒有改寫為本輪新驗證。

**B．本輪直接證據**：本輪對目前 188 檔建立明確標為「收尾當下觀測」的 `protected-current-closeout.json`，僅用來核對本次收尾開始至完成期間是否變動，不冒充實作前基準。2026-10-06 台北時間 18:09:11 至 18:13:11，比較 188 檔差異 0（包含新增／刪除檢查）；結果寫入 `closeout-verification.json`，只能證明這次收尾期間。另掃描 474 個正式程式／設定／runtime 檔（包含本機 env 檔，僅輸出命中檔名與數量，不列值），本次隔離名稱、帳號、測試憑證值、4318 位址及網路 guard 引用命中 0。直接讀取原 copy 的兩個 key，結果仍為 KD弊／枚，共用名稱 key 沒有 override，保持缺值預設抵用金。

隔離 runner 使用環境變數白名單、合成帳號／資料與自己的 `KD_DATA_DIR`；不繼承正式通知憑證、不複製 env／會員／訂單 runtime 資料至 app 快照。網路 guard 只透過本機 runner 的子程序載入，未接入正式 package scripts／Next 設定。沒有發送通知、沒有呼叫正式排程。本輪既有測試服務已停止，4318 無監聽程序的上一輪核對結果保留；本次沒有啟動服務，也沒有停止其他服務或刪除不明檔案。

**C．無法獨立重驗的範圍**：原始實作前逐檔雜湊基準未落盤且工作階段已中斷，本次无法取得，不能重新證明整段實作／驗收期間的全部受保護檔案均未變動。其他影像任務留下的 baseline 不屬於本任務，不借用。當前觀測、Git diff 或既有 188／0 摘要均不能取代缺失的原基準。

Git 中原有 `data/fulfillment/state.json`、`data/membership-commerce/business-rules.json`、`public/data/*.json`、`data/member-center/` 與資產變更仍存在；不能誤列成本次功能新增，也沒有回復／刪除／覆蓋。原有 launcher、圖片作業、runtime backup、qa-output 與其他測試檔亦保留。這些檔案相對 HEAD 的差異不代表本功能寫入；缺少原完整基準時，也不宣稱逐位元證明所有既有工作均與實作前一致。

### 未完成項目與限制

- 無法獨立重验遺失的原始保護基準；已如上揭露，不用新基準補造歷史。
- 依指令未連正式排程、未實際發送 LINE／email／其他外部通知。共用通知文案有隔離測試，正式服務整合仍待另行授權。
- 手機驗收是瀏覽器 viewport，未驗證實體 iOS／Android 或所有瀏覽器；Esc／focus 行為已在當時使用的本機瀏覽器完成。
- 部分早期回歸僅留原執行紀錄與報告，未另保存獨立退出碼 log；最終 build、127／939 與本次 TypeScript 均有現存證據。
- 歷史 KD弊 與任意不含 token 的自訂句子继续獨立，不宣稱已全數自動統一。已鎖定期次不自動套用新的 70% 政策。
- 既有廣域 lint 問題及其他未提交工作未順便修理。
- 收尾讀取隔離 runner 時，工具輸出曾包含合成測試憑證常值，屬操作失誤。後續核對改為不輸出值，本報告不重列；沒有輸出正式憑證。隔離服務已停止。

### Owner 啟用及人工驗收路徑（本次不操作正式資料）

1. `/admin/membership` → 06：確認獨立比例上限開關，明確啟用並輸入 70。舊規則顯示 70 不等於已啟用。保留／確認最低應付、運費可否折抵、原固定上限與零元設定，先看影響範圍，再確認儲存。已鎖定期次仍使用鎖定政策。
2. `/admin/member-center/copy`：確認統一名稱用途；沿用正式現有名稱，不複製驗收名稱。查看三模式、按鈕與 Modal 模板及 token 預覽。KD弊／枚保持原文；只有 Owner 希望同步的句子才手動加入 `{creditName}` 並保存。
3. 隔離 `/member` → 配送 → 管理配送：逐一選三模式，指定 300 保存／刷新；確認單一說明、目前／鎖定政策與手機寬度，關閉／捲動／Esc／焦點返回。調整隔離政策後重開說明核對預估。
4. 隔離 `/checkout` 與 `/orders/<orderNumber>`：驗證一般／首單摘要；再用餘額 120、指定 300 驗證後續／立即補貨、帳本、重播與取消返還。不要以正式會員／訂單或正式 scheduler 進行破壞性驗收。

### Git 狀態與分類

完整工作區 Git status 另保存在本機交接紀錄，不納入此候選文件。`git diff --cached --stat` 為空，沒有 staged 內容。

- **本功能**：上方功能／測試／文件清單。部分修改檔原已存在未提交工作，本次保留其其他內容，不把整檔所有差異一概歸於本功能。
- **既有變更**：資料、資產、launcher、影像報告／工具／backup、`scripts/test-phase-j3a-member-referral-invite.mjs`、`scripts/test-phase-j5c2a-order-status-refresh-sync.mjs` 等清單外項目，未回退或清理。
- **隔離測試產物**：證據目錄中的 app 快照、runtime、log、20 張截圖及收尾核對檔沿用既有 ignored 規則，不出現在一般 status；三個本機驗收 script 是新增、未追蹤的工具檔，仍清楚列在 status 中。

**尚未 stage／commit／push／deploy。完成後停止，等待提交指令。**
