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
  "未免運時的定期購運費": "shipping.subscriptionShippingFee", "定期購價格": "subscription.discountPercent", "修改期限": "subscription.modificationCutoffDays", "建立訂單": "subscription.orderCreationLeadDays", "一般備貨至少": "subscription.preparationLeadDays", "專屬烘焙至少": "subscription.customRoastPreparationLeadDays", "未取貨停止": "subscription.uncollectedTerminationCount", "每期最多修改": "subscription.maxModificationsPerCycle", "自訂最少": "subscription.customCycleMinDays", "自訂最多": "subscription.customCycleMaxDays", "會員選配送日期方式": "subscription.datePickerMode", "獎勵代數": "referral.referralMaxRewardDepth", "獎勵計算方式": "referral.referralRewardCalculationMode", "推薦獎勵領取資格期限": "referral.referralRewardQualificationWindowDays", "推薦獎勵基礎等待天數": "referral.referralRewardBaseWaitingDays", "推薦獎勵退貨保護天數": "referral.referralRewardReturnProtectionDays", "單筆全組織上限": "referral.referralTotalRewardCap", "單一會員每月上限": "referral.referralMonthlyCreditCap", "每 1 PV 換算": "referral.pvRewardMoneyValue", "一般商品最少備貨": "pickup.preparationLeadDays", "專屬烘焙最少備貨": "pickup.customRoastPreparationLeadDays", "自取日期選擇方式": "pickup.datePickerMode", "完成第幾次開始送": "gift.startsAtFulfillment", "開始後每隔": "gift.repeatEveryFulfillments", "半磅贈品": "gift.halfPoundQuantity", "一磅贈品": "gift.onePoundQuantity", "有效期限": "credit.expiryCalendarMonths", "到期前提醒": "credit.expiryReminderDays", "每筆最高折抵": "credit.redemption", "最高折抵": "credit.redemption", "每筆至少應付": "credit.redemption", "最高折抵商品金額": "credit.redemption", "抵用金是否可折運費": "credit.appliesToShipping", "會員使用抵用金方式": "credit.uiMode", "活動適用定期購時": "campaign.eligiblePricingMode", "暫停後恢復配送日期": "subscription.pauseResumeAnchorPolicy", "折扣金額有小數時": "money.roundingMode", "下一期前幾天提醒": "notification.nextCycleReminderDays", "修改截止前幾天提醒": "notification.modificationCutoffReminderDays", "通知失敗最多重試": "notification.retryCount", "到店後第幾天提醒": "fulfillment.arrivalReminderAfterDays", "Gmail 每次回看": "fulfillment.gmailScanLookbackDays",
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

export default function MembershipRulesManager({ initialRevision, initialVersion, initialRules, products }: Props) {
  const [rules, setRules] = useState(() => structuredClone(initialRules));
  const [savedRules, setSavedRules] = useState(() => structuredClone(initialRules));
  const [revision, setRevision] = useState(initialRevision);
  const [version, setVersion] = useState(initialVersion);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [giftProduct, setGiftProduct] = useState("");
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
      <header><span>01</span><div><h2>會員免運</h2><p>開站首年活動與定期購免運分開管理。</p></div></header>
      <div className="membership-fields two">
        <label className="membership-switch"><input type="checkbox" checked={rules.membership.openingYearFreeShipping.enabled} onChange={(event) => change((draft) => { draft.membership.openingYearFreeShipping.enabled = event.target.checked; })} /><span><b>開站首年會員免運</b><small>目前套用 7-ELEVEN 取貨</small></span><AdminRuleHelpButton ruleKey="membership.openingYearFreeShipping.enabled" /></label>
        <label className="membership-switch"><input type="checkbox" checked={rules.shipping.subscriptionFreeShipping} onChange={(event) => change((draft) => { draft.shipping.subscriptionFreeShipping = event.target.checked; })} /><span><b>定期購不限金額免運</b><small>不受開站首年活動期限影響</small></span><AdminRuleHelpButton ruleKey="shipping.subscriptionFreeShipping" /></label>
        <NumberField label="未免運時的定期購運費" value={rules.shipping.subscriptionShippingFee} min={0} max={10000} unit="元" onChange={(value) => change((draft) => { draft.shipping.subscriptionShippingFee = value; })} />
        <label><RuleFieldTitle label="活動開始日" ruleKey="membership.openingYearFreeShipping.startDate" /><input type="date" value={rules.membership.openingYearFreeShipping.startDate} onChange={(event) => change((draft) => { draft.membership.openingYearFreeShipping.startDate = event.target.value; })} /></label>
        <label><RuleFieldTitle label="活動結束日" ruleKey="membership.openingYearFreeShipping.endDate" /><input type="date" value={rules.membership.openingYearFreeShipping.endDate} onChange={(event) => change((draft) => { draft.membership.openingYearFreeShipping.endDate = event.target.value; })} /></label>
      </div>
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
      <fieldset className="membership-intervals"><legend>快捷配送週期 <AdminRuleHelpButton ruleKey="subscription.intervalOptions" /></legend>{rules.subscription.intervalOptions.map((option, index) => <label key={`${option.days}:${index}`}><input type="checkbox" checked={option.enabled} onChange={(event) => change((draft) => { draft.subscription.intervalOptions[index].enabled = event.target.checked; draft.subscription.intervalsDays = draft.subscription.intervalOptions.filter((item) => item.enabled).map((item) => item.days); })} />每 <input aria-label={`快捷週期 ${index + 1}`} type="number" min={1} max={365} value={option.days} onChange={(event) => change((draft) => { draft.subscription.intervalOptions[index].days = Number(event.target.value); draft.subscription.intervalsDays = draft.subscription.intervalOptions.filter((item) => item.enabled).map((item) => item.days); })} /> 天</label>)}</fieldset>
      <div className="membership-fields three"><label className="membership-switch"><input type="checkbox" checked={rules.subscription.customCycleEnabled} onChange={(event) => change((draft) => { draft.subscription.customCycleEnabled = event.target.checked; })} /><span><b>開放會員自訂週期</b><small>API 也會依上下限重新驗證</small></span><AdminRuleHelpButton ruleKey="subscription.customCycleEnabled" /></label><NumberField label="自訂最少" value={rules.subscription.customCycleMinDays} min={1} max={365} unit="天" onChange={(value) => change((draft) => { draft.subscription.customCycleMinDays = value; })} /><NumberField label="自訂最多" value={rules.subscription.customCycleMaxDays} min={1} max={365} unit="天" onChange={(value) => change((draft) => { draft.subscription.customCycleMaxDays = value; })} /></div>
      <div className="membership-checks"><label><input type="checkbox" checked={rules.subscription.allowOtherSubscriptionProducts} onChange={(event) => change((draft) => { draft.subscription.allowOtherSubscriptionProducts = event.target.checked; })} />可換其他定期購作品 <AdminRuleHelpButton ruleKey="subscription.allowOtherSubscriptionProducts" /></label><label><input type="checkbox" checked={rules.subscription.allowHalfToOnePound} onChange={(event) => change((draft) => { draft.subscription.allowHalfToOnePound = event.target.checked; })} />半磅可改一磅 <AdminRuleHelpButton ruleKey="subscription.allowHalfToOnePound" /></label><label><input type="checkbox" checked={rules.subscription.allowOneToHalfPound} onChange={(event) => change((draft) => { draft.subscription.allowOneToHalfPound = event.target.checked; })} />一磅可改半磅 <AdminRuleHelpButton ruleKey="subscription.allowOneToHalfPound" /></label><label><input type="checkbox" checked={rules.subscription.allowMixedOnePound} onChange={(event) => change((draft) => { draft.subscription.allowMixedOnePound = event.target.checked; })} />一磅可 A+A 或 A+B <AdminRuleHelpButton ruleKey="subscription.allowMixedOnePound" /></label><label><input type="checkbox" checked={rules.subscription.allowQuantityChange} onChange={(event) => change((draft) => { draft.subscription.allowQuantityChange = event.target.checked; })} />可修改數量 <AdminRuleHelpButton ruleKey="subscription.allowQuantityChange" /></label></div>
      <div className="membership-fields two"><Choice label="會員選配送日期方式" value={rules.subscription.datePickerMode} onChange={(value) => change((draft) => { draft.subscription.datePickerMode = value as MembershipBusinessRules["subscription"]["datePickerMode"]; })}><option value="quick-and-calendar">快捷按鈕＋日曆</option><option value="calendar-only">只顯示日曆</option><option value="suggestion-and-calendar">系統建議＋日曆</option></Choice></div>
    </section>

    <section className="membership-rule-card">
      <header><span>03</span><div><h2>推薦制度與工作室自取</h2><p>管理多代推薦、PV／實付金額獎勵，以及工作室自取日期；前台與伺服器共用同一套版本化規則。</p></div></header>
      <div className="membership-fields two">
        <label className="membership-switch"><input type="checkbox" checked={rules.referral.programEnabled} onChange={(event) => change((draft) => { draft.referral.programEnabled = event.target.checked; })} /><span><b>啟用推薦制度</b><small>關閉後不建立新的獎勵資格</small></span><AdminRuleHelpButton ruleKey="referral.programEnabled" /></label>
        <NumberField label="獎勵代數" value={rules.referral.referralMaxRewardDepth} min={1} max={10} unit="代" onChange={(value) => change((draft) => { draft.referral.referralMaxRewardDepth = value; while (draft.referral.levels.length < value) { const level=draft.referral.levels.length+1; draft.referral.levels.push({level,enabled:true,newReferralRewardRate:0,subscriptionRewardRate:0}); } })} />
        <Choice label="獎勵計算方式" value={rules.referral.referralRewardCalculationMode} onChange={(value) => change((draft) => { draft.referral.referralRewardCalculationMode = value as "paid_amount"|"pv"; })}><option value="paid_amount">商品實付金額</option><option value="pv">PV 商品獎勵單位</option></Choice>
        <NumberField label="推薦獎勵領取資格期限" value={rules.referral.referralRewardQualificationWindowDays} min={1} max={3650} unit="天" onChange={(value) => change((draft) => { draft.referral.referralRewardQualificationWindowDays = value; })} />
        <NumberField label="推薦獎勵基礎等待天數" value={rules.referral.referralRewardBaseWaitingDays} min={0} max={365} unit="天" onChange={(value) => change((draft) => { draft.referral.referralRewardBaseWaitingDays = value; })} />
        <NumberField label="推薦獎勵退貨保護天數" value={rules.referral.referralRewardReturnProtectionDays} min={0} max={365} unit="天" onChange={(value) => change((draft) => { draft.referral.referralRewardReturnProtectionDays = value; })} />
        <div className="membership-rule-summary"><small>實際總等待</small><strong>{rules.referral.referralRewardBaseWaitingDays} 天 + {rules.referral.referralRewardReturnProtectionDays} 天 = {rules.referral.referralRewardBaseWaitingDays + rules.referral.referralRewardReturnProtectionDays} 天</strong></div>
        <NumberField label="單筆全組織上限" value={rules.referral.referralTotalRewardCap} min={0} max={100} unit="%" onChange={(value) => change((draft) => { draft.referral.referralTotalRewardCap = value; })} />
        <NumberField label="單一會員每月上限" value={rules.referral.referralMonthlyCreditCap} min={0} max={100000000} unit="元（0 不限）" onChange={(value) => change((draft) => { draft.referral.referralMonthlyCreditCap = value; })} />
        <NumberField label="每 1 PV 換算" value={rules.referral.pvRewardMoneyValue} min={0} max={100000} unit="元抵用金" onChange={(value) => change((draft) => { draft.referral.pvRewardMoneyValue = value; })} />
        <label className="membership-switch"><input type="checkbox" checked={rules.referral.showProductPV} onChange={(event) => change((draft) => { draft.referral.showProductPV = event.target.checked; })} /><span><b>商品頁顯示 PV</b><small>關閉不影響後台獎勵計算</small></span><AdminRuleHelpButton ruleKey="referral.showProductPV" /></label>
        <Choice label="退款／退貨後獎勵" helpKey="referral.reversalPolicy" value={rules.referral.reversalPolicy} onChange={(value) => change((draft) => { draft.referral.reversalPolicy = value as MembershipBusinessRules["referral"]["reversalPolicy"]; })}><option value="cancel-pending-and-reverse-released">取消待發放並沖回已發放</option><option value="cancel-pending-only">只取消待發放</option></Choice>
        <NumberField label="一般商品最少備貨" value={rules.pickup.preparationLeadDays} min={0} max={60} unit="天" onChange={(value) => change((draft) => { draft.pickup.preparationLeadDays = value; if (draft.pickup.customRoastPreparationLeadDays < value) draft.pickup.customRoastPreparationLeadDays = value; })} />
        <NumberField label="專屬烘焙最少備貨" value={rules.pickup.customRoastPreparationLeadDays} min={rules.pickup.preparationLeadDays} max={90} unit="天" onChange={(value) => change((draft) => { draft.pickup.customRoastPreparationLeadDays = value; })} />
        <label><RuleFieldTitle label="不可自取日期" ruleKey="pickup.blockedDates" /><textarea rows={5} value={rules.pickup.blockedDates.join("\n")} placeholder={"每行一個日期，例如：\n2026-09-15\n2026-09-16"} onChange={(event) => change((draft) => { draft.pickup.blockedDates = event.target.value.split(/\s|,|，/).map((date) => date.trim()).filter(Boolean); })} /><small>可加入臨時休息或單日封鎖；每行填一個日期。</small></label>
        <Choice label="自取日期選擇方式" value={rules.pickup.datePickerMode} onChange={(value) => change((draft) => { draft.pickup.datePickerMode = value as MembershipBusinessRules["pickup"]["datePickerMode"]; })}><option value="calendar">日曆自由選日期</option><option value="suggestion-and-calendar">系統建議＋日曆</option></Choice>
      </div>
      <div className="gift-pool-editor"><h3>各代獎勵率</h3>{rules.referral.levels.slice(0,rules.referral.referralMaxRewardDepth).map((level,index)=><div className="membership-fields four" key={level.level}><label className="membership-switch"><input type="checkbox" checked={level.enabled} onChange={(event)=>change((draft)=>{draft.referral.levels[index].enabled=event.target.checked;})}/><span><b>第 {level.level} 代</b></span><AdminRuleHelpButton ruleKey={`referral.levels.${index}.enabled`} /></label><NumberField label="新推薦" helpKey={`referral.levels.${index}.newReferralRewardRate`} value={level.newReferralRewardRate} min={0} max={100} unit={rules.referral.referralRewardCalculationMode==="pv"?"% PV 獎勵率":"%"} onChange={(value)=>change((draft)=>{draft.referral.levels[index].newReferralRewardRate=value;})}/><NumberField label="定期購" helpKey={`referral.levels.${index}.subscriptionRewardRate`} value={level.subscriptionRewardRate} min={0} max={100} unit={rules.referral.referralRewardCalculationMode==="pv"?"% PV 獎勵率":"%"} onChange={(value)=>change((draft)=>{draft.referral.levels[index].subscriptionRewardRate=value;})}/></div>)}</div>
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
