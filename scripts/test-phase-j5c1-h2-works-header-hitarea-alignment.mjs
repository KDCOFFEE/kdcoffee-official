import fs from "node:fs";

const page = fs.readFileSync("app/works/[slug]/page.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const checks = [
  ["back link is isolated inside a non-clickable left wrapper",
    page.includes('className="revenue-product-nav-left"') &&
    page.includes('className="revenue-product-back-link"')],
  ["left wrapper cannot receive clicks",
    css.includes(".revenue-product-nav .revenue-product-nav-left") &&
    css.includes("pointer-events:none")],
  ["only the actual back link receives pointer events",
    css.includes(".revenue-product-nav .revenue-product-back-link") &&
    css.includes("pointer-events:auto") &&
    css.includes("max-width:max-content")],
  ["desktop header uses true three-column layout",
    css.includes("grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)")],
  ["brand remains explicitly centered",
    css.includes(".revenue-product-nav .brand") &&
    css.includes("justify-self:center")],
  ["right actions remain right aligned",
    css.includes(".revenue-product-nav .revenue-product-nav-actions") &&
    css.includes("justify-content:flex-end")],
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
if (!process.exitCode) console.log(`\nJ.5C.1 H2 targeted regression complete: ${pass} PASS`);
