import fs from "node:fs";

const source = fs.readFileSync("app/api/member/avatar/route.ts", "utf8");

const checks = [
  ["origin validation remains enabled", source.includes('request.headers.get("origin")')],
  ["direct same-origin remains accepted", source.includes("originUrl.origin === requestUrl.origin")],
  ["forwarded host is supported", source.includes('request.headers.get("x-forwarded-host")')],
  ["forwarded protocol is supported", source.includes('request.headers.get("x-forwarded-proto")')],
  ["malformed origins are rejected", source.includes("catch {") && source.includes("return false;")],
  ["only http and https proxy protocols are accepted", source.includes('protocol !== "http"') && source.includes('protocol !== "https"')],
  ["POST still requires same-origin", source.includes("export async function POST") && source.includes('if (!sameOrigin(request)) return NextResponse.json({ error: "無法確認請求來源" }')],
  ["DELETE still requires same-origin", source.includes("export async function DELETE") && (source.match(/if \(!sameOrigin\(request\)\)/g)?.length ?? 0) >= 2],
  ["member authentication remains required", (source.match(/await getCurrentMember\(\)/g)?.length ?? 0) >= 2],
];

let pass = 0;
for (const [label, ok] of checks) {
  if (!ok) {
    console.error(`FAIL ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${label}`);
    pass += 1;
  }
}

if (process.exitCode) process.exit(1);
console.log(`PHASE J.3C.2B Avatar proxy-origin assertions: ${pass} PASS`);
