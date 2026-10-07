import type { MemberCopyDefinition } from "./memberCenterCopyCatalog";

export const CREDIT_COPY_CATALOG: readonly MemberCopyDefinition[] = [
  { key: "credit.passbook.entryDetails", group: "storeCredit", purpose: "帳本／單筆來源明細按鈕（不開啟完整回饋頁）", defaultText: "查看詳情 →", tokens: {}, multiline: false },
  { key: "credit.passbook.entryDetailsAria", group: "storeCredit", purpose: "帳本／單筆來源明細無障礙名稱", defaultText: "查看「{description}」詳細資料（{date}，{amount}）", tokens: { description: "該筆帳本描述", date: "交易日期時間", amount: "帶正負號與共用單位的異動額" }, multiline: false },
  { key: "credit.passbook.detail.status", group: "storeCredit", purpose: "單筆回饋／狀態標籤", defaultText: "狀態", tokens: {}, multiline: false },
  { key: "credit.passbook.detail.createdAt", group: "storeCredit", purpose: "單筆回饋／原始回饋產生日期", defaultText: "產生日期", tokens: {}, multiline: false },
  { key: "credit.passbook.detail.creditAmount", group: "storeCredit", purpose: "單筆回饋／本筆實際折抵額標籤", defaultText: "{creditName}", tokens: { creditName: "共用顯示名稱" }, multiline: false },
  { key: "credit.passbook.detail.status.expired", group: "storeCredit", purpose: "單筆回饋／資格失效狀態", defaultText: "已失效", tokens: {}, multiline: false },
  { key: "credit.passbook.unresolvedBalance", group: "storeCredit", purpose: "帳本／無法可靠還原當時餘額", defaultText: "餘額待確認", tokens: {}, multiline: false },
  { key: "credit.reward.unknownStatus", group: "rewards", purpose: "回饋明細／未辨識系統標籤", defaultText: "紀錄確認中", tokens: {}, multiline: false },
  { key: "credit.reward.qualifying", group: "qualification", purpose: "回饋明細／待符合資格狀態", defaultText: "待符合資格", tokens: {}, multiline: false },
  { key: "credit.passbook.prevPage", group: "storeCredit", purpose: "簡明帳本／上一頁", defaultText: "上一頁", tokens: {}, multiline: false },
  { key: "credit.passbook.nextPage", group: "storeCredit", purpose: "簡明帳本／下一頁", defaultText: "下一頁", tokens: {}, multiline: false },
  { key: "credit.passbook.pageLabel", group: "storeCredit", purpose: "簡明帳本／目前頁碼", defaultText: "第 {page} 頁", tokens: { page: "目前頁碼" }, multiline: false },
  { key: "credit.passbook.pagination", group: "storeCredit", purpose: "簡明帳本／分頁導覽名稱", defaultText: "異動紀錄分頁", tokens: {}, multiline: false },
  { key: "credit.passbook.retry", group: "storeCredit", purpose: "簡明帳本／重試", defaultText: "重試", tokens: {}, multiline: false },
  { key: "credit.passbook.oldBalanceNote", group: "storeCredit", purpose: "簡明帳本／無法還原的早期紀錄說明（每頁只顯示一次）", defaultText: "部分早期紀錄缺少完整異動資料，當時餘額仍待確認。", tokens: {}, multiline: false },
  { key: "credit.passbook.loginRequired", group: "storeCredit", purpose: "简明帳本／未登入提示", defaultText: "請先登入會員", tokens: {}, multiline: false },
  { key: "credit.passbook.invalidPage", group: "storeCredit", purpose: "簡明帳本／分頁參數錯誤", defaultText: "頁碼不正確", tokens: {}, multiline: false },
  { key: "credit.passbook.title", group: "storeCredit", purpose: "簡明帳本／視窗標題", defaultText: "{creditName}明細", tokens: { creditName: "共用顯示名稱" }, multiline: false },
  { key: "credit.passbook.history", group: "storeCredit", purpose: "完整回饋明細／異動紀錄標題", defaultText: "{creditName}異動紀錄", tokens: { creditName: "共用顯示名稱" }, multiline: false },
  { key: "credit.passbook.details", group: "storeCredit", purpose: "簡明帳本／完整明細入口", defaultText: "查看詳情 →", tokens: {}, multiline: false },
  { key: "credit.passbook.close", group: "storeCredit", purpose: "簡明帳本／關閉", defaultText: "關閉{creditName}明細", tokens: { creditName: "共用顯示名稱" }, multiline: false },
  { key: "credit.passbook.available", group: "storeCredit", purpose: "簡明帳本／可用餘額標籤", defaultText: "目前可用", tokens: {}, multiline: false },
  { key: "credit.passbook.balance", group: "storeCredit", purpose: "簡明帳本／異動後餘額", defaultText: "餘額 {amount}", tokens: { amount: "該筆異動後的已記錄餘額（含既有單位）" }, multiline: false },
  { key: "credit.passbook.unknownBalance", group: "storeCredit", purpose: "簡明帳本／舊資料缺少餘額快照", defaultText: "歷史餘額未記錄", tokens: {}, multiline: false },
  { key: "credit.passbook.empty", group: "storeCredit", purpose: "簡明帳本／空狀態", defaultText: "目前尚無{creditName}異動紀錄", tokens: { creditName: "共用顯示名稱" }, multiline: false },
  { key: "credit.passbook.more", group: "storeCredit", purpose: "簡明帳本／分頁按鈕", defaultText: "載入更多", tokens: {}, multiline: false },
  { key: "credit.passbook.loading", group: "storeCredit", purpose: "簡明帳本／讀取狀態", defaultText: "讀取中…", tokens: {}, multiline: false },
  { key: "credit.passbook.loadError", group: "storeCredit", purpose: "簡明帳本／讀取失敗", defaultText: "暫時無法讀取{creditName}紀錄，請稍後再試。", tokens: { creditName: "共用顯示名稱" }, multiline: false },
  { key: "credit.passbook.adminGrant", group: "storeCredit", purpose: "簡明帳本／後台發放描述", defaultText: "後台發放{creditName}", tokens: { creditName: "共用顯示名稱" }, multiline: false },
  { key: "credit.passbook.adminDeduction", group: "storeCredit", purpose: "簡明帳本／後台扣除描述", defaultText: "後台調整{creditName}", tokens: { creditName: "共用顯示名稱" }, multiline: false },
  { key: "credit.passbook.referral", group: "storeCredit", purpose: "簡明帳本／推薦入帳描述", defaultText: "推薦回饋入帳", tokens: {}, multiline: false },
  { key: "credit.passbook.memberReward", group: "storeCredit", purpose: "簡明帳本／會員回饋描述", defaultText: "會員回饋", tokens: {}, multiline: false },
  { key: "credit.passbook.retailReward", group: "storeCredit", purpose: "簡明帳本／零售回饋描述", defaultText: "推廣零售回饋入帳", tokens: {}, multiline: false },
  { key: "credit.passbook.reversal", group: "storeCredit", purpose: "簡明帳本／回饋沖回描述", defaultText: "回饋沖回", tokens: {}, multiline: false },
  { key: "credit.passbook.creditIssued", group: "storeCredit", purpose: "簡明帳本／其他入帳描述", defaultText: "{creditName}入帳", tokens: { creditName: "共用顯示名稱" }, multiline: false },
  { key: "credit.help.currentPolicy", group: "storeCredit", purpose: "說明視窗／目前政策標題", defaultText: "目前政策（新結帳及尚未鎖定期次）", tokens: {}, multiline: false },
  { key: "credit.help.lockedPolicy", group: "subscription", purpose: "說明視窗／已鎖定政策標題", defaultText: "已鎖定期次政策（保留鎖定時設定）", tokens: {}, multiline: false },
  { key: "credit.help.policyDisabled", group: "storeCredit", purpose: "說明視窗／比例上限停用", defaultText: "{creditName}的獨立比例上限目前停用；仍遵守以下折抵限制及可用餘額。", tokens: { creditName: "共用顯示名稱" }, multiline: false },
  { key: "credit.system.invalidLedgerAmount", group: "storeCredit", purpose: "帳本金額驗證提示", defaultText: "{creditName}必須是非負整數新台幣", tokens: { creditName: "共用顯示名稱" }, multiline: false },
  { key: "credit.system.invalidLedgerBalance", group: "storeCredit", purpose: "帳本餘額驗證提示", defaultText: "{creditName}餘額必須是非負整數新台幣", tokens: { creditName: "共用顯示名稱" }, multiline: false },
  { key: "credit.system.invalidConsumptionAmount", group: "storeCredit", purpose: "有效消費金額驗證提示", defaultText: "有效消費{creditName}必須是非負整數新台幣", tokens: { creditName: "共用顯示名稱" }, multiline: false },
  { key: "credit.subscription.offHint", group: "subscription", purpose: "每期關閉說明", defaultText: "後續配送與立即補貨不會自動使用額度，直到您修改此設定。", tokens: {}, multiline: false },
  { key: "credit.subscription.maximumHint", group: "subscription", purpose: "每期最高說明", defaultText: "每期在當期政策上限內使用所有可用餘額；餘額低於上限時，使用到餘額為 0。設定持續至修改或關閉。", tokens: {}, multiline: false },
  { key: "credit.subscription.lockedHint", group: "subscription", purpose: "已鎖定、尚未建單說明", defaultText: "本期已鎖定商品、政策與使用方式；{creditName}尚未保留，實際金額會在建單時依可用餘額確認。", tokens: { creditName: "共用顯示名稱" }, multiline: false },
  { key: "credit.help.loading", group: "storeCredit", purpose: "使用說明／讀取中", defaultText: "正在讀取目前有效政策…", tokens: {}, multiline: false },
  { key: "credit.help.loadError", group: "storeCredit", purpose: "使用說明／讀取失敗", defaultText: "政策暫時無法讀取，請重新開啟頁面後再試。", tokens: {}, multiline: false },
  {
    "key": "credit.checkout.title",
    "group": "storeCredit",
    "purpose": "會員{creditName}",
    "defaultText": "會員{creditName}",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.checkout.maximum",
    "group": "storeCredit",
    "purpose": "使用本次最高可抵{creditName}金額",
    "defaultText": "使用本次最高可抵{creditName}金額",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.checkout.amount",
    "group": "storeCredit",
    "purpose": "本次使用{creditName}金額",
    "defaultText": "本次使用{creditName}金額",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.checkout.maximumButton",
    "group": "storeCredit",
    "purpose": "使用最高可抵{creditName}金額",
    "defaultText": "使用最高可抵{creditName}金額",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.checkout.available",
    "group": "storeCredit",
    "purpose": "目前可用{creditName} {amount}",
    "defaultText": "目前可用{creditName} {amount}",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）",
      "amount": "伺服器或畫面提供的實際金額"
    },
    "multiline": false
  },
  {
    "key": "credit.checkout.limit",
    "group": "storeCredit",
    "purpose": "本次最多可使用{creditName} {amount}；優先使用最快到期的額度。",
    "defaultText": "本次最多可使用{creditName} {amount}；優先使用最快到期的額度。",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）",
      "amount": "伺服器或畫面提供的實際金額"
    },
    "multiline": false
  },
  {
    "key": "credit.checkout.automatic",
    "group": "storeCredit",
    "purpose": "已自動使用最高可抵{creditName}金額 {amount}",
    "defaultText": "已自動使用最高可抵{creditName}金額 {amount}",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）",
      "amount": "伺服器或畫面提供的實際金額"
    },
    "multiline": false
  },
  {
    "key": "credit.order.cancel",
    "group": "orders",
    "purpose": "目前可提出自助取消。確認後系統會依既有安全流程處理訂單、庫存與已保留的會員{creditName}。",
    "defaultText": "目前可提出自助取消。確認後系統會依既有安全流程處理訂單、庫存與已保留的會員{creditName}。",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.order.returned",
    "group": "orders",
    "purpose": "訂單取消，{amount} {creditName}已返還。",
    "defaultText": "訂單取消，{amount} {creditName}已返還。",
    "tokens": {
      "amount": "伺服器或畫面提供的實際金額",
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.subscription.off",
    "group": "subscription",
    "purpose": "不自動使用{creditName}",
    "defaultText": "不自動使用{creditName}",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.subscription.maximum",
    "group": "subscription",
    "purpose": "每期自動使用最高可抵{creditName}金額",
    "defaultText": "每期自動使用最高可抵{creditName}金額",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.subscription.fixed",
    "group": "subscription",
    "purpose": "每期自動使用指定{creditName}金額",
    "defaultText": "每期自動使用指定{creditName}金額",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.subscription.amount",
    "group": "subscription",
    "purpose": "每期指定{creditName}金額",
    "defaultText": "每期指定{creditName}金額",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.subscription.persist",
    "group": "subscription",
    "purpose": "每期自動使用指定金額，持續至您修改或關閉；餘額不足時使用剩餘額度，仍不得超過當期政策上限。",
    "defaultText": "每期自動使用指定金額，持續至您修改或關閉；實際使用額以當期可抵上限及可用餘額為準。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "credit.subscription.save",
    "group": "subscription",
    "purpose": "儲存{creditName}使用方式",
    "defaultText": "儲存{creditName}使用方式",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.subscription.saved",
    "group": "subscription",
    "purpose": "{creditName}使用方式已儲存；適用後續未鎖定配送與立即補貨。",
    "defaultText": "{creditName}使用方式已儲存；適用後續未鎖定配送與立即補貨。",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.help.button",
    "group": "storeCredit",
    "purpose": "{creditName}使用說明",
    "defaultText": "{creditName}使用說明",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.help.title",
    "group": "storeCredit",
    "purpose": "{creditName}使用說明",
    "defaultText": "{creditName}使用說明",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.help.policy",
    "group": "storeCredit",
    "purpose": "單筆訂單最多使用優惠後商品金額的 {percent}% {creditName}，金額向下取整；仍須符合後台其他折抵限制。",
    "defaultText": "單筆訂單最多使用優惠後商品金額的 {percent}% {creditName}，金額向下取整；仍須符合後台其他折抵限制。",
    "tokens": {
      "percent": "後台目前有效的比例",
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.help.shippingYes",
    "group": "storeCredit",
    "purpose": "{creditName}可用於商品與配送費；百分比計算基礎不含配送費及貨到付款手續費。",
    "defaultText": "{creditName}可用於商品與配送費；貨到付款手續費不在折抵範圍內。",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.help.shippingNo",
    "group": "storeCredit",
    "purpose": "{creditName}僅用於商品；配送費及貨到付款手續費另計。",
    "defaultText": "{creditName}僅用於商品；配送費及貨到付款手續費另計。",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.help.minimum",
    "group": "storeCredit",
    "purpose": "目前最低應付限制：{amount}（不含貨到付款手續費）。",
    "defaultText": "目前最低應付限制：{amount}（不含貨到付款手續費）。",
    "tokens": {
      "amount": "伺服器或畫面提供的實際金額"
    },
    "multiline": false
  },
  {
    "key": "credit.help.zeroYes",
    "group": "storeCredit",
    "purpose": "目前允許零元訂單，仍須符合其他折抵限制。",
    "defaultText": "目前允許零元訂單，仍須符合其他折抵限制。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "credit.help.zeroNo",
    "group": "storeCredit",
    "purpose": "目前不允許零元訂單；商品與配送費至少應付 NT$ 1。",
    "defaultText": "目前不允許零元訂單；商品與配送費至少應付 NT$ 1。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "credit.help.other",
    "group": "storeCredit",
    "purpose": "其他折抵限制：{policy}。",
    "defaultText": "其他折抵限制：{policy}。",
    "tokens": {
      "policy": "目前有效的折抵政策"
    },
    "multiline": false
  },
  {
    "key": "credit.help.fixed",
    "group": "storeCredit",
    "purpose": "最高固定折抵 {amount}",
    "defaultText": "最高固定折抵 {amount}",
    "tokens": {
      "amount": "伺服器或畫面提供的實際金額"
    },
    "multiline": false
  },
  {
    "key": "credit.help.percentage",
    "group": "storeCredit",
    "purpose": "另有商品金額 {percent}% 折抵限制",
    "defaultText": "另有商品金額 {percent}% 折抵限制",
    "tokens": {
      "percent": "後台目前有效的比例"
    },
    "multiline": false
  },
  {
    "key": "credit.help.unlimited",
    "group": "storeCredit",
    "purpose": "未另設固定金額限制",
    "defaultText": "未另設固定金額限制",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "credit.help.lifecycle",
    "group": "storeCredit",
    "purpose": "系統優先使用最快到期的{creditName}。建立訂單時保留，成功取貨後扣帳；取消或未取貨時返還，已到期額度不延長期限。",
    "defaultText": "系統優先使用最快到期的{creditName}。建立訂單時保留，成功取貨後扣帳；取消或未取貨時返還，已到期額度不延長期限。",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.help.subscription",
    "group": "subscription",
    "purpose": "定期配送可選擇不使用、每期自動使用最高金額，或每期自動使用指定金額。設定持續至修改或關閉，適用後續配送與立即補貨；已鎖定期次保留原設定。",
    "defaultText": "定期配送可選擇不使用、每期自動使用最高金額，或每期自動使用指定金額。設定持續至修改或關閉，適用後續配送與立即補貨；已鎖定期次保留原設定。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "credit.help.close",
    "group": "storeCredit",
    "purpose": "關閉使用說明",
    "defaultText": "關閉使用說明",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "credit.source.default",
    "group": "storeCredit",
    "purpose": "會員{creditName}",
    "defaultText": "會員{creditName}",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.source.adjustment",
    "group": "storeCredit",
    "purpose": "{creditName}調整",
    "defaultText": "{creditName}調整",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.notice.issued",
    "group": "storeCredit",
    "purpose": "會員{creditName}已入帳",
    "defaultText": "會員{creditName}已入帳",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.notice.expiring",
    "group": "storeCredit",
    "purpose": "會員{creditName}即將到期",
    "defaultText": "會員{creditName}即將到期",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.notice.amount",
    "group": "storeCredit",
    "purpose": "會員{creditName} {amount} 已成功入帳。",
    "defaultText": "會員{creditName} {amount} 已成功入帳。",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）",
      "amount": "伺服器或畫面提供的實際金額"
    },
    "multiline": false
  },
  {
    "key": "credit.notice.expiringAmount",
    "group": "storeCredit",
    "purpose": "會員{creditName} {amount} 即將到期，請至會員中心查看。",
    "defaultText": "會員{creditName} {amount} 即將到期，請至會員中心查看。",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）",
      "amount": "伺服器或畫面提供的實際金額"
    },
    "multiline": false
  },
  {
    "key": "credit.notice.order",
    "group": "orders",
    "purpose": "會員{creditName}：-{amount}\n折抵後應付：{total}",
    "defaultText": "會員{creditName}：-{amount}\n折抵後應付：{total}",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）",
      "amount": "伺服器或畫面提供的實際金額",
      "total": "折抵後應付金額"
    },
    "multiline": true
  },
  {
    "key": "credit.system.message0",
    "group": "storeCredit",
    "purpose": "會員{creditName}",
    "defaultText": "會員{creditName}",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message1",
    "group": "storeCredit",
    "purpose": "{creditName}調整",
    "defaultText": "{creditName}調整",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message2",
    "group": "storeCredit",
    "purpose": "{creditName}餘額",
    "defaultText": "{creditName}餘額",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message3",
    "group": "storeCredit",
    "purpose": "{creditName}餘額超過發放金額",
    "defaultText": "{creditName}餘額超過發放金額",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message4",
    "group": "storeCredit",
    "purpose": "人工扣除{creditName}紀錄不完整",
    "defaultText": "人工扣除{creditName}紀錄不完整",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message5",
    "group": "storeCredit",
    "purpose": "人工扣除{creditName}配置不正確",
    "defaultText": "人工扣除{creditName}配置不正確",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message6",
    "group": "storeCredit",
    "purpose": "人工扣除{creditName}配置總額不正確",
    "defaultText": "人工扣除{creditName}配置總額不正確",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message7",
    "group": "storeCredit",
    "purpose": "訂單未取貨，釋放{creditName}",
    "defaultText": "訂單未取貨，釋放{creditName}",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message8",
    "group": "storeCredit",
    "purpose": "有效消費{creditName}",
    "defaultText": "有效消費{creditName}",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message9",
    "group": "storeCredit",
    "purpose": "有效消費{creditName}證據不一致",
    "defaultText": "有效消費{creditName}證據不一致",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message10",
    "group": "storeCredit",
    "purpose": "{creditName}必須大於零",
    "defaultText": "{creditName}必須大於零",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message11",
    "group": "storeCredit",
    "purpose": "找不到已完成的{creditName}調整紀錄",
    "defaultText": "找不到已完成的{creditName}調整紀錄",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message12",
    "group": "storeCredit",
    "purpose": "扣除金額超過目前可用{creditName}",
    "defaultText": "扣除金額超過目前可用{creditName}",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message13",
    "group": "storeCredit",
    "purpose": "可用{creditName}已變更，請重新整理後再試一次",
    "defaultText": "可用{creditName}已變更，請重新整理後再試一次",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message14",
    "group": "storeCredit",
    "purpose": "此訂單已有{creditName}保留",
    "defaultText": "此訂單已有{creditName}保留",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message15",
    "group": "storeCredit",
    "purpose": "可用{creditName}不足",
    "defaultText": "可用{creditName}不足",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message16",
    "group": "storeCredit",
    "purpose": "會員選擇使用{creditName}",
    "defaultText": "會員選擇使用{creditName}",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message17",
    "group": "storeCredit",
    "purpose": "找不到{creditName}保留紀錄",
    "defaultText": "找不到{creditName}保留紀錄",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message18",
    "group": "storeCredit",
    "purpose": "此{creditName}保留紀錄已完成處理",
    "defaultText": "此{creditName}保留紀錄已完成處理",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message19",
    "group": "storeCredit",
    "purpose": "{creditName}來源紀錄遺失",
    "defaultText": "{creditName}來源紀錄遺失",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message20",
    "group": "storeCredit",
    "purpose": "{creditName}是否可折抵運費尚待 Owner 決定",
    "defaultText": "{creditName}是否可折抵運費尚待 Owner 決定",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message21",
    "group": "storeCredit",
    "purpose": "本次沒有可使用的{creditName}，訂單仍以原應付金額成立。",
    "defaultText": "本次沒有可使用的{creditName}，訂單仍以原應付金額成立。",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message22",
    "group": "storeCredit",
    "purpose": "{creditName}保留已結束，訂單仍以原應付金額成立。",
    "defaultText": "{creditName}保留已結束，訂單仍以原應付金額成立。",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message23",
    "group": "storeCredit",
    "purpose": "{creditName}金額不正確",
    "defaultText": "{creditName}金額不正確",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message24",
    "group": "storeCredit",
    "purpose": "請先登入會員才能使用{creditName}",
    "defaultText": "請先登入會員才能使用{creditName}",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message25",
    "group": "storeCredit",
    "purpose": "訂單已成立，但{creditName}暫時無法套用。",
    "defaultText": "訂單已成立，但{creditName}暫時無法套用。",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  },
  {
    "key": "credit.system.message26",
    "group": "storeCredit",
    "purpose": "無法計算{creditName}",
    "defaultText": "無法計算{creditName}",
    "tokens": {
      "creditName": "共用顯示名稱（取自抵用金統一顯示名稱）"
    },
    "multiline": false
  }
];

/** Only exact, system-authored messages are translated. Custom text is left alone. */
export const CREDIT_SYSTEM_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  "抵用金必須是非負整數新台幣": "credit.system.invalidLedgerAmount",
  "抵用金餘額必須是非負整數新台幣": "credit.system.invalidLedgerBalance",
  "有效消費抵用金必須是非負整數新台幣": "credit.system.invalidConsumptionAmount",
  "會員抵用金": "credit.system.message0",
  "抵用金調整": "credit.system.message1",
  "抵用金餘額": "credit.system.message2",
  "抵用金餘額超過發放金額": "credit.system.message3",
  "人工扣除抵用金紀錄不完整": "credit.system.message4",
  "人工扣除抵用金配置不正確": "credit.system.message5",
  "人工扣除抵用金配置總額不正確": "credit.system.message6",
  "訂單未取貨，釋放抵用金": "credit.system.message7",
  "有效消費抵用金": "credit.system.message8",
  "有效消費抵用金證據不一致": "credit.system.message9",
  "抵用金必須大於零": "credit.system.message10",
  "找不到已完成的抵用金調整紀錄": "credit.system.message11",
  "扣除金額超過目前可用抵用金": "credit.system.message12",
  "可用抵用金已變更，請重新整理後再試一次": "credit.system.message13",
  "此訂單已有抵用金保留": "credit.system.message14",
  "可用抵用金不足": "credit.system.message15",
  "會員選擇使用抵用金": "credit.system.message16",
  "找不到抵用金保留紀錄": "credit.system.message17",
  "此抵用金保留紀錄已完成處理": "credit.system.message18",
  "抵用金來源紀錄遺失": "credit.system.message19",
  "抵用金是否可折抵運費尚待 Owner 決定": "credit.system.message20",
  "本次沒有可使用的抵用金，訂單仍以原應付金額成立。": "credit.system.message21",
  "抵用金保留已結束，訂單仍以原應付金額成立。": "credit.system.message22",
  "抵用金金額不正確": "credit.system.message23",
  "請先登入會員才能使用抵用金": "credit.system.message24",
  "訂單已成立，但抵用金暫時無法套用。": "credit.system.message25",
  "無法計算抵用金": "credit.system.message26"
};
