"use client";

import { useState } from "react";
import type { MembershipTestLabSnapshot, SimulatedOrder } from "@/lib/membershipTestLab";

type ApiResult = { ok?: boolean; error?: string; result?: unknown; snapshot?: MembershipTestLabSnapshot };

const orderStates: Array<{ status: SimulatedOrder["status"]; label: string }> = [
  { status: "preparing", label: "準備中" }, { status: "shipped", label: "已出貨" }, { status: "arrived", label: "已到店" }, { status: "completed", label: "成功取貨" }, { status: "cancelled", label: "取消" }, { status: "uncollected", label: "未取貨" }, { status: "refunded", label: "退款" }, { status: "returned", label: "退貨" },
];

export default function MembershipTestLab({ initialSnapshot }: { initialSnapshot: MembershipTestLabSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [orderDraft, setOrderDraft] = useState({ memberId: "SIM_MEMBER_F", rewardType: "new_referral", source: "synthetic", productId: "", skuId: "", productName: "測試咖啡", skuLabel: "半磅", quantity: 1, regularUnitPrice: 600, campaignUnitPrice: 480, creditUsed: 0, basePV: 100 });
  const [cycleDays, setCycleDays] = useState(30);
  const [cycleResult, setCycleResult] = useState<{ accepted: boolean; reason: string } | null>(null);
  const [customTime, setCustomTime] = useState(snapshot.state.simulationNow.slice(0, 16));

  async function action(body: Record<string, unknown>, success: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/membership-test-lab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as ApiResult;
      if (!response.ok) throw new Error(data.error || "模擬操作失敗");
      if (data.snapshot) setSnapshot(data.snapshot);
      setMessage(success);
      return data.result;
    } catch (error) { setMessage(error instanceof Error ? error.message : "模擬操作失敗"); return null; }
    finally { setBusy(false); }
  }

  async function configureMember(memberId: string, activeSubscription: boolean) {
    await action({ action: "configure", input: { memberId, activeSubscription } }, `${memberId} 的模擬資格已更新。`);
  }

  async function testCycle() {
    const result = await action({ action: "test-cycle", days: cycleDays }, "已使用正式週期 resolver 驗證。") as { accepted: boolean; reason: string } | null;
    if (result) setCycleResult(result);
  }

  async function reset() {
    if (!window.confirm("只會清除 Test Lab 的模擬會員、訂單、reward 與 ledger。確定重設？")) return;
    await action({ action: "reset", confirmation: "CLEAR SIMULATION ONLY" }, "已清除並重建隔離情境。正式資料未受影響。");
  }

  const pending = snapshot.rewards.filter((reward) => reward.status === "scheduled").length;
  const released = snapshot.rewards.filter((reward) => reward.status === "released").length;
  const reversed = snapshot.rewards.filter((reward) => reward.status === "reversed").length;

  return <div className="test-lab-shell">
    <header className="test-lab-hero"><div><p className="test-mode-badge">TEST MODE｜完全隔離</p><h1>KD Coffee 會員制度測試實驗室</h1><p>模擬環境｜不會建立真實會員或訂單，不會寄 LINE／Email，也不會呼叫正式 scheduler 或 webhook。</p></div><button type="button" className="test-reset" onClick={reset} disabled={busy}>重設目前情境</button></header>
    {message ? <p className="test-lab-message" role="status">{message}</p> : null}
    <section className="test-lab-stats"><article><small>模擬時間</small><strong>{new Date(snapshot.state.simulationNow).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</strong></article><article><small>Pending</small><strong>{pending}</strong></article><article><small>Released</small><strong>{released}</strong></article><article><small>Reversed</small><strong>{reversed}</strong></article></section>

    <section className="test-lab-presets"><h2>一鍵情境</h2><div>{snapshot.presets.map((preset) => <button type="button" key={preset.id} disabled={busy} onClick={() => action({ action: "preset", presetId: preset.id }, `已載入：${preset.name}`)}>{preset.name}</button>)}</div></section>

    <div className="test-lab-workspace">
      <aside className="test-lab-controls">
        <h2>情境控制</h2>
        <label>模擬會員人數<select value={snapshot.state.memberCount} onChange={(event) => action({ action: "configure", input: { memberCount: Number(event.target.value) } }, "已重建模擬會員組織。")}>{Array.from({ length: 10 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} 人</option>)}</select></label>
        <label>規則來源<select value={snapshot.state.ruleMode} onChange={(event) => action({ action: "configure", input: { ruleMode: event.target.value } }, "規則來源已更新。") }><option value="current-owner-rules">目前 Owner 正式設定（唯讀）</option><option value="scenario-override">Scenario Override</option></select></label>
        <p className="simulation-only-note">Scenario Override 只套用本次模擬，不影響正式網站。</p>
        <div className="override-grid"><label>計算模式<select value={snapshot.state.overrides.calculationMode || snapshot.rules.referral.referralRewardCalculationMode} onChange={(event) => action({ action: "configure", input: { ruleMode: "scenario-override", overrides: { calculationMode: event.target.value } } }, "模擬計算模式已更新。") }><option value="paid_amount">實付金額</option><option value="pv">PV</option></select></label><label>資格期限天數<input type="number" min={1} value={snapshot.state.overrides.qualificationWindowDays ?? snapshot.rules.referral.referralRewardQualificationWindowDays} onChange={(event) => action({ action: "configure", input: { ruleMode: "scenario-override", overrides: { qualificationWindowDays: Number(event.target.value) } } }, "模擬資格期限已更新。") } /></label><label>基礎等待天數<input type="number" min={0} value={snapshot.state.overrides.baseWaitingDays ?? snapshot.rules.referral.referralRewardBaseWaitingDays} onChange={(event) => action({ action: "configure", input: { ruleMode: "scenario-override", overrides: { baseWaitingDays: Number(event.target.value) } } }, "模擬基礎等待已更新。") } /></label><label>退貨保護天數<input type="number" min={0} value={snapshot.state.overrides.returnProtectionDays ?? snapshot.rules.referral.referralRewardReturnProtectionDays} onChange={(event) => action({ action: "configure", input: { ruleMode: "scenario-override", overrides: { returnProtectionDays: Number(event.target.value) } } }, "模擬退貨保護已更新。") } /></label><div className="test-lab-total"><small>實際總等待</small><strong>{(snapshot.state.overrides.baseWaitingDays ?? snapshot.rules.referral.referralRewardBaseWaitingDays) + (snapshot.state.overrides.returnProtectionDays ?? snapshot.rules.referral.referralRewardReturnProtectionDays)} 天</strong></div><label>組織總上限 %<input type="number" value={snapshot.state.overrides.organizationCap ?? snapshot.rules.referral.referralTotalRewardCap} onChange={(event) => action({ action: "configure", input: { ruleMode: "scenario-override", overrides: { organizationCap: Number(event.target.value) } } }, "模擬組織 cap 已更新。") } /></label><label>單人月上限<input type="number" value={snapshot.state.overrides.monthlyCap ?? snapshot.rules.referral.referralMonthlyCreditCap} onChange={(event) => action({ action: "configure", input: { ruleMode: "scenario-override", overrides: { monthlyCap: Number(event.target.value) } } }, "模擬月 cap 已更新。") } /></label><label>退款／退貨<select value={snapshot.state.overrides.reversalPolicy || snapshot.rules.referral.reversalPolicy} onChange={(event) => action({ action: "configure", input: { ruleMode: "scenario-override", overrides: { reversalPolicy: event.target.value } } }, "模擬沖回政策已更新。") }><option value="cancel-pending-and-reverse-released">取消 pending 並沖回 released</option><option value="cancel-pending-only">只取消 pending</option></select></label></div>
        <h3>建立模擬訂單</h3>
        <label>誰下單<select value={orderDraft.memberId} onChange={(event) => setOrderDraft({ ...orderDraft, memberId: event.target.value })}>{snapshot.state.members.map((member) => <option key={member.memberId} value={member.memberId}>{member.name}</option>)}</select></label>
        <label>Reward 類型<select value={orderDraft.rewardType} onChange={(event) => setOrderDraft({ ...orderDraft, rewardType: event.target.value })}><option value="new_referral">一般訂單／新推薦</option><option value="subscription">定期購週期</option></select></label>
        <label>商品來源<select value={orderDraft.source} onChange={(event) => setOrderDraft({ ...orderDraft, source: event.target.value })}><option value="synthetic">Synthetic Product Mode</option><option value="production-readonly">正式商品規則（唯讀）</option></select></label>
        {orderDraft.source === "synthetic" ? <div className="synthetic-grid"><label>原價<input type="number" value={orderDraft.regularUnitPrice} onChange={(event) => setOrderDraft({ ...orderDraft, regularUnitPrice: Number(event.target.value) })} /></label><label>活動價<input type="number" value={orderDraft.campaignUnitPrice} onChange={(event) => setOrderDraft({ ...orderDraft, campaignUnitPrice: Number(event.target.value) })} /></label><label>使用抵用金<input type="number" value={orderDraft.creditUsed} onChange={(event) => setOrderDraft({ ...orderDraft, creditUsed: Number(event.target.value) })} /></label><label>Base PV<input type="number" value={orderDraft.basePV} onChange={(event) => setOrderDraft({ ...orderDraft, basePV: Number(event.target.value) })} /></label><label>數量<input type="number" min={1} value={orderDraft.quantity} onChange={(event) => setOrderDraft({ ...orderDraft, quantity: Number(event.target.value) })} /></label></div> : <div className="synthetic-grid"><label>正式商品（唯讀）<select value={orderDraft.productId} onChange={(event) => setOrderDraft({ ...orderDraft, productId: event.target.value, skuId: "" })}><option value="">自動選第一個可販售商品</option>{snapshot.productionProducts.map((product) => <option key={product.productId} value={product.productId}>{product.productName}</option>)}</select></label><label>SKU（唯讀）<select value={orderDraft.skuId} onChange={(event) => setOrderDraft({ ...orderDraft, skuId: event.target.value })}><option value="">自動選第一個可用 SKU</option>{snapshot.productionProducts.find((product) => product.productId === orderDraft.productId)?.skus.map((sku) => <option key={sku.skuId} value={sku.skuId}>{sku.skuLabel}・NT${sku.price}・PV {sku.pvEnabled ? sku.pvValue : "未啟用"}</option>)}</select></label><p className="simulation-only-note">只讀正式商品設定，不會寫回價格、庫存或 PV。</p></div>}
        <button type="button" disabled={busy} onClick={() => action({ action: "create-order", input: orderDraft }, "模擬訂單已建立。")}>建立訂單</button>
      </aside>

      <section className="test-lab-organization">
        <h2>模擬推薦組織</h2><div className="organization-chain">{snapshot.state.members.map((member, index) => <article key={member.memberId}><div><strong>{member.name.replace("模擬會員 ", "")}</strong><small>{member.memberId}</small></div><label><input type="checkbox" checked={member.activeSubscription} onChange={(event) => configureMember(member.memberId, event.target.checked)} /> Active subscription</label><label>Subscription status<select value={member.subscriptionStatus} onChange={(event) => action({ action: "configure", input: { memberId: member.memberId, subscriptionStatus: event.target.value, activeSubscription: event.target.value === "active" } }, `${member.memberId} status 已更新。`)}><option value="active">Active</option><option value="paused">Paused</option><option value="terminated">Terminated</option></select></label><label>Cycle days<input type="number" min={1} max={365} value={member.cycleDays} onChange={(event) => action({ action: "configure", input: { memberId: member.memberId, cycleDays: Number(event.target.value) } }, `${member.memberId} cycle 已更新。`)} /></label><label>Current credit<input type="number" min={0} value={member.currentCredit} onChange={(event) => action({ action: "configure", input: { memberId: member.memberId, currentCredit: Number(event.target.value) } }, `${member.memberId} 模擬 credit 已更新。`)} /></label><span>推薦人：{member.referralParentId || "無"}</span><span className="eligible">可透過一般或定期購訂單取得 reward 資格</span>{index < snapshot.state.members.length - 1 ? <b>↓ 推薦</b> : null}</article>)}</div>
        <div className="attack-tools"><button type="button" onClick={() => action({ action: "attack", referrerMemberId: "SIM_MEMBER_A", referredMemberId: "SIM_MEMBER_A" }, "自我推薦測試完成。")}>測試自我推薦</button><button type="button" onClick={() => action({ action: "attack", referrerMemberId: "SIM_MEMBER_G", referredMemberId: "SIM_MEMBER_A" }, "循環推薦測試完成。")}>測試循環推薦</button></div>
      </section>

      <aside className="test-lab-results"><h2>Reward Results</h2>{snapshot.rewards.length ? snapshot.rewards.slice().reverse().map((reward) => <article key={reward.rewardId}><header><strong>{reward.beneficiaryMemberId}</strong><span className={`reward-${reward.status}`}>{reward.status}</span></header><p>第 {reward.referralLevel} 代・{reward.calculationMode === "pv" ? `Effective PV ${reward.effectivePV}` : `實付基礎 NT$${reward.paidAmountBasis}`}</p><b>{reward.rewardRate}% → NT$ {reward.calculatedCreditAmount}</b><small>資格：{reward.qualificationStatus || "legacy"}・{reward.qualificationExpiresAt?.slice(0,10) || "-"} 前下單</small>{reward.qualificationOrderNumber ? <small>資格訂單：{reward.qualificationOrderNumber}・{reward.qualificationOrderCreatedAt?.slice(0,10)}</small> : null}<small>可發放日期：{reward.releaseEligibleBusinessDate?.replaceAll("-", "/") || "資格成功後計算"}</small><small>等待 snapshot：{reward.baseWaitingDaysSnapshot ?? "legacy"} + {reward.returnProtectionDaysSnapshot ?? "legacy"} = {reward.totalWaitingDaysSnapshot ?? "legacy"} 天</small><details><summary>為什麼？</summary><p>{reward.explanation}</p><small>Rule snapshot v{reward.ruleVersion}・Qualification {reward.qualificationWindowDays ?? "legacy"} days・Ancestry {reward.ancestrySnapshot.join(" → ")}</small></details></article>) : <p>完成模擬訂單的「成功取貨」後，這裡會顯示 production resolver 的結果。</p>}</aside>
    </div>

    <section className="test-lab-panel"><h2>模擬訂單與 fulfillment timeline</h2>{snapshot.state.orders.slice().reverse().map((order) => <article className="sim-order" key={order.orderId}><div><strong>{order.orderId}</strong><span>{order.memberId}・{order.productName}・{order.status}</span><small>Paid basis NT${order.paidAmountBasis}・Base PV {order.basePV}・Effective PV {order.effectivePV}</small></div><div>{orderStates.map((item) => <button type="button" key={item.status} disabled={busy} onClick={() => action({ action: "transition-order", orderId: order.orderId, status: item.status }, `${order.orderId}：${item.label}`)}>{item.label}</button>)}</div></article>)}</section>

    <div className="test-lab-bottom-grid"><section className="test-lab-panel"><h2>模擬時間與 scheduler</h2><div className="clock-buttons">{[1, 3, 7, 30].map((days) => <button type="button" key={days} onClick={() => action({ action: "advance-clock", days }, `模擬時間 +${days} 天`)}>+{days} 天</button>)}</div><label>自訂日期時間<input type="datetime-local" value={customTime} onChange={(event) => setCustomTime(event.target.value)} /></label><button type="button" onClick={() => action({ action: "advance-clock", dateTime: new Date(customTime).toISOString() }, "模擬時間已設定。")}>套用模擬時間</button><button type="button" className="run-scheduler" onClick={() => action({ action: "run-scheduler" }, "只執行了 simulation rewards。")}>執行到期獎勵</button></section>
      <section className="test-lab-panel"><h2>Custom cycle resolver</h2><div className="cycle-tests">{[19, 20, 30, 45, 60, 90, 120, 121].map((days) => <button type="button" key={days} onClick={() => { setCycleDays(days); setCycleResult(null); }}>{days} 天</button>)}</div><label>自訂天數<input type="number" value={cycleDays} onChange={(event) => setCycleDays(Number(event.target.value))} /></label><button type="button" onClick={testCycle}>使用 production resolver 驗證</button>{cycleResult ? <p className={cycleResult.accepted ? "cycle-accepted" : "cycle-rejected"}>{cycleResult.accepted ? "Accepted" : "Rejected"}：{cycleResult.reason}</p> : null}</section>
      <section className="test-lab-panel"><h2>模擬通知事件</h2><p>以下只顯示「正式流程會建立什麼事件」，全部 delivered = NO。</p>{snapshot.state.simulatedNotifications.map((notice, index) => <p key={`${notice.createdAt}:${index}`}><strong>{notice.eventType}</strong>・{notice.memberId || "Admin"}・未投遞</p>)}</section></div>

    <section className="test-lab-panel"><h2>Event Timeline／Test Result Inspector</h2>{snapshot.state.timeline.slice().reverse().map((entry) => <details key={entry.timelineId}><summary><time>{new Date(entry.occurredAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</time><strong>{entry.title}</strong></summary><p>{entry.summary}</p>{entry.details ? <pre>{JSON.stringify(entry.details, null, 2)}</pre> : null}</details>)}</section>
  </div>;
}
