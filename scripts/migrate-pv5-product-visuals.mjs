// One-time, explicit migration. Never imported by application startup.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptFile = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptFile), '..');
const manifestFile = path.join(repositoryRoot, 'bootstrap/patches/pv5-approved-product-visuals-v01.json');
export const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const same = (a, b) => { try { assert.deepEqual(a, b); return true; } catch { return false; } };
const record = value => value && typeof value === 'object' && !Array.isArray(value);

// Record JSON value spans so existing text, key order, whitespace and line endings
// survive the patch. JSON.parse validates syntax; this pass also rejects duplicate keys.
function jsonSpans(text) {
  JSON.parse(text);
  let i = 0;
  const white = () => { while (/\s/.test(text[i] || '') && i < text.length) i++; };
  const stringEnd = () => { i++; while (i < text.length) { if (text[i] === '\\') i += 2; else if (text[i++] === '"') return; } throw new Error('Unterminated JSON string'); };
  function parse() {
    white(); const start = i, node = { start, type: text[i], children: [] };
    if (text[i] === '{') {
      i++; node.members = new Map(); white();
      while (text[i] !== '}') {
        const keyStart = i; stringEnd(); const key = JSON.parse(text.slice(keyStart, i));
        assert(!node.members.has(key), 'Duplicate JSON key: ' + key);
        white(); assert.equal(text[i++], ':'); const child = parse(); child.keyStart = keyStart; node.members.set(key, child);
        white(); if (text[i] !== ',') break; i++; white();
      }
      assert.equal(text[i++], '}');
    } else if (text[i] === '[') {
      i++; white(); while (text[i] !== ']') { node.children.push(parse()); white(); if (text[i] !== ',') break; i++; }
      assert.equal(text[i++], ']');
    } else if (text[i] === '"') stringEnd();
    else { while (i < text.length && !/[\s,}\]]/.test(text[i])) i++; }
    node.end = i; return node;
  }
  const root = parse(); white(); assert.equal(i, text.length); return root;
}

export function assertSafeDraft(product) {
  assert.equal(product.active, false, 'Draft must stay inactive');
  assert.equal(product.status, 'coming_soon'); assert.equal(product.purchasable, false);
  assert.equal(product.stock, 0); assert.equal(product.inMonthlyMenu, false); assert.equal(product.showOnHomepage, false);
  assert(record(product.publish) && Object.values(product.publish).every(value => value === false), 'Draft must stay unpublished');
  assert.deepEqual(product.purchase, []); assert.deepEqual(product.skus, []);
  assert(!Object.hasOwn(product, 'price') && !Object.hasOwn(product, 'sku'), 'No fake price or sale SKU');
}

export function planMigration(raw, manifest) {
  assert.equal(manifest.schemaVersion, 1); assert.equal(manifest.patchId, 'pv5-approved-product-visuals-v01');
  assert.equal(manifest.products.length, 8); assert.equal(manifest.requiredExistingProducts.length, 23);
  assert.equal(new Set(manifest.products.map(p => p.id)).size, 8, 'Duplicate patch identities');
  assert.equal(new Set(manifest.products.map(p => p.slug)).size, 8, 'Duplicate patch slugs');
  assert.equal(new Set(manifest.requiredExistingProducts.map(p => p.id)).size, 23, 'Duplicate baseline identities');
  const before = JSON.parse(raw), tree = jsonSpans(raw);
  const products = before?.menu?.products; assert(Array.isArray(products), 'Canonical menu.products required');
  const productTree = tree.members?.get('menu')?.members?.get('products'); assert.equal(productTree?.type, '[');
  assert.equal(new Set(products.map(p => p.id)).size, products.length, 'Duplicate or missing product IDs');
  assert(products.every(p => typeof p.id === 'string' && typeof p.slug === 'string'));
  assert.equal(new Set(products.map(p => p.slug)).size, products.length, 'Duplicate slugs');
  for (const identity of manifest.requiredExistingProducts) assert(products.some(p => p.id === identity.id && p.slug === identity.slug), 'Baseline identity missing: ' + identity.id);
  const after = structuredClone(before), edits = [], changes = [], additions = [];
  const newline = raw.includes('\r\n') ? '\r\n' : '\n', pretty = raw.includes('\n');
  const indentAt = offset => raw.slice(raw.lastIndexOf('\n', offset - 1) + 1, offset).match(/^\s*/)[0].replace(/\r/g, '');
  const step = raw.match(/\n( +)"/)?.[1] || '  ';
  const formatted = (value, indent) => pretty ? JSON.stringify(value, null, step).replace(/\n/g, newline + indent) : JSON.stringify(value);
  function setMember(node, key, value) {
    assert.equal(node.type, '{'); const current = node.members.get(key);
    if (current) edits.push({ start: current.start, end: current.end, text: formatted(value, indentAt(current.keyStart)) });
    else {
      const members = [...node.members.values()], last = members.at(-1), indent = members.length ? indentAt(members[0].keyStart) : indentAt(node.start) + step;
      const insertion = (members.length ? ',' : '') + (pretty ? newline + indent : '') + JSON.stringify(key) + ':' + (pretty ? ' ' : '') + formatted(value, indent);
      edits.push({ start: last?.end ?? node.start + 1, end: last?.end ?? node.start + 1, text: insertion });
    }
  }
  for (const entry of manifest.products) {
    assert(/^P\d{5}$/.test(entry.id) && /^[a-z0-9-]+$/.test(entry.slug));
    assert.equal(entry.asset.path, `/uploads/artworks/${entry.slug}/kdcoffee-${entry.slug}-product-visual-v01.webp`);
    assert(/^[a-f0-9]{64}$/.test(entry.sha256));
    const index = products.findIndex(p => p.id === entry.id || p.slug === entry.slug);
    let current, next;
    if (index < 0) {
      assert(['P00024', 'P00025'].includes(entry.id) && entry.draft, 'Only approved two drafts may be added');
      assert.equal(entry.draft.id, entry.id); assert.equal(entry.draft.slug, entry.slug); assertSafeDraft(entry.draft);
      current = entry.draft; next = structuredClone(current); additions.push(next);
      changes.push({ product: entry.id, field: 'record', action: 'ADD_UNPUBLISHED_DRAFT' });
    } else {
      current = products[index]; next = after.menu.products[index];
      assert.equal(current.id, entry.id, 'ID conflict: ' + entry.slug); assert.equal(current.slug, entry.slug, 'Slug conflict: ' + entry.id);
      if (['P00024', 'P00025'].includes(entry.id)) assertSafeDraft(current);
    }
    assert(record(current.pageLayout), 'Missing pageLayout baseline: ' + entry.id);
    assert(current.assets === undefined || record(current.assets), 'Invalid assets baseline');
    const existingAsset = current.assets?.productVisual;
    assert(existingAsset === undefined || same(existingAsset, entry.asset), 'Existing different productVisual; review conflict: ' + entry.id);
    assert([entry.before.listAsset, 'productVisual'].includes(current.pageLayout.listAsset), 'Layout conflict: ' + entry.id + '.listAsset');
    next.assets = { ...next.assets, productVisual: structuredClone(entry.asset) };
    // Product-stage clipping fails the approved master crop QA; retain productAsset.
    next.pageLayout = { ...next.pageLayout, listAsset: 'productVisual' };
    if (index >= 0) {
      const node = productTree.children[index];
      if (!same(existingAsset, entry.asset)) {
        if (node.members.has('assets')) setMember(node.members.get('assets'), 'productVisual', entry.asset);
        else setMember(node, 'assets', { productVisual: entry.asset });
        changes.push({ product: entry.id, field: 'assets.productVisual', action: 'ADD_APPROVED_REFERENCE' });
      }
      for (const field of ['listAsset']) if (current.pageLayout[field] !== 'productVisual') {
        setMember(node.members.get('pageLayout'), field, 'productVisual'); changes.push({ product: entry.id, field: 'pageLayout.' + field, action: 'SELECT_PRODUCT_VISUAL' });
      }
    }
  }
  if (additions.length) {
    const last = productTree.children.at(-1), indent = indentAt(productTree.children[0]?.start ?? productTree.start) || step;
    edits.push({ start: last?.end ?? productTree.start + 1, end: last?.end ?? productTree.start + 1, text: (last ? ',' : '') + (pretty ? newline + indent : '') + additions.map(p => formatted(p, indent)).join(',' + (pretty ? newline + indent : '')) });
    after.menu.products.push(...additions);
  }
  // Prove the allowed-field patch retains all current (not repository) business data.
  for (let index = 0; index < products.length; index++) {
    const original = products[index], actual = structuredClone(after.menu.products[index]);
    if (manifest.products.some(p => p.id === original.id)) {
      if (original.assets === undefined) delete actual.assets;
      else { if (Object.hasOwn(original.assets, 'productVisual')) actual.assets.productVisual = original.assets.productVisual; else delete actual.assets.productVisual; }
      actual.pageLayout = original.pageLayout;
    }
    assert.deepEqual(actual, original, 'Unrelated product mutation: ' + original.id);
  }
  assert.deepEqual({ ...after, menu: { ...after.menu, products } }, before, 'Unrelated root mutation');
  let output = raw;
  const sorted = edits.sort((a, b) => b.start - a.start);
  for (let index = 0; index < sorted.length; index++) { const edit = sorted[index]; assert(index === 0 || edit.end <= sorted[index - 1].start, 'Overlapping JSON edits'); output = output.slice(0, edit.start) + edit.text + output.slice(edit.end); }
  assert.deepEqual(JSON.parse(output), after, 'Surgical patch verification failed');
  return { output, before, after, report: { patchId: manifest.patchId, beforeSHA256: sha256(raw), afterSHA256: sha256(output), beforeCount: products.length, afterCount: after.menu.products.length, addedDrafts: additions.map(p => p.id), changes, existingBusinessDataPreserved: true, unrelatedRootDataPreserved: true, noWholeFileFormatting: true } };
}

function within(root, candidate) { const relative = path.relative(root, candidate); assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Path escapes selected volume'); }
async function noSymlinks(root, target) {
  within(root, target); const relative = path.relative(root, target);
  for (const part of [root, ...relative.split(path.sep).map((_, index, parts) => path.join(root, ...parts.slice(0, index + 1)))]) {
    try { assert(!(await fs.lstat(part)).isSymbolicLink(), 'Symlink is not a migration target: ' + part); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
async function fileHash(file) { try { return sha256(await fs.readFile(file)); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function atomicText(file, text) {
  const temporary = file + '.' + crypto.randomUUID() + '.pv5.tmp';
  try { const handle = await fs.open(temporary, 'wx', 0o600); try { await handle.writeFile(text); await handle.sync(); } finally { await handle.close(); } assert.equal(await fileHash(temporary), sha256(text)); await fs.rename(temporary, file); }
  finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
async function withCanonicalLock(file, operation) {
  // Same canonicalFile.lock / exclusive-create convention as lib/jsonFileStore.ts.
  // Fail immediately on a held/stale lock; never remove another writer's lock.
  const lock = file + '.lock', handle = await fs.open(lock, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }) + '\n'); await handle.sync(); return await operation(); }
  finally { await handle.close(); await fs.unlink(lock); }
}

export async function migrate({ volumeRoot, snapshotFile, apply = false, expectSHA256, rollbackDirectory }) {
  assert(!(volumeRoot && snapshotFile), 'Choose --volume-root or --snapshot');
  assert(volumeRoot || snapshotFile, 'Explicit --volume-root or --snapshot required; no implicit local-data fallback');
  if (snapshotFile) assert(!apply && !rollbackDirectory, '--snapshot is dry-run only');
  if (volumeRoot) { assert(path.isAbsolute(volumeRoot), 'Volume root must be absolute'); volumeRoot = path.resolve(volumeRoot); assert.notEqual(volumeRoot, path.parse(volumeRoot).root); }
  const file = snapshotFile ? path.resolve(snapshotFile) : path.join(volumeRoot, 'store/website-data.json');
  if (volumeRoot) await noSymlinks(volumeRoot, file);
  if (apply) assert(/^[a-f0-9]{64}$/.test(expectSHA256 || ''), '--apply requires --expect-sha256 from reviewed dry-run');
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  const assets = [...manifest.products.map(p => ({ publicPath: p.asset.path, sha256: p.sha256 })), ...manifest.supportAssets];
  assert.equal(new Set(assets.map(a => a.publicPath)).size, assets.length, 'Duplicate migration asset');
  async function prepare() {
    const raw = await fs.readFile(file, 'utf8');
    if (expectSHA256) assert.equal(sha256(raw), expectSHA256, 'STALE_SNAPSHOT; repeat dry-run');
    if (rollbackDirectory) {
      assert(volumeRoot); const dir = path.resolve(rollbackDirectory); within(path.join(volumeRoot, 'backups'), dir);
      const receiptFile = path.join(dir, 'receipt.json'), backupFile = path.join(dir, 'website-data.before.json');
      await noSymlinks(volumeRoot, receiptFile); await noSymlinks(volumeRoot, backupFile);
      const receipt = JSON.parse(await fs.readFile(receiptFile, 'utf8')), backup = await fs.readFile(backupFile, 'utf8');
      assert.equal(receipt.patchId, manifest.patchId); assert.equal(receipt.canonicalFile, file);
      assert.equal(sha256(raw), receipt.afterSHA256, 'Rollback conflicts with later runtime edits'); assert.equal(sha256(backup), receipt.beforeSHA256); JSON.parse(backup);
      if (apply) await atomicText(file, backup);
      return { mode: apply ? 'ROLLBACK_APPLIED' : 'ROLLBACK_DRY_RUN', currentSHA256: sha256(raw), restoreSHA256: sha256(backup), mediaRetained: true };
    }
    const planned = planMigration(raw, manifest), media = [];
    for (const asset of assets) {
      assert(/^\/uploads\/artworks\/[a-z0-9-]+\/[a-z0-9.-]+\.(webp|png)$/.test(asset.publicPath), 'Unexpected asset target');
      const source = path.join(repositoryRoot, 'public', asset.publicPath); within(repositoryRoot, source);
      assert.equal(await fileHash(source), asset.sha256, 'Promoted source hash mismatch: ' + asset.publicPath);
      const target = volumeRoot ? path.join(volumeRoot, asset.publicPath) : null;
      if (target) await noSymlinks(volumeRoot, target);
      const existing = target ? await fileHash(target) : null;
      assert(existing === null || existing === asset.sha256, 'MEDIA_CONFLICT; never overwrite: ' + asset.publicPath);
      media.push({ ...asset, source, target, action: !target ? 'UNVERIFIED_SNAPSHOT_MEDIA' : existing ? 'KEEP_IDENTICAL' : 'COPY_MISSING' });
    }
    const result = { ...planned.report, mode: apply ? 'APPLIED' : 'DRY_RUN', canonicalFile: file, backupPlanned: planned.report.beforeSHA256 !== planned.report.afterSHA256 || media.some(m => m.action === 'COPY_MISSING'), media: media.map(({ source, ...item }) => item) };
    if (!apply || !result.backupPlanned) return result;
    const backupDirectory = path.join(volumeRoot, 'backups', manifest.patchId, Date.now() + '-' + crypto.randomUUID());
    await noSymlinks(volumeRoot, path.join(backupDirectory, 'website-data.before.json'));
    await fs.mkdir(backupDirectory, { recursive: true });
    await fs.writeFile(path.join(backupDirectory, 'website-data.before.json'), raw, { flag: 'wx', mode: 0o600 });
    assert.equal(await fileHash(path.join(backupDirectory, 'website-data.before.json')), planned.report.beforeSHA256);
    await fs.writeFile(path.join(backupDirectory, 'receipt.json'), JSON.stringify({ patchId: manifest.patchId, canonicalFile: file, beforeSHA256: planned.report.beforeSHA256, afterSHA256: planned.report.afterSHA256, media: result.media }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    result.backupDirectory = backupDirectory;
    // Publish missing media before exposing their references. Existing files are never overwritten.
    for (const asset of media.filter(m => m.action === 'COPY_MISSING')) {
      await fs.mkdir(path.dirname(asset.target), { recursive: true });
      const temporary = asset.target + '.' + crypto.randomUUID() + '.pv5.tmp';
      try { await fs.copyFile(asset.source, temporary, fs.constants.COPYFILE_EXCL); assert.equal(await fileHash(temporary), asset.sha256); await fs.link(temporary, asset.target); }
      finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    }
    assert.equal(await fileHash(file), planned.report.beforeSHA256, 'Canonical data changed during apply');
    if (planned.report.beforeSHA256 !== planned.report.afterSHA256) await atomicText(file, planned.output);
    assert.equal(await fileHash(file), planned.report.afterSHA256);
    return result;
  }
  return apply ? withCanonicalLock(file, prepare) : prepare();
}

async function main() {
  const argv = process.argv.slice(2), flags = new Set(['--volume-root', '--snapshot', '--expect-sha256', '--rollback']);
  const options = { apply: false }, names = { '--volume-root': 'volumeRoot', '--snapshot': 'snapshotFile', '--expect-sha256': 'expectSHA256', '--rollback': 'rollbackDirectory' };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]; if (flag === '--apply') { assert(!options.apply, 'Duplicate --apply'); options.apply = true; }
    else { assert(flags.has(flag), 'Unknown argument: ' + flag); assert(argv[index + 1] && !argv[index + 1].startsWith('--'), 'Missing value: ' + flag); assert(!options[names[flag]], 'Duplicate argument: ' + flag); options[names[flag]] = argv[++index]; }
  }
  console.log(JSON.stringify(await migrate(options), null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === scriptFile) main().catch(error => { console.error('PV.5 migration STOP:', error.message); process.exitCode = 1; });
