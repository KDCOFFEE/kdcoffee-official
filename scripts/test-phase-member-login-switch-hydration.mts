import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  formatTaipeiDate,
  formatTaipeiDateTime,
  formatTaipeiMonthDay,
  formatTaipeiMonthKey,
} from "../lib/memberRewardPresentation";
import { installWorksMotionBootstrap } from "../components/works/WorksMotionBootstrapClient";

let checks = 0;
const check = (condition: unknown, label: string) => {
  assert.ok(condition, label);
  checks += 1;
  console.log(`PASS ${String(checks).padStart(2, "0")} ${label}`);
};

const [layout, bootstrap, runtime, sourceCard, compactCard, referralCenter, orgChart, memberPage, disclosure, logoutRoute, deepLinkTest] = await Promise.all([
  readFile("app/layout.tsx", "utf8"),
  readFile("components/works/WorksMotionBootstrapClient.tsx", "utf8"),
  readFile("components/works/WorksMotionRuntime.tsx", "utf8"),
  readFile("components/member/RewardSourceOrderSummaryCard.tsx", "utf8"),
  readFile("components/member/RewardLedgerCompactCard.tsx", "utf8"),
  readFile("components/member/MemberReferralCenter.tsx", "utf8"),
  readFile("components/member/MemberReferralOrgChart.tsx", "utf8"),
  readFile("app/member/page.tsx", "utf8"),
  readFile("components/member/MemberMobileDisclosure.tsx", "utf8"),
  readFile("app/api/auth/logout/route.ts", "utf8"),
  readFile("scripts/test-phase-member-dashboard-reward-deep-link.mts", "utf8"),
]);

check(!layout.includes("next/script") && !layout.includes("<Script"), "RootLayout no longer renders the next/script Works bootstrap");
check(!bootstrap.includes("<script") && !bootstrap.includes("next/script"), "client bootstrap renders no raw or Next script element");
check(layout.includes('data-works-motion-capable="true"'), "server HTML carries the deterministic Works capability marker before hydration");
check(!layout.includes("suppressHydrationWarning"), "root marker no longer relies on hydration suppression");
check(!/Date\.now\(|Math\.random\(|typeof window/u.test(layout), "RootLayout capability markup has no runtime-dependent render branch");

const listeners = new Map<string, EventListener>();
let fallback: () => void = () => assert.fail("fallback timer was not installed");
let delay = 0;
let cleared = false;
const fakeWindow = {
  addEventListener(type: string, listener: EventListener) { listeners.set(type, listener); },
  removeEventListener(type: string) { listeners.delete(type); },
  setTimeout(callback: () => void, timeout: number) { fallback = callback; delay = timeout; return 17; },
  clearTimeout(timer: number) { cleared = timer === 17; },
};
const readyRoot: { dataset: { worksMotionCapable?: string; worksMotionRuntimeReady?: string } } = { dataset: { worksMotionCapable: "true" } };
const cleanupReady = installWorksMotionBootstrap(readyRoot, fakeWindow as never);
listeners.get("works-motion-runtime-ready")?.(new Event("works-motion-runtime-ready"));
check(readyRoot.dataset.worksMotionRuntimeReady === "true", "runtime-ready event records the Works readiness marker");
check(delay === 1500, "Works runtime failure fallback keeps the existing bounded timeout");
fallback();
check(readyRoot.dataset.worksMotionCapable === "true", "ready runtime retains first-paint capability after the fallback deadline");
cleanupReady();
check(cleared && !listeners.has("works-motion-runtime-ready"), "bootstrap cleanup removes its listener and timer");

const failedRoot: { dataset: { worksMotionCapable?: string; worksMotionRuntimeReady?: string } } = { dataset: { worksMotionCapable: "true" } };
installWorksMotionBootstrap(failedRoot, fakeWindow as never);
fallback();
check(failedRoot.dataset.worksMotionCapable === undefined, "missing Works runtime clears capability at the safety timeout");
check(runtime.includes('if (!beginWorksMotion(node)) return;'), "Works runtime still prevents double animation");
check(runtime.includes('window.dispatchEvent(new Event("works-motion-runtime-ready"))'), "Works runtime still emits its readiness event");
check(runtime.includes("revealAll") && runtime.includes("delete documentRoot.dataset.worksMotionCapable"), "Works runtime fallback cannot leave content permanently hidden");

const expectedTimestamp = "2026/09/18 23:19";
const serverText = formatTaipeiDateTime("2026-09-18T15:19:00Z");
const clientText = formatTaipeiDateTime("2026-09-18T15:19:00.000Z");
check(serverText === expectedTimestamp, "UTC timestamp converts to the required Taipei wall time");
check(clientText === serverText && Buffer.from(clientText).equals(Buffer.from(serverText)), "server/client formatter output is byte-identical");
check(formatTaipeiDateTime("2026-01-02T00:03:00Z") === "2026/01/02 08:03", "Taipei date-time fields are zero-padded");
check(formatTaipeiDate("2026-09-30T16:05:00Z") === "2026/10/01", "date-only output follows Taipei rather than browser timezone");
check(formatTaipeiMonthDay("2026-09-18T15:19:00Z") === "09/18" && formatTaipeiMonthKey("2026-09-30T16:05:00Z") === "2026-10", "compact date and month key share the same deterministic conversion");
check(/^[0-9/: ]+$/u.test(serverText) && !/[\u00A0\u202F]/u.test(serverText), "formatted timestamp uses only ASCII digits, separators, and spaces");
check(formatTaipeiDateTime("invalid") === "歷史資料未記錄" && formatTaipeiDate(null, "待完成取貨後計算") === "待完成取貨後計算", "invalid and historical values use neutral fallbacks");

check(sourceCard.includes("formatTaipeiDateTime(summary.completedAt)") && !sourceCard.includes("Intl.DateTimeFormat"), "source-order created and pickup timestamps use the deterministic formatter");
check(sourceCard.includes("formatTaipeiDate(summary.releaseEligibleBusinessDate") && sourceCard.includes("formatTaipeiDateTime(summary.releasedAt)"), "projected and released source-order dates use deterministic paths");
check(compactCard.includes("formatTaipeiMonthDay(sourceDate)") && compactCard.includes("formatTaipeiDate(transactionDateSource)"), "compact reward dates use the deterministic formatter");
check(compactCard.includes("formatTaipeiDate(qualificationValidUntil)"), "qualification validity uses the deterministic formatter");
check(orgChart.includes("RewardSourceOrderSummaryCard"), "Organization Chart reuses the same stable safe source-order date rendering");
check(![sourceCard, compactCard, referralCenter].some((source) => source.includes("Intl.DateTimeFormat")), "shared reward rendering has no locale-sensitive date formatter");

check(memberPage.includes('export const dynamic = "force-dynamic"') && memberPage.includes("await getCurrentMember()"), "member page is request-dynamic and resolves the current session on every render");
check(memberPage.includes("getMemberCommerceDashboard(member.id)") && memberPage.includes("getMemberReferralCenter(member.id"), "member data and rewards are scoped to the newly authenticated member ID");
check(logoutRoute.includes("await clearMemberSession()") && logoutRoute.includes("303"), "logout clears the prior member session before navigation");
check(disclosure.includes("suppressHydrationWarning") && disclosure.includes("details.open = open"), "existing native disclosure hydration synchronization remains intact");
check(referralCenter.includes("!rewardsSection.hidden") && referralCenter.includes("dialog.showModal()"), "reward dialog retains its visible-section guard and remains interactive");
check(deepLinkTest.includes("Back and Forward") && deepLinkTest.includes("reward dialog"), "reward deep-link and browser-history regression coverage remains connected");
check(!bootstrap.includes("window.location.reload") && !referralCenter.includes("window.location.reload"), "fix introduces no reload-based session or dialog workaround");
check(!bootstrap.includes("membershipCommerce") && !sourceCard.includes("membershipCommerce"), "hydration fix introduces no Reward Engine mutation path");

console.log(`Member login switch hydration checks passed: ${checks}`);
