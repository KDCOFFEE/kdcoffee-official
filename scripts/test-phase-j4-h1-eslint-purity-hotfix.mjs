import fs from "node:fs";
const admin = fs.readFileSync("components/admin/ProductManager.tsx", "utf8");
const viewer = fs.readFileSync("components/commerce/RoastedBeanViewer.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const checks = [
  ["J4 upload no longer uses Date.now for roasted IDs", !admin.includes("id:`roasted-${Date.now()}-${gallery.length+1}`")],
  ["uploaded photo ID derives from persisted upload identity", admin.includes("String(x.fileName||x.path||gallery.length+1)")],
  ["video ID derives from media URL", admin.includes("String(media.url||gallery.length+1)")],
  ["unused roastedBeanPhotoPath local removed", !admin.includes("const roastedBeanPhotoPath=staticAssetPath")],
  ["portal target React state removed", !viewer.includes("setPortalTarget") && !viewer.includes("portalTarget")],
  ["document.body.style mutation removed", !viewer.includes("document.body.style.")],
  ["portal still renders into document.body", viewer.includes("createPortal") && viewer.includes("document.body")],
  ["class-based body scroll lock preserved", viewer.includes('document.body.classList.add("roasted-bean-viewer-open")') && css.includes("body.roasted-bean-viewer-open{overflow:hidden}")],
  ["keyboard left/right remains", viewer.includes('event.key === "ArrowLeft"') && viewer.includes('event.key === "ArrowRight"')],
  ["modal thumbnails use active index helper", viewer.includes("setActiveMediaIndex(index)")],
];

let passed = 0;
for (const [label, ok] of checks) {
  if (!ok) {
    console.error(`FAIL ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${label}`);
    passed += 1;
  }
}
if (!process.exitCode) console.log(`PHASE J.4 H1 ESLint purity hotfix assertions: ${passed} PASS`);
