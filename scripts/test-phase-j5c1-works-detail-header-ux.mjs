import fs from "node:fs";

const page = fs.readFileSync("app/works/[slug]/page.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const checks = [
  ["works page imports shared MemberLink", page.includes('import MemberLink from "@/components/member/MemberLink";')],
  ["back link has narrow dedicated class", page.includes('className="revenue-product-back-link"')],
  ["right nav groups member and cart", page.includes('className="revenue-product-nav-actions"') && page.includes("<MemberLink />") && page.includes("<CartLink compact />")],
  ["back link is explicitly shrink-wrapped", css.includes(".revenue-product-nav .revenue-product-back-link") && css.includes("width:max-content") && css.includes("justify-self:start")],
  ["member/cart action group is right-aligned", css.includes(".revenue-product-nav .revenue-product-nav-actions") && css.includes("justify-self:end")],
  ["mobile member link remains compact", css.includes("@media(max-width:760px)") && css.includes("padding-inline:6px !important")],
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
if (!process.exitCode) console.log(`\nJ.5C.1 targeted regression complete: ${pass} PASS`);
