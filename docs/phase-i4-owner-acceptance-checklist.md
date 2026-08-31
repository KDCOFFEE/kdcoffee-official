# KD Coffee Owner 驗收清單

請使用測試會員與測試訂單。不要使用真正客人的資料，也不要先開啟正式排程。

## 開始前

- [ ] 我知道這次是驗收，不是正式上線
- [ ] 我準備了一個 Email 測試會員
- [ ] 我準備了一個 LINE 測試會員
- [ ] 我準備了一個定期購測試會員
- [ ] 我準備了推薦人與被推薦人各一位
- [ ] 我確認測試環境不會通知真正客人

## 會員登入

- [ ] Email 會員可以註冊
- [ ] Email 會員可以登入與登出
- [ ] 忘記密碼信可以收到並完成重設
- [ ] LINE 會員可以在手機登入
- [ ] Email 與 LINE 可以安全連結到同一會員
- [ ] 會員編號固定且沒有重複
- [ ] 不同會員看不到彼此資料

## 一般購物與結帳

- [ ] 訪客可以把商品加入購物車並結帳
- [ ] Email 會員可以結帳
- [ ] LINE 會員可以結帳
- [ ] 商品價格與活動價格正確
- [ ] 系統採用正確的最優惠價格
- [ ] 運費正確
- [ ] 抵用金餘額與最高可用金額正確
- [ ] 目前不允許把訂單抵成零元
- [ ] 連按送出不會建立兩張訂單
- [ ] 結帳後後台可以看到訂單
- [ ] Member Center 可以看到同一張訂單

## 7-ELEVEN

- [ ] 可以搜尋與選擇正確門市
- [ ] 訂單顯示正確店號、店名與地址
- [ ] Owner 可以標記已交寄
- [ ] 真實物流通知信可以更新正確訂單
- [ ] 到店狀態會顯示在後台與 Member Center
- [ ] 未知或錯誤通知不會更新錯誤訂單
- [ ] 逾期只標示「疑似未取」，不會直接處罰會員
- [ ] Owner 確認後才會標記未取貨

## 工作室自取

- [ ] 一般商品最早可選日期正確
- [ ] 專屬烘焙有較長準備時間
- [ ] 休息日／封鎖日期不能選
- [ ] Owner 可以看到客人希望自取日期
- [ ] Owner 可以標記準備中與可以取貨
- [ ] 客人收到正確取貨通知
- [ ] 成功取貨、取消與未取貨狀態正確

## 定期購

- [ ] 第一筆訂單成功取貨後才啟用定期購
- [ ] 30、45、60 天快捷週期可用
- [ ] 自訂週期最少 14 天、最多 120 天
- [ ] 快捷週期數字沒有被畫面裁切
- [ ] 下一次配送日與修改截止日正確
- [ ] 可以提前一次且不改後續基準
- [ ] 可以提前並重算後續基準
- [ ] 可以延後一次且不改後續基準
- [ ] 可以延後並重算後續基準
- [ ] 可以跳過本期
- [ ] 可以暫停與恢復
- [ ] 可以停止定期配送
- [ ] 可以立即補貨且不改原週期
- [ ] 可以更換支援的咖啡、份量、烘焙度與門市
- [ ] 到期時只建立一張自動訂單
- [ ] 鎖定後價格與規則不會被新設定改寫
- [ ] 贈品進度與當次贈品正確

## 推薦與抵用金

- [ ] 推薦碼、連結與 QR 可以使用
- [ ] 自己不能推薦自己
- [ ] 已有推薦人不能被改掛
- [ ] 推薦關係不會形成循環
- [ ] 一般訂單與定期購訂單都可取得領獎資格
- [ ] 不要求推薦人必須有啟用中的定期購
- [ ] 推薦來源訂單與領獎資格訂單分開顯示
- [ ] 成功取貨後才開始計算獎勵等待日期
- [ ] 發放日只看台北日期，沒有 08:00 限制
- [ ] 等待期間不會先增加抵用金
- [ ] 月上限只在真正發放時扣用
- [ ] 上限不足時可以部分發放
- [ ] 上限用完時顯示「本月推薦獎勵上限已達」
- [ ] 發放前退款不會入帳
- [ ] 發放後退款會留下清楚的沖回紀錄
- [ ] Member Center 沒有顯示下線 Email、電話或地址

## Owner 後台

- [ ] 首頁可以看到今天待處理事項
- [ ] 可以查看會員、訂單、履約、推薦、PV 與抵用金
- [ ] 會員制度設定使用看得懂的繁體中文
- [ ] 每個重要設定都有 Help
- [ ] Help 沒有說固定等待 7 天、08:00 或 N×24 小時
- [ ] Help 沒有說新推薦獎勵必須有啟用中的定期購
- [ ] 儲存成功與失敗很清楚
- [ ] 不合法的數字與組合會被拒絕
- [ ] 目前自訂週期最小值仍是 14 天
- [ ] Test Lab 只出現模擬會員與模擬訂單

## 通知與外部服務

- [ ] LINE Login callback 使用正式 HTTPS 網址
- [ ] LINE 文字通知可以在真實手機收到
- [ ] LINE 圖片通知清楚且可以開啟
- [ ] Email 通知可以收到，寄件者正確
- [ ] Gmail 顯示真實連線狀態，不會假裝成功
- [ ] Gmail 同一封信重跑不會重複更新
- [ ] 外部通知失敗時，Admin 與 Member Center 仍有紀錄

## 上線前最後確認

- [ ] Railway `/data` Persistent Volume 已掛載
- [ ] 會員、訂單、規則、抵用金、推薦、履約與網站內容都已備份
- [ ] 已用備份完成一次還原演練
- [ ] 已確認 production 環境變數，但沒有把秘密貼進文件
- [ ] 已確認所有排程頻率與負責人
- [ ] 已測試停止排程的方法
- [ ] 已測試只回退程式、不覆蓋新訂單的方法
- [ ] 已完成手機與桌面瀏覽器驗收
- [ ] Owner 已簽核 PV、月上限、零元訂單與自訂週期設定
- [ ] 所有正式部署 blocker 都已清除

完成以上項目後，再安排正式部署。現在這份清單本身不代表已經 production ready。

## Phase I.4A.1 — Owner Member Management Center

### 工程驗證（已完成）

- [x] Admin 首頁保留既有專用工具，並新增「會員管理」日常營運入口
- [x] 會員清單可依姓名、會員編號、Email、手機搜尋，並提供實用篩選與排序
- [x] 會員詳情安全呈現訂單、抵用金、定期購、推薦、身份與操作紀錄
- [x] Email-only、LINE-only、無訂單、無抵用金、無定期購與無推薦資料皆可安全呈現
- [x] Owner 新增抵用金透過 canonical commerce transaction 新增正向紀錄
- [x] Owner 扣除抵用金透過 canonical commerce transaction 新增負向紀錄與來源配置，不覆寫舊發放列
- [x] 金額、原因、確認、不可透支、同源請求、併發與 Admin 權限均由伺服器驗證
- [x] 每次 Owner 抵用金調整都建立 Admin audit record
- [x] 隔離測試、既有結帳／抵用金、定期購、推薦獎勵、TypeScript、changed-file ESLint、production build 與 diff check 已完成
- [x] 本機瀏覽器已驗證 Admin 入口、清單、搜尋、詳情、空狀態、確認防呆與手機版堆疊；未送出任何抵用金調整

### Phase I.4A Round 1 — Member Checkout × 7-ELEVEN Order Creation

#### PASS

- [x] Owner 以 Email 會員完成作品 → 購物車 → 7-ELEVEN 結帳 → 訂單建立的完整 Browser QA
- [x] 驗收訂單為 `KD20260831-6077`
- [x] 商品為「特納夕日」，規格為耳掛咖啡 10入／每包12g，數量 1
- [x] 商品小計 NT$500、7-ELEVEN 運費 NT$60、訂單總額 NT$560
- [x] canonical 門市名稱為「福賜」，門市 ID 為 `231152`
- [x] Admin 與 Member 訂單投影均正確
- [x] 庫存於訂單建立時恰好扣除一次
- [x] 本輪本機 LINE 功能停用，因此 LINE 通知刻意未測試；不分類為失敗

> Round 1 Owner Browser QA、訂單 canonical data、Admin／Member projection 與庫存證據均已完成；本輪正式標記 **PASS**。

### Phase I.4A Round 2 — Owner Credit Grant × Checkout Reservation × Financial Visibility

#### PASS

- [x] Owner 手動新增 NT$100 抵用金，Member Center 顯示來源「KD Coffee 贈送」
- [x] 驗收訂單為 `KD20260831-9263`
- [x] 結帳使用 NT$100，訂單保存商品小計 NT$500、運費 NT$60、折抵前總額 NT$560、抵用金 NT$100、最終總額 NT$460
- [x] 抵用金於結帳後進入 canonical `reserved` 狀態，沒有重複保留或消耗
- [x] Admin 與 Member 訂單投影均明確顯示 −NT$100
- [x] Member 抵用金歷史顯示與該訂單相關的保留使用

> Round 2 Owner Browser QA、canonical financial snapshot、credit reservation 與安全投影均已完成；本輪正式標記 **PASS**。

### 權威資料路徑

- 會員：`data/members/*.json`，登入身份與會員編號：`data/member-identity/registry.json`
- 訂單：`data/orders/*.json`
- 抵用金、定期購、推薦、通知與稽核：`data/membership-commerce/commerce-state.json`
- Owner 調整入口：`/admin/members/[memberId]` → Admin-only route → canonical membership commerce transaction → credit ledger + audit

## Phase I.4A Round 3 — Order Cancellation × Credit Release

### PASS

- [x] Admin 訂單 `KD20260831-9263` 取消前顯示商品小計 NT$500、運費 NT$60、抵用金 −NT$100、折抵前總額 NT$560、訂單總計 NT$460
- [x] Member Center 取消前可用抵用金為 NT$0，且原始「KD Coffee 贈送」紀錄仍在
- [x] Owner 手動取消 `KD20260831-9263`，canonical order status 成為 `cancelled`
- [x] canonical reservation 由 `reserved` 轉為 `released`
- [x] 原始 NT$100 credit entry 恢復為 `remainingAmount: 100`、`status: available`，未建立重複抵用金
- [x] SKU `turner-sunset-02` 庫存安全回補為 9，未重複回補
- [x] Member Center 顯示抵用金已因訂單取消而返還，並保留安全訂單參照
- [x] Member 與 Admin 訂單明細保留原始 NT$500 + NT$60 − NT$100 = NT$460，且正確顯示取消與釋放狀態
- [x] Browser QA、隔離自動測試與 canonical post-cancellation proof 全數通過

> Round 3 Owner 手動取消、抵用金釋放、庫存回補、重試冪等與 canonical review 均已完成；本輪正式標記 **PASS**。

## Phase I.4A Round 4 — Normal Order Fulfillment Lifecycle

### PASS

- [x] Owner Browser QA 已完成既有訂單 `KD20260831-6077` 的正常履約流程
- [x] Canonical 狀態依序完成：`preparing` → `shipped` → `arrived_at_pickup_store` → `completed`
- [x] 訂單與 fulfillment canonical state 均為 terminal `completed`，且只有一筆完成事件
- [x] Admin、Member Center 與會員訂單 timeline 均呈現已完成／已完成取貨
- [x] 商品小計 NT$500、運費 NT$60、總計 NT$560，沒有抵用金折抵或假交易
- [x] SKU `turner-sunset-02` 庫存維持 9；成功履約未再次扣除，也未回補
- [x] 無 subscription activation、cycle、gift progress、referral conversion、referral reward 或 reward credit
- [x] 先前取消流程的 NT$100 credit `credit_ZrrIJ8-mfqdHrXWe` 仍為 `available`，remainingAmount 維持 100
- [x] Completion consequence 已完成一次，無 cancelled／uncollected terminal event
- [x] `test:phase-i4a4` 隔離冪等回歸 17 checks PASS，重送不會重複完成、扣庫存或建立 commerce 副作用

> Round 4 Owner Browser QA 與 canonical post-completion review 已完成；本輪正式標記 **PASS**。
