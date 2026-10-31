import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import SettingsFields from "../components/admin/ReturnRefundSettingsFields";
import { DEFAULT_MEMBERSHIP_RULES, saveMembershipBusinessRules, readMembershipRulesStore, MembershipRulesVersionConflictError } from "../lib/membershipBusinessRules";
import { DEFAULT_RETURN_REFUND_SETTINGS, RETURN_HANDOFFS } from "../lib/returnRefundSettings";
import { prepareOrderCompletionWrite } from "../lib/orderCompletion";
import { memberReturnAction, getReturnWorkflow } from "../lib/returnWorkflow";
import { resolveReturnRefundMethod } from "../lib/returnPaymentAllocation";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-return-settings-ui-"));
process.env.KD_DATA_DIR = root;
process.env.AUTH_SESSION_SECRET = "isolated-settings-ui-secret-long-enough-for-tokens";
for (const key of ["LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_ACCESS_TOKEN"]) delete process.env[key];
let count = 0;
const check = (label: string, fn: () => void) => { fn(); console.log("PASS " + (++count) + " " + label); };
const rules = structuredClone(DEFAULT_MEMBERSHIP_RULES);
rules.returnRefund = structuredClone(DEFAULT_RETURN_REFUND_SETTINGS);
for (const method of RETURN_HANDOFFS) rules.returnRefund.destinations[method] = {
  ...rules.returnRefund.destinations[method], enabled: true, storeName: "QA original store", storeNumber: "123456", address: "QA original address", recipient: "QA receiver", phone: "0000000000", hours: "QA only", instructions: "QA original instructions",
};
await saveMembershipBusinessRules({ expectedRevision: 0, rules });
let edited = structuredClone(rules.returnRefund);
type Node = { type: unknown; props: Record<string, unknown> };
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Node; return [node, ...nodes(node.props.children)];
}
const draw = () => SettingsFields({ value: edited, onChange: value => { edited = value; } });
const change = (name: string, value: string | boolean) => {
  const control = nodes(draw()).find(node => node.props.name === name);
  assert.ok(control, "control exists: " + name);
  (control.props.onChange as (event: unknown) => void)({ target: typeof value === "boolean" ? { checked: value } : { value } });
};
const persist = async () => {
  const previous = await readMembershipRulesStore();
  const previousVersions = structuredClone(previous.versions);
  const saved = await saveMembershipBusinessRules({ expectedRevision: previous.revision, rules: { ...rules, returnRefund: edited } });
  assert.deepEqual(saved.versions.slice(0, -1), previousVersions);
  assert.equal(saved.revision, previous.revision + 1);
  assert.deepEqual(saved.versions.at(-1)!.rules.returnRefund, edited);
  return saved;
};
check("existing canonical values load without migration", () => {
  for (const method of RETURN_HANDOFFS) assert.equal(nodes(draw()).find(node => node.props.name === method + "_address")?.props.value, "QA original address");
  assert.equal(nodes(draw()).find(node => node.props.name === "seven_eleven_storeNumber")?.props.value, "123456");
});
check("four accessible cards and friendly grouping", () => {
  const html = renderToStaticMarkup(draw());
  assert.equal((html.match(/<fieldset/g) ?? []).length, 4);
  assert.ok(!nodes(draw()).some(n=>n.props.name==="lineEnabled"));assert.ok(html.includes("08 LINE／Email 通知"));
  for (const title of ["7-ELEVEN 寄回", "宅配寄回工作室", "工作室現場退貨", "退款通知與證明"]) assert.ok(html.includes(title));
  assert.match(html, /設定會員可使用的退貨方式、寄回資訊與人工退款通知。/);
});
for (const [name, value] of [["seven_eleven_storeName", "QA edited store"], ["seven_eleven_storeNumber", "654321"], ["seven_eleven_address", "QA store address"], ["seven_eleven_instructions", "QA store note"], ["courier_recipient", "QA edited receiver"], ["courier_phone", "0000000001"], ["courier_address", "QA courier address"], ["courier_instructions", "QA courier note"], ["in_person_address", "QA workshop address"], ["in_person_phone", "0000000002"], ["in_person_hours", "QA hours"], ["in_person_instructions", "QA workshop note"], ["in_person_mapUrl", "https://maps.example.test/qa"]]) change(name, value);
await persist();
for (const method of RETURN_HANDOFFS) check(method + " saves all editable fields and preserves hidden fields", () => {
  assert.equal(edited.destinations[method].hours, method === "in_person" ? "QA hours" : "QA only");
  assert.equal(edited.destinations[method].recipient, method === "courier" ? "QA edited receiver" : "QA receiver");
});
check("saved HTTPS map URL supplies secondary safe link", () => {
  const link = nodes(draw()).find(node => node.type === "a");
  assert.equal(link?.props.href, "https://maps.example.test/qa");
  assert.equal(link?.props.target, "_blank");
  assert.equal(link?.props.rel, "noopener noreferrer");
  assert.equal(nodes(draw()).find(node => node.props.name === "in_person_mapUrl")?.props.type, "url");
});
change("in_person_mapUrl", "javascript:alert(1)");
check("invalid map cannot become an actionable link", () => assert.ok(!nodes(draw()).some(node => node.type === "a")));
change("in_person_mapUrl", "https://maps.example.test/qa");
rules.notification.events.return_refund_completed.enabled=true; edited.lineEnabled=true; change("proofEnabled", false); await persist();
check("central LINE policy mirrors the legacy flag while proof remains independent", () => { assert.equal(edited.lineEnabled, true); assert.equal(edited.proofEnabled, false); });
const destinationBeforeDisable = structuredClone(edited.destinations.courier);
change("courier_enabled", false); await persist();
check("disable preserves destination values", () => assert.deepEqual(edited.destinations.courier, { ...destinationBeforeDisable, enabled: false }));
change("courier_enabled", true); await persist();
check("re-enable restores exact destination values", () => assert.deepEqual(edited.destinations.courier, destinationBeforeDisable));

await fs.mkdir(path.join(root, "orders"), { recursive: true });
const orderNumber = "KD20261030-99801", now = new Date();
const base = { orderNumber, createdAt: now.toISOString(), status: "ready_for_pickup", orderMode: "home_delivery", payment: "atm_transfer", paymentDetails: { method: "atm_transfer", status: "paid" }, member: { memberId: "qa-settings-member" }, items: [{ slug: "qa", optionId: "qa", quantity: 1, unitPrice: 500, lineTotal: 500 }], subtotal: 500, shipping: 40, totalBeforeCredit: 540, total: 540, credit: { appliedAmount: 0 } };
const order = await prepareOrderCompletionWrite(base, { ...base, status: "completed", fulfillmentEvents: [{ eventId: "qa-settings-done", state: "completed", occurredAt: now.toISOString() }] });
await fs.writeFile(path.join(root, "orders", orderNumber + ".json"), JSON.stringify(order));
let member = await getReturnWorkflow(orderNumber, "qa-settings-member");
check("Member receives identical saved settings", () => assert.deepEqual(member.refundSettings, edited));
const values = { lines: [{ returnLineRef: member.lines[0].returnLineRef, quantity: 1 }], reason: "QA settings", quantityAcknowledged: true, conditionAcknowledgement: { itemsComplete: true, unopenedUnusedWhereApplicable: true }, refundHandoff: "courier", refundBank: { bank: "QA", holder: "QA", account: "12345678", branch: "" } };
const preview = await memberReturnAction(orderNumber, "qa-settings-member", { ...values, action: "preview" });
assert.ok("confirmationToken" in preview);
await memberReturnAction(orderNumber, "qa-settings-member", { ...values, action: "create", finalConfirmation: true, confirmationToken: preview.confirmationToken, idempotencyKey: "qa-settings-request" });
const historical = structuredClone((await getReturnWorkflow(orderNumber, "qa-settings-member")).requests[0].refundRequest);
change("courier_address", "QA future address"); rules.notification.events.return_refund_completed.enabled=false; edited.lineEnabled=false; change("proofEnabled", true); await persist();
member = await getReturnWorkflow(orderNumber, "qa-settings-member");
check("settings edits preserve historical request snapshots", () => { assert.deepEqual(member.requests[0].refundRequest, historical); assert.equal(member.refundSettings?.destinations.courier.address, "QA future address"); });
await assert.rejects(() => saveMembershipBusinessRules({ expectedRevision: 0, rules }), MembershipRulesVersionConflictError);
check("existing revision conflict guard and append-only rules versions remain", () => assert.ok(true));
check("settings edits never change payment routing precedence", () => {
  assert.equal(resolveReturnRefundMethod(order, "courier"), "manual_bank_transfer");
  assert.equal(resolveReturnRefundMethod(order, "in_person"), "manual_cash");
  assert.equal(resolveReturnRefundMethod({ payment: "credit_card" }, "in_person"), "manual_review_required");
});
console.log("J6F2C RETURN SETTINGS UI " + count + " PASS; isolated data only");
