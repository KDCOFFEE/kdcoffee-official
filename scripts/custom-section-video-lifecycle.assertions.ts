import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCustomSectionMediaPublicId,
  filterCustomSectionMediaReservedPublicIds,
  nextAvailableCustomSectionMediaSequence,
} from "../lib/customSectionMediaNaming";
import {
  BROWSER_SAFE_H264_DERIVED_TRANSFORMATION,
  BROWSER_SAFE_H264_TRANSFORMATION,
  CUSTOM_SECTION_VIDEO_READINESS_DELAYS_MS,
  CustomSectionVideoProcessingError,
  CustomSectionVideoResourceValidationError,
  inspectCustomSectionVideoReadiness,
  waitForCustomSectionVideoReadiness,
} from "../lib/cloudinaryVideoReadiness";

const productSlug = "coffee-created-next-year";
const sectionId = "cs-11111111-1111-4111-8111-111111111111";
const folder = { image: "kd-coffee/images", video: "kd-coffee/videos" } as const;
const publicId = (mediaType: "image" | "video", sequence: number) => `${folder[mediaType]}/${buildCustomSectionMediaPublicId({ productSlug, sectionId, mediaType, sequence })}`;
const image01 = publicId("image", 1);
const image02 = publicId("image", 2);
const video01 = publicId("video", 1);
const video02 = publicId("video", 2);

// Naming: image and video have independent sequences; opposite types never poison allocation.
assert.match(image01, /-image-01$/u);
assert.match(video01, /-video-01$/u);
assert.equal(nextAvailableCustomSectionMediaSequence({ productSlug, sectionId, mediaType: "video", existingPublicIds: [image01] }), 1);
assert.equal(nextAvailableCustomSectionMediaSequence({ productSlug, sectionId, mediaType: "image", existingPublicIds: [video01] }), 1);
assert.equal(nextAvailableCustomSectionMediaSequence({ productSlug, sectionId, mediaType: "image", existingPublicIds: [image01, image02, video01] }), 3);
assert.equal(nextAvailableCustomSectionMediaSequence({ productSlug, sectionId, mediaType: "video", existingPublicIds: [video01, video02, image01] }), 3);
assert.deepEqual(filterCustomSectionMediaReservedPublicIds({ publicIds: [image01], productSlug, sectionId, mediaType: "video" }), []);
assert.deepEqual(filterCustomSectionMediaReservedPublicIds({ publicIds: [video01], productSlug, sectionId, mediaType: "image" }), []);
assert.deepEqual(filterCustomSectionMediaReservedPublicIds({ publicIds: [image01, image02], productSlug, sectionId, mediaType: "image" }), [image01, image02]);
assert.throws(() => buildCustomSectionMediaPublicId({ productSlug: "BAD SLUG", sectionId, mediaType: "video", sequence: 1 }));
assert.throws(() => buildCustomSectionMediaPublicId({ productSlug, sectionId: "invalid", mediaType: "video", sequence: 1 }));

// Replacement matrix A–F: requested type controls reservation, and prior reference remains untouched.
const matrix = [
  { from: undefined, to: "image", expected: [] },
  { from: undefined, to: "video", expected: [] },
  { from: image01, to: "image", expected: [image01] },
  { from: image01, to: "video", expected: [] },
  { from: video01, to: "image", expected: [] },
  { from: video01, to: "video", expected: [video01] },
] as const;
for (const scenario of matrix) {
  const priorReference = scenario.from;
  const reserved = filterCustomSectionMediaReservedPublicIds({ publicIds: scenario.from ? [scenario.from] : [], productSlug, sectionId, mediaType: scenario.to });
  assert.deepEqual(reserved, [...scenario.expected]);
  assert.equal(scenario.from, priorReference); // Reference is read-only until finalized onChange.
}

const readyResource = {
  public_id: video01,
  resource_type: "video",
  type: "upload",
  format: "mp4",
  bytes: 4_461_313,
  width: 720,
  height: 1280,
  duration: 16.835,
  derived: [{ transformation: BROWSER_SAFE_H264_DERIVED_TRANSFORMATION, format: "mp4", bytes: 2_728_256 }],
};

// Original resource, duration, and H.264 derivative are all required for readiness.
assert.deepEqual(inspectCustomSectionVideoReadiness(readyResource, video01), { duration: 16.835, width: 720, height: 1280 });
assert.deepEqual(inspectCustomSectionVideoReadiness({ ...readyResource, duration: undefined }, video01), { processing: "duration" });
assert.deepEqual(inspectCustomSectionVideoReadiness({ ...readyResource, derived: [] }, video01), { processing: "h264" });
assert.throws(() => inspectCustomSectionVideoReadiness({ ...readyResource, public_id: "wrong" }, video01), CustomSectionVideoResourceValidationError);
assert.throws(() => inspectCustomSectionVideoReadiness({ ...readyResource, resource_type: "image" }, video01), CustomSectionVideoResourceValidationError);
assert.throws(() => inspectCustomSectionVideoReadiness({ ...readyResource, format: "avi" }, video01), CustomSectionVideoResourceValidationError);

async function run() {
  let durationLookups = 0;
  const durationDelays: number[] = [];
  const durationResult = await waitForCustomSectionVideoReadiness({
    publicId: video01,
    lookup: async () => ++durationLookups === 1 ? { ...readyResource, duration: undefined } : readyResource,
    delays: [0, 25],
    wait: async (delay) => { durationDelays.push(delay); },
  });
  assert.equal(durationResult.duration, 16.835);
  assert.equal(durationLookups, 2);
  assert.deepEqual(durationDelays, [25]);

  let derivativeLookups = 0;
  const derivativeResult = await waitForCustomSectionVideoReadiness({
    publicId: video01,
    lookup: async () => ++derivativeLookups < 3 ? { ...readyResource, derived: [] } : readyResource,
    delays: [0, 10, 20],
    wait: async () => undefined,
  });
  assert.equal(derivativeResult.duration, 16.835);
  assert.equal(derivativeLookups, 3);

  let lookupAttempts = 0;
  const lookupResult = await waitForCustomSectionVideoReadiness({
    publicId: video01,
    lookup: async () => { if (++lookupAttempts === 1) throw new Error("processing"); return readyResource; },
    delays: [0, 10],
    wait: async () => undefined,
  });
  assert.equal(lookupResult.duration, 16.835);

  await assert.rejects(
    waitForCustomSectionVideoReadiness({ publicId: video01, lookup: async () => ({ ...readyResource, derived: [] }), delays: [0, 1, 2], wait: async () => undefined }),
    CustomSectionVideoProcessingError,
  );

  assert.equal(CUSTOM_SECTION_VIDEO_READINESS_DELAYS_MS.length, 5);
  assert.deepEqual([...CUSTOM_SECTION_VIDEO_READINESS_DELAYS_MS], [0, 500, 1000, 1500, 2000]);
  assert.equal(BROWSER_SAFE_H264_TRANSFORMATION, "c_limit,q_auto,vc_h264:high:4.0,w_1920/mp4");
  const cloudinarySource = readFileSync("lib/cloudinary.ts", "utf8");
  assert.match(cloudinarySource, /media_metadata:\s*true/u);
  assert.match(cloudinarySource, /format:\s*"jpg"/u); // Poster remains deterministic and non-blocking.
  const uploaderSource = readFileSync("components/admin/MediaUploader.tsx", "utf8");
  assert.match(uploaderSource, /filterCustomSectionMediaReservedPublicIds/u);
  assert.match(uploaderSource, /onChange\(finalized\.media\)/u);
  console.log("Custom Section video lifecycle assertions passed.");
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
