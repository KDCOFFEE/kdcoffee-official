# Member Credit Passbook / running balance / single-entry details

Owner 已完成相關視覺與功能驗收。本階段只做最終清理與本機提交；不 push、不部署。

## 最終功能

會員可用額卡片開啟帳本；每頁 20 筆、新到舊、opaque cursor、已看頁快取與上一頁／下一頁。完整已入帳及待入帳回饋頁不再重複一般 ledger。

逐筆餘額優先使用可信原快照；沒有快照才依完整 canonical 事件、分配、保留／使用／釋放／到期與沖回關係還原。無法可靠還原時使用明確可編輯的待確認文字，不偽造歷史餘額。此計算僅為顯示投影，沒有新增 ledger mutation 或第二套回饋。

可追溯的推薦、自購、推廣零售入帳／沖回及舊 referral conversion 提供單筆「查看詳情」。sourceReference、entry 會員、canonical beneficiary、入帳／沖回 backlink、必要 metadata 完全一致才提供入口；不依金額、日期或描述推測。
管理發放／扣除、來源缺失／矛盾及未知類型不提供回饋入口。訂單折抵位於 reservations，沒有為其製造虛構 creditEntry。

單筆明細只投影類型、狀態、訂單號碼、商品白名單摘要、點數、點選列的異動額、日期與餘額；不回傳內部來源 ID、raw metadata、個資或管理備註。既有 history API 使用會員 session，沒有新增由 client rewardId/orderId 控制的來源查詢 endpoint。

父帳本保持掛載；子 dialog 的 X／Esc／背景关闭停止事件冒泡，共用返回入口焦點與 scrollTop 的路徑，不重抓資料、不重設頁碼。頂部入口仍導向 `/member?rewardView=released#rewards`，與每列單筆視窗分開。

所有新增文案位於既有 `/admin/member-center/copy`。沿用共用抵用名稱、單位及點數名稱來源；保留历史 KD弊／枚 overrides，不改寫 runtime 文案。既有回饋相關固定文字改用明確 copyKey；只對可辨識系統值做顯示映射。

## 精確提交範圍

- `app/api/member/credit/history/route.ts`
- `app/member/page.tsx`
- `components/member/MemberCenterCopyProvider.tsx`
- `components/member/MemberCreditLedger.tsx`
- `components/member/MemberCreditPassbook.tsx`
- `components/member/MemberCreditPassbook.module.css`
- `components/member/MemberCreditEntryDetail.tsx`
- `components/member/MemberReferralCenter.tsx`
- `components/member/RewardLedgerCompactCard.tsx`
- `components/member/RewardSourceOrderSummaryCard.tsx`
- `components/member/RewardWaitingDisclosure.tsx`
- `lib/creditCopyCatalog.ts`
- `lib/memberCreditPassbook.ts`
- `lib/memberCreditPassbookStore.ts`
- `lib/memberCreditRunningBalance.ts`
- `lib/memberCreditEntryDetail.ts`
- `lib/memberCreditDetailReturn.ts`
- `scripts/fixtures/member-copy-render-boundary-baseline.json`
- `scripts/member-copy-render-boundary-digest.mjs`
- `scripts/test-member-center-copy.mts`
- `scripts/test-member-credit-passbook.mts`
- `scripts/test-member-credit-running-balance.mts`
- `scripts/member-credit-entry-detail-test-bootstrap.mjs`
- `scripts/test-member-credit-entry-detail.mts`
- 本文件。

Member Center IA 與 Referral／Rewards IA 測試已在 HEAD 中，未修改，無須加入本次提交。舊推薦分享測試的其他既有差異不納入。歷史實作報告原樣保留在工作區，以本文件說明最終行為，避免將旧完整 Git status、驗收產物或過時中間方案帶入提交。

## 最終回歸

最終回歸：Passbook 30、running balance 23、single-entry detail 38、Member Center IA 33/33、Referral／Rewards IA 67/67、copy 975 項全部通過。21 個相關程式／測試檔 ESLint exit 0；git diff --check exit 0。

隔離驗證取基準 HEAD 加上這兩組提交檔案，不借用其他未提交來源；TypeScript 與 production build --webpack 皆 exit 0。隔離網站資料為符合現有型別的空商品合成 fixture，沒有正式會員／訂單／內容。

完整工作區的舊 QA snapshot TypeScript 問題與過時 source assertion 不在此功能修理範圍；未修改 tsconfig 或歷史 QA。正式資料、上傳資產與所有其他既有工作保留。
