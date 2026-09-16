type JsonRecord = Record<string, unknown>;

type OrganizationNodeLike = {
  memberId: string;
  memberNumber: string;
  parentId: string | null;
  childrenIds: string[];
  depth: number | null;
  directReferralCount: number;
  teamCount: number;
  descendantCount: number;
  relationshipStatus: string;
};

type OrganizationTreeLike = {
  createdAt: string;
  roots: string[];
  nodes: OrganizationNodeLike[];
};

export type OfflineMemberOrderSummary = {
  orderNumber: string;
  createdAt: string;
  status: string;
  amount: number | null;
  orderMode: string;
  store: { id: string; name: string; address: string } | null;
  studioPickup: { preferredDate: string; preferredTime: string } | null;
  items: string[];
};

export type OfflineMemberFulfillmentSummary = {
  orderNumber: string;
  currentState: string;
  updatedAt: string;
  events: Array<{ state: string; occurredAt: string; source: string; note: string }>;
};

export type OfflineMemberIndexEntry = {
  memberId: string;
  memberNumber: string;
  displayName: string;
  phone: string;
  email: string;
  loginEmail: string;
  maskedPhone: string;
  maskedEmail: string;
  search: {
    memberId: string;
    memberNumber: string;
    displayName: string;
    phoneNormalized: string;
    emailNormalized: string;
    loginEmailNormalized: string;
  };
  identity: {
    createdAt: string;
    updatedAt: string;
    status: string;
    providerTypes: string[];
    customAvatar: boolean;
    providerPicture: boolean;
  };
  organization: {
    parentId: string | null;
    parentMemberNumber: string;
    parentDisplayName: string;
    children: Array<{ memberId: string; memberNumber: string; displayName: string }>;
    directReferralCount: number;
    teamCount: number;
    descendantCount: number;
    depth: number | null;
    relationshipStatus: string;
  };
  subscriptions: Array<{
    subscriptionId: string;
    status: string;
    intervalDays: number | null;
    anchorDate: string;
    shippingMethod: string;
    storeSelection: { storeId: string; storeName: string } | null;
    nextCycle: null | {
      cycleId: string;
      kind: string;
      status: string;
      plannedDate: string;
      orderCreationDate: string;
      modificationDeadline: string;
      createdOrderId: string | null;
      estimatedAmount: number | null;
    };
  }>;
  commerce: {
    creditEntriesCount: number;
    recordedRemainingCredit: number;
    creditStatusCounts: Record<string, number>;
    rewardCount: number;
    rewardStatusCounts: Record<string, number>;
    calculatedRewardAmount: number;
    projectedRewardAmount: number;
    effectivePV: number;
    validConsumptionCount: number;
    validConsumptionAmount: number;
    qualificationRoundCount: number;
  };
  orders: {
    totalCount: number;
    recent: OfflineMemberOrderSummary[];
  };
  fulfillment: OfflineMemberFulfillmentSummary[];
};

export type OfflineMemberSearchResult = {
  member: OfflineMemberIndexEntry;
  score: number;
  exact: boolean;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function entries(value: unknown) {
  return Object.entries(asRecord(value)).map(([key, item]) => [key, asRecord(item)] as const);
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function finiteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function sumNumbers(records: JsonRecord[], key: string) {
  return records.reduce((sum, record) => sum + (finiteNumber(record[key]) ?? 0), 0);
}

function statusCounts(records: JsonRecord[]) {
  return records.reduce<Record<string, number>>((result, record) => {
    const status = text(record.status) || "unknown";
    result[status] = (result[status] ?? 0) + 1;
    return result;
  }, {});
}

export function normalizeOfflinePhone(value: string) {
  return value.trim().replace(/[\s\-()]/gu, "");
}

export function normalizeOfflineEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase("zh-Hant");
}

export function maskOfflinePhone(value: string) {
  const normalized = normalizeOfflinePhone(value);
  if (!normalized) return "";
  if (normalized.length <= 4) return `${normalized.slice(0, 1)}***`;
  if (normalized.length <= 7) return `${normalized.slice(0, 2)}**${normalized.slice(-2)}`;
  return `${normalized.slice(0, 2)}**-***-${normalized.slice(-3)}`;
}

export function maskOfflineEmail(value: string) {
  const normalized = normalizeOfflineEmail(value);
  if (!normalized) return "";
  const separator = normalized.indexOf("@");
  if (separator < 1) return `${normalized.slice(0, 1)}***`;
  return `${normalized.slice(0, 1)}***${normalized.slice(separator)}`;
}

function orderMemberId(order: JsonRecord) {
  return text(asRecord(order.member).memberId, order.memberId);
}

function orderRecords(parsedOrders: Map<string, unknown>) {
  return [...parsedOrders.entries()]
    .filter(([backupPath]) => backupPath.startsWith("raw/orders/") && backupPath.endsWith(".json"))
    .map(([, order]) => asRecord(order));
}

function itemSummary(item: unknown) {
  const record = asRecord(item);
  const label = text(record.name, record.productName, record.title, record.productId) || "未命名商品";
  const option = text(record.optionLabel, record.optionName, record.optionId);
  const quantity = finiteNumber(record.quantity);
  return `${label}${option ? `・${option}` : ""}${quantity !== null ? ` × ${quantity}` : ""}`;
}

function orderSummary(order: JsonRecord): OfflineMemberOrderSummary {
  const store = asRecord(order.store);
  const pickup = asRecord(order.studioPickup);
  return {
    orderNumber: text(order.orderNumber, order.id),
    createdAt: text(order.createdAt, order.orderDate),
    status: text(order.status),
    amount: finiteNumber(order.total),
    orderMode: text(order.orderMode, order.shippingMethod),
    store: Object.keys(store).length ? { id: text(store.id, store.storeId), name: text(store.name, store.storeName), address: text(store.address) } : null,
    studioPickup: Object.keys(pickup).length ? { preferredDate: text(pickup.preferredDate), preferredTime: text(pickup.preferredTime) } : null,
    items: Array.isArray(order.items) ? order.items.map(itemSummary) : [],
  };
}

function memberLabel(memberId: string, nodes: Map<string, OrganizationNodeLike>, profiles: Map<string, JsonRecord>, registry: JsonRecord) {
  const profile = profiles.get(memberId) ?? {};
  const canonical = asRecord(registry[memberId]);
  return {
    memberId,
    memberNumber: text(canonical.memberNumber, profile.memberNumber, nodes.get(memberId)?.memberNumber),
    displayName: text(profile.displayName, profile.name),
  };
}

function fulfillmentForOrder(fulfillment: JsonRecord, orderNumber: string): OfflineMemberFulfillmentSummary | null {
  const records = asRecord(fulfillment.records);
  let record = asRecord(records[orderNumber]);
  if (!Object.keys(record).length) {
    record = entries(records).map(([, value]) => value).find((value) => text(value.orderId) === orderNumber) ?? {};
  }
  if (!Object.keys(record).length) return null;
  return {
    orderNumber,
    currentState: text(record.currentState),
    updatedAt: text(record.updatedAt),
    events: (Array.isArray(record.events) ? record.events : []).map((event) => {
      const item = asRecord(event);
      return { state: text(item.state), occurredAt: text(item.occurredAt), source: text(item.source), note: text(item.note) };
    }),
  };
}

function nextCycleFor(subscriptionId: string, commerce: JsonRecord) {
  const terminal = new Set(["completed", "skipped", "cancelled", "uncollected"]);
  const cycles = entries(commerce.cycles).map(([, cycle]) => cycle)
    .filter((cycle) => text(cycle.subscriptionId) === subscriptionId && !terminal.has(text(cycle.status)))
    .sort((a, b) => text(a.plannedDate).localeCompare(text(b.plannedDate)) || text(a.createdAt).localeCompare(text(b.createdAt)));
  const cycle = cycles[0];
  if (!cycle) return null;
  const pricing = asRecord(cycle.pricingSnapshot);
  return {
    cycleId: text(cycle.cycleId),
    kind: text(cycle.kind),
    status: text(cycle.status),
    plannedDate: text(cycle.plannedDate),
    orderCreationDate: text(cycle.orderCreationDate),
    modificationDeadline: text(cycle.modificationDeadline),
    createdOrderId: text(cycle.createdOrderId) || null,
    estimatedAmount: finiteNumber(pricing.finalAmount),
  };
}

export function buildOfflineMemberIndex(input: {
  tree: OrganizationTreeLike;
  identity: JsonRecord;
  commerce: JsonRecord;
  fulfillment: JsonRecord;
  profiles: Map<string, JsonRecord>;
  parsedOrders: Map<string, unknown>;
}): OfflineMemberIndexEntry[] {
  const registry = asRecord(input.identity.members);
  const nodeById = new Map(input.tree.nodes.map((node) => [node.memberId, node]));
  const ids = new Set([...Object.keys(registry), ...input.profiles.keys(), ...input.tree.nodes.map((node) => node.memberId)]);
  const providersByMember = new Map<string, Set<string>>();
  for (const [, identity] of entries(input.identity.identities)) {
    const memberId = text(identity.memberId);
    const provider = text(identity.provider);
    if (!memberId || !provider) continue;
    const providers = providersByMember.get(memberId) ?? new Set<string>();
    providers.add(provider);
    providersByMember.set(memberId, providers);
  }
  const ordersByMember = new Map<string, JsonRecord[]>();
  for (const order of orderRecords(input.parsedOrders)) {
    const memberId = orderMemberId(order);
    if (!memberId || !ids.has(memberId)) continue;
    const records = ordersByMember.get(memberId) ?? [];
    records.push(order);
    ordersByMember.set(memberId, records);
  }

  return [...ids].map((memberId): OfflineMemberIndexEntry => {
    const profile = input.profiles.get(memberId) ?? {};
    const canonical = asRecord(registry[memberId]);
    const node = nodeById.get(memberId);
    const memberNumber = text(canonical.memberNumber, profile.memberNumber, node?.memberNumber);
    const displayName = text(profile.displayName, profile.name);
    const phone = text(profile.phone);
    const email = text(profile.email);
    const loginEmail = text(profile.loginEmail);
    const parent = node?.parentId ? memberLabel(node.parentId, nodeById, input.profiles, registry) : null;
    const children = (node?.childrenIds ?? []).map((childId) => memberLabel(childId, nodeById, input.profiles, registry));
    const subscriptions = entries(input.commerce.subscriptions).map(([, value]) => value)
      .filter((subscription) => text(subscription.memberId) === memberId)
      .sort((a, b) => text(b.createdAt).localeCompare(text(a.createdAt)))
      .map((subscription) => {
        const subscriptionId = text(subscription.subscriptionId);
        const store = asRecord(subscription.storeSelection);
        return {
          subscriptionId,
          status: text(subscription.status),
          intervalDays: finiteNumber(subscription.intervalDays),
          anchorDate: text(subscription.anchorDate),
          shippingMethod: text(subscription.shippingMethod),
          storeSelection: Object.keys(store).length ? { storeId: text(store.storeId, store.id), storeName: text(store.storeName, store.name) } : null,
          nextCycle: nextCycleFor(subscriptionId, input.commerce),
        };
      });
    const creditEntries = entries(input.commerce.creditEntries).map(([, value]) => value).filter((entry) => text(entry.memberId) === memberId);
    const rewards = entries(input.commerce.referralRewards).map(([, value]) => value).filter((reward) => text(reward.beneficiaryMemberId) === memberId);
    const validConsumption = entries(input.commerce.validConsumptionEvents).map(([, value]) => value).filter((event) => text(event.memberId) === memberId);
    const qualificationRounds = entries(input.commerce.qualificationRounds).map(([, value]) => value).filter((round) => text(round.memberId) === memberId);
    const memberOrders = (ordersByMember.get(memberId) ?? []).sort((a, b) => text(b.createdAt).localeCompare(text(a.createdAt)));
    const recentOrders = memberOrders.slice(0, 20).map(orderSummary);
    const fulfillment = recentOrders.map((order) => fulfillmentForOrder(input.fulfillment, order.orderNumber)).filter((value): value is OfflineMemberFulfillmentSummary => value !== null);
    return {
      memberId,
      memberNumber,
      displayName,
      phone,
      email,
      loginEmail,
      maskedPhone: maskOfflinePhone(phone),
      maskedEmail: maskOfflineEmail(email || loginEmail),
      search: {
        memberId: normalizeText(memberId),
        memberNumber: normalizeText(memberNumber),
        displayName: normalizeText(displayName),
        phoneNormalized: normalizeOfflinePhone(phone),
        emailNormalized: normalizeOfflineEmail(email),
        loginEmailNormalized: normalizeOfflineEmail(loginEmail),
      },
      identity: {
        createdAt: text(profile.createdAt, canonical.createdAt),
        updatedAt: text(profile.updatedAt, canonical.updatedAt),
        status: text(canonical.status, profile.status),
        providerTypes: [...(providersByMember.get(memberId) ?? new Set<string>(text(profile.authProvider) ? [text(profile.authProvider)] : []))].sort(),
        customAvatar: Boolean(text(profile.avatarUrl)),
        providerPicture: Boolean(text(profile.pictureUrl)),
      },
      organization: {
        parentId: node?.parentId ?? null,
        parentMemberNumber: parent?.memberNumber ?? "",
        parentDisplayName: parent?.displayName ?? "",
        children,
        directReferralCount: node?.directReferralCount ?? 0,
        teamCount: node?.teamCount ?? 0,
        descendantCount: node?.descendantCount ?? 0,
        depth: node?.depth ?? null,
        relationshipStatus: node?.relationshipStatus ?? "unresolved",
      },
      subscriptions,
      commerce: {
        creditEntriesCount: creditEntries.length,
        recordedRemainingCredit: sumNumbers(creditEntries.filter((entry) => ["available", "reserved"].includes(text(entry.status))), "remainingAmount"),
        creditStatusCounts: statusCounts(creditEntries),
        rewardCount: rewards.length,
        rewardStatusCounts: statusCounts(rewards),
        calculatedRewardAmount: sumNumbers(rewards, "calculatedCreditAmount"),
        projectedRewardAmount: sumNumbers(rewards, "projectedCreditAmount"),
        effectivePV: sumNumbers(rewards, "effectivePV"),
        validConsumptionCount: validConsumption.length,
        validConsumptionAmount: sumNumbers(validConsumption, "validConsumptionAmount"),
        qualificationRoundCount: qualificationRounds.length,
      },
      orders: { totalCount: memberOrders.length, recent: recentOrders },
      fulfillment,
    };
  }).sort((a, b) => a.memberNumber.localeCompare(b.memberNumber) || a.memberId.localeCompare(b.memberId));
}

export function searchOfflineMembers(index: OfflineMemberIndexEntry[], query: string): OfflineMemberSearchResult[] {
  const normalized = normalizeText(query);
  const phone = normalizeOfflinePhone(query);
  const email = normalizeOfflineEmail(query);
  if (!normalized) return [];
  const results: OfflineMemberSearchResult[] = [];
  for (const member of index) {
    const exactFields = [member.search.memberNumber, member.search.memberId, member.search.displayName, member.search.emailNormalized, member.search.loginEmailNormalized];
    const exactPhone = Boolean(phone && member.search.phoneNormalized === phone);
    const exact = exactPhone || exactFields.some((value) => Boolean(value && value === normalized));
    let score = exact ? 100 : 0;
    if (member.search.memberNumber === normalized) score = 130;
    else if (member.search.memberId === normalized) score = 125;
    else if (member.search.phoneNormalized === phone && phone) score = 120;
    else if ([member.search.emailNormalized, member.search.loginEmailNormalized].includes(email) && email) score = 115;
    else if (member.search.displayName === normalized) score = 110;
    if (!score && member.search.displayName.includes(normalized)) score = 80;
    if (!score && member.search.memberNumber.includes(normalized)) score = 75;
    if (!score && member.search.memberId.includes(normalized)) score = 70;
    if (!score && normalized.length >= 3 && [member.search.emailNormalized, member.search.loginEmailNormalized].some((value) => value.includes(email))) score = 65;
    if (!score && phone.length >= 4 && member.search.phoneNormalized.includes(phone)) score = 60;
    if (score) results.push({ member, score, exact });
  }
  return results.sort((a, b) => b.score - a.score || a.member.memberNumber.localeCompare(b.member.memberNumber) || a.member.memberId.localeCompare(b.member.memberId));
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function buildOfflineRuntimeScript(embedded: string) {
  return String.raw`const DATA=${embedded};
const byId=new Map(DATA.nodes.map(function(n){return[n.memberId,n]}));
const members=new Map(DATA.members.map(function(m){return[m.memberId,m]}));
const esc=function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]})};
const show=function(v){return v===null||v===undefined||v===""?"—":String(v)};
const money=function(v){return typeof v==="number"?"NT$"+v.toLocaleString("zh-TW"):"—"};
function branch(id,seen){
  seen=seen||new Set();const n=byId.get(id),m=members.get(id);if(!n||seen.has(id))return"";
  const next=new Set(seen);next.add(id);const kids=n.childrenIds.filter(function(x){return byId.has(x)&&!next.has(x)});
  return '<li data-id="'+esc(id)+'"><article class="node '+(n.depth===0?'root':'')+'" tabindex="0" role="button"><strong>'+esc((m&&m.displayName)||('會員 '+(n.memberNumber||'未編號')))+'</strong><small>'+esc(n.memberNumber||'未編號')+' · '+esc(n.memberId)+'</small><small>直推 '+n.directReferralCount+' 人 · 團隊 '+n.teamCount+' 人</small><em>'+esc(n.relationshipStatus)+'</em>'+(kids.length?'<button class="branch-toggle" type="button">收合分支</button>':'')+'</article>'+(kids.length?'<ul>'+kids.map(function(x){return branch(x,next)}).join('')+'</ul>':'')+'</li>';
}
const forest=document.getElementById('forest');
forest.innerHTML=DATA.roots.length?DATA.roots.map(function(id){return'<ul class="tree">'+branch(id)+'</ul>'}).join(''):'<p class="empty">沒有可顯示的 root；請查看 organization-tree.json 的 validation findings。</p>';
let selectedId=null;
function ancestors(id){const result=[],seen=new Set();let current=id;while(current&&!seen.has(current)){seen.add(current);result.push(current);current=byId.get(current)?.parentId||null}return result}
function focusNode(id){
  ancestors(id).forEach(function(current){const li=document.querySelector('li[data-id="'+CSS.escape(current)+'"]');if(li)li.classList.remove('collapsed')});
  document.querySelectorAll('.node.match,.node.selected').forEach(function(node){node.classList.remove('match','selected')});
  const li=document.querySelector('li[data-id="'+CSS.escape(id)+'"]');if(!li)return;const card=li.querySelector(':scope > .node');card.classList.add('match','selected');selectedId=id;card.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});
}
function copyRow(label,value){return'<dt>'+esc(label)+'</dt><dd class="copy-row"><span>'+esc(show(value))+'</span>'+(value?'<button type="button" data-copy="'+esc(value)+'">複製</button>':'')+'</dd>'}
function countRows(value){const rows=Object.entries(value||{});return rows.length?rows.map(function(row){return esc(row[0])+' '+row[1]}).join('、'):'—'}
function showProfile(id){
  const m=members.get(id);if(!m)return;focusNode(id);
  const parent=m.organization.parentId?(esc(m.organization.parentDisplayName||m.organization.parentMemberNumber||m.organization.parentId)+'｜'+esc(m.organization.parentMemberNumber||m.organization.parentId)):'—';
  const children=m.organization.children.length?'<ul>'+m.organization.children.map(function(child){return'<li><button type="button" data-member="'+esc(child.memberId)+'">'+esc(child.displayName||child.memberNumber||child.memberId)+'｜'+esc(child.memberNumber||child.memberId)+'</button></li>'}).join('')+'</ul>':'<span class="muted">無</span>';
  const subscriptions=m.subscriptions.length?'<div class="cards">'+m.subscriptions.map(function(s){const cycle=s.nextCycle;return'<div class="card"><strong>'+esc(s.subscriptionId)+' · '+esc(s.status)+'</strong><small>週期：'+(s.intervalDays==null?'—':'每 '+s.intervalDays+' 天')+'｜取貨：'+esc(show(s.shippingMethod))+(s.storeSelection?'・'+esc(s.storeSelection.storeName):'')+'</small><small>anchor：'+esc(show(s.anchorDate))+'</small><small>下一期：'+(cycle?esc(cycle.plannedDate+' · '+cycle.status+' · 截止 '+cycle.modificationDeadline+(cycle.estimatedAmount==null?'':' · '+money(cycle.estimatedAmount))):'尚無可用期次')+'</small></div>'}).join('')+'</div>':'<span class="muted">無安全關聯資料</span>';
  const orders=m.orders.recent.length?'<div class="cards">'+m.orders.recent.map(function(o){return'<div class="card"><strong>'+esc(o.orderNumber)+' · '+esc(show(o.status))+'</strong><small>'+esc(show(o.createdAt))+'｜'+money(o.amount)+'｜'+esc(show(o.orderMode))+(o.store?'・'+esc(o.store.name):'')+'</small><small>'+esc(o.items.join('、')||'無商品摘要')+'</small></div>'}).join('')+'</div>':'<span class="muted">無安全關聯訂單</span>';
  const fulfillment=m.fulfillment.length?'<div class="cards">'+m.fulfillment.map(function(f){const last=f.events[f.events.length-1];return'<div class="card"><strong>'+esc(f.orderNumber)+' · '+esc(show(f.currentState))+'</strong><small>更新：'+esc(show(f.updatedAt))+(last?'｜最近事件 '+esc(last.state)+' '+esc(last.occurredAt):'')+'</small></div>'}).join('')+'</div>':'<span class="muted">無安全關聯履約資料</span>';
  const profile=document.getElementById('profile');
  profile.innerHTML='<div class="profile-head"><div><span class="badge">離線備份資料｜含會員個資</span><h2 id="profile-title">'+esc(m.displayName||m.memberNumber||m.memberId)+'</h2><p>'+esc(m.memberNumber||'未編號')+' · '+esc(m.memberId)+'</p></div><button class="profile-close" type="button" aria-label="關閉">×</button></div><section><h3>IDENTITY</h3><dl>'+copyRow('姓名',m.displayName)+copyRow('會員編號',m.memberNumber)+copyRow('Member ID',m.memberId)+copyRow('手機',m.phone)+copyRow('Email',m.email)+copyRow('登入 Email',m.loginEmail)+'<dt>建立日期</dt><dd>'+esc(show(m.identity.createdAt))+'</dd><dt>帳號狀態</dt><dd>'+esc(show(m.identity.status))+'</dd><dt>Identity Provider</dt><dd>'+esc(m.identity.providerTypes.join('、')||'—')+'</dd><dt>自訂頭像</dt><dd>'+(m.identity.customAvatar?'有':'無')+'</dd><dt>Provider 圖片</dt><dd>'+(m.identity.providerPicture?'有':'無')+'</dd></dl></section><section><h3>ORGANIZATION</h3><dl><dt>上層推薦人</dt><dd>'+parent+'</dd><dt>直推／團隊／後代</dt><dd>'+m.organization.directReferralCount+'／'+m.organization.teamCount+'／'+m.organization.descendantCount+'</dd><dt>深度</dt><dd>'+esc(show(m.organization.depth))+'</dd><dt>關係狀態</dt><dd>'+esc(show(m.organization.relationshipStatus))+'</dd><dt>直推名單</dt><dd>'+children+'</dd></dl></section><section><h3>SUBSCRIPTION</h3>'+subscriptions+'</section><section><h3>COMMERCE / RIGHTS</h3><dl><dt>資料中抵用金餘額合計</dt><dd>'+money(m.commerce.recordedRemainingCredit)+'</dd><dt>Credit entries</dt><dd>'+m.commerce.creditEntriesCount+'（'+countRows(m.commerce.creditStatusCounts)+'）</dd><dt>Referral rewards</dt><dd>'+m.commerce.rewardCount+'（'+countRows(m.commerce.rewardStatusCounts)+'）</dd><dt>回饋金額</dt><dd>已計算 '+money(m.commerce.calculatedRewardAmount)+'／Projected '+money(m.commerce.projectedRewardAmount)+'</dd><dt>Effective PV</dt><dd>'+m.commerce.effectivePV+'</dd><dt>有效消費</dt><dd>'+m.commerce.validConsumptionCount+' 筆／'+money(m.commerce.validConsumptionAmount)+'</dd><dt>資格輪次</dt><dd>'+m.commerce.qualificationRoundCount+'</dd></dl></section><section><h3>ORDERS（'+m.orders.totalCount+'）</h3>'+orders+'</section><section><h3>FULFILLMENT</h3>'+fulfillment+'</section><div class="profile-actions"><button type="button" data-back>回到組織圖</button><button type="button" class="profile-close">關閉</button></div>';
  document.getElementById('shade').hidden=false;profile.hidden=false;profile.querySelector('.profile-close').focus();
}
function closeProfile(){document.getElementById('shade').hidden=true;document.getElementById('profile').hidden=true;if(selectedId){const card=document.querySelector('li[data-id="'+CSS.escape(selectedId)+'"] > .node');if(card)card.focus()}}
forest.addEventListener('click',function(e){const toggle=e.target.closest('.branch-toggle');if(!toggle)return;e.preventDefault();e.stopPropagation();const li=toggle.closest('li');li.classList.toggle('collapsed');toggle.textContent=li.classList.contains('collapsed')?'展開分支':'收合分支'});
forest.addEventListener('keydown',function(e){if((e.key==='Enter'||e.key===' ')&&e.target.classList.contains('node')){e.preventDefault();showProfile(e.target.closest('li').dataset.id)}});
let scale=1,ox=0,oy=0;const stage=document.getElementById('stage'),vp=document.getElementById('viewport'),out=document.getElementById('zoom');
function paint(){stage.style.transform='translate('+ox+'px,'+oy+'px) scale('+scale+')';out.textContent=Math.round(scale*100)+'%'}
function setScale(v){scale=Math.max(.25,Math.min(2.5,v));paint()}
document.getElementById('minus').onclick=function(){setScale(scale-.1)};document.getElementById('plus').onclick=function(){setScale(scale+.1)};
function reset(){scale=1;ox=0;oy=0;vp.scrollTo(0,0);paint()}
document.getElementById('reset').onclick=reset;
document.getElementById('expand').onclick=function(){document.querySelectorAll('li.collapsed').forEach(function(x){x.classList.remove('collapsed')});document.querySelectorAll('.branch-toggle').forEach(function(x){x.textContent='收合分支'})};
const DRAG_THRESHOLD=6;let drag=null;
vp.addEventListener('pointerdown',function(e){if(e.target.closest('button,input'))return;const card=e.target.closest('.node'),li=card&&card.closest('li');drag={x:e.clientX,y:e.clientY,ox:ox,oy:oy,nodeId:li?li.dataset.id:null,moved:false};vp.setPointerCapture(e.pointerId);vp.classList.add('dragging')});
vp.addEventListener('pointermove',function(e){if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)<DRAG_THRESHOLD)return;drag.moved=true;ox=drag.ox+dx;oy=drag.oy+dy;paint()});
function stop(){drag=null;vp.classList.remove('dragging')}
function finishPointer(){if(!drag)return;const memberId=!drag.moved?drag.nodeId:null;stop();if(memberId)showProfile(memberId)}
vp.addEventListener('pointerup',finishPointer);vp.addEventListener('pointercancel',stop);
vp.addEventListener('wheel',function(e){if(!e.ctrlKey)return;e.preventDefault();setScale(scale+(e.deltaY<0?.08:-.08))},{passive:false});
function scoreMember(m,q){const textQ=q.trim().toLocaleLowerCase('zh-Hant'),phone=q.trim().replace(/[\s\-()]/g,''),email=q.trim().toLowerCase();const fields=m.search;if(!textQ)return null;let score=0,exact=false;if(fields.memberNumber===textQ){score=130;exact=true}else if(fields.memberId===textQ){score=125;exact=true}else if(phone&&fields.phoneNormalized===phone){score=120;exact=true}else if(email&&(fields.emailNormalized===email||fields.loginEmailNormalized===email)){score=115;exact=true}else if(fields.displayName===textQ){score=110;exact=true}else if(fields.displayName.includes(textQ))score=80;else if(fields.memberNumber.includes(textQ))score=75;else if(fields.memberId.includes(textQ))score=70;else if(textQ.length>=3&&(fields.emailNormalized.includes(email)||fields.loginEmailNormalized.includes(email)))score=65;else if(phone.length>=4&&fields.phoneNormalized.includes(phone))score=60;return score?{m:m,score:score,exact:exact}:null}
const results=document.getElementById('results');
function renderResults(matches){results.hidden=false;if(!matches.length){results.innerHTML='<p class="result-empty">找不到符合的會員</p>';return}results.innerHTML=matches.map(function(r){const m=r.m;return'<button class="result" type="button" data-member="'+esc(m.memberId)+'"><strong>'+esc(m.displayName||'未提供姓名')+'｜'+esc(m.memberNumber||'未編號')+'</strong><small>'+esc(m.maskedPhone||'無手機')+'｜'+esc(m.maskedEmail||'無 Email')+'｜直推 '+m.organization.directReferralCount+'／團隊 '+m.organization.teamCount+'</small></button>'}).join('')}
function find(){const q=document.getElementById('search').value;const matches=DATA.members.map(function(m){return scoreMember(m,q)}).filter(Boolean).sort(function(a,b){return b.score-a.score||a.m.memberNumber.localeCompare(b.m.memberNumber)||a.m.memberId.localeCompare(b.m.memberId)});const exact=matches.filter(function(r){return r.exact});if(exact.length===1){results.hidden=true;showProfile(exact[0].m.memberId);return}renderResults(matches)}
document.getElementById('find').onclick=find;
document.getElementById('search').addEventListener('input',function(e){if(!e.target.value.trim())results.hidden=true;else find()});
document.getElementById('search').addEventListener('keydown',function(e){if(e.key==='Enter')find();if(e.key==='Escape')results.hidden=true});
results.addEventListener('click',function(e){const button=e.target.closest('[data-member]');if(button){results.hidden=true;showProfile(button.dataset.member)}});
document.getElementById('profile').addEventListener('click',function(e){const member=e.target.closest('[data-member]');if(member){showProfile(member.dataset.member);return}const copy=e.target.closest('[data-copy]');if(copy){const value=copy.dataset.copy;const fallback=function(){const area=document.createElement('textarea');area.value=value;document.body.appendChild(area);area.select();document.execCommand('copy');area.remove()};if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(value).catch(fallback);else fallback();copy.textContent='已複製';return}if(e.target.closest('.profile-close'))closeProfile();if(e.target.closest('[data-back]')){closeProfile();if(selectedId)focusNode(selectedId)}});
document.getElementById('shade').onclick=closeProfile;
document.addEventListener('keydown',function(e){if(e.key==='Escape'){results.hidden=true;if(!document.getElementById('profile').hidden)closeProfile()}});
paint();`;
}

export function buildOfflineOrganizationHtml(tree: OrganizationTreeLike, members: OfflineMemberIndexEntry[]) {
  const embedded = JSON.stringify({ roots: tree.roots, nodes: tree.nodes, members }).replaceAll("<", "\\u003c");
  const html = String.raw`<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KD Coffee 會員組織圖備份 ${escapeHtml(tree.createdAt)}</title>
<style>
:root{font-family:"Microsoft JhengHei",Arial,sans-serif;color:#1d1a16;background:#f3efe7}*{box-sizing:border-box}body{margin:0;overflow:hidden}.top{height:132px;padding:15px 22px;background:#f8f4ed;border-bottom:1px solid #d8d0c3;display:grid;gap:9px;position:relative;z-index:5}.title{display:flex;justify-content:space-between;gap:16px;align-items:center}.title h1{font-size:20px;margin:0}.title p{margin:4px 0 0;color:#72695d;font-size:12px}.privacy{color:#7a351f;font-weight:700}.tools{display:flex;gap:8px;flex-wrap:wrap}.search-wrap{position:relative}.tools input{width:min(420px,50vw);padding:9px 12px;border:1px solid #c8bcaa;border-radius:8px;background:white}.tools button,.profile button{border:1px solid #a99880;background:#fffaf2;border-radius:8px;padding:8px 11px;cursor:pointer}.tools output{min-width:56px;text-align:center;padding:8px;color:#665b4d}.results{position:absolute;top:43px;left:0;width:min(560px,calc(100vw - 32px));max-height:340px;overflow:auto;background:#fff;border:1px solid #c8bcaa;border-radius:10px;box-shadow:0 18px 46px #382d2030;padding:7px;z-index:20}.results[hidden]{display:none}.result{display:grid;width:100%;gap:3px;padding:10px;border:0;border-radius:7px;background:#fff;text-align:left;cursor:pointer}.result:hover,.result:focus{background:#f4ede2}.result strong{font-size:13px}.result small{color:#73685d}.result-empty{padding:14px;color:#756b5f}.viewport{height:calc(100vh - 132px);overflow:auto;cursor:grab;touch-action:none}.viewport.dragging{cursor:grabbing}.stage{transform-origin:0 0;min-width:max-content;padding:44px}.forest{display:flex;gap:76px;align-items:flex-start}.tree,.tree ul{display:flex;justify-content:center;gap:26px;position:relative;margin:0;padding:34px 0 0}.tree{padding-top:0}.tree li{list-style:none;text-align:center;position:relative;padding:34px 8px 0}.tree>li{padding-top:0}.tree ul:before{content:"";position:absolute;top:0;left:50%;height:34px;border-left:1px solid #a99f92}.tree li:before,.tree li:after{content:"";position:absolute;top:0;width:50%;height:34px;border-top:1px solid #a99f92}.tree li:before{right:50%}.tree li:after{left:50%;border-left:1px solid #a99f92}.tree li:only-child:before,.tree li:only-child:after{display:none}.tree li:first-child:before,.tree li:last-child:after{border:0}.node{width:220px;padding:15px;border:1px solid #ddd2c4;border-radius:16px;background:#fff;box-shadow:0 10px 28px #382d2014;cursor:pointer}.node.root{background:#241f19;color:#fff}.node strong,.node small,.node em{display:block}.node strong{font-size:14px}.node small{margin-top:6px;color:#766d62}.node.root small{color:#d7cec0}.node em{margin-top:6px;font-size:10px;font-style:normal;opacity:.66}.node .branch-toggle{margin-top:10px;border:0;background:transparent;text-decoration:underline;cursor:pointer;color:inherit}.node.match,.node.selected{outline:3px solid #b98a3c;outline-offset:3px}.collapsed>ul{display:none}.empty{padding:30px;color:#756b5f}.legend{position:fixed;right:14px;bottom:12px;background:#fffdf8e8;border:1px solid #d8d0c3;border-radius:9px;padding:8px 10px;font-size:11px;color:#73695e}.shade{position:fixed;inset:0;background:#211a1485;z-index:30}.shade[hidden],.profile[hidden]{display:none}.profile{position:fixed;z-index:31;right:0;top:0;width:min(560px,100vw);height:100vh;overflow:auto;background:#fffdf9;box-shadow:-20px 0 50px #211a1430;padding:22px}.profile-head{display:flex;justify-content:space-between;gap:18px;align-items:start;position:sticky;top:-22px;background:#fffdf9;padding:22px 0 14px;border-bottom:1px solid #e0d6c9;z-index:2}.profile-head h2{margin:5px 0;font-size:23px}.profile-head p{margin:0;color:#786b5e;font-size:12px}.profile-close{font-size:20px}.profile section{padding:18px 0;border-bottom:1px solid #e8dfd4}.profile h3{margin:0 0 12px;font-size:13px;letter-spacing:.12em;color:#755f49}.profile dl{display:grid;grid-template-columns:135px 1fr;gap:8px 13px;margin:0}.profile dt{color:#7a6e63;font-size:12px}.profile dd{margin:0;overflow-wrap:anywhere}.copy-row{display:flex;gap:7px;align-items:center}.copy-row span{min-width:0;overflow-wrap:anywhere}.copy-row button{padding:3px 7px;font-size:11px}.profile ul{margin:0;padding-left:20px}.profile li{margin:7px 0;line-height:1.55}.profile-actions{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.badge{display:inline-block;padding:3px 7px;border-radius:999px;background:#eee5d9;font-size:11px}.muted{color:#81766b}.cards{display:grid;gap:9px}.card{padding:11px;border:1px solid #e3d9cc;border-radius:9px;background:#fff}.card strong,.card small{display:block}.card small{margin-top:5px;color:#73685d;line-height:1.5}@media(max-width:700px){.top{height:178px;padding:12px}.title{align-items:start}.title>span{font-size:11px}.tools{gap:5px}.tools input{width:calc(100vw - 98px)}.viewport{height:calc(100vh - 178px)}.stage{padding:28px}.legend{display:none}.profile{padding:16px}.profile dl{grid-template-columns:110px 1fr}.profile-head{top:-16px;padding-top:16px}}
</style></head><body><header class="top"><div class="title"><div><h1>KD Coffee 會員組織圖備份</h1><p>快照：${escapeHtml(tree.createdAt)} · 關係來源：Membership Commerce referrals · 完全離線</p><p class="privacy">離線備份資料｜含會員個資</p></div><span>${tree.nodes.length} 位會員 · ${tree.roots.length} 個 root</span></div><div class="tools"><div class="search-wrap"><input id="search" type="search" autocomplete="off" placeholder="搜尋姓名、手機、Email、會員編號或 Member ID"><div class="results" id="results" hidden></div></div><button id="find">搜尋</button><button id="minus">縮小</button><output id="zoom">100%</output><button id="plus">放大</button><button id="reset">回到 root</button><button id="expand">全部展開</button></div></header><main class="viewport" id="viewport"><div class="stage" id="stage"><div class="forest" id="forest"></div></div></main><div class="legend">拖曳／捲動瀏覽 · 點選節點查看詳情 · organization-tree.json 才是復原資料</div><div class="shade" id="shade" hidden></div><aside class="profile" id="profile" role="dialog" aria-modal="true" aria-labelledby="profile-title" hidden></aside>
<script>${buildOfflineRuntimeScript(embedded)}</script></body></html>`;
  return html;
}
