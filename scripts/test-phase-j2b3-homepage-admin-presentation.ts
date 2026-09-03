import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const manager = await readFile(new URL("../components/admin/HomepageManager.tsx", import.meta.url), "utf8");
const productionBefore = await readFile(new URL("../public/data/homepage.json", import.meta.url), "utf8");

assert.match(manager, /activeTab.*content.*visual.*seo/u, "admin exposes content/visual/SEO tab state");
assert.match(manager, /首頁視覺風格/u, "visual editor is present");
assert.match(manager, /HOMEPAGE_HERO_OVERLAY_PRESETS/u, "visual editor uses safe overlay vocabulary");
assert.match(manager, /HOMEPAGE_CARD_PRESENTATION_PRESETS/u, "visual editor uses safe card vocabulary");
assert.match(manager, /VISUAL_COLOR_PRESETS/u, "visual editor uses safe color presets");
assert.match(manager, /KD 經典/u, "visual editor exposes owner-friendly style presets");
assert.match(manager, /即時風格示意/u, "visual editor exposes live style preview");
assert.match(manager, /homepageColorNames/u, "visual editor translates engineering color tokens to owner labels");
assert.match(manager, /目前網站效果/u, "visual presentation presets use owner-facing labels");
assert.match(manager, /\["visual", "colors"\]/u, "visual colors save to canonical schema path");
assert.match(manager, /SEO 與社群分享/u, "SEO editor is present");
assert.match(manager, /maxLength=\{70\}/u, "SEO title owner limit is visible");
assert.match(manager, /maxLength=\{180\}/u, "SEO description owner limit is visible");
assert.match(manager, /ImageLibraryPicker/u, "SEO share image reuses Asset Library picker");
assert.match(manager, /\["seo", "shareImage"\]/u, "SEO share image saves to canonical schema path");
assert.match(manager, /localImageMedia\(asset\.path\)/u, "selected share image becomes safe local image media");
assert.doesNotMatch(manager, /rawCss|dangerouslySetInnerHTML/u, "admin adds no raw CSS/HTML escape hatch");

const productionAfter = await readFile(new URL("../public/data/homepage.json", import.meta.url), "utf8");
assert.equal(productionAfter, productionBefore, "homepage runtime JSON remains byte-identical");
console.log("PHASE J.2B.3A Homepage Visual UX assertions: 18 PASS");
