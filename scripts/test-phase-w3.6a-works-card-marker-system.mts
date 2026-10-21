import assert from "node:assert/strict";
/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Reuse the established guarded TEMP harness rather than create a second writer,
// loader or upload mock. The legacy 216-case branch remains independently runnable.
const self = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(self)) {
  const child = spawnSync(process.execPath, ["--experimental-strip-types",
    fileURLToPath(new URL("./test-phase-w3.5b-sold-out-presentation.mts", import.meta.url)), "--card-marker-suite"],
    { cwd: fileURLToPath(new URL("../", import.meta.url)), env: process.env, stdio: "inherit", timeout: 120000 });
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
}
export async function runWorksCardMarkerSuite(ctx: any) {
  const { check, cms, service, load, pages, website, disk, hash, cards, nodes, markup, button,
    mountManager, loaded, source, soldSlug, availableSlug, project, root, guard, storage, sharp, getUploader } = ctx;
  const priority = load("lib/worksCardMarker.ts"), engine = load("lib/worksCardMarkerPresentation.ts");
  const types = ["NEW", "RECOMMENDED", "CAMPAIGN", "LIMITED", "FEATURED", "CUSTOM"];
  const tags: Record<string, string> = { NEW: "新品上市", RECOMMENDED: "本月推薦", CAMPAIGN: "活動", LIMITED: "限量", FEATURED: "本月精選", CUSTOM: "夏季限定" };
  const product = (tag?: string) => ({ slug: availableSlug, status: "active", purchasable: true, tag });
  function works(config: any) { const p = disk(); p.systemPages = { ...(p.systemPages || {}), works: { schemaVersion: 1, ...config } }; fs.writeFileSync(pages, JSON.stringify(p, null, 2) + "\n"); }
  function target(tag: string, sold = false) {
    const fixture = JSON.parse(fs.readFileSync(website, "utf8"));
    const p = fixture.menu.products.find((p: any) => p.slug === availableSlug);
    p.tag = tag; p.status = sold ? "sold_out" : "active"; p.purchasable = !sold;
    fs.writeFileSync(website, JSON.stringify(fixture, null, 2) + "\n");
  }
  const markerNodes = (e: any) => nodes(e).filter((n: any) => n.props["data-works-card-marker"] !== undefined);
  const classHas = (n: any, c: string) => String(n?.props.className || "").split(" ").includes(c);
  const control = (t: any, id: string) => nodes(t).find((n: any) => n.props.id === id);
  async function selectedCard() { return (await cards()).find((c: any) => c.key === availableSlug); }
  async function put(config: any, version = disk().version) {
    return fetch("/api/admin/works-page", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version, works: { schemaVersion: 1, ...config } }) });
  }
  await check("audit: Product.tag is existing editable marketing truth", () => {
    const manager = fs.readFileSync(path.join(project, "components/admin/ProductManager.tsx"), "utf8");
    assert.ok(manager.includes("既有 Product.tag")); assert.ok(manager.includes("作品標籤"));
    assert.ok(manager.includes("新品上市")); assert.ok(manager.includes("本月推薦"));
    const tagsFound = source.menu.products.map((p: any) => p.tag).filter(Boolean);
    for (const tag of tagsFound) assert.ok(priority.resolveWorksMarketingTag(tag));
  });
  for (const [input, expected] of [["新品上市", "NEW"], ["新品", "NEW"], ["本月推薦", "RECOMMENDED"],
    ["推薦", "RECOMMENDED"], ["活動", "CAMPAIGN"], ["限量", "LIMITED"], ["期間限定", "LIMITED"], ["本月精選", "FEATURED"], ["入門首選", "CUSTOM"]])
    await check("existing tag classification " + input, () => assert.equal(priority.resolveWorksMarketingTag(input).type, expected));
  for (const tag of ["", " ", "<b>新品</b>", "\ud800", "\n", "x".repeat(41), null, [], {}])
    await check("invalid tag does not become assignment " + JSON.stringify(tag), () => assert.equal(priority.resolveWorksMarketingTag(tag), null));
  for (const type of types) {
    await check("in-stock " + type, () => {
      const p = product(tags[type]), before = structuredClone(p);
      const marker = priority.resolveWorksCardMarker({ product: p });
      assert.equal(marker.source, "marketing"); assert.equal(marker.type, type);
      assert.equal(marker.assignmentSource, "Product.tag");
      assert.equal(marker.presentation.text, type === "CUSTOM" ? tags[type] : cms.WORKS_MARKETING_MARKER_LABELS[type]);
      assert.deepEqual(p, before);
    });
    for (const state of [{ status: "sold_out", purchasable: true }, { status: "active", purchasable: false }])
      await check("system beats " + type + JSON.stringify(state), () => {
        const p = { ...product(tags[type]), ...state }, before = structuredClone(p);
        const marker = priority.resolveWorksCardMarker({ product: p });
        assert.equal(marker.source, "system"); assert.equal(marker.type, "SOLD_OUT"); assert.deepEqual(p, before);
        assert.equal(priority.resolveWorksCardMarker({ product: p, showCommerceSummary: false }), null);
      });
  }
  await check("sold-out without marketing", () => assert.equal(priority.resolveWorksCardMarker({ product: { ...product(), status: "sold_out" } }).type, "SOLD_OUT"));
  await check("available without tag has no marker", () => assert.equal(priority.resolveWorksCardMarker({ product: product() }), null));
  await check("showTag gates only marketing", () => {
    assert.equal(priority.resolveWorksCardMarker({ product: product("新品"), showTag: false }), null);
    assert.equal(priority.resolveWorksCardMarker({ product: { ...product("新品"), purchasable: false }, showTag: false }).source, "system");
  });
  for (const type of types) await check("preset safe defaults + field-level fallback " + type, () => {
    const config = { contractVersion: 1, marketing: { presets: { [type]: { textFontSize: 1000, textColor: "url(evil)", imageSize: 1000, dimMode: "radial", bandSize: -1 } } } };
    const fallback = cms.resolveWorksMarketingPreset(config, type), expected = cms.resolveWorksMarketingPreset(undefined, type);
    assert.deepEqual(fallback, expected);
  });
  for (const config of [null, [], "", { contractVersion: 2 }, { contractVersion: 1, marketing: null }])
    await check("malformed config safe resolver " + JSON.stringify(config), () => assert.equal(cms.resolveWorksMarketingPreset(config, "NEW").text, "新品"));
  for (const config of [null, [], { contractVersion: 2 }, { contractVersion: 1, extra: true },
    { contractVersion: 1, system: { soldOut: true } }, { contractVersion: 1, marketing: { assignments: { unknown: { type: "NEW" } } } },
    { contractVersion: 1, marketing: { presets: { PRICE: {} } } }, { contractVersion: 1, marketing: { presets: { NEW: null } } },
    { contractVersion: 1, marketing: { presets: { CUSTOM: { text: "second truth" } } } }])
    await check("strict config rejects second truth/unknown shape " + JSON.stringify(config), () => assert.throws(() => cms.validateWorksCardMarkers(config)));
  for (const [key, min, max] of [["imageSize", 20, 90], ["bandFeather", 0, 40]] as const) {
    for (const value of [min, max]) await check("new bounded presentation accepts " + key + value, () => cms.validateWorksSoldOutPresentation({ [key]: value }));
    for (const value of [min - 1, max + 1, 1.5, null, "30", false])
      await check("new bounded presentation rejects " + key + value, () => assert.throws(() => cms.validateWorksSoldOutPresentation({ [key]: value })));
  }
  for (const bandPosition of ["top", "center", "bottom"]) for (const bandSize of [10, 60])
    await check("horizontal feather and independent size/strength " + bandPosition + bandSize, () => {
      const p = cms.resolveWorksSoldOutPresentation({ dimMode: "band", bandPosition, bandSize, dimStrength: 70, bandFeather: 20 });
      const d = engine.worksCardMarkerPresentationBindings(p).dim.style;
      assert.equal(d.left, 0); assert.equal(d.right, 0); assert.equal(d.height, bandSize + "%"); assert.equal(d.opacity, .7);
      assert.match(d.background, /^linear-gradient\(to bottom,transparent 0%,rgb\(25,20,17\) 20%,rgb\(25,20,17\) 80%,transparent 100%\)$/);
      assert.doesNotMatch(d.background, /radial|ellipse|spotlight/);
      if (bandPosition === "center") assert.equal(d.top, "50%"); else assert.equal(d[bandPosition], 0);
    });
  await check("canonical catalog derives all source identities", async () => {
    const state = await service.readWorksPageAdminState();
    assert.deepEqual(state.markerProducts.map((p: any) => [p.slug, p.name]), source.menu.products.map((p: any) => [p.slug, p.name]));
    assert.equal(state.markerProducts.length, source.menu.products.length);
    assert.deepEqual(state.markerProducts.map((p: any) => p.tag || ""), source.menu.products.map((p: any) => p.tag || ""));
  });
  await check("duplicate canonical slug fails read/save closed", async () => {
    const original = fs.readFileSync(website), f = JSON.parse(original.toString());
    f.menu.products.push(structuredClone(f.menu.products[0])); fs.writeFileSync(website, JSON.stringify(f));
    const before = hash(pages);
    try {
      await assert.rejects(service.readWorksPageAdminState);
      const response = await put({ cardMarkers: { contractVersion: 1 } }); assert.equal(response.status, 400); assert.equal(hash(pages), before);
    } finally { fs.writeFileSync(website, original); }
  });
  await check("legacy sold-out slot still authoritative and GET never migrates", async () => {
    works({ soldOutPresentation: { text: "原完售", textPosition: "bottom" } });
    const before = hash(pages); await service.readWorksPageAdminState(); assert.equal(hash(pages), before);
    const c = (await cards()).find((c: any) => c.key === soldSlug), m = markerNodes(c);
    assert.equal(m.length, 1); assert.equal(m[0].props["data-marker-source"], "system"); assert.match(markup(m[0]), /原完售/);
    assert.equal(disk().systemPages.works.cardMarkers, undefined);
  });
  for (const type of types) await check("real Admin callback → PUT → reload → SSR " + type, async () => {
    target(tags[type]); works({});
    const productHash = hash(website), before = hash(pages);
    const m = mountManager(); let tree = await loaded(m);
    button(tree, "作品卡標示").props.onClick(); tree = m.render();
    button(tree, cms.WORKS_MARKETING_MARKER_LABELS[type]).props.onClick(); tree = m.render();
    assert.ok(markup(tree).includes("Product.tag"));
    assert.equal(nodes(tree).filter((n: any) => n.type === "tr").length - 1, source.menu.products.length);
    assert.ok(nodes(tree).some((n: any) => n.type === "a" && n.props.href === "/admin/products"));
    function change(id: string, value: string) { const c = control(tree, id); assert.ok(c, id); c.props.onChange({ target: { value } }); tree = m.render(); }
    if (type === "CUSTOM") assert.equal(control(tree, "works-sold-out-text").props.readOnly, true);
    else change("works-sold-out-text", "設計" + cms.WORKS_MARKETING_MARKER_LABELS[type]);
    change("works-sold-out-font-size", "28"); change("works-sold-out-color", "#abcdef"); change("works-sold-out-position", "center");
    change("works-sold-out-dim-mode", "band"); change("works-sold-out-band-position", "bottom");
    change("works-sold-out-band-size", "48"); change("works-sold-out-strength", "61"); change("works-marker-feather", "18");
    const previewBox = nodes(tree).find((n: any) => n.props["data-sold-out-preview"] !== undefined);
    assert.equal(hash(pages), before); assert.ok(markup(previewBox).includes("linear-gradient(to bottom"));
    const version = disk().version; await button(tree, "儲存全部").props.onClick(); tree = m.render();
    assert.equal(disk().version, version + 1);
    const config = disk().systemPages.works.cardMarkers, stored = config.marketing.presets[type];
    assert.deepEqual(Object.keys(config).sort(), ["contractVersion", "marketing"]);
    assert.deepEqual(Object.keys(config.marketing), ["presets"]); assert.deepEqual(Object.keys(config.marketing.presets), [type]);
    assert.equal(stored.textFontSize, 28); assert.equal(stored.textColor, "#abcdef"); assert.equal(stored.bandFeather, 18);
    if (type === "CUSTOM") assert.equal(Object.hasOwn(stored, "text"), false);
    const reread = await service.readWorksPageAdminState(); assert.deepEqual(reread.savedConfig.cardMarkers, config);
    const markers = markerNodes(await selectedCard()); assert.equal(markers.length, 1);
    assert.equal(markers[0].props["data-marker-source"], "marketing"); assert.equal(markers[0].props["data-marker-type"], type);
    assert.match(markup(markers[0]), new RegExp(type === "CUSTOM" ? tags[type] : "設計" + cms.WORKS_MARKETING_MARKER_LABELS[type]));
    assert.equal(nodes(await selectedCard()).filter((n: any) => n.props.className === "cover-tag").length, 0);
    assert.equal(hash(website), productHash, "Global preset save must not mutate even Product.tag");
    m.dispose();
    const reload = mountManager(); let t = await loaded(reload); button(t, "作品卡標示").props.onClick(); t = reload.render();
    button(t, cms.WORKS_MARKETING_MARKER_LABELS[type]).props.onClick(); t = reload.render();
    assert.equal(control(t, "works-sold-out-font-size").props.value, 28); reload.dispose();
  });
  for (const type of ["NEW", "CAMPAIGN"]) await check("public suppression / retained assignment / restock " + type, async () => {
    works({}); target(tags[type], true);
    let c = await selectedCard(), markers = markerNodes(c);
    assert.equal(markers.length, 1); assert.equal(markers[0].props["data-marker-source"], "system");
    assert.equal(nodes(c).some((n: any) => n.props.className === "cover-tag"), false);
    assert.equal(JSON.parse(fs.readFileSync(website, "utf8")).menu.products.find((p: any) => p.slug === availableSlug).tag, tags[type]);
    target(tags[type], false); c = await selectedCard(); markers = markerNodes(c);
    assert.equal(markers.length, 1); assert.equal(markers[0].props["data-marker-type"], type);
  });
  for (const type of ["SOLD_OUT", ...types]) await check("real shared image pipeline, replacement/removal/size " + type, async () => {
    target(type === "SOLD_OUT" ? "" : tags[type], type === "SOLD_OUT"); works({});
    const m = mountManager(); let tree = await loaded(m);
    button(tree, type === "SOLD_OUT" ? "作品缺貨顯示" : "作品卡標示").props.onClick(); tree = m.render();
    if (type !== "SOLD_OUT") { button(tree, cms.WORKS_MARKETING_MARKER_LABELS[type]).props.onClick(); tree = m.render(); }
    control(tree, "works-sold-out-source").props.onChange({ target: { value: "image" } }); tree = m.render();
    control(tree, "works-marker-image-size").props.onChange({ target: { value: "80" } }); tree = m.render();
    control(tree, "works-sold-out-position").props.onChange({ target: { value: "bottom" } }); tree = m.render();
    assert.equal(control(tree, "works-marker-image-size").props.type, "range");
    const png = await sharp({ create: { width: 60, height: 30, channels: 4, background: { r: 120, g: 60, b: 30, alpha: 0 } } }).png().toBuffer();
    let lastUrl = ""; const beforeWebsite = hash(website);
    for (const [name, bytes, mime] of [["marker.png", png, "image/png"], ["replacement.webp", await sharp(png).webp().toBuffer(), "image/webp"]] as const) {
      nodes(tree); const uploader = getUploader(), beforePage = hash(pages);
      const media = await uploader.onImageUpload(new File([new Uint8Array(bytes)], name, { type: mime }));
      assert.notEqual(media.url, lastUrl); lastUrl = media.url; uploader.onChange(media); tree = m.render();
      assert.equal(hash(pages), beforePage);
      const output = path.join(storage.getAssetsUploadDir("page-builder"), path.basename(media.url)); guard(output);
      assert.ok(output.startsWith(root)); const metadata = await sharp(output).metadata();
      assert.equal(metadata.format, "webp"); assert.equal(metadata.hasAlpha, true);
      const raw = await sharp(output).raw().toBuffer({ resolveWithObject: true }); assert.equal(raw.data[3], 0);
      const library = JSON.parse(fs.readFileSync(storage.getAssetsDataFile(), "utf8"));
      const asset = library.assets.find((a: any) => a.path === media.url); assert.ok(asset.seoStem); assert.ok(asset.alt); assert.equal(asset.originalFileName, name);
      const previewBox = nodes(tree).find((n: any) => n.props["data-sold-out-preview"] !== undefined);
      assert.ok(markup(previewBox).includes(media.url)); assert.ok(markup(previewBox).includes("width:80%"));
      await button(tree, "儲存全部").props.onClick(); tree = m.render();
      const markers = markerNodes(await selectedCard()); assert.equal(markers.length, 1);
      const visual = nodes(markers[0]).find((n: any) => classHas(n, "works-card-marker-image"));
      assert.ok(visual); assert.equal(visual.props.src, media.url); assert.equal(visual.props.alt, ""); assert.equal(visual.props["aria-hidden"], "true");
      assert.ok(nodes(markers[0]).some((n: any) => n.type === "span" && n.props.style?.clip === "rect(0,0,0,0)" && typeof n.props.children === "string"));
      const a = nodes(markers[0]).find((n: any) => classHas(n, "works-sold-out-anchor"));
      assert.equal(a.props.style.width, "80%"); assert.equal(a.props.style.top, "auto");
    }
    nodes(tree); getUploader().onRemove(); tree = m.render();
    await button(tree, "儲存全部").props.onClick(); tree = m.render();
    assert.equal(markerNodes(await selectedCard())[0].props["data-display-mode"], "text");
    assert.equal(hash(website), beforeWebsite); m.dispose();
  });
  await check("available with no tag stays normal despite preset changes", async () => {
    target(""); works({}); const normal = markup(await selectedCard());
    works({ cardMarkers: { contractVersion: 1, marketing: { presets: { NEW: { dimMode: "full", dimStrength: 100, textFontSize: 48 } } } } });
    const c = await selectedCard(); assert.equal(markup(c), normal); assert.equal(markerNodes(c).length, 0);
  });
  await check("missing/invalid marketing image safely falls back to text", async () => {
    target("新品"); works({ cardMarkers: { contractVersion: 1, marketing: { presets: { NEW: { mode: "image", imageAsset: { media: { type: "image", url: "javascript:evil" }, alt: "bad" } } } } } });
    const marker = markerNodes(await selectedCard())[0]; assert.equal(marker.props["data-display-mode"], "text");
    assert.doesNotMatch(markup(marker), /javascript:evil/);
  });
  for (const config of [
    { contractVersion: 1, marketing: { assignments: { [availableSlug]: { type: "NEW" } } } },
    { contractVersion: 1, marketing: { assignments: { "unknown-slug": { type: "NEW" } } } },
    { contractVersion: 1, marketing: { presets: { NEW: { price: 0 } } } },
    { contractVersion: 1, marketing: { presets: { NEW: { imageSize: 91 } } } },
    { contractVersion: 1, marketing: { presets: { NEW: { bandFeather: 41 } } } },
    { contractVersion: 1, marketing: { presets: { NEW: { startAt: "now" } } } },
  ]) await check("actual PUT rejects assignments/business/scheduling atomically " + JSON.stringify(config), async () => {
    const beforePage = hash(pages), beforeProduct = hash(website), response = await put({ cardMarkers: config });
    assert.equal(response.status, 400); assert.equal(hash(pages), beforePage); assert.equal(hash(website), beforeProduct);
  });
  await check("marker presets retain canonical version conflict guard", async () => {
    const before = hash(pages), response = await put({ cardMarkers: { contractVersion: 1 } }, disk().version - 1);
    assert.equal(response.status, 409); assert.equal(hash(pages), before);
  });
  await check("same real atomic writer/lock and no Product mutation path", () => {
    const store = fs.readFileSync(path.join(project, "lib/worksPageAdminStore.ts"), "utf8");
    assert.ok(store.includes("withFileLock(pagesPath")); assert.ok(store.includes("atomicWriteJson(pagesPath, store)"));
    const studio = fs.readFileSync(path.join(project, "components/admin/WorksCardMarkerStudio.tsx"), "utf8");
    assert.ok(studio.includes('href="/admin/products"')); assert.ok(!studio.includes("fetch("));
    assert.ok(!JSON.stringify(disk().systemPages.works.cardMarkers).includes("assignments"));
  });
}
