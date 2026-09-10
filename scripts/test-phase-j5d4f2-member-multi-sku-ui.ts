import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BeanEditorItem, MemberSubscriptionProduct } from "../components/member/memberSubscriptionEditorModel";

async function main() {
  const testRoot = await mkdtemp(path.join(os.tmpdir(), "kd-phase-j5d4f2-"));
  process.env.KD_DATA_DIR = testRoot;
  process.env.AUTH_SESSION_SECRET = "phase-j5d4f2-isolated-test-secret";

  const editor = await import("../components/member/memberSubscriptionEditorModel");
  const skuModel = await import("../lib/subscriptionSkuModel");
  const rulesModule = await import("../lib/membershipBusinessRules");
  let count = 0;

  function check(name: string, condition: unknown) {
    assert.ok(condition, name);
    count += 1;
    console.log(`PASS ${String(count).padStart(2, "0")} ${name}`);
  }

  function rejects(name: string, operation: () => unknown) {
    assert.throws(operation, name);
    count += 1;
    console.log(`PASS ${String(count).padStart(2, "0")} ${name}`);
  }

  const products: MemberSubscriptionProduct[] = [
    {
      id: "coffee-a",
      name: "Coffee A",
      roast: "淺中焙",
      options: [
        { skuId: "bean-a", kind: "beans", label: "半磅咖啡豆", detail: "227g", price: 700 },
        { skuId: "drip-a-10", kind: "drip", label: "耳掛咖啡・10入", detail: "每包 12g", price: 500 },
        { skuId: "drip-a-20", kind: "drip", label: "耳掛咖啡・20入", detail: "每包 12g", price: 900 },
      ],
    },
    {
      id: "coffee-b",
      name: "Coffee B",
      roast: "中焙",
      options: [
        { skuId: "bean-b", kind: "beans", label: "半磅咖啡豆", detail: "227g", price: 800 },
        { skuId: "drip-b", kind: "drip", label: "耳掛咖啡・10入", detail: "每包 12g", price: 550 },
      ],
    },
  ];

  const legacyHalf = { itemId: "legacy-half", packageWeight: "half-pound" as const, quantity: 1, roast: "淺中焙", components: [{ productId: "coffee-a", weightHalfPounds: 1 as const }], unitPrice: 700 };
  const poundAA = { itemId: "pound-aa", skuKind: "beans" as const, packageWeight: "one-pound" as const, quantity: 1, roast: "淺中焙", components: [{ productId: "coffee-a", skuId: "bean-a", weightHalfPounds: 1 as const }, { productId: "coffee-a", skuId: "bean-a", weightHalfPounds: 1 as const }], unitPrice: 1400 };
  const poundAB = { itemId: "pound-ab", skuKind: "beans" as const, packageWeight: "one-pound" as const, quantity: 2, roast: "中焙", components: [{ productId: "coffee-a", skuId: "bean-a", weightHalfPounds: 1 as const }, { productId: "coffee-b", skuId: "bean-b", weightHalfPounds: 1 as const }], unitPrice: 1500 };
  const drip = { itemId: "drip-row", skuKind: "drip" as const, productId: "coffee-a", skuId: "drip-a-10", quantity: 3, unitPrice: 500 };

  try {
    const halfRows = editor.initializeSubscriptionEditorItems([legacyHalf], products);
    check("legacy half-pound initializes exactly one component selector", halfRows[0].kind === "beans" && halfRows[0].components.length === 1 && halfRows[0].components[0].skuId === "bean-a");

    const aaRows = editor.initializeSubscriptionEditorItems([poundAA], products);
    check("one-pound initializes exactly two component selectors", aaRows[0].kind === "beans" && aaRows[0].components.length === 2);
    check("A+A initializes both selectors with the same exact SKU", aaRows[0].kind === "beans" && aaRows[0].components.every((component) => component.productId === "coffee-a" && component.skuId === "bean-a"));

    const abRows = editor.initializeSubscriptionEditorItems([poundAB], products);
    check("A+B initializes both distinct component identities", abRows[0].kind === "beans" && abRows[0].components.map((component) => component.skuId).join("+") === "bean-a+bean-b");

    const dripRows = editor.initializeSubscriptionEditorItems([drip], products);
    check("drip initializes without roast or bean fields", dripRows[0].kind === "drip" && !("roast" in dripRows[0]) && !("components" in dripRows[0]) && !("packageWeight" in dripRows[0]));
    const dripPrices = editor.subscriptionEditorItemPrices(dripRows[0], products, 95);
    check("drip exposes its real SKU label and detail", dripPrices.selections[0].label === "耳掛咖啡・10入" && dripPrices.selections[0].detail === "每包 12g");

    const mixed = editor.initializeSubscriptionEditorItems([legacyHalf, drip, poundAB], products);
    check("mixed beans and drip initialize every row", mixed.length === 3 && mixed.map((item) => item.kind).join("+") === "beans+drip+beans");
    const second = editor.createSubscriptionEditorItem("drip", products, "new:second");
    const third = editor.createSubscriptionEditorItem("beans", products, "new:third");
    check("second and third items can be added without a hardcoded row count", [...halfRows, second, third].length === 3);

    const identityRows = editor.initializeSubscriptionEditorItems([legacyHalf, drip, poundAB], products, (itemId) => `local:${itemId}`);
    const afterMiddleRemoval = editor.removeSubscriptionEditorItem(identityRows, "local:drip-row");
    check("removing the middle row preserves both remaining local identities", afterMiddleRemoval.map((item) => item.localKey).join("+") === "local:legacy-half+local:pound-ab");
    check("removing the middle row preserves persisted item identities", afterMiddleRemoval.map((item) => item.persistedItemId).join("+") === "legacy-half+pound-ab");

    const halfToOne = editor.changeBeanPackageWeight(halfRows[0] as BeanEditorItem, "one-pound");
    check("half to one-pound creates exactly two matching components", halfToOne.components.length === 2 && halfToOne.components[0].skuId === halfToOne.components[1].skuId);
    const oneToHalf = editor.changeBeanPackageWeight(abRows[0] as BeanEditorItem, "half-pound");
    check("one to half-pound retains only the first component", oneToHalf.components.length === 1 && oneToHalf.components[0].skuId === "bean-a");

    const beanToDrip = editor.changeSubscriptionEditorItemKind(halfRows[0], "drip", products);
    check("beans to drip removes every bean-only field", beanToDrip.kind === "drip" && !("roast" in beanToDrip) && !("components" in beanToDrip) && !("packageWeight" in beanToDrip));
    const dripToBean = editor.changeSubscriptionEditorItemKind(dripRows[0], "beans", products);
    check("drip to beans creates one valid bean component and roast", dripToBean.kind === "beans" && dripToBean.components.length === 1 && Boolean(dripToBean.roast));

    const halfPrices = editor.subscriptionEditorItemPrices(halfRows[0], products, 95);
    check("regular SKU price is available for display", halfPrices.regularUnit === 700);
    check("subscription SKU price uses the existing rounding calculation", halfPrices.subscriptionUnit === editor.subscriptionPrice(700, 95) && halfPrices.subscriptionUnit === 665);
    const aaPrices = editor.subscriptionEditorItemPrices(aaRows[0], products, 95);
    check("one-pound A+A combined regular price is twice the half-pound price", aaPrices.regularUnit === 1400 && aaPrices.subscriptionUnit === 1330);
    const abPrices = editor.subscriptionEditorItemPrices(abRows[0], products, 95);
    check("one-pound A+B combined preview sums both live component prices", abPrices.regularUnit === 1500 && abPrices.subscriptionLine === editor.subscriptionPrice(3000, 95));

    const payload = editor.subscriptionEditorPayload([halfToOne, beanToDrip]);
    check("items payload exactly follows visible row order and types", payload.length === 2 && payload[0].skuKind === "beans" && payload[1].skuKind === "drip");
    check("drip payload contains no stale bean-only fields", payload[1].skuKind === "drip" && !("roast" in payload[1]) && !("components" in payload[1]) && !("packageWeight" in payload[1]));
    check("bean payload contains exact product and SKU identities", payload[0].skuKind === "beans" && payload[0].components.length === 2 && payload[0].components[0].skuId === "bean-a");

    const unavailable = { ...poundAA, itemId: "unavailable", components: [{ productId: "coffee-a", skuId: "retired-bean", weightHalfPounds: 1 as const }, { productId: "coffee-a", skuId: "retired-bean", weightHalfPounds: 1 as const }] };
    const unavailableRows = editor.initializeSubscriptionEditorItems([unavailable], products);
    check("unavailable saved SKU is retained instead of silently replaced", unavailableRows[0].kind === "beans" && unavailableRows[0].components[0].skuId === "retired-bean");
    check("unavailable saved SKU blocks safe submit", Boolean(editor.subscriptionEditorItemError(unavailableRows[0], products)));
    check("UI uses the exact shared server item limit", skuModel.MEMBER_SUBSCRIPTION_MAX_ITEMS === 20);

    const summary = editor.subscriptionItemsSummary([legacyHalf, poundAB, drip], products);
    check("summary displays beans and drip product names", summary.includes("Coffee A・半磅") && summary.includes("Coffee A + Coffee B・一磅") && summary.includes("Coffee A・耳掛咖啡・10入"));

    const website = {
      version: 1,
      updatedAt: "2026-09-10T00:00:00.000Z",
      campaign: {},
      menu: { monthLabel: "test", title: "test", intro: "test", products: products.map((product) => ({ active: true, status: "active", purchasable: true, slug: product.id, name: product.name, purchase: [], skus: product.options.map((option) => ({ id: option.skuId, kind: option.kind, label: option.label, detail: option.detail, price: option.price, enabled: true, stock: 10 })) })) },
    } as unknown as import("../data/websiteData").WebsiteData;
    const rules = (await rulesModule.getActiveMembershipRules(new Date("2026-09-10T00:00:00.000Z"), path.join(testRoot, "business-rules.json"))).rules;
    const resolvedAfterRemoval = skuModel.resolveMemberSubscriptionItems({ items: editor.subscriptionEditorPayload(afterMiddleRemoval), currentItems: [legacyHalf, drip, poundAB], website, rules });
    check("server preserves remaining persisted identities after middle removal", resolvedAfterRemoval.map((item) => item.itemId).join("+") === "legacy-half+pound-ab");

    check("UI effective max never exceeds the shared server limit", editor.effectiveMemberSubscriptionItemLimit(999) === skuModel.MEMBER_SUBSCRIPTION_MAX_ITEMS && editor.effectiveMemberSubscriptionItemLimit(12) === 12 && editor.effectiveMemberSubscriptionItemLimit() === skuModel.MEMBER_SUBSCRIPTION_MAX_ITEMS);
    const permissiveRules = {
      ...rules,
      subscription: {
        ...rules.subscription,
        allowQuantityChange: true,
        allowOtherSubscriptionProducts: true,
        allowHalfToOnePound: true,
        allowOneToHalfPound: true,
        allowMixedOnePound: true,
      },
    };
    const rawDrip = { skuKind: "drip", productId: "coffee-a", skuId: "drip-a-10", quantity: 1 };
    rejects("server rejects 21 subscription item rows", () => skuModel.resolveMemberSubscriptionItems({ items: Array.from({ length: 21 }, () => ({ ...rawDrip })), currentItems: [], website, rules: permissiveRules }));

    const afterFirstRemoval = editor.removeSubscriptionEditorItem(identityRows, "local:legacy-half");
    const resolvedAfterFirstRemoval = skuModel.resolveMemberSubscriptionItems({ items: editor.subscriptionEditorPayload(afterFirstRemoval), currentItems: [legacyHalf, drip, poundAB], website, rules: permissiveRules });
    check("deleting the first persisted item retains every surviving persisted identity", resolvedAfterFirstRemoval.map((item) => item.itemId).join("+") === "drip-row+pound-ab");

    const collisionId = "drip:coffee-a:drip-a-10";
    const collisionSurvivor = { ...drip, itemId: collisionId, quantity: 1 };
    const resolvedWithNewIdenticalRow = skuModel.resolveMemberSubscriptionItems({
      items: [{ ...rawDrip, itemId: collisionId }, { ...rawDrip }],
      currentItems: [legacyHalf, collisionSurvivor],
      website,
      rules: permissiveRules,
    });
    check("new identical SKU after deletion receives a different canonical item ID", resolvedWithNewIdenticalRow[0].itemId === collisionId && resolvedWithNewIdenticalRow[1].itemId !== collisionId);
    check("all final resolved item IDs are unique", new Set(resolvedWithNewIdenticalRow.map((item) => item.itemId)).size === resolvedWithNewIdenticalRow.length);
    rejects("duplicate submitted persisted item ID is rejected", () => skuModel.resolveMemberSubscriptionItems({ items: [{ ...rawDrip, itemId: collisionId }, { ...rawDrip, itemId: collisionId }], currentItems: [collisionSurvivor], website, rules: permissiveRules }));

    const arbitraryClientId = "drip:coffee-a:drip-a-10";
    const resolvedArbitraryId = skuModel.resolveMemberSubscriptionItems({ items: [{ ...rawDrip, itemId: arbitraryClientId }], currentItems: [], website, rules: permissiveRules });
    check("arbitrary client item ID is not trusted as persisted identity", resolvedArbitraryId[0].itemId !== arbitraryClientId);

    const noHalfToOneRules = { ...permissiveRules, subscription: { ...permissiveRules.subscription, allowHalfToOnePound: false } };
    const newOnePoundRow = { skuKind: "beans", packageWeight: "one-pound", quantity: 1, roast: "淺中焙", components: [{ productId: "coffee-a", skuId: "bean-a" }, { productId: "coffee-a", skuId: "bean-a" }] };
    const resolvedNewRow = skuModel.resolveMemberSubscriptionItems({ items: [newOnePoundRow], currentItems: [legacyHalf], website, rules: noHalfToOneRules });
    check("new row without persisted ID is not positionally matched to an unrelated old row", resolvedNewRow[0].itemId !== legacyHalf.itemId && resolvedNewRow[0].skuKind === "beans" && resolvedNewRow[0].packageWeight === "one-pound");

    const resolvedLegacyPayload = skuModel.resolveMemberSubscriptionItems({ items: [{ skuKind: "beans", packageWeight: "half-pound", quantity: 1, roast: "淺中焙", components: [{ productId: "coffee-a" }] }], currentItems: [legacyHalf], website, rules: permissiveRules, legacyPositionalMatching: true });
    check("explicit legacy positional compatibility retains the existing canonical identity", resolvedLegacyPayload[0].itemId === legacyHalf.itemId);

    const componentSource = await readFile(path.join(process.cwd(), "components/member/MemberSubscriptionExperience.tsx"), "utf8");
    const editorSource = await readFile(path.join(process.cwd(), "components/member/memberSubscriptionEditorModel.ts"), "utf8");
    const safeTypesSource = await readFile(path.join(process.cwd(), "lib/subscriptionItemTypes.ts"), "utf8");
    const pageSource = await readFile(path.join(process.cwd(), "app/member/page.tsx"), "utf8");
    const cssSource = await readFile(path.join(process.cwd(), "app/globals.css"), "utf8");
    const forbiddenClientImports = ["membershipCommerce", "membershipPolicies", "subscriptionSkuModel", "membershipBusinessRules", "jsonFileStore"];
    check("member editor dependency boundary excludes server persistence modules", forbiddenClientImports.every((moduleName) => !componentSource.includes(`@/lib/${moduleName}`) && !editorSource.includes(`@/lib/${moduleName}`)) && !/^import\s/m.test(safeTypesSource));
    check("member UI submits items array and no legacy productA/productB payload", /items:\s*subscriptionEditorPayload\(editorItems\)/.test(componentSource) && !/productA:\s*form\.get/.test(componentSource));
    check("editor exposes clear add, remove, and save actions", componentSource.includes("＋ 新增商品") && componentSource.includes("移除此商品") && componentSource.includes("儲存下一次配送商品"));
    check("product loader preserves all eligible beans and drip options", pageSource.includes('option.kind === "beans" || option.kind === "drip"') && pageSource.includes("options: eligibleOptions"));
    check("responsive editor rules stack fields and actions on mobile", cssSource.includes(".member-subscription-item-fields{grid-template-columns:1fr}") && cssSource.includes(".member-subscription-editor-actions{align-items:stretch;flex-direction:column}"));

    console.log(`Phase J.5D.4F-2 member multi-SKU UI: ${count} checks PASS`);
  } finally {
    await rm(testRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
