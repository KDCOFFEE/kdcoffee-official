import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { getCurrentMonthlyMenuPeriod, getMonthlyMenuPresentation } from "../lib/monthlyMenuPeriod.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { getArtworkMonthForSave, getMonthlyMenuBackgroundPrompt, getTaiwanMonthlyTheme, isArtworkFromAnotherMonth, normalizeMonthlyMenuBackground } from "../lib/monthlyMenuBackground.ts";

let passed = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  console.log(`PASS ${++passed}: ${name}`);
}

const websitePath = path.join(process.cwd(), "public/data/website-data.json");
const websiteBefore = await readFile(websitePath);
const websiteHash = createHash("sha256").update(websiteBefore).digest("hex");
const periodAt = (utc: string) => getCurrentMonthlyMenuPeriod(new Date(utc));

check("Taipei September 1 at 00:05 is September while UTC is still August", periodAt("2026-08-31T16:05:00.000Z").monthKey === "2026-09");
check("Taipei August 31 remains August", periodAt("2026-08-31T15:59:59.000Z").monthKey === "2026-08");
check("Taipei September 30 remains September", periodAt("2026-09-30T15:59:59.000Z").monthKey === "2026-09");
check("Taipei October 1 changes to October", periodAt("2026-09-30T16:00:00.000Z").monthKey === "2026-10");
check("September selection label is derived", periodAt("2026-08-31T16:05:00.000Z").selectionLabel === "2026 SEPTEMBER SELECTION");
check("October selection label is derived", periodAt("2026-09-30T16:00:00.000Z").selectionLabel === "2026 OCTOBER SELECTION");
check("September page and print title is derived", getMonthlyMenuPresentation(periodAt("2026-08-31T16:05:00.000Z")).title === "9 月豆單");
check("August recommendation remains 夏末午後", getTaiwanMonthlyTheme("2026-08")?.title === "夏末午後");
check("September recommendation is 初秋微光", getTaiwanMonthlyTheme("2026-09")?.title === "初秋微光");
check("October has a recommendation", Boolean(getTaiwanMonthlyTheme("2026-10")?.title));
check("all twelve months have complete Taiwan seasonal defaults", Array.from({ length: 12 }, (_, index) => getTaiwanMonthlyTheme(`2026-${String(index + 1).padStart(2, "0")}`)).every((value) => Boolean(value?.title && value.keywords && value.visualDirection)));

const prompt = getMonthlyMenuBackgroundPrompt("2026-09");
check("September prompt uses September's seasonal theme", prompt.includes("初秋微光") && prompt.includes("微涼晨風") && prompt.includes("初秋空氣"));
check("prompt forbids month, year, date, and selection label inside artwork", prompt.includes("Do NOT render any month, year, date, YYYY-MM, English month name, Chinese month number, or selection label"));
check("prompt reserves month typography for website and print", prompt.includes("website and print layout supply all month and year typography outside the artwork"));
check("prompt permits only seasonal theme text inside artwork", prompt.includes("The ONLY text allowed inside the artwork is this exact seasonal theme title: 初秋微光"));

const historical = JSON.parse(websiteBefore.toString("utf8"));
const selectedBefore = historical.menu.products.filter((product: { inMonthlyMenu?: boolean }) => product.inMonthlyMenu === true).map((product: { slug: string }) => product.slug);
const originalMenu = JSON.stringify(historical.menu);
historical.menu.monthKey = "2026-08";
historical.menu.monthLabel = "2026 AUGUST SELECTION";
const active = periodAt("2026-08-31T16:05:00.000Z");
check("stale saved August fields do not determine September", active.monthKey === "2026-09" && getMonthlyMenuPresentation(active).label === "2026 SEPTEMBER SELECTION");
check("month derivation does not change selected products or order", JSON.stringify(historical.menu.products.filter((product: { inMonthlyMenu?: boolean }) => product.inMonthlyMenu === true).map((product: { slug: string }) => product.slug)) === JSON.stringify(selectedBefore));
check("month derivation does not mutate persisted menu", JSON.stringify(JSON.parse(websiteBefore.toString("utf8")).menu) === originalMenu);

const oldImage = "/uploads/artworks/monthly-menu/kdcoffee-monthly-menu-background-v01.webp";
const newImage = "/uploads/artworks/monthly-menu/kdcoffee-monthly-menu-background-v02.webp";
const historicalArtwork = normalizeMonthlyMenuBackground({ image: oldImage, opacity: 1, position: "auto", fit: "cover" });
check("historical artwork remains referenced without an invented month", historicalArtwork.image === oldImage && historicalArtwork.artworkMonthKey === undefined);
check("saving unchanged historical artwork preserves unknown month", getArtworkMonthForSave(historicalArtwork, oldImage, "2026-09") === undefined);
check("new artwork gets current month metadata", getArtworkMonthForSave(historicalArtwork, newImage, "2026-09") === "2026-09");
check("later saves keep the artwork's original month", getArtworkMonthForSave({ ...historicalArtwork, artworkMonthKey: "2026-08" }, oldImage, "2026-09") === "2026-08");
check("dated old artwork warns after rollover but is retained", isArtworkFromAnotherMonth({ ...historicalArtwork, artworkMonthKey: "2026-08" }, "2026-09") && historicalArtwork.image === oldImage);
check("undated historical artwork does not make an unreliable warning", !isArtworkFromAnotherMonth(historicalArtwork, "2026-09"));

const source = async (file: string) => readFile(path.join(process.cwd(), file), "utf8");
const publicPage = await source("app/monthly-menu/page.tsx");
const printButton = await source("components/monthly-menu/MonthlyMenuPrintButton.tsx");
const adminRoute = await source("app/api/admin/monthly-menu/route.ts");
const adminManager = await source("components/admin/MonthlyMenuBackgroundManager.tsx");
const worksPage = await source("app/works/page.tsx");
const worksStore = await source("lib/worksPageAdminStore.ts");
const productsRoute = await source("app/api/admin/products/route.ts");
check("public page takes current period and retains selected-product pipeline", publicPage.includes("getCurrentMonthlyMenuPeriod()") && publicPage.includes("getMonthlyArtworks(live.menu.products)") && !publicPage.includes("live.menu.monthKey"));
check("print image and filename use the same derived period", publicPage.includes("period={period}") && printButton.includes("period.monthKey") && printButton.includes("context.fillText(`${monthIssue}"));
check("Admin API exposes current month instead of saved month", adminRoute.includes("currentMonth = getCurrentMonthlyMenuPeriod()") && adminRoute.includes("monthKey: currentMonth.monthKey") && !adminRoute.includes("website.menu?.monthKey"));
check("Admin warning follows saved artwork month without removing image", adminManager.includes("isArtworkFromAnotherMonth") && adminManager.includes("background.image") && !adminManager.includes("setBackground(DEFAULT_MONTHLY_MENU_BACKGROUND)"));
check("Works public and Admin monthly labels use current period", worksPage.includes("getCurrentMonthlyMenuPeriod().selectionLabel") && worksStore.includes("getCurrentMonthlyMenuPeriod().selectionLabel"));
check("product Admin read response no longer falls back to August", productsRoute.includes("monthKey: currentMonth.monthKey") && !productsRoute.includes('monthKey: menu.monthKey || "2026-08"'));
check("Owner artwork replacement remains a manual upload and save", adminManager.includes("/api/admin/homepage/upload") && adminManager.includes("onClick={save}") && adminManager.includes("readOnly value={prompt}"));

const websiteAfter = await readFile(websitePath);
check("protected website data remains byte-identical", createHash("sha256").update(websiteAfter).digest("hex") === websiteHash);
console.log(`Phase F.1C.6 monthly menu: ${passed} PASS`);
