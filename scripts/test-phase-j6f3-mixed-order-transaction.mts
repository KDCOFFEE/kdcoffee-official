import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createCommerceOrderTransactionService, commerceOrderTransactionId, CommerceOrderTransactionError } from "../lib/commerceOrderTransaction";
import type { CommerceOrderTransactionRequest } from "../lib/commerceOrderTransaction";
import type { CoffeeCartProduct } from "../lib/commerceCartResolver";
import { CommerceOrderResolutionError } from "../lib/commerceOrderTypes";
import { createCommerceTransactionCoordinator } from "../lib/commerceTransactionCoordinator";
import { createCommerceTransactionJournal } from "../lib/commerceTransactionJournal";
import { createCoffeeInventoryParticipant, createStoreInventoryParticipant } from "../lib/inventoryParticipants";
import { readInventoryReceipts, inventoryHash } from "../lib/inventoryReceipts";
import { createStoreRepository } from "../lib/storeRepository";
import { withOrderFileUpdateLock } from "../lib/orderFiles";
import { resolveOrderRewardBasis } from "../lib/orderRewardBasis";

const timestamp = "2026-10-12T06:37:00.000Z", now = () => new Date(timestamp);
const script = fileURLToPath(import.meta.url);
const bootstrap = fileURLToPath(new URL("./credit-integration-test-bootstrap.mjs", import.meta.url));
function request(mode: "coffee" | "store" | "mixed" = "mixed", idempotencyKey: string = randomUUID()): CommerceOrderTransactionRequest {
  const coffee = { domain: "coffee" as const, productId: "coffee-product", variantId: "coffee-sku", quantity: 2,
    coffeeOptions: { preparation: "咖啡豆" as const, customRoast: false } };
  const store = { domain: "store" as const, productId: "store-product", variantId: "default" as const, quantity: 2 };
  return { idempotencyKey, items: mode === "coffee" ? [coffee] : mode === "store" ? [store] : [coffee, store],
    orderContext: { orderMode: "studio_pickup", customer: { name: "Isolated fixture", phone: "0912345678", email: "", note: "" },
      studioPickup: { preferredDate: "2026-10-20" }, creditApplied: 0 } };
}
function website() {
  const products: CoffeeCartProduct[] = [{ id: "coffee-product", slug: "coffee-current", name: "Coffee current", active: true,
    purchasable: true, purchase: [], skus: [{ id: "coffee-sku", label: "半磅咖啡豆", detail: "227g", kind: "beans",
      price: 500, stock: 10, enabled: true, pvEnabled: true, pvValue: 30 }] }];
  return { version: 1, updatedAt: timestamp, menu: { products } };
}
async function fixture(root: string) {
  await fs.mkdir(path.join(root, "store"), { recursive: true }); await fs.mkdir(path.join(root, "orders"), { recursive: true });
  await fs.writeFile(path.join(root, "store", "website-data.json"), JSON.stringify(website()));
  const repo = createStoreRepository({ dataRoot: root, now });
  await repo.createSection({ id: "section", name: "Equipment", slug: "equipment", published: true });
  await repo.createProduct({ id: "store-product", sectionId: "section", slug: "store-current", name: "Store current",
    sku: "DISPLAY", price: 50, inventory: 5, pvValue: 999, published: true });
}
async function coffeeDocument(root: string): Promise<ReturnType<typeof website> & { inventoryReceipts?: unknown }> {
  return JSON.parse(await fs.readFile(path.join(root, "store", "website-data.json"), "utf8"));
}
async function stock(root: string) {
  const coffee = await coffeeDocument(root), store = await createStoreRepository({ dataRoot: root }).read();
  return [coffee.menu.products[0].skus![0].stock, store.products[0].inventory];
}
async function orders(root: string) {
  return (await fs.readdir(path.join(root, "orders"))).filter(file => /^KD[0-9-]+\.json$/.test(file));
}
async function receipts(root: string) {
  return { coffee: readInventoryReceipts(await coffeeDocument(root)),
    store: readInventoryReceipts(await createStoreRepository({ dataRoot: root }).read()) };
}
if (process.argv[2] === "--worker") {
  const root = process.argv[3], point = process.argv[4], key = process.argv[5];
  process.env.KD_DATA_DIR = root;
  await createCommerceOrderTransactionService({ now, hook: async (phase, domain) => {
    const hit = (point === "BEFORE_APPLY" && phase === "PREPARED")
      || (point === "AFTER_COFFEE" && phase === "APPLIED" && domain === "coffee")
      || (point === "BEFORE_ORDER_COMMIT" && phase === "BEFORE_FINALIZE")
      || (point === "AFTER_ORDER_COMMIT" && phase === "FINALIZED");
    if (hit) { process.stdout.write("CRASH_POINT\n"); await new Promise(() => {}); }
  } }).create(request("mixed", key));
} else {
  const savedRoot = process.env.KD_DATA_DIR;
  const suite = await fs.mkdtemp(path.join(os.tmpdir(), "kd-j6f3-mixed-"));
  let count = 0, failed = false;
  async function check(label: string, operation: () => unknown | Promise<unknown>) {
    try { await operation(); count++; console.log("PASS " + String(count).padStart(3, "0") + " " + label); }
    catch (error) { failed = true; console.error("FAIL " + label); throw error; }
  }
  async function root(name: string) {
    const target = path.join(suite, name); await fixture(target); process.env.KD_DATA_DIR = target; return target;
  }
  const service = (options: Parameters<typeof createCommerceOrderTransactionService>[0] = {}) =>
    createCommerceOrderTransactionService({ now, ...options });
  async function rejected(label: string, operation: () => Promise<unknown>, code: string) {
    await check(label, () => assert.rejects(operation, error =>
      (error instanceof CommerceOrderTransactionError || error instanceof CommerceOrderResolutionError) && error.code === code));
  }
  try {
    for (const mode of ["coffee", "store", "mixed"] as const) {
      const target = await root("happy-" + mode), input = request(mode), result = await service().create(input);
      await check(mode + " server transaction finalizes", () => assert.equal(result.state, "FINALIZED"));
      await check(mode + " persists exactly one standard KD order", async () => {
        assert.match(result.orderNumber, /^KD\d{8}-\d{4}$/); assert.deepEqual(await orders(target), [result.orderNumber + ".json"]);
        assert.ok(result.order); assert.equal(result.order.orderMode, "studio_pickup");
        assert.equal(result.order.status, "waiting_studio_pickup_confirmation");
      });
      await check(mode + " authoritative domains/pricing/subtotal persisted", () => {
        assert.ok(result.order); const lines = result.order.items; assert.ok(Array.isArray(lines));
        assert.deepEqual(lines.map(line => line.domain), mode === "mixed" ? ["coffee", "store"] : [mode]);
        assert.equal(result.order.subtotal, mode === "coffee" ? 1000 : mode === "store" ? 100 : 1100);
        assert.equal(result.order.shipping, 0); assert.equal(result.order.total, result.order.subtotal);
        for (const line of lines) {
          assert.equal(line.unitPrice, line.domain === "coffee" ? 500 : 50); assert.equal(line.lineTotal, line.unitPrice * line.quantity);
          if (line.domain === "store") { assert.equal(line.variantId, "default"); assert.ok(!("coffeeOptions" in line)); assert.ok(!("customRoast" in line)); }
        }
      });
      await check(mode + " canonical inventories decrease once", async () => assert.deepEqual(await stock(target),
        mode === "coffee" ? [8, 5] : mode === "store" ? [10, 3] : [8, 3]));
      await check(mode + " durable APPLY receipts match participant identities", async () => {
        const all = await receipts(target);
        for (const domain of ["coffee", "store"] as const) {
          const list = Object.values(all[domain]);
          assert.equal(list.length, mode === domain || mode === "mixed" ? 1 : 0);
          if (list.length) {
            assert.equal(list[0].domain, domain); assert.equal(list[0].transactionId, result.transactionId);
            assert.equal(list[0].kind, "APPLY"); assert.deepEqual(list[0].items.map(item => [item.identity, item.quantity]),
              [[domain === "coffee" ? "coffee-sku" : "store-product", 2]]);
          }
        }
      });
      await check(mode + " final journal and order reference all required receipts", async () => {
        const events = await createCommerceTransactionJournal(path.join(target, "orders"), result.transactionId).read();
        assert.equal(events.at(-1)?.event.type, "FINALIZED"); assert.ok(result.order);
        const tx = result.order.inventoryTransaction; assert.ok(tx && typeof tx === "object" && "state" in tx && "participantReceipts" in tx);
        assert.equal(tx.state, "inventory_committed"); assert.ok(Array.isArray(tx.participantReceipts));
        assert.equal(tx.participantReceipts.length, mode === "mixed" ? 2 : 1);
      });
      const before = inventoryHash(await receipts(target)), retry = await service().create(input);
      await check(mode + " same request replays same order", () => assert.equal(retry.orderNumber, result.orderNumber));
      await check(mode + " retry never duplicates decrement/receipt/order", async () => {
        assert.equal(inventoryHash(await receipts(target)), before); assert.equal((await orders(target)).length, 1);
        assert.deepEqual(await stock(target), mode === "coffee" ? [8, 5] : mode === "store" ? [10, 3] : [8, 3]);
      });
      const changed = structuredClone(input); changed.items[0].quantity = 1;
      await rejected(mode + " same key different quantity conflicts", () => service().create(changed), "IDEMPOTENCY_CONFLICT");
      if (mode === "mixed") {
        await check("equivalent reordered request returns same mixed order", async () =>
          assert.equal((await service().create({ ...input, items: [...input.items].reverse() })).orderNumber, result.orderNumber));
        await check("mixed Store line excluded from Coffee reward basis", () => {
          assert.ok(result.order); const basis = resolveOrderRewardBasis(result.order);
          assert.equal(basis.hasStore, true); assert.equal(basis.coffeeMerchandiseSubtotal, 1000); assert.equal(basis.coffeeEffectivePV, 60);
        });
      }
      await check(mode + " order creation emits no reward/subscription/fulfillment state", async () => {
        for (const file of ["membership-commerce/commerce-state.json", "fulfillment/state.json", "subscriptions.json"]) {
          await assert.rejects(fs.access(path.join(target, file)), { code: "ENOENT" });
        }
        assert.ok(result.order); assert.ok(!("subscriptionIntent" in result.order)); assert.ok(!("completedAt" in result.order));
      });
    }
    {
      const target = await root("aggregate"), input = request();
      input.items = [
        { domain: "coffee", productId: "coffee-product", variantId: "coffee-sku", quantity: 2, coffeeOptions: { customRoast: true, roastLevel: "淺焙", roastNote: "A" } },
        { domain: "coffee", productId: "coffee-product", variantId: "coffee-sku", quantity: 2, coffeeOptions: { customRoast: true, roastLevel: "中焙", roastNote: "B" } },
        { domain: "store", productId: "store-product", variantId: "default", quantity: 2 },
        { domain: "store", productId: "store-product", variantId: "default", quantity: 2 },
      ];
      const result = await service().create(input);
      await check("aggregate Coffee/Store demand applies each identity once", async () => {
        assert.equal(result.state, "FINALIZED"); assert.deepEqual(await stock(target), [6, 1]);
        const all = await receipts(target); assert.equal(Object.values(all.coffee)[0].items[0].quantity, 4);
        assert.equal(Object.values(all.store)[0].items[0].quantity, 4);
      });
      await check("different same-SKU roast selections retain separate order lines", () => {
        assert.ok(result.order); assert.ok(Array.isArray(result.order.items)); assert.equal(result.order.items.length, 4);
        assert.deepEqual(result.order.items.slice(0, 2).map(line => line.roastNote).sort(), ["A", "B"]);
      });
    }
    for (const domain of ["coffee", "store"] as const) {
      const target = await root("out-" + domain);
      if (domain === "coffee") { const live = await coffeeDocument(target); live.menu.products[0].skus![0].stock = 1;
        await fs.writeFile(path.join(target, "store/website-data.json"), JSON.stringify(live)); }
      else { const repo = createStoreRepository({ dataRoot: target, now }); await repo.updateProduct("store-product", 1, { inventory: 1 }); }
      const before = await stock(target);
      await rejected(domain + " preflight shortage rejects", () => service().create(request()), "OUT_OF_STOCK");
      await check(domain + " preflight shortage mutates neither domain", async () => {
        assert.deepEqual(await stock(target), before); assert.equal((await orders(target)).length, 0);
        const all = await receipts(target); assert.equal(Object.keys(all.coffee).length + Object.keys(all.store).length, 0);
      });
    }
    for (const domain of ["coffee", "store"] as const) {
      const target = await root("race-" + domain);
      const engine = service({ afterResolve: async () => {
        if (domain === "coffee") { const live = await coffeeDocument(target); live.menu.products[0].skus![0].stock = 0;
          await fs.writeFile(path.join(target, "store/website-data.json"), JSON.stringify(live)); }
        else { const repo = createStoreRepository({ dataRoot: target, now }); await repo.updateProduct("store-product", 1, { inventory: 0 }); }
      } });
      await rejected(domain + " changed stock before locks fails locked revalidation", () => engine.create(request()), "OUT_OF_STOCK");
      await check(domain + " locked shortage does not apply either domain", async () => {
        assert.deepEqual(await stock(target), domain === "coffee" ? [0, 5] : [10, 0]);
        assert.equal((await orders(target)).length, 0); const all = await receipts(target);
        assert.equal(Object.keys(all.coffee).length + Object.keys(all.store).length, 0);
      });
    }
    {
      const target = await root("price-race"), engine = service({ afterResolve: async () => {
        await createStoreRepository({ dataRoot: target, now }).updateProduct("store-product", 1, { price: 75 });
      } });
      const result = await engine.create(request());
      await check("price race binds order to authoritative locked re-resolution", () => {
        assert.equal(result.state, "FINALIZED"); assert.ok(result.order); assert.equal(result.order.subtotal, 1150);
        assert.ok(Array.isArray(result.order.items)); assert.equal(result.order.items[1].unitPrice, 75);
      });
    }
    {
      const target = await root("archived"), repo = createStoreRepository({ dataRoot: target, now });
      await repo.archiveProduct("store-product", 1);
      await rejected("Store archived before admission rejected", () => service().create(request()), "PRODUCT_UNAVAILABLE");
      await check("archived Store produces no Coffee mutation/order", async () => {
        assert.deepEqual(await stock(target), [10, 5]); assert.equal((await orders(target)).length, 0);
      });
    }
    {
      const target = await root("boundaries"), input = request();
      await rejected("mixed credit fails closed without allocation", () => service().create({
        ...input, orderContext: { ...input.orderContext, creditApplied: 200 },
      }), "MIXED_CREDIT_ALLOCATION_UNRESOLVED");
      await rejected("Store subscription intent rejected", () => service().create({
        ...input, orderContext: { ...input.orderContext, subscriptionIntent: {} },
      }), "SUBSCRIPTION_NOT_SUPPORTED");
      await rejected("client price authority rejected", () => service().create({
        ...input, items: [{ ...input.items[0], unitPrice: 1 }, input.items[1]],
      }), "INVALID_ITEM");
      await rejected("invalid idempotency key rejected", () => service().create({ ...input, idempotencyKey: "not-a-uuid" }), "INVALID_REQUEST");
      await check("financial/subscription/client boundaries have no inventory/order side effects", async () => {
        assert.deepEqual(await stock(target), [10, 5]); assert.equal((await orders(target)).length, 0);
      });
    }
    {
      const target = await root("store-apply-failure"), input = request();
      const result = await service({ hook: async (phase, domain) => {
        if (phase === "APPLIED" && domain === "coffee") {
          const backups = path.resolve(target, "store-domain/backups");
          assert.ok(backups.startsWith(path.resolve(suite) + path.sep));
          await fs.rm(backups, { recursive: true, force: true }); await fs.writeFile(backups, "fixture write failure");
        }
      } }).create(input);
      await check("Store APPLY failure durably aborts and compensates Coffee", async () => {
        assert.equal(result.state, "ABORTED"); assert.deepEqual(await stock(target), [10, 5]);
        const all = await receipts(target); assert.equal(Object.values(all.coffee).filter(item => item.kind === "RESTORE").length, 1);
        assert.equal(Object.keys(all.store).length, 0);
      });
      await check("aborted retry cannot double-restore or create another order", async () => {
        assert.equal((await service().create(input)).state, "ABORTED"); assert.deepEqual(await stock(target), [10, 5]);
        assert.equal((await orders(target)).length, 1);
        assert.equal(Object.values((await receipts(target)).coffee).filter(item => item.kind === "RESTORE").length, 1);
      });
    }
    {
      const target = await root("order-write-failure"), input = request();
      const result = await service({ writeFinalOrder: async () => { throw new Error("controlled final order IO failure"); } }).create(input);
      await check("all APPLY but failed order commit remains PENDING", async () => {
        assert.equal(result.state, "PENDING"); assert.deepEqual(await stock(target), [8, 3]);
        const files = await orders(target); assert.equal(files.length, 1);
        const pending = JSON.parse(await fs.readFile(path.join(target, "orders", files[0]), "utf8")); assert.equal(pending.status, "inventory_pending");
      });
      const before = inventoryHash(await receipts(target)), retry = await service().create(input);
      await check("order-write recovery finalizes original order without repeating APPLY", async () => {
        assert.equal(retry.state, "FINALIZED"); assert.equal(retry.orderNumber, result.orderNumber);
        assert.equal(inventoryHash(await receipts(target)), before); assert.deepEqual(await stock(target), [8, 3]);
      });
    }
    {
      const target = await root("concurrent-key"), input = request();
      const results = await Promise.all([service().create(input), service().create({ ...input, items: [...input.items].reverse() })]);
      await check("concurrent same-key proposals converge to one durable order", async () => {
        assert.ok(results.every(result => result.state === "FINALIZED"));
        assert.equal(results[0].orderNumber, results[1].orderNumber); assert.equal((await orders(target)).length, 1);
        assert.deepEqual(await stock(target), [8, 3]);
      });
    }
    for (const point of ["BEFORE_APPLY", "AFTER_COFFEE", "BEFORE_ORDER_COMMIT", "AFTER_ORDER_COMMIT"] as const) {
      const target = await root("crash-" + point), input = request(); let transcript = "";
      const child = spawn(process.execPath, ["--experimental-strip-types", "--import", pathToFileURL(bootstrap).href,
        script, "--worker", target, point, input.idempotencyKey], { cwd: process.cwd(), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error("Crash worker timeout " + transcript)); }, 20000);
        child.stdout.on("data", data => { transcript += String(data); if (transcript.includes("CRASH_POINT")) child.kill(); });
        child.stderr.on("data", data => { transcript += String(data); });
        child.on("error", reject); child.on("exit", () => { clearTimeout(timer);
          transcript.includes("CRASH_POINT") ? resolve() : reject(new Error(transcript)); });
      });
      const transactionId = commerceOrderTransactionId(input.idempotencyKey);
      const events = await createCommerceTransactionJournal(path.join(target, "orders"), transactionId).read();
      const first = events[0].event; assert.equal(first.type, "PREPARED");
      if (first.type !== "PREPARED") throw new Error("Missing prepared worker intent");
      const orderNumber = first.intent.orderNumber;
      const staleLocks: string[] = [];
      async function collect(directory: string) {
        for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
          const file = path.join(directory, entry.name);
          if (entry.isDirectory()) await collect(file); else if (entry.name.endsWith(".lock")) staleLocks.push(file);
        }
      }
      await collect(target);
      await check(point + " true worker crash retains durable intent and stale locks", () => {
        assert.ok(staleLocks.length >= 5); assert.equal(first.intent.requestHash.length, 64);
        assert.ok(!events.some(event => event.event.type === "FINALIZED"));
      });
      await check(point + " crash inventories match completed APPLY boundary", async () =>
        assert.deepEqual(await stock(target), point === "BEFORE_APPLY" ? [10, 5] : point === "AFTER_COFFEE" ? [8, 5] : [8, 3]));
      // Explicit test maintenance ONLY after worker exit, inside this isolated temporary root.
      for (const file of staleLocks) {
        assert.ok(path.resolve(file).startsWith(path.resolve(suite) + path.sep)); await fs.unlink(file);
      }
      const result = await service().create(input);
      await check(point + " recovery returns same order and exactly-once stock", async () => {
        assert.equal(result.state, "FINALIZED"); assert.equal(result.orderNumber, orderNumber);
        assert.deepEqual(await stock(target), [8, 3]); assert.deepEqual(await orders(target), [orderNumber + ".json"]);
        const all = await receipts(target); assert.equal(Object.keys(all.coffee).length, 1); assert.equal(Object.keys(all.store).length, 1);
      });
      const before = inventoryHash(await receipts(target));
      await check(point + " subsequent retry retains identical durable receipts", async () => {
        assert.equal((await service().create(input)).orderNumber, orderNumber); assert.equal(inventoryHash(await receipts(target)), before);
      });
    }
    for (const scenario of ["missing", "corrupt"] as const) {
      const target = await root("unknown-" + scenario), input = request(); await service().create(input);
      const live = await coffeeDocument(target);
      const values = readInventoryReceipts(live), key = Object.keys(values)[0];
      if (scenario === "missing") delete values[key]; else values[key].items[0].afterStock = 999;
      live.inventoryReceipts = values;
      await fs.writeFile(path.join(target, "store/website-data.json"), JSON.stringify(live));
      const before = await stock(target), result = await service().create(input);
      await check(scenario + " required receipt is UNKNOWN/review, never guessed success", async () => {
        assert.equal(result.state, "REVIEW_REQUIRED"); assert.equal(result.order, undefined);
        assert.deepEqual(await stock(target), before); assert.equal((await orders(target)).length, 1);
      });
    }
    await check("trusted runLocked cannot run without its complete canonical locks", async () => {
      const target = await root("lock-gate"), input = request();
      const result = await service().create(input);
      const events = await createCommerceTransactionJournal(path.join(target, "orders"), result.transactionId).read();
      const first = events[0].event; assert.ok(first.type === "PREPARED");
      await assert.rejects(() => createCommerceTransactionCoordinator({ orderDir: path.join(target, "orders"), participants: [
        createCoffeeInventoryParticipant(path.join(target, "store/website-data.json"), now),
        createStoreInventoryParticipant({ dataRoot: target, now }),
      ] }).runLocked(first.intent));
    });
    await check("live source boundaries remain disconnected from new service", async () => {
      for (const file of ["app/api/orders/route.ts", "components/commerce/CartProvider.tsx", "components/commerce/CommerceCheckoutBoundary.tsx"]) {
        const source = await fs.readFile(path.join(process.cwd(), file), "utf8");
        assert.ok(!source.includes("commerceOrderTransaction"));
      }
    });
    console.log("J.6F.3 mixed-order transaction: PASS " + count + "/" + count + "; isolated fixtures only.");
  } catch (error) { failed = true; process.exitCode = 1; console.error(error); console.error("Fixture retained: " + suite); }
  finally {
    if (savedRoot === undefined) delete process.env.KD_DATA_DIR; else process.env.KD_DATA_DIR = savedRoot;
    if (!failed) {
      const target = path.resolve(suite); assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep));
      assert.ok(path.basename(target).startsWith("kd-j6f3-mixed-")); await fs.rm(target, { recursive: true, force: true });
    }
  }
}
