// Run with node --import ./scripts/gift-frontend-test-bootstrap.mjs.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import * as nodeModule from "node:module";
import os from "node:os";
import path from "node:path";
import type { MediaAsset } from "../lib/media";
import { v2 as cloudinary } from "cloudinary";

const { registerHooks } = nodeModule as typeof nodeModule & {
  registerHooks(hooks: { resolve: nodeModule.ResolveHook }): unknown;
};
const auth = { enabled: false };
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "@/lib/adminAuth") return {
    url: "data:text/javascript," + encodeURIComponent(
      "export const isAdminAuthenticated = () => globalThis.__mediaNamingAuth.enabled; export const readAdminSession = () => null;",
    ),
    shortCircuit: true,
  };
  if (specifier === "react" && context.parentURL?.endsWith("/components/admin/MediaUploader.tsx")) return {
    url: "data:text/javascript," + encodeURIComponent(
      "export const useEffect = () => {}; export const useState = (...args) => globalThis.__mediaUi.useState(...args); export const useRef = (...args) => globalThis.__mediaUi.useRef(...args);",
    ),
    shortCircuit: true,
  };
  return nextResolve(specifier, context);
} });
Object.assign(globalThis, { __mediaNamingAuth: auth });
const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-media1d-"));
process.env.KD_DATA_DIR = root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
process.env.CLOUDINARY_API_KEY = "synthetic";
process.env.CLOUDINARY_API_SECRET = "synthetic-secret";

const cloud = new Map<string, "image" | "video">();
Object.assign(cloudinary.api, {
  resources: async ({ prefix, resource_type }: { prefix: string; resource_type: string }) => ({
    resources: [...cloud].filter(([id, type]) => type === resource_type && id.startsWith(prefix)).map(([public_id]) => ({ public_id })),
  }),
  resource: async (public_id: string) => {
    const resource_type = cloud.get(public_id);
    assert.ok(resource_type, "Only registered synthetic assets may be looked up");
    const format = resource_type === "image" ? "png" : "mp4";
    return { public_id, resource_type, type: "upload", format, bytes: 100, width: 640, height: 360, duration: 5,
      secure_url: `https://res.cloudinary.com/test-cloud/${resource_type}/upload/${public_id}.${format}` };
  },
});

const { POST: sign } = await import("../app/api/admin/media/sign/route");
const { POST: finalize } = await import("../app/api/admin/media/finalize/route");
const { POST: uploadAsset } = await import("../app/api/admin/assets/upload/route");
const { default: MediaUploader } = await import("../components/admin/MediaUploader");
const { mergeProductAssetUpdates } = await import("../lib/productAssetUpdates");
const { getAssetsDataFile, getWebsiteDataFile, getAssetsUploadDir } = await import("../lib/storagePaths");
const works = [{ id: "a", slug: "giotto-awakening" }, { id: "b", slug: "davinci-feast" }];
const legacyId = "kd-coffee/videos/00000000-0000-4000-8000-000000000001";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/kT0AAAAASUVORK5CYII=", "base64");
const json = (body: object) => new Request("http://localhost/api", { method: "POST", body: JSON.stringify(body) });
const store = {
  usage: "product", productSlug: "pour-over-kettle", mediaPurpose: "custom-section", mediaType: "image",
  sectionId: "cs-12345678-1234-4234-8234-123456789abc", fileName: "arbitrary.png", mimeType: "image/png", fileSize: 100,
};
const interpretation = {
  usage: "product", productSlug: works[0].slug, mediaPurpose: "interpretation", mediaType: "video",
  fileName: "arbitrary.mp4", mimeType: "video/mp4", fileSize: 100,
};
async function requestSignature(input: typeof store | typeof interpretation) {
  const response = await sign(json(input));
  assert.equal(response.status, 200);
  const { params, signature } = await response.json();
  assert.equal(params.overwrite, "false");
  assert.equal(signature, cloudinary.utils.api_sign_request(params, "synthetic-secret"));
  return params.public_id as string;
}
function giftUpload(file = new File([png], "相機原始檔.png", { type: "image/png" })) {
  const form = new FormData();
  form.set("create", "true");
  form.set("namingContext", "gifts-hero");
  form.set("file", file);
  return uploadAsset(new Request("http://localhost/api/admin/assets/upload", { method: "POST", body: form }));
}

async function testUploaderLifecycle(
  legacy: MediaAsset,
  mediaType: "image" | "video",
  naming: NonNullable<Parameters<typeof MediaUploader>[0]["productMediaNaming"]>,
) {
  const values: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  let stateIndex = 0, refIndex = 0, draft = legacy;
  let contextKey: string | undefined = "initial";
  Object.assign(globalThis, { __mediaUi: {
    useState(initial: unknown) {
      const index = stateIndex++;
      if (!(index in values)) values[index] = initial;
      return [values[index], (value: unknown) => { values[index] = value; }];
    },
    useRef(initial: unknown) {
      const index = refIndex++;
      return refs[index] ??= { current: initial };
    },
  } });
  type Element = { type: unknown; props: { children?: unknown; accept?: string; onClick?: () => void;
    onChange?: (event: { target: { files: File[]; value: string } }) => void } };
  function find(tree: unknown, condition: (element: Element) => boolean): Element | undefined {
    if (Array.isArray(tree)) {
      for (const item of tree) {
        const match = find(item, condition);
        if (match) return match;
      }
    } else if (tree && typeof tree === "object" && "props" in tree) {
      const element = tree as Element;
      return condition(element) ? element : find(element.props.children, condition);
    }
  }
  function render() {
    stateIndex = refIndex = 0;
    return MediaUploader({ contextKey, value: draft, videoOnly: mediaType === "video", usage: "product",
      productMediaNaming: naming,
      onChange: media => { draft = media; } });
  }
  const file = mediaType === "image"
    ? new File([png], "camera.png", { type: "image/png" })
    : new File(["mock video"], "camera.mp4", { type: "video/mp4" });
  const select = () => find(render(), item => item.type === "input" && Boolean(item.props.accept?.startsWith(mediaType + "/")))!
    .props.onChange!({ target: { files: [file], value: "mock" } });
  const cancel = () => find(render(), item => item.type === "button" && item.props.children === "取消上傳")!.props.onClick!();
  const busy = () => Boolean((render() as { props: { "aria-busy": boolean } }).props["aria-busy"]);
  async function until(condition: () => boolean) {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (condition()) return;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.fail("Mock upload timed out");
  }

  let xhr: MockUpload | undefined;
  class MockUpload {
    upload = {};
    status = 200;
    responseText = "";
    onload?: () => void;
    onabort?: () => void;
    publicId = "";
    open(method: string, url: string) {
      assert.equal(method, "POST");
      assert.equal(url, `https://api.cloudinary.com/v1_1/test-cloud/${mediaType}/upload`);
    }
    send(form: FormData) {
      assert.equal(form.get("overwrite"), "false");
      this.publicId = String(form.get("public_id"));
      xhr = this;
    }
    abort() { this.onabort?.(); }
    complete() {
      assert.ok(!cloud.has(this.publicId), "Mock never overwrites");
      cloud.set(this.publicId, mediaType);
      this.responseText = JSON.stringify({ public_id: this.publicId });
      this.onload?.();
    }
  }
  const originalFetch = globalThis.fetch;
  const originalXHR = globalThis.XMLHttpRequest;
  let finalizeMode: "fail" | "delay" | "success" = "fail";
  let resumeFinalize: (() => void) | undefined;
  globalThis.XMLHttpRequest = MockUpload as unknown as typeof XMLHttpRequest;
  globalThis.fetch = async (input, init) => {
    const request = new Request("http://localhost" + String(input), init);
    if (input === "/api/admin/media/sign") return sign(request);
    assert.equal(input, "/api/admin/media/finalize", "Uploader must not save or delete media");
    if (finalizeMode === "fail") return Response.json({ error: "Synthetic validation failure" }, { status: 503 });
    if (finalizeMode === "delay") await new Promise<void>(resolve => { resumeFinalize = resolve; });
    return finalize(request);
  };
  try {
    select();
    await until(() => !!xhr);
    const cancelledId = xhr!.publicId;
    assert.match(cancelledId, /-v03$/);
    cancel();
    await until(() => !busy());
    assert.equal(draft, legacy);
    assert.ok(!cloud.has(cancelledId));

    xhr = undefined;
    select();
    await until(() => !!xhr);
    assert.equal(xhr!.publicId, cancelledId);
    xhr!.complete();
    await until(() => !busy());
    assert.equal(draft, legacy);
    assert.ok(cloud.has(cancelledId));

    finalizeMode = "delay";
    xhr = undefined;
    select();
    await until(() => !!xhr);
    const lateId = xhr!.publicId;
    assert.match(lateId, /-v04$/);
    xhr!.complete();
    await until(() => !!resumeFinalize);
    cancel();
    resumeFinalize!();
    await until(() => !busy());
    assert.equal(draft, legacy);
    assert.ok(cloud.has(lateId));

    resumeFinalize = undefined;
    xhr = undefined;
    select();
    await until(() => !!xhr);
    assert.match(xhr!.publicId, /-v05$/);
    xhr!.complete();
    await until(() => !!resumeFinalize);
    const edited = { ...legacy, alt: "上傳途中新的人工描述" };
    draft = edited;
    contextKey = "owner-edited";
    render();
    resumeFinalize!();
    await until(() => !busy());
    assert.equal(draft, edited);

    finalizeMode = "success";
    xhr = undefined;
    select();
    await until(() => !!xhr);
    assert.match(xhr!.publicId, /-v06$/);
    xhr!.complete();
    await until(() => !busy());
    assert.match(draft.publicId || "", /-v06$/);

    contextKey = undefined;
    render();
    finalizeMode = "delay";
    resumeFinalize = undefined;
    xhr = undefined;
    select();
    await until(() => !!xhr);
    xhr!.complete();
    await until(() => !!resumeFinalize);
    const selectedLater = { ...legacy, url: "/uploads/assets/misc/newer-selection.png" };
    draft = selectedLater;
    render();
    resumeFinalize!();
    await until(() => !busy());
    assert.equal(draft, selectedLater, "A newer media selection wins even without an explicit contextKey");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.XMLHttpRequest = originalXHR;
  }
}

try {
  assert.ok(path.resolve(getWebsiteDataFile()).startsWith(root + path.sep));
  assert.ok(path.resolve(getAssetsUploadDir("misc")).startsWith(root + path.sep));
  await fs.mkdir(path.dirname(getWebsiteDataFile()), { recursive: true });
  const fakeCms = JSON.stringify({ menu: { products: works } });
  await fs.writeFile(getWebsiteDataFile(), fakeCms);
  await fs.writeFile(getAssetsDataFile(), JSON.stringify({ assets: [], version: 1 }));
  assert.equal((await sign(json(interpretation))).status, 401);
  assert.equal((await finalize(json(interpretation))).status, 401);
  auth.enabled = true;

  const hero = { ...store, storeSlot: "product-hero" };
  const gallery = { ...store, storeSlot: "product-gallery" };
  const heroId = await requestSignature(hero);
  assert.equal(heroId, "kd-coffee/images/kdcoffee-pour-over-kettle-product-hero-1234567856789abc-image-v01");
  assert.equal(await requestSignature(hero), heroId, "An unused signature does not consume a version");
  cloud.set(heroId, "image");
  assert.equal((await finalize(json({ ...hero, publicId: heroId }))).status, 200);
  assert.equal((await finalize(json({ ...gallery, publicId: heroId }))).status, 400);
  const secondHero = await requestSignature(hero);
  assert.match(secondHero, /-image-v02$/);
  cloud.set(secondHero, "image");
  assert.match(await requestSignature(hero), /-image-v03$/);
  const legacyHero: MediaAsset = { type: "image", provider: "local", url: "/uploads/assets/misc/legacy-hero.png" };
  await testUploaderLifecycle(legacyHero, "image", {
    productSlug: hero.productSlug, sectionId: hero.sectionId, mediaPurpose: "custom-section", storeSlot: "product-hero",
  });
  const reopenedHero = await requestSignature({ ...hero, sectionId: "cs-87654321-1234-4234-8234-123456789abc" } as typeof hero);
  assert.match(reopenedHero, /-product-hero-8765432156789abc-image-v01$/);
  assert.notEqual(reopenedHero, heroId);
  const sameFileOtherProduct = await requestSignature({ ...hero, productSlug: "drip-kettle" });
  assert.match(sameFileOtherProduct, /kdcoffee-drip-kettle-.*-image-v01$/);
  const firstGallery = await requestSignature(gallery);
  assert.match(firstGallery, /-product-gallery-1234567856789abc-image-v01$/);
  cloud.set(firstGallery, "image");
  const secondGallery = await requestSignature(gallery);
  assert.match(secondGallery, /-image-v02$/);
  cloud.set(secondGallery, "image");
  assert.match(await requestSignature(gallery), /-image-v03$/);
  assert.match(await requestSignature(store), /-custom-section-1234567856789abc-image-01$/);
  assert.equal((await sign(json({ ...hero, productSlug: "../invalid" }))).status, 400);

  const interpretationId = await requestSignature(interpretation);
  assert.equal(interpretationId, "kd-coffee/videos/kdcoffee-giotto-awakening-interpretation-v01");
  cloud.set(interpretationId, "video");
  const verified = await finalize(json({ ...interpretation, publicId: interpretationId }));
  assert.equal(verified.status, 200);
  const { media } = await verified.json();
  assert.match(media.posterUrl, /interpretation-v01\.jpg/);
  const mobileId = await requestSignature(interpretation);
  assert.match(mobileId, /-interpretation-v02$/);
  cloud.set(mobileId, "video");
  assert.equal((await finalize(json({ ...interpretation, publicId: mobileId }))).status, 200);
  assert.match(await requestSignature(interpretation), /-interpretation-v03$/);
  assert.match(await requestSignature({ ...interpretation, productSlug: works[1].slug }), /davinci-feast-interpretation-v01$/);
  assert.equal((await sign(json({ ...interpretation, productSlug: "valid-but-unknown" }))).status, 400);
  assert.equal((await sign(json({ ...interpretation, productSlug: "../invalid" }))).status, 400);
  assert.equal((await finalize(json({ ...interpretation, productSlug: works[1].slug, publicId: interpretationId }))).status, 400);
  const update = { id: "a", slug: works[0].slug, assets: { galleryDesktopAnimation: { media } } };
  assert.deepEqual(mergeProductAssetUpdates(works, [update])[0].assets, update.assets);
  assert.throws(() => mergeProductAssetUpdates(works, [{ ...update, id: "b" }]), /Slug/);

  cloud.set(legacyId, "video");
  assert.equal((await finalize(json({ usage: "product", publicId: legacyId }))).status, 200);
  const legacy = { ...media, publicId: legacyId, url: "https://example.test/legacy.mp4", posterUrl: "https://example.test/legacy.jpg" };
  await testUploaderLifecycle(legacy, "video", { productSlug: works[0].slug, mediaPurpose: "interpretation" });
  const previous = [{ ...works[0], assets: { galleryDesktopAnimation: { media: legacy } } }];
  assert.deepEqual(mergeProductAssetUpdates(previous, [{ id: "a", cover: "/new-cover.webp" }])[0].assets, previous[0].assets);

  const giftCmsPath = path.join(path.dirname(getWebsiteDataFile()), "../gift-cms/content.json");
  const previousGiftCms = JSON.stringify({ landing: { hero: { image: { url: "/uploads/assets/misc/legacy.png" } } } });
  await fs.mkdir(path.dirname(giftCmsPath), { recursive: true });
  await fs.writeFile(giftCmsPath, previousGiftCms);
  const first = await giftUpload();
  assert.equal(first.status, 200);
  assert.equal((await first.json()).fileName, "kdcoffee-gifts-hero-v01.png");
  const uploads = await Promise.all([giftUpload(), giftUpload()]);
  assert.ok(uploads.some(response => response.status === 200));
  assert.ok(uploads.every(response => [200, 409].includes(response.status)));
  const files = await fs.readdir(getAssetsUploadDir("misc"));
  assert.ok(files.includes("kdcoffee-gifts-hero-v02.png"));
  assert.deepEqual(await fs.readFile(path.join(getAssetsUploadDir("misc"), "kdcoffee-gifts-hero-v01.png")), png);
  assert.equal((await giftUpload(new File(["invalid"], "invalid.txt", { type: "text/plain" }))).status, 400);
  const retry = await giftUpload();
  assert.equal(retry.status, 200);
  const retryVersion = Math.max(...files.map(file => Number(/-v(\d+)\./.exec(file)?.[1]))) + 1;
  assert.equal((await retry.json()).fileName, `kdcoffee-gifts-hero-v${String(retryVersion).padStart(2, "0")}.png`);
  assert.equal(await fs.readFile(giftCmsPath, "utf8"), previousGiftCms);
  assert.equal(await fs.readFile(getWebsiteDataFile(), "utf8"), fakeCms);
  console.log("MEDIA.1D/1E passed: signing, Store tokens, shared Gallery versions, uploader cancellation/finalize/retry, legacy UUID, Gifts collisions and CMS preservation.");
} finally {
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  assert.match(path.basename(root), /^kd-media1d-/);
  await fs.rm(root, { recursive: true, force: true });
}
