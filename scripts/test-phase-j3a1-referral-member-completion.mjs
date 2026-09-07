import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");
let passed = 0;
function check(name, condition) { if (!condition) throw new Error(`FAIL ${name}`); console.log(`PASS ${name}`); passed += 1; }
const identity = read("lib/memberIdentity.ts");
const register = read("app/api/auth/email/register/route.ts");
const form = read("components/member/EmailAuthForms.tsx");
const center = read("components/member/MemberReferralCenter.tsx");
const adminAuth = read("lib/adminAuth.ts");
const deleteRoute = read("app/api/admin/members/delete/route.ts");
const deletePanel = read("components/admin/MemberDeletionPanel.tsx");
const commerce = read("lib/membershipCommerce.ts");
check("public member number 1962 + five random digits", identity.includes('`1962${String(randomInt(0, 100_000)).padStart(5, "0")}`'));
check("legacy member numbers remain readable", identity.includes('KD-\\d{6,9}|1962\\d{5}'));
check("registration sends referral code", form.includes('referralCode: new URL(returnTo, window.location.origin).searchParams.get("ref")'));
check("registration validates referral before account creation", register.indexOf("const valid = Object.keys(registry.members)") < register.indexOf("registerEmailMember(email, password)"));
check("registration assigns referral on server", register.includes("await assignReferralByCode({") && register.includes("referralAssigned: Boolean(referralCode)"));
check("member referral center no longer assigns referral in useEffect", !center.includes('method: "POST"'));
check("natural coffee share copy", center.includes("最近喝到一家我很喜歡的咖啡，想分享給你") && !center.includes("這是我的 KD Coffee 推薦連結"));
check("qr image download", center.includes("下載 QR Code 圖片") && center.includes("anchor.download"));
check("zero generations are collapsed", center.includes("levelsWithMembers") && center.includes("levelChoices"));
check("admin password server verification", adminAuth.includes("verifyAdminPassword") && deleteRoute.includes("verifyAdminPassword(password1)"));
check("double password required", deleteRoute.includes("password1 !== password2") && deletePanel.includes("再次輸入管理員密碼"));
check("delete all confirmation phrase", deleteRoute.includes('confirmation !== "刪除全部會員"'));
check("single and all member deletion", deleteRoute.includes('mode === "all"') && deleteRoute.includes("purgeCanonicalMembers"));
check("membership cascade exists", commerce.includes("purgeMembershipCommerceForMembers") && commerce.includes("relationshipIds") && commerce.includes("creditEntryIds"));
check("orders explicitly preserved in owner copy", deletePanel.includes("既有訂單紀錄不會被刪除"));
console.log(`PHASE J.3A.1 Referral/member completion assertions: ${passed} PASS`);
