import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [
  ["package.json", "package.json"],
  ["Next.js app", "app/page.tsx"],
  ["作品頁", "app/works/[slug]/page.tsx"],
  ["購物車", "app/cart/page.tsx"],
  ["結帳", "app/checkout/page.tsx"],
  ["LINE 登入", "app/api/auth/line/login/route.ts"],
  ["LINE Callback", "app/api/auth/line/callback/route.ts"],
  ["會員 API", "app/api/member/me/route.ts"],
  ["商品選購", "components/commerce/AddToCart.tsx"],
  ["CartProvider", "components/commerce/CartProvider.tsx"],
  ["網站資料", "public/data/website-data.json"],
];

let passed = 0;
for (const [name, rel] of checks) {
  const ok = fs.existsSync(path.join(root, rel));
  if (ok) passed += 1;
  console.log(`${ok ? "OK" : "MISSING"} | ${name} | ${rel}`);
}

const score = Math.round((passed / checks.length) * 100);
console.log(`\nKD Coffee v14 health score: ${score}/100`);
process.exit(score >= 80 ? 0 : 1);
