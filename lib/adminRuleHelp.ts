import type { MembershipBusinessRules } from "./membershipRuleTypes";

export type AdminRuleHelpDefinition = {
  ruleKey: string;
  title: string;
  summary: string;
  runtimeBehavior: string;
  evaluationTiming: string;
  example: string;
  edgeCases: string[];
  relatedRules: string[];
  historicalImpact: string;
  ownerRecommendation: string;
  runtimeRuleKey: string;
  runtimeSource?: string;
  evaluatedBy?: string;
};

type Seed = Pick<AdminRuleHelpDefinition, "ruleKey" | "title" | "summary" | "runtimeBehavior" | "evaluationTiming"> & Partial<AdminRuleHelpDefinition>;

function define(seed: Seed): AdminRuleHelpDefinition {
  return {
    example: `例如調整「${seed.title}」後，系統會在下一次符合判斷時使用新值。`,
    edgeCases: ["尚未鎖定的新流程會使用目前版本；已保存 snapshot 的資料以原 snapshot 為準。"],
    relatedRules: [],
    historicalImpact: "不回寫已完成的歷史交易；是否影響已排程資料，依此規則的判斷時間點而定。",
    ownerRecommendation: "只有在營運政策確定後調整，儲存前先查看影響預覽。",
    runtimeRuleKey: seed.ruleKey,
    ...seed,
  };
}

const fulfillmentTiming = "建立或更新配送期次、訂單或物流事件時判斷。";
const rewardCreationTiming = "可信任的成功取貨事件建立推薦 reward 時判斷。";
const notificationTiming = "對應營運事件建立通知佇列項目時判斷。";

export const adminRuleHelpDefinitions: AdminRuleHelpDefinition[] = [
  define({ ruleKey: "membership.openingYearFreeShipping.enabled", title: "開站首年會員免運", summary: "控制符合活動期間及配送方式的會員訂單是否免運。", runtimeBehavior: "結帳時同時檢查會員資格、活動日期及允許的配送方式。", evaluationTiming: "每次伺服器計算結帳價格時。", relatedRules: ["membership.openingYearFreeShipping.startDate", "membership.openingYearFreeShipping.endDate", "membership.openingYearFreeShipping.shippingMethods"] }),
  define({ ruleKey: "membership.openingYearFreeShipping.startDate", title: "會員免運開始日", summary: "會員免運活動開始的台北日期。", runtimeBehavior: "早於此日期的訂單不適用活動免運。", evaluationTiming: "結帳價格建立時。" }),
  define({ ruleKey: "membership.openingYearFreeShipping.endDate", title: "會員免運結束日", summary: "會員免運活動最後適用的台北日期。", runtimeBehavior: "晚於此日期的訂單不適用活動免運。", evaluationTiming: "結帳價格建立時。" }),
  define({ ruleKey: "membership.openingYearFreeShipping.shippingMethods", title: "會員免運配送方式", summary: "限制會員免運可套用的配送方式。", runtimeBehavior: "只有列入清單的結帳配送方式可獲得此免運。", evaluationTiming: "結帳價格建立時。" }),
  define({ ruleKey: "shipping.subscriptionFreeShipping", title: "定期購不限金額免運", summary: "控制定期購訂單是否免運。", runtimeBehavior: "啟用時定期購運費為零；關閉時使用設定的定期購運費。", evaluationTiming: "定期購訂單計價時。", relatedRules: ["shipping.subscriptionShippingFee"] }),
  define({ ruleKey: "shipping.subscriptionShippingFee", title: "未免運時的定期購運費", summary: "定期購未套用免運時收取的運費。", runtimeBehavior: "只有定期購免運關閉或不適用時才加入總額。", evaluationTiming: "定期購訂單計價時。" }),
  define({ ruleKey: "subscription.discountPercent", title: "定期購折扣", summary: "定期購商品相對原價的折扣百分比。", runtimeBehavior: "伺服器依活動價格政策選出價格後計算定期購價格。", evaluationTiming: "期次與訂單價格 snapshot 建立時。", historicalImpact: "已鎖定期次及既有訂單不重算；新期次使用新版本。" }),
  define({ ruleKey: "subscription.modificationCutoffDays", title: "修改期限", summary: "配送日前幾個台北曆日停止會員修改。", runtimeBehavior: "系統由 planned date 倒推截止日期，截止後拒絕一般會員修改。", evaluationTiming: fulfillmentTiming, relatedRules: ["subscription.orderCreationLeadDays"] }),
  define({ ruleKey: "subscription.orderCreationLeadDays", title: "建立訂單提前天數", summary: "配送日前幾天建立正式定期購訂單。", runtimeBehavior: "排程器由配送日期倒推訂單建立日；不得比修改截止更早。", evaluationTiming: fulfillmentTiming, relatedRules: ["subscription.modificationCutoffDays"] }),
  define({ ruleKey: "subscription.preparationLeadDays", title: "定期購一般備貨天數", summary: "一般定期購商品需要的最低準備天數。", runtimeBehavior: "日期可用性 resolver 會排除準備時間不足的日期。", evaluationTiming: "顯示及驗證配送日期時。" }),
  define({ ruleKey: "subscription.customRoastPreparationLeadDays", title: "定期購客製烘焙備貨天數", summary: "含客製烘焙商品時需要的最低準備天數。", runtimeBehavior: "客製烘焙期次使用較長的準備時間。", evaluationTiming: "顯示及驗證配送日期時。" }),
  define({ ruleKey: "subscription.delayQuickOptionsDays", title: "延後快捷範圍", summary: "會員可快速選擇的延後天數。", runtimeBehavior: "只決定快捷選項；最終日期仍由伺服器日期規則驗證。", evaluationTiming: "會員編輯下一期時。" }),
  define({ ruleKey: "subscription.advanceQuickOptionsDays", title: "提前快捷範圍", summary: "會員可快速選擇的提前天數。", runtimeBehavior: "只決定快捷選項；最終日期仍受備貨與截止日限制。", evaluationTiming: "會員編輯下一期時。" }),
  define({ ruleKey: "subscription.uncollectedTerminationCount", title: "未取貨停止門檻", summary: "累積幾次未取貨後終止定期購。", runtimeBehavior: "可信任未取貨結果累積達門檻時終止 subscription。", evaluationTiming: "物流結果確認為未取貨時。" }),
  define({ ruleKey: "subscription.maxModificationsPerCycle", title: "每期最多修改", summary: "限制會員在同一期次可修改的次數；空值代表不限。", runtimeBehavior: "每次會員修改前比較期次修改計數。", evaluationTiming: "提交期次修改時。" }),
  define({ ruleKey: "subscription.intervalOptions", title: "快捷配送週期", summary: "控制可直接選用的配送週期天數。", runtimeBehavior: "啟用項目由 production cycle resolver 接受；停用項目只有在也符合自訂範圍時才可能接受。", evaluationTiming: "建立、恢復或結帳建立定期購時。", runtimeSource: "lib/membershipPolicies.ts", evaluatedBy: "subscription interval resolver" }),
  define({ ruleKey: "subscription.customCycleEnabled", title: "開放會員自訂週期", summary: "控制快捷週期以外的整數天數是否可用。", runtimeBehavior: "關閉時只接受已啟用快捷值；開啟時也接受上下限內整數。", evaluationTiming: "建立、恢復或結帳建立定期購時。", relatedRules: ["subscription.customCycleMinDays", "subscription.customCycleMaxDays"], runtimeSource: "lib/membershipPolicies.ts", evaluatedBy: "subscription interval resolver" }),
  define({ ruleKey: "subscription.customCycleMinDays", title: "自訂週期最小值", summary: "可接受自訂週期的最小整數天數。", runtimeBehavior: "低於此值的非快捷週期由伺服器拒絕。", evaluationTiming: "解析配送週期時。", relatedRules: ["subscription.customCycleEnabled", "subscription.customCycleMaxDays"] }),
  define({ ruleKey: "subscription.customCycleMaxDays", title: "自訂週期最大值", summary: "可接受自訂週期的最大整數天數。", runtimeBehavior: "高於此值的非快捷週期由伺服器拒絕。", evaluationTiming: "解析配送週期時。", relatedRules: ["subscription.customCycleEnabled", "subscription.customCycleMinDays"] }),
  define({ ruleKey: "subscription.allowOtherSubscriptionProducts", title: "可換其他定期購作品", summary: "控制會員能否把下一期換成其他可訂閱作品。", runtimeBehavior: "期次修改 resolver 依此允許或拒絕跨作品替換。", evaluationTiming: "提交下一期商品修改時。" }),
  define({ ruleKey: "subscription.allowHalfToOnePound", title: "半磅可改一磅", summary: "允許半磅組合改為一磅規格。", runtimeBehavior: "期次商品結構驗證時套用。", evaluationTiming: "提交下一期商品修改時。" }),
  define({ ruleKey: "subscription.allowOneToHalfPound", title: "一磅可改半磅", summary: "允許一磅組合改為半磅規格。", runtimeBehavior: "期次商品結構驗證時套用。", evaluationTiming: "提交下一期商品修改時。" }),
  define({ ruleKey: "subscription.allowMixedOnePound", title: "一磅可混搭", summary: "允許一磅由相同或不同半磅作品組成。", runtimeBehavior: "一磅組合內容驗證時套用。", evaluationTiming: "提交下一期商品修改時。" }),
  define({ ruleKey: "subscription.allowQuantityChange", title: "可修改數量", summary: "控制會員能否改變期次商品數量。", runtimeBehavior: "關閉時期次修改 resolver 保留既有數量。", evaluationTiming: "提交下一期商品修改時。" }),
  define({ ruleKey: "subscription.datePickerMode", title: "會員選配送日期方式", summary: "控制會員中心顯示快捷建議、日曆或兩者。", runtimeBehavior: "影響選日期介面；送出日期仍經伺服器可用性驗證。", evaluationTiming: "呈現及提交配送日期時。" }),
  define({ ruleKey: "subscription.pauseResumeAnchorPolicy", title: "暫停後恢復配送日期", summary: "決定恢復定期購時如何建立新週期基準。", runtimeBehavior: "恢復 resolver 依選項沿用、重算或要求會員選擇新基準。", evaluationTiming: "恢復 subscription 時。" }),
  define({ ruleKey: "pickup.preparationLeadDays", title: "一般自取準備天數", summary: "工作室一般商品可選自取日的最低準備天數。", runtimeBehavior: "日期 resolver 排除準備不足或被封鎖日期。", evaluationTiming: "顯示與驗證自取日期時。" }),
  define({ ruleKey: "pickup.customRoastPreparationLeadDays", title: "客製烘焙自取準備天數", summary: "客製烘焙訂單需要的最低自取準備天數。", runtimeBehavior: "含客製烘焙時採用此較長天數。", evaluationTiming: "顯示與驗證自取日期時。" }),
  define({ ruleKey: "pickup.blockedDates", title: "封鎖自取日期", summary: "指定不可選擇的台北日期。", runtimeBehavior: "前端不顯示且伺服器也拒絕被封鎖日期。", evaluationTiming: "顯示與驗證自取日期時。" }),
  define({ ruleKey: "pickup.datePickerMode", title: "自取日期模式", summary: "決定只顯示日曆或同時顯示系統建議。", runtimeBehavior: "影響選日期介面，最終仍由伺服器驗證。", evaluationTiming: "呈現自取日期選擇器時。" }),
  define({ ruleKey: "referral.programEnabled", title: "啟用推薦制度", summary: "控制成功取貨是否建立新的推薦獎勵。", runtimeBehavior: "關閉後新事件不建立 reward；既有 scheduled reward 仍由 scheduler 處理。", evaluationTiming: rewardCreationTiming, historicalImpact: "不刪除既有關係、reward 或 ledger。" }),
  define({ ruleKey: "referral.referralMaxRewardDepth", title: "最大推薦代數", summary: "限制一次訂單最多向上計算幾代。", runtimeBehavior: "從下單會員最近推薦人開始，最多走訪此代數且硬上限十代。", evaluationTiming: rewardCreationTiming, historicalImpact: "已建立 reward 保留 ancestry snapshot；只影響新 reward。", runtimeSource: "lib/membershipCommerce.ts", evaluatedBy: "referral ancestry resolver" }),
  define({ ruleKey: "referral.referralRewardCalculationMode", title: "Reward calculation mode", summary: "選擇以商品實付金額或 effective PV 計算。", runtimeBehavior: "實付模式以商品小計扣已使用抵用金且不含運費；PV 模式以折扣後 effective PV 計算。", evaluationTiming: rewardCreationTiming, historicalImpact: "reward 保存 calculation mode、金額與 PV snapshot，舊資料不重算。", runtimeSource: "lib/membershipCommerce.ts", evaluatedBy: "multi-generation reward resolver" }),
  define({ ruleKey: "referral.referrerEligibility", title: "舊版推薦人資格相容欄位", summary: "保留舊資料可讀性，不再控制 Phase I.3B canonical multi-generation reward。", runtimeBehavior: "只有缺少 qualification metadata 的歷史 reward 仍沿用舊版 release 相容判斷；新 reward 一律使用領取資格期限 snapshot。", evaluationTiming: "讀取舊版 reward 時。", historicalImpact: "不批次改寫舊 reward；新流程不再要求 active subscription。", ownerRecommendation: "請使用「推薦獎勵領取資格期限」管理新制度。", runtimeSource: "lib/membershipCommerce.ts", evaluatedBy: "legacy reward compatibility" }),
  define({ ruleKey: "referral.referralRewardQualificationWindowDays", title: "推薦獎勵領取資格期限", summary: "推薦獎勵產生後，推薦人可透過自己的有效消費取得領獎資格的台北曆日數。", runtimeBehavior: "每筆 reward 建立時保存 N 天、起算時間與到期日。推薦人須在期限內建立一般或定期購訂單；判斷看下單時間，不是成功取貨時間。訂單仍須最後成功成交且沒有取消、未取、退款或退貨。", evaluationTiming: "reward 建立時保存期限；推薦人訂單建立與可信任 fulfillment outcome 發生時更新 qualification。", example: "8/1 產生 reward，期限 30 天：8/30 下單、9/3 成功取貨仍符合；8/31 才下單則不能解鎖。", edgeCases: ["期限內訂單失敗且期限未過，可用另一筆期限內訂單再嘗試。", "期限內訂單到期時尚未完成，不會直接逾期；等待該訂單最終結果。", "一般購買與定期購都可以，不要求 active subscription。"], relatedRules: ["referral.referralRewardBaseWaitingDays", "referral.referralRewardReturnProtectionDays"], historicalImpact: "N 天保存在 reward snapshot；Owner 後續修改只影響新 reward。", ownerRecommendation: "資格期限與獎勵發放等待天數用途不同，請分別評估。", runtimeSource: "lib/membershipCommerce.ts", evaluatedBy: "referral qualification state machine" }),
  define({ ruleKey: "referral.referralRewardBaseWaitingDays", title: "推薦獎勵基礎等待天數", summary: "推薦人的 qualification order 成功取貨後，系統先等待的基礎台北曆日數。", runtimeBehavior: "基礎等待與退貨保護天數相加後得到總等待；以 Asia/Taipei 日期計算，不看成功取貨的時、分、秒。符合日期後由 scheduler 下一次執行發放。", evaluationTiming: "reward 建立時 snapshot；qualification order 可信任成功取貨時計算可發放日期。", example: "8/1 15:30 成功取貨，基礎等待 7 天、退貨保護 3 天，8/11 起符合發放日期，不需等到 08:00 或 15:30。", edgeCases: ["可設為 0 天。", "scheduler 不保證在符合日期 00:00 立即執行。"], relatedRules: ["referral.referralRewardReturnProtectionDays"], historicalImpact: "只影響新建立的 reward；既有 reward 使用建立時 snapshot。", runtimeSource: "lib/membershipCommerce.ts", evaluatedBy: "reward release business-date scheduler" }),
  define({ ruleKey: "referral.referralRewardReturnProtectionDays", title: "推薦獎勵退貨保護天數", summary: "避免 qualification order 成功取貨後，仍在退款／退貨風險期間就過早發放。", runtimeBehavior: "與基礎等待天數相加，計算 release eligible date。系統只比較 Asia/Taipei 日期，不比較時間。", evaluationTiming: "reward 建立時 snapshot；qualification order 可信任成功取貨時計算可發放日期。", example: "基礎 7 天 + 退貨保護 3 天 = 總等待 10 天；8/1 成功取貨則 8/11 起符合。", edgeCases: ["可設為 0 天。", "release 前的可信任退款、退貨、取消或未取仍會阻止發放。"], relatedRules: ["referral.referralRewardBaseWaitingDays", "referral.reversalPolicy"], historicalImpact: "只影響新建立的 reward；既有 reward 使用建立時 snapshot。", runtimeSource: "lib/membershipCommerce.ts", evaluatedBy: "reward release business-date scheduler" }),
  define({ ruleKey: "referral.referralTotalRewardCap", title: "組織總獎勵上限", summary: "限制一筆訂單整條推薦鏈的總 reward。", runtimeBehavior: "按實付商品基礎或 PV 換算基礎算百分比上限，再由最近代往遠代配置。", evaluationTiming: rewardCreationTiming, example: "可用上限 NT$60 時，先配置第一代，再依剩餘金額配置第二代，直到用完。", historicalImpact: "只影響新 reward；既有金額 snapshot 不變。", runtimeSource: "lib/membershipCommerce.ts", evaluatedBy: "nearest-first cap allocator" }),
  define({ ruleKey: "referral.referralMonthlyCreditCap", title: "單一推薦人月上限", summary: "限制一名受益人在 reward 建立月份可占用的推薦抵用金。", runtimeBehavior: "scheduled 與 released 都占用；cancelled 與 reversed 不占用。0 表示不限，剩餘不足時截短新 reward。", evaluationTiming: rewardCreationTiming, example: "月上限 100、已占用 90、新 reward 30 時，只建立 10。", historicalImpact: "只在新 reward 建立時計算，不重截既有 reward。", runtimeSource: "lib/membershipCommerce.ts", evaluatedBy: "monthly cap allocator" }),
  define({ ruleKey: "referral.pvRewardMoneyValue", title: "PV reward conversion", summary: "將 reward PV 換算成多少 TWD 抵用金。", runtimeBehavior: "reward PV 乘此值後依金額 rounding 取整數。", evaluationTiming: rewardCreationTiming, historicalImpact: "每筆 reward 保存換算率 snapshot；修改不重算舊資料。" }),
  define({ ruleKey: "referral.showProductPV", title: "商品是否顯示 PV", summary: "只控制商品頁是否向會員展示 PV。", runtimeBehavior: "關閉不停止 PV snapshot 或後台 PV reward 計算。", evaluationTiming: "商品頁伺服器呈現時。" }),
  define({ ruleKey: "referral.reversalPolicy", title: "Referral reversal policy", summary: "決定退款或退貨是否沖回已發放推薦獎勵。", runtimeBehavior: "scheduled 一律取消；完整沖回模式會對 released reward 加一筆負數 ledger，僅取消 pending 模式不動 released reward。", evaluationTiming: "取消、退款或退貨 outcome 被處理時。", example: "已發放 NT$30 後退貨，完整沖回模式保留原 +30 並新增 -30。", historicalImpact: "目前使用退款當下的有效規則，因此修改可能影響已發放歷史 reward 的後續退貨處理。", runtimeSource: "lib/membershipCommerce.ts", evaluatedBy: "reward cancellation and reversal resolver" }),
  define({ ruleKey: "referral.levels.*.enabled", title: "各代啟用", summary: "控制指定推薦代數是否建立 reward。", runtimeBehavior: "停用的代數被跳過，不會把其比例轉給其他代。", evaluationTiming: rewardCreationTiming }),
  define({ ruleKey: "referral.levels.*.newReferralRewardRate", title: "各代新推薦比例", summary: "指定代數的新推薦 reward 比例。", runtimeBehavior: "乘上實付基礎或 effective PV，再受組織與月上限限制。", evaluationTiming: rewardCreationTiming, historicalImpact: "reward 保存比例 snapshot；只影響新 reward。" }),
  define({ ruleKey: "referral.levels.*.subscriptionRewardRate", title: "各代定期購比例", summary: "指定代數每次定期購成功取貨的 reward 比例。", runtimeBehavior: "每個不同期次可重新計算，但同一 outcome 冪等。", evaluationTiming: rewardCreationTiming, historicalImpact: "reward 保存比例 snapshot；只影響新 reward。" }),
  define({ ruleKey: "gift.startsAtFulfillment", title: "贈品起始成功取貨次數", summary: "第幾次符合條件的成功取貨開始送贈品。", runtimeBehavior: "成功取貨事件累積達門檻的當期建立 gift snapshot。", evaluationTiming: "期次生成及成功取貨進度更新時。" }),
  define({ ruleKey: "gift.repeatEveryFulfillments", title: "贈品重複間隔", summary: "開始送贈品後每隔幾次成功取貨再送。", runtimeBehavior: "依成功取貨計數與起始門檻計算里程碑。", evaluationTiming: "期次生成時。" }),
  define({ ruleKey: "gift.halfPoundQuantity", title: "半磅贈品數量", summary: "半磅訂閱達里程碑時加入的贈品包數。", runtimeBehavior: "寫入期次 gift snapshot，後續規則修改不回寫已鎖定期次。", evaluationTiming: "期次 gift snapshot 建立時。" }),
  define({ ruleKey: "gift.onePoundQuantity", title: "一磅贈品數量", summary: "一磅訂閱達里程碑時加入的贈品包數。", runtimeBehavior: "寫入期次 gift snapshot，後續規則修改不回寫已鎖定期次。", evaluationTiming: "期次 gift snapshot 建立時。" }),
  define({ ruleKey: "gift.pool", title: "贈品候選與替代順序", summary: "設定可用贈品及缺貨時的優先替代順序。", runtimeBehavior: "期次鎖定贈品時按啟用與 priority 尋找第一個可用項目。", evaluationTiming: "gift snapshot 建立時。" }),
  define({ ruleKey: "credit.expiryCalendarMonths", title: "抵用金有效期限", summary: "抵用金發放後可使用的台北曆月數。", runtimeBehavior: "由發放日期加曆月並處理月底，保存 expiresAt。", evaluationTiming: "抵用金 ledger entry 建立時。", historicalImpact: "舊 entry 保留原 expiresAt。" }),
  define({ ruleKey: "credit.expiryReminderDays", title: "抵用金到期提醒", summary: "抵用金到期前幾天建立提醒事件。", runtimeBehavior: "通知排程依 entry 到期日判斷。", evaluationTiming: notificationTiming }),
  define({ ruleKey: "credit.redemption", title: "每筆最高折抵", summary: "限制單筆訂單可用抵用金的方式與額度。", runtimeBehavior: "伺服器按固定上限、最低應付、百分比或不限模式計算 maximum。", evaluationTiming: "結帳預覽及建立 credit reservation 時。" }),
  define({ ruleKey: "credit.appliesToShipping", title: "抵用金是否可折運費", summary: "決定折抵基礎是否包含運費。", runtimeBehavior: "no 只以商品小計為上限；yes 可包含運費。", evaluationTiming: "結帳 credit maximum 計算時。" }),
  define({ ruleKey: "credit.uiMode", title: "會員使用抵用金方式", summary: "控制會員選擇指定金額、自動最大或只選是否使用。", runtimeBehavior: "影響前端輸入模式；伺服器仍以 redemption 規則限制。", evaluationTiming: "結帳介面呈現及送出時。" }),
  define({ ruleKey: "credit.allowZeroTotal", title: "允許零元訂單", summary: "決定抵用金是否可把應付總額降至零。", runtimeBehavior: "關閉時伺服器至少保留 NT$1 應付。", evaluationTiming: "結帳 credit maximum 計算時。" }),
  define({ ruleKey: "campaign.eligiblePricingMode", title: "活動與定期購價格", summary: "活動與定期購同時適用時如何選價格。", runtimeBehavior: "價格 resolver 按較優惠、取代、疊加或活動自訂模式選擇。", evaluationTiming: "商品與期次價格 snapshot 建立時。" }),
  define({ ruleKey: "money.roundingMode", title: "金額尾數處理", summary: "控制商品折扣、cap 與 reward credit 的整數取法。", runtimeBehavior: "依四捨五入、捨去或進位處理；未決模式會拒絕需要 rounding 的流程。", evaluationTiming: "每次相關金額 snapshot 建立時。", historicalImpact: "已建立的訂單與 reward 金額不重算。" }),
  define({ ruleKey: "notification.nextCycleReminderDays", title: "下一期提醒天數", summary: "下一期配送前幾天建立提醒。", runtimeBehavior: "通知 scheduler 以期次日期倒推。", evaluationTiming: notificationTiming }),
  define({ ruleKey: "notification.modificationCutoffReminderDays", title: "修改截止提醒天數", summary: "修改截止日前幾天建立提醒。", runtimeBehavior: "以期次已計算的 modification deadline 倒推。", evaluationTiming: notificationTiming }),
  define({ ruleKey: "notification.retryCount", title: "通知失敗重試次數", summary: "外部通知失敗後最多額外嘗試的次數。", runtimeBehavior: "通知建立時保存最大 attempts 為此值加首次投遞。", evaluationTiming: "通知 event 建立時。", historicalImpact: "既有通知保留建立時的 delivery policy。" }),
  define({ ruleKey: "notification.emailFallback", title: "LINE 失敗改寄 Email", summary: "LINE 無法投遞時是否允許可信 Email 備援。", runtimeBehavior: "只有有可信 Email 且投遞器判定 LINE 失敗時使用。", evaluationTiming: "通知 delivery 執行時。" }),
  define({ ruleKey: "notification.events.*.enabled", title: "個別通知事件", summary: "控制指定營運事件是否建立外部通知政策。", runtimeBehavior: "關閉時不建立該政策的外部通知；會員中心安全紀錄依事件流程保留。", evaluationTiming: notificationTiming }),
  define({ ruleKey: "fulfillment.arrivalReminderAfterDays", title: "到店後提醒天數", summary: "到店後幾天標示未取貨風險並提醒。", runtimeBehavior: "只建立風險／通知，不會自行確認未取貨。", evaluationTiming: "物流提醒排程執行時。" }),
  define({ ruleKey: "fulfillment.gmailScanLookbackDays", title: "Gmail 回看天數", summary: "每次 Gmail fulfillment 同步向前搜尋的日期範圍。", runtimeBehavior: "只限制讀取視窗；未知信件仍進人工審核。", evaluationTiming: "每次 Gmail 同步時。" }),
  define({ ruleKey: "ownerExceptions.canUnlockDate", title: "Owner 日期例外權限", summary: "允許 Owner 在安全狀態解除日期限制。", runtimeBehavior: "仍需管理員驗證並留下例外 audit，不開放一般會員。", evaluationTiming: "Owner 提交訂單例外修改時。" }),
  define({ ruleKey: "ownerExceptions.canUnlockStore", title: "Owner 門市例外權限", summary: "允許 Owner 在安全狀態調整取貨門市。", runtimeBehavior: "仍需管理員驗證並留下例外 audit。", evaluationTiming: "Owner 提交訂單例外修改時。" }),
  define({ ruleKey: "ownerExceptions.canUnlockQuantity", title: "Owner 數量例外權限", summary: "允許 Owner 在安全狀態調整已受限制的數量。", runtimeBehavior: "關閉時後台也不得使用此例外；開啟仍受狀態與 audit 保護。", evaluationTiming: "Owner 提交訂單例外修改時。" }),
];

const normalizedKey = (key: string) => key.replace(/\.levels\.\d+\./, ".levels.*.").replace(/\.events\.[^.]+\.enabled$/, ".events.*.enabled");

export function getAdminRuleHelpDefinition(ruleKey: string) {
  const normalized = normalizedKey(ruleKey);
  return adminRuleHelpDefinitions.find((item) => item.ruleKey === normalized);
}

function valueAtPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current == null || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, source);
}

export function resolveAdminRuleCurrentValue(ruleKey: string, rules: MembershipBusinessRules) {
  const value = valueAtPath(rules, ruleKey);
  if (value === undefined) return "依各項子設定";
  if (typeof value === "boolean") return value ? "啟用" : "停用";
  if (Array.isArray(value)) {
    if (!value.length) return "目前沒有項目";
    return value.map((item) => {
      if (!item || typeof item !== "object") return String(item);
      if ("days" in item) return `${String((item as { days: unknown }).days)} 天（${(item as { enabled?: boolean }).enabled === false ? "停用" : "啟用"}）`;
      if ("productId" in item) return `${String((item as { productId: unknown }).productId)}（順位 ${String((item as { priority?: unknown }).priority || "-")}）`;
      return "已設定";
    }).join("、");
  }
  const labels: Record<string, string> = { "active-subscription": "必須有啟用中的定期購", none: "不限制", paid_amount: "商品實付金額", pv: "PV 商品獎勵單位", "cancel-pending-and-reverse-released": "取消待發放並沖回已發放", "cancel-pending-only": "只取消待發放", "round-half-up": "四捨五入", "round-down": "無條件捨去", "round-up": "無條件進位", unlimited: "不限制", "maximum-fixed": "最高固定金額", "minimum-payable": "保留最低應付金額", "maximum-percentage": "最高商品金額比例", yes: "可以", no: "不可以" };
  if (typeof value === "object" && value !== null) {
    const mode = (value as { mode?: unknown }).mode;
    return mode ? labels[String(mode)] || "依目前選擇的營運模式" : "依目前細項設定";
  }
  return labels[String(value)] || String(value);
}

export const highRiskAdminRuleKeys = [
  "referral.referralRewardQualificationWindowDays",
  "referral.referralRewardBaseWaitingDays",
  "referral.referralRewardReturnProtectionDays",
  "referral.referralMonthlyCreditCap",
  "referral.referralTotalRewardCap",
  "subscription.customCycleEnabled",
  "subscription.customCycleMinDays",
  "subscription.customCycleMaxDays",
  "referral.referralRewardCalculationMode",
  "referral.reversalPolicy",
] as const;
