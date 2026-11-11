import { createHash } from "node:crypto";

import type { MemberBackupManifest, OrganizationTreeSnapshot } from "./memberBackup";
import { maskOfflineEmail, maskOfflinePhone } from "./memberBackupOffline";
import { organizationScript, verificationScript } from "./memberBackupViewerRuntime";
import { orderViewerScript } from "./memberBackupViewerOrderRuntime";
import type { BackupOrderViewerData } from "./memberBackupViewerOrders";
import { viewerStyle } from "./memberBackupViewerStyle";

type MemberLabel = {
  memberId: string;
  displayName: string;
  status: string;
  phone: string;
  email: string;
};

const missing = "此備份未包含此資料";

function escapeHtml(value: string | number) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function taipei(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(new Date(value)) + "（台北時間）";
}

function page(title: string, description: string, nav: string, body: string, script: string, payload?: unknown) {
  const digest = createHash("sha256").update(script).digest("base64");
  const embedded = payload === undefined ? "" : `<script id="viewer-data" type="application/json">${JSON.stringify(payload).replaceAll("<", "\\u003c")}</script>`;
  return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${digest}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${title}</title><style>${viewerStyle}</style></head>
<body><header><div class="wrap mast"><p class="eyebrow">KD COFFEE / OFFLINE BACKUP</p><h1>${title}</h1><p class="lede">${description}</p><nav aria-label="備份導覽">${nav}</nav></div></header>
<main class="wrap">${body}<footer class="foot">離線備份資料｜含會員個資。請妥善保管 ZIP 與解壓縮檔案。</footer></main>
${embedded}<script>${script}</script></body></html>`;
}

const findings = {
  duplicate_member_id: "重複會員 ID", missing_parent: "缺少推薦上層", missing_child: "缺少推薦下層",
  orphan: "孤立會員", self_referral: "自我推薦", cycle: "循環推薦",
  multiple_active_parent: "有多個推薦上層", root_correctness: "無法從根節點抵達",
} as const;

export function buildBackupOrganizationViewer(tree: OrganizationTreeSnapshot, labels: MemberLabel[], orderData?: BackupOrderViewerData) {
  const byId = new Map(labels.map((member) => [member.memberId, member]));
  const parentIds = new Map<string, Set<string>>();
  for (const relation of tree.relationships) {
    if (relation.status === "inactive" || !relation.referrerMemberId || !relation.referredMemberId) continue;
    const parents = parentIds.get(relation.referredMemberId) ?? new Set<string>();
    parents.add(relation.referrerMemberId);
    parentIds.set(relation.referredMemberId, parents);
  }
  const members = tree.nodes.map((node) => {
    const member = byId.get(node.memberId);
    return {
      memberId: node.memberId,
      memberNumber: node.memberNumber,
      displayName: member?.displayName ?? "",
      status: member?.status ?? "",
      maskedPhone: maskOfflinePhone(member?.phone ?? ""),
      maskedEmail: maskOfflineEmail(member?.email ?? ""),
      parentId: node.parentId,
      parentIds: [...(parentIds.get(node.memberId) ?? [])],
      childrenIds: node.childrenIds,
      directReferralCount: node.directReferralCount,
      teamCount: node.teamCount,
    };
  });
  const issues = Object.entries(findings).flatMap(([key, label]) => {
    const count = tree.validation.findingCounts[key as keyof typeof findings];
    return count ? [`${label} ${count} 筆`] : [];
  });
  const warning = issues.length
    ? `<p class="notice" role="status">${issues.join("、")}。異常關係以詳情與原始關係清單為準，組織圖只呈現可安全排列的連線。</p>`
    : "";
  return page("KD Coffee｜會員組織圖", `${taipei(tree.createdAt)} · ${tree.nodes.length} 個組織節點 · ${tree.roots.length} 個根節點`,
    '<a href="index.html">備份總覽</a><a href="organization.html" aria-current="page">會員組織圖</a><a href="organization.html#members">會員清單</a><a href="index.html#files">資料檔案清單</a>',
    `${warning}<section class="panel" aria-label="會員搜尋">
      <div class="tools"><button id="graph-tab" type="button" aria-pressed="true" aria-controls="graph-panel">組織關係圖</button><button id="members-tab" type="button" aria-pressed="false" aria-controls="members-panel">會員清單</button></div>
      <div class="searchbar"><label>搜尋會員<input id="search" type="search" autocomplete="off" placeholder="輸入姓名、會員編號或 Member ID"></label><label>會員狀態 <select id="status-filter"><option value="">全部狀態</option></select></label></div>
      <div id="results-panel" hidden><p id="results-status" class="note" aria-live="polite"></p><div id="results" class="results"></div><div id="pager" class="pager"><button type="button" id="prev">上一頁</button><output id="page-label"></output><button type="button" id="next">下一頁</button></div></div>
    </section>
    <section id="graph-panel" class="panel" aria-labelledby="graph-tab"><h2>推薦關係</h2>
      <div class="tools"><label>查看分支 <select id="root-picker"></select></label><button type="button" id="root">回到根節點</button>
        <div class="tools desktop-only"><button type="button" id="minus" aria-label="縮小">−</button><output id="zoom">100%</output><button type="button" id="plus" aria-label="放大">＋</button><button type="button" id="reset">重設縮放</button><button type="button" id="fit">適應畫面</button></div></div>
      <p class="note desktop-only">拖曳或使用方向鍵平移，Ctrl＋滾輪縮放。大分支可逐頁查看。</p>
      <p class="note mobile-only">依推薦層級排列。點選「展開分支」查看下一層。</p>
      <div id="graph-view" class="graph-view" tabindex="0" aria-label="組織圖瀏覽區"><div id="canvas" class="canvas"></div></div><p id="view-status" class="foot" aria-live="polite"></p>
    </section>
    <section id="members-panel" aria-labelledby="members-tab" hidden><p class="note">主清單僅顯示辨識會員所需的資料。詳情中的手機與 Email 也會遮蔽。</p></section>
    <dialog id="detail" aria-labelledby="detail-name"><div class="tools"><h2 id="detail-name"></h2><button type="button" id="detail-close">關閉</button></div>
      <p class="note">離線備份資料｜含會員個資</p>
      <div class="tools detail-tabs" role="group" aria-label="會員詳情頁籤">
        <button type="button" id="member-tab-info" aria-pressed="true" aria-controls="member-info-panel">會員資料</button>
        <button type="button" id="member-tab-self" aria-pressed="false" aria-controls="member-order-panel">本人訂單</button>
        <button type="button" id="member-tab-direct" aria-pressed="false" aria-controls="member-order-panel">直推下線訂單</button>
        <button type="button" id="member-tab-team" aria-pressed="false" aria-controls="member-order-panel">團隊訂單</button>
        <button type="button" id="member-tab-rewards" aria-pressed="false" aria-controls="member-reward-panel">推薦獎勵</button>
      </div>
      <section id="member-info-panel"><dl id="detail-fields"></dl><button type="button" class="primary" id="detail-locate">在組織圖定位</button><div id="detail-relations" class="compact"></div></section>
      <section id="member-order-panel" aria-label="訂單統計與清單" hidden>
        <p class="note">依備份當時的組織關係統計，並非下單當時的推薦歸屬。團隊不含本人，統計僅涵蓋此備份收錄的訂單。</p>
        <div id="order-summary"></div>
        <p id="order-revenue-note" class="note">全部訂單金額包含取消等狀態的原始總額。已完成訂單金額依完成狀態及退貨證據核對。兩項均為訂單快照金額，與實收營收、點數、PV 或獎勵分開。扣除退款後淨額：無法可靠計算。</p>
        <div id="order-controls" class="searchbar order-controls">
          <label>搜尋訂單編號<input id="order-search" type="search" autocomplete="off"></label>
          <label>訂單狀態 <select id="order-status"></select></label>
          <label>依日期排序 <select id="order-sort"><option value="desc">最新優先</option><option value="asc">最早優先</option></select></label>
        </div>
        <p id="order-results-count" class="note" aria-live="polite"></p><div id="order-results"></div>
        <div id="order-page" class="pager" hidden><button type="button" id="order-prev">上一頁</button><output id="order-page-label"></output><button type="button" id="order-next">下一頁</button></div>
        <details id="order-unlinked" class="compact" hidden><summary id="order-unlinked-label"></summary><p id="order-duplicates" class="note"></p><ul id="order-unlinked-list" class="files"></ul><button type="button" id="order-unlinked-next" hidden>下一頁未對應訂單</button></details>
      </section>
      <section id="member-order-detail" aria-labelledby="order-detail-title" hidden>
        <button type="button" id="order-detail-back">返回訂單清單</button><h3 id="order-detail-title" class="compact" tabindex="-1"></h3>
        <dl id="order-detail-fields"></dl><h3>商品與數量</h3><ul class="files" id="order-detail-items"></ul>
        <div id="order-detail-returns-section" hidden><h3>可確認退貨與退款紀錄</h3><ul class="files" id="order-detail-returns"></ul></div>
      </section>
      <section id="member-reward-panel" aria-label="推薦獎勵" hidden>
        <p class="note">依已記錄的來源訂單、下單會員和受益會員核對。下線訂單與獎勵資格分開，金額及可領抵用金不由訂單推算。</p>
        <p id="member-reward-status" class="notice" role="status"></p><div id="member-reward-list"></div>
      </section>
    </dialog>`,
    organizationScript + orderViewerScript,
    { members, roots: tree.roots, orderData },
  );
}

const categories = [
  { title: "會員身分資料", ids: ["members", "member_identity"], description: "會員基本資料、識別碼與身分對照。", caution: "會員 JSON 與身分登錄應使用同一份備份。", sensitive: true },
  { title: "會員商務資料", ids: ["membership_commerce"], description: "會員商務狀態、訂閱、推薦關係及獎勵紀錄。", caution: "還原前確認與同時間的訂單及會員身分相容。", sensitive: true },
  { title: "推薦制度設定", ids: ["membership_business_rules"], description: "備份當時適用的會員商務與推薦規則。", caution: "核對規則版本，避免覆蓋後續正式調整。", sensitive: true },
  { title: "訂單資料", ids: ["orders"], description: "備份所涵蓋的原始訂單檔案。", caution: "核對訂單與履約狀態，避免重複處理。", sensitive: true },
  { title: "履約資料", ids: ["fulfillment_state", "fulfillment_settings"], description: "履約狀態、物流設定與排程同步紀錄。", caution: "與訂單一併核對，先在隔離環境驗證。", sensitive: true },
  { title: "網站資料", ids: ["website_data"], description: "此備份涵蓋的咖啡作品與網站營運 JSON。", caution: "確認欄位及版本相容，依核准範圍還原。", sensitive: true },
  { title: "Store 商品 catalog", ids: ["store_catalog"], description: "Store 商品、SKU、價格及庫存的原始 catalog JSON。H1／H2 舊版備份不包含此資料集。", caution: "還原前核對 catalog 的 SKU、價格、庫存與同時間訂單；確認欄位及版本相容後依核准範圍還原。", sensitive: true },
  { title: "媒體附件", ids: ["member_avatars", "order_notifications"], description: "本機備份範圍內的會員頭像與訂單通知附件。", caution: "保留原路徑，核對資料中的媒體引用。", sensitive: true },
] as const;

function fileList(files: string[]) {
  return files.length ? `<ul class="files">${files.map((path) => `<li><code>${escapeHtml(path)}</code></li>`).join("")}</ul>` : "";
}

export function buildBackupIndexViewer(manifest: MemberBackupManifest) {
  const dataset = new Map<string, MemberBackupManifest["datasets"][number]>(manifest.datasets.map((item) => [item.id, item]));
  const included = (id: string) => dataset.get(id)?.present === true;
  const files = manifest.files.map((file) => file.path);
  const raw = files.filter((path) => path.startsWith("raw/"));
  const metric = (label: string, value: number | string) => `<div class="metric"><span>${label}</span><strong${typeof value === "string" ? ' class="long"' : ""}>${escapeHtml(value)}</strong></div>`;
  const metrics = [
    metric("會員總數", included("members") && included("member_identity") ? manifest.counts.members : missing),
    metric("組織根節點", included("member_identity") && included("membership_commerce") ? manifest.counts.roots : missing),
    metric("已記錄推薦關係", included("membership_commerce") ? manifest.counts.totalReferrals : missing),
    metric("訂單 JSON", included("orders") ? manifest.counts.orders : missing),
    metric("營運 JSON", manifest.datasets.some((item) => item.present && !item.backupPath.startsWith("raw/uploads/")) ? raw.filter((p) => !p.startsWith("raw/uploads/") && p.endsWith(".json")).length : missing),
    metric("媒體附件", included("member_avatars") || included("order_notifications") ? raw.filter((p) => p.startsWith("raw/uploads/")).length : missing),
  ].join("");
  const date = taipei(manifest.createdAt);
  const inventory = categories.map(({title, ids, description, caution, sensitive}) => {
    const datasets = ids.flatMap((id) => {
      const entry = dataset.get(id);
      return entry ? [entry] : [];
    });
    const paths = raw.filter((file) => datasets.some((entry) => entry.present && (file === entry.backupPath || file.startsWith(entry.backupPath + "/"))));
    const absent = ids.filter((id) => !included(id));
    return `<details><summary>${title} · ${datasets.some((entry) => entry.present) ? paths.length + " 個檔案" : missing}</summary>
      <p class="compact">${description} ${sensitive ? "可能包含敏感資料。" : ""}</p>
      <p class="note">${date} · ${caution}</p>
      ${absent.length && absent.length < ids.length ? "<p>部分資料集未包含於此備份。</p>" : ""}
      ${paths.length ? fileList(paths) : datasets.some((entry) => entry.present) ? "<p>此資料集已驗證為空。</p>" : ""}
    </details>`;
  }).join("");
  const missingDatasets = categories.flatMap(({title, ids}) => ids.some((id) => !included(id)) ? [title] : []);
  return page("KD Coffee｜備份資料檢視中心", "從同一份離線快照查看會員、推薦關係與備份檔案。",
    '<a href="#overview" aria-current="page">備份總覽</a><a href="organization.html">會員組織圖</a><a href="organization.html#members">會員清單</a><a href="#orders">訂單備份資訊</a><a href="#files">資料檔案清單</a><a href="#verify">完整性與還原</a>',
    `<section id="overview"><h2>備份總覽</h2><div class="metrics">${metrics}</div>
    ${missingDatasets.length ? `<p class="notice">${missingDatasets.join("、")}包含未備份的資料集。</p>` : ""}
    ${manifest.validation.organizationFindingCount ? `<p class="notice">組織資料有 ${manifest.validation.organizationFindingCount} 筆待核對事項。請開啟會員組織圖查看分類。</p>` : ""}
    <div class="panel"><h2>備份資訊</h2><dl>
      <dt>備份時間</dt><dd>${date}</dd><dt>備份版本</dt><dd>${escapeHtml(manifest.backupVersion)}</dd>
      <dt>來源環境</dt><dd>${manifest.environment === "test" ? "測試（合成資料）" : "正式環境"}</dd>
      <dt>備份 ID</dt><dd><code>${escapeHtml(manifest.backupId)}</code></dd>
      <dt>Manifest 宣告</dt><dd>${manifest.status === "verified" ? "備份已驗證" : escapeHtml(manifest.status)}</dd>
      <dt>產生時完整性</dt><dd>${manifest.validation.checksumsVerified ? "Manifest 記錄檔案雜湊通過" : "Manifest 未記錄通過"}</dd>
      ${manifest.gitCommit ? `<dt>程式版本</dt><dd><code>${escapeHtml(manifest.gitCommit)}</code>${manifest.appVersion ? " · " + escapeHtml(manifest.appVersion) : ""}</dd>` : ""}
    </dl></div></section>
    <section id="orders" class="panel"><h2>訂單備份資訊</h2><p>${included("orders") ? `包含 ${manifest.counts.orders} 份訂單 JSON。檔案存於 <code>raw/orders/</code>。` : missing}</p></section>
    <section id="files" class="panel"><h2>資料檔案清單</h2><p class="section-intro">展開分類查看 ZIP 內的相對路徑。</p>${inventory}
      <details><summary>備份驗證與閱讀資料 · ${files.length - raw.length + 3} 個檔案</summary><p class="compact">驗證清單、組織資料與離線閱讀入口。CSV 可能含會員個資。還原時按正式程序使用原始資料。</p><p class="note">${date}</p>
      ${fileList([...files.filter((file) => !file.startsWith("raw/")), "index.html", "manifest.json", "checksums.sha256"])}</details>
    </section>
    <section id="verify" class="panel"><h2>完整性與還原</h2>
      <p class="section-intro">選擇整份 ZIP 解壓後的資料夾，在瀏覽器內重算 SHA-256。檔案只在本機讀取。</p>
      <label for="backup-folder">選擇備份資料夾</label><br><input type="file" id="backup-folder" webkitdirectory multiple>
      <p id="verify-result" class="notice compact" role="status" data-backup-id="${escapeHtml(manifest.backupId)}">本次開啟尚未重新驗證。</p>
      <p>SHA-256 比對用來檢查清單與檔案是否一致。正式還原前，請確認來源可信，在隔離環境驗證資料與版本，並依核准範圍還原。</p>
      <p class="compact"><a href="manifest.json">Manifest</a> · <a href="checksums.sha256">SHA-256 清單</a> · <a href="organization-tree.json">原始組織關係</a> · <a href="readable/members.csv">會員 CSV</a> · <a href="readable/organization.csv">組織 CSV</a></p>
    </section>`, verificationScript);
}
