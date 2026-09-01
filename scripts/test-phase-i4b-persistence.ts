import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

// @ts-expect-error -- Node's type-stripping test runner requires explicit TypeScript extensions.
const storage = await import("../lib/storagePaths.ts");
// @ts-expect-error -- Node's type-stripping test runner requires explicit TypeScript extensions.
const bootstrap = await import("../lib/persistentStorageInit.ts");
// @ts-expect-error -- Node's type-stripping test runner requires explicit TypeScript extensions.
const assets = await import("../lib/assets.ts");
// @ts-expect-error -- Node's type-stripping test runner requires explicit TypeScript extensions.
const fulfillment = await import("../lib/fulfillment.ts");
// @ts-expect-error -- Node's type-stripping test runner requires explicit TypeScript extensions.
const commerce = await import("../lib/membershipCommerce.ts");

const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "kd-phase-i4b-"));
const envKeys = [
  "KD_DATA_DIR",
  "RAILWAY_VOLUME_MOUNT_PATH",
  "RAILWAY_PROJECT_ID",
  "RAILWAY_ENVIRONMENT_ID",
  "RAILWAY_SERVICE_ID",
  "RAILWAY_VOLUME_NAME",
  "NODE_ENV",
] as const;
const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
let checks = 0;

const protectedHashes = new Map([
  ["data/orders/KD20260831-6077.json", "07931ba7f046711f49d2dfa509b02c775d213da97f80c3a8c39637abfa03e055"],
  ["data/orders/KD20260831-9263.json", "66aa9448e24b083978ff2d9801751d0bd106bba2e996bb1deadb51e64add6536"],
  ["data/membership-commerce/commerce-state.json", "2d974f178c309ba2cff6f88dbf3be9451f19b502eb5d5ccb3ca3b00ddc046012"],
  ["data/fulfillment/state.json", "87580361fd3d7c898fa2b87196e6569284c8849ce6775ddb5f0cb69b30dde4fd"],
  ["public/data/website-data.json", "7fbbef961715cdb47d5691dbf8c1608d6c8fefd2610e7dcb24f2a72b65f5a5e0"],
]);

function setEnvironment(values: Partial<Record<(typeof envKeys)[number], string>>) {
  for (const key of envKeys) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

type FixtureOptions = {
  corruptFile?: string;
  missingMedia?: boolean;
  traversal?: boolean;
};

async function createSeedFixture(name: string, options: FixtureOptions = {}) {
  const publicDir = path.join(temporaryRoot, name, "public");
  const dataDir = path.join(publicDir, "data");
  const documents: Record<string, unknown> = {
    "website-data.json": {
      version: 1,
      updatedAt: "2026-09-01T00:00:00.000Z",
      campaign: { image: "https://res.cloudinary.com/example/image/upload/sample.webp" },
      menu: {
        products: [{ cover: options.traversal ? "/uploads/artworks/%2e%2e/private.txt" : "/uploads/artworks/coffee/cover.webp" }],
      },
    },
    "homepage.json": {
      version: 1,
      hero: { poster: "/images/static-banner.png" },
      home003: { image: "/images/home003/guide.png" },
      campaigns: [{ image: "/images/campaigns/campaign.png" }],
    },
    "assets.json": {
      version: 1,
      updatedAt: "2026-09-01T00:00:00.000Z",
      assets: [{ path: "/uploads/assets/logo/logo.svg" }],
    },
    "monthly-menus.json": { menus: [] },
    "pages.json": { version: 1, pages: [{ image: "/uploads/assets/logo/logo.svg" }] },
  };

  for (const [fileName, value] of Object.entries(documents)) {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(
      path.join(dataDir, fileName),
      options.corruptFile === fileName ? "{ invalid json" : `${JSON.stringify(value)}\n`,
      "utf8",
    );
  }

  if (!options.missingMedia) {
    const media: Record<string, string> = {
      "uploads/artworks/coffee/cover.webp": "artwork-seed",
      "uploads/assets/logo/logo.svg": "<svg>seed</svg>",
      "images/home003/guide.png": "home003-seed",
      "images/campaigns/campaign.png": "campaign-seed",
    };
    for (const [relative, content] of Object.entries(media)) {
      const filePath = path.join(publicDir, ...relative.split("/"));
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, "utf8");
    }
  }
  return publicDir;
}

async function sha256(filePath: string) {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

async function fileHashes(root: string) {
  const result = new Map<string, string>();
  async function visit(directory: string) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(filePath);
      else if (!entry.name.endsWith(".lock") && !entry.name.includes(".bootstrap.")) {
        result.set(path.relative(root, filePath), await sha256(filePath));
      }
    }
  }
  await visit(root);
  return result;
}

try {
  for (const [fileName, expectedHash] of protectedHashes) {
    assert.equal(await sha256(path.resolve(fileName)), expectedHash);
    checks += 1;
  }

  setEnvironment({});
  assert.equal(storage.getPersistentDataRoot(), "");
  assert.equal(storage.getOrdersDir(), path.join(process.cwd(), "data", "orders"));
  assert.equal(storage.getWebsiteDataFile(), path.join(process.cwd(), "public", "data", "website-data.json"));
  checks += 3;

  setEnvironment({ KD_DATA_DIR: "relative/data" });
  assert.throws(() => storage.getPersistentDataRoot(), storage.StorageConfigurationError);
  checks += 1;

  const absoluteRoot = path.join(temporaryRoot, "absolute-root");
  setEnvironment({ KD_DATA_DIR: absoluteRoot });
  assert.equal(storage.getPersistentDataRoot(), absoluteRoot);
  for (const resolved of [
    storage.getOrdersDir(), storage.getMembersDir(), storage.getStoreDir(),
    storage.getMemberIdentityDir(), storage.getMembershipCommerceDir(),
    storage.getFulfillmentDir(), storage.getOrderNotificationUploadsDir(),
  ]) {
    assert.equal(path.relative(absoluteRoot, resolved).startsWith(".."), false);
    checks += 1;
  }
  checks += 1;

  const railwayMount = path.join(temporaryRoot, "railway-volume");
  setEnvironment({ KD_DATA_DIR: railwayMount, RAILWAY_VOLUME_MOUNT_PATH: railwayMount });
  assert.equal(storage.getStorageRootContract().source, "KD_DATA_DIR");
  setEnvironment({ KD_DATA_DIR: path.join(railwayMount, "kd"), RAILWAY_VOLUME_MOUNT_PATH: railwayMount });
  assert.equal(storage.getStorageRootContract().root, path.join(railwayMount, "kd"));
  setEnvironment({ RAILWAY_VOLUME_MOUNT_PATH: railwayMount });
  assert.equal(storage.getStorageRootContract().source, "RAILWAY_VOLUME_MOUNT_PATH");
  setEnvironment({ KD_DATA_DIR: path.join(temporaryRoot, "outside"), RAILWAY_VOLUME_MOUNT_PATH: railwayMount });
  assert.throws(() => storage.getStorageRootContract(), storage.StorageConfigurationError);
  setEnvironment({ NODE_ENV: "production", RAILWAY_PROJECT_ID: "test-project" });
  assert.throws(() => storage.assertProductionStorageRootConfigured(), storage.StorageConfigurationError);
  checks += 5;

  const fixturePublic = await createSeedFixture("valid-seed");
  const persistentRoot = path.join(temporaryRoot, "persistent-empty");
  setEnvironment({ KD_DATA_DIR: persistentRoot });
  const initial = await bootstrap.initializePersistentStorage({ repositoryPublicDir: fixturePublic });
  assert.equal(initial.initialized, true);
  assert.deepEqual(initial.jsonSeeded.sort(), ["assets.json", "homepage.json", "monthly-menus.json", "pages.json", "website-data.json"]);
  assert.equal(initial.mediaSeeded.length, 4);
  assert.ok(initial.mediaPlan.some((entry: { classification: string }) => entry.classification === "external"));
  assert.ok(initial.mediaPlan.some((entry: { classification: string; reference: string }) => entry.classification === "git-static" && entry.reference === "/images/static-banner.png"));
  checks += 5;

  const expectedDirectories = [
    "orders", "members", "member-identity", "membership-commerce", "fulfillment", "store",
    "uploads/assets", "uploads/artworks", "uploads/campaigns", "uploads/home003",
    "uploads/order-notifications", "backups/artworks",
  ];
  for (const relative of expectedDirectories) {
    assert.equal((await fs.stat(path.join(persistentRoot, ...relative.split("/")))).isDirectory(), true);
    checks += 1;
  }
  for (const fileName of ["website-data.json", "homepage.json", "assets.json", "monthly-menus.json", "pages.json"]) {
    JSON.parse(await fs.readFile(path.join(persistentRoot, "store", fileName), "utf8"));
    checks += 1;
  }
  for (const relative of [
    "uploads/artworks/coffee/cover.webp", "uploads/assets/logo/logo.svg",
    "uploads/home003/guide.png", "uploads/campaigns/campaign.png",
  ]) {
    assert.equal((await fs.stat(path.join(persistentRoot, ...relative.split("/")))).isFile(), true);
    checks += 1;
  }
  assert.equal(await fs.stat(path.join(persistentRoot, "images", "static-banner.png")).then(() => true).catch(() => false), false);
  checks += 1;

  for (const forbidden of [
    "orders/KD20260831-6077.json", "orders/KD20260831-9263.json", "members/member.json",
    "member-identity/registry.json", "membership-commerce/commerce-state.json",
    "membership-commerce/business-rules.json", "fulfillment/state.json", "membership-test-lab/scenario-state.json",
  ]) {
    assert.equal(await fs.stat(path.join(persistentRoot, ...forbidden.split("/"))).then(() => true).catch(() => false), false);
    checks += 1;
  }

  const websiteTarget = path.join(persistentRoot, "store", "website-data.json");
  const mediaTarget = path.join(persistentRoot, "uploads", "assets", "logo", "logo.svg");
  await writeJson(websiteTarget, { sentinel: "authoritative-existing-state" });
  await fs.writeFile(mediaTarget, "authoritative-existing-media", "utf8");
  const sentinelWebsiteHash = await sha256(websiteTarget);
  const sentinelMediaHash = await sha256(mediaTarget);
  const beforeRestart = await fileHashes(persistentRoot);
  const restarted = await bootstrap.initializePersistentStorage({ repositoryPublicDir: fixturePublic });
  assert.equal(await sha256(websiteTarget), sentinelWebsiteHash);
  assert.equal(await sha256(mediaTarget), sentinelMediaHash);
  assert.ok(restarted.jsonExisting.includes("website-data.json"));
  assert.ok(restarted.mediaExisting.includes("/uploads/assets/logo/logo.svg"));
  assert.deepEqual(await fileHashes(persistentRoot), beforeRestart);
  checks += 5;

  const concurrentRoot = path.join(temporaryRoot, "concurrent-root");
  setEnvironment({ KD_DATA_DIR: concurrentRoot });
  const concurrent = await Promise.all([
    bootstrap.initializePersistentStorage({ repositoryPublicDir: fixturePublic }),
    bootstrap.initializePersistentStorage({ repositoryPublicDir: fixturePublic }),
  ]);
  assert.equal(concurrent.reduce((sum: number, result: { jsonSeeded: string[] }) => sum + result.jsonSeeded.length, 0), 5);
  assert.equal(concurrent.reduce((sum: number, result: { mediaSeeded: string[] }) => sum + result.mediaSeeded.length, 0), 4);
  for (const fileName of ["website-data.json", "homepage.json", "assets.json", "monthly-menus.json", "pages.json"]) {
    JSON.parse(await fs.readFile(path.join(concurrentRoot, "store", fileName), "utf8"));
  }
  assert.equal((await fs.readdir(path.join(concurrentRoot, "store"))).some((name) => name.includes(".bootstrap.")), false);
  checks += 4;

  const actualSeedRoot = path.join(temporaryRoot, "actual-repository-seeds");
  setEnvironment({ KD_DATA_DIR: actualSeedRoot });
  const actualSeedResult = await bootstrap.initializePersistentStorage();
  assert.equal(actualSeedResult.jsonSeeded.length, 5);
  assert.ok(actualSeedResult.mediaPlan.some((entry) => entry.classification === "external"));
  assert.ok(actualSeedResult.mediaPlan.some((entry) => entry.classification === "git-static"));
  const actualPersistentMedia = actualSeedResult.mediaPlan.filter(
    (entry) => entry.classification === "persistent-local",
  );
  assert.ok(actualPersistentMedia.length > 0);
  for (const entry of actualPersistentMedia) {
    assert.ok(entry.targetFile);
    assert.equal((await fs.stat(entry.targetFile)).isFile(), true);
  }
  const immutableWebsiteSeed = path.resolve("bootstrap", "store", "website-data.json");
  const protectedLocalWebsite = path.resolve("public", "data", "website-data.json");
  const bootstrappedWebsite = path.join(actualSeedRoot, "store", "website-data.json");
  assert.equal(await sha256(immutableWebsiteSeed), "e6d81343d6aa034955beea6a659be39995e71905bced60d963ea1a58d76c37e2");
  assert.equal(await sha256(bootstrappedWebsite), await sha256(immutableWebsiteSeed));
  assert.notEqual(await sha256(bootstrappedWebsite), await sha256(protectedLocalWebsite));

  for (const forbidden of [
    "orders/KD20260831-6077.json",
    "orders/KD20260831-9263.json",
    "membership-commerce/commerce-state.json",
    "membership-commerce/business-rules.json",
    "fulfillment/state.json",
    "fulfillment/settings.json",
  ]) {
    assert.equal(await fs.stat(path.join(actualSeedRoot, ...forbidden.split("/"))).then(() => true).catch(() => false), false);
  }

  const emptyFulfillment = await fulfillment.readFulfillmentStore();
  assert.equal(emptyFulfillment.revision, 0);
  assert.deepEqual(emptyFulfillment.records, {});
  assert.equal(await fs.stat(path.join(actualSeedRoot, "fulfillment", "state.json")).then(() => true).catch(() => false), false);
  const defaultSettings = await fulfillment.readLogisticsSettings();
  assert.equal(defaultSettings.revision, 0);
  assert.equal(defaultSettings.automaticTrackingEnabled, false);
  assert.equal(await fs.stat(path.join(actualSeedRoot, "fulfillment", "settings.json")).then(() => true).catch(() => false), false);

  const emptyCommerce = await commerce.readMembershipCommerceState();
  assert.equal(emptyCommerce.revision, 0);
  assert.deepEqual(emptyCommerce.creditEntries, {});
  assert.equal(await fs.stat(path.join(actualSeedRoot, "membership-commerce", "commerce-state.json")).then(() => true).catch(() => false), false);
  await commerce.assignReferralRelationship({
    referrerMemberId: "phase-i4b3-disposable-referrer",
    referredMemberId: "phase-i4b3-disposable-referred",
    idempotencyKey: "phase-i4b3-canonical-first-transaction",
    now: new Date("2026-09-01T00:00:00.000Z"),
  }, { assertMember: async () => undefined });
  const firstCommerceState = await commerce.readMembershipCommerceState();
  assert.equal(firstCommerceState.revision, 1);
  assert.equal(Object.keys(firstCommerceState.referrals).length, 1);

  const manifestText = await fs.readFile(path.resolve("config", "production-migration-manifest.json"), "utf8");
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.bootstrap.businessRules.bootstrapEnabled, false);
  assert.equal(manifest.bootstrap.businessRules.source, null);
  assert.equal(manifest.bootstrap.store[0].source, "bootstrap/store/website-data.json");
  assert.equal(manifestText.includes("KD20260831-6077"), false);
  assert.equal(manifestText.includes("KD20260831-9263"), false);
  for (const item of manifest.bootstrap.store as Array<{ source: string; target: string; sha256: string }>) {
    assert.equal(await sha256(path.resolve(item.source)), item.sha256);
    assert.equal(
      await sha256(path.join(actualSeedRoot, ...item.target.replace(/^\/data\//u, "").split("/"))),
      item.sha256,
    );
  }

  for (const ignoredPath of [
    "data/orders/example.json",
    "data/members/example.json",
    "data/member-identity/example.json",
    "data/membership-commerce/business-rules.json",
    "data/membership-commerce/commerce-state.json",
    "data/fulfillment/state.json",
    "data/fulfillment/settings.json",
    "data/membership-test-lab/example.json",
    "data/backups/example.json",
    "public/uploads/order-notifications/example.webp",
    "public/data/website-data.json",
    "public/data/homepage.json",
    "public/data/assets.json",
    "public/data/monthly-menus.json",
    "public/data/pages.json",
  ]) {
    assert.doesNotThrow(() => execFileSync("git", ["check-ignore", "--no-index", "--quiet", ignoredPath]));
  }
  for (const retainedPath of [
    "bootstrap/store/website-data.json",
    "public/data/711-stores.json",
    "public/uploads/artworks/example/seed.webp",
    "public/uploads/assets/logo/seed.svg",
  ]) {
    assert.throws(() => execFileSync("git", ["check-ignore", "--no-index", "--quiet", retainedPath]));
  }

  const inventoryReview = await fs.readFile(path.resolve("docs", "phase-i4b3-opening-inventory-owner-review.md"), "utf8");
  const immutableWebsite = JSON.parse(await fs.readFile(immutableWebsiteSeed, "utf8"));
  const reviewSkus = immutableWebsite.menu.products
    .filter((product: { active: boolean; status: string; purchasable: boolean }) => product.active && product.status === "active" && product.purchasable)
    .flatMap((product: { skus: Array<{ id: string; enabled: boolean }> }) => product.skus.filter((sku) => sku.enabled));
  assert.equal(reviewSkus.length, 16);
  for (const sku of reviewSkus) assert.ok(inventoryReview.includes(`\`${sku.id}\``));
  assert.equal((inventoryReview.match(/\*\*OWNER REQUIRED\*\*/gu) ?? []).length, reviewSkus.length);

  const actualBeforeRestart = await fileHashes(actualSeedRoot);
  const actualRestart = await bootstrap.initializePersistentStorage();
  assert.equal(actualRestart.jsonExisting.length, 5);
  assert.deepEqual(await fileHashes(actualSeedRoot), actualBeforeRestart);
  assert.equal(await fs.stat(path.join(actualSeedRoot, "membership-commerce", "business-rules.json")).then(() => true).catch(() => false), false);

  const actualRootText = await Promise.all(
    [...(await fileHashes(actualSeedRoot)).keys()].map(async (relative) => fs.readFile(path.join(actualSeedRoot, relative)).catch(() => Buffer.from(""))),
  ).then((buffers) => Buffer.concat(buffers).toString("utf8"));
  assert.equal(actualRootText.includes("KD20260831-6077"), false);
  assert.equal(actualRootText.includes("KD20260831-9263"), false);
  checks += 68 + actualPersistentMedia.length * 2 + reviewSkus.length;

  const corruptPublic = await createSeedFixture("corrupt-seed", { corruptFile: "homepage.json" });
  const corruptRoot = path.join(temporaryRoot, "corrupt-target");
  setEnvironment({ KD_DATA_DIR: corruptRoot });
  await assert.rejects(
    bootstrap.initializePersistentStorage({ repositoryPublicDir: corruptPublic }),
    /bootstrap JSON is invalid/u,
  );
  assert.equal(await fs.stat(corruptRoot).then(() => true).catch(() => false), false);
  checks += 2;

  const missingPublic = await createSeedFixture("missing-media", { missingMedia: true });
  const missingRoot = path.join(temporaryRoot, "missing-target");
  setEnvironment({ KD_DATA_DIR: missingRoot });
  await assert.rejects(
    bootstrap.initializePersistentStorage({ repositoryPublicDir: missingPublic }),
    /media is missing or unreadable/u,
  );
  assert.equal(await fs.stat(missingRoot).then(() => true).catch(() => false), false);
  checks += 2;

  const traversalPublic = await createSeedFixture("traversal-seed", { traversal: true });
  const traversalRoot = path.join(temporaryRoot, "traversal-target");
  setEnvironment({ KD_DATA_DIR: traversalRoot });
  await assert.rejects(
    bootstrap.initializePersistentStorage({ repositoryPublicDir: traversalPublic }),
    /Invalid persistent seed media reference/u,
  );
  assert.equal(await fs.stat(traversalRoot).then(() => true).catch(() => false), false);
  assert.equal(
    bootstrap.classifySeedMediaReference("/uploads/assets/%2e%2e/secret.txt", fixturePublic, traversalRoot).classification,
    "invalid",
  );
  checks += 3;

  const invalidExistingRoot = path.join(temporaryRoot, "invalid-existing");
  setEnvironment({ KD_DATA_DIR: invalidExistingRoot });
  await bootstrap.initializePersistentStorage({ repositoryPublicDir: fixturePublic });
  await fs.writeFile(path.join(invalidExistingRoot, "store", "assets.json"), "partial", "utf8");
  await assert.rejects(
    bootstrap.initializePersistentStorage({ repositoryPublicDir: fixturePublic }),
    /bootstrap JSON is invalid/u,
  );
  assert.equal(await fs.readFile(path.join(invalidExistingRoot, "store", "assets.json"), "utf8"), "partial");
  checks += 2;

  const assetRoot = path.join(temporaryRoot, "asset-concurrency");
  setEnvironment({ KD_DATA_DIR: assetRoot });
  await fs.mkdir(path.join(assetRoot, "store"), { recursive: true });
  const originalLibrary = {
    version: 1,
    updatedAt: "2026-09-01T00:00:00.000Z",
    assets: [{ id: "logo", category: "logo", name: "Logo", usage: "site", path: "/logo.svg", recommendedSize: "1x1", displaySize: "1x1", format: "svg", alt: "Logo", seoStem: "logo", status: "active" as const }],
  };
  await writeJson(path.join(assetRoot, "store", "assets.json"), originalLibrary);
  const left = structuredClone(originalLibrary);
  const right = structuredClone(originalLibrary);
  left.assets[0].name = "Left update";
  right.assets[0].name = "Right update";
  const saves = await Promise.allSettled([assets.saveAssetLibrary(left), assets.saveAssetLibrary(right)]);
  assert.equal(saves.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(saves.filter((result) => result.status === "rejected" && result.reason instanceof assets.AssetLibraryVersionConflictError).length, 1);
  const storedLibrary = JSON.parse(await fs.readFile(path.join(assetRoot, "store", "assets.json"), "utf8"));
  assert.equal(storedLibrary.version, 2);
  assert.ok(["Left update", "Right update"].includes(storedLibrary.assets[0].name));
  assert.equal(await fs.stat(path.join(assetRoot, "store", "assets.json.lock")).then(() => true).catch(() => false), false);
  checks += 5;

  for (const [fileName, expectedHash] of protectedHashes) {
    assert.equal(await sha256(path.resolve(fileName)), expectedHash);
    checks += 1;
  }

  console.log(
    `Phase I.4B persistence/bootstrap: PASS (${checks} assertions; ${actualPersistentMedia.length} actual persistent media files)`,
  );
} finally {
  const mutableEnvironment = process.env as Record<string, string | undefined>;
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete mutableEnvironment[key];
    else mutableEnvironment[key] = value;
  }
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
