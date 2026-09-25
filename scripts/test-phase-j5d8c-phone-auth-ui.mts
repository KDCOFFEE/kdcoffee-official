import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) => fs.readFile(path.join(root, file), "utf8");
const [component, page, email, css, contact, footer] = await Promise.all([
  read("components/member/PhoneAuthForms.tsx"),
  read("app/member/page.tsx"),
  read("components/member/EmailAuthForms.tsx"),
  read("app/globals.css"),
  read("components/home/ContactSection.tsx"),
  read("components/layout/Footer.tsx"),
]);

let checks = 0;
function check(value: unknown, label: string) {
  assert.ok(value, label);
  checks += 1;
  console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`);
}

check(component.includes("export default function PhoneAuthForms"), "phone auth UI component exists");
check(page.includes("<PhoneAuthForms returnTo={returnTo} />"), "phone login entry is visible on the logged-out member page");
check(page.includes("使用 LINE 登入／註冊") && page.includes("/api/auth/line/login"), "LINE login remains present");
check(page.includes("<EmailAuthForms returnTo={returnTo} />") && email.includes("Email 登入"), "Email auth remains present");
check(email.includes("直接使用訪客下單") && email.includes("guest-checkout-button"), "guest checkout remains present");
check(component.includes('mode === "login"') && component.includes("手機號碼"), "phone login mode has a visible phone field");
check(component.includes('autoComplete={mode === "login" ? "current-password" : "new-password"}'), "phone login mode has a password field");
check(component.includes('/api/auth/phone/${mode}') && component.includes('mode === "login"'), "phone login calls the phone login API");
check(component.includes('mode === "register"') && component.includes("建立手機會員"), "registration mode has a phone field");
check(component.includes("設定密碼") && component.includes('autoComplete="new-password"'), "registration mode has a new-password field");
check(component.includes("再次輸入密碼") && component.includes("passwordConfirmation"), "registration has password confirmation");
check(component.includes('/api/auth/phone/${mode}') && component.includes("passwordConfirmation,"), "registration calls the phone register API with confirmation");
check(!/type="email"|Email.*required/iu.test(component), "phone registration contains no Email requirement");
check(!/otp|驗證碼|one-time/iu.test(component), "phone registration contains no OTP input");
check(!/傳送簡訊|寄送簡訊|send.?sms/iu.test(component), "phone registration contains no SMS-send action");
check(component.includes('type="tel"') && component.includes('inputMode="tel"') && component.includes('autoComplete="tel-national"'), "phone field uses mobile-friendly input behavior");
check(/<label>\s*手機號碼/u.test(component), "visible phone label exists");
check(component.includes("密碼至少 8 個字元") && component.includes("minLength={8}"), "existing minimum-password helper is visible");
check(component.includes("此手機號碼已經註冊過，請直接登入。"), "duplicate phone error can be surfaced safely");
check(component.includes("手機號碼或密碼錯誤"), "generic phone login error can be surfaced safely");
check(component.includes("window.location.assign(safeDestination(returnTo))") && component.includes('returnTo === "/checkout"'), "successful login honors a safe returnTo");
check(component.includes('returnTo === "/member"') && component.includes("SAFE_REFERRAL_RETURN.test(returnTo)"), "successful registration honors approved return destinations");
check(component.includes("referralCode:") && component.includes('searchParams.get("ref")'), "valid referral code is preserved for phone registration");
check(/SAFE_REFERRAL_RETURN\.test\(returnTo\)[\s\S]*\? returnTo\s*: "\/member"/u.test(component), "referral code is not accepted from an arbitrary returnTo");
check(component.includes("忘記密碼？") && component.includes('switchMode("recovery")'), "forgot-password entry exists");
check(component.includes("傳訊息給 KD Coffee") && component.includes("協助確認會員資料並重設新密碼"), "recovery view provides KD Coffee human support");
check(!/簡訊.*(?:已寄出|可以重設)|SMS OTP.*(?:available|可用)/iu.test(component), "UI does not claim SMS recovery is currently available");
check(component.includes("不會查看或提供您原本的密碼"), "UI states that old passwords cannot be retrieved");
check(component.includes("人工協助的方式會持續保留"), "manual-support option is explicitly permanent");
check(/<button[^>]*type="(?:button|submit)"/u.test(component) && component.includes("onSubmit={submit}"), "phone auth UI uses keyboard-accessible native controls");
check(component.includes('role="alert"'), "phone errors use an accessible alert role");
check(css.includes(".phone-auth-section{min-width:0;max-width:100%") && css.includes("max-width:100%"), "mobile phone UI prevents horizontal overflow");
check(css.includes(".phone-auth-entry") && css.includes("min-height:54px") && css.includes(".phone-auth-submit") && css.includes("min-height:52px"), "primary phone controls meet comfortable touch sizing");

const canonicalSupportUrl = "https://line.me/R/ti/p/@kdcoffee";
check(contact.includes(`href: "${canonicalSupportUrl}"`) && footer.includes(`href="${canonicalSupportUrl}"`), "canonical support destination is established in existing public UI");
check(component.includes(`PHONE_SUPPORT_URL = "${canonicalSupportUrl}"`), "manual-support action reuses the canonical official LINE destination");
check(component.includes('target="_blank"') && component.includes('rel="noreferrer"'), "support link opens safely");

for (const forbidden of ["app/api/auth/line", "app/api/auth/email", "lib/retailPromotionAttribution.ts", "lib/membershipCommerce.ts", "app/cart", "app/checkout", "app/api/orders"]) {
  const { execFileSync } = await import("node:child_process");
  const changed = execFileSync("git", ["diff", "--name-only", "--", forbidden], { cwd: root, encoding: "utf8" }).trim();
  check(changed === "", `${forbidden} remains unchanged`);
}

console.log(`\nJ.5D.8C phone auth UI: ${checks} checks PASS`);
