import fs from "node:fs";
import crypto from "node:crypto";
import ts from "typescript";

// Read-only inventory. No files are written and no application state is loaded.
const files = ["app/member/page.tsx", "app/member/reset-password/page.tsx", ...fs.readdirSync("components/member").filter((name) => /\.(tsx|ts)$/.test(name) && name !== "MemberCenterCopyProvider.tsx").map((name) => `components/member/${name}`), "lib/memberRewardPresentation.ts", "lib/fulfillmentTypes.ts"];
const groups = (file) => /Subscription/.test(file) ? "subscription" : /Qualification/.test(file) ? "qualification" : /OrgChart|Referral|Share/.test(file) ? "referral" : /Reward|Retail/.test(file) ? "rewards" : /Auth|Password/.test(file) ? "login" : /Profile|Avatar/.test(file) ? "account" : /Nav/.test(file) ? "navigation" : "dashboard";
const textValue = (node) => ts.isJsxText(node) ? node.text.replace(/\s+/g, " ").trim() : node.text;
const records = [];
const catalog = new Map();
const chinese = /[\u3400-\u9fff]/u;
const aliases = {
  "訂單成立": "member.orders.fulfillment.orderCreated.label", "已交寄": "member.orders.fulfillment.shipped.label", "已到店": "member.orders.fulfillment.arrived.label", "可以取貨": "member.orders.fulfillment.ready.label", "疑似逾期未取": "member.orders.fulfillment.suspectedUncollected.label", "未取貨": "member.orders.fulfillment.uncollected.label", "需要人工確認": "member.orders.fulfillment.review.label",
  "抵用金": "member.rewards.storeCredit.title", "KD點": "member.rewards.kdPoints.title", "KD 點": "member.rewards.kdPoints.spacedTitle",
  "第 1 代推薦回饋": "member.referral.generation1.title", "第 2 代推薦回饋": "member.referral.generation2.title", "第 3 代推薦回饋": "member.referral.generation3.title",
  "自己的消費": "member.selfPurchase.title", "待入帳回饋": "member.pendingReward.title", "推廣零售回饋": "member.retailPromotion.title", "我的回饋": "member.rewards.title", "我的定期配送": "member.subscription.title",
};
function tokenName(expression, index) {
  const source = expression.getText();
  const fields = [[/remainingToThreshold/, "remainingPoints"], [/cumulativeAmount/, "currentPoints"], [/threshold/, "requiredPoints"], [/referralLevel|generation|level/, "generation"], [/windowDays/, "windowDays"], [/memberName/, "memberName"], [/orderNumber/, "orderNumber"], [/percent|rate/i, "percentage"], [/pointName|pointDisplayName/, "pointName"], [/Date|date|Until|\.at\(/, "date"], [/credit|money|Amount/i, "creditAmount"], [/rewardPV|Points|pointValue/, "kdPoints"], [/tierName/, "tierName"]];
  return fields.find(([pattern]) => pattern.test(source))?.[1] ?? `value${index + 1}`;
}
function template(node) {
  if (!ts.isTemplateExpression(node)) return null;
  const tokens = {};
  let value = node.head.text;
  for (const [index, span] of node.templateSpans.entries()) {
    let name = tokenName(span.expression, index);
    if (name in tokens) name += index + 1;
    tokens[name] = `現有畫面資料：${span.expression.getText().replace(/\s+/g, " ").slice(0, 150)}`;
    value += `{${name}}${span.literal.text}`;
  }
  return { value, tokens };
}
function add(value, tokens, file, line, category) {
  if (!value.trim() || (!chinese.test(value) && !/^[A-Z][A-Z &/]+$/.test(value))) return;
  const group = groups(file);
  const key = aliases[value] ?? `member.${group}.${category}.${crypto.createHash("sha1").update(value).digest("hex").slice(0, 10)}`;
  if (!catalog.has(value)) catalog.set(value, { key, group, purpose: value.replace(/\{\w+\}/g, "…").slice(0, 90), defaultText: value, tokens, multiline: value.length > 60 || value.includes("\n"), sources: [] });
  catalog.get(value).sources.push(`${file}:${line}`);
}
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) {
    if (file === "lib/fulfillmentTypes.ts" && node !== tree && ts.isVariableStatement(node) && !node.declarationList.declarations.some((item) => item.name.getText() === "fulfillmentStateLabels")) return;
    const candidate = ts.isJsxText(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
    const dynamic = ts.isTemplateExpression(node) ? template(node) : null;
    if (candidate || dynamic) {
      const rawValue = dynamic?.value ?? textValue(node);
      const copyBoundary = candidate && ts.isJsxExpression(node.parent) && ts.isJsxAttribute(node.parent.parent) && node.parent.parent.name.getText() === "value" && node.parent.parent.parent.parent.tagName?.getText() === "MemberCopyValue";
      const value = copyBoundary ? rawValue.trim() : rawValue;
      if (value && chinese.test(value) || candidate && (ts.isJsxText(node) || copyBoundary) && /^[A-Z][A-Z &/]+$/.test(value)) {
        const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
        const parent = node.parent;
        const comparison = ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(parent.operatorToken.kind);
        const technical = ts.isLiteralTypeNode(parent) || ts.isImportDeclaration(parent) || comparison || /^(?:\^|\/|https?:|\[)/.test(value);
        const jsxAttribute = ts.isJsxAttribute(parent);
        const category = jsxAttribute ? /title|label/i.test(parent.name.getText()) ? "tooltip" : "hint" : /沒有|尚無|還沒有|未建立/.test(value) ? "emptyState" : /資格/.test(value) ? "qualification" : /回饋|入帳|等待/.test(value) ? "reward" : /查看|儲存|確認|返回|前往|管理|取消|關閉|登入|註冊/.test(value) ? "button" : value.length > 30 ? "description" : "label";
        const classification = technical ? "NOT SAFE TO EDIT" : dynamic ? "DYNAMIC" : file.startsWith("lib/") ? "BUSINESS GENERATED" : "STATIC";
        records.push({ file, line, category, classification, value, tokens: dynamic?.tokens ?? {} });
        if (!technical) add(value, dynamic?.tokens ?? {}, file, line, category);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}
for (const [value] of Object.entries(aliases)) add(value, {}, "components/member/MemberReferralCenter.tsx", 0, "label");
console.log(JSON.stringify({ files, records, catalog: [...catalog.values()] }));
