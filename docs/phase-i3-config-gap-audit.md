# KD Coffee Studio Phase I.3 — Config Gap Audit

盤點基準：`91278f8`。本文件只記錄營運設定邊界；會員身份唯一性、事件 idempotency、已鎖定快照不可變、audit identity 等安全條件不列為 Owner 開關。

## A. 原本已可由 Admin 設定

- 定期購折扣、週期、修改截止、正式訂單建立提前天數
- 一般／專屬烘焙備貨天數
- 半磅／一磅／A+B／數量修改權限
- 贈品開始次數、頻率、數量與候選順序
- 推薦資格、獎勵方式與重複獎勵
- 抵用金期限、最高折抵與是否折運費
- 活動相容模式、恢復配送基準與金額取整
- 物流追蹤開關、取貨期限與四種可信 Email 事件

## B. 原本硬寫、這次移入統一規則

- 工作室自取一般商品 `0` 天、專屬烘焙 `3` 天
- 結帳自取的固定時段要求（第一版依 Owner 決策移除，只選日期）
- 會員定期購日期選擇模式與提前快捷選項
- 每一期日期最多修改次數
- 不可自取日期
- 抵用金操作模式與是否允許零元訂單
- 到店提醒天數、Gmail 回看天數
- LINE／Email 通知重試、fallback 與逐事件 enable/disable
- Owner 可解鎖日期、門市、數量的權限

## C. 原本沒有、這次新增的設定或 resolver

- backward-compatible normalized Phase I.3 rule object
- 日期 availability resolver（lead time、blocked date；保留未來 capacity／product lead-time 擴充點）
- credit member UI policy resolver
- 儲存重要規則前的未鎖定期次 impact preview
- current-only／future rebase 的未來期次實際重算
- 人工確認未取貨 reason selector 與 audit note
- 可信寄件者未知 Email 格式進人工 review，不猜狀態

## D. 刻意不開放給 Owner 的 system invariants

- canonical member ID 唯一性與 Email／LINE identity linking
- idempotency key、source fingerprint 與事件唯一性
- revision conflict protection
- 已鎖定 pricing／shipping／gift／rules snapshot 不可被新規則改寫
- FEFO 抵用金配置及不可重複 reserve／consume
- referral、gift、notification consequence 不可重複
- 未知 Email 不得直接改 canonical fulfillment state
- 沒有可信未取貨事件時不得自動終止定期購
- terminal fulfillment state 不得由外部舊事件倒退

## 尚需外部條件

- 目前環境沒有 Google OAuth／Gmail API credentials，因此正式 Gmail mailbox connection 不能假裝完成；既有安全 ingestion boundary 與人工 review 可繼續使用。
- 未取貨／逾期／退回的新 parser 必須等待 Owner 提供真實 Email 樣本。
- LINE 自動會員事件的真實發送仍需使用隔離 Beta 會員與 Owner 真機驗證；既有訂單文字＋圖片路徑不得用測試資料重送正式會員。
