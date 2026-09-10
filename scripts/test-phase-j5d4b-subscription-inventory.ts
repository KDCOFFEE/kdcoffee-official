import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
const testRoot = await mkdtemp(path.join(os.tmpdir(), "kd-phase-j5d4b-"));

process.env.KD_DATA_DIR = testRoot;
process.env.AUTH_SESSION_SECRET = "phase-j5d4b-isolated-test-secret";

const commerce = await import("../lib/membershipCommerce");
const identity = await import("../lib/memberIdentity");
const scheduler = await import("../lib/subscriptionOrderScheduler");
const storage = await import("../lib/storagePaths");

const now = new Date("2026-08-28T02:00:00.000Z");
const stateFilePath = path.join(
  testRoot,
  "membership-commerce",
  "commerce-state.json",
);
const rulesFilePath = path.join(
  testRoot,
  "membership-commerce",
  "business-rules.json",
);
const orderDir = storage.getOrdersDir();
const websiteFilePath = path.join(testRoot, "website-data.json");

let count = 0;

function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  count += 1;
  console.log(`PASS ${String(count).padStart(2, "0")} ${name}`);
}

async function member(subject: string) {
  return (
    await identity.provisionCanonicalMember({
      provider: "email",
      subject,
      persistMember: async () => undefined,
    })
  ).member.memberId;
}

async function createActiveSubscription(
  memberId: string,
  key: string,
  defaultItems: Array<{
    itemId: string;
    packageWeight: "half-pound" | "one-pound";
    quantity: number;
    roast: string;
    unitPrice: number;
    components: Array<{
      productId: string;
      weightHalfPounds: 1;
    }>;
  }>,
) {
  const subscription = await commerce.createSubscription({
    memberId,
    startedFromOrderId: `first-${key}`,
    anchorDate: "2026-09-01",
    intervalDays: 30,
    shippingMethod: "studio_pickup",
    defaultItems,
    idempotencyKey: `sub-${key}`,
    now,
    stateFilePath,
    rulesFilePath,
  });

  return commerce.activateSubscriptionFromPickup({
    subscriptionId: subscription.subscriptionId,
    orderId: `first-${key}`,
    idempotencyKey: `activate-${key}`,
    now,
    stateFilePath,
    rulesFilePath,
  });
}

async function dueCycle(subscriptionId: string, key: string) {
  return commerce.generateSubscriptionCycle({
    subscriptionId,
    sequence: 1,
    plannedDate: "2026-08-31",
    idempotencyKey: `cycle-${key}`,
    now,
    stateFilePath,
    rulesFilePath,
  });
}

async function website() {
  return JSON.parse(await readFile(websiteFilePath, "utf8"));
}

async function stock(productSlug: string) {
  const data = await website();
  const product = data.menu.products.find(
    (entry: { slug: string }) => entry.slug === productSlug,
  );
  assert.ok(product, `找不到商品 ${productSlug}`);

  const bean = product.skus.find(
    (entry: { kind?: string }) => entry.kind === "beans",
  );
  assert.ok(bean, `找不到 ${productSlug} beans SKU`);

  return bean.stock as number;
}

try {
  await mkdir(orderDir, { recursive: true });

  await writeFile(
    websiteFilePath,
    JSON.stringify(
      {
        version: 1,
        updatedAt: now.toISOString(),
        menu: {
          products: [
            {
              active: true,
              status: "active",
              purchasable: true,
              slug: "coffee-a",
              name: "Coffee A",
              stock: 20,
              purchase: [
                {
                  id: "coffee-a-01",
                  label: "半磅咖啡豆",
                  detail: "227g",
                  price: 700,
                  stock: 10,
                  enabled: true,
                  kind: "beans",
                },
                {
                  id: "coffee-a-02",
                  label: "耳掛咖啡",
                  detail: "10包",
                  price: 500,
                  stock: 10,
                  enabled: true,
                  kind: "drip",
                },
              ],
              skus: [
                {
                  id: "coffee-a-01",
                  label: "半磅咖啡豆",
                  detail: "227g",
                  price: 700,
                  stock: 10,
                  enabled: true,
                  kind: "beans",
                },
                {
                  id: "coffee-a-02",
                  label: "耳掛咖啡",
                  detail: "10包",
                  price: 500,
                  stock: 10,
                  enabled: true,
                  kind: "drip",
                },
              ],
            },
            {
              active: true,
              status: "active",
              purchasable: true,
              slug: "coffee-b",
              name: "Coffee B",
              stock: 20,
              purchase: [
                {
                  id: "coffee-b-01",
                  label: "半磅咖啡豆",
                  detail: "227g",
                  price: 800,
                  stock: 10,
                  enabled: true,
                  kind: "beans",
                },
                {
                  id: "coffee-b-02",
                  label: "耳掛咖啡",
                  detail: "10包",
                  price: 500,
                  stock: 10,
                  enabled: true,
                  kind: "drip",
                },
              ],
              skus: [
                {
                  id: "coffee-b-01",
                  label: "半磅咖啡豆",
                  detail: "227g",
                  price: 800,
                  stock: 10,
                  enabled: true,
                  kind: "beans",
                },
                {
                  id: "coffee-b-02",
                  label: "耳掛咖啡",
                  detail: "10包",
                  price: 500,
                  stock: 10,
                  enabled: true,
                  kind: "drip",
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const testMember = await member("j5d4b@example.test");

  const halfA = await createActiveSubscription(
    testMember,
    "half-a",
    [
      {
        itemId: "half-a",
        packageWeight: "half-pound",
        quantity: 1,
        roast: "標準烘焙",
        unitPrice: 700,
        components: [
          {
            productId: "coffee-a",
            weightHalfPounds: 1,
          },
        ],
      },
    ],
  );

  const poundAA = await createActiveSubscription(
    testMember,
    "pound-aa",
    [
      {
        itemId: "pound-aa",
        packageWeight: "one-pound",
        quantity: 1,
        roast: "標準烘焙",
        unitPrice: 1400,
        components: [
          {
            productId: "coffee-a",
            weightHalfPounds: 1,
          },
          {
            productId: "coffee-a",
            weightHalfPounds: 1,
          },
        ],
      },
    ],
  );

  const poundAB = await createActiveSubscription(
    testMember,
    "pound-ab",
    [
      {
        itemId: "pound-ab",
        packageWeight: "one-pound",
        quantity: 1,
        roast: "標準烘焙",
        unitPrice: 1500,
        components: [
          {
            productId: "coffee-a",
            weightHalfPounds: 1,
          },
          {
            productId: "coffee-b",
            weightHalfPounds: 1,
          },
        ],
      },
    ],
  );

  await dueCycle(halfA.subscriptionId, "half-a");
  await dueCycle(poundAA.subscriptionId, "pound-aa");
  await dueCycle(poundAB.subscriptionId, "pound-ab");

  check("測試開始前 Coffee A beans 庫存為 10", (await stock("coffee-a")) === 10);
  check("測試開始前 Coffee B beans 庫存為 10", (await stock("coffee-b")) === 10);

  const firstRun = await scheduler.runSubscriptionOrderScheduler({
    today: "2026-08-28",
    now,
    stateFilePath,
    rulesFilePath,
    orderDir,
    websiteFilePath,
  });

  check("第一次 scheduler 建立 3 張定期購訂單", firstRun.created === 3);
  check("第一次 scheduler 沒有失敗", firstRun.failed === 0);

  check(
    "半磅 A + 一磅 A+A + 一磅 A+B 後 Coffee A 共扣 4",
    (await stock("coffee-a")) === 6,
  );

  check(
    "一磅 A+B 後 Coffee B 共扣 1",
    (await stock("coffee-b")) === 9,
  );

  const files = (await readdir(orderDir)).filter((file) =>
    file.endsWith(".json"),
  );

  check("建立 3 張 order JSON", files.length === 3);

  for (const file of files) {
    const order = JSON.parse(
      await readFile(path.join(orderDir, file), "utf8"),
    );

    check(
      `${file} 有 inventory_committed`,
      order.inventoryTransaction?.state === "inventory_committed",
    );

    check(
      `${file} 有庫存 changes`,
      Array.isArray(order.inventoryTransaction?.changes) &&
        order.inventoryTransaction.changes.length > 0,
    );
  }

  const beforeRetryA = await stock("coffee-a");
  const beforeRetryB = await stock("coffee-b");

  const secondRun = await scheduler.runSubscriptionOrderScheduler({
    today: "2026-08-28",
    now,
    stateFilePath,
    rulesFilePath,
    orderDir,
    websiteFilePath,
  });

  check("第二次 scheduler 沒有再建立訂單", secondRun.created === 0);
  check("第二次 scheduler 沒有失敗", secondRun.failed === 0);

  check(
    "第二次 scheduler Coffee A 沒有重複扣庫存",
    (await stock("coffee-a")) === beforeRetryA,
  );

  check(
    "第二次 scheduler Coffee B 沒有重複扣庫存",
    (await stock("coffee-b")) === beforeRetryB,
  );

  console.log("");
  console.log(`J.5D.4B SUBSCRIPTION INVENTORY: ${count} PASS`);
} finally {
  await rm(testRoot, { recursive: true, force: true });
}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});