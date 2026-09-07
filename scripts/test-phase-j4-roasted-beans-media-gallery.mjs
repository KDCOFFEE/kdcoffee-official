import fs from "node:fs";
const admin = fs.readFileSync("components/admin/ProductManager.tsx", "utf8");
const viewer = fs.readFileSync("components/commerce/RoastedBeanViewer.tsx", "utf8");
const page = fs.readFileSync("app/works/[slug]/page.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const assertions = [
  ["admin stores gallery in roastedBeanPhoto", admin.includes("gallery:next") && admin.includes("syncRoastedBeanGallery")],
  ["legacy single photo fallback exists", admin.includes("legacy-roasted-1") && page.includes("legacy-roasted-1")],
  ["image upload appends to gallery", admin.includes("seoPreview.assetKey==='roastedBeanPhoto'")],
  ["video upload appends to gallery", admin.includes("appendRoastedBeanMedia") && admin.includes("新增烘焙豆影片")],
  ["move/delete controls exist", admin.includes("moveRoastedBeanMedia") && admin.includes("removeRoastedBeanMedia")],
  ["first item mirrors to legacy primary", admin.includes("const first=next[0]||null") && admin.includes("media:first?.media||null")],
  ["visibility flag preserved", admin.includes("showRoastedBeanPhoto===true")],
  ["page reads explicit gallery", page.includes("explicitRoastedBeanGallery") && page.includes("roastedBeanAsset.gallery")],
  ["viewer receives gallery items", page.includes("items={roastedBeanMediaItems}")],
  ["viewer supports KdMedia", viewer.includes("KdMedia") && viewer.includes("resolveMediaAsset")],
  ["entry thumbnails exist", viewer.includes("roasted-bean-viewer-entry-thumbs")],
  ["modal thumbnails exist", viewer.includes("roasted-bean-viewer-modal-thumbs")],
  ["previous/next exists", viewer.includes("selectRelative(-1)") && viewer.includes("selectRelative(1)")],
  ["mobile horizontal thumbnail scrolling exists", css.includes("overflow-x:auto") && css.includes(".roasted-bean-viewer-entry-thumbs")],
  ["admin gallery styling exists", css.includes(".roasted-bean-admin-gallery-item")],
  ["lightbox gallery styling exists", css.includes(".roasted-bean-viewer-stage")],
];

let passed = 0;
for (const [name, ok] of assertions) {
  if (!ok) { console.error(`FAIL ${name}`); process.exitCode = 1; }
  else { console.log(`PASS ${name}`); passed += 1; }
}
if (!process.exitCode) console.log(`PHASE J.4 Roasted Beans Media Gallery assertions: ${passed} PASS`);
