import fs from "node:fs";

const controls = fs.readFileSync("components/admin/FulfillmentOrderControls.tsx", "utf8");
const detail = fs.readFileSync("app/admin/orders/[orderNumber]/page.tsx", "utf8");
const overview = fs.readFileSync("app/admin/fulfillment/page.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const checks = [
  ["studio flow is explicit", controls.includes("工作室自取流程") && controls.includes("標記為可以取貨") && controls.includes("確認客人已取貨")],
  ["7-ELEVEN flow labels Gmail-driven steps", controls.includes("Gmail 自動") && controls.includes("收到 7-ELEVEN「賣家完成寄貨」通知後")],
  ["manual 7-ELEVEN controls are exception-only", controls.includes("7-ELEVEN 物流編號與人工例外處理") && controls.includes("人工標記已寄件")],
  ["canonical order status UI is collapsed", detail.includes("系統訂單狀態與進階操作") && detail.includes("訂單主狀態會由履約事件同步更新")],
  ["overview explains Gmail-driven 7-ELEVEN flow", overview.includes("7-ELEVEN 寄件、到店與取貨狀態由 Gmail 通知自動推進")],
  ["overview no longer tells owner to manually ship as normal next action", overview.includes("等待 Gmail 自動確認 →")],
  ["guided flow CSS exists", css.includes("/* J.5C.2 — Guided fulfillment flow */") && css.includes(".guided-fulfillment-timeline")],
];

let pass = 0;
for (const [name, ok] of checks) {
  if (!ok) {
    console.error(`FAIL: ${name}`);
    process.exitCode = 1;
  } else {
    pass += 1;
    console.log(`PASS ${pass}: ${name}`);
  }
}
if (!process.exitCode) console.log(`\nJ.5C.2 targeted regression complete: ${pass} PASS`);
