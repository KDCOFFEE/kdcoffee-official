"use client";

import { useState } from "react";
import type { MembershipTestLabSnapshot, SimulatedOrder } from "@/lib/membershipTestLab";

type ApiResult = { ok?: boolean; error?: string; result?: unknown; snapshot?: MembershipTestLabSnapshot };

type GuidedBoundaryResult = {
  status: "idle" | "running" | "pass" | "fail";
  checks: Array<{ label: string; ok: boolean; detail: string }>;
};


function formatTaipeiSimulationTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;

  const taipei = new Date(timestamp + 8 * 60 * 60 * 1000);
  const year = taipei.getUTCFullYear();
  const month = String(taipei.getUTCMonth() + 1).padStart(2, "0");
  const day = String(taipei.getUTCDate()).padStart(2, "0");
  const hour = String(taipei.getUTCHours()).padStart(2, "0");
  const minute = String(taipei.getUTCMinutes()).padStart(2, "0");
  const second = String(taipei.getUTCSeconds()).padStart(2, "0");

  return `${year}/${month}/${day} ${hour}:${minute}:${second}`;
}

const ownerScenarioGroups = [
  {
    title: "推薦關係",
    description: "先確認推薦樹與世代關係是否正確，不需要建立真實會員。",
    items: [
      { presetId: "paid-five-level", title: "五代獎金邊界", description: "建立 A → B → C → D → E → F → G；F 驗證 A 的第 5 代獎金，G 驗證第 6 代不得越界。", action: "載入 A～G" },
      { presetId: "inactive-referrer", title: "推薦人資格", description: "檢查推薦人沒有有效定期購時，獎勵資格是否正確阻擋。", action: "測試資格阻擋" },
    ],
  },
  {
    title: "獎勵與等待",
    description: "確認成功取貨後的 Reward、等待期與發放時間。",
    items: [
      { presetId: "new-referral-wait", title: "新推薦等待期", description: "測試新推薦獎勵的等待與可發放日期。", action: "測試等待期" },
      { presetId: "qualification-window", title: "30 天資格期限", description: "檢查推薦獎勵資格是否在設定期限內有效。", action: "測試 30 天期限" },
      { presetId: "pv-five-level", title: "PV 五代計算", description: "用 PV 模式驗證五代獎勵計算。", action: "測試 PV" },
    ],
  },
  {
    title: "安全與上限",
    description: "驗證退款、上限與惡意推薦關係不會破壞正式規則。",
    items: [
      { presetId: "refund-pending", title: "Pending 退款", description: "檢查尚未發放的 Reward 是否正確取消。", action: "測試 Pending 退款" },
      { presetId: "organization-cap", title: "組織獎勵上限", description: "確認總獎勵超過上限時會被限制。", action: "測試組織上限" },
      { presetId: "cycle-attack", title: "循環推薦防護", description: "確認推薦鏈不能形成循環。", action: "測試循環防護" },
    ],
  },
] as const;

const orderStates: Array<{ status: SimulatedOrder["status"]; label: string }> = [
  { status: "preparing", label: "準備中" }, { status: "shipped", label: "已出貨" }, { status: "arrived", label: "已到店" }, { status: "completed", label: "成功取貨" }, { status: "cancelled", label: "取消" }, { status: "uncollected", label: "未取貨" }, { status: "refunded", label: "退款" }, { status: "returned", label: "退貨" },
];


type OwnerSimulatorMember = {
  memberId: string;
  letter: string;
  generation: number;
  purchaseAmount: number;
  pv: number;
  eligible: boolean;
};

type OwnerSimulatorResult = {
  mode: "paid_amount" | "pv";
  rewards: MembershipTestLabSnapshot["rewards"];
  ordersRun: Array<{ memberId: string; orderId: string; purchaseAmount: number; pv: number }>;
};

function createOwnerSimulatorMembers(): OwnerSimulatorMember[] {
  return Array.from({ length: 7 }, (_, index) => ({
    memberId: `SIM_MEMBER_${String.fromCharCode(65 + index)}`,
    letter: String.fromCharCode(65 + index),
    generation: index,
    purchaseAmount: 0,
    pv: index === 6 ? 2000 : 0,
    eligible: true,
  }));
}


function buildOwnerRewardSummary(result: OwnerSimulatorResult) {
  const members = createOwnerSimulatorMembers();

  return members.map((member) => {
    const rewards = result.rewards.filter((reward) => reward.beneficiaryMemberId === member.memberId);
    const total = rewards.reduce((sum, reward) => sum + reward.calculatedCreditAmount, 0);
    const sources = Array.from(
      new Set(
        rewards
          .map((reward) => reward.sourceMemberId?.replace("SIM_MEMBER_", ""))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    return {
      memberId: member.memberId,
      letter: member.letter,
      generation: member.generation,
      total,
      sources,
      rewardCount: rewards.length,
    };
  });
}

export default function MembershipTestLab({ initialSnapshot }: { initialSnapshot: MembershipTestLabSnapshot }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [orderDraft, setOrderDraft] = useState({ memberId: "SIM_MEMBER_F", rewardType: "new_referral", source: "synthetic", productId: "", skuId: "", productName: "測試咖啡", skuLabel: "半磅", quantity: 1, regularUnitPrice: 600, campaignUnitPrice: 480, creditUsed: 0, basePV: 100 });
  const [cycleDays, setCycleDays] = useState(30);
  const [cycleResult, setCycleResult] = useState<{ accepted: boolean; reason: string } | null>(null);
  const [customTime, setCustomTime] = useState(snapshot.state.simulationNow.slice(0, 16));
  const [guidedBoundary, setGuidedBoundary] = useState<GuidedBoundaryResult>({ status: "idle", checks: [] });
  const [simulatorMode, setSimulatorMode] = useState<"paid_amount" | "pv">("pv");
  const [simulatorMembers, setSimulatorMembers] = useState<OwnerSimulatorMember[]>(createOwnerSimulatorMembers);
  const [simulatorResult, setSimulatorResult] = useState<OwnerSimulatorResult | null>(null);


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

  async function callLab(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/membership-test-lab", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json() as ApiResult;
    if (!response.ok) throw new Error(data.error || "模擬操作失敗");
    if (data.snapshot) setSnapshot(data.snapshot);
    return data;
  }


  function updateSimulatorMember(memberId: string, patch: Partial<OwnerSimulatorMember>) {
    setSimulatorMembers((current) => current.map((member) => member.memberId === memberId ? { ...member, ...patch } : member));
  }

  async function runOwnerRewardSimulator() {
    setBusy(true);
    setMessage("");
    setSimulatorResult(null);
    try {
      await callLab({ action: "preset", presetId: simulatorMode === "pv" ? "pv-five-level" : "paid-five-level" });
      await callLab({
        action: "configure",
        input: {
          ruleMode: "scenario-override",
          overrides: {
            calculationMode: simulatorMode,
            requireActiveSubscription: true,
            baseWaitingDays: 0,
            returnProtectionDays: 0,
          },
        },
      });

      for (const member of simulatorMembers) {
        await callLab({
          action: "configure",
          input: {
            memberId: member.memberId,
            activeSubscription: member.eligible,
            subscriptionStatus: member.eligible ? "active" : "inactive",
          },
        });
      }

      const ordersRun: OwnerSimulatorResult["ordersRun"] = [];
      for (const member of simulatorMembers) {
        const basis = simulatorMode === "pv" ? member.pv : member.purchaseAmount;
        if (!(basis > 0)) continue;

        const created = await callLab({
          action: "create-order",
          input: {
            memberId: member.memberId,
            rewardType: "new_referral",
            source: "synthetic",
            productName: `Owner 獎金試算 ${member.letter}`,
            skuLabel: "模擬訂單",
            quantity: 1,
            regularUnitPrice: simulatorMode === "paid_amount"
              ? Math.max(1, Math.round(member.purchaseAmount || 1))
              : 1,
            campaignUnitPrice: null,
            creditUsed: 0,
            basePV: simulatorMode === "pv" ? Math.max(0, member.pv) : 0,
          },
        });
        const order = created.result as SimulatedOrder;
        await callLab({ action: "transition-order", orderId: order.orderId, status: "completed" });
        ordersRun.push({ memberId: member.memberId, orderId: order.orderId, purchaseAmount: member.purchaseAmount, pv: member.pv });
      }

      const latest = await fetch("/api/admin/membership-test-lab", { cache: "no-store" });
      const finalSnapshot = await latest.json() as MembershipTestLabSnapshot;
      if (!latest.ok) throw new Error("無法取得試算結果");
      setSnapshot(finalSnapshot);
      const orderIds = new Set(ordersRun.map((order) => order.orderId));
      setSimulatorResult({
        mode: simulatorMode,
        ordersRun,
        rewards: finalSnapshot.rewards.filter((reward) => orderIds.has(reward.sourceOrderNumber)),
      });
      setMessage(`試算完成：${ordersRun.length} 筆模擬消費，正式 Reward Engine 已完成計算。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "獎金試算失敗");
    } finally {
      setBusy(false);
    }
  }

  async function runFiveLevelRewardBoundary() {
    setBusy(true);
    setMessage("");
    setGuidedBoundary({ status: "running", checks: [] });
    try {
      await callLab({ action: "preset", presetId: "paid-five-level" });

      const fCreated = await callLab({
        action: "create-order",
        input: {
          memberId: "SIM_MEMBER_F",
          rewardType: "new_referral",
          source: "synthetic",
          productName: "五代邊界測試咖啡",
          skuLabel: "半磅",
          quantity: 1,
          regularUnitPrice: 600,
          campaignUnitPrice: 480,
          creditUsed: 0,
          basePV: 100,
        },
      });
      const fOrder = fCreated.result as SimulatedOrder;
      await callLab({ action: "transition-order", orderId: fOrder.orderId, status: "completed" });

      const gCreated = await callLab({
        action: "create-order",
        input: {
          memberId: "SIM_MEMBER_G",
          rewardType: "new_referral",
          source: "synthetic",
          productName: "六代越界測試咖啡",
          skuLabel: "半磅",
          quantity: 1,
          regularUnitPrice: 600,
          campaignUnitPrice: 480,
          creditUsed: 0,
          basePV: 100,
        },
      });
      const gOrder = gCreated.result as SimulatedOrder;
      const completedG = await callLab({ action: "transition-order", orderId: gOrder.orderId, status: "completed" });
      const finalSnapshot = completedG.snapshot;
      if (!finalSnapshot) throw new Error("測試完成但沒有取得最新 Snapshot");

      const members = finalSnapshot.state.members;
      const chainOk = members.length >= 7 && members.slice(0, 7).every((member, index) => {
        if (index === 0) return member.memberId === "SIM_MEMBER_A" && member.referralParentId == null;
        const expectedMember = `SIM_MEMBER_${String.fromCharCode(65 + index)}`;
        const expectedParent = `SIM_MEMBER_${String.fromCharCode(64 + index)}`;
        return member.memberId === expectedMember && member.referralParentId === expectedParent;
      });

      const fRewards = finalSnapshot.rewards.filter((reward) => reward.sourceOrderNumber === fOrder.orderId);
      const gRewards = finalSnapshot.rewards.filter((reward) => reward.sourceOrderNumber === gOrder.orderId);
      const aLevel5 = fRewards.find((reward) => reward.beneficiaryMemberId === "SIM_MEMBER_A" && reward.referralLevel === 5);
      const aFromG = gRewards.find((reward) => reward.beneficiaryMemberId === "SIM_MEMBER_A");
      const maxDepth = finalSnapshot.rules.referral.referralMaxRewardDepth;
      const level5Rule = finalSnapshot.rules.referral.levels.find((level) => level.level === 5);
      const gMaxLevel = gRewards.reduce((max, reward) => Math.max(max, reward.referralLevel), 0);
      const gBeneficiaries = gRewards
        .slice()
        .sort((a, b) => a.referralLevel - b.referralLevel)
        .map((reward) => `${reward.beneficiaryMemberId.replace("SIM_MEMBER_", "")}(第${reward.referralLevel}代 NT$${reward.calculatedCreditAmount})`)
        .join("、");

      const checks = [
        {
          label: "A → G 推薦鏈",
          ok: chainOk,
          detail: chainOk ? "A→B→C→D→E→F→G 關係正確。" : "推薦鏈與預期 A→G 不一致。",
        },
        {
          label: "正式規則最大獎勵深度",
          ok: maxDepth === 5,
          detail: `目前 referralMaxRewardDepth = ${maxDepth}。`,
        },
        {
          label: "F 下單：A 必須拿到第 5 代獎勵",
          ok: Boolean(aLevel5),
          detail: aLevel5
            ? `A = 第5代；實際 Rate ${aLevel5.rewardRate}%（目前第5代規則 ${level5Rule?.newReferralRewardRate ?? "—"}%），Reward NT$${aLevel5.calculatedCreditAmount}。`
            : "F 成功取貨後沒有找到 A 的第5代 Reward。",
        },
        {
          label: "G 下單：A 是第 6 代，不得拿到獎勵",
          ok: !aFromG,
          detail: aFromG ? `錯誤：A 竟然收到第 ${aFromG.referralLevel} 代 Reward。` : "A 沒有出現在 G 訂單的 Reward 中，邊界正確。",
        },
        {
          label: "G 的 Reward 不得超過第 5 代",
          ok: gMaxLevel <= 5,
          detail: gRewards.length ? `實際 Reward：${gBeneficiaries}` : "G 訂單沒有建立 Reward。",
        },
      ];

      const passed = checks.every((check) => check.ok);
      setGuidedBoundary({ status: passed ? "pass" : "fail", checks });
      setMessage(passed ? "五代獎金邊界測試完成：PASS。" : "五代獎金邊界測試完成：有項目 FAIL。");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "模擬操作失敗";
      setGuidedBoundary({ status: "fail", checks: [{ label: "測試執行", ok: false, detail }] });
      setMessage(detail);
    } finally {
      setBusy(false);
    }
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
    <section className="test-lab-stats"><article><small>模擬時間</small><strong>{formatTaipeiSimulationTime(snapshot.state.simulationNow)}</strong></article><article><small>Pending</small><strong>{pending}</strong></article><article><small>Released</small><strong>{released}</strong></article><article><small>Reversed</small><strong>{reversed}</strong></article></section>

    <section className="test-lab-owner-start">
      <div className="test-lab-section-heading">
        <div><p className="test-lab-eyebrow">OWNER QUICK START</p><h2>今天要測什麼？</h2><p>先選一個目的。系統會替你載入對應情境；需要工程參數時，再往下展開進階工具。</p></div>
        <div className="test-lab-safety-note"><strong>安全範圍</strong><span>只操作 SIM_MEMBER 模擬資料，不建立真實會員、訂單或通知。</span></div>
      </div>
      <div className="test-lab-scenario-groups">
        {ownerScenarioGroups.map((group) => <article className="test-lab-scenario-group" key={group.title}>
          <header><h3>{group.title}</h3><p>{group.description}</p></header>
          <div className="test-lab-scenario-list">
            {group.items.map((item) => <button type="button" className="test-lab-scenario-card" key={item.presetId} disabled={busy} onClick={() => action({ action: "preset", presetId: item.presetId }, `已載入：${item.title}`)}>
              <span><strong>{item.title}</strong><small>{item.description}</small></span><b>{item.action} →</b>
            </button>)}
          </div>
        </article>)}
      </div>
    </section>

    <section className="owner-reward-simulator">
        <div className="owner-simulator-heading">
          <div>
            <p className="eyebrow">OWNER REWARD SIMULATOR</p>
            <h2>會員獎金自由試算</h2>
            <p>直接設定 A～G 每位會員的計算基礎與「是否具備領獎資格」。KD Coffee 建議以 PV 為主要獎金基礎，因為不同商品成本與毛利不同；系統仍保留消費金額模式供比較測試。</p>
          </div>
          <div className="owner-simulator-mode" aria-label="獎金計算依據">
            <button type="button" className={simulatorMode === "pv" ? "active" : ""} disabled={busy} onClick={() => setSimulatorMode("pv")}>依 PV（建議）</button>
            <button type="button" className={simulatorMode === "paid_amount" ? "active" : ""} disabled={busy} onClick={() => setSimulatorMode("paid_amount")}>依消費金額（比較）</button>
          </div>
        </div>

        <div className="owner-simulator-note">
          <strong>怎麼用：</strong>只需要填目前選擇的計算基礎。使用 PV 時只看 PV，不看消費金額；使用消費金額時只看金額，不看 PV。「可領獎」代表該會員本身具備領取推薦獎金的資格。0 代表本次不建立該會員訂單。
        </div>

        <div className="owner-simulator-table-wrap">
          <table className="owner-simulator-table">
            <thead>
              <tr>
                <th>會員</th>
                <th>與 A 關係</th>
                {simulatorMode === "pv" ? <th>本次 PV</th> : <th>本次消費 NT$</th>}
                <th>領獎資格</th>
              </tr>
            </thead>
            <tbody>
              {simulatorMembers.map((member) => (
                <tr key={member.memberId}>
                  <td><strong>{member.letter}</strong></td>
                  <td>{member.generation === 0 ? "起點會員" : `第 ${member.generation} 代${member.generation === 6 ? "・邊界" : ""}`}</td>
                  <td>
                    {simulatorMode === "pv" ? (
                      <input type="number" min="0" step="1" value={member.pv} disabled={busy} onChange={(event) => updateSimulatorMember(member.memberId, { pv: Math.max(0, Number(event.target.value) || 0) })} />
                    ) : (
                      <input type="number" min="0" step="1" value={member.purchaseAmount} disabled={busy} onChange={(event) => updateSimulatorMember(member.memberId, { purchaseAmount: Math.max(0, Number(event.target.value) || 0) })} />
                    )}
                  </td>
                  <td>
                    <label className="owner-eligibility-toggle">
                      <input type="checkbox" checked={member.eligible} disabled={busy} onChange={(event) => updateSimulatorMember(member.memberId, { eligible: event.target.checked })} />
                      <span>{member.eligible ? "可領獎 ✓" : "不合格 ✕"}</span>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="owner-simulator-actions">
          <button type="button" className="primary" disabled={busy} onClick={runOwnerRewardSimulator}>{busy ? "試算中…" : "執行獎金試算"}</button>
          <button type="button" disabled={busy} onClick={() => { setSimulatorMembers(createOwnerSimulatorMembers()); setSimulatorResult(null); }}>恢復範例</button>
        </div>

        {simulatorResult ? (
          <div className="owner-simulator-result">
            <div className="owner-result-summary">
              <strong>試算完成</strong>
              <span>{simulatorResult.mode === "pv" ? "依 PV" : "依消費金額"}・{simulatorResult.ordersRun.length} 筆消費・{simulatorResult.rewards.length} 筆獎金</span>
            </div>
            <p className="owner-rate-help"><strong>「獎金比例」是什麼？</strong> 例如 5% 代表該層級使用目前計算基礎 × 5%。畫面顯示的是正式 Reward Engine 的規則值，不再額外乘 100。</p>

            <div className="owner-reward-summary">
              <div className="owner-reward-summary-heading">
                <div>
                  <span className="owner-reward-label">MEMBER REWARD SUMMARY</span>
                  <h3>會員獎金總覽</h3>
                </div>
                <p>先看每位會員這次試算總共領到多少，再往下看每筆明細。</p>
              </div>

              <div className="owner-reward-summary-grid">
                {buildOwnerRewardSummary(simulatorResult).map((member) => (
                  <div className={`owner-reward-summary-card ${member.letter === "A" ? "featured" : ""}`} key={member.memberId}>
                    <div className="owner-reward-summary-member">
                      <strong>{member.letter}</strong>
                      <span>{member.generation === 0 ? "起點會員" : `第 ${member.generation} 代`}</span>
                    </div>
                    <div className="owner-reward-summary-total">
                      <span>本次累計獎金</span>
                      <b>NT${member.total.toLocaleString()}</b>
                    </div>
                    <div className="owner-reward-summary-source">
                      <span>獎金來源</span>
                      <strong>{member.sources.length ? member.sources.join("、") : "—"}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {simulatorResult.ordersRun.length === 0 ? <p>目前沒有輸入任何消費 / PV，因此沒有建立模擬訂單。</p> : null}
            {simulatorResult.ordersRun.map((order) => {
              const purchaser = order.memberId.replace("SIM_MEMBER_", "");
              const rewards = simulatorResult.rewards
                .filter((reward) => reward.sourceOrderNumber === order.orderId)
                .sort((a, b) => a.referralLevel - b.referralLevel);
              return (
                <div className="owner-order-result" key={order.orderId}>
                  <h3>{purchaser} 的消費結果</h3>
                  <p>{simulatorResult.mode === "pv" ? `本次計算基礎：${order.pv.toLocaleString()} PV` : `本次計算基礎：NT$${order.purchaseAmount.toLocaleString()}`}</p>
                  {rewards.length ? (
                    <div className="owner-reward-list">
                      {rewards.map((reward) => (
                        <div key={reward.rewardId} className="owner-reward-row">
                          <div>
                            <strong>{reward.beneficiaryMemberId.replace("SIM_MEMBER_", "")}</strong>
                            <small>第 {reward.referralLevel} 代推薦人</small>
                          </div>
                          <div>
                            <span className="owner-reward-label">獎金比例</span>
                            <strong>{reward.rewardRate.toLocaleString()}%</strong>
                          </div>
                          <div className="owner-reward-formula">
                            {reward.calculationMode === "pv"
                              ? `${reward.effectivePV.toLocaleString()} PV × ${reward.rewardRate.toLocaleString()}%`
                              : `NT$${reward.paidAmountBasis.toLocaleString()} × ${reward.rewardRate.toLocaleString()}%`}
                          </div>
                          <div className="owner-reward-money">
                            <span className="owner-reward-label">實際獎金</span>
                            <b>NT${reward.calculatedCreditAmount.toLocaleString()}</b>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="owner-no-reward">沒有產生 Reward。可能沒有上線、上線不具資格，或已超過五代邊界。</p>}
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="test-lab-guided">
      <div className="test-lab-section-heading">
        <div>
          <p className="test-lab-eyebrow">GUIDED TEST</p>
          <h2>五代獎金邊界測試</h2>
          <p>第 6 代 G 是必要的邊界角色：F 下單時 A 是第 5 代，A 應有 Reward；G 下單時 A 已是第 6 代，A 必須完全沒有 Reward。</p>
        </div>
        <button type="button" className="test-lab-primary-action" disabled={busy} onClick={runFiveLevelRewardBoundary}>
          {guidedBoundary.status === "running" ? "正在驗證…" : "一鍵執行完整邊界測試"}
        </button>
      </div>

      <div className="test-lab-guided-logic">
        <div><strong>測試 1</strong><span>F 成功取貨</span><small>A = 第 5 代 → 應有獎勵</small></div>
        <b>＋</b>
        <div><strong>測試 2</strong><span>G 成功取貨</span><small>A = 第 6 代 → 不得有獎勵</small></div>
        <b>＝</b>
        <div className="boundary-purpose"><strong>邊界驗證</strong><span>只允許 1～5 代</span><small>第 6 代不得越界發放</small></div>
      </div>

      <div className="test-lab-chain-visual">
        {snapshot.state.members.slice(0, 7).map((member, index) => <div className="test-lab-chain-step" key={member.memberId}>
          <div className={`test-lab-chain-node ${index === 6 ? "is-boundary" : ""}`}>
            <strong>{member.name.replace("模擬會員 ", "")}</strong>
            <span>{index === 0 ? "起點" : `第 ${index} 代`}</span>
            <small>{index === 6 ? "第6代：獎金邊界" : member.referralParentId ? `推薦人 ${member.referralParentId.replace("SIM_MEMBER_", "")}` : "沒有推薦人"}</small>
          </div>
          {index < Math.min(snapshot.state.members.length, 7) - 1 ? <b className="test-lab-chain-arrow">→</b> : null}
        </div>)}
      </div>

      {guidedBoundary.status === "idle" ? <div className="test-lab-guided-empty">
        <strong>還沒有執行測試</strong>
        <span>按「一鍵執行完整邊界測試」，系統會自動重建 A～G、讓 F 與 G 各完成一張隔離模擬訂單，再直接判定 PASS / FAIL。</span>
      </div> : <div className={`test-lab-guided-result is-${guidedBoundary.status}`}>
        <div className="test-lab-result-verdict">
          <small>TEST RESULT</small>
          <strong>{guidedBoundary.status === "running" ? "RUNNING" : guidedBoundary.status === "pass" ? "PASS ✓" : "FAIL ✕"}</strong>
        </div>
        <div className="test-lab-result-checks">
          {guidedBoundary.checks.map((check) => <article key={check.label}>
            <b>{check.ok ? "✓" : "✕"}</b>
            <span><strong>{check.label}</strong><small>{check.detail}</small></span>
          </article>)}
        </div>
      </div>}
    </section>

    <details className="test-lab-advanced-presets">
      <summary><span><strong>其他測試情境</strong><small>等待期、退款沖回、上限、定期購週期與防護測試</small></span><b>展開全部情境</b></summary>
      <div className="test-lab-presets"><div>{snapshot.presets.map((preset) => <button type="button" key={preset.id} disabled={busy} onClick={() => action({ action: "preset", presetId: preset.id }, `已載入：${preset.name}`)}>{preset.name}</button>)}</div></div>
    </details>

    <details className="test-lab-engineering-tools">
      <summary><span><strong>工程進階工具</strong><small>只有測試 FAIL 或需要手動調整參數時才展開</small></span><b>展開工具</b></summary>
    <div className="test-lab-workspace">
      <aside className="test-lab-controls">
        <p className="test-lab-eyebrow">ADVANCED</p><h2>進階情境設定</h2><p className="test-lab-muted">只有要調整規則或建立指定模擬訂單時才需要操作這裡。</p>
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
        <p className="test-lab-eyebrow">MEMBER DETAILS</p><h2>會員資格與推薦細節</h2><div className="organization-chain">{snapshot.state.members.map((member, index) => <article key={member.memberId}><div><strong>{member.name.replace("模擬會員 ", "")}</strong><small>{member.memberId}</small></div><label><input type="checkbox" checked={member.activeSubscription} onChange={(event) => configureMember(member.memberId, event.target.checked)} /> Active subscription</label><label>Subscription status<select value={member.subscriptionStatus} onChange={(event) => action({ action: "configure", input: { memberId: member.memberId, subscriptionStatus: event.target.value, activeSubscription: event.target.value === "active" } }, `${member.memberId} status 已更新。`)}><option value="active">Active</option><option value="paused">Paused</option><option value="terminated">Terminated</option></select></label><label>Cycle days<input type="number" min={1} max={365} value={member.cycleDays} onChange={(event) => action({ action: "configure", input: { memberId: member.memberId, cycleDays: Number(event.target.value) } }, `${member.memberId} cycle 已更新。`)} /></label><label>Current credit<input type="number" min={0} value={member.currentCredit} onChange={(event) => action({ action: "configure", input: { memberId: member.memberId, currentCredit: Number(event.target.value) } }, `${member.memberId} 模擬 credit 已更新。`)} /></label><span>推薦人：{member.referralParentId || "無"}</span><span className="eligible">可透過一般或定期購訂單取得 reward 資格</span>{index < snapshot.state.members.length - 1 ? <b>↓ 推薦</b> : null}</article>)}</div>
        <div className="attack-tools"><button type="button" onClick={() => action({ action: "attack", referrerMemberId: "SIM_MEMBER_A", referredMemberId: "SIM_MEMBER_A" }, "自我推薦測試完成。")}>測試自我推薦</button><button type="button" onClick={() => action({ action: "attack", referrerMemberId: "SIM_MEMBER_G", referredMemberId: "SIM_MEMBER_A" }, "循環推薦測試完成。")}>測試循環推薦</button></div>
      </section>

      <aside className="test-lab-results"><p className="test-lab-eyebrow">RESULT</p><h2>獎勵結果</h2><p className="test-lab-muted">成功取貨並符合規則後，這裡才會出現 Reward。只有建立推薦關係時維持空白是正常的。</p>{snapshot.rewards.length ? snapshot.rewards.slice().reverse().map((reward) => <article key={reward.rewardId}><header><strong>{reward.beneficiaryMemberId}</strong><span className={`reward-${reward.status}`}>{reward.status}</span></header><p>第 {reward.referralLevel} 代・{reward.calculationMode === "pv" ? `Effective PV ${reward.effectivePV}` : `實付基礎 NT$${reward.paidAmountBasis}`}</p><b>{reward.rewardRate}% → NT$ {reward.calculatedCreditAmount}</b><small>資格：{reward.qualificationStatus || "legacy"}・{reward.qualificationExpiresAt?.slice(0,10) || "-"} 前下單</small>{reward.qualificationOrderNumber ? <small>資格訂單：{reward.qualificationOrderNumber}・{reward.qualificationOrderCreatedAt?.slice(0,10)}</small> : null}<small>可發放日期：{reward.releaseEligibleBusinessDate?.replaceAll("-", "/") || "資格成功後計算"}</small><small>等待 snapshot：{reward.baseWaitingDaysSnapshot ?? "legacy"} + {reward.returnProtectionDaysSnapshot ?? "legacy"} = {reward.totalWaitingDaysSnapshot ?? "legacy"} 天</small><details><summary>為什麼？</summary><p>{reward.explanation}</p><small>Rule snapshot v{reward.ruleVersion}・Qualification {reward.qualificationWindowDays ?? "legacy"} days・Ancestry {reward.ancestrySnapshot.join(" → ")}</small></details></article>) : <p>完成模擬訂單的「成功取貨」後，這裡會顯示 production resolver 的結果。</p>}</aside>
    </div>

    <section className="test-lab-panel"><h2>模擬訂單與履約流程</h2><p className="test-lab-muted">建立模擬訂單後，依序切換準備、出貨、到店與成功取貨，觀察 Reward 是否按規則產生。</p>{snapshot.state.orders.slice().reverse().map((order) => <article className="sim-order" key={order.orderId}><div><strong>{order.orderId}</strong><span>{order.memberId}・{order.productName}・{order.status}</span><small>Paid basis NT${order.paidAmountBasis}・Base PV {order.basePV}・Effective PV {order.effectivePV}</small></div><div>{orderStates.map((item) => <button type="button" key={item.status} disabled={busy} onClick={() => action({ action: "transition-order", orderId: order.orderId, status: item.status }, `${order.orderId}：${item.label}`)}>{item.label}</button>)}</div></article>)}</section>

    <div className="test-lab-bottom-grid"><section className="test-lab-panel"><h2>模擬時間與到期發放</h2><div className="clock-buttons">{[1, 3, 7, 30].map((days) => <button type="button" key={days} onClick={() => action({ action: "advance-clock", days }, `模擬時間 +${days} 天`)}>+{days} 天</button>)}</div><label>自訂日期時間<input type="datetime-local" value={customTime} onChange={(event) => setCustomTime(event.target.value)} /></label><button type="button" onClick={() => action({ action: "advance-clock", dateTime: new Date(customTime).toISOString() }, "模擬時間已設定。")}>套用模擬時間</button><button type="button" className="run-scheduler" onClick={() => action({ action: "run-scheduler" }, "只執行了 simulation rewards。")}>執行到期獎勵</button></section>
      <section className="test-lab-panel"><h2>定期購週期驗證</h2><div className="cycle-tests">{[19, 20, 30, 45, 60, 90, 120, 121].map((days) => <button type="button" key={days} onClick={() => { setCycleDays(days); setCycleResult(null); }}>{days} 天</button>)}</div><label>自訂天數<input type="number" value={cycleDays} onChange={(event) => setCycleDays(Number(event.target.value))} /></label><button type="button" onClick={testCycle}>使用 production resolver 驗證</button>{cycleResult ? <p className={cycleResult.accepted ? "cycle-accepted" : "cycle-rejected"}>{cycleResult.accepted ? "Accepted" : "Rejected"}：{cycleResult.reason}</p> : null}</section>
      <section className="test-lab-panel"><h2>模擬通知事件</h2><p>以下只顯示「正式流程會建立什麼事件」，全部 delivered = NO。</p>{snapshot.state.simulatedNotifications.map((notice, index) => <p key={`${notice.createdAt}:${index}`}><strong>{notice.eventType}</strong>・{notice.memberId || "Admin"}・未投遞</p>)}</section></div>

    <section className="test-lab-panel"><h2>測試紀錄與技術細節</h2><p className="test-lab-muted">平常只看事件標題即可；需要除錯時再展開 JSON 技術資料。</p>{snapshot.state.timeline.slice().reverse().map((entry) => <details key={entry.timelineId}><summary><time>{formatTaipeiSimulationTime(entry.occurredAt)}</time><strong>{entry.title}</strong></summary><p>{entry.summary}</p>{entry.details ? <pre>{JSON.stringify(entry.details, null, 2)}</pre> : null}</details>)}</section>
    </details>

  </div>;
}
