# Phase I.3C.2 推薦獎勵最終發放規則

## Date-only release rule

Canonical scheduler 只比較 `Asia/Taipei` business date：`currentTaipeiBusinessDate >= releaseEligibleBusinessDate`。成功取貨的時、分、秒、毫秒不參與商業規則，也沒有午夜 UTC 或額外 `+8 hours` workaround。符合日期只代表 scheduler 下一次執行時可以發放，不保證 00:00 入帳。

範例：qualification order 於 8/1 15:30 成功取貨，Base Waiting 7 天、Return Protection 3 天，Total Waiting 10 天，Release Eligible Date 為 8/11。

## Owner-configurable waiting

- `referralRewardBaseWaitingDays`：預設 7，可設 0～365。
- `referralRewardReturnProtectionDays`：預設 3，可設 0～365。
- `totalWaitingDaysSnapshot = baseWaitingDaysSnapshot + returnProtectionDaysSnapshot`。

兩個值在 reward entitlement 建立時保存。真正的 `successfulPickupBusinessDate` 來自 beneficiary 自己的 qualification order trusted successful pickup；此時才計算 `releaseEligibleBusinessDate`。Source referral event validity 與 beneficiary release waiting 分開追蹤。

## Business rules snapshot, transaction facts live

Reward snapshot 包含 calculation mode、paid/PV basis、PV、generation、generation rate、ancestry、organization cap、monthly cap amount/period、qualification window/start/expiry、Base/Return/Total Waiting、reversal policy、rule version 及 release policy version。Owner 之後調整設定只影響新 reward。

Order cancellation、unclaimed、refund、return、trusted fulfillment success/reversal 與 duplicate-event protection使用最新可信任 transaction facts。Snapshot 不會蓋過新的失敗或 reversal event。

## Reversal snapshot

Canonical reward 依 creation-time `reversalPolicySnapshot` 決定 release 後退款是否沖回。是否真的 refund／return 仍由 live trusted event 決定。缺 snapshot 的 legacy reward 才安全 fallback 到 active rule。

## Monthly cap release-time accounting

Pending／scheduled reward 保存 projected amount，但不正式占用 monthly cap。Release transaction 依 reward snapshot 的 cap amount 與既有 period（reward creation month），只統計同 beneficiary、同 period、狀態為 `released` 的實際 amount。Cancelled、expired、reversed 不占用，維持既有 reversed accounting。

Engine 原本已有 partial cap allocation，因此此語意保留在 release：remaining 200、projected 300 時 release 200，並保存 cap usage 與 limited amount。Remaining 為零時不建立 credit。File transaction lock、deterministic sorting、ledger source reference 與 idempotency key 防止 duplicate／concurrent scheduler double credit。

## Active subscription removal

Canonical multi-generation reward 不檢查 active subscription。Never-subscribed、paused 或 terminated subscription 本身都不構成 release blocker，也不會造成 scheduled infinite retry。Qualification expiration 仍沿用 Phase I.3C.1。

## Compatibility and safety

Legacy persisted reward 缺少新 snapshot 欄位時可讀取；release eligible date fallback 到既有 `scheduledReleaseAt` 的日期部分，不再套用 08:00 offset。Legacy qualification-less reward 保留舊 active-subscription safety check。沒有 production batch migration或 datastore rewrite；credit mutation只發生在正式 release／reversal path。
