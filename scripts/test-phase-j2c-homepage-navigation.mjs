import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const cms = read("lib/homepageCms.ts");
const manager = read("components/admin/HomepageManager.tsx");
const header = read("components/layout/Header.tsx");
const navigation = read("components/layout/HeaderNavigation.tsx");
const data = read("data/homepageData.ts");
const css = read("app/globals.css");

let pass = 0;
const check = (name, condition) => { if (!condition) { console.error(`FAIL ${name}`); process.exitCode = 1; } else { console.log(`PASS ${name}`); pass += 1; } };

check("legacy five-item fallback", cms.includes('label: "第一次怎麼選"') && cms.includes('label: "本月推薦"') && cms.includes('label: "全部咖啡"') && cms.includes('label: "為什麼是 KD"') && cms.includes('label: "耳掛與送禮"'));
check("navigation resolver", cms.includes("resolveHomepageNavigation"));
check("navigation validation", cms.includes("validateHomepageNavigation(homepage.navigation)"));
check("navigation is optional in homepage data", data.includes("navigation?: HomepageNavigationItem[]"));
check("admin navigation tab", manager.includes('activeTab === "navigation"') && manager.includes(">導覽</button>"));
check("admin label editing", manager.includes("導覽名稱") && manager.includes("maxLength={40}"));
check("admin visibility", manager.includes("item.enabled !== false") && manager.includes("onChange={(checked) => patch(index, { enabled: checked })}"));
check("admin ordering", manager.includes("↑ 上移") && manager.includes("↓ 下移"));
check("admin smart link reuse", manager.includes("homepage-navigation-${item.id}") && manager.includes("<SmartLinkPicker"));
check("header reads homepage navigation", header.includes("getHomepageData().catch(() => null)") && header.includes("resolveHomepageNavigation(homepage?.navigation)"));
check("header receives registry", header.includes("products={products}") && header.includes("pages={pages}"));
check("desktop and mobile share resolved items", navigation.match(/items\.map/g)?.length === 2);
check("header uses CmsLink", navigation.includes("<CmsLink") && navigation.includes("registry={{ products, pages }}"));
check("no static navigation array remains", !navigation.includes("const navigationItems = ["));

if (!process.exitCode) console.log(`PHASE J.2C Homepage navigation assertions: ${pass} PASS`);
check("navigation tab also owns CTA visibility controls", manager.includes('activeTab === "navigation" ? <>') && manager.includes('<HomepageCtaVisibility homepage={h} setPath={setPath}/>'));
check("content tab no longer owns CTA visibility controls", !manager.match(/activeTab === "content"[\s\S]{0,160}<HomepageCtaVisibility/));
check("selected navigation tab has visible state styling", css.includes('.homepage-admin-tabs button[role="tab"][aria-selected="true"]'));
if (!process.exitCode) console.log("PHASE J.2C.1 Owner UI completion assertions: 3 PASS");

check("compact navigation table", manager.includes('homepage-navigation-table') && manager.includes('連結（Smart Link）') && css.includes('.homepage-navigation-table-head'));
check("owner can add navigation", manager.includes('＋ 新增導覽') && manager.includes('stableId("NAV")') && manager.includes('HOMEPAGE_NAVIGATION_LIMIT'));
check("owner can delete navigation safely", manager.includes('至少保留 1 個') && manager.includes('disabled={items.length <= 1}') && manager.includes('confirm(`確定要刪除'));
check("desktop drag ordering", manager.includes('draggable') && manager.includes('onDragStart') && manager.includes('onDrop={() => dropAt(index)}'));
check("mobile order fallback", manager.includes('homepage-navigation-mobile-order') && manager.includes('aria-label="上移"') && manager.includes('aria-label="下移"'));
if (!process.exitCode) console.log("PHASE J.2C.2 Compact Navigation Manager assertions: 5 PASS");
