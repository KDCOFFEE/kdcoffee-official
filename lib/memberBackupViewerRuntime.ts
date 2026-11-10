export const organizationScript = String.raw`
"use strict";
const data = JSON.parse(document.getElementById("viewer-data").textContent);
const $ = id => document.getElementById(id);
const byId = new Map(data.members.map(member => [member.memberId, member]));
const roots = new Set(data.roots);
const children = new Map();
const layoutParent = new Map();
const groups = new Map();
const branchPages = new Map();
const expanded = new Set();
const labels = { active:"啟用", suspended:"停用", disabled:"停用", inactive:"未啟用", merged:"已合併", closed:"已關閉" };
const status = m => Object.hasOwn(labels, m.status) ? labels[m.status] : m.status || "未提供狀態";
const name = m => m.displayName || "未提供姓名";
const pageSize = 24, branchSize = 8;
const cardWidth = 264, cardHeight = 168, col = 288, row = 208, pad = 18;
const view = $("graph-view"), canvas = $("canvas"), detail = $("detail");
let currentRoot, selected, page = 0, scale = 1, layoutWidth = 0, currentTab = "graph";

function el(tag, text, css) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (css) element.className = css;
  return element;
}
function button(text, run, css) {
  const b = el("button", text, css);
  b.type = "button";
  b.addEventListener("click", run);
  return b;
}
function addGroup(root) {
  groups.set(root, root);
  const queue = [root];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    const kids = byId.get(id).childrenIds.filter(child => byId.get(child)?.parentId === id && !roots.has(child) && !groups.has(child));
    children.set(id, kids);
    for (const child of kids) {
      groups.set(child, root);
      layoutParent.set(child, id);
      queue.push(child);
    }
  }
}
for (const id of roots) if (byId.has(id)) addGroup(id);
for (const id of byId.keys()) if (!groups.has(id)) addGroup(id);
for (const [id, group] of groups) {
  if (id !== group) continue;
  const m = byId.get(id);
  const label = roots.has(id) ? (m.childrenIds.length ? "組織根節點" : "獨立根節點") : "異常分支";
  const option = el("option", label + "｜" + name(m) + " · " + (m.memberNumber || "未編號"));
  option.value = id;
  $("root-picker").append(option);
}

function openDetail(id) {
  const member = byId.get(id);
  if (!member) return;
  openMemberView(id);
  $("detail-name").textContent = name(member);
  const fields = $("detail-fields");
  fields.replaceChildren();
  for (const [key, value] of [
    ["會員編號", member.memberNumber], ["會員狀態", status(member)], ["Member ID", member.memberId],
    ["手機（遮蔽）", member.maskedPhone], ["Email（遮蔽）", member.maskedEmail],
    ["直推會員", member.directReferralCount + " 人"], ["團隊總人數", member.teamCount + " 人"],
  ]) fields.append(el("dt", key), el("dd", value || "未提供"));
  const relations = $("detail-relations");
  relations.replaceChildren();
  for (const [label, ids] of [["上層推薦人", member.parentIds], ["直接推薦會員", member.childrenIds]]) {
    const list = el("ul", undefined, "relations");
    const summary = el("details");
    summary.open = ids.length <= 8;
    summary.append(el("summary", label + "（" + ids.length + "）"), list);
    for (const relative of ids) {
      const item = el("li");
      const person = byId.get(relative);
      if (person) item.append(button(name(person) + " · " + (person.memberNumber || "未編號"), () => openDetail(relative)));
      else item.textContent = "備份中缺少對應會員：" + relative;
      list.append(item);
    }
    if (!ids.length) list.append(el("li", "無已記錄的關係", "muted"));
    relations.append(summary);
  }
  $("detail-locate").onclick = () => { detail.close(); locate(id); };
  if (!detail.open) detail.showModal();
}

function makeCard(item) {
  const {id, depth, x, y} = item;
  const member = byId.get(id);
  const graphKids = children.get(id) ?? [];
  const card = el("article", undefined, "node" + (roots.has(id) ? " root" : "") + (selected === id ? " hit" : ""));
  card.dataset.node = id;
  card.addEventListener("click", e => { if (!e.target.closest("button")) openDetail(id); });
  card.style.left = x + "px";
  card.style.top = y + "px";
  card.style.setProperty("--indent", Math.min(depth, 5));
  const heading = el("div", undefined, "node-head");
  const profile = button(name(member), () => openDetail(id), "name-button");
  profile.title = name(member);
  heading.append(profile, el("span", id === currentRoot && !roots.has(id) ? "異常分支" : status(member), "badge"));
  const parent = member.parentIds.map(p => byId.get(p)).find(Boolean);
  const relation = roots.has(id) ? (member.parentIds.length ? "推薦關係待核對" : member.childrenIds.length ? "組織根節點" : "獨立根節點") :
    parent ? "推薦人：" + name(parent) + (member.parentIds.length > 1 ? " 等" : "") : "推薦人待核對";
  const parentLine = el("div", relation, "meta muted truncate");
  parentLine.title = relation;
  const actions = el("div", undefined, "node-actions");
  actions.append(button("詳情", () => openDetail(id)));
  if (graphKids.length) {
    const isOpen = expanded.has(id);
    const toggle = button(isOpen ? "收合分支" : "展開分支", () => {
      if (isOpen) expanded.delete(id); else expanded.add(id);
      render(id);
    });
    toggle.dataset.branch = id;
    toggle.setAttribute("aria-expanded", String(isOpen));
    actions.append(toggle);
    if (isOpen && graphKids.length > branchSize) {
      const n = branchPages.get(id) ?? 0;
      const count = Math.ceil(graphKids.length / branchSize);
      const next = button((n + 1) + "/" + count + " 翻頁", () => {
        branchPages.set(id, (n + 1) % count);
        render(id);
      });
      actions.append(next);
    }
  }
  const number = el("div", "編號 " + (member.memberNumber || "未提供"), "meta truncate");
  number.title = member.memberNumber;
  card.append(heading, number, parentLine, el("div", "直推 " + member.directReferralCount + " 人　團隊 " + member.teamCount + " 人", "numbers"), actions);
  return card;
}

function render(refocus) {
  canvas.replaceChildren();
  if (!currentRoot) {
    canvas.append(el("p", "此備份沒有可顯示的會員。", "panel"));
    for (const control of document.querySelectorAll(".tools button")) if (control.closest("#graph-panel")) control.disabled = true;
    $("root-picker").disabled = true;
    return;
  }
  const visible = [];
  const stack = [{id:currentRoot, depth:0, parent:null}];
  let maxDepth = 0;
  while (stack.length) {
    const item = stack.pop();
    item.kids = [];
    item.width = col;
    item.parent?.kids.push(item);
    visible.push(item);
    maxDepth = Math.max(maxDepth, item.depth);
    const offset = (branchPages.get(item.id) ?? 0) * branchSize;
    const kids = expanded.has(item.id) ? (children.get(item.id) ?? []).slice(offset, offset + branchSize) : [];
    for (let i = kids.length - 1; i >= 0; i--) stack.push({id:kids[i], depth:item.depth + 1, parent:item});
  }
  for (let i = visible.length - 1; i >= 0; i--) {
    const item = visible[i];
    if (item.kids.length) item.width = item.kids.reduce((total, kid) => total + kid.width, 0);
  }
  layoutWidth = visible[0].width + pad * 2;
  const totalWidth = Math.max(layoutWidth, view.clientWidth / scale);
  const totalHeight = (maxDepth + 1) * row + pad;
  visible[0].left = (totalWidth - visible[0].width) / 2;
  canvas.style.width = totalWidth + "px";
  canvas.style.height = totalHeight + "px";
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "edges");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", totalWidth);
  svg.setAttribute("height", totalHeight);
  const cards = document.createDocumentFragment();
  let focus;
  for (const item of visible) {
    item.x = item.left + (item.width - cardWidth) / 2;
    item.y = pad + item.depth * row;
    let left = item.left;
    for (const kid of item.kids) { kid.left = left; left += kid.width; }
    if (item.parent) {
      const start = item.parent.x + cardWidth / 2, end = item.x + cardWidth / 2;
      const middle = item.y - (row - cardHeight) / 2;
      const line = document.createElementNS(ns, "path");
      line.setAttribute("d", "M" + start + " " + (item.parent.y + cardHeight) + " V" + middle + " H" + end + " V" + item.y);
      svg.append(line);
    }
    const card = makeCard(item);
    if (item.id === refocus) focus = card.querySelector("[data-branch]");
    cards.append(card);
  }
  canvas.append(svg, cards);
  $("view-status").textContent = "畫面顯示 " + visible.length + " 位會員。展開分支可查看下一層。";
  focus?.focus({preventScroll:true});
}

function zoom(value) {
  scale = Math.min(1.5, Math.max(.78, value));
  canvas.style.zoom = scale;
  $("zoom").textContent = Math.round(scale * 100) + "%";
  render();
}
function center(id, focus = false) {
  const card = [...canvas.querySelectorAll("[data-node]")].find(node => node.dataset.node === id);
  if (!card) return;
  const rect = card.getBoundingClientRect(), area = view.getBoundingClientRect();
  view.scrollLeft += rect.left + rect.width / 2 - area.left - area.width / 2;
  view.scrollTop += rect.top + rect.height / 2 - area.top - Math.min(area.height / 2, 135);
  if (focus) card.querySelector(".name-button")?.focus({preventScroll:true});
}
function selectRoot(id) {
  currentRoot = id;
  selected = undefined;
  expanded.clear();
  branchPages.clear();
  if (id) expanded.add(id);
  $("root-picker").value = id ?? "";
  render();
  center(id);
}
function switchTab(tab) {
  currentTab = tab;
  for (const id of ["graph", "members"]) {
    $(id + "-panel").hidden = id !== tab;
    $(id + "-tab").setAttribute("aria-pressed", String(id === tab));
  }
  if (tab === "graph") render();
  renderSearch();
}
function locate(id) {
  if (!groups.has(id)) return;
  switchTab("graph");
  if (currentRoot !== groups.get(id)) selectRoot(groups.get(id));
  selected = id;
  for (let child = id; layoutParent.has(child);) {
    const parent = layoutParent.get(child);
    expanded.add(parent);
    branchPages.set(parent, Math.floor(children.get(parent).indexOf(child) / branchSize));
    child = parent;
  }
  render();
  center(id, true);
}

const normalize = value => value.normalize("NFKC").toLocaleLowerCase().trim();
const searchIndex = data.members.map(member => ({
  member, searchable:[member.displayName, member.memberNumber, member.memberId].map(normalize),
}));
function renderSearch() {
  const query = normalize($("search").value), filter = $("status-filter").value;
  const filtered = searchIndex.filter(({member, searchable}) => (!filter || status(member) === filter) && searchable.some(text => text.includes(query)));
  const list = $("results");
  const hasFilter = !!(query || filter);
  $("results-panel").hidden = currentTab === "graph" && !hasFilter;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  page = Math.min(page, pages - 1);
  list.replaceChildren();
  for (const {member} of filtered.slice(page * pageSize, (page + 1) * pageSize)) {
    const row = el("div", undefined, "row");
    const label = el("div");
    label.append(el("strong", name(member)), el("div", (member.memberNumber || "未編號") + " · " + status(member), "muted"));
    row.append(label, currentTab === "graph" ? button("定位", () => locate(member.memberId)) : button("查看詳情", () => openDetail(member.memberId)));
    list.append(row);
  }
  $("results-status").textContent = filtered.length ? "共 " + filtered.length + " 位會員" :
    data.members.length ? "找不到符合的會員" : "此備份沒有可顯示的會員";
  $("page-label").textContent = (page + 1) + " / " + pages;
  $("prev").disabled = page === 0;
  $("next").disabled = page + 1 >= pages;
  $("pager").hidden = pages <= 1;
}

for (const value of [...new Set(data.members.map(status))].sort()) {
  const option = el("option", value);
  option.value = value;
  $("status-filter").append(option);
}
for (const control of [$("search"), $("status-filter")]) control.addEventListener("input", () => { page = 0; renderSearch(); });
$("prev").onclick = () => { page--; renderSearch(); };
$("next").onclick = () => { page++; renderSearch(); };
$("graph-tab").onclick = () => switchTab("graph");
$("members-tab").onclick = () => switchTab("members");
$("detail-close").onclick = () => detail.close();
$("root-picker").onchange = e => selectRoot(e.target.value);
$("root").onclick = () => center(currentRoot, true);
$("plus").onclick = () => { zoom(scale + .1); center(selected || currentRoot); };
$("minus").onclick = () => { zoom(scale - .1); center(selected || currentRoot); };
$("reset").onclick = () => { zoom(1); center(selected || currentRoot); };
$("fit").onclick = () => {
  const fitScale = Math.min(1, view.clientWidth / layoutWidth);
  zoom(fitScale);
  center(selected || currentRoot);
  if (fitScale < scale) $("view-status").textContent += " 已套用易讀的最小縮放，可平移查看其餘分支。";
};
view.addEventListener("wheel", e => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  zoom(scale + (e.deltaY < 0 ? .08 : -.08));
  center(selected || currentRoot);
}, {passive:false});
view.addEventListener("keydown", e => {
  if (e.target !== view) return;
  const amount = {ArrowLeft:[-65,0],ArrowRight:[65,0],ArrowUp:[0,-65],ArrowDown:[0,65]}[e.key];
  if (amount) { e.preventDefault(); view.scrollBy(...amount); }
});
let drag;
view.addEventListener("pointerdown", e => {
  if (e.pointerType !== "mouse" || e.button !== 0 || e.target.closest("button")) return;
  drag = {id:e.pointerId,x:e.clientX,y:e.clientY,left:view.scrollLeft,top:view.scrollTop};
});
view.addEventListener("pointermove", e => {
  if (drag?.id !== e.pointerId) return;
  if (!view.hasPointerCapture(e.pointerId)) {
    if (Math.hypot(drag.x - e.clientX, drag.y - e.clientY) < 5) return;
    view.setPointerCapture(e.pointerId);
    view.classList.add("drag");
  }
  view.scrollTo(drag.left + drag.x - e.clientX, drag.top + drag.y - e.clientY);
});
function stopDrag() { drag = undefined; view.classList.remove("drag"); }
for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) view.addEventListener(event, stopDrag);
view.addEventListener("pointerleave", e => { if (!view.hasPointerCapture(e.pointerId)) stopDrag(); });
window.addEventListener("resize", () => { if (currentTab === "graph") render(); });
window.addEventListener("hashchange", () => switchTab(location.hash === "#members" ? "members" : "graph"));
selectRoot($("root-picker").options[0]?.value);
switchTab(location.hash === "#members" ? "members" : "graph");
`;

export const verificationScript = String.raw`
"use strict";
const picker = document.getElementById("backup-folder");
const output = document.getElementById("verify-result");
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,"0")).join("");
const hash = async file => hex(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
const safePath = value => typeof value === "string" && !value.split("/").some(part => !part || part === "." || part === ".." || /[\\:\x00-\x1f]/u.test(part));
picker.addEventListener("change", async () => {
  if (!picker.files.length) return;
  picker.disabled = true;
  output.textContent = "正在重新計算所選資料夾的 SHA-256…";
  try {
    if (!globalThis.crypto?.subtle) throw new Error("這個瀏覽器無法在本機計算 SHA-256");
    const files = new Map();
    for (const file of picker.files) {
      const path = file.webkitRelativePath.split("/").slice(1).join("/");
      if (!safePath(path) || files.has(path)) throw new Error("檔案路徑無效或重複");
      files.set(path, file);
    }
    const manifestFile = files.get("manifest.json"), checksumFile = files.get("checksums.sha256");
    if (!manifestFile || !checksumFile) throw new Error("請選擇同時包含 manifest.json 與 checksums.sha256 的解壓縮資料夾");
    const expected = new Map();
    for (const line of (await checksumFile.text()).trimEnd().split(/\r?\n/)) {
      const entry = /^([a-f0-9]{64})  (.+)$/u.exec(line);
      if (!entry || !safePath(entry[2]) || expected.has(entry[2])) throw new Error("SHA-256 清單格式無效或含重複路徑");
      expected.set(entry[2], entry[1]);
    }
    if (expected.get("manifest.json") !== await hash(manifestFile)) throw new Error("manifest.json 的 SHA-256 不符");
    const manifest = JSON.parse(await manifestFile.text());
    if (manifest.backupId !== output.dataset.backupId) throw new Error("選擇的資料夾屬於另一份備份");
    if (!Array.isArray(manifest.files) || expected.size !== manifest.files.length + 1) throw new Error("檔案數與 manifest 不符");
    const checked = new Set(["manifest.json"]);
    for (const item of manifest.files) {
      if (!safePath(item.path) || checked.has(item.path) || item.sha256 !== expected.get(item.path)) throw new Error("manifest 與 SHA-256 清單不符");
      const file = files.get(item.path);
      if (!file || file.size !== item.bytes || await hash(file) !== item.sha256) throw new Error("備份含缺少或內容變更的檔案");
      checked.add(item.path);
    }
    if (files.size !== checked.size + 1) throw new Error("資料夾含未列入備份清單的檔案");
    output.textContent = "重新驗證通過。已比對 " + checked.size + " 份檔案的 SHA-256（含 manifest.json）。";
  } catch (error) {
    output.textContent = "驗證未通過。請確認檔案清單、所選資料夾與檔案內容。";
    if (error instanceof Error && error.message.startsWith("請選擇")) output.textContent += error.message;
  } finally { picker.value = ""; picker.disabled = false; }
});
`;
