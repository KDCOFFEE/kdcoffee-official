# Phase I.3C.1 推薦獎勵領取資格期限

## Canonical rule

推薦來源訂單成功取貨時，系統為推薦鏈中每一位可獲獎 beneficiary 建立獨立 reward entitlement。Beneficiary 不需要 active subscription；一般購買與定期購都可作為自己的 qualification order。

Qualification window 從 reward 產生的台北日期起算，產生當天是第一天。Owner 設定會在 reward 建立時保存，因此後續將 30 天改為 60 天不會改變既有 entitlement。

期限判斷採 order `createdAt`。期限內下單、期限後成功取貨仍有效；期限後才下單無效。Order created 只登記 attempt，不發 credit。只有 trusted successful fulfillment 才將 qualification 轉為 `qualified`，之後仍需滿足原 reward waiting／release 條件。

## State model

- `awaiting_order`：尚無期限內 qualifying order。
- `awaiting_completion`：已有期限內訂單，等待可信任最終結果。
- `qualified`：至少一筆期限內訂單已成功成交。
- `expired`：期限已過，且沒有仍待結果或已成功的期限內 attempt。

Reward 本身沿用 `scheduled`、`released`、`cancelled`、`reversed`。Qualification 與 reward release 是兩個正交狀態，不以 UI 文案取代 domain state。

每個 attempt 保存 order number、createdAt、normal／subscription 類型、pending／completed／failed、final state 與 finalizedAt。多筆訂單可同時等待；最早建立且成功的訂單 deterministic 成為 qualification order。失敗 attempt 保留 audit trail，不會永久鎖死 entitlement。

## Integration

- 一般 checkout 與 idempotent replay：登記 normal／subscription-intent order。
- Subscription order scheduler：正式訂單檔建立後登記 subscription order。
- Canonical fulfillment：completed／uncollected 更新 attempt。
- Admin／fulfillment cancellation：更新 attempt 為 failed。
- Existing referral release scheduler：處理 qualification expiry，且只 release 已 qualified、原 waiting 也到期的 reward。
- Member Center、Admin report 與 Test Lab 都讀同一份 reward qualification metadata。

## Compatibility and safety

歷史 reward 若沒有 qualification metadata，讀取不會失敗，release 仍走舊版相容判斷。沒有批次 migration，也不重寫 production datastore。

I.3C.1 沒有變更目前新推薦等待期的台北 08:00 due 行為、reversal snapshot policy、monthly-cap timing 或 organization-cap allocation。

## Phase I.3C.2 integration note

I.3C.2 保留本文件全部 qualification window 語意，但將 beneficiary qualification order 的 trusted successful pickup 台北日期定為 reward waiting 起點。Base Waiting 與 Return Protection 使用 reward creation-time snapshot；scheduler 只比較 release eligible business date，不再有 08:00 offset。Reversal policy 已改為 creation-time snapshot，monthly cap 已移至 release transaction 正式占用。
