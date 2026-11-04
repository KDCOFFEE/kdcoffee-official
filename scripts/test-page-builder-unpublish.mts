import "./return-workflow-test-bootstrap.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import * as nodeModule from "node:module";
import os from "node:os";
import path from "node:path";
import type { PageStore } from "../lib/pageBuilder";

// Run the real public route's notFound() while the test loader handles TSX.
type Resolve = (specifier: string, context: { parentURL?: string }) => { url: string };
const { registerHooks } = nodeModule as typeof nodeModule & {
  registerHooks(hooks: { resolve(specifier: string, context: { parentURL?: string }, nextResolve: Resolve): { url: string } }): unknown;
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/navigation" && context.parentURL?.endsWith("/app/pages/%5Bslug%5D/page.tsx")) {
      return nextResolve("next/navigation.js", context);
    }
    return nextResolve(specifier, context);
  },
});

const root = await fs.mkdtemp(path.join(os.tmpdir(), "kd-unpublish-"));
process.env.KD_DATA_DIR = root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
delete process.env.STORE_SEO_PUBLIC_ENABLED;
process.env.ADMIN_SESSION_SECRET = "isolated-unpublish-test-secret";

const session = globalThis as typeof globalThis & { __returnCookies?: Record<string, string> };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const now = new Date("2026-08-01T00:00:00Z");
const { createPage, createSection } = await import("../lib/pageBuilder");
const { localImageMedia } = await import("../lib/media");
const { resolveWebsiteVisualStyle } = await import("../lib/pageBuilderVisualStyle");
const paths = await import("../lib/storagePaths");
const { getGiftCmsFile } = await import("../lib/giftCmsStore");
const { adminCookieName, createAdminSessionValue } = await import("../lib/adminAuth");
const { PUT } = await import("../app/api/admin/pages/[id]/route");
const { default: publicPage, generateMetadata } = await import("../app/pages/[slug]/page");
const { default: sitemap } = await import("../app/sitemap");
const pagesFile = paths.getPagesDataFile();
const otherFiles = [
  [paths.getHomepageDataFile(), { seo: { title: "Fixture homepage" } }],
  [paths.getWebsiteDataFile(), { menu: { products: [] } }],
  [path.join(root, "store-domain/catalog.json"), { products: [], settings: { marker: "Fixture store" } }],
  [getGiftCmsFile(), { landing: { title: "Fixture gifts" } }],
] as const;
const A = createPage("Saved draft A", [], now);
A.draft.sections.push({
  ...createSection("hero"),
  id: "fixture-hero",
  media: [{
    id: "fixture-hero-image",
    enabled: true,
    media: localImageMedia("/uploads/assets/page-builder/fixture.webp"),
    alt: "Fixture image reference",
  }],
});
A.draft.seoTitle = "Saved SEO";
A.status = "published";
A.publishedAt = now.toISOString();
A.publishedSnapshot = { ...structuredClone(A.draft), title: "Published snapshot A", seoTitle: "Published SEO" };
const B = createPage("Draft B", [A], now);
const initial: PageStore = {
  version: 7,
  updatedAt: now.toISOString(),
  pages: [A, B],
  systemPages: { homepage: { seo: { socialImage: { path: "/uploads/assets/page-builder/fixture.webp", alt: "Fixture" } } } },
  visualStyle: resolveWebsiteVisualStyle(),
};
const props = { params: Promise.resolve({ slug: A.slug }) };
const read = async (): Promise<PageStore> => JSON.parse(await fs.readFile(pagesFile, "utf8"));
const onSitemap = async () => (await sitemap()).some(entry => new URL(entry.url).pathname === "/pages/" + A.slug);
const put = (body: object, id = A.id) => PUT(new Request("http://localhost/api/admin/pages/" + id, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
}), { params: Promise.resolve({ id }) });

try {
  for (const [file, value] of [[pagesFile, initial], ...otherFiles] as const) {
    const relative = path.relative(root, file);
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(value));
  }
  const untouched = await Promise.all(otherFiles.map(([file]) => fs.readFile(file)));
  const original = await fs.readFile(pagesFile);

  assert.equal((await put({ version: 7, operation: "unpublish" })).status, 401);
  session.__returnCookies = { [adminCookieName]: createAdminSessionValue({ role: "owner" }) };
  assert.equal((await put({ version: 6, operation: "unpublish" })).status, 409);
  assert.deepEqual(await fs.readFile(pagesFile), original);
  assert.ok(await publicPage(props));
  assert.deepEqual((await generateMetadata(props)).title, { absolute: "Published SEO" });
  assert.ok(await onSitemap());
  console.log("PASS: admin session, stale version, published route and sitemap");

  const next = await put({
    version: 7,
    operation: "unpublish",
    draft: { ...A.draft, title: "Unsaved browser edit" },
    visualStyle: { invalid: true },
  });
  assert.equal(next.status, 200, await next.clone().text());
  const after = await read();
  assert.equal(after.version, 8);
  assert.notEqual(after.updatedAt, initial.updatedAt);
  assert.equal(after.pages[0].updatedAt, after.updatedAt);
  assert.deepEqual(after, {
    ...initial,
    version: 8,
    updatedAt: after.updatedAt,
    pages: [{ ...A, status: "unpublished", updatedAt: after.updatedAt }, B],
  });
  for (const key of ["draft", "publishedSnapshot"] as const) {
    const before = hash(A[key]);
    const result = hash(after.pages[0][key]);
    assert.equal(result, before);
    console.log(`PASS: ${key} SHA-256 before=${before} after=${result}`);
  }
  await assert.rejects(() => publicPage(props), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  assert.deepEqual((await generateMetadata(props)).robots, { index: false, follow: false });
  assert.equal(await onSitemap(), false);
  console.log("PASS: only state and bookkeeping changed, public route is missing and sitemap excludes it");

  assert.equal((await put({ version: 7, operation: "unpublish" })).status, 409);
  const repeat = await put({ version: 8, operation: "unpublish", draft: { invalid: true } });
  assert.equal(repeat.status, 200, await repeat.clone().text());
  const repeated = await read();
  assert.deepEqual(repeated, {
    ...after,
    version: 9,
    updatedAt: repeated.updatedAt,
    pages: [{ ...after.pages[0], updatedAt: repeated.updatedAt }, B],
  });
  console.log("PASS: repeated unpublish ignores even invalid draft, stale retry still conflicts");

  const newDraft = { ...B.draft, title: "Explicit saved edit B" };
  assert.equal((await put({ version: 9, operation: "save", draft: newDraft }, B.id)).status, 200);
  const beforePublish = await read();
  assert.deepEqual(beforePublish.pages[0], repeated.pages[0]);
  assert.deepEqual(beforePublish.pages[1].draft, newDraft);
  assert.equal(beforePublish.pages[1].publishedSnapshot, undefined);
  const republish = await put({ version: 10, operation: "publish", draft: A.draft, visualStyle: initial.visualStyle });
  assert.equal(republish.status, 200, await republish.clone().text());
  const restored = await read();
  assert.equal(restored.pages[0].status, "published");
  assert.equal(restored.pages[0].slug, A.slug);
  assert.deepEqual(restored.pages[0].publishedSnapshot, A.draft);
  assert.deepEqual(restored.pages[1], beforePublish.pages[1]);
  assert.deepEqual(restored.systemPages, initial.systemPages);
  assert.deepEqual(restored.visualStyle, initial.visualStyle);
  assert.ok(await publicPage(props));
  assert.ok(await onSitemap());
  assert.deepEqual(await Promise.all(otherFiles.map(([file]) => fs.readFile(file))), untouched);
  console.log("PASS: save, republish, public route, sitemap, and homepage/works/store/gifts data isolation");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
