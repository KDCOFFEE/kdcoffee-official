// No live-volume access. Every write uses a newly created OS temporary directory.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { migrate, planMigration, assertSafeDraft, sha256 } from './migrate-pv5-product-visuals.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'bootstrap/patches/pv5-approved-product-visuals-v01.json'), 'utf8'));
const seed = JSON.parse(await fs.readFile(path.join(root, 'bootstrap/store/website-data.json'), 'utf8'));
assert.equal(seed.menu.products.length, 23);
// Represent newer runtime changes, not repository business values.
seed.menu.products[0].shortCopy += ' [runtime editorial update]';
seed.menu.products[0].runtimeMetadata = { revision: 37, retained: true };
seed.runtimeSentinel = { orders: 'preserve', member: { unknownField: 19 } };
const raw = JSON.stringify(seed, null, 2).replace(/\n/g, '\r\n') + '\r\n';
const tests = [];
async function check(name, run) { await run(); tests.push(name); console.log('PASS ' + name); }
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kdcoffee-pv5-test-'));
async function fixture(name, text = raw) {
  const volumeRoot = path.join(temporaryRoot, name);
  await fs.mkdir(path.join(volumeRoot, 'store'), { recursive: true });
  await fs.writeFile(path.join(volumeRoot, 'store/website-data.json'), text);
  for (const file of ['orders/index.json', 'member-identity/state.json', 'membership-commerce/business-rules.json', 'fulfillment/state.json', 'rewards/sentinel.json', 'subscriptions/sentinel.json', 'store/assets.json', 'store/homepage.json', 'store/pages.json', 'uploads/member-avatars/sentinel.png']) {
    await fs.mkdir(path.dirname(path.join(volumeRoot, file)), { recursive: true });
    await fs.writeFile(path.join(volumeRoot, file), 'protected-runtime-sentinel:' + file);
  }
  return volumeRoot;
}
async function treeHashes(directory) {
  const output = {};
  async function walk(current) { for (const item of await fs.readdir(current, { withFileTypes: true })) {
    const full = path.join(current, item.name);
    if (item.isDirectory()) await walk(full); else output[path.relative(directory, full).split(path.sep).join('/')] = sha256(await fs.readFile(full));
  } }
  await walk(directory); return output;
}
const canonical = volume => path.join(volume, 'store/website-data.json');
try {
  const planned = planMigration(raw, manifest);
  await check('minimal semantic merge; 23 runtime records and unrelated root retained', async () => {
    assert.equal(planned.after.menu.products.length, 25);
    const restored = structuredClone(planned.after);
    restored.menu.products = restored.menu.products.slice(0, 23).map((p, i) => {
      if (manifest.products.some(e => e.id === p.id)) { p.pageLayout = seed.menu.products[i].pageLayout; delete p.assets.productVisual; }
      return p;
    });
    assert.deepEqual(restored, seed);
    assert(planned.output.includes('"orders": "preserve",\r\n    "member": {\r\n      "unknownField": 19'));
    for (const p of planned.after.menu.products.slice(23)) assertSafeDraft(p);
    for (const p of planned.after.menu.products.filter(p => manifest.products.some(e => e.id === p.id))) {
      assert.equal(p.pageLayout.listAsset, 'productVisual');
      assert.equal(p.pageLayout.productAsset, manifest.products.find(e => e.id === p.id).before.productAsset);
    }
  });
  await check('compact JSON, CRLF text, exact idempotence without full-file reformat', async () => {
    assert.deepEqual(planMigration(JSON.stringify(seed), manifest).after, planned.after);
    assert.equal(planMigration(planned.output, manifest).output, planned.output);
    assert.equal(planMigration(planned.output, manifest).report.changes.length, 0);
  });
  await check('approved list resolver; stopped layouts and artwork/hero/product roles retain their old source', async () => {
    const jiti = createRequire(import.meta.url)('jiti').createJiti(fileURLToPath(import.meta.url), { alias: { '@/': root + '/' } });
    const visual = jiti(path.join(root, 'lib/productVisualAssets.ts'));
    for (const entry of manifest.products) {
      const original = seed.menu.products.find(p => p.id === entry.id) || entry.draft;
      const updated = planned.after.menu.products.find(p => p.id === entry.id);
      assert.equal(visual.resolveListAsset(updated).path, entry.asset.path);
      // The two drafts are not eligible for Related/monthly/CMS lists.
      if (!entry.draft) assert.deepEqual(visual.resolveListAsset(updated, { allowProductVisual: false }), visual.resolveListAsset(original));
      assert.deepEqual(visual.resolveProductAsset(updated), visual.resolveProductAsset(original));
      assert.deepEqual(visual.resolveHeroAsset(updated), visual.resolveHeroAsset(original));
      assert.equal(visual.resolveStaticProductImage(updated), visual.resolveStaticProductImage(original));
    }
  });
  await check('duplicate JSON keys, patch identities and product identity collisions stop', async () => {
    assert.throws(() => planMigration('{"menu":{},"menu":{}}', manifest), /Duplicate JSON key/);
    const duplicate = structuredClone(manifest); duplicate.products[1] = duplicate.products[0]; assert.throws(() => planMigration(raw, duplicate), /Duplicate patch/);
    const collision = structuredClone(seed); collision.menu.products.push({ ...manifest.products.at(-1).draft, id: 'P99999' });
    assert.throws(() => planMigration(JSON.stringify(collision), manifest), /ID conflict/);
  });
  await check('published draft, existing distinct visual and changed role stop', async () => {
    const unsafe = structuredClone(planned.after); unsafe.menu.products.at(-1).active = true;
    assert.throws(() => planMigration(JSON.stringify(unsafe), manifest), /inactive/);
    const conflict = structuredClone(seed); conflict.menu.products[0].assets.productVisual = { path: '/other.webp' };
    assert.throws(() => planMigration(JSON.stringify(conflict), manifest), /different productVisual/);
    const role = structuredClone(seed); role.menu.products[0].pageLayout.listAsset = 'hero';
    assert.throws(() => planMigration(JSON.stringify(role), manifest), /Layout conflict/);
  });
  const volumeRoot = await fixture('successful');
  const beforeHashes = await treeHashes(volumeRoot);
  await check('default dry-run creates no backup, lock, media or data writes', async () => {
    const result = await migrate({ volumeRoot }); assert.equal(result.mode, 'DRY_RUN');
    assert.equal(result.media.length, 12); assert.equal(result.addedDrafts.length, 2);
    assert.deepEqual(await treeHashes(volumeRoot), beforeHashes);
  });
  await check('explicit apply and reviewed snapshot required; stale snapshot writes nothing', async () => {
    await assert.rejects(migrate({ volumeRoot, apply: true }), /requires --expect-sha256/);
    await assert.rejects(migrate({ volumeRoot, apply: true, expectSHA256: '0'.repeat(64) }), /STALE_SNAPSHOT/);
    assert.deepEqual(await treeHashes(volumeRoot), beforeHashes);
  });
  await check('held canonical lock stops and is retained', async () => {
    const lock = canonical(volumeRoot) + '.lock'; await fs.writeFile(lock, 'other writer');
    await assert.rejects(migrate({ volumeRoot, apply: true, expectSHA256: sha256(raw) }), error => error.code === 'EEXIST');
    assert.equal(await fs.readFile(lock, 'utf8'), 'other writer'); await fs.unlink(lock);
  });
  await check('media conflict preflight stops without data or backup changes', async () => {
    const conflictRoot = await fixture('media-conflict'); const file = path.join(conflictRoot, manifest.products[0].asset.path);
    await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, 'existing different runtime image');
    const hashes = await treeHashes(conflictRoot);
    await assert.rejects(migrate({ volumeRoot: conflictRoot, apply: true, expectSHA256: sha256(raw) }), /MEDIA_CONFLICT/);
    assert.deepEqual(await treeHashes(conflictRoot), hashes);
  });
  let applied;
  await check('apply makes verified backup, adds two drafts, copies 12 exact files; protected bytes unchanged', async () => {
    applied = await migrate({ volumeRoot, apply: true, expectSHA256: sha256(raw) });
    assert.equal(await fs.readFile(canonical(volumeRoot), 'utf8'), planned.output);
    assert.equal(await fs.readFile(path.join(applied.backupDirectory, 'website-data.before.json'), 'utf8'), raw);
    for (const asset of applied.media) assert.equal(sha256(await fs.readFile(asset.target)), asset.sha256);
    const hashes = await treeHashes(volumeRoot);
    for (const [file, hash] of Object.entries(beforeHashes)) if (file !== 'store/website-data.json') assert.equal(hashes[file], hash);
  });
  await check('second apply is exact no-op: no duplicate product, backup or media overwrite', async () => {
    const hashes = await treeHashes(volumeRoot);
    const result = await migrate({ volumeRoot, apply: true, expectSHA256: sha256(planned.output) });
    assert.equal(result.backupPlanned, false); assert.deepEqual(await treeHashes(volumeRoot), hashes);
  });
  await check('rollback CAS rejects later edits, dry-run no writes and restores original exact bytes', async () => {
    await fs.appendFile(canonical(volumeRoot), ' ');
    await assert.rejects(migrate({ volumeRoot, rollbackDirectory: applied.backupDirectory }), /later runtime edits/);
    await fs.writeFile(canonical(volumeRoot), planned.output);
    const hashes = await treeHashes(volumeRoot);
    assert.equal((await migrate({ volumeRoot, rollbackDirectory: applied.backupDirectory })).mode, 'ROLLBACK_DRY_RUN');
    assert.deepEqual(await treeHashes(volumeRoot), hashes);
    await migrate({ volumeRoot, rollbackDirectory: applied.backupDirectory, apply: true, expectSHA256: sha256(planned.output) });
    assert.equal(await fs.readFile(canonical(volumeRoot), 'utf8'), raw);
    for (const asset of applied.media) assert.equal(sha256(await fs.readFile(asset.target)), asset.sha256);
  });
  console.log(JSON.stringify({ phase: 'PV.5', passed: tests.length, failures: 0, tests }));
} finally {
  // Only this mkdtemp result is eligible for recursive cleanup.
  assert(path.dirname(temporaryRoot) === os.tmpdir() && path.basename(temporaryRoot).startsWith('kdcoffee-pv5-test-'));
  await fs.rm(temporaryRoot, { recursive: true });
}
