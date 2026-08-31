"use client";

import { createContext, useContext, useState } from "react";
import type { MembershipBusinessRules } from "@/lib/membershipRuleTypes";
import { getAdminRuleHelpDefinition, resolveAdminRuleCurrentValue } from "@/lib/adminRuleHelp";

const Context = createContext<{ rules: MembershipBusinessRules; open: (key: string) => void } | null>(null);

export function AdminRuleHelpProvider({ rules, children }: { rules: MembershipBusinessRules; children: React.ReactNode }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const definition = selectedKey ? getAdminRuleHelpDefinition(selectedKey) : undefined;
  return <Context.Provider value={{ rules, open: setSelectedKey }}>
    {children}
    {selectedKey && definition ? <div className="rule-help-backdrop" role="presentation" onMouseDown={() => setSelectedKey(null)}>
      <section className="rule-help-dialog" role="dialog" aria-modal="true" aria-labelledby="rule-help-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><small>詳細規則說明</small><h2 id="rule-help-title">{definition.title}</h2></div><button type="button" aria-label="關閉詳細說明" onClick={() => setSelectedKey(null)}>×</button></header>
        <dl>
          <div><dt>這個設定是什麼</dt><dd>{definition.summary}</dd></div>
          <div><dt>目前設定值</dt><dd>{resolveAdminRuleCurrentValue(selectedKey, rules)}</dd></div>
          <div><dt>系統實際怎麼執行</dt><dd>{definition.runtimeBehavior}</dd></div>
          <div><dt>判斷時間點</dt><dd>{definition.evaluationTiming}</dd></div>
          <div><dt>具體例子</dt><dd>{definition.example}</dd></div>
          <div><dt>特殊情況</dt><dd><ul>{definition.edgeCases.map((item) => <li key={item}>{item}</li>)}</ul></dd></div>
          <div><dt>相關設定</dt><dd>{definition.relatedRules.length ? definition.relatedRules.map((key) => getAdminRuleHelpDefinition(key)?.title || key).join("、") : "沒有直接相依的 Owner 設定"}</dd></div>
          <div><dt>修改後影響</dt><dd>{definition.historicalImpact}</dd></div>
          <div><dt>已鎖定／歷史資料</dt><dd>{definition.historicalImpact}</dd></div>
          <div><dt>Owner 建議</dt><dd>{definition.ownerRecommendation}</dd></div>
        </dl>
        {process.env.NODE_ENV === "development" && (definition.runtimeSource || definition.evaluatedBy) ? <details><summary>技術依據（開發模式）</summary><p>{definition.runtimeSource || "會員商務核心"}{definition.evaluatedBy ? `・${definition.evaluatedBy}` : ""}</p><code>{definition.runtimeRuleKey}</code></details> : null}
      </section>
    </div> : null}
  </Context.Provider>;
}

export function AdminRuleHelpButton({ ruleKey }: { ruleKey: string }) {
  const context = useContext(Context);
  if (!context || !getAdminRuleHelpDefinition(ruleKey)) return null;
  return <button className="rule-help-button" type="button" aria-label="查看詳細規則說明" onClick={(event) => { event.preventDefault(); event.stopPropagation(); context.open(ruleKey); }}>？<span>詳細說明</span></button>;
}
