import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { DEFAULT_SERVICE_DOCUMENT, validateServiceDocument, ServiceValidationError, filterServiceFaqs, isSafeServiceLink } from "../lib/customerServiceContent";
import { readCustomerServiceState, saveCustomerServiceState, getCustomerServiceFile, ServiceConflictError, ServiceStorageError } from "../lib/customerServiceStore";
import { resolveServiceFaq, readCustomerServicePage } from "../lib/customerServiceSources";
import { projectServiceOrders } from "../lib/customerServiceOrders";
import { readFulfillmentStore } from "../lib/fulfillment";
import { orderFlowDescription } from "../lib/orderStatusPolicy";
import { resolveMemberCopy } from "../lib/memberCenterCopy";
import { saveMemberCenterCopy } from "../lib/memberCenterCopyStore";
import type { StoredOrder } from "../lib/adminOrders";
import { createStoreRepository } from "../lib/storeRepository";
import { selectPublicGiftCatalog } from "../lib/giftPresentation";
import { DEFAULT_GIFT_LANDING } from "../lib/giftCms";
import { getGiftCmsFile, readGiftCmsState, saveGiftCmsDocument } from "../lib/giftCmsStore";

const qaRoot = path.resolve("qa-output/cs1/unit");
await fs.mkdir(qaRoot, { recursive: true });
const root = await fs.mkdtemp(path.join(qaRoot, "data-"));
process.env.KD_DATA_DIR = root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
let count = 0;
function check(label: string, run: () => unknown) { run(); count++; console.log(`PASS ${count} ${label}`); }
async function test(label: string, run: () => Promise<unknown>) { await run(); count++; console.log(`PASS ${count} ${label}`); }
const draft = () => structuredClone(DEFAULT_SERVICE_DOCUMENT);
const copy = (key: string) => resolveMemberCopy({}, key);
const faqs = DEFAULT_SERVICE_DOCUMENT.faqs.map(item => resolveServiceFaq(item, copy));

check("default document validates and covers all ten categories and ten quick services", () => {
  validateServiceDocument(draft()); assert.equal(new Set(faqs.map(item => item.category)).size, 10); assert.equal(DEFAULT_SERVICE_DOCUMENT.cards.length, 10);
});
check("search matches question, keywords, resolved answer and Unicode normalized text", () => {
  assert.ok(filterServiceFaqs(faqs, "all", "風味").some(item => item.id === "coffee-help"));
  assert.ok(filterServiceFaqs(faqs, "all", "ＡＴＭ").some(item => item.id === "order-progress"));
  assert.ok(filterServiceFaqs(faqs, "all", "安全等待期").some(item => item.id === "reward-waiting"));
});
check("category filter, disabled items, ordering and empty results", () => {
  assert.equal(filterServiceFaqs(faqs, "cancellation", "").length, 2);
  assert.equal(filterServiceFaqs(faqs, "all", "does-not-exist-4321").length, 0);
  assert.equal(filterServiceFaqs([{ ...faqs[0], enabled: false }], "all", "").length, 0);
  assert.deepEqual(filterServiceFaqs([...faqs].reverse(), "all", "").map(item => item.id), faqs.map(item => item.id));
});
check("shipping is read from canonical flow helper and reward/credit copy from existing member catalog", () => {
  const delivery = faqs.find(item => item.source === "delivery")!.answer;
  for (const method of ["711_cod", "studio_pickup", "home_delivery"]) assert.ok(delivery.includes(orderFlowDescription(method)));
  assert.ok(faqs.find(item => item.source === "kd")!.answer.includes(copy("member.rewards.reward.afccb6ad2c")));
  assert.ok(faqs.find(item => item.source === "credit")!.answer.includes(copy("credit.help.lifecycle")));
});
check("policy answers cannot be copied or replaced in CMS", () => {
  const doc = draft(); doc.faqs.find(item => item.source === "kd")!.answer = "新的轉換規則";
  assert.throws(() => validateServiceDocument(doc), ServiceValidationError);
  const second = draft(); second.faqs.find(item => item.category === "cancellation")!.source = "editorial"; second.faqs.find(item => item.category === "cancellation")!.answer = "新的取消政策";
  assert.throws(() => validateServiceDocument(second), ServiceValidationError);
});
check("script URLs, API/admin navigation, protocol-relative links and encoded tricks rejected", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,hi", "//evil.test", "/api/admin/logout", "/%61pi/orders", "/admin/orders", "/%2f%2fevil.test", "/%5cevil.test", "https://user:password@example.test", "/foo\nbar"]) assert.equal(isSafeServiceLink(url), false, url);
  for (const url of ["/member#orders", "#faq-kd", "https://line.me/R/ti/p/@kdcoffee"]) assert.equal(isSafeServiceLink(url), true);
});
check("invalid schema, HTML, duplicates, order, contacts and incomplete CTAs rejected", () => {
  const mutations: Array<(doc: ReturnType<typeof draft>) => void> = [
    doc => { doc.config.title = "<script>alert(1)</script>"; },
    doc => { doc.cards[0].link = "javascript:alert(1)"; },
    doc => { doc.cards[1].id = doc.cards[0].id; },
    doc => { doc.faqs[0].sortOrder = -1; },
    doc => { doc.config.email = "hi@example.test?bcc=evil@example.test"; },
    doc => { doc.config.phone = "123\n4567"; },
    doc => { doc.faqs[0].ctaHref = ""; },
    doc => { doc.faqs[0].keywords = ["<img>"]; },
  ];
  for (const mutate of mutations) { const doc = draft(); mutate(doc); assert.throws(() => validateServiceDocument(doc), ServiceValidationError); }
  assert.throws(() => validateServiceDocument({ ...draft(), cancellationRules: {} }), ServiceValidationError);
});
await test("missing CMS GET is read-only and returns defaults without creating files", async () => {
  const state = await readCustomerServiceState(); assert.equal(state.revision, 0); assert.deepEqual(state.document, draft());
  await assert.rejects(fs.stat(path.dirname(getCustomerServiceFile())), { code: "ENOENT" });
});
await test("CMS add, edit, disable, reorder, contact/card config and delete persist", async () => {
  const doc = draft();
  doc.config.serviceHours = "週一至週五 10:00–17:00（測試資料）";
  doc.config.email = "support@example.test";
  doc.cards[0].title = "查詢訂單"; doc.cards[0].sortOrder = 900;
  doc.faqs.push({ id: "new-editorial", category: "other", question: "測試問題？", answer: "測試服務回答", source: "editorial", keywords: ["測試"], enabled: true, sortOrder: 0, ctaLabel: "", ctaHref: "" });
  const saved = await saveCustomerServiceState({ revision: 0, document: doc }); assert.equal(saved.revision, 1);
  saved.document.faqs.at(-1)!.enabled = false; saved.document.faqs.at(-1)!.answer = "已更新回答";
  const edited = await saveCustomerServiceState({ revision: 1, document: saved.document }); assert.equal(edited.revision, 2);
  const read = await readCustomerServiceState(); assert.deepEqual(read.document, saved.document);
  read.document.faqs = read.document.faqs.filter(item => item.id !== "new-editorial"); read.document.cards.splice(0, 1);
  const removed = await saveCustomerServiceState({ revision: 2, document: read.document }); assert.equal(removed.document.cards.length, 9); assert.equal(removed.document.faqs.length, doc.faqs.length - 1);
});
await test("conflicting saves have one winner, backup and atomic valid JSON", async () => {
  const current = await readCustomerServiceState();
  const a = structuredClone(current.document), b = structuredClone(current.document);
  a.config.title = "客服中心 A"; b.config.title = "客服中心 B";
  const results = await Promise.allSettled([saveCustomerServiceState({ revision: current.revision, document: a }), saveCustomerServiceState({ revision: current.revision, document: b })]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.ok(results.some(result => result.status === "rejected" && result.reason instanceof ServiceConflictError));
  const saved = await readCustomerServiceState(); assert.equal(saved.revision, current.revision + 1);
  const directory = path.dirname(getCustomerServiceFile());
  assert.ok((await fs.readdir(path.join(directory, "backups"))).some(file => file.startsWith(`content-r${current.revision}-`)));
  assert.equal((await fs.readdir(directory)).some(file => file.endsWith(".lock") || file.endsWith(".tmp")), false);
});
await test("invalid writes and no-op saves leave persisted bytes and revision unchanged", async () => {
  const before = await fs.readFile(getCustomerServiceFile(), "utf8"); const current = await readCustomerServiceState();
  const invalid = structuredClone(current.document); invalid.config.title = "<img src=x>";
  await assert.rejects(saveCustomerServiceState({ revision: current.revision, document: invalid }), ServiceValidationError);
  assert.equal((await saveCustomerServiceState({ revision: current.revision, document: current.document })).revision, current.revision);
  assert.equal(await fs.readFile(getCustomerServiceFile(), "utf8"), before);
});
await test("authoritative member copy updates are reflected without copying into CS CMS", async () => {
  await saveMemberCenterCopy({ expectedRevision: 0, overrides: { "member.rewards.reward.afccb6ad2c": "既有正式會員說明更新（測試）" } });
  const model = await readCustomerServicePage();
  assert.ok(model.faqs.find(item => item.source === "kd")!.answer.includes("既有正式會員說明更新（測試）"));
  assert.equal((await readCustomerServiceState()).document.faqs.find(item => item.source === "kd")!.answer, "");
});
await test("recent orders are own-member only, newest three, minimal projection and no mutation", async () => {
  const fulfillment = await readFulfillmentStore();
  const orders: StoredOrder[] = [1, 2, 3, 4, 5].map(index => ({ orderNumber: `KD20261027-00000${index}`, createdAt: `2026-10-${String(index + 10).padStart(2, "0")}T00:00:00.000Z`, status: "new_order", orderMode: "711_cod", member: { memberId: "member-a" }, customer: { email: "private@example.test" }, items: ["private-items"], password: "private" }));
  orders.push({ ...orders[0], orderNumber: "KD20261027-999999", member: { memberId: "member-b" }, createdAt: "2026-10-27T10:00:00.000Z" });
  const before = JSON.stringify({ orders, fulfillment }); const recent = projectServiceOrders("member-a", orders, fulfillment);
  assert.deepEqual(recent.map(item => item.orderNumber), ["KD20261027-000005", "KD20261027-000004", "KD20261027-000003"]);
  assert.deepEqual(Object.keys(recent[0]).sort(), ["createdAt", "method", "orderNumber", "status"]);
  assert.deepEqual(projectServiceOrders("no-orders", orders, fulfillment), []);
  assert.equal(JSON.stringify({ orders, fulfillment }), before);
  orders[0].status = "cancelled"; orders[1].status = "completed";
  assert.equal(projectServiceOrders("member-a", [orders[0]], fulfillment)[0].status, "已取消");
  assert.equal(projectServiceOrders("member-a", [orders[1]], fulfillment)[0].status, "已完成取貨");
});
await test("corrupt CMS fails closed and is never silently replaced", async () => {
  const file = getCustomerServiceFile(), original = await fs.readFile(file);
  await fs.writeFile(file, "{corrupt"); await assert.rejects(readCustomerServiceState(), ServiceStorageError);
  await assert.rejects(saveCustomerServiceState({ revision: 0, document: draft() }), ServiceStorageError);
  assert.equal(await fs.readFile(file, "utf8"), "{corrupt"); await fs.writeFile(file, original);
});
await test("CS CMS and Gift CMS persist independently and preserve canonical Gift publication gates", async () => {
  const repository = createStoreRepository();
  await repository.initialize();
  await repository.createSection({ id: "gift", slug: "gift", name: "測試禮盒", published: true });
  await repository.createCategory({ id: "drip-gift", slug: "drip-gift", name: "測試耳掛禮盒", sectionId: "gift" });
  await repository.createProduct({ id: "cs1-gift", slug: "cs1-gift", name: "合成測試禮盒", sectionId: "gift", categoryId: "drip-gift", productType: "gift", sku: "CS1-GIFT", price: 500, inventory: 2, pvValue: 0, published: false });
  const catalogFile = repository.catalogPath, catalogBefore = await fs.readFile(catalogFile);
  const giftDoc = structuredClone(DEFAULT_GIFT_LANDING);
  const gift = await saveGiftCmsDocument({ revision: 0, scope: "landing", document: giftDoc });
  const giftBefore = await fs.readFile(getGiftCmsFile());
  const current = await readCustomerServiceState(), changed = structuredClone(current.document); changed.config.announcement = "客服說明測試";
  await saveCustomerServiceState({ revision: current.revision, document: changed });
  assert.deepEqual(await fs.readFile(getGiftCmsFile()), giftBefore);
  assert.deepEqual(await fs.readFile(catalogFile), catalogBefore);
  assert.equal((await readGiftCmsState()).revision, gift.revision);
  const catalog = await repository.read();
  assert.equal(selectPublicGiftCatalog(catalog).total, 0);
  const published = structuredClone(catalog); published.products[0].published = true;
  assert.equal(selectPublicGiftCatalog(published).total, 1);
  for (const mutate of [(value: typeof published) => { value.products[0].active = false; }, (value: typeof published) => { value.sections[0].published = false; }, (value: typeof published) => { value.categories[0].active = false; }, (value: typeof published) => { value.products[0].archivedAt = "2026-10-27T00:00:00.000Z"; }]) {
    const hidden = structuredClone(published); mutate(hidden); assert.equal(selectPublicGiftCatalog(hidden).total, 0);
  }
  assert.deepEqual(await fs.readFile(catalogFile), catalogBefore);
});
console.log(`CUSTOMER SERVICE UNIT: ${count} PASS`);
