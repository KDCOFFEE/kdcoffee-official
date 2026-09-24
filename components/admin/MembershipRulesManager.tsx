"use client";

import { useMemo, useState } from "react";

import {
  OWNER_DECISION_REQUIRED,
  type MembershipBusinessRules,
} from "@/lib/membershipRuleTypes";
import { AdminRuleHelpButton, AdminRuleHelpProvider } from "./AdminRuleHelp";

type Props = {
  initialRevision: number;
  initialVersion: number;
  initialRules: MembershipBusinessRules;
  products: Array<{ id: string; name: string }>;
};

const fieldHelpKeys: Record<string, string> = {
  "未免運時的定期購運費": "shipping.subscriptionShippingFee", "定期購價格": "subscription.discountPercent", "修改期限": "subscription.modificationCutoffDays", "建立訂單": "subscription.orderCreationLeadDays", "一般備貨至少": "subscription.preparationLeadDays", "專屬烘焙至少": "subscription.customRoastPreparationLeadDays", "未取貨停止": "subscription.uncollectedTerminationCount", "每期最多修改": "subscription.maxModificationsPerCycle", "自訂最少": "subscription.customCycleMinDays", "自訂最多": "subscription.customCycleMaxDays", "會員選配送日期方式": "subscription.datePickerMode", "獎勵代數": "referral.referralMaxRewardDepth", "獎勵計算方式": "referral.referralRewardCalculationMode", "點數顯示名稱": "referral.pointDisplayName", "會員本人消費回饋": "referral.selfPurchaseRewardRate", "固定本人消費回饋（動態級距關閉時）": "referral.selfPurchaseRewardRate", "本人消費回饋起算": "referral.selfPurchaseEligibilityMode", "推薦獎勵領取資格期限": "referral.referralRewardQualificationWindowDays", "推薦獎勵基礎等待天數": "referral.referralRewardBaseWaitingDays", "推薦獎勵退貨保護天數": "referral.referralRewardReturnProtectionDays", "單筆全組織上限": "referral.referralTotalRewardCap", "單一會員每月上限": "referral.referralMonthlyCreditCap", "每 1 PV 換算": "referral.pvRewardMoneyValue", "一般商品最少備貨": "pickup.preparationLeadDays", "專屬烘焙最少備貨": "pickup.customRoastPreparationLeadDays", "自取日期選擇方式": "pickup.datePickerMode", "完成第幾次開始送": "gift.startsAtFulfillment", "開始後每隔": "gift.repeatEveryFulfillments", "半磅贈品": "gift.halfPoundQuantity", "一磅贈品": "gift.onePoundQuantity", "有效期限": "credit.expiryCalendarMonths", "到期前提醒": "credit.expiryReminderDays", "每筆最高折抵": "credit.redemption", "最高折抵": "credit.redemption", "每筆至少應付": "credit.redemption", "最高折抵商品金額": "credit.redemption", "抵用金是否可折運費": "credit.appliesToShipping", "會員使用抵用金方式": "credit.uiMode", "活動適用定期購時": "campaign.eligiblePricingMode", "暫停後恢復配送日期": "subscription.pauseResumeAnchorPolicy", "折扣金額有小數時": "money.roundingMode", "下一期前幾天提醒": "notification.nextCycleReminderDays", "修改截止前幾天提醒": "notification.modificationCutoffReminderDays", "通知失敗最多重試": "notification.retryCount", "到店後第幾天提醒": "fulfillment.arrivalReminderAfterDays", "Gmail 每次回看": "fulfillment.gmailScanLookbackDays",
};

function RuleFieldTitle({ label, ruleKey }: { label: string; ruleKey?: string }) {
  return <span className="rule-field-title"><span>{label}</span>{ruleKey ? <AdminRuleHelpButton ruleKey={ruleKey} /> : null}</span>;
}

function NumberField({ label, value, unit, min = 0, max = 999, onChange, helpKey }: { label: string; value: number; unit: string; min?: number; max?: number; onChange: (value: number) => void; helpKey?: string }) {
  return <label className="membership-number-field"><RuleFieldTitle label={label} ruleKey={helpKey || fieldHelpKeys[label]} /><span><input type="number" step="any" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /><b>{unit}</b></span></label>;
}

function Choice({ label, value, onChange, children, helpKey }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode; helpKey?: string }) {
  return <label className="membership-choice"><RuleFieldTitle label={label} ruleKey={helpKey || fieldHelpKeys[label]} /><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

function TextField({ label, value, onChange, placeholder, helpKey }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; helpKey?: string }) {
  return <label className="membership-text-field"><RuleFieldTitle label={label} ruleKey={helpKey || fieldHelpKeys[label]} /><input type="text" value={value} maxLength={24} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /><small>前台與會員中心共用此名稱；內部 PV 欄位維持不變。</small></label>;
}

export default function MembershipRulesManager({ initialRevision, initialVersion, initialRules, products }: Props) {
  const [rules, setRules] = useState(() => structuredClone(initialRules));
  const [savedRules, setSavedRules] = useState(() => structuredClone(initialRules));
  const [revision, setRevision] = useState(initialRevision);
  const [version, setVersion] = useState(initialVersion);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [giftProduct, setGiftProduct] = useState("");
  const [atmImageUploading, setAtmImageUploading] = useState(false);
  const [atmImageMessage, setAtmImageMessage] = useState("");
  const [impact, setImpact] = useState<{ affectedCycles: number; activeSubscriptions: number; lockedCyclesPreserved: number; changedAreas: string[]; missingPv?: Array<{productName:string;skuLabel:string}>; pvSwitchBlocked?: boolean } | null>(null);
  const dirty = useMemo(() => JSON.stringify(rules) !== JSON.stringify(savedRules), [rules, savedRules]);

  function change(mutator: (draft: MembershipBusinessRules) => void) {
    setRules((current) => {
      const next = structuredClone(current);
      mutator(next);
      return next;
    });
    setMessage("");
    setImpact(null);
  }

  async function previewImpact() {
    setMessage("");
    try {
      const response = await fetch("/api/admin/membership-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "無法預覽影響");
      setImpact(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法預覽影響");
    }
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/membership-rules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedRevision: revision, rules }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "儲存失敗");
      setRevision(result.revision);
      setVersion(result.version);
      setRules(structuredClone(result.rules));
      setSavedRules(structuredClone(result.rules));
      setMessage("設定已安全儲存。新設定只會套用到尚未鎖定的下一期。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function uploadAtmBankbook(file: File) {
    setAtmImageUploading(true);
    setAtmImageMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("assetGroup", "atm-bankbook");
      form.append("artworkSlug", "payment");
      form.append("assetType", "atm-bankbook");
      form.append("desiredName", "kdcoffee-atm-bankbook");
      const response = await fetch("/api/admin/homepage/upload", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok || !result.path) throw new Error(result.error || "存簿圖片上傳失敗");
      change((draft) => { draft.payment.atmTransfer.bankbookImageUrl = String(result.path); });
      setAtmImageMessage("圖片已上傳。請記得按『確認並儲存新設定』。 ");
    } catch (error) {
      setAtmImageMessage(error instanceof Error ? error.message : "存簿圖片上傳失敗");
    } finally {
      setAtmImageUploading(false);
    }
  }

  function addGiftProduct() {
    if (!giftProduct || rules.gift.pool.some((item) => item.productId === giftProduct)) return;
    change((draft) => draft.gift.pool.push({ productId: giftProduct, priority: draft.gift.pool.length + 1, enabled: true }));
    setGiftProduct("");
  }

  function removeGiftProduct(productId: string) {
    change((draft) => {
      draft.gift.pool = draft.gift.pool.filter((item) => item.productId !== productId).map((item, index) => ({ ...item, priority: index + 1 }));
    });
  }

  function moveGiftProduct(index: number, direction: -1 | 1) {
    change((draft) => {
      const target = index + direction;
      if (target < 0 || target >= draft.gift.pool.length) return;
      [draft.gift.pool[index], draft.gift.pool[target]] = [draft.gift.pool[target], draft.gift.pool[index]];
      draft.gift.pool = draft.gift.pool.map((item, order) => ({ ...item, priority: order + 1 }));
    });
  }

  const nameOf = (productId: string) => products.find((product) => product.id === productId)?.name || "已移除的作品";

  return <AdminRuleHelpProvider rules={rules}><div className="membership-rules-manager">
    <header className="membership-rules-header">
      <div><p className="eyebrow dark">會員商務規則</p><h1>會員與定期購設定</h1><p>集中管理會員免運、定期配送、續訂贈品、推薦獎勵與抵用金。</p></div>
      <div className="membership-save-box"><span className={dirty ? "is-dirty" : "is-saved"}>{dirty ? "有尚未儲存的修改" : "所有修改已儲存"}</span><button type="button" disabled={!dirty || saving} onClick={previewImpact}>先看影響範圍</button><button type="button" disabled={!dirty || saving || !impact} onClick={save}>{saving ? "儲存中…" : "確認並儲存新設定"}</button><small>目前設定版次 {version}</small></div>
    </header>

    <p className="membership-effective-note">新設定只會套用到尚未鎖定的下一期，不會修改已成立的訂單或已鎖定配送。</p>
    {message && <p className="membership-save-feedback" role="status">{message}</p>}
    {impact && <p className="membership-save-feedback" role="status">這次調整會影響 {impact.affectedCycles} 個尚未鎖定期次（{impact.activeSubscriptions} 個啟用中的定期購）；{impact.lockedCyclesPreserved} 個已鎖定／已成立期次與既有推薦獎勵維持原快照。{impact.pvSwitchBlocked ? ` 尚有 ${impact.missingPv?.length ?? 0} 個販售中 SKU 未設定 PV，目前不能切換。` : ""}</p>}

    <section className="membership-rule-card">
      <header><span>01</span><div><h2>配送費與定期購優惠</h2><p>集中管理一般配送費、定期購配送優惠與開站會員免運活動。</p></div></header>
      <div className="membership-fields two">
        <label className="membership-switch"><input type="checkbox" checked={rules.membership.openingYearFreeShipping.enabled} onChange={(event) => change((draft) => { draft.membership.openingYearFreeShipping.enabled = event.target.checked; })} /><span><b>開站首年會員免運</b><small>目前套用 7-ELEVEN 取貨</small></span><AdminRuleHelpButton ruleKey="membership.openingYearFreeShipping.enabled" /></label>


        <NumberField label="7-ELEVEN 一般運費" value={rules.shipping.sevenElevenShippingFee} min={0} max={10000} unit="元" onChange={(value) => change((draft) => { draft.shipping.sevenElevenShippingFee = value; })} />
        <NumberField label="宅配一般運費" value={rules.shipping.homeDeliveryShippingFee} min={0} max={10000} unit="元" onChange={(value) => change((draft) => { draft.shipping.homeDeliveryShippingFee = value; })} />
        <NumberField label="宅配貨到付款手續費" value={rules.shipping.homeDeliveryCodFee} min={0} max={50} unit="元／筆" onChange={(value) => change((draft) => { draft.shipping.homeDeliveryCodFee = value; })} />
        <p className="membership-effective-note">宅配貨到付款手續費每筆 NT$0–50，與運費分開計算；定期購配送費優惠不折抵此手續費。</p>
        <NumberField label="定期購配送費優惠" value={rules.shipping.subscriptionShippingDiscount} min={0} max={10000} unit="元" onChange={(value) => change((draft) => { draft.shipping.subscriptionShippingDiscount = value; })} />
        <div className="membership-rule-summary">
          <small>7-ELEVEN 定期購運費</small>
          <strong>
            NT$ {rules.shipping.sevenElevenShippingFee.toLocaleString("zh-TW")}
            {" − 優惠 NT$ "}
            {Math.min(rules.shipping.sevenElevenShippingFee, rules.shipping.subscriptionShippingDiscount).toLocaleString("zh-TW")}
            {" = NT$ "}
            {Math.max(0, rules.shipping.sevenElevenShippingFee - rules.shipping.subscriptionShippingDiscount).toLocaleString("zh-TW")}
          </strong>
        </div>
        <div className="membership-rule-summary">
          <small>宅配定期購運費</small>
          <strong>
            NT$ {rules.shipping.homeDeliveryShippingFee.toLocaleString("zh-TW")}
            {" − 優惠 NT$ "}
            {Math.min(rules.shipping.homeDeliveryShippingFee, rules.shipping.subscriptionShippingDiscount).toLocaleString("zh-TW")}
            {" = NT$ "}
            {Math.max(0, rules.shipping.homeDeliveryShippingFee - rules.shipping.subscriptionShippingDiscount).toLocaleString("zh-TW")}
          </strong>
        </div>

        <label><RuleFieldTitle label="活動開始日" ruleKey="membership.openingYearFreeShipping.startDate" /><input type="date" value={rules.membership.openingYearFreeShipping.startDate} onChange={(event) => change((draft) => { draft.membership.openingYearFreeShipping.startDate = event.target.value; })} /></label>
        <label><RuleFieldTitle label="活動結束日" ruleKey="membership.openingYearFreeShipping.endDate" /><input type="date" value={rules.membership.openingYearFreeShipping.endDate} onChange={(event) => change((draft) => { draft.membership.openingYearFreeShipping.endDate = event.target.value; })} /></label>
        <details>
          <summary>舊版相容設定</summary>
          <p className="membership-effective-note">
            以下設定目前保留給既有定期購與舊資料相容使用。新宅配配送費規則不使用這兩個欄位，暫時不要刪除。
          </p>
          <div className="membership-fields two">
            <label className="membership-switch"><input type="checkbox" checked={rules.shipping.subscriptionFreeShipping} onChange={(event) => change((draft) => { draft.shipping.subscriptionFreeShipping = event.target.checked; })} /><span><b>舊版：定期購不限金額免運</b><small>保留既有定期購相容邏輯</small></span><AdminRuleHelpButton ruleKey="shipping.subscriptionFreeShipping" /></label>
            <NumberField label="舊版：未免運時的定期購運費" value={rules.shipping.subscriptionShippingFee} min={0} max={10000} unit="元" onChange={(value) => change((draft) => { draft.shipping.subscriptionShippingFee = value; })} />
          </div>
        </details>
      </div>
    </section>

    <section className="membership-rule-card">
      <header><span>03A</span><div><h2>推廣零售獎金</h2><p>會員分享網站連結後，未登入會員的訪客在有效期間內完成購買，該筆訂單會列入分享會員的推廣零售業績，並依下方設定計算獎金。已登入會員的消費仍屬於會員自己的消費。</p></div></header>
      <div className="membership-fields two">
        <label className="membership-switch"><input type="checkbox" checked={rules.retailPromotion.enabled} onChange={(event) => change((draft) => { draft.retailPromotion.enabled = event.target.checked; })} /><span><b>啟用推廣零售獎金</b><small>關閉後不記錄新的訪客推廣訂單</small></span></label>
        <fieldset className="membership-choice-group">
          <legend>推廣零售獎金計算基礎</legend>
          <label><input type="radio" name="retail-promotion-calculation-basis" value="paid_amount" checked={rules.retailPromotion.calculationBasis === "paid_amount"} onChange={() => change((draft) => { draft.retailPromotion.calculationBasis = "paid_amount"; })} /><span><b>實付商品金額</b><small>以訪客訂單的有效商品實付金額計算</small></span></label>
          <label><input type="radio" name="retail-promotion-calculation-basis" value="pv" checked={rules.retailPromotion.calculationBasis === "pv"} onChange={() => change((draft) => { draft.retailPromotion.calculationBasis = "pv"; })} /><span><b>KD點（PV）</b><small>以訂單建立時保存的有效 KD點計算</small></span></label>
        </fieldset>
        <div className="membership-field-with-note">
          <NumberField label="推廣零售獎金比例" value={rules.retailPromotion.rewardRate} min={0} max={100} unit="%" onChange={(value) => change((draft) => { draft.retailPromotion.rewardRate = value; })} />
          <small>{rules.retailPromotion.calculationBasis === "pv" ? `依訪客訂單的有效 KD點（PV）× 此比例計算，再依每 1 KD點 = NT$ ${rules.referral.pvRewardMoneyValue.toLocaleString("zh-TW")} 的現有回饋規則換算抵用金。` : `依訪客有效商品實付金額 × 此比例計算推廣零售獎金。例如有效商品金額 NT$2,000、比例 ${rules.retailPromotion.rewardRate}%，依現有回饋規則計算。`}</small>
        </div>
        <div className="membership-field-with-note">
          <NumberField label="分享來源有效期間" value={rules.retailPromotion.attributionWindowDays} min={1} max={365} unit="天" onChange={(value) => change((draft) => { draft.retailPromotion.attributionWindowDays = value; })} />
          <small>訪客點擊會員分享連結後，在此期間內以訪客身分建立訂單，該筆訂單會保留該會員的推廣來源。訂單建立後，來源會固定，不受之後重新分享或登入狀態影響。</small>
        </div>
      </div>
      <p className="membership-inline-note">訂單建立時會固定保存計算基礎、有效業績、比例與規則版次；之後調整設定，不會回算既有訂單。</p>
    </section>

    <section className="membership-rule-card">
      <header><span>ATM</span><div><h2>ATM 轉帳設定</h2><p>設定宅配 ATM 付款時提供給客人的銀行資料與存簿圖片。</p></div></header>
      <div className="membership-fields two">
        <label className="membership-text-field"><span className="rule-field-title"><span>銀行名稱</span></span><input type="text" maxLength={80} value={rules.payment.atmTransfer.bankName} onChange={(event) => change((draft) => { draft.payment.atmTransfer.bankName = event.target.value; })} placeholder="例如：臺灣銀行" /></label>
        <label className="membership-text-field"><span className="rule-field-title"><span>銀行代碼</span></span><input type="text" maxLength={12} value={rules.payment.atmTransfer.bankCode} onChange={(event) => change((draft) => { draft.payment.atmTransfer.bankCode = event.target.value; })} placeholder="例如：004" /></label>
        <label className="membership-text-field"><span className="rule-field-title"><span>分行名稱（選填）</span></span><input type="text" maxLength={80} value={rules.payment.atmTransfer.branchName} onChange={(event) => change((draft) => { draft.payment.atmTransfer.branchName = event.target.value; })} /></label>
        <label className="membership-text-field"><span className="rule-field-title"><span>戶名</span></span><input type="text" maxLength={80} value={rules.payment.atmTransfer.accountName} onChange={(event) => change((draft) => { draft.payment.atmTransfer.accountName = event.target.value; })} /></label>
        <label className="membership-text-field"><span className="rule-field-title"><span>帳號</span></span><input type="text" maxLength={40} value={rules.payment.atmTransfer.accountNumber} onChange={(event) => change((draft) => { draft.payment.atmTransfer.accountNumber = event.target.value; })} /></label>
        <label className="membership-text-field"><span className="rule-field-title"><span>ATM 付款說明（選填）</span></span><textarea rows={3} maxLength={500} value={rules.payment.atmTransfer.instructions} onChange={(event) => change((draft) => { draft.payment.atmTransfer.instructions = event.target.value; })} placeholder="例如：轉帳後請保留交易明細，確認入帳後安排出貨。" /></label>
      </div>
      <fieldset className="membership-intervals">
        <legend>存簿／匯款資訊圖片</legend>
        {rules.payment.atmTransfer.bankbookImageUrl ? <div className="kd-media-upload-preview"><img src={rules.payment.atmTransfer.bankbookImageUrl} alt="ATM 存簿預覽" /></div> : <p className="membership-effective-note">目前尚未上傳存簿圖片。</p>}
        <div className="membership-interval-actions">
          <label className="text-link" style={{ cursor: atmImageUploading ? "wait" : "pointer" }}>
            {atmImageUploading ? "上傳中…" : rules.payment.atmTransfer.bankbookImageUrl ? "更換存簿圖片" : "上傳存簿圖片"}
            <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={atmImageUploading} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void uploadAtmBankbook(file); }} />
          </label>
          {rules.payment.atmTransfer.bankbookImageUrl ? <button type="button" onClick={() => change((draft) => { draft.payment.atmTransfer.bankbookImageUrl = null; draft.payment.atmTransfer.showBankbookImageAtCheckout = false; })}>移除圖片</button> : null}
        </div>
        {atmImageMessage ? <p className="membership-save-feedback" role="status">{atmImageMessage}</p> : null}
        <label className="membership-switch"><input type="checkbox" checked={rules.payment.atmTransfer.showBankbookImageAtCheckout} disabled={!rules.payment.atmTransfer.bankbookImageUrl} onChange={(event) => change((draft) => { draft.payment.atmTransfer.showBankbookImageAtCheckout = event.target.checked; })} /><span><b>結帳頁顯示存簿圖片</b><small>關閉時仍顯示銀行名稱、代碼、戶名與完整帳號，只隱藏圖片。</small></span></label>
      </fieldset>
      <p className="membership-effective-note">ATM 必填：銀行名稱、銀行代碼、戶名、帳號。未完整設定時，前台會禁止送出 ATM 訂單；客人仍可改選貨到付款。</p>
    </section>

    <section className="membership-rule-card">
      <header><span>02</span><div><h2>定期配送</h2><p>首筆原價訂單成功取貨後才啟動；第一次續訂才開始享定期購價格。</p></div></header>
      <div className="membership-fields four">
        <NumberField label="定期購價格" value={rules.subscription.discountPercent} min={1} max={100} unit="%" onChange={(value) => change((draft) => { draft.subscription.discountPercent = value; })} />
        <NumberField label="修改期限" value={rules.subscription.modificationCutoffDays} max={60} unit="天前" onChange={(value) => change((draft) => { draft.subscription.modificationCutoffDays = value; })} />
        <NumberField label="建立訂單" value={rules.subscription.orderCreationLeadDays} max={60} unit="天前" onChange={(value) => change((draft) => { draft.subscription.orderCreationLeadDays = value; })} />
        <NumberField label="一般備貨至少" value={rules.subscription.preparationLeadDays} max={60} unit="天" onChange={(value) => change((draft) => { draft.subscription.preparationLeadDays = value; if (draft.subscription.customRoastPreparationLeadDays < value) draft.subscription.customRoastPreparationLeadDays = value; })} />
        <NumberField label="專屬烘焙至少" value={rules.subscription.customRoastPreparationLeadDays} min={rules.subscription.preparationLeadDays} max={90} unit="天" onChange={(value) => change((draft) => { draft.subscription.customRoastPreparationLeadDays = value; })} />
        <NumberField label="未取貨停止" value={rules.subscription.uncollectedTerminationCount} min={1} max={10} unit="次" onChange={(value) => change((draft) => { draft.subscription.uncollectedTerminationCount = value; })} />
        <NumberField label="每期最多修改" value={rules.subscription.maxModificationsPerCycle ?? 99} min={0} max={99} unit={rules.subscription.maxModificationsPerCycle === null ? "不限" : "次"} onChange={(value) => change((draft) => { draft.subscription.maxModificationsPerCycle = value === 99 ? null : value; })} />
      </div>
      <fieldset className="membership-intervals"><legend>快捷配送週期 <AdminRuleHelpButton ruleKey="subscription.intervalOptions" /></legend>{rules.subscription.intervalOptions.map((option, index) => <label key={`${option.days}:${index}`}><input type="checkbox" checked={option.enabled} onChange={(event) => change((draft) => { draft.subscription.intervalOptions[index].enabled = event.target.checked; draft.subscription.intervalsDays = draft.subscription.intervalOptions.filter((item) => item.enabled).map((item) => item.days); })} />每 <input aria-label={`快捷週期 ${index + 1}`} type="number" min={1} max={365} value={option.days} onChange={(event) => change((draft) => { draft.subscription.intervalOptions[index].days = Number(event.target.value); draft.subscription.intervalsDays = draft.subscription.intervalOptions.filter((item) => item.enabled).map((item) => item.days); })} /> 天</label>)}<div className="membership-interval-actions">
  <button
    type="button"
    onClick={() =>
      change((draft) => {
        if (
          draft.subscription.intervalOptions.some(
            (option) => option.days === 15,
          )
        ) {
          return;
        }

        draft.subscription.intervalOptions.push({
          days: 15,
          enabled: true,
        });

        draft.subscription.intervalOptions.sort(
          (a, b) => a.days - b.days,
        );

        draft.subscription.intervalsDays =
          draft.subscription.intervalOptions
            .filter((item) => item.enabled)
            .map((item) => item.days);
      })
    }
    disabled={rules.subscription.intervalOptions.some(
      (option) => option.days === 15,
    )}
  >
    {rules.subscription.intervalOptions.some(
      (option) => option.days === 15,
    )
      ? "已加入每 15 天"
      : "＋ 新增每 15 天"}
  </button>
</div></fieldset>
      <div className="membership-fields three"><label className="membership-switch"><input type="checkbox" checked={rules.subscription.customCycleEnabled} onChange={(event) => change((draft) => { draft.subscription.customCycleEnabled = event.target.checked; })} /><span><b>開放會員自訂週期</b><small>API 也會依上下限重新驗證</small></span><AdminRuleHelpButton ruleKey="subscription.customCycleEnabled" /></label><NumberField label="自訂最少" value={rules.subscription.customCycleMinDays} min={1} max={365} unit="天" onChange={(value) => change((draft) => { draft.subscription.customCycleMinDays = value; })} /><NumberField label="自訂最多" value={rules.subscription.customCycleMaxDays} min={1} max={365} unit="天" onChange={(value) => change((draft) => { draft.subscription.customCycleMaxDays = value; })} /></div>
      <div className="membership-checks"><label><input type="checkbox" checked={rules.subscription.allowOtherSubscriptionProducts} onChange={(event) => change((draft) => { draft.subscription.allowOtherSubscriptionProducts = event.target.checked; })} />可換其他定期購作品 <AdminRuleHelpButton ruleKey="subscription.allowOtherSubscriptionProducts" /></label><label><input type="checkbox" checked={rules.subscription.allowHalfToOnePound} onChange={(event) => change((draft) => { draft.subscription.allowHalfToOnePound = event.target.checked; })} />半磅可改一磅 <AdminRuleHelpButton ruleKey="subscription.allowHalfToOnePound" /></label><label><input type="checkbox" checked={rules.subscription.allowOneToHalfPound} onChange={(event) => change((draft) => { draft.subscription.allowOneToHalfPound = event.target.checked; })} />一磅可改半磅 <AdminRuleHelpButton ruleKey="subscription.allowOneToHalfPound" /></label><label><input type="checkbox" checked={rules.subscription.allowMixedOnePound} onChange={(event) => change((draft) => { draft.subscription.allowMixedOnePound = event.target.checked; })} />一磅可 A+A 或 A+B <AdminRuleHelpButton ruleKey="subscription.allowMixedOnePound" /></label><label><input type="checkbox" checked={rules.subscription.allowQuantityChange} onChange={(event) => change((draft) => { draft.subscription.allowQuantityChange = event.target.checked; })} />可修改數量 <AdminRuleHelpButton ruleKey="subscription.allowQuantityChange" /></label></div>
      <div className="membership-fields two"><Choice label="會員選配送日期方式" value={rules.subscription.datePickerMode} onChange={(value) => change((draft) => { draft.subscription.datePickerMode = value as MembershipBusinessRules["subscription"]["datePickerMode"]; })}><option value="quick-and-calendar">快捷按鈕＋日曆</option><option value="calendar-only">只顯示日曆</option><option value="suggestion-and-calendar">系統建議＋日曆</option></Choice></div>
    </section>

    <section className="membership-rule-card">
      <header><span>03</span><div><h2>推薦制度與工作室自取</h2><p>管理多代推薦、點數／實付金額獎勵，以及工作室自取日期；前台與伺服器共用同一套版本化規則。</p></div></header>
      <div className="membership-fields two">
        <label className="membership-switch"><input type="checkbox" checked={rules.referral.programEnabled} onChange={(event) => change((draft) => { draft.referral.programEnabled = event.target.checked; })} /><span><b>啟用推薦制度</b><small>關閉後不建立新的獎勵資格</small></span><AdminRuleHelpButton ruleKey="referral.programEnabled" /></label>
        <label className="membership-switch"><input type="checkbox" checked={rules.referral.referralAttributionEnabled} onChange={(event) => change((draft) => { draft.referral.referralAttributionEnabled = event.target.checked; })} /><span><b>啟用推薦來源追蹤</b><small>會員第一次建立前，以最後一次有效推薦連結為準</small></span></label>
        <NumberField label="推薦瀏覽有效時間" value={rules.referral.referralAttributionSessionMinutes} min={5} max={1440} unit="分鐘" onChange={(value) => change((draft) => { draft.referral.referralAttributionSessionMinutes = value; })} />
        <NumberField label="獎勵代數" value={rules.referral.referralMaxRewardDepth} min={1} max={10} unit="代" onChange={(value) => change((draft) => { draft.referral.referralMaxRewardDepth = value; while (draft.referral.levels.length < value) { const level=draft.referral.levels.length+1; draft.referral.levels.push({level,enabled:true,newReferralRewardRate:0,repeatPurchaseRewardRate:0,subscriptionRewardRate:0}); } })} />
        <Choice label="獎勵計算方式" value={rules.referral.referralRewardCalculationMode} onChange={(value) => change((draft) => { draft.referral.referralRewardCalculationMode = value as "paid_amount"|"pv"; })}><option value="paid_amount">商品實付金額</option><option value="pv">{rules.referral.pointDisplayName || "KD點"} 商品獎勵單位</option></Choice>
        <TextField label="點數顯示名稱" value={rules.referral.pointDisplayName} placeholder="例如：KD點" onChange={(value) => change((draft) => { draft.referral.pointDisplayName = value; })} />
        <NumberField
          label="固定本人消費回饋（動態級距關閉時）"
          value={rules.referral.selfPurchaseRewardRate}
          min={0}
          max={100}
          unit="%"
          onChange={(value) =>
            change((draft) => {
              draft.referral.selfPurchaseRewardRate =
                value;
            })
          }
        />

        <Choice
          label="本人消費回饋起算"
          value={
            rules.referral
              .selfPurchaseEligibilityMode
          }
          onChange={(value) =>
            change((draft) => {
              draft.referral.selfPurchaseEligibilityMode =
                value as MembershipBusinessRules["referral"]["selfPurchaseEligibilityMode"];
            })
          }
        >
          <option value="first_completed_order">
            首筆完成訂單立即回饋
          </option>

          <option value="after_prior_valid_consumption">
            第二筆完成消費起回饋
          </option>
        </Choice>

        <label className="membership-switch">
          <input
            type="checkbox"
            checked={
              rules.referral
                .selfPurchaseRequiresReferralQualification
            }
            onChange={(event) =>
              change((draft) => {
                draft.referral
                  .selfPurchaseRequiresReferralQualification =
                  event.target.checked;
              })
            }
          />
          <span>
            <b>本人消費回饋需符合推薦獎勵領取資格</b>
            <small>
              未勾選時，本人消費回饋不受推薦獎勵資格門檻限制
            </small>
          </span>
          <AdminRuleHelpButton ruleKey="referral.selfPurchaseRequiresReferralQualification" />
        </label>
      </div>

      <fieldset className="membership-intervals self-purchase-tier-editor">
        <legend>本人消費動態回饋級距</legend>
        <p>
          開啟後，本人消費回饋不再只使用上方固定比例，而是依下列級距判定。
          級距判定基準與推薦獎勵領取資格互相獨立。
        </p>

        <label className="membership-switch self-purchase-tier-toggle">
          <input
            type="checkbox"
            checked={rules.referral.selfPurchaseRewardTiers.enabled}
            onChange={(event) =>
              change((draft) => {
                draft.referral.selfPurchaseRewardTiers.enabled =
                  event.target.checked;
              })
            }
          />
          <span>
            <b>啟用本人消費動態級距</b>
            <small>關閉時沿用上方固定本人消費回饋比例</small>
          </span>
          <AdminRuleHelpButton ruleKey="referral.selfPurchaseRewardTiers.enabled" />
        </label>

        <div className="membership-fields three">
          <Choice
            label="級距判定基準"
            helpKey="referral.selfPurchaseRewardTiers.thresholdBasis"
            value={rules.referral.selfPurchaseRewardTiers.thresholdBasis}
            onChange={(value) =>
              change((draft) => {
                draft.referral.selfPurchaseRewardTiers.thresholdBasis =
                  value as MembershipBusinessRules["referral"]["selfPurchaseRewardTiers"]["thresholdBasis"];
              })
            }
          >
            <option value="paid_amount">商品實付金額</option>
            <option value="pv">商品 {rules.referral.pointDisplayName || "KD點"}</option>
          </Choice>

          <Choice
            label="級距累積方式"
            helpKey="referral.selfPurchaseRewardTiers.accumulationBasis"
            value={rules.referral.selfPurchaseRewardTiers.accumulationBasis}
            onChange={(value) =>
              change((draft) => {
                draft.referral.selfPurchaseRewardTiers.accumulationBasis =
                  value as MembershipBusinessRules["referral"]["selfPurchaseRewardTiers"]["accumulationBasis"];
              })
            }
          >
            <option value="single_order">單筆訂單</option>
            <option value="rolling_period">期間累積</option>
          </Choice>

          <Choice
            label="回饋計算方式"
            helpKey="referral.selfPurchaseRewardTiers.calculationMethod"
            value={rules.referral.selfPurchaseRewardTiers.calculationMethod}
            onChange={(value) =>
              change((draft) => {
                draft.referral.selfPurchaseRewardTiers.calculationMethod =
                  value as MembershipBusinessRules["referral"]["selfPurchaseRewardTiers"]["calculationMethod"];
              })
            }
          >
            <option value="whole_order">整筆套用達成級距</option>
            <option value="marginal">各級距分段計算</option>
          </Choice>
        </div>

        {rules.referral.selfPurchaseRewardTiers.accumulationBasis ===
        "rolling_period" ? (
          <div className="membership-fields two">
            <NumberField
              label="累積期間"
              helpKey="referral.selfPurchaseRewardTiers.rollingWindowDays"
              value={rules.referral.selfPurchaseRewardTiers.rollingWindowDays}
              min={1}
              max={3650}
              unit="天"
              onChange={(value) =>
                change((draft) => {
                  draft.referral.selfPurchaseRewardTiers.rollingWindowDays =
                    value;
                })
              }
            />
          </div>
        ) : null}

        <div className="self-purchase-tier-explainer">
          <strong>目前設定：</strong>
          <span>
            {rules.referral.selfPurchaseRewardTiers.thresholdBasis === "pv"
              ? `以商品 ${rules.referral.pointDisplayName || "KD點"} 判定級距`
              : "以商品實付金額判定級距"}
            ；
            {rules.referral.selfPurchaseRewardTiers.accumulationBasis ===
            "rolling_period"
              ? `訂單完成時往前 ${rules.referral.selfPurchaseRewardTiers.rollingWindowDays} 天累積`
              : "每筆訂單獨立判定"}
            ；
            {rules.referral.selfPurchaseRewardTiers.calculationMethod ===
            "marginal"
              ? "各級距分段計算"
              : "整筆訂單套用達成的最高級距"}
            。
          </span>
        </div>

        <div className="self-purchase-tier-table" role="group" aria-label="本人消費回饋級距">
          <div className="self-purchase-tier-head" aria-hidden="true">
            <span>級距</span>
            <span>門檻</span>
            <span>回饋率</span>
            <span>操作</span>
          </div>

          {rules.referral.selfPurchaseRewardTiers.tiers.map((tier, index) => (
            <div className="self-purchase-tier-row" key={`self-purchase-tier-${index}`}>
              <strong>第 {index + 1} 級</strong>

              <label>
                <span className="sr-only">第 {index + 1} 級門檻</span>
                <input
                  type="number"
                  min={0}
                  max={100000000}
                  step="any"
                  value={tier.threshold}
                  disabled={index === 0}
                  onChange={(event) =>
                    change((draft) => {
                      draft.referral.selfPurchaseRewardTiers.tiers[index].threshold =
                        Number(event.target.value);
                    })
                  }
                />
                <b>
                  {rules.referral.selfPurchaseRewardTiers.thresholdBasis ===
                  "pv"
                    ? rules.referral.pointDisplayName || "KD點"
                    : "元"}
                </b>
              </label>

              <label>
                <span className="sr-only">第 {index + 1} 級回饋率</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  value={tier.rewardRate}
                  onChange={(event) =>
                    change((draft) => {
                      draft.referral.selfPurchaseRewardTiers.tiers[index].rewardRate =
                        Number(event.target.value);
                    })
                  }
                />
                <b>%</b>
              </label>

              <button
                type="button"
                className="self-purchase-tier-remove"
                disabled={index === 0 || rules.referral.selfPurchaseRewardTiers.tiers.length <= 1}
                onClick={() =>
                  change((draft) => {
                    draft.referral.selfPurchaseRewardTiers.tiers.splice(index, 1);
                  })
                }
              >
                刪除此級
              </button>
            </div>
          ))}
        </div>

        <div className="self-purchase-tier-actions">
          <button
            type="button"
            disabled={rules.referral.selfPurchaseRewardTiers.tiers.length >= 50}
            onClick={() =>
              change((draft) => {
                const tiers = draft.referral.selfPurchaseRewardTiers.tiers;
                const last = tiers.at(-1);
                tiers.push({
                  threshold: (last?.threshold ?? 0) + 100,
                  rewardRate: last?.rewardRate ?? draft.referral.selfPurchaseRewardRate,
                });
              })
            }
          >
            ＋ 新增回饋級距
          </button>
          <small>第一級門檻固定為 0；其餘門檻必須由小到大且不可重複。</small>
        </div>

        <p className="membership-inline-note">
          回饋金額的計算基準仍由上方「獎勵計算方式」控制：目前為
          {rules.referral.referralRewardCalculationMode === "pv"
            ? `${rules.referral.pointDisplayName || "KD點"} × 每 1 ${rules.referral.pointDisplayName || "KD點"} 換算金額`
            : "商品實付金額"}
          。這與「級距判定基準」是兩個獨立設定。
        </p>
      </fieldset>

      <p className="membership-inline-note">
        {rules.referral.selfPurchaseEligibilityMode ===
        "first_completed_order"
          ? rules.referral.selfPurchaseRewardTiers.enabled
            ? "會員第一筆成功完成的訂單即可依目前動態級距建立本人消費回饋。"
            : `會員第一筆成功完成的訂單即可依目前 ${rules.referral.selfPurchaseRewardRate}% 固定比例建立本人消費回饋。`
          : rules.referral.selfPurchaseRewardTiers.enabled
            ? "會員需先有一筆有效完成消費；之後成功完成的訂單才依目前動態級距建立本人消費回饋。"
            : `會員需先有一筆有效完成消費；之後成功完成的訂單才依目前 ${rules.referral.selfPurchaseRewardRate}% 固定比例建立本人消費回饋。`}
      </p>

      <p className="membership-inline-note">
        {rules.referral
          .selfPurchaseRequiresReferralQualification
          ? "目前本人消費回饋仍需符合下方「推薦獎勵領取資格」後，才會進入安全等待與正式入帳。"
          : "目前本人消費回饋不需要符合「推薦獎勵領取資格」；符合本人消費回饋起算條件且訂單完成後，即直接進入安全等待。"}
      </p>
      <fieldset className="membership-intervals">
        <legend>推薦獎勵領取資格</legend>
        <p>此區直接控制會員是否取得推薦獎勵領取資格；只改變資格判定，不會改變推薦比例、獎勵點數或既有入帳流程。</p>

        <h3>資格判定基準</h3>
        <div className="membership-fields two">
          <Choice
            label="資格判定基準"
            value={rules.referral.payoutQualification.qualificationBasis}
            onChange={(value) =>
              change((draft) => {
                draft.referral.payoutQualification.qualificationBasis =
                  value as MembershipBusinessRules["referral"]["payoutQualification"]["qualificationBasis"];
              })
            }
          >
            <option value="money">消費金額（元）</option>
            <option value="pv">商品 {rules.referral.pointDisplayName || "KD點"}</option>
          </Choice>

          <Choice
            label="資格判定模式"
            value={rules.referral.payoutQualification.mode}
            onChange={(value) =>
              change((draft) => {
                draft.referral.payoutQualification.mode =
                  value as MembershipBusinessRules["referral"]["payoutQualification"]["mode"];
              })
            }
          >
            <option value="general">只採一般會員資格</option>
            <option value="subscription">只採訂閱會員資格</option>
            <option value="either">任一資格符合即可</option>
            <option value="both">兩種資格都必須符合</option>
          </Choice>

          <Choice
            label="超額消費處理"
            value={rules.referral.payoutQualification.excessConsumptionMode}
            onChange={(value) =>
              change((draft) => {
                draft.referral.payoutQualification.excessConsumptionMode =
                  value as MembershipBusinessRules["referral"]["payoutQualification"]["excessConsumptionMode"];
              })
            }
          >
            <option value="reset">達標後歸零，不累計超額</option>
            <option value="carry">超額可延續至下一輪</option>
          </Choice>
        </div>

        <p className="membership-inline-note">
          {rules.referral.payoutQualification.qualificationBasis === "pv"
            ? `目前使用商品 ${rules.referral.pointDisplayName || "KD點"} 判定資格；商品售價高低不會直接決定是否合格。`
            : "目前使用有效消費金額判定資格。"}
        </p>

        <h3>一般會員資格</h3>
        <div className="membership-fields two">
          <NumberField
            label="一般會員累積期間"
            value={rules.referral.payoutQualification.generalMember.rollingWindowDays}
            min={1}
            max={3650}
            unit="天"
            onChange={(value) =>
              change((draft) => {
                draft.referral.payoutQualification.generalMember.rollingWindowDays = value;
              })
            }
          />

          {rules.referral.payoutQualification.qualificationBasis === "pv" ? (
            <NumberField
              label="一般會員商品 KD點門檻"
              value={rules.referral.payoutQualification.generalMember.cumulativeValidPVThreshold}
              min={0}
              max={100000000}
              unit={rules.referral.pointDisplayName || "KD點"}
              onChange={(value) =>
                change((draft) => {
                  draft.referral.payoutQualification.generalMember.cumulativeValidPVThreshold = value;
                })
              }
            />
          ) : (
            <NumberField
              label="一般會員有效消費門檻"
              value={rules.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold}
              min={0}
              max={100000000}
              unit="元"
              onChange={(value) =>
                change((draft) => {
                  draft.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold = value;
                })
              }
            />
          )}
        </div>

        <p>
          一般會員：最近 {rules.referral.payoutQualification.generalMember.rollingWindowDays} 天
          {rules.referral.payoutQualification.qualificationBasis === "pv"
            ? `累積商品 ${rules.referral.pointDisplayName || "KD點"} 達 ${rules.referral.payoutQualification.generalMember.cumulativeValidPVThreshold.toLocaleString("zh-TW")}。`
            : `累積有效消費達 NT$ ${rules.referral.payoutQualification.generalMember.cumulativeValidConsumptionThreshold.toLocaleString("zh-TW")}。`}
        </p>

        <h3>訂閱會員資格</h3>
        <div className="membership-fields two">
          <NumberField
            label="訂閱會員累積期間"
            value={rules.referral.payoutQualification.activeSubscriptionMember.rollingWindowDays}
            min={1}
            max={3650}
            unit="天"
            onChange={(value) =>
              change((draft) => {
                draft.referral.payoutQualification.activeSubscriptionMember.rollingWindowDays = value;
              })
            }
          />

          {rules.referral.payoutQualification.qualificationBasis === "pv" ? (
            <NumberField
              label="訂閱會員商品 KD點門檻"
              value={rules.referral.payoutQualification.activeSubscriptionMember.cumulativeValidPVThreshold}
              min={0}
              max={100000000}
              unit={rules.referral.pointDisplayName || "KD點"}
              onChange={(value) =>
                change((draft) => {
                  draft.referral.payoutQualification.activeSubscriptionMember.cumulativeValidPVThreshold = value;
                })
              }
            />
          ) : (
            <NumberField
              label="訂閱會員有效消費門檻"
              value={rules.referral.payoutQualification.activeSubscriptionMember.cumulativeValidConsumptionThreshold}
              min={0}
              max={100000000}
              unit="元"
              onChange={(value) =>
                change((draft) => {
                  draft.referral.payoutQualification.activeSubscriptionMember.cumulativeValidConsumptionThreshold = value;
                })
              }
            />
          )}
        </div>

        <p>
          訂閱會員：須為有效訂閱會員，最近 {rules.referral.payoutQualification.activeSubscriptionMember.rollingWindowDays} 天
          {rules.referral.payoutQualification.qualificationBasis === "pv"
            ? `累積商品 ${rules.referral.pointDisplayName || "KD點"} 達 ${rules.referral.payoutQualification.activeSubscriptionMember.cumulativeValidPVThreshold.toLocaleString("zh-TW")}。`
            : `累積有效消費達 NT$ ${rules.referral.payoutQualification.activeSubscriptionMember.cumulativeValidConsumptionThreshold.toLocaleString("zh-TW")}。`}
        </p>

        <h3>有效消費計算</h3>

        {rules.referral.payoutQualification.qualificationBasis === "money" ? (
          <div className="membership-checks">
            <label>
              <input
                type="checkbox"
                checked={rules.referral.payoutQualification.validConsumption.includeCreditDiscount}
                onChange={(event) =>
                  change((draft) => {
                    draft.referral.payoutQualification.validConsumption.includeCreditDiscount =
                      event.target.checked;
                  })
                }
              />
              抵用金折抵金額計入有效消費
            </label>

            <label>
              <input
                type="checkbox"
                checked={rules.referral.payoutQualification.validConsumption.includeShipping}
                onChange={(event) =>
                  change((draft) => {
                    draft.referral.payoutQualification.validConsumption.includeShipping =
                      event.target.checked;
                  })
                }
              />
              運費計入有效消費
            </label>
          </div>
        ) : (
          <p className="membership-inline-note">
            商品 {rules.referral.pointDisplayName || "KD點"} 模式直接累積完成訂單中保存的商品
            {rules.referral.pointDisplayName || "KD點"}；抵用金與運費不會改變商品點數資格。
          </p>
        )}
        <h3>獎勵涵蓋期間</h3>
        <div className="membership-fields two">
          <NumberField label="資格日前涵蓋" value={rules.referral.payoutQualification.rewardCoverage.lookbackDays} min={1} max={3650} unit="天" onChange={(value) => change((draft) => { draft.referral.payoutQualification.rewardCoverage.lookbackDays = value; })} />
          <NumberField label="資格日後涵蓋" value={rules.referral.payoutQualification.rewardCoverage.forwardDays} min={1} max={3650} unit="天" onChange={(value) => change((draft) => { draft.referral.payoutQualification.rewardCoverage.forwardDays = value; })} />
        </div>
        <p>取得資格後，可涵蓋資格日前 {rules.referral.payoutQualification.rewardCoverage.lookbackDays} 天至資格日後 {rules.referral.payoutQualification.rewardCoverage.forwardDays} 天內產生的推薦獎勵。</p>
        <h3>獎勵安全等待</h3>
        <div className="membership-fields two">
          <NumberField label="推薦獎勵基礎等待天數" value={rules.referral.referralRewardBaseWaitingDays} min={0} max={365} unit="天" onChange={(value) => change((draft) => { draft.referral.referralRewardBaseWaitingDays = value; })} />
          <NumberField label="推薦獎勵退貨保護天數" value={rules.referral.referralRewardReturnProtectionDays} min={0} max={365} unit="天" onChange={(value) => change((draft) => { draft.referral.referralRewardReturnProtectionDays = value; })} />
        </div>
        <div className="membership-rule-summary"><small>實際總等待</small><strong>{rules.referral.referralRewardBaseWaitingDays} 天 + {rules.referral.referralRewardReturnProtectionDays} 天 = {rules.referral.referralRewardBaseWaitingDays + rules.referral.referralRewardReturnProtectionDays} 天</strong></div>
        <h3>通知方式</h3>
        <div className="membership-checks">
          <label><input type="checkbox" checked={rules.notification.events.credit_reward.channels.includes("line")} onChange={(event) => change((draft) => { const channels = draft.notification.events.credit_reward.channels; draft.notification.events.credit_reward.channels = event.target.checked ? [...new Set([...channels, "line" as const])] : channels.filter((channel) => channel !== "line"); })} />推薦獎勵發放時傳送 LINE</label>
          <label><input type="checkbox" checked={rules.notification.events.credit_reward.channels.includes("email")} onChange={(event) => change((draft) => { const channels = draft.notification.events.credit_reward.channels; draft.notification.events.credit_reward.channels = event.target.checked ? [...new Set([...channels, "email" as const])] : channels.filter((channel) => channel !== "email"); })} />推薦獎勵發放時傳送 Email</label>
        </div>
      </fieldset>
      <p className="membership-effective-note">舊版「推薦獎勵領取資格期限」會保留供既有獎勵快照解讀，不作為上述新資格規則。</p>
      <div className="membership-fields two">
        <NumberField label="單筆全組織上限" value={rules.referral.referralTotalRewardCap} min={0} max={100} unit="%" onChange={(value) => change((draft) => { draft.referral.referralTotalRewardCap = value; })} />
        <NumberField label="單一會員每月上限" value={rules.referral.referralMonthlyCreditCap} min={0} max={100000000} unit="元（0 不限）" onChange={(value) => change((draft) => { draft.referral.referralMonthlyCreditCap = value; })} />
        <NumberField label={`每 1 ${rules.referral.pointDisplayName || "KD點"} 換算`} value={rules.referral.pvRewardMoneyValue} min={0} max={100000} unit="元抵用金" onChange={(value) => change((draft) => { draft.referral.pvRewardMoneyValue = value; })} />
        <label className="membership-switch"><input type="checkbox" checked={rules.referral.showProductPV} onChange={(event) => change((draft) => { draft.referral.showProductPV = event.target.checked; })} /><span><b>商品頁顯示 {rules.referral.pointDisplayName || "KD點"}</b><small>關閉不影響後台獎勵計算</small></span><AdminRuleHelpButton ruleKey="referral.showProductPV" /></label>
        <Choice label="退款／退貨後獎勵" helpKey="referral.reversalPolicy" value={rules.referral.reversalPolicy} onChange={(value) => change((draft) => { draft.referral.reversalPolicy = value as MembershipBusinessRules["referral"]["reversalPolicy"]; })}><option value="cancel-pending-and-reverse-released">取消待發放並沖回已發放</option><option value="cancel-pending-only">只取消待發放</option></Choice>
        <NumberField label="一般商品最少備貨" value={rules.pickup.preparationLeadDays} min={0} max={60} unit="天" onChange={(value) => change((draft) => { draft.pickup.preparationLeadDays = value; if (draft.pickup.customRoastPreparationLeadDays < value) draft.pickup.customRoastPreparationLeadDays = value; })} />
        <NumberField label="專屬烘焙最少備貨" value={rules.pickup.customRoastPreparationLeadDays} min={rules.pickup.preparationLeadDays} max={90} unit="天" onChange={(value) => change((draft) => { draft.pickup.customRoastPreparationLeadDays = value; })} />
        <label><RuleFieldTitle label="不可自取日期" ruleKey="pickup.blockedDates" /><textarea rows={5} value={rules.pickup.blockedDates.join("\n")} placeholder={"每行一個日期，例如：\n2026-09-15\n2026-09-16"} onChange={(event) => change((draft) => { draft.pickup.blockedDates = event.target.value.split(/\s|,|，/).map((date) => date.trim()).filter(Boolean); })} /><small>可加入臨時休息或單日封鎖；每行填一個日期。</small></label>
        <Choice label="自取日期選擇方式" value={rules.pickup.datePickerMode} onChange={(value) => change((draft) => { draft.pickup.datePickerMode = value as MembershipBusinessRules["pickup"]["datePickerMode"]; })}><option value="calendar">日曆自由選日期</option><option value="suggestion-and-calendar">系統建議＋日曆</option></Choice>
      </div>
      <div className="referral-rate-editor">
        <div className="referral-rate-editor-head">
          <div><h3>推薦回饋設定</h3><p>每一層分開設定首次消費、一般續購與定期購續期回饋；關閉該層後不建立新的該層回饋。</p></div>
          <span>計算基準：{rules.referral.referralRewardCalculationMode === "pv" ? (rules.referral.pointDisplayName || "KD點") : "商品實付金額"}</span>
        </div>
        <div className="referral-rate-list">
          {rules.referral.levels.slice(0, rules.referral.referralMaxRewardDepth).map((level, index) => <article className={`referral-rate-row${level.enabled ? "" : " is-disabled"}`} key={level.level}>
            <label className="referral-rate-toggle">
              <input type="checkbox" checked={level.enabled} onChange={(event) => change((draft) => { draft.referral.levels[index].enabled = event.target.checked; })} />
              <span><b>第 {level.level} 層</b><small>{level.enabled ? "啟用中" : "已關閉"}</small></span>
              <AdminRuleHelpButton ruleKey={`referral.levels.${index}.enabled`} />
            </label>
            <div className="referral-rate-fields">
              <NumberField label="首次消費推薦" helpKey={`referral.levels.${index}.newReferralRewardRate`} value={level.newReferralRewardRate} min={0} max={100} unit="%" onChange={(value) => change((draft) => { draft.referral.levels[index].newReferralRewardRate = value; })} />
              <NumberField label="一般續購推薦" helpKey={`referral.levels.${index}.repeatPurchaseRewardRate`} value={level.repeatPurchaseRewardRate} min={0} max={100} unit="%" onChange={(value) => change((draft) => { draft.referral.levels[index].repeatPurchaseRewardRate = value; })} />
              <NumberField label="定期購續期" helpKey={`referral.levels.${index}.subscriptionRewardRate`} value={level.subscriptionRewardRate} min={0} max={100} unit="%" onChange={(value) => change((draft) => { draft.referral.levels[index].subscriptionRewardRate = value; })} />
            </div>
          </article>)}
        </div>
      </div>
    </section>

    <section className="membership-rule-card">
      <header><span>04</span><div><h2>續訂贈品 <AdminRuleHelpButton ruleKey="gift.pool" /></h2><p>成功取貨才累積；達門檻的當次就放入贈品。</p></div></header>
      <div className="membership-fields four"><NumberField label="完成第幾次開始送" value={rules.gift.startsAtFulfillment} min={1} max={100} unit="次" onChange={(value) => change((draft) => { draft.gift.startsAtFulfillment = value; })} /><NumberField label="開始後每隔" value={rules.gift.repeatEveryFulfillments} min={1} max={100} unit="次送" onChange={(value) => change((draft) => { draft.gift.repeatEveryFulfillments = value; })} /><NumberField label="半磅贈品" value={rules.gift.halfPoundQuantity} max={20} unit="包" onChange={(value) => change((draft) => { draft.gift.halfPoundQuantity = value; })} /><NumberField label="一磅贈品" value={rules.gift.onePoundQuantity} max={20} unit="包" onChange={(value) => change((draft) => { draft.gift.onePoundQuantity = value; })} /></div>
      <div className="gift-pool-editor"><h3>贈品候選作品與替代順序</h3><div className="gift-pool-add"><select value={giftProduct} onChange={(event) => setGiftProduct(event.target.value)}><option value="">選擇作品</option>{products.filter((product) => !rules.gift.pool.some((item) => item.productId === product.id)).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><button type="button" onClick={addGiftProduct}>加入候選</button></div>{rules.gift.pool.length ? <ol>{rules.gift.pool.map((item, index) => <li key={item.productId}><span><b>{index + 1}</b>{nameOf(item.productId)}</span><div><button type="button" disabled={index === 0} onClick={() => moveGiftProduct(index, -1)}>往前</button><button type="button" disabled={index === rules.gift.pool.length - 1} onClick={() => moveGiftProduct(index, 1)}>往後</button><button type="button" onClick={() => removeGiftProduct(item.productId)}>移除</button></div></li>)}</ol> : <p>尚未加入候選作品。贈品缺貨時會依這裡的順序尋找替代品。</p>}</div>
    </section>

    <section className="membership-rule-card">
      <header><span>06</span><div><h2>抵用金</h2><p>會員自行選擇是否使用，系統會先使用最快到期的抵用金。</p></div></header>
      <div className="membership-fields two"><NumberField label="有效期限" value={rules.credit.expiryCalendarMonths} min={1} max={120} unit="個月" onChange={(value) => change((draft) => { draft.credit.expiryCalendarMonths = value; })} /><NumberField label="到期前提醒" value={rules.credit.expiryReminderDays} min={0} max={365} unit="天" onChange={(value) => change((draft) => { draft.credit.expiryReminderDays = value; })} /><Choice label="每筆最高折抵" value={rules.credit.redemption.mode} onChange={(value) => change((draft) => { draft.credit.redemption = value === "maximum-fixed" ? { mode: "maximum-fixed", amount: 0 } : value === "minimum-payable" ? { mode: "minimum-payable", amount: 0 } : value === "maximum-percentage" ? { mode: "maximum-percentage", percent: 0 } : { mode: "unlimited" }; })}><option value="unlimited">不限制</option><option value="maximum-fixed">最高固定金額</option><option value="minimum-payable">保留最低應付金額</option><option value="maximum-percentage">最高商品金額比例</option></Choice>
        {rules.credit.redemption.mode === "maximum-fixed" && <NumberField label="最高折抵" value={rules.credit.redemption.amount} max={100000000} unit="元" onChange={(value) => change((draft) => { draft.credit.redemption = { mode: "maximum-fixed", amount: value }; })} />}{rules.credit.redemption.mode === "minimum-payable" && <NumberField label="每筆至少應付" value={rules.credit.redemption.amount} max={100000000} unit="元" onChange={(value) => change((draft) => { draft.credit.redemption = { mode: "minimum-payable", amount: value }; })} />}{rules.credit.redemption.mode === "maximum-percentage" && <NumberField label="最高折抵商品金額" value={rules.credit.redemption.percent} max={100} unit="%" onChange={(value) => change((draft) => { draft.credit.redemption = { mode: "maximum-percentage", percent: value }; })} />}
        <Choice label="抵用金是否可折運費" value={rules.credit.appliesToShipping} onChange={(value) => change((draft) => { draft.credit.appliesToShipping = value as MembershipBusinessRules["credit"]["appliesToShipping"]; })}><option value={OWNER_DECISION_REQUIRED}>尚待 Owner 決定</option><option value="no">只折商品</option><option value="yes">商品與運費都可折</option></Choice>
        <Choice label="會員使用抵用金方式" value={rules.credit.uiMode} onChange={(value) => change((draft) => { draft.credit.uiMode = value as MembershipBusinessRules["credit"]["uiMode"]; })}><option value="amount-and-maximum">輸入金額＋最大折抵</option><option value="use-or-not">只選使用／不使用</option><option value="automatic-maximum">使用時自動最大折抵</option><option value="custom-amount">只允許指定金額</option></Choice>
        <label className="membership-switch"><input type="checkbox" checked={rules.credit.allowZeroTotal} onChange={(event) => change((draft) => { draft.credit.allowZeroTotal = event.target.checked; })} /><span><b>允許抵成零元訂單</b><small>關閉時至少保留 NT$1 應付金額</small></span><AdminRuleHelpButton ruleKey="credit.allowZeroTotal" /></label>
      </div>
    </section>

    <section className="membership-rule-card owner-decisions-card">
      <header><span>07</span><div><h2>價格與恢復配送</h2><p>以下已套用 Owner 核准預設，仍可在此調整並建立新版本。</p></div></header>
      <div className="membership-fields two"><Choice label="活動適用定期購時" value={rules.campaign.eligiblePricingMode} onChange={(value) => change((draft) => { draft.campaign.eligiblePricingMode = value as MembershipBusinessRules["campaign"]["eligiblePricingMode"]; })}><option value={OWNER_DECISION_REQUIRED}>尚待 Owner 決定</option><option value="best-price">採較優惠價格</option><option value="campaign-replaces-subscription">活動價取代定期購價</option><option value="subscription-plus-benefit">定期購價再享活動禮遇</option><option value="campaign-defined">由每個活動個別設定</option></Choice><Choice label="暫停後恢復配送日期" value={rules.subscription.pauseResumeAnchorPolicy} onChange={(value) => change((draft) => { draft.subscription.pauseResumeAnchorPolicy = value as MembershipBusinessRules["subscription"]["pauseResumeAnchorPolicy"]; })}><option value={OWNER_DECISION_REQUIRED}>尚待 Owner 決定</option><option value="keep-original">沿用原本週期</option><option value="resume-date">從恢復日重新計算</option><option value="member-selects-date">會員選日期與週期作新基準</option></Choice><Choice label="折扣金額有小數時" value={rules.money.roundingMode} onChange={(value) => change((draft) => { draft.money.roundingMode = value as MembershipBusinessRules["money"]["roundingMode"]; })}><option value={OWNER_DECISION_REQUIRED}>尚待 Owner 決定</option><option value="round-half-up">四捨五入</option><option value="round-down">無條件捨去</option><option value="round-up">無條件進位</option></Choice></div>
    </section>

    <section className="membership-rule-card">
      <header><span>08</span><div><h2>LINE／Email 通知</h2><p>每一種營運事件可以獨立開關；會員中心紀錄會保留，避免外部通知失敗後無處查詢。</p></div></header>
      <div className="membership-fields two"><NumberField label="下一期前幾天提醒" value={rules.notification.nextCycleReminderDays} min={0} max={365} unit="天" onChange={(value) => change((draft) => { draft.notification.nextCycleReminderDays = value; })} /><NumberField label="修改截止前幾天提醒" value={rules.notification.modificationCutoffReminderDays} min={0} max={60} unit="天" onChange={(value) => change((draft) => { draft.notification.modificationCutoffReminderDays = value; })} /><NumberField label="通知失敗最多重試" value={rules.notification.retryCount} min={0} max={10} unit="次" onChange={(value) => change((draft) => { draft.notification.retryCount = value; })} /><label className="membership-switch"><input type="checkbox" checked={rules.notification.emailFallback} onChange={(event) => change((draft) => { draft.notification.emailFallback = event.target.checked; })} /><span><b>LINE 失敗時改寄 Email</b><small>只有會員有可信 Email 時才會使用</small></span><AdminRuleHelpButton ruleKey="notification.emailFallback" /></label></div>
      <div className="membership-checks">{Object.entries({ next_cycle_upcoming: "下一期提醒", modification_cutoff_reminder: "修改截止提醒", subscription_order_created: "定期購訂單成立", shipped: "已出貨", arrived_at_store: "已到店", unclaimed_risk: "疑似未取貨", gift_milestone: "贈品里程碑", referral_reward: "推薦回饋", credit_reward: "抵用金入帳", credit_expiry: "抵用金到期" }).map(([key, label]) => <label key={key}><input type="checkbox" checked={rules.notification.events[key as keyof typeof rules.notification.events].enabled} onChange={(event) => change((draft) => { draft.notification.events[key as keyof typeof draft.notification.events].enabled = event.target.checked; })} />{label} <AdminRuleHelpButton ruleKey={`notification.events.${key}.enabled`} /></label>)}</div>
    </section>

    <section className="membership-rule-card owner-decisions-card">
      <header><span>09</span><div><h2>物流提醒與 Owner 例外權限</h2><p>逾期只會標示疑似未取貨並等待人工確認；不提供關閉這項安全保護的選項。</p></div></header>
      <div className="membership-fields two"><NumberField label="到店後第幾天提醒" value={rules.fulfillment.arrivalReminderAfterDays} min={0} max={30} unit="天" onChange={(value) => change((draft) => { draft.fulfillment.arrivalReminderAfterDays = value; })} /><NumberField label="Gmail 每次回看" value={rules.fulfillment.gmailScanLookbackDays} min={1} max={90} unit="天" onChange={(value) => change((draft) => { draft.fulfillment.gmailScanLookbackDays = value; })} /></div>
      <div className="membership-checks"><label><input type="checkbox" checked={rules.ownerExceptions.canUnlockDate} onChange={(event) => change((draft) => { draft.ownerExceptions.canUnlockDate = event.target.checked; })} />允許在安全狀態調整日期 <AdminRuleHelpButton ruleKey="ownerExceptions.canUnlockDate" /></label><label><input type="checkbox" checked={rules.ownerExceptions.canUnlockStore} onChange={(event) => change((draft) => { draft.ownerExceptions.canUnlockStore = event.target.checked; })} />允許在安全狀態調整門市 <AdminRuleHelpButton ruleKey="ownerExceptions.canUnlockStore" /></label><label><input type="checkbox" checked={rules.ownerExceptions.canUnlockQuantity} onChange={(event) => change((draft) => { draft.ownerExceptions.canUnlockQuantity = event.target.checked; })} />允許在安全狀態調整數量 <AdminRuleHelpButton ruleKey="ownerExceptions.canUnlockQuantity" /></label></div>
    </section>
  </div></AdminRuleHelpProvider>;
}
