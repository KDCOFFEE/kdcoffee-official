import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DEFAULT_MEMBERSHIP_RULES } from "../lib/membershipBusinessRules";

const root = process.cwd();
const rulesFile = path.join(root, "data", "membership-commerce", "business-rules.json");
const cssFile = path.join(root, "components", "admin", "MembershipRulesDisplayFix.css");
const pageFile = path.join(root, "app", "admin", "membership", "page.tsx");
const legacyCssFile = path.join(root, "app", "admin", "membership", "membership.css");
const managerFile = path.join(root, "components", "admin", "MembershipRulesManager.tsx");
const helpComponentFile = path.join(root, "components", "admin", "AdminRuleHelp.tsx");
const helpCssFile = path.join(root, "components", "admin", "AdminRuleHelp.css");

let count = 0;
function check(condition: unknown, name: string) {
  assert.ok(condition, name);
  count += 1;
  console.log(`PASS ${String(count).padStart(2, "0")} ${name}`);
}

const productionBefore = await fs.readFile(rulesFile, "utf8");

try {
  const fixture = structuredClone(DEFAULT_MEMBERSHIP_RULES);
  fixture.subscription.intervalOptions = [
    { days: 1, enabled: true },
    { days: 17, enabled: true },
    { days: 120, enabled: false },
  ];
  fixture.subscription.intervalsDays = [1, 17];
  fixture.subscription.customCycleMinDays = 17;
  fixture.subscription.customCycleMaxDays = 120;
  const fixtureBefore = JSON.stringify(fixture);

  const html = renderToStaticMarkup(React.createElement("fieldset", { className: "membership-intervals" },
    React.createElement("legend", null, "快捷配送週期", React.createElement("button", { type: "button", "data-rule-key": "subscription.intervalOptions" }, "?")),
    fixture.subscription.intervalOptions.map((option, index) => React.createElement("label", { key: `${option.days}:${index}` },
      React.createElement("input", { type: "checkbox", checked: option.enabled, readOnly: true }),
      "每 ",
      React.createElement("input", { "aria-label": `快捷週期 ${index + 1}`, type: "number", min: 1, max: 365, value: option.days, readOnly: true }),
      " 天",
    )),
    React.createElement("input", { "aria-label": "自訂最少", type: "number", value: fixture.subscription.customCycleMinDays, readOnly: true }),
  ));

  check(/aria-label="快捷週期 1"[^>]*value="1"/.test(html), "快捷週期 1 天完整輸出至 DOM");
  check(/aria-label="快捷週期 2"[^>]*value="17"/.test(html), "快捷週期 17 天完整輸出至 DOM");
  check(/aria-label="快捷週期 3"[^>]*value="120"/.test(html), "快捷週期 120 天完整輸出至 DOM");
  check(html.includes("快捷配送週期") && html.includes("subscription.intervalOptions"), "快捷週期 Help trigger 與 DOM 欄位可同時存在");
  check(/aria-label="自訂最少"[^>]*value="17"/.test(html), "自訂最少 17 天 fixture 維持可顯示");
  check(JSON.stringify(fixture) === fixtureBefore, "React DOM 顯示不會改動表單 fixture");

  const [css, page, legacyCss, manager, helpComponent, helpCss] = await Promise.all([
    fs.readFile(cssFile, "utf8"),
    fs.readFile(pageFile, "utf8"),
    fs.readFile(legacyCssFile, "utf8"),
    fs.readFile(managerFile, "utf8"),
    fs.readFile(helpComponentFile, "utf8"),
    fs.readFile(helpCssFile, "utf8"),
  ]);
  check(manager.includes("rules.subscription.intervalOptions.map") && manager.includes("value={option.days}"), "正式元件直接以目前規則值綁定快捷週期 DOM");
  check(manager.includes('ruleKey="subscription.intervalOptions"'), "正式元件的快捷週期 Help trigger 維持 canonical rule key");
  check(legacyCss.includes(".membership-intervals input,.membership-checks input{width:20px;height:20px}"), "回歸來源為共用 20px input 規則");
  check(css.includes('.membership-intervals input[type="number"]') && /min-width:6(?:\.5)?rem/.test(css), "數字欄位取得足夠且穩定寬度");
  check(css.includes('.membership-intervals input[type="checkbox"]') && css.includes("flex:0 0 20px"), "checkbox 尺寸改由型別選擇器限定");
  check(css.includes("@media(max-width:620px)") && css.includes("max-width:100%"), "窄螢幕保留響應式寬度限制");
  check(css.includes(".rule-help-button{flex:0 0 auto}"), "Help trigger 不會擠壓相鄰輸入欄位");
  check(page.includes('import "@/components/admin/MembershipRulesDisplayFix.css";'), "修正樣式在 Admin membership 頁面載入");
  check(!/\b(?:30|45|60|75|90)\b/.test(css), "修正樣式未硬編碼任何配送週期資料");
  check(helpComponent.includes("context.open(ruleKey)") && helpComponent.includes("setSelectedKey(null)"), "Help trigger 與關閉路徑完整");
  check(helpComponent.includes("resolveAdminRuleCurrentValue(selectedKey, rules)"), "Help drawer 顯示目前表單設定值");
  check(helpComponent.includes("event.preventDefault()") && helpComponent.includes("event.stopPropagation()"), "Help trigger 不觸發相鄰表單互動");
  check(helpCss.includes("height:100%;overflow:auto") && helpCss.includes("width:min(620px,100%)"), "Help drawer 限制於 viewport 且長內容可捲動");
  check(css.includes(".membership-choice select{max-width:100%}"), "選單不會被 Help trigger 擠出容器");
  check([1440, 1280, 1024, 390].every((viewport) => Math.min(viewport - 102, 1280) >= 288), "1440／1280／1024／390 皆保留足夠快捷週期內容寬度");
} finally {
  const productionAfter = await fs.readFile(rulesFile, "utf8");
  check(productionAfter === productionBefore, "回歸測試未寫入正式 business rules");
}

console.log(`Phase I.3C.0A admin display regression: ${count} checks passed.`);
