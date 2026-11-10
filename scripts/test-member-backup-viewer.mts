// Run with: node --import ./scripts/member-auth-test-bootstrap.mjs scripts/test-member-backup-viewer.mts
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { buildOrganizationTree, createMemberBackup, createMemberBackupZipArtifact, getVerifiedMemberBackupForDownload } from "../lib/memberBackup";
import { buildBackupIndexViewer, buildBackupOrganizationViewer } from "../lib/memberBackupViewer";
import { buildBackupOrderViewerData } from "../lib/memberBackupViewerOrders";
import { snapshotReturnLineEvidence, type OrderCompletionSnapshot } from "../lib/orderCompletion";
import type { ReturnDomainEvent } from "../lib/orderReturns";

const now = new Date("2026-11-08T02:00:00.000Z");
const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "kd-backup-ui-test-"));
const output = await fs.mkdtemp(path.resolve("qa-output/backup-ui-2-"));
const extracted = path.join(output, "sample");
const root = path.join(workspace, "source");
const options = { source: "test", now, testOnlyAllowNonProduction: true } as const;
const digest = (content: Buffer | string) => createHash("sha256").update(content).digest("hex");
const encode = (data: unknown) => JSON.stringify(data, null, 2) + "\n";
const seedNames = ["林晨光", "陳映竹", "許木森", "沈佳葉", "葉知秋", "周暖青", "王晨星", "張書庭", "吳拾光"];
const injection = '</script><img src="https://example.invalid/unwanted" onerror="window.injected=true">';
const longId = "synthetic-" + "abcdef0123456789".repeat(9);
const seedIds = [...seedNames.map((_, index) => "sample-" + index), longId];
const records = seedIds.map((memberId, index) => ({
  memberId, displayName: index === 9 ? "合成長姓名".repeat(8) + injection : seedNames[index],
  memberNumber: "KD-" + String(index + 1).padStart(6, "0"), status: index === 8 ? "suspended" : "active",
  phone: index === 8 ? "" : "+886 00 001 123", email: index === 8 ? "" : "synthetic-person@example.invalid",
}));
const identity = { schemaVersion: 1, members: Object.fromEntries(records.map(({memberId, memberNumber, status}) => [memberId, { memberNumber, status }])) };
const referrals = (links: [string, string][]) => Object.fromEntries(links.map(([referrerMemberId, referredMemberId], i) => [
  "link-" + i, { referrerMemberId, referredMemberId, status: "registered" },
]));
const links: [string, string][] = [[seedIds[0],seedIds[1]], [seedIds[0],seedIds[2]], [seedIds[0],seedIds[3]], [seedIds[1],seedIds[4]], [seedIds[1],seedIds[5]], [seedIds[2],seedIds[6]], [seedIds[4],seedIds[7]], [seedIds[7],longId]];
const commerce = {
  schemaVersion: 1, referrals: referrals(links), returnEvents: [] as ReturnDomainEvent[], returnSettlementEvents: [],
  validConsumptionEvents: {
    "return-synthetic": { eventId:"return-synthetic", memberId:seedIds[7], sourceOrderId:"QA-RETURN", reversalOutcome:"returned", reversedAt:now.toISOString() },
  },
  referralRewards: {
    "reward-valid": { rewardId:"reward-valid", sourceOrderNumber:"QA-850", sourceMemberId:seedIds[1], beneficiaryMemberId:seedIds[0], referralLevel:1, ancestrySnapshot:[seedIds[0]], rewardType:"new_referral", status:"released", qualificationStatus:"qualified", releasedAt:now.toISOString() },
    "reward-reversed": { rewardId:"reward-reversed", sourceOrderNumber:"QA-RETURN", sourceMemberId:seedIds[7], beneficiaryMemberId:seedIds[0], referralLevel:3, ancestrySnapshot:[seedIds[4],seedIds[1],seedIds[0]], rewardType:"repeat_purchase", status:"reversed", reversedAt:now.toISOString() },
    "reward-invalid": { rewardId:"reward-invalid", sourceOrderNumber:"QA-250", sourceMemberId:seedIds[3], beneficiaryMemberId:seedIds[0], referralLevel:1, rewardType:"new_referral", status:"scheduled" },
  },
};
function fixtureOrder(orderNumber: string, memberId: string | null, total: number, status: string, day = 1) {
  return {
    orderNumber, createdAt:new Date(Date.UTC(2026, 10, day)).toISOString(), status,
    member:memberId === null ? null : { memberId, phone:"DO-NOT-EMBED-PHONE", email:"DO-NOT-EMBED-EMAIL" },
    items:[{ name:"合成精品咖啡豆", quantity:2 }],
    subtotal:total-50, shipping:50, total,
    customer:{ address:"DO-NOT-EMBED-ADDRESS" }, guestOrderAccess:{ token:"MUST-NOT-APPEAR-IN-HTML" },
  };
}
const direct = fixtureOrder("QA-850", seedIds[1], 850, "completed", 5);
const returnOrder = {...fixtureOrder("QA-RETURN", seedIds[7], 300, "completed", 2),
  items:[{ name:"合成精品咖啡豆", slug:"synthetic-coffee", optionId:"synthetic-bag", quantity:2, unitPrice:125, lineTotal:250 }],
};
const returnLines = snapshotReturnLineEvidence(returnOrder);
assert.equal(returnLines.status, "resolved");
const completion: OrderCompletionSnapshot = {
  schemaVersion:1, eventId:"completion-qa", completedAt:"2026-11-05T01:00:00.000Z", timeZone:"Asia/Taipei",
  returnProtectionDaysSnapshot:7, rulesVersion:1, returnDeadline:"2026-11-12T15:59:59.999Z", returnLines,
};
const request: Extract<ReturnDomainEvent, {type:"RETURN_REQUESTED"}> = {
  schemaVersion:1, type:"RETURN_REQUESTED", eventId:"requested-qa", returnRequestId:"return-qa", orderId:returnOrder.orderNumber,
  actor:{actorId:seedIds[7], authority:"customer"}, source:"return_service", occurredAt:now.toISOString(), recordedAt:now.toISOString(),
  idempotencyKey:"return-request-qa", commandFingerprint:"0".repeat(64), previousEventId:null, reason:"DO-NOT-EMBED-RETURN-REASON",
  completion, lines:[{ returnLineRef:returnLines.lines[0].returnLineRef, quantity:1, originalQuantity:2 }],
  conditionAcknowledgement:{itemsComplete:true, unopenedUnusedWhereApplicable:true},
};
commerce.returnEvents.push(request, {
  schemaVersion:1, type:"RETURN_APPROVED", eventId:"approved-qa", returnRequestId:request.returnRequestId, orderId:request.orderId,
  actor:{actorId:"qa-reviewer", authority:"reviewer"}, source:"return_service", occurredAt:now.toISOString(), recordedAt:now.toISOString(),
  idempotencyKey:"approve-return-qa", commandFingerprint:"1".repeat(64), previousEventId:request.eventId, reason:request.reason,
});
const orders = {
  "direct":direct, "duplicate":direct,
  "cancelled":fixtureOrder("QA-250", seedIds[2], 250, "cancelled", 1),
  "refund":{...fixtureOrder("QA-450", seedIds[4], 450, "completed", 3), paymentDetails:{ status:"refunded", providerReference:"DO-NOT-EMBED-PAYMENT" }, fulfillmentSummary:{state:"completed"}},
  "deep":fixtureOrder("QA-600", seedIds[7], 600, "completed", 6),
  "returned":{...returnOrder, completion},
  "self":{...fixtureOrder("QA-OWN", seedIds[8], 200, "pending"), items:[{ name:injection, quantity:1 }]},
  "guest":fixtureOrder("QA-GUEST", null, 150, "pending"),
  "unknown":fixtureOrder("QA-UNKNOWN", "unknown-id", 350, "pending"),
  "legacy":{...fixtureOrder("QA-NESTED-ID-REQUIRED", null, 120, "pending"), memberId:seedIds[0]},
  "conflict-a":fixtureOrder("QA-CONFLICT", seedIds[1], 180, "pending"),
  "conflict-b":fixtureOrder("QA-CONFLICT", seedIds[2], 190, "pending"),
};
const source = new Map<string, Buffer>();
async function write(target: string, content: Buffer | string) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, { flag: "wx" });
}
async function seed(file: string, value: unknown) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(encode(value));
  await write(path.join(root, file), bytes);
  source.set("raw/" + file, bytes);
}
await fs.mkdir(path.join(root, "uploads/member-avatars"), { recursive: true });
for (const member of records) await seed("members/" + member.memberId + ".json", { ...member, id: member.memberId });
await seed("member-identity/registry.json", identity);
await seed("membership-commerce/commerce-state.json", commerce);
await seed("membership-commerce/business-rules.json", { schemaVersion: 1, revision: 1 });
for (const [name, order] of Object.entries(orders)) await seed("orders/" + name + ".json", order);
await seed("fulfillment/settings.json", { schemaVersion: 1 });
await seed("fulfillment/state.json", { schemaVersion: 1, records: {} });
await seed("store/website-data.json", { qa: true });
await seed("store-domain/catalog.json", { schemaVersion: 1, revision: 1, products: [{ id:"synthetic-store", sku:"SYNTHETIC-STORE-001", price: 120, inventory: 10 }] });
await seed("uploads/order-notifications/SYNTHETIC-01.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l2cAAAAASUVORK5CYII=", "base64"));
Object.assign(process.env, {NODE_ENV:"test", KD_DATA_DIR:root, RAILWAY_GIT_COMMIT_SHA:"backup-ui-synthetic"});
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;

const backup = await createMemberBackup(options);
const verified = await getVerifiedMemberBackupForDownload(backup.manifest.backupId, { testOnlyAllowNonProduction: true });
const zip = await createMemberBackupZipArtifact(verified);
const zipPath = path.join(output, "KD-Coffee-backup-ui-synthetic.zip");
const chunks: Buffer[] = [];
for await (const chunk of Readable.fromWeb(zip.body as never)) chunks.push(Buffer.from(chunk));
const archive = Buffer.concat(chunks);
assert.equal(archive.length, zip.bytes);
await write(zipPath, archive);
await fs.mkdir(extracted);
execFileSync("tar", ["-xf", zipPath, "-C", extracted]);
for (const file of verified.files) {
  const actual = await fs.readFile(path.join(extracted, file.archivePath));
  assert.deepEqual(actual, await fs.readFile(file.absolutePath));
  if (source.has(file.archivePath)) assert.deepEqual(actual, source.get(file.archivePath));
}
const recovery = path.join(workspace, "isolated-recovery");
for (const [archivePath, bytes] of source) {
  const restored = path.join(recovery, archivePath.slice("raw/".length));
  await write(restored, await fs.readFile(path.join(extracted, archivePath)));
  assert.deepEqual(await fs.readFile(restored), bytes);
}
for (const file of ["index.html", "organization.html"]) {
  const content = await fs.readFile(path.join(extracted, file), "utf8");
  assert.doesNotMatch(content, /DO-NOT-EMBED|MUST-NOT-APPEAR-IN-HTML|synthetic-person@example\.invalid|\+886 00 001 123|\binnerHTML\b/u);
  assert.ok(backup.manifest.files.some(entry => entry.path === file && entry.sha256 === digest(content)));
}
assert.equal(backup.manifest.counts.members, records.length);
assert.equal(backup.manifest.counts.totalReferrals, links.length);
assert.equal(backup.manifest.counts.orders, Object.keys(orders).length);

// Reconstruct a previous-format fixture with no index.html and verify it through the current downloader.
const legacyRoot = path.join(workspace, "legacy");
const legacyDir = path.join(legacyRoot, "backups", "members", backup.manifest.backupId);
const legacyOrganization = "<!doctype html><meta charset=utf-8><title>KD Coffee 會員組織圖備份</title>";
const legacy = { ...backup.manifest, backupVersion:"J.5D.5A-H1-v1", datasets:backup.manifest.datasets.filter(item => item.id !== "store_catalog"), files:backup.manifest.files.filter(f => f.path !== "index.html" && f.path !== "raw/store-domain/catalog.json").map(f => f.path === "organization.html" ?
  { path:f.path, bytes:Buffer.byteLength(legacyOrganization), sha256:digest(legacyOrganization) } : f) };
for (const file of legacy.files) {
  const content = file.path === "organization.html" ? legacyOrganization : await fs.readFile(path.join(extracted, file.path));
  await write(path.join(legacyDir, file.path), content);
}
const legacyManifest = encode(legacy);
await write(path.join(legacyDir, "manifest.json"), legacyManifest);
await write(path.join(legacyDir, "checksums.sha256"), [...legacy.files, {path:"manifest.json", sha256:digest(legacyManifest)}].map(file => file.sha256 + "  " + file.path).join("\n") + "\n");
process.env.KD_DATA_DIR = legacyRoot;
const old = await getVerifiedMemberBackupForDownload(legacy.backupId, { testOnlyAllowNonProduction: true });
assert.equal(old.manifest.backupVersion, "J.5D.5A-H1-v1");
assert.ok(old.files.some(f => f.archivePath === "organization.html"));
assert.ok(!old.files.some(f => f.archivePath === "index.html"));
assert.ok(!old.manifest.datasets.some(item => item.id === "store_catalog"));

// H2 stays readable too.  Re-rendering its manifest through the current offline
// viewer must explicitly identify the absent Store catalog rather than treating
// website-data as Store catalog coverage.
const legacyH2Id = "20261108T020001Z_a1b2c3d4";
const legacyH2Dir = path.join(legacyRoot, "backups", "members", legacyH2Id);
const legacyH2 = { ...legacy, backupId: legacyH2Id, backupVersion: "J.5D.5A-H2-v1" as const, backupLocation: legacyH2Dir };
for (const file of legacyH2.files) {
  await write(path.join(legacyH2Dir, file.path), await fs.readFile(path.join(legacyDir, file.path)));
}
const legacyH2Manifest = encode(legacyH2);
await write(path.join(legacyH2Dir, "manifest.json"), legacyH2Manifest);
await write(path.join(legacyH2Dir, "checksums.sha256"), [...legacyH2.files, {path:"manifest.json", sha256:digest(legacyH2Manifest)}].map(file => file.sha256 + "  " + file.path).join("\n") + "\n");
const h2 = await getVerifiedMemberBackupForDownload(legacyH2Id, { testOnlyAllowNonProduction: true });
assert.equal(h2.manifest.backupVersion, "J.5D.5A-H2-v1");
assert.ok(!h2.manifest.datasets.some(item => item.id === "store_catalog"));
const h2Coverage = buildBackupIndexViewer(h2.manifest);
assert.match(h2Coverage, /Store 商品 catalog/u);
assert.match(h2Coverage, /包含未備份的資料集/u);

const tampered = path.join(workspace, "tampered");
await fs.cp(extracted, tampered, { recursive:true });
await fs.appendFile(path.join(tampered, "organization.html"), "tamper");
const variants = path.join(workspace, "variants");
const extra = Array.from({length:1600}, (_, i) => ({
  memberId:"large-" + i, memberNumber:"L-" + i, displayName:"合成會員 " + i, status:"active", phone:"", email:"",
}));
for (const [filename, members, connections] of [
  ["empty", [], []], ["single", records.slice(0, 1), []],
  ["anomalies", records.slice(0, 3), [[seedIds[0],seedIds[1]],[seedIds[1],seedIds[0]],["absent",seedIds[2]],[seedIds[2],seedIds[2]]]],
  ["large", extra, extra.slice(1).map(m => [extra[0].memberId, m.memberId])],
] as const) {
  const tree = buildOrganizationTree({
    identity: { members: Object.fromEntries(members.map(m => [m.memberId, m])) },
    commerce: { referrals: referrals(connections.map(([a,b]) => [a,b])) },
    profiles: new Map(), createdAt: now.toISOString(),
  });
  const inputs = new Map<string, unknown>();
  if (filename === "large") for (let i = 0; i < 1200; i++) {
    inputs.set("raw/orders/large-" + i + ".json", fixtureOrder("QA-LARGE-" + i, extra[1].memberId, 100, "completed"));
  }
  const data = buildBackupOrderViewerData(tree, members.map(member => member.memberId), inputs, {});
  if (filename === "anomalies") assert.equal(data.graph.children.length, 0);
  await write(path.join(variants, filename + ".html"), buildBackupOrganizationViewer(tree, [...members], data));
}
console.log("PASS ZIP extraction, original bytes, checksums, and legacy backup verification");
console.log("SAMPLE " + output);

// Drive the installed browser using its local debugging pipe. No HTTP server is needed.
type CdpEvent = { id?:number; method?:string; result?:any; error?:{message:string}; params?:any };
async function browserCheck(browser: string, executable: string) {
  assert.ok(existsSync(executable), browser + " executable missing");
  const profile = await fs.mkdtemp(path.join(workspace, browser + "-"));
  const child = spawn(executable, ["--headless=new","--no-first-run","--disable-background-networking","--remote-debugging-pipe","--user-data-dir=" + profile,"about:blank"], {
    stdio:["ignore","ignore","ignore","pipe","pipe"], windowsHide:true,
  });
  const input = child.stdio[3] as NodeJS.WritableStream;
  const read = child.stdio[4] as NodeJS.ReadableStream;
  const pending = new Map<number, (event: CdpEvent) => void>();
  let seq = 0, sessionId: string | undefined, buffer = "";
  const outside: string[] = [], errors: string[] = [];
  read.setEncoding("utf8");
  read.on("data", (chunk: string) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\0")) !== -1) {
      const msg = JSON.parse(buffer.slice(0,end)) as CdpEvent;
      buffer = buffer.slice(end + 1);
      if (msg.id) pending.get(msg.id)?.(msg);
      if (msg.method === "Network.requestWillBeSent" && /^https?:/i.test(msg.params.request.url)) outside.push(msg.params.request.url);
      if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    }
  });
  function command(method: string, params = {}, withSession = true): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("CDP timeout: " + method)); }, 10000);
      pending.set(id, message => { clearTimeout(timer); pending.delete(id); if (message.error) reject(new Error(method + ": " + message.error.message)); else resolve(message.result); });
      input.write(JSON.stringify({id, method, params, ...(withSession && sessionId ? {sessionId} : {})}) + "\0");
    });
  }
  const evaluate = async (expression: string) => {
    const {result,exceptionDetails} = await command("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
    assert.ok(!exceptionDetails, exceptionDetails?.exception?.description);
    return result.value;
  };
  const until = async (expression: string) => {
    for (let i=0;i<100;i++) {
      if (await evaluate(expression)) return;
      await delay(60);
    }
    throw new Error(browser + " did not reach: " + expression);
  };
  const open = async (file: string, suffix = "") => {
    const url = pathToFileURL(file).href + suffix;
    const navigation = await command("Page.navigate",{url});
    assert.ok(!navigation.errorText, navigation.errorText);
    await until("location.href===" + JSON.stringify(url) + " && document.readyState==='complete'");
  };
  const screenshot = async (filename: string) => {
    if (browser !== "Chrome") return;
    const {data} = await command("Page.captureScreenshot",{format:"png"});
    await write(path.join(output, filename), Buffer.from(data,"base64"));
  };
  const $ = (selector: string) => "document.querySelector(" + JSON.stringify(selector) + ")";
  const click = async (selector: string) => evaluate($ (selector) + ".click()");
  const search = async (query: string) => evaluate(`(() => { const el=document.getElementById("search");el.value=${JSON.stringify(query)};el.dispatchEvent(new Event("input",{bubbles:true})); })()`);
  try {
    const {targetId} = await command("Target.createTarget",{url:"about:blank"},false);
    ({sessionId} = await command("Target.attachToTarget",{targetId,flatten:true},false));
    await command("Page.enable");
    await command("Runtime.enable");
    await command("Network.enable");
    await command("Network.emulateNetworkConditions",{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    await command("Emulation.setDeviceMetricsOverride",{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await open(path.join(extracted,"index.html"));
    assert.match(await evaluate("document.title"), /備份資料檢視中心/);
    assert.match(await evaluate($("#verify-result") + ".textContent"), /尚未重新驗證/);
    await screenshot("01-desktop-overview.png");
    for (const [directory, message] of [[extracted,"重新驗證通過"],[tampered,"驗證未通過"]]) {
      const {root:dom} = await command("DOM.getDocument");
      const {nodeId} = await command("DOM.querySelector",{nodeId:dom.nodeId,selector:"#backup-folder"});
      await command("DOM.setFileInputFiles",{nodeId,files:[directory]});
      await until($("#verify-result") + ".textContent.includes(" + JSON.stringify(message) + ")");
    }
    await open(path.join(extracted,"organization.html"));
    await until("document.querySelectorAll('.node').length===4");
    assert.equal(await evaluate("document.querySelectorAll('.edges path').length"),3);
    assert.match(await evaluate($(".node.root .numbers") + ".textContent"),/直推 3 人\s+團隊 8 人/);
    await screenshot("02-desktop-organization.png");
    await click('.node.root .name-button');
    await click("#member-tab-self");
    assert.match(await evaluate($("#order-results") + ".textContent"), /此範圍沒有訂單/);
    await click("#member-tab-direct");
    assert.equal(await evaluate("document.querySelectorAll('#order-results .order-row').length"),2);
    assert.match(await evaluate($("#order-summary") + ".textContent"), /全部訂單金額NT\$ 1,100已完成訂單金額NT\$ 850/);
    assert.doesNotMatch(await evaluate($("#order-results") + ".textContent"), /QA-450|QA-600/);
    await click("#member-tab-team");
    const team = await evaluate($("#order-summary") + ".textContent");
    assert.match(team, /可確認直推會員3 人可確認團隊會員8 人此範圍訂單5 筆/);
    assert.match(team, /全部訂單金額NT\$ 2,450已完成訂單金額NT\$ 1,450/);
    assert.match(await evaluate($("#member-order-panel") + ".textContent"), /依備份當時的組織關係統計，並非下單當時的推薦歸屬/);
    for (const number of ["QA-GUEST","QA-NESTED-ID-REQUIRED","QA-UNKNOWN"]) {
      assert.ok((await evaluate($("#order-unlinked-list") + ".textContent")).includes(number));
    }
    assert.match(await evaluate($("#order-unlinked-list") + ".textContent"), /QA-CONFLICT.*內容衝突/);
    assert.doesNotMatch(await evaluate($("#order-results") + ".textContent"), /QA-GUEST|QA-UNKNOWN|QA-CONFLICT|QA-OWN/);
    assert.match(await evaluate($("#order-results") + ".textContent"), /第 3 層/);
    await screenshot("05-desktop-team-orders.png");
    const setInput = (id: string, value: string) => evaluate(`(() => {const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event("input"));})()`);
    await setInput("order-sort", "asc");
    assert.equal(await evaluate($("#order-results .row strong") + ".textContent"),"QA-250");
    await setInput("order-status", "status:cancelled");
    assert.equal(await evaluate("document.querySelectorAll('#order-results .row').length"),1);
    await setInput("order-status", "all");
    await setInput("order-search", "QA-450");
    await click("#order-results button");
    assert.match(await evaluate($("#order-detail-fields") + ".textContent"), /付款狀態已退款.*履約狀態已完成/);
    assert.match(await evaluate($("#order-detail-returns") + ".textContent"), /沒有可驗證的退款金額/);
    await click("#order-detail-back");
    await setInput("order-search", "QA-RETURN");
    await click("#order-results button");
    assert.match(await evaluate($("#order-detail-returns") + ".textContent"), /退貨已核准/);
    assert.match(await evaluate($("#order-detail-returns") + ".textContent"), /有效消費紀錄已因退貨或退款沖回/);
    await click("#member-tab-rewards");
    assert.match(await evaluate($("#member-reward-status") + ".textContent"), /2 筆/);
    assert.match(await evaluate($("#member-reward-list") + ".textContent"), /已有發放紀錄.*已有沖回紀錄|已有沖回紀錄.*已有發放紀錄/);
    assert.doesNotMatch(await evaluate($("#member-reward-list") + ".textContent"), /QA-250/);
    await click("#detail-close");
    await click('[data-branch="sample-0"]');
    assert.equal(await evaluate("document.querySelectorAll('.node').length"),1);
    await click('[data-branch="sample-0"]');
    assert.equal(await evaluate("document.querySelectorAll('.node').length"),4);
    await click("#plus");
    assert.equal(await evaluate($("#zoom") + ".textContent"),"110%");
    await click("#minus");
    await click("#fit");
    await click("#reset");
    assert.equal(await evaluate($("#zoom") + ".textContent"),"100%");
    await evaluate($("#graph-view") + ".dispatchEvent(new WheelEvent('wheel',{deltaY:-80,ctrlKey:true,cancelable:true}))");
    assert.equal(await evaluate($("#zoom") + ".textContent"),"108%");
    await click("#reset");
    await search("不存在的測試");
    assert.match(await evaluate($("#results-status") + ".textContent"), /找不到符合/);
    await search(longId);
    await click("#results button");
    assert.equal(await evaluate($(".node.hit") + ".dataset.node"),longId);
    assert.equal(await evaluate("document.querySelectorAll('#canvas img').length"),0);
    await click(".node.hit .name-button");
    assert.equal(await evaluate($("#detail") + ".open"),true);
    assert.ok((await evaluate($("#detail-fields") + ".textContent")).includes(longId));
    assert.equal(await evaluate("window.injected===undefined"),true);
    await command("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
    await command("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape",windowsVirtualKeyCode:27});
    await until("!document.querySelector('#detail').open");
    const viewport = await evaluate(`(() => {
      const view=document.getElementById("graph-view");
      view.scrollIntoView({block:"start"});view.scrollTop=0;
      const bounds=view.getBoundingClientRect();
      return {x:Math.floor(bounds.left)+5,y:Math.floor(bounds.top)+100};
    })()`);
    await command("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,buttons:1,...viewport});
    await command("Input.dispatchMouseEvent",{type:"mouseMoved",button:"left",buttons:1,x:viewport.x,y:viewport.y-60});
    await command("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,x:viewport.x,y:viewport.y-60});
    assert.ok(await evaluate($("#graph-view") + ".scrollTop>0"));
    await click("#root");
    assert.equal(await evaluate("document.activeElement.closest('.node').dataset.node"),seedIds[0]);
    await open(path.join(extracted,"organization.html"),"#members");
    await search("kd-000009");
    await click("#results button");
    assert.match(await evaluate($("#detail-fields") + ".textContent"), /停用.*未提供/);
    await click("#member-tab-rewards");
    assert.equal(await evaluate($("#member-reward-status") + ".textContent"), "此備份未提供足夠資料確認獎勵關聯");
    await click("#member-tab-self");
    assert.match(await evaluate($("#order-results") + ".textContent"), /QA-OWN/);
    await click("#order-results button");
    assert.equal(await evaluate("document.querySelectorAll('#order-detail-items img').length"),0);
    await click("#member-tab-info");
    await click("#detail-locate");
    assert.equal(await evaluate($(".node.hit") + ".dataset.node"),seedIds[8]);
    await command("Emulation.setDeviceMetricsOverride",{width:390,height:900,deviceScaleFactor:1,mobile:true});
    await open(path.join(extracted,"index.html"));
    assert.ok(await evaluate("document.documentElement.scrollWidth===innerWidth"));
    await screenshot("03-mobile-overview.png");
    await open(path.join(extracted,"organization.html"));
    await until("document.querySelectorAll('.node').length===4");
    assert.ok(await evaluate("document.documentElement.scrollWidth===innerWidth && getComputedStyle(document.querySelector('.node')).position==='relative'"));
    await evaluate($("#graph-panel") + ".scrollIntoView({block:'start'})");
    await screenshot("04-mobile-organization.png");
    await click(".node.root .name-button");
    await click("#member-tab-team");
    await setInput("order-search", "QA-450");
    await click("#order-results button");
    assert.equal(await evaluate($("#order-detail-title") + ".textContent"),"訂單 QA-450");
    assert.ok(await evaluate("document.querySelector('#detail').scrollWidth <= document.querySelector('#detail').clientWidth + 1"));
    await screenshot("06-mobile-order-detail.png");
    for (const [file, assertion] of [
      ["empty","document.getElementById('canvas').textContent.includes('沒有可顯示')"],
      ["single","document.querySelectorAll('.node').length===1"],
      ["anomalies","document.querySelector('.notice').textContent.includes('循環推薦')"],
      ["large","document.querySelectorAll('.node').length===9"],
    ]) {
      await open(path.join(variants, file + ".html"));
      await until(assertion);
    }
    await click(".node.root .name-button");
    await click("#member-tab-team");
    assert.match(await evaluate($("#order-summary") + ".textContent"), /此範圍訂單1200 筆.*已完成訂單金額無法可靠計算/);
    assert.equal(await evaluate("document.querySelectorAll('#order-results .row').length"),15);
    await click("#order-next");
    assert.equal(await evaluate($("#order-page-label") + ".textContent"), "2 / 80");
    await click("#detail-close");
    await search("large-1599");
    await click("#results button");
    assert.equal(await evaluate($(".node.hit") + ".dataset.node"),"large-1599");
    assert.deepEqual(outside, []);
    assert.deepEqual(errors, []);
    console.log("PASS " + browser + " file:// offline, graph, search, checksum, injection, and mobile layout");
  } finally {
    child.kill();
  }
}
await browserCheck("Chrome", process.env.BACKUP_UI_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe");
await browserCheck("Edge", process.env.BACKUP_UI_EDGE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe");
