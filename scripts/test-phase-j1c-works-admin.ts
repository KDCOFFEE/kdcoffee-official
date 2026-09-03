import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { DEFAULT_WEBSITE_VISUAL_STYLE } from "../lib/pageBuilderVisualStyle.ts";
// @ts-expect-error -- Node's TypeScript stripping requires explicit extensions in this test.
import { readWorksPageAdminState, saveWorksPageAdminState, WorksPageVersionConflictError } from "../lib/worksPageAdminStore.ts";

let passed = 0;
function check(name: string, condition: unknown) {
  assert.ok(condition, name);
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

function hash(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

const originalDataDir = process.env.KD_DATA_DIR;
const root = await mkdtemp(path.join(os.tmpdir(), "kd-j1c-works-admin-"));
const storeDir = path.join(root, "store");
await mkdir(storeDir, { recursive: true });
process.env.KD_DATA_DIR = root;

const pagesPath = path.join(storeDir, "pages.json");
const websitePath = path.join(storeDir, "website-data.json");
const homepagePath = path.join(storeDir, "homepage.json");
const assetsPath = path.join(storeDir, "assets.json");
const monthlyPath = path.join(storeDir, "monthly-menus.json");
const publicWorksPath = path.join(process.cwd(), "app", "works", "page.tsx");
const routePath = path.join(process.cwd(), "app", "api", "admin", "works-page", "route.ts");
const managerPath = path.join(process.cwd(), "components", "admin", "WorksPageManager.tsx");

const page = {
  id: "page-abcdef",
  slug: "campaign-safe",
  type: "campaign" as const,
  status: "draft" as const,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  draft: { title: "保留頁面", seoTitle: "", seoDescription: "", sections: [] },
};
const initialStore = {
  version: 12,
  updatedAt: "2026-09-01T00:00:00.000Z",
  visualStyle: DEFAULT_WEBSITE_VISUAL_STYLE,
  pages: [page],
  systemPages: { futurePage: { retained: true } },
  unrelatedRootField: { retained: true },
};
const sentinels = {
  homepage: "{\"sentinel\":\"homepage\"}\n",
  assets: `${JSON.stringify({ version: 1, updatedAt: "2026-09-01T00:00:00.000Z", assets: [] }, null, 2)}\n`,
  monthly: "{\"sentinel\":\"monthly\"}\n",
};

try {
  await writeFile(pagesPath, `${JSON.stringify(initialStore, null, 2)}\n`);
  await writeFile(websitePath, `${JSON.stringify({ menu: { monthLabel: "九月精選", intro: "九月豆單說明", products: [{ slug: "must-not-be-read-as-authority", price: 999 }] } }, null, 2)}\n`);
  await writeFile(homepagePath, sentinels.homepage);
  await writeFile(assetsPath, sentinels.assets);
  await writeFile(monthlyPath, sentinels.monthly);
  const protectedBefore = {
    website: hash(await readFile(websitePath)),
    homepage: hash(await readFile(homepagePath)),
    assets: hash(await readFile(assetsPath)),
    monthly: hash(await readFile(monthlyPath)),
    publicWorks: hash(await readFile(publicWorksPath)),
  };

  const pagesBeforeGet = await readFile(pagesPath, "utf8");
  const first = await readWorksPageAdminState();
  check("GET without Works config returns exact resolved defaults", first.hasSavedConfig === false && first.savedConfig === null && first.resolved.hero.eyebrow === "九月精選" && first.resolved.hero.description === "九月豆單說明");
  check("GET without Works config does not create or write configuration", await readFile(pagesPath, "utf8") === pagesBeforeGet);

  const saved = await saveWorksPageAdminState({
    version: 12,
    works: { schemaVersion: 1, hero: { headlineLines: ["Owner 第一行", "Owner 第二行"] }, catalog: { helperText: "Owner 列表說明" } },
    now: new Date("2026-09-01T01:02:03.000Z"),
  });
  check("valid PUT creates Works config and increments canonical version", saved.version === 13 && saved.hasSavedConfig && saved.resolved.hero.headlineLines[0] === "Owner 第一行");
  const afterSave = JSON.parse(await readFile(pagesPath, "utf8"));
  check("PUT updates only systemPages.works plus required metadata", afterSave.systemPages.works.catalog.helperText === "Owner 列表說明" && afterSave.version === 13 && afterSave.updatedAt === "2026-09-01T01:02:03.000Z");
  check("existing pages survive PUT logically unchanged", JSON.stringify(afterSave.pages) === JSON.stringify(initialStore.pages));
  check("visualStyle survives PUT logically unchanged", JSON.stringify(afterSave.visualStyle) === JSON.stringify(initialStore.visualStyle));
  check("other systemPages survive PUT", JSON.stringify(afterSave.systemPages.futurePage) === JSON.stringify(initialStore.systemPages.futurePage));
  check("unrelated PageStore root fields survive PUT", JSON.stringify(afterSave.unrelatedRootField) === JSON.stringify(initialStore.unrelatedRootField));

  const reread = await readWorksPageAdminState();
  check("GET with saved config returns raw saved and resolved state", reread.hasSavedConfig && reread.savedConfig?.hero?.headlineLines?.[1] === "Owner 第二行" && reread.resolved.catalog.helperText === "Owner 列表說明");

  let invalidRejected = false;
  try {
    await saveWorksPageAdminState({ version: 13, works: { schemaVersion: 1, colors: { pageBackground: "javascript:alert(1)" } } as never });
  } catch { invalidRejected = true; }
  check("invalid and unsafe Works configuration is rejected", invalidRejected);

  let conflict: unknown;
  try {
    await saveWorksPageAdminState({ version: 12, works: { schemaVersion: 1, hero: { headlineLines: ["舊資料", "不可覆蓋"] } } });
  } catch (error) { conflict = error; }
  check("stale version raises the canonical conflict", conflict instanceof WorksPageVersionConflictError);
  const afterConflict = JSON.parse(await readFile(pagesPath, "utf8"));
  check("conflict does not overwrite newer Works data", afterConflict.version === 13 && afterConflict.systemPages.works.hero.headlineLines[0] === "Owner 第一行");

  const routeSource = await readFile(routePath, "utf8");
  check("unauthenticated GET and PUT use existing Admin 401 guard", (routeSource.match(/isAdminAuthenticated\(\)/gu) || []).length === 2 && (routeSource.match(/status: 401/gu) || []).length === 2);
  check("route reports stale writes as HTTP 409", routeSource.includes("status: conflict ? 409 : 400"));
  const storeSource = await readFile(path.join(process.cwd(), "lib", "worksPageAdminStore.ts"), "utf8");
  check("save uses canonical lock and atomic write flow", storeSource.includes("withFileLock") && storeSource.includes("atomicWriteJson") && storeSource.includes("readPageStore()"));

  const managerSource = await readFile(managerPath, "utf8");
  check("editor shell includes dirty state, leave warning and public preview", managerSource.includes("beforeunload") && managerSource.includes("有尚未儲存的變更") && managerSource.includes('href="/works"'));
  check("editor shell retains the three J.1C foundation controls", managerSource.includes("主標題第一行") && managerSource.includes("主標題第二行") && managerSource.includes("列表說明文字"));

  const protectedAfter = {
    website: hash(await readFile(websitePath)),
    homepage: hash(await readFile(homepagePath)),
    assets: hash(await readFile(assetsPath)),
    monthly: hash(await readFile(monthlyPath)),
    publicWorks: hash(await readFile(publicWorksPath)),
  };
  check("website-data is read-only", protectedAfter.website === protectedBefore.website);
  check("homepage data is untouched", protectedAfter.homepage === protectedBefore.homepage);
  check("assets data is untouched", protectedAfter.assets === protectedBefore.assets);
  check("monthly-menu data is untouched", protectedAfter.monthly === protectedBefore.monthly);
  check("public Works frontend source remains byte-identical", protectedAfter.publicWorks === protectedBefore.publicWorks);

  console.log(`Phase J.1C Works Admin shell: ${passed} PASS`);
} finally {
  if (originalDataDir === undefined) delete process.env.KD_DATA_DIR;
  else process.env.KD_DATA_DIR = originalDataDir;
  await rm(root, { recursive: true, force: true });
}
