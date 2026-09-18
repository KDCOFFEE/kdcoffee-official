import assert from "node:assert/strict";

import { subscriptionOrderDisplayItems } from "../lib/subscriptionSkuModel";

let pass = 0;

function ok(name: string, action: () => void) {
  action();
  pass += 1;
  console.log(`PASS ${String(pass).padStart(2, "0")} ${name}`);
}

const website = {
  menu: {
    products: [
      {
        slug: "monet-floral",
        name: "莫內花語",
        active: true,
        purchasable: true,
        status: "active",
        roast: "淺中焙",
        purchase: [],
        skus: [
          {
            id: "monet-floral-01",
            kind: "beans",
            label: "半磅咖啡豆",
            detail: "227g",
            price: 500,
            stock: 20,
            enabled: true,
            pvEnabled: true,
            pvValue: 350,
          },
        ],
      },
      {
        slug: "giotto-awakening",
        name: "喬托・初醒",
        active: true,
        purchasable: true,
        status: "active",
        roast: "淺焙",
        purchase: [],
        skus: [
          {
            id: "giotto-awakening-01",
            kind: "beans",
            label: "半磅咖啡豆",
            detail: "227g",
            price: 700,
            stock: 20,
            enabled: true,
            pvEnabled: false,
            pvValue: 999,
          },
        ],
      },
      {
        slug: "second-bean",
        name: "第二作品",
        active: true,
        purchasable: true,
        status: "active",
        roast: "中焙",
        purchase: [],
        skus: [
          {
            id: "second-bean-01",
            kind: "beans",
            label: "半磅咖啡豆",
            detail: "227g",
            price: 600,
            stock: 20,
            enabled: true,
            pvEnabled: true,
            pvValue: 250,
          },
        ],
      },
      {
        slug: "drip-product",
        name: "耳掛作品",
        active: true,
        purchasable: true,
        status: "active",
        roast: "中焙",
        purchase: [],
        skus: [
          {
            id: "drip-product-01",
            kind: "drip",
            label: "耳掛",
            detail: "12g",
            price: 80,
            stock: 20,
            enabled: true,
            pvEnabled: true,
            pvValue: 40,
          },
        ],
      },
    ],
  },
} as any;

const halfPound = {
  itemId: "monet-floral:monet-floral-01",
  skuKind: "beans",
  packageWeight: "half-pound",
  quantity: 1,
  roast: "淺中焙",
  components: [
    {
      productId: "monet-floral",
      skuId: "monet-floral-01",
      weightHalfPounds: 1,
    },
  ],
  unitPrice: 500,
} as any;

const half = subscriptionOrderDisplayItems(
  [halfPound],
  website,
  { discountRatio: 0.95 },
)[0] as any;

ok("subscription item snapshots pvEnabled", () => {
  assert.equal(half.pvEnabled, true);
});

ok("subscription item snapshots basePV from SKU PV", () => {
  assert.equal(half.basePV, 350);
});

ok("subscription item snapshots discountRatio", () => {
  assert.equal(half.discountRatio, 0.95);
});

ok("subscription item computes discounted effectivePV", () => {
  assert.equal(half.effectivePV, 332.5);
});

ok("subscription PV is not merchandise price", () => {
  assert.notEqual(half.effectivePV, 475);
  assert.notEqual(half.basePV, 500);
});

const disabled = subscriptionOrderDisplayItems(
  [
    {
      itemId: "giotto-awakening:giotto-awakening-01",
      skuKind: "beans",
      packageWeight: "half-pound",
      quantity: 3,
      roast: "淺焙",
      components: [
        {
          productId: "giotto-awakening",
          skuId: "giotto-awakening-01",
          weightHalfPounds: 1,
        },
      ],
      unitPrice: 700,
    } as any,
  ],
  website,
  { discountRatio: 0.95 },
)[0] as any;

ok("PV-disabled SKU remains disabled", () => {
  assert.equal(disabled.pvEnabled, false);
});

ok("PV-disabled SKU stores zero basePV", () => {
  assert.equal(disabled.basePV, 0);
});

ok("PV-disabled SKU stores zero effectivePV", () => {
  assert.equal(disabled.effectivePV, 0);
});

const onePound = subscriptionOrderDisplayItems(
  [
    {
      itemId: "beans:one-pound:mixed",
      skuKind: "beans",
      packageWeight: "one-pound",
      quantity: 2,
      roast: "工作室建議",
      components: [
        {
          productId: "monet-floral",
          skuId: "monet-floral-01",
          weightHalfPounds: 1,
        },
        {
          productId: "second-bean",
          skuId: "second-bean-01",
          weightHalfPounds: 1,
        },
      ],
      unitPrice: 1100,
    } as any,
  ],
  website,
  { discountRatio: 0.8 },
)[0] as any;

ok("mixed one-pound sums component PV per package", () => {
  assert.equal(onePound.basePV, 600);
});

ok("mixed one-pound effectivePV applies order ratio once", () => {
  assert.equal(onePound.effectivePV, 480);
});

ok("quantity remains separate from per-line PV snapshot", () => {
  assert.equal(onePound.quantity, 2);
  assert.equal(onePound.basePV * onePound.quantity, 1200);
  assert.equal(onePound.effectivePV * onePound.quantity, 960);
});

const drip = subscriptionOrderDisplayItems(
  [
    {
      itemId: "drip:drip-product:drip-product-01",
      skuKind: "drip",
      productId: "drip-product",
      skuId: "drip-product-01",
      quantity: 2,
      unitPrice: 80,
    } as any,
  ],
  website,
  { discountRatio: 1 },
)[0] as any;

ok("drip subscription order stores SKU PV", () => {
  assert.equal(drip.pvEnabled, true);
  assert.equal(drip.basePV, 40);
  assert.equal(drip.effectivePV, 40);
});

console.log("");
console.log(
  `J.5D.6A A3H1 PASS — ${pass}/${pass} checks passed`,
);