# Phase I.3C Runtime Behavior Audit

稽核日期：2026-08-30  
基準：`main`、HEAD `91278f8`，並保留 working tree 中尚未提交的 Phase I.3／I.3A／I.3B。

本文件記錄目前程式真正執行的行為，不依後台欄位名稱推測，也不在本階段修改商業政策。

## A–E. 推薦人領取資格（Phase I.3C 稽核時的舊行為，已由 I.3C.1 取代）

- 預設資格是「必須有啟用中的定期購」。
- 可信任的成功取貨事件建立 reward 時會先檢查一次。受益人當下沒有 active subscription 時會被跳過：不建立 reward、不建立 pending placeholder、沒有 expiration，也不會在未來補領。
- Reward 到期由 scheduler 發放時會再檢查一次。若 reward 建立時合格、發放前失去 active subscription，scheduler 回傳 failed，但 reward 維持 `scheduled`。
- Failed scheduled reward 沒有最長保留期限；之後每次到期 scheduler 都會再試。推薦人未來恢復 active subscription 後，可以在下一次 scheduler 發放。
- Scheduler 使用「發放當下的有效資格規則」，不是 reward 建立時的歷史資格 snapshot。因此修改資格規則可能影響既有 scheduled reward；但既有 reward 的金額、祖先鏈、比例、模式及 scheduled release 仍維持 snapshot。
- 現行程式沒有「先替不合格推薦人建立 pending，等他日後訂閱再領」的行為。

## F. 新推薦等待 N 天

- Time zero 是會員的可信任 `successful pickup` fulfillment event。
- 建立新推薦 reward 時，程式取成功取貨的台北日期，加上 N 個台北曆日，並把 `scheduledReleaseAt` 保存為目標日 `00:00:00+08:00`。
- 現行 scheduler 在解析該 timestamp 後又加了八小時才比較 due。因此保存為 `2026-09-06T00:00:00+08:00` 的 reward，實際要到台北時間 `2026-09-06 08:00` 才被視為 due。
- 例：2026/08/30 14:00 成功取貨、等待 7 天，會保存 2026/09/06 00:00 +08:00；目前程式從 2026/09/06 08:00 +08:00 起才接受 scheduler 發放，不是成功取貨後正好 7×24 小時，也不是目標日午夜。
- 到達 due time 只代表「可以發放」；實際抵用金要等 scheduler 下一次成功執行才入帳。

## G. 等待期間取消／退款／退貨

- Release 前收到取消／退款結果時，該訂單的所有 scheduled rewards 會改成 `cancelled`，不建立 credit，後續 scheduler 也不再處理。
- Release 後退款／退貨會在處理當下讀取目前有效 reversal policy。
- `cancel pending and reverse released`：保留原始正數 ledger，降低仍可使用的原 credit balance，並新增 append-only 負數 reversal entry；reward 改為 `reversed`。
- `cancel pending only`：scheduled reward 仍取消，但 released reward 不變。
- Reversal 以 outcome idempotency key 保護；相同退款結果重送不會建立第二筆負數 ledger。

## H. 等待規則由 7 改成 10

- 已建立 reward 保留原本的 `scheduledReleaseAt`、rate、amount、calculation mode、PV conversion、ancestry 及 rule version。
- 新等待天數只影響新建立的新推薦 rewards。
- 例外是 release-time eligibility 與 reversal policy：這兩項目前在實際處理時讀取 active rules，而不是完全依歷史 snapshot。

## I. 定期購推薦獎勵

- 已完成的定期購 cycle 使用同一個多代 reward resolver，reward type 為 `subscription`。
- Subscription reward 不使用「新推薦等待天數」。程式會讓它在成功取貨同一流程立即到期，並由同一次 canonical outcome flow 呼叫 scheduler。
- 每個不同的成功取貨 cycle 都可再次產生 reward；相同 cycle／outcome 重送保持冪等。
- 新推薦 once-only qualification 不會阻止後續 subscription cycle rewards。

## J. 組織總獎勵上限

- 每張訂單建立 rewards 時計算一次。
- 實付模式 basis：商品小計扣除已使用抵用金，不包含運費。
- PV 模式 basis：effective PV × PV-to-credit conversion。
- 組織上限百分比套用 basis 後，依 money rounding rule 取整數。
- 配置順序由最近推薦人往遠代。每代實際金額取「該代 rounded raw reward、剩餘組織 cap、該受益人剩餘月額度」三者最小值；cap 用完即停止。

## K. PV basis

- SKU base PV 由伺服器在訂單建立時 snapshot。
- Effective PV 依價格折扣比例同比降低，並依 rounding direction 保留兩位小數。
- Reward PV = effective PV × level rate。
- Credit = reward PV × PV-to-credit conversion，最後依 money rounding rule 轉為整數抵用金。
- PV 模式的 organization cap 金額 basis 也是 effective PV × PV-to-credit conversion。

## L. 單一推薦人月上限

- 月上限在 reward 建立時套用，不在 release 時重算。
- 以 beneficiary 及 reward `createdAt` 的 `YYYY-MM` 分組。
- `scheduled` 與 `released` 都占用額度；`cancelled` 與 `reversed` 不占用。
- `0` 代表不限。
- 剩餘額度不足時，新 reward 會被截短；實際金額小於一元時不建立。

## M. Reward rounding

- Reward credit 一律是整數 TWD credit。
- Reward 建立時依 active money rule 使用四捨五入、無條件捨去或無條件進位。
- Effective PV 可保留兩位小數，最終換算的 credit 再取整數。
- Organization cap 先 rounding；各代 raw reward 也先 rounding，之後才套用組織及月上限截短。

## Phase I.3C.1 Referral Reward Qualification Window

- 新 canonical multi-generation flow 不再要求 active subscription，也不再因 beneficiary 當下沒有 subscription 而丟棄 reward event。
- Source member 的可信任成功取貨仍是 reward entitlement 的產生點；每一代 beneficiary 都取得自己的獨立 entitlement。
- Reward snapshot 保存 `qualificationWindowDays`、`qualificationStartedAt`、`qualificationExpiresAt`、qualification attempts、generation、calculation mode、basis、rate、PV conversion、ancestry 與 rule version。
- 到期日以 reward 產生當天為第一個台北曆日。30 天範例的 8/1 reward 可於 8/30 23:59:59.999 +08:00 前下單，8/31 起的新訂單不可綁定。
- 一般訂單與定期購訂單建立時都可登記 attempt；這只建立關聯，不改價、不扣款、不發 credit。
- 期限內下單後，即使 successful pickup 在期限後發生仍可 qualify。到期時仍 pending 的期限內訂單保持 `awaiting_completion`，不直接 expire。
- 取消、未取、退款或退貨會讓該 attempt 失效。期限未過可再用另一筆期限內訂單嘗試；期限已過且沒有其他 pending／completed attempt 時轉 `expired`，記錄仍保留。
- 同一 entitlement 可登記多筆期限內 attempt；所有 event 冪等，最早建立且最終成功的訂單成為 deterministic qualification order，只會 release 一次。
- Reward waiting period 與 qualification window 分離。Scheduler 只有在 qualification 已完成且原 `scheduledReleaseAt` 已到期時才發 credit。
- 缺少 qualification metadata 的歷史 reward 不會 crash，並保留舊版 active-subscription release 相容判斷；舊欄位不再控制新 reward。

## Phase I.3C.2 封版後的 canonical runtime

- Release eligibility 改為只比較 `Asia/Taipei` business date。舊 scheduler 額外 `+8 hours` 已移除；`00:01`、`15:30`、`23:59` 成功取貨都只取同一台北日期。
- Release waiting 從 beneficiary 自己的 qualification order 可信任 successful pickup 開始，不再從 source referred-member order 的 pickup 開始。
- Reward 建立時 snapshot Base Waiting、Return Protection 與 total。Qualification 成功時以 pickup business date 加 total 得到 `releaseEligibleBusinessDate`。
- 商業規則採 creation-time snapshot；交易取消、未取、退款、退貨及 fulfillment outcome 仍採最新可信任事實。
- Monthly cap 改在 release transaction 內正式占用，pending／scheduled 不占用；既有 partial payout 語意保留。
- Canonical reward release 不檢查 active subscription。Reversal 使用 reward creation-time policy snapshot。

## Phase I.3C 稽核時曾發現、現已由 I.3C.2 關閉的行為

1. 台北 08:00 due offset：已移除。
2. Waiting 與 reversal policy 未完整 snapshot：已封版為 creation-time snapshot。
3. Pending／scheduled reward 預占 monthly cap：已移至 release-time accounting。
4. Canonical reward 因沒有 active subscription retry：已退出 canonical flow。
5. 舊版單層 referral compatibility flow仍保留歷史語意；Owner-facing Help 與 Test Lab 以 canonical multi-generation flow 為準。
