import fs from "node:fs";

const page = fs.readFileSync("app/member/page.tsx", "utf8");
const profile = fs.readFileSync("components/member/MemberProfileForm.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const checks = [
  ["account section opens inline", page.includes('className="member-account-summary" id="account" open')],
  ["account header says direct edit", page.includes("直接編輯")],
  ["duplicate static name card removed", !page.includes('<small>常用姓名</small>\n              <strong>{member.pickupName')],
  ["profile editor is above avatar editor", page.indexOf("<MemberProfileForm") < page.indexOf("<MemberAvatarForm")],
  ["profile form is always editable", !profile.includes("const [editing") && profile.includes('className="member-account-inline-form"')],
  ["name is inline input", profile.includes("常用姓名") && profile.includes("setPickupName")],
  ["phone is inline input", profile.includes("手機號碼") && profile.includes("setPhone")],
  ["email is inline input", profile.includes("Email") && profile.includes("setEmail")],
  ["profile save still uses existing member API", profile.includes('fetch("/api/member/me"') && profile.includes('method: "PATCH"')],
  ["inline account responsive styles exist", css.includes("member-account-field-grid") && css.includes("@media(max-width:700px)")],
  ["legacy edit zone hidden", css.includes(".member-account-edit-zone{display:none!important}")],
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
console.log(`PHASE J.3C.2A Member account inline edit assertions: ${pass} PASS`);
