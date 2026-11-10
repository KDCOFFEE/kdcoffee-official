export const orderViewerScript = String.raw`
const orderData = data.orderData;
const orderBuckets = new Map();
const rewardBuckets = new Map();
function bucket(rows, result) {
  for (const row of rows) {
    const list = result.get(row.memberId) ?? [];
    list.push(row);
    result.set(row.memberId, list);
  }
}
bucket(orderData?.orders ?? [], orderBuckets);
bucket(orderData?.rewards ?? [], rewardBuckets);
const confirmedChildren = new Map(orderData?.graph.children ?? []);
const orderLabels = {
  completed:"已完成", cancelled:"已取消", returned:"已退貨", refunded:"已退款",
  uncollected:"未取貨", new_order:"新訂單", pending:"待處理", preparing:"準備中",
  waiting_merchant_create_cod_shipment:"待建立取貨付款寄件單",
  waiting_studio_pickup_confirmation:"待確認工作室自取", shipped:"已出貨",
  arrived_at_pickup_store:"已到取貨門市", in_transit:"配送中", ready_for_store_pickup:"待自取",
  paid:"已付款", failed:"失敗", scheduled:"已建立・排程中", released:"已有發放紀錄",
  reversed:"已有沖回紀錄", qualified:"已符合資格", awaiting_order:"等待資格訂單",
  awaiting_completion:"等待資格訂單完成", expired:"資格期限已過",
  RETURN_REQUESTED:"退貨申請中", RETURN_PROCESSING_LOCKED:"退貨處理中", RETURN_APPROVED:"退貨已核准",
  RETURN_WITHDRAWN:"退貨已撤回", RETURN_REJECTED:"退貨已拒絕",
  guest:"未記錄會員 ID（訪客或未登入）", unknown_member:"會員 ID 無法與名冊確認",
  conflict:"同編號的檔案內容衝突", missing_number:"訂單檔案未提供編號",
  referral_unconfirmed:"本人可確認，推薦連結待核對",
};
const orderLabel = value => Object.hasOwn(orderLabels, value) ? orderLabels[value] : value || "未提供";
const money = value => value === null ? "無法可靠計算" : "NT$ " + value.toLocaleString("zh-TW");
const timestamp = new Intl.DateTimeFormat("zh-TW", {
  timeZone:"Asia/Taipei", year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23",
});
const orderDate = value => value ? timestamp.format(new Date(value)) : "未提供日期";
const tabs = ["info", "self", "direct", "team", "rewards"];
const orderPanel = $("member-order-panel"), orderDetailPanel = $("member-order-detail");
let orderOwner, orderTab = "info", orderPage = 0, orderRows = [], scopeMembers;
const orderPageSize = 15;

function relatedMembers(owner) {
  const levels = new Map([[owner, 0]]);
  const queue = [owner];
  for (let i = 0; i < queue.length; i++) {
    const parent = queue[i];
    for (const child of confirmedChildren.get(parent) ?? []) {
      if (levels.has(child)) continue;
      levels.set(child, levels.get(parent) + 1);
      queue.push(child);
    }
  }
  return levels;
}
function openMemberView(id) {
  orderOwner = id;
  scopeMembers = undefined;
  setOrderTab("info");
}
function setOrderTab(tab) {
  orderTab = tab;
  for (const id of tabs) $("member-tab-" + id).setAttribute("aria-pressed", String(id === tab));
  $("member-info-panel").hidden = tab !== "info";
  orderPanel.hidden = tab === "info" || tab === "rewards";
  $("member-reward-panel").hidden = tab !== "rewards";
  orderDetailPanel.hidden = true;
  if (tab === "info") return;
  if (tab === "rewards") { renderRewards(); return; }
  scopeMembers ??= relatedMembers(orderOwner);
  const seen = new Set();
  orderRows = [];
  for (const [id, level] of scopeMembers) {
    if ((tab === "self" && level !== 0) || (tab === "direct" && level !== 1) || (tab === "team" && level === 0)) continue;
    for (const order of orderBuckets.get(id) ?? []) {
      if (seen.has(order.orderNumber)) continue;
      seen.add(order.orderNumber);
      orderRows.push({order, level});
    }
  }
  $("order-search").value = "";
  $("order-sort").value = "desc";
  const filter = $("order-status");
  const statuses = new Set(orderRows.map(row => row.order.status));
  filter.replaceChildren(new Option("所有狀態", "all"));
  for (const state of statuses) filter.append(new Option(orderLabel(state), "status:" + state));
  orderPage = 0;
  $("order-controls").hidden = !orderData;
  renderOrderSummary();
  renderOrderList();
}

function totalOf(rows) {
  let total = 0;
  for (const {order} of rows) {
    if (order.total === null) return null;
    total += order.total;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}
function renderOrderSummary() {
  const summary = $("order-summary");
  summary.replaceChildren();
  $("order-revenue-note").hidden = !orderData;
  $("order-unlinked").hidden = !orderData;
  if (!orderData) {
    summary.append(el("p", "此備份未提供訂單檢視資料。", "note"));
    return;
  }
  const completed = orderRows.filter(({order}) => order.status === "completed");
  const eligible = completed.filter(({order}) => !order.returnRisk);
  const completeAmount = eligible.length && !orderData.completeReturnLedger ? null : totalOf(eligible);
  const direct = [...scopeMembers.values()].filter(level => level === 1).length;
  const distribution = new Map();
  for (const {order} of orderRows) distribution.set(order.status, (distribution.get(order.status) ?? 0) + 1);
  const fields = el("dl", undefined, "order-stats");
  for (const [label, value] of [
    ["可確認直推會員", direct + " 人"], ["可確認團隊會員", (scopeMembers.size - 1) + " 人"],
    ["此範圍訂單", orderRows.length + " 筆"], ["已完成狀態", completed.length + " 筆"],
    ["已取消狀態", (distribution.get("cancelled") ?? 0) + " 筆"],
    ["全部訂單金額", money(totalOf(orderRows))], ["已完成訂單金額", money(completeAmount)],
  ]) fields.append(el("dt", label), el("dd", value));
  summary.append(fields, el("p", "訂單狀態分布：" + ([...distribution].map(([key, n]) => orderLabel(key) + " " + n + " 筆").join("、") || "此範圍無訂單"), "note compact"));
  if (eligible.length !== completed.length) summary.append(el("p", "已完成金額排除 " + (completed.length - eligible.length) + " 筆有退貨或退款跡象的訂單。", "note"));
  if (completeAmount === null && !orderData.completeReturnLedger) summary.append(el("p", "此備份的退貨或結算紀錄不足以核對已完成金額。", "note"));
  if (orderData.graph.excludedEdges) summary.append(el("p", "全備份有 " + orderData.graph.excludedEdges + " 位會員的推薦連結待核對，相關分支不納入上線統計。", "notice"));
  $("order-unlinked-label").textContent = "未對應及待核對訂單（全備份 " + orderData.unlinked.length + " 筆）";
  $("order-duplicates").textContent = "完全相同的重複訂單檔案已合併：" + orderData.duplicates + " 份。";
  showUnlinked(0);
}
function showUnlinked(page) {
  const entries = orderData.unlinked;
  const list = $("order-unlinked-list");
  list.replaceChildren();
  for (const entry of entries.slice(page * orderPageSize, (page + 1) * orderPageSize)) {
    list.append(el("li", (entry.orderNumber || "未提供編號") + " · " + orderLabel(entry.reason)));
  }
  $("order-unlinked-next").hidden = entries.length <= orderPageSize;
  $("order-unlinked-next").onclick = () => showUnlinked((page + 1) % Math.ceil(entries.length / orderPageSize));
}

function renderOrderList() {
  const list = $("order-results");
  list.replaceChildren();
  if (!orderData) { $("order-page").hidden = true; return; }
  const query = normalize($("order-search").value), filter = $("order-status").value;
  const direction = $("order-sort").value === "asc" ? 1 : -1;
  const rows = orderRows.filter(({order}) => normalize(order.orderNumber).includes(query) && (filter === "all" || filter === "status:" + order.status));
  rows.sort((a, b) => {
    if (!a.order.createdAt || !b.order.createdAt) {
      if (a.order.createdAt !== b.order.createdAt) return a.order.createdAt ? -1 : 1;
    }
    return direction * ((Date.parse(a.order.createdAt) || 0) - (Date.parse(b.order.createdAt) || 0)) || a.order.orderNumber.localeCompare(b.order.orderNumber);
  });
  const pages = Math.max(1, Math.ceil(rows.length / orderPageSize));
  orderPage = Math.min(orderPage, pages - 1);
  $("order-results-count").textContent = "顯示 " + rows.length + "／" + orderRows.length + " 筆";
  $("order-page").hidden = pages <= 1;
  $("order-page-label").textContent = (orderPage + 1) + " / " + pages;
  $("order-prev").disabled = orderPage === 0;
  $("order-next").disabled = orderPage + 1 === pages;
  if (!rows.length) list.append(el("p", orderRows.length ? "找不到符合篩選的訂單。" : "此範圍沒有訂單。", "note"));
  for (const entry of rows.slice(orderPage * orderPageSize, (orderPage + 1) * orderPageSize)) {
    const {order, level} = entry;
    const row = el("article", undefined, "row order-row");
    const content = el("div");
    const count = order.items && order.items.every(item => item.quantity !== null) ? order.items.reduce((n,item) => n + item.quantity, 0) : null;
    const quantity = Number.isSafeInteger(count) ? count + " 件" : "數量未提供";
    const member = byId.get(order.memberId);
    content.append(el("strong", order.orderNumber), el("div", orderDate(order.createdAt) + " · " + orderLabel(order.status), "muted"),
      el("div", name(member) + " · " + (level === 0 ? "本人" : "第 " + level + " 層") + " · " + quantity, "muted"));
    const actions = el("div", undefined, "order-row-actions");
    const open = button("訂單詳情", () => showOrder(entry, open));
    actions.append(el("strong", money(order.total)), open);
    row.append(content, actions);
    list.append(row);
  }
}
function showOrder({order}, trigger) {
  orderPanel.hidden = true;
  orderDetailPanel.hidden = false;
  $("order-detail-title").textContent = "訂單 " + order.orderNumber;
  const fields = $("order-detail-fields");
  fields.replaceChildren();
  const values = [
    ["下單時間（台北）", orderDate(order.createdAt)], ["訂單狀態", orderLabel(order.status)],
    ["商品小計", money(order.subtotal)], ["配送費", money(order.shipping)], ["原始訂單總額", money(order.total)],
  ];
  if (order.paymentStatus) values.push(["付款狀態", orderLabel(order.paymentStatus)]);
  if (order.fulfillmentState) values.push(["履約狀態", orderLabel(order.fulfillmentState)]);
  for (const [label, value] of values) fields.append(el("dt", label), el("dd", value));
  const products = $("order-detail-items");
  products.replaceChildren();
  for (const item of order.items ?? []) products.append(el("li", (item.name || "未命名商品") + " × " + (item.quantity ?? "未提供")));
  if (!order.items?.length) products.append(el("li", "沒有可顯示的商品紀錄。"));
  const returns = $("order-detail-returns");
  returns.replaceChildren();
  for (const entry of order.returnRequests) returns.append(el("li", orderLabel(entry.state) + " · " + orderDate(entry.at)));
  for (const entry of order.refunds) returns.append(el("li", "已確認退款 " + money(entry.amount) + " · " + orderDate(entry.at)));
  if (order.paymentStatus === "refunded" && !order.refunds.length) returns.append(el("li", "訂單記錄已退款，沒有可驗證的退款金額。"));
  if (order.reversed) returns.append(el("li", "有效消費紀錄已因退貨或退款沖回。"));
  if (order.status === "returned" || order.status === "refunded") returns.append(el("li", "原始訂單狀態：" + orderLabel(order.status)));
  $("order-detail-returns-section").hidden = !returns.children.length;
  $("order-detail-back").onclick = () => { orderDetailPanel.hidden = true; orderPanel.hidden = false; trigger.focus(); };
  $("order-detail-title").focus();
}
function renderRewards() {
  const list = $("member-reward-list");
  const rewards = rewardBuckets.get(orderOwner) ?? [];
  list.replaceChildren();
  $("member-reward-status").textContent = rewards.length ?
    "可確認的獎勵紀錄：" + rewards.length + " 筆。未能對應的紀錄不列入。" :
    "此備份未提供足夠資料確認獎勵關聯";
  for (const reward of rewards) {
    const item = el("article", undefined, "row order-row");
    const details = el("div");
    details.append(el("strong", reward.orderNumber), el("div", "獎勵紀錄：" + orderLabel(reward.status)),
      el("div", "資格紀錄：" + orderLabel(reward.qualification), "muted"),
      el("div", reward.hold ? "有已記錄且尚待處理的退貨 HOLD" : "未確認現行 HOLD", "muted"));
    if (reward.recordedLevel !== null) details.append(el("div", "獎勵來源快照：第 " + reward.recordedLevel + " 層", "muted"));
    if (reward.releasedAt) details.append(el("div", "發放 " + orderDate(reward.releasedAt), "muted"));
    if (reward.reversedAt) details.append(el("div", "沖回 " + orderDate(reward.reversedAt), "muted"));
    item.append(details);
    list.append(item);
  }
}
for (const tab of tabs) $("member-tab-" + tab).onclick = () => setOrderTab(tab);
for (const id of ["order-search", "order-status", "order-sort"]) $(id).addEventListener("input", () => { orderPage = 0; renderOrderList(); });
$("order-prev").onclick = () => { orderPage--; renderOrderList(); };
$("order-next").onclick = () => { orderPage++; renderOrderList(); };
`;
