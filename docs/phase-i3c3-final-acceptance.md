# Phase I.3C.3 Final Acceptance Gate

## 結論

**READY FOR OWNER ACCEPTANCE**

推薦制度、資格訂單、獎勵等待／發放／撤銷、月上限、多代推薦、PV、圖譜安全、冪等、Admin、Help、Member Center 與 Test Lab 的自動化驗收均通過。此階段沒有提交、推送、部署或正式環境資料異動。

瀏覽器登入驗收未執行：目前沒有可合法沿用的已登入工作階段。替代證據為隔離資料層測試、API／元件投影檢查、型別檢查、目標 lint 與正式建置。

## 制度封版摘要

1. 新會員綁定推薦關係時，只建立待資格獎勵，不立即入帳。
2. 被推薦人須在資格期限內完成合格訂單；推薦來源訂單與資格訂單是兩個獨立事實。
3. 合格取貨後依「基礎等待天數 + 退貨等待天數」計算可發放日，日期採日曆日語意。
4. 發放前若來源或資格交易失效，獎勵取消；發放後失效則依既有快照建立單筆負向帳本，不竄改歷史。
5. 月上限只計已正式發放金額；待發放不占額度。部分額度可部分發放，額度耗盡則明確取消且不入帳。
6. 多代深度與比率均由規則快照決定，各代資格獨立；自薦、循環與改掛關係均禁止。

## A–Z 驗收矩陣

| 案例 | 驗收重點 | 實際結果 |
|---|---|---|
| A | 從未訂閱的被推薦人建立資格權利 | 建立 `awaiting_order`，未入帳，PASS |
| B | 一般訂單完成資格 | 轉為等待完成／等待發放，PASS |
| C | 定期購訂單完成資格 | 可作為合格訂單，PASS |
| D | 期限最後一日下單、期限後完成 | 依下單日判定且可完成資格，PASS |
| E | 期限後才下單 | 不合格並依規則到期，PASS |
| F | 資格訂單取消後重試 | 期限內可由另一筆合格訂單完成，PASS |
| G | 截止時仍待完成、後續取消 | 不誤發，依規則取消／到期，PASS |
| H | 兩筆候選訂單，一筆取消、一筆成功 | 成功訂單可完成資格，PASS |
| I | 多筆成功與重送 | 選擇結果確定且不重複入帳，PASS |
| J | 00:01、15:30、23:59 日期語意 | 同一日結果一致，沒有 08:00 偏移，PASS |
| K | 基礎 0 日、退貨 0 日 | 可發放日正確，PASS |
| L | 基礎 0 日、退貨 7 日 | 可發放日正確，PASS |
| M | 基礎 7 日、退貨 0 日 | 可發放日正確，PASS |
| N | 規則變更後既有獎勵 | 沿用建立時快照，PASS |
| O | 資格訂單發放前退款 | 資格失效且不入帳，PASS |
| P | 資格訂單發放後退款 | 依發放快照建立撤銷，PASS |
| Q | 待發放獎勵與月上限 | 不占正式額度，PASS |
| R | 上限 500，先發 300、再發 300 | 第二筆只發 200，PASS |
| S | 上限已耗盡 | 不入帳，顯示「本月推薦獎勵上限已達」，PASS |
| T | 推薦人從未訂閱 | 符合其他規則即可發放，PASS |
| U | 推薦人定期購暫停 | 不阻擋已符合資格獎勵，PASS |
| V | 推薦人定期購終止 | 不阻擋已符合資格獎勵，PASS |
| W | 來源訂單 B100、資格訂單 A200 | 來源與資格交易狀態分離，PASS |
| X | 來源訂單發放前退款 | 以來源失效原因取消且不入帳，PASS |
| Y | 來源訂單發放後退款 | 依發放快照撤銷，PASS |
| Z | 資格訂單發放後退款 | 僅一筆負向帳本，PASS |

## 延伸驗收

| 領域 | 驗收結果 |
|---|---|
| 多代推薦 | A→G 受設定深度限制；比率取自規則快照；各代資格獨立，PASS |
| PV | 一般、活動與抵用金情境的成交基礎與 PV 規則一致，PASS |
| 組織月上限 | 待發放不占額度、部分發放與耗盡原因正確，PASS |
| 圖譜安全 | Self referral BLOCKED；Cycle BLOCKED；Re-parent BLOCKED，三者皆為預期 PASS |
| 隱私 | Member Center 不投影 Email、電話、地址，PASS |
| 一次性／週期性 | 新會員綁定僅一次；定期購來源事件重送不重複，PASS |
| Scheduler／履約冪等 | 併發與重送不產生重複獎勵或重複帳本，PASS |
| Credit 安全 | 權利建立、等待取貨與等待發放均不提前入帳；撤銷採追加帳本，PASS |
| Admin／Help | 資格、獎勵基礎、退貨等待、總等待與日期語意均可讀，PASS |
| Member Center | 狀態、日期、金額、額度耗盡與取消原因均為會員可理解文字，PASS |
| Test Lab | 使用隔離資料與規則，不污染正式資料，PASS |
| Quick Cycle | 快速週期完整通過，PASS |

## 本階段發現並修正的缺陷

月上限耗盡時，領域層已正確保存 `monthly_cap_exhausted_at_release` 且沒有入帳，但 Member Center 原本把它顯示為籠統的「獎勵取消」，Admin 也未提供可讀原因。

本階段只修正展示投影：Member Center 改顯示「本月推薦獎勵上限已達」，Admin 顯示相同可讀原因；沒有更動上限引擎、狀態列舉或發放規則。I.3C.3 的 Admin／Member Center 投影檢查與完整回歸均已通過。

## 自動化證據

- Phase I.3C.3 Final Acceptance：36 checks PASS
- Phase I.3C.2：41 checks PASS
- Phase I.3C.1：51 checks PASS
- Phase I.3C.0A：22 checks PASS
- Phase I.3C：57 checks PASS
- Phase I.3B：66 checks PASS
- Phase I.3A：34 checks PASS
- Phase I.3：17 checks PASS
- Member Identity：32 assertions PASS
- Member Auth：24 assertions PASS
- Membership Commerce：41 assertions PASS
- Membership Experience：36 scenarios PASS
- Fulfillment：28 assertions PASS
- Order／Cart／Checkout：20 assertions PASS
- LINE Order Image：11 assertions PASS
- 7-ELEVEN Parser：7 cases PASS
- TypeScript `tsc --noEmit`：PASS
- 本階段變更檔 ESLint：0 errors／0 warnings
- Production build：PASS（Next.js 16.2.10）
- 全專案 ESLint：既有基線 15 errors／43 warnings，未新增且不位於本階段變更檔
- `git diff --check`：PASS（僅換行格式提示）

## Git 與部署狀態

- Commit：NO
- Push：NO
- Deploy：NO
- Production mutation：NO
- Staged changes：NO
- 既有未提交 Phase I.3–I.3C.2 工作：保留
- 驗收 HEAD：`91278f89a85593edeb4218e5560072324ee517a8`
