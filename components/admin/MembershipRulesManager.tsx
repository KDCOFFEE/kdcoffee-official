"use client";

import { useMemo, useState } from "react";

import {
  OWNER_DECISION_REQUIRED,
  type MembershipBusinessRules,
} from "@/lib/membershipRuleTypes";

type Props = {
  initialRevision: number;
  initialVersion: number;
  initialRules: MembershipBusinessRules;
  products: Array<{ id: string; name: string }>;
};

function NumberField({ label, value, unit, min = 0, max = 999, onChange }: { label: string; value: number; unit: string; min?: number; max?: number; onChange: (value: number) => void }) {
  return <label className="membership-number-field"><span>{label}</span><span><input type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} /><b>{unit}</b></span></label>;
}

function Choice({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label className="membership-choice"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

export default function MembershipRulesManager({ initialRevision, initialVersion, initialRules, products }: Props) {
  const [rules, setRules] = useState(() => structuredClone(initialRules));
  const [savedRules, setSavedRules] = useState(() => structuredClone(initialRules));
  const [revision, setRevision] = useState(initialRevision);
  const [version, setVersion] = useState(initialVersion);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [giftProduct, setGiftProduct] = useState("");
  const dirty = useMemo(() => JSON.stringify(rules) !== JSON.stringify(savedRules), [rules, savedRules]);

  function change(mutator: (draft: MembershipBusinessRules) => void) {
    setRules((current) => {
      const next = structuredClone(current);
      mutator(next);
      return next;
    });
    setMessage("");
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
  const eligibility = rules.referral.referrerEligibility;
  const reward = rules.referral.reward;

  return <div className="membership-rules-manager">
    <header className="membership-rules-header">
      <div><p className="eyebrow dark">會員商務規則</p><h1>會員與定期購設定</h1><p>集中管理會員免運、定期配送、續訂贈品、推薦獎勵與抵用金。</p></div>
      <div className="membership-save-box"><span className={dirty ? "is-dirty" : "is-saved"}>{dirty ? "有尚未儲存的修改" : "所有修改已儲存"}</span><button type="button" disabled={!dirty || saving} onClick={save}>{saving ? "儲存中…" : "儲存新設定"}</button><small>目前設定版次 {version}</small></div>
    </header>

    <p className="membership-effective-note">新設定只會套用到尚未鎖定的下一期，不會修改已成立的訂單或已鎖定配送。</p>
    {message && <p className="membership-save-feedback" role="status">{message}</p>}

    <section className="membership-rule-card">
      <header><span>01</span><div><h2>會員免運</h2><p>開站首年活動與定期購免運分開管理。</p></div></header>
      <div className="membership-fields two">
        <label className="membership-switch"><input type="checkbox" checked={rules.membership.openingYearFreeShipping.enabled} onChange={(event) => change((draft) => { draft.membership.openingYearFreeShipping.enabled = event.target.checked; })} /><span><b>開站首年會員免運</b><small>目前套用 7-ELEVEN 取貨</small></span></label>
        <label className="membership-switch"><input type="checkbox" checked={rules.shipping.subscriptionFreeShipping} onChange={(event) => change((draft) => { draft.shipping.subscriptionFreeShipping = event.target.checked; })} /><span><b>定期購不限金額免運</b><small>不受開站首年活動期限影響</small></span></label>
        <label><span>活動開始日</span><input type="date" value={rules.membership.openingYearFreeShipping.startDate} onChange={(event) => change((draft) => { draft.membership.openingYearFreeShipping.startDate = event.target.value; })} /></label>
        <label><span>活動結束日</span><input type="date" value={rules.membership.openingYearFreeShipping.endDate} onChange={(event) => change((draft) => { draft.membership.openingYearFreeShipping.endDate = event.target.value; })} /></label>
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
      </div>
      <fieldset className="membership-intervals"><legend>可選配送週期</legend>{[30, 45, 60, 75, 90].map((days) => <label key={days}><input type="checkbox" checked={rules.subscription.intervalsDays.includes(days)} onChange={(event) => change((draft) => { draft.subscription.intervalsDays = event.target.checked ? [...draft.subscription.intervalsDays, days].sort((a, b) => a - b) : draft.subscription.intervalsDays.filter((value) => value !== days); })} />每 {days} 天</label>)}</fieldset>
      <div className="membership-checks"><label><input type="checkbox" checked={rules.subscription.allowOtherSubscriptionProducts} onChange={(event) => change((draft) => { draft.subscription.allowOtherSubscriptionProducts = event.target.checked; })} />可換其他定期購作品</label><label><input type="checkbox" checked={rules.subscription.allowHalfToOnePound} onChange={(event) => change((draft) => { draft.subscription.allowHalfToOnePound = event.target.checked; })} />半磅可改一磅</label><label><input type="checkbox" checked={rules.subscription.allowOneToHalfPound} onChange={(event) => change((draft) => { draft.subscription.allowOneToHalfPound = event.target.checked; })} />一磅可改半磅</label><label><input type="checkbox" checked={rules.subscription.allowMixedOnePound} onChange={(event) => change((draft) => { draft.subscription.allowMixedOnePound = event.target.checked; })} />一磅可 A+A 或 A+B</label><label><input type="checkbox" checked={rules.subscription.allowQuantityChange} onChange={(event) => change((draft) => { draft.subscription.allowQuantityChange = event.target.checked; })} />可修改數量</label></div>
    </section>

    <section className="membership-rule-card">
      <header><span>03</span><div><h2>續訂贈品</h2><p>成功取貨才累積；達門檻的當次就放入贈品。</p></div></header>
      <div className="membership-fields four"><NumberField label="完成第幾次開始送" value={rules.gift.startsAtFulfillment} min={1} max={100} unit="次" onChange={(value) => change((draft) => { draft.gift.startsAtFulfillment = value; })} /><NumberField label="開始後每隔" value={rules.gift.repeatEveryFulfillments} min={1} max={100} unit="次送" onChange={(value) => change((draft) => { draft.gift.repeatEveryFulfillments = value; })} /><NumberField label="半磅贈品" value={rules.gift.halfPoundQuantity} max={20} unit="包" onChange={(value) => change((draft) => { draft.gift.halfPoundQuantity = value; })} /><NumberField label="一磅贈品" value={rules.gift.onePoundQuantity} max={20} unit="包" onChange={(value) => change((draft) => { draft.gift.onePoundQuantity = value; })} /></div>
      <div className="gift-pool-editor"><h3>贈品候選作品與替代順序</h3><div className="gift-pool-add"><select value={giftProduct} onChange={(event) => setGiftProduct(event.target.value)}><option value="">選擇作品</option>{products.filter((product) => !rules.gift.pool.some((item) => item.productId === product.id)).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><button type="button" onClick={addGiftProduct}>加入候選</button></div>{rules.gift.pool.length ? <ol>{rules.gift.pool.map((item, index) => <li key={item.productId}><span><b>{index + 1}</b>{nameOf(item.productId)}</span><div><button type="button" disabled={index === 0} onClick={() => moveGiftProduct(index, -1)}>往前</button><button type="button" disabled={index === rules.gift.pool.length - 1} onClick={() => moveGiftProduct(index, 1)}>往後</button><button type="button" onClick={() => removeGiftProduct(item.productId)}>移除</button></div></li>)}</ol> : <p>尚未加入候選作品。贈品缺貨時會依這裡的順序尋找替代品。</p>}</div>
    </section>

    <section className="membership-rule-card">
      <header><span>04</span><div><h2>推薦獎勵</h2><p>被推薦會員成功取貨後，每次符合條件的成交都可產生獎勵。</p></div></header>
      <div className="membership-fields two">
        <Choice label="推薦人領取資格" value={eligibility.mode} onChange={(value) => change((draft) => { draft.referral.referrerEligibility = value === "none" ? { mode: "none" } : value === "completed-orders" ? { mode: "completed-orders", minimumOrders: 1 } : value === "lifetime-spend" ? { mode: "lifetime-spend", minimumAmount: 1 } : value === "recent-valid-purchase" ? { mode: "recent-valid-purchase", withinDays: 90 } : { mode: OWNER_DECISION_REQUIRED }; })}><option value={OWNER_DECISION_REQUIRED}>尚待 Owner 決定（不發放）</option><option value="none">不需要先消費</option><option value="completed-orders">至少完成指定筆數</option><option value="lifetime-spend">累積消費達指定金額</option><option value="recent-valid-purchase">指定天數內有有效購買</option></Choice>
        {eligibility.mode === "completed-orders" && <NumberField label="至少完成" value={eligibility.minimumOrders} min={1} unit="筆訂單" onChange={(value) => change((draft) => { draft.referral.referrerEligibility = { mode: "completed-orders", minimumOrders: value }; })} />}
        {eligibility.mode === "lifetime-spend" && <NumberField label="累積消費至少" value={eligibility.minimumAmount} min={1} max={100000000} unit="元" onChange={(value) => change((draft) => { draft.referral.referrerEligibility = { mode: "lifetime-spend", minimumAmount: value }; })} />}
        {eligibility.mode === "recent-valid-purchase" && <NumberField label="最近有效購買" value={eligibility.withinDays} min={1} max={3650} unit="天內" onChange={(value) => change((draft) => { draft.referral.referrerEligibility = { mode: "recent-valid-purchase", withinDays: value }; })} />}
        <Choice label="每次成功成交獎勵" value={reward.mode} onChange={(value) => change((draft) => { const repeatedRewards = draft.referral.reward.repeatedRewards; draft.referral.reward = value === "fixed" ? { mode: "fixed", amount: 1, repeatedRewards } : value === "percentage" ? { mode: "percentage", percent: 5, repeatedRewards } : value === "per-eligible-item" ? { mode: "per-eligible-item", amount: 1, repeatedRewards } : { mode: OWNER_DECISION_REQUIRED, repeatedRewards }; })}><option value={OWNER_DECISION_REQUIRED}>尚待 Owner 決定（不發放）</option><option value="fixed">固定金額</option><option value="percentage">依商品金額比例</option><option value="per-eligible-item">每件符合商品固定金額</option></Choice>
        {reward.mode === "fixed" && <NumberField label="每次獎勵" value={reward.amount} min={1} max={1000000} unit="元" onChange={(value) => change((draft) => { draft.referral.reward = { mode: "fixed", amount: value, repeatedRewards: draft.referral.reward.repeatedRewards }; })} />}
        {reward.mode === "percentage" && <NumberField label="每次獎勵" value={reward.percent} min={1} max={100} unit="%" onChange={(value) => change((draft) => { draft.referral.reward = { mode: "percentage", percent: value, repeatedRewards: draft.referral.reward.repeatedRewards }; })} />}
        {reward.mode === "per-eligible-item" && <NumberField label="每件獎勵" value={reward.amount} min={1} max={1000000} unit="元" onChange={(value) => change((draft) => { draft.referral.reward = { mode: "per-eligible-item", amount: value, repeatedRewards: draft.referral.reward.repeatedRewards }; })} />}
        <label className="membership-switch"><input type="checkbox" checked={reward.repeatedRewards} onChange={(event) => change((draft) => { draft.referral.reward.repeatedRewards = event.target.checked; })} /><span><b>每次符合成交都發放</b><small>關閉時每組推薦關係只發一次</small></span></label>
      </div>
    </section>

    <section className="membership-rule-card">
      <header><span>05</span><div><h2>抵用金</h2><p>會員自行選擇是否使用，系統會先使用最快到期的抵用金。</p></div></header>
      <div className="membership-fields two"><NumberField label="有效期限" value={rules.credit.expiryCalendarMonths} min={1} max={120} unit="個月" onChange={(value) => change((draft) => { draft.credit.expiryCalendarMonths = value; })} /><Choice label="每筆最高折抵" value={rules.credit.redemption.mode} onChange={(value) => change((draft) => { draft.credit.redemption = value === "maximum-fixed" ? { mode: "maximum-fixed", amount: 0 } : value === "minimum-payable" ? { mode: "minimum-payable", amount: 0 } : value === "maximum-percentage" ? { mode: "maximum-percentage", percent: 0 } : { mode: "unlimited" }; })}><option value="unlimited">不限制</option><option value="maximum-fixed">最高固定金額</option><option value="minimum-payable">保留最低應付金額</option><option value="maximum-percentage">最高商品金額比例</option></Choice>
        {rules.credit.redemption.mode === "maximum-fixed" && <NumberField label="最高折抵" value={rules.credit.redemption.amount} max={100000000} unit="元" onChange={(value) => change((draft) => { draft.credit.redemption = { mode: "maximum-fixed", amount: value }; })} />}{rules.credit.redemption.mode === "minimum-payable" && <NumberField label="每筆至少應付" value={rules.credit.redemption.amount} max={100000000} unit="元" onChange={(value) => change((draft) => { draft.credit.redemption = { mode: "minimum-payable", amount: value }; })} />}{rules.credit.redemption.mode === "maximum-percentage" && <NumberField label="最高折抵商品金額" value={rules.credit.redemption.percent} max={100} unit="%" onChange={(value) => change((draft) => { draft.credit.redemption = { mode: "maximum-percentage", percent: value }; })} />}
        <Choice label="抵用金是否可折運費" value={rules.credit.appliesToShipping} onChange={(value) => change((draft) => { draft.credit.appliesToShipping = value as MembershipBusinessRules["credit"]["appliesToShipping"]; })}><option value={OWNER_DECISION_REQUIRED}>尚待 Owner 決定</option><option value="no">只折商品</option><option value="yes">商品與運費都可折</option></Choice>
      </div>
    </section>

    <section className="membership-rule-card owner-decisions-card">
      <header><span>06</span><div><h2>價格與恢復配送</h2><p>以下已套用 Owner 核准預設，仍可在此調整並建立新版本。</p></div></header>
      <div className="membership-fields two"><Choice label="活動適用定期購時" value={rules.campaign.eligiblePricingMode} onChange={(value) => change((draft) => { draft.campaign.eligiblePricingMode = value as MembershipBusinessRules["campaign"]["eligiblePricingMode"]; })}><option value={OWNER_DECISION_REQUIRED}>尚待 Owner 決定</option><option value="best-price">採較優惠價格</option><option value="campaign-replaces-subscription">活動價取代定期購價</option><option value="subscription-plus-benefit">定期購價再享活動禮遇</option><option value="campaign-defined">由每個活動個別設定</option></Choice><Choice label="暫停後恢復配送日期" value={rules.subscription.pauseResumeAnchorPolicy} onChange={(value) => change((draft) => { draft.subscription.pauseResumeAnchorPolicy = value as MembershipBusinessRules["subscription"]["pauseResumeAnchorPolicy"]; })}><option value={OWNER_DECISION_REQUIRED}>尚待 Owner 決定</option><option value="keep-original">沿用原本週期</option><option value="resume-date">從恢復日重新計算</option><option value="member-selects-date">會員選日期與週期作新基準</option></Choice><Choice label="折扣金額有小數時" value={rules.money.roundingMode} onChange={(value) => change((draft) => { draft.money.roundingMode = value as MembershipBusinessRules["money"]["roundingMode"]; })}><option value={OWNER_DECISION_REQUIRED}>尚待 Owner 決定</option><option value="round-half-up">四捨五入</option><option value="round-down">無條件捨去</option><option value="round-up">無條件進位</option></Choice></div>
    </section>
  </div>;
}
