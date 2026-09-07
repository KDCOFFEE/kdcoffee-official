import fs from "node:fs";

const media = fs.readFileSync("lib/productMedia.ts", "utf8");

const assertions = [
  [
    "roastedBeanPhoto accepts existing Cloudinary folder IDs",
    media.includes('assetType === "roastedBeanPhoto"') &&
      media.includes('publicId.startsWith(`${CLOUDINARY_VIDEO_FOLDER}/`)'),
  ],
  [
    "other product video fields still require canonical UUID naming",
    media.includes(": PRODUCT_PUBLIC_ID.test(publicId);"),
  ],
  [
    "Cloudinary provider remains mandatory",
    media.includes('value.media.provider !== "cloudinary"'),
  ],
  [
    "server-side Cloudinary verification remains mandatory",
    media.includes('verifyCloudinaryVideo(publicId, "product")'),
  ],
  [
    "verified poster remains mandatory",
    media.includes("if (!verifiedMedia.posterUrl)"),
  ],
  [
    "roasted gallery items still reuse product media verification",
    media.includes('gallery.push(await verifyProductAsset("roastedBeanPhoto", item))'),
  ],
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
if (!process.exitCode) {
  console.log(`PHASE J.4 H4 Existing Cloudinary video ID compatibility assertions: ${passed} PASS`);
}
