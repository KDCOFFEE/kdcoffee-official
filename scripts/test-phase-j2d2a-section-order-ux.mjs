import fs from "node:fs";

const manager = fs.readFileSync("components/admin/HomepageManager.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const checks = [
  ["owner guidance cards", manager.includes("homepage-section-order-guide") && manager.includes("怎麼用") && manager.includes("套用方式")],
  ["clear section identity", manager.includes("homepage-section-order-code") && manager.includes("homepage-section-order-identity")],
  ["status wording", manager.includes("顯示中") && manager.includes("已隱藏")],
  ["desktop and mobile movement controls", manager.includes('aria-label="上移"') && manager.includes('aria-label="下移"')],
  ["drag handle retained", manager.includes("homepage-section-order-drag") && manager.includes("拖曳調整順序")],
  ["card hierarchy css", css.includes(".homepage-section-order-list") && css.includes("border-radius:10px")],
  ["status pill css", css.includes(".homepage-section-order-visible .cms-switch")],
  ["responsive card css", css.includes("@media(max-width:620px)") && css.includes(".homepage-section-order-mobile")],
  ["footer save reminder", manager.includes("排序變更尚未儲存前，不會影響前台")],
];

let pass = 0;
for (const [name, ok] of checks) {
  if (!ok) { console.error(`FAIL ${name}`); process.exitCode = 1; }
  else { console.log(`PASS ${name}`); pass += 1; }
}
if (!process.exitCode) console.log(`PHASE J.2D.2A Section ordering UX assertions: ${pass} PASS`);
