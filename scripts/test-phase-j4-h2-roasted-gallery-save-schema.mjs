import fs from "node:fs";

const media = fs.readFileSync("lib/productMedia.ts", "utf8");

const assertions = [
  [
    "roastedBeanPhoto is the only J4-added video-capable asset",
    media.includes('"artworkCover",\n  // J.4 H2') &&
      media.includes('"roastedBeanPhoto",') &&
      !media.includes('"facebook",\n  "roastedBeanPhoto"') &&
      !media.includes('"google",\n  "roastedBeanPhoto"') &&
      !media.includes('"line",\n  "roastedBeanPhoto"'),
  ],
  [
    "roasted gallery requires array shape",
    media.includes('if (!Array.isArray(value.gallery))') &&
      media.includes("烘焙豆 Gallery 資料格式不正確。"),
  ],
  [
    "each roasted gallery item requires object shape",
    media.includes('if (!isRecord(item))') &&
      media.includes("烘焙豆 Gallery 媒體項目格式不正確。"),
  ],
  [
    "gallery items reuse trusted product media verification",
    media.includes('gallery.push(await verifyProductAsset("roastedBeanPhoto", item))'),
  ],
  [
    "Cloudinary video verification remains required",
    media.includes('value.media.provider !== "cloudinary"') &&
      media.includes('verifyCloudinaryVideo(publicId, "product")'),
  ],
  [
    "other asset types still use original per-field verification",
    media.includes('assetType === "roastedBeanPhoto"') &&
      media.includes(": verifiedAsset;"),
  ],
  [
    "top-level roasted primary media remains verified",
    media.includes("const verifiedAsset = await verifyProductAsset(assetType, value);"),
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
  console.log(`PHASE J.4 H2 Roasted Gallery save schema assertions: ${passed} PASS`);
}
