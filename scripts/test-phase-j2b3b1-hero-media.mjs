import { readFileSync } from "node:fs";

const home = readFileSync("components/home/HomepageV3.tsx", "utf8");
const admin = readFileSync("components/admin/HomepageManager.tsx", "utf8");
const picker = readFileSync("components/admin/HeroMediaLibraryPicker.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");
const data = readFileSync("data/homepageData.ts", "utf8");
const cms = readFileSync("lib/homepageCms.ts", "utf8");
const finalize = readFileSync("app/api/admin/media/finalize/route.ts", "utf8");

const checks = [
  ["desktop type", data.includes("desktopMedia?: MediaAsset")],
  ["mobile type", data.includes("mobileMedia?: MediaAsset")],
  ["desktop validation", cms.includes("hero.desktopMedia")],
  ["mobile validation", cms.includes("hero.mobileMedia")],
  ["desktop prefers desktop then legacy media", home.includes("resolveMediaAsset(hero.desktopMedia) || resolveMediaAsset(hero.media)")],
  ["mobile is independent", home.includes("resolveMediaAsset(hero.mobileMedia)")],
  ["legacy video fallback retained", home.includes("hero.videoWebm || hero.videoMp4")],
  ["legacy poster fallback retained", home.includes("hero.poster ?")],
  ["mobile class exists", home.includes("v3-hero-media-mobile")],
  ["desktop/mobile breakpoint", css.includes(".v3-hero-media-desktop{display:none!important}.v3-hero-media-mobile{display:block!important}")],
  ["admin desktop field", admin.includes('["hero", "desktopMedia"]')],
  ["admin mobile field", admin.includes('["hero", "mobileMedia"]')],
  ["admin library picker", admin.includes("HeroMediaLibraryPicker")],
  ["video scan reuse", picker.includes('/api/admin/media/cleanup')],
  ["existing video finalize", picker.includes('reuseExisting: true')],
  ["existing video safe prefix path", finalize.includes('reuseExisting && publicId.startsWith(`${CLOUDINARY_VIDEO_FOLDER}/`)')],
  ["mobile image upload does not write legacy poster", !admin.includes('uploadHeroImage(file, ["hero", "poster"]')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
if (failed.length) process.exit(1);
console.log(`PHASE J.2B.3B.1 assertions: ${checks.length} PASS`);
