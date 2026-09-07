import fs from "node:fs";

const admin = fs.readFileSync("components/admin/ProductManager.tsx", "utf8");
const picker = fs.readFileSync("components/admin/HeroMediaLibraryPicker.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const assertions = [
  ["shared picker imported", admin.includes('HeroMediaLibraryPicker from "@/components/admin/HeroMediaLibraryPicker"')],
  ["asset library loaded from existing admin API", admin.includes("fetch('/api/admin/assets'") && admin.includes("setLibraryAssets(")],
  ["roasted gallery has existing-media button", admin.includes("從網站素材庫選擇") && admin.includes("setRoastedLibraryOpen(true)")],
  ["roasted picker uses product verification usage", admin.includes('usage="product"')],
  ["chosen existing media appends to gallery", admin.includes("appendRoastedBeanMedia(media)")],
  ["shared picker keeps hero default", picker.includes('usage = "hero"')],
  ["shared picker supports product usage", picker.includes('usage?: "hero" | "product"')],
  ["Cloudinary reuse verification uses supplied usage", picker.includes('body: JSON.stringify({ publicId: item.publicId, usage, mediaType: "video", reuseExisting: true })')],
  ["existing images remain direct reusable local media", picker.includes("localImageMedia(asset.path)") && picker.includes("onChoose(item.media)")],
  ["picker states media is not re-uploaded", picker.includes("不會重新上傳檔案")],
  ["H3 action styling exists", css.includes(".roasted-bean-admin-gallery-head-actions")],
];

let passed = 0;
for (const [name, ok] of assertions) {
  if (!ok) {
    console.error(`FAIL ${name}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS ${name}`);
    passed += 1;
  }
}
if (!process.exitCode) console.log(`PHASE J.4 H3 Existing media library picker assertions: ${passed} PASS`);
