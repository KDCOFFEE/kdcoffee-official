import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- Node's type-stripping runner requires explicit extensions.
import { createPage, createSection, resolveMobileMediaLayout, validatePageDraft, validatePageStore } from "../lib/pageBuilder.ts";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- Node's type-stripping runner requires explicit extensions.
import { blockVisualStyleVariables, clampTypographySize, DEFAULT_WEBSITE_VISUAL_STYLE, resolveBlockVisualStyle, resolveHeroPlaybackMode, resolveWebsiteVisualStyle, typographyPresetFor, validateBlockVisualStyle, validateWebsiteVisualStyle, websiteVisualStyleVariables } from "../lib/pageBuilderVisualStyle.ts";

const defaults=resolveWebsiteVisualStyle();
assert.deepEqual(defaults,DEFAULT_WEBSITE_VISUAL_STYLE,"missing stored settings use safe runtime defaults");
assert.notEqual(defaults,DEFAULT_WEBSITE_VISUAL_STYLE,"runtime defaults are returned as a separate value");
const legacySmall=resolveWebsiteVisualStyle({...DEFAULT_WEBSITE_VISUAL_STYLE,headingScale:"small",headingDesktopPx:undefined,headingMobilePx:undefined});
assert.equal(legacySmall.headingDesktopPx,48,"legacy preset derives its controlled desktop size without rewriting storage");
assert.equal(legacySmall.headingMobilePx,30,"legacy preset derives its controlled mobile size without rewriting storage");

const style=validateWebsiteVisualStyle({...defaults,headingFont:"premium",autoResponsive:false,desktopHeadingScale:"xlarge",mobileHeadingScale:"small",colors:{...defaults.colors,accent:"#ab8251"}});
const variables=websiteVisualStyleVariables(style) as Record<string,string|number>;
assert.match(String(variables["--pb-heading-font"]),/Georgia/u,"font card maps to a controlled font stack");
assert.equal(variables["--pb-gold"],"#ab8251","controlled custom color becomes a CSS variable");
assert.notEqual(variables["--pb-h1-size-desktop"],variables["--pb-h1-size-mobile"],"manual desktop and mobile sizes stay distinct");
const customStyle=resolveWebsiteVisualStyle({...defaults,headingDesktopPx:71,headingMobilePx:31,headingWrap:"two-lines",headingWidth:"full"});
const customVariables=websiteVisualStyleVariables(customStyle) as Record<string,string|number>;
assert.equal(customVariables["--pb-h1-size-desktop"],"71px","custom desktop heading size reaches the shared renderer");
assert.equal(customVariables["--pb-h1-size-mobile"],"31px","custom mobile heading size reaches the shared renderer independently");
assert.equal(customVariables["--pb-heading-max-width"],"100%","friendly full-width control maps to a controlled width");
assert.deepEqual(["narrow","standard","wide","full"].map(headingWidth=>(websiteVisualStyleVariables({...defaults,headingWidth} as typeof defaults) as Record<string,string>)["--pb-heading-max-width"]),["52%","70%","86%","100%"],"all friendly width choices produce materially distinct renderer values");
assert.equal(customVariables["--pb-h1-color"],"#fff8ef","Hero role uses the on-dark main-heading color");
assert.equal(customVariables["--pb-h2-color"],"#2b211b","section-heading role uses the primary text color");
assert.equal(typographyPresetFor("heading",71,31),"custom","manual values activate the custom selected state");
assert.equal(clampTypographySize("heading","mobile",200),64,"unsafe mobile heading sizes are clamped");
assert.equal(clampTypographySize("body","desktop",8),14,"unsafe body sizes are clamped");

const override={headingFont:"clean",alignment:"center",headingColor:"coffee",primaryButton:"gold"} as const;
assert.doesNotThrow(()=>validateBlockVisualStyle(override),"controlled block override is valid");
assert.equal(resolveBlockVisualStyle(undefined),undefined,"missing block override inherits the website style");
const overrideVariables=blockVisualStyleVariables(override) as Record<string,string|number>;
assert.match(String(overrideVariables["--pb-heading-font"]),/Arial/u,"block override maps through the shared resolver");
assert.equal(overrideVariables["--pb-ink"],"#1c1714","named block color resolves safely");
assert.equal(overrideVariables["--pb-h1-color"],"#1c1714","block color overrides the Hero semantic color");
assert.equal(overrideVariables["--pb-h2-color"],"#1c1714","block color overrides the H2 semantic color");
assert.throws(()=>validateBlockVisualStyle({fontFamily:"Comic Sans"}),/不支援/u,"arbitrary style keys are rejected");
assert.doesNotThrow(()=>validateBlockVisualStyle({headingDesktopPx:44,headingMobilePx:28,headingWrap:"manual",headingWidth:"wide"}),"block custom sizes and wrapping remain controlled");

assert.equal(resolveHeroPlaybackMode(undefined),"click-to-play","legacy Hero video defaults to explicit visitor playback");
assert.equal(resolveHeroPlaybackMode("autoplay-loop"),"autoplay-loop","controlled background playback is retained");
assert.equal(resolveHeroPlaybackMode("unknown"),"click-to-play","unknown playback mode fails safely");

const now=new Date("2026-08-26T12:00:00.000Z");
const page=createPage("視覺設定測試",[],now);
const hero=createSection("hero");
hero.playbackMode="autoplay-loop";
hero.visualStyle={alignment:"right",headingScale:"large"};
page.draft.sections=[hero];
assert.doesNotThrow(()=>validatePageDraft(page.draft),"page draft accepts controlled playback and block style");
assert.doesNotThrow(()=>validatePageStore({version:1,updatedAt:now.toISOString(),visualStyle:style,pages:[page]}),"page store accepts versioned website style");
assert.doesNotThrow(()=>validatePageStore({version:1,updatedAt:now.toISOString(),pages:[page]}),"legacy store without style remains valid");
const story=createSection("mediaText");
assert.equal(resolveMobileMediaLayout(story),"text-first","legacy Media + Text receives the safe mobile default");
story.mobileMediaLayout="media-full";
assert.equal(resolveMobileMediaLayout(story),"media-full","owner mobile composition is resolved independently");

const [manager,studio,renderer,media,publicRoute,previewRoute,pageApi,css]=await Promise.all([
  readFile(new URL("../components/admin/PageBuilderManager.tsx",import.meta.url),"utf8"),
  readFile(new URL("../components/admin/VisualStyleStudio.tsx",import.meta.url),"utf8"),
  readFile(new URL("../components/page-builder/PageBuilderRenderer.tsx",import.meta.url),"utf8"),
  readFile(new URL("../components/media/KdMedia.tsx",import.meta.url),"utf8"),
  readFile(new URL("../app/pages/[slug]/page.tsx",import.meta.url),"utf8"),
  readFile(new URL("../app/admin/pages/[id]/preview/page.tsx",import.meta.url),"utf8"),
  readFile(new URL("../app/api/admin/pages/[id]/route.ts",import.meta.url),"utf8"),
  readFile(new URL("../app/globals.css",import.meta.url),"utf8"),
]);
assert.match(manager,/網站視覺設定/u,"owner editor exposes the Visual Style Studio in Traditional Chinese");
assert.match(manager,/文字與色彩/u,"owner editor exposes optional block styling");
assert.match(studio,/自訂此區塊/u,"block overrides require an explicit owner choice");
assert.match(studio,/目前正在調整/u,"live preview identifies the affected real content");
assert.match(studio,/目前預覽：\{lines\} 行/u,"live preview reports the current line count");
assert.match(studio,/桌機.*px/u,"desktop size is explicit in the owner editor");
assert.match(studio,/手機.*px/u,"mobile size is explicit in the owner editor");
for(const label of ["無動畫","淡入","淡入上升","從左滑入","從右滑入","縮放揭示","編輯式揭示"])assert.match(manager,new RegExp(label,"u"),`${label} is translated for the owner`);
assert.doesNotMatch(manager,/>\{value\}<\/option>/u,"raw animation enum values are not rendered as labels");
assert.doesNotMatch(manager,/毫秒|距離（px）|PAGE CONTENT|影片 ID|不接受 HTML/u,"normal owner workflow avoids developer terminology");
assert.match(studio,/自動循環播放/u,"autoplay mode has a Chinese visual card");
assert.match(studio,/點擊播放/u,"click mode has a Chinese visual card");
assert.match(renderer,/resolveHeroPlaybackMode/u,"shared renderer resolves playback mode");
assert.match(media,/autoPlay=\{backgroundVideo\}/u,"background video uses controlled autoplay");
assert.match(media,/muted=\{backgroundVideo\}/u,"background video is muted");
assert.match(media,/loop=\{backgroundVideo\}/u,"background video loops");
assert.match(media,/playsInline/u,"video stays inline on mobile");
assert.match(media,/controls=\{!backgroundVideo\}/u,"background video hides controls while click video exposes them");
assert.match(manager,/PageBuilderRenderer/u,"owner live preview uses the shared renderer");
assert.match(manager,/文字在上・圖片在下/u,"mobile Media + Text choices are owner-facing");
assert.match(manager,/圖片滿版・文字接續/u,"mobile full-bleed composition is available");
assert.match(manager,/✓ 網頁已更新發布/u,"publish success has a fixed global message");
assert.match(manager,/正式網站已套用最新內容/u,"publish confirmation explains the public result");
assert.match(manager,/⚠ 更新失敗/u,"publish failure has a global message");
assert.match(manager,/role="status" aria-live="polite"/u,"global action feedback is an accessible live region");
assert.match(manager,/setTimeout\(\(\)=>setToast\(null\),4500\)/u,"toast auto-dismisses within the required interval");
assert.match(manager,/requestAnimationFrame\(\(\)=>window\.scrollTo\(\{top:scrollPosition,left:0\}\)\)/u,"save and publish restore the owner's editing position after state refresh");
assert.match(manager,/operation==="publish"\?\{visualStyle\}/u,"publish carries the validated visual settings through the authoritative request");
assert.match(manager,/publishedMatchesDraft/u,"publish state compares the real draft and published snapshot");
assert.match(manager,/publishedMatchesDraft&&!visualStyleDirty\?"✓ 已發布"/u,"new page or visual edits immediately return the publish action to update state");
assert.match(pageApi,/body\.operation === "publish" && body\.visualStyle !== undefined/u,"publish validates visual settings in the authoritative server transaction");
assert.match(publicRoute,/PageBuilderRenderer/u,"public page uses the shared renderer");
assert.match(previewRoute,/PageBuilderRenderer/u,"draft preview uses the shared renderer");
assert.match(publicRoute,/visualStyle=\{store\.visualStyle\}/u,"public page uses stored website style");
assert.match(previewRoute,/visualStyle=\{store\.visualStyle\}/u,"draft preview uses stored website style");
assert.match(css,/overflow:clip/u,"renderer contains page-level overflow");
assert.match(css,/kd-media-play-affordance/u,"click playback has a visible accessible affordance");
assert.match(css,/\.visual-style-sample \.visual-sample-focus\{[^}]*font-size:var\(--owner-preview-size-desktop/u,"the owner sample previews the selected desktop size");
assert.match(css,/\.visual-style-sample\.is-mobile \.visual-sample-focus\{font-size:var\(--owner-preview-size-mobile/u,"the mobile owner sample uses the selected mobile size");
assert.match(css,/data-mobile-layout="media-full"/u,"mobile Media + Text compositions have explicit responsive CSS");
assert.match(css,/page-live-preview-frame\.is-mobile[^}]*--pb-h1-size-mobile/u,"Admin mobile preview applies the same mobile typography variables as the storefront");
assert.match(css,/\.pb-product-state\{[^}]*top:50%[^}]*bottom:auto[^}]*height:16%[^}]*font-size:clamp\(1\.25rem/u,"sold-out state is a centered 16% band with a legible mobile label");
assert.match(css,/data-sold-out="true"[^}]*filter:brightness\(\.91\)/u,"sold-out artwork stays visible with only subtle dimming");
assert.match(css,/\.page-builder-copy h1\{[^}]*color:var\(--pb-h1-color[^}]*font-size:var\(--pb-h1-size-desktop/u,"Hero consumes semantic owner color and desktop size in the shared renderer");
assert.match(css,/\.page-builder-copy h2\{[^}]*color:var\(--pb-h2-color[^}]*font-size:var\(--pb-h2-size-desktop/u,"section H2 consumes semantic owner color and desktop size in the shared renderer");
assert.doesNotMatch(css,/data-sold-out="true"[^}]*opacity:0/u,"sold-out artwork is never blacked out by hiding the image");

console.log("Page Builder visual-style assertions: PASS (defaults, inheritance, controlled tokens, shared renderer, playback, Traditional Chinese owner UI)");
