import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const [rollbackArg, candidateArg] = process.argv.slice(2);
assert.ok(rollbackArg && candidateArg, "Pass rollback and G.5J.26 checkout paths");
const rollback = resolve(rollbackArg);
const candidate = resolve(candidateArg);
const require = createRequire(join(rollback, "package.json"));
const ts = require("typescript");

function loadVersion(root) {
  const modules = new Map();
  function load(modulePath) {
    const filename = resolve(root, modulePath.endsWith(".ts") ? modulePath : modulePath + ".ts");
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} };
    modules.set(filename, module);
    const js = ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function("module", "exports", "require", js)(module, module.exports, name => {
      if (name === "server-only") return {};
      if (name === "./adminAuth" && filename.endsWith("storeAdminApi.ts")) {
        return { readAdminSession: async () => ({ role: "owner", legacy: false }) };
      }
      if (name === "@/public/data/website-data.json") return { campaign: {}, menu: { products: [] } };
      if (name.startsWith("@/")) return load(name.slice(2));
      if (name.startsWith(".")) return load(resolve(dirname(filename), name));
      return require(name);
    });
    return module.exports;
  }
  return load;
}

const origin = "https://www.kdcoffee1962.com";
const image = "/uploads/artworks/first-coffee/synthetic.png";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const getProduct = (catalog, id) => {
  const result = catalog.products.find(row => row.id === id);
  assert.ok(result, "Missing fixture product " + id);
  return result;
};
const patch = (load, product, changes) => load("app/api/admin/store/products/route").PATCH(new Request(origin + "/api/admin/store/products", {
  method: "PATCH",
  headers: { "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify({ id: product.id, expectedRevision: product.revision, action: "update", changes }),
}));
async function rows(load) {
  const response = await load("app/google/merchant/products.tsv/route").GET(new Request(origin + "/google/merchant/products.tsv"));
  assert.equal(response.status, 200);
  return (await response.text()).trimEnd().split("\n").slice(1);
}

test("G.5J.26 to rollback overlay to G.5J.26 using one synthetic catalog", async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "kd-g5j26e-")));
  const previousDirectory = process.cwd();
  const oldFetch = globalThis.fetch;
  const env = {
    KD_DATA_DIR: root,
    STORE_COMMERCE_ENABLED: "true",
    GOOGLE_MERCHANT_PRODUCT_FEED_ENABLED: "true",
    RAILWAY_VOLUME_MOUNT_PATH: undefined,
    RAILWAY_ENVIRONMENT_ID: undefined,
    RAILWAY_SERVICE_ID: undefined,
  };
  const originalEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  const setEnv = values => Object.entries(values).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  });
  try {
    process.chdir(root);
    setEnv(env);
    globalThis.fetch = async () => { throw new Error("Network use is forbidden by this rehearsal"); };
    const coffee = join(root, "store", "website-data.json");
    const imageFile = join(root, "public", image);
    for (const path of [coffee, imageFile]) await mkdir(dirname(path), { recursive: true });
    await writeFile(coffee, JSON.stringify({ version: 1, updatedAt: "2026-11-19T00:00:00.000Z", menu: { products: [] } }));
    await writeFile(imageFile, png);

    const next = loadVersion(candidate);
    const compat = loadVersion(rollback);
    const createRepo = load => load("lib/storeRepository").createStoreRepository({ dataRoot: root });
    const oldRepo = createRepo(compat);
    const newRepo = createRepo(next);
    const catalogFile = newRepo.catalogPath;
    const add = id => newRepo.createProduct({
      id, name: "Fixture " + id, slug: id, sku: id.toUpperCase(), sectionId: "gear",
      shortDescription: "Synthetic offer", productType: "equipment", price: 1000, inventory: 4, pvValue: 0,
      heroMedia: { type: "image", url: image, alt: "Test product" }, published: true,
    });
    let initial;
    let edited;

    await t.test("A: rollback code reads legacy records without writing or adding a flag", async () => {
      await newRepo.createSection({ id: "gear", name: "Gear", slug: "gear", published: true });
      for (const id of ["enabled", "disabled", "legacy"]) await add(id);
      const before = await readFile(catalogFile);
      const legacy = await oldRepo.read();
      assert.ok(legacy.products.every(row => !Object.hasOwn(row, "googleMerchantSyncEnabled")));
      assert.deepEqual(await readFile(catalogFile), before);
    });
    await t.test("B: candidate API persists true and false; rollback reads all three states", async () => {
      for (const [id, value] of [["enabled", true], ["disabled", false]]) {
        const product = getProduct(await newRepo.read(), id);
        assert.equal((await patch(next, product, { googleMerchantSyncEnabled: value })).status, 200);
      }
      initial = await readJson(catalogFile);
      assert.deepEqual(await oldRepo.read(), initial);
      assert.equal(getProduct(initial, "enabled").googleMerchantSyncEnabled, true);
      assert.equal(getProduct(initial, "disabled").googleMerchantSyncEnabled, false);
      assert.ok(!Object.hasOwn(getProduct(initial, "legacy"), "googleMerchantSyncEnabled"));
    });
    await t.test("B: strict catalog validation rejects unknown fields and invalid values", () => {
      const { validateStoreCatalog } = compat("lib/storeValidation");
      for (const [key, value, reason] of [
        ["unknownSetting", false, /unexpected field unknownSetting/],
        ["googleMerchantSyncEnabled", "false", /boolean required/],
        ["googleMerchantSyncEnabled", null, /boolean required/],
        ["googleMerchantSyncEnabled", 0, /boolean required/],
      ]) {
        const bad = structuredClone(initial);
        bad.products[0][key] = value;
        assert.throws(() => validateStoreCatalog(bad), reason);
      }
    });
    await t.test("C: ordinary admin draft and API edit persist preferences and unrelated fields", async () => {
      const before = getProduct(initial, "disabled");
      const changes = compat("lib/storeAdminDraft").storeDraftPayload("products", { ...before, shortDescription: "Edited on rollback" });
      assert.ok(!Object.hasOwn(changes, "googleMerchantSyncEnabled"));
      assert.equal((await patch(compat, before, changes)).status, 200);
      edited = await readJson(catalogFile);
      const after = getProduct(edited, "disabled");
      assert.deepEqual(after, { ...before, shortDescription: "Edited on rollback", updatedAt: after.updatedAt, revision: before.revision + 1 });
      assert.deepEqual(edited, {
        ...initial, revision: initial.revision + 1, updatedAt: edited.updatedAt,
        products: initial.products.map(row => row.id === "disabled" ? after : row),
      });
      assert.equal((await patch(compat, before, { name: "Stale edit" })).status, 409);
      assert.deepEqual(await readJson(catalogFile), edited);
    });
    await t.test("C: rollback API rejects direct changes to the preference", async () => {
      const before = await readFile(catalogFile);
      assert.equal((await patch(compat, getProduct(edited, "disabled"), { googleMerchantSyncEnabled: true })).status, 400);
      assert.deepEqual(await readFile(catalogFile), before);
    });
    await t.test("C: rollback admin, public Store, commerce offer, and Merchant Feed remain readable", async () => {
      const response = await compat("app/api/admin/store/route").GET();
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), edited);
      const detail = await compat("lib/storePublicReadModel").readPublicStoreProductBySlug("disabled");
      assert.equal(detail.product.price, 1000);
      assert.ok(!Object.hasOwn(detail.product, "googleMerchantSyncEnabled"));
      const offer = await compat("lib/storeCommerceOffer").resolveStoreCommerceOffer("disabled");
      assert.equal(offer.unitPrice, 1000);
      assert.equal(offer.quantityLimit, 4);
      const feed = await rows(compat);
      assert.equal(feed.length, 3);
      assert.ok(feed.some(row => row.includes("Fixture disabled")));
    });
    await t.test("D: upgraded code reads the same catalog and applies the preserved preference", async () => {
      const before = await readFile(catalogFile);
      const reloaded = loadVersion(candidate);
      assert.deepEqual(await createRepo(reloaded).read(), edited);
      const feed = await rows(reloaded);
      assert.equal(feed.length, 2);
      assert.ok(feed.some(row => row.includes("Fixture enabled")));
      assert.ok(feed.some(row => row.includes("Fixture legacy")));
      assert.ok(!feed.some(row => row.includes("Fixture disabled")));
      assert.deepEqual(await readFile(catalogFile), before);
    });
  } finally {
    process.chdir(previousDirectory);
    globalThis.fetch = oldFetch;
    setEnv(originalEnv);
    assert.equal(dirname(root), await realpath(tmpdir()));
    await rm(root, { recursive: true, force: true });
  }
});
