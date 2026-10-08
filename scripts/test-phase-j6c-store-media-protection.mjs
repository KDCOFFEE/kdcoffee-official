import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Only the Cloudinary network boundary is substituted. Usage, repository,
// validation, file reads and final-delete locks are the production implementations.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === '@/lib/cloudinary') return {
    url: 'data:text/javascript,' + encodeURIComponent(`
      export const listCloudinaryCleanupVideoPage = (...args) => globalThis.__storeMediaTest.list(...args);
      export const lookupCloudinaryCleanupVideo = (...args) => globalThis.__storeMediaTest.lookup(...args);
      export const destroyCloudinaryCleanupVideo = (...args) => globalThis.__storeMediaTest.destroy(...args);
    `), shortCircuit: true,
  };
  return nextResolve(specifier, context);
}, load(url, context, nextLoad) {
  // Same test-only ESM load pattern as public-origin-test-bootstrap.mjs.
  // Preserve actual JSON values (including __proto__ keys and negative zero)
  // rather than substituting the empty presentation seed used by other suites.
  if (url.startsWith('file:') && new URL(url).pathname.endsWith('.json')) {
    const json = readFileSync(fileURLToPath(url), 'utf8');
    JSON.parse(json); // Fail on malformed JSON; do not mask read/parse errors.
    return { format: 'module', source: `export default JSON.parse(${JSON.stringify(json)});`, shortCircuit: true };
  }
  return nextLoad(url, context);
}});
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kd-j6c-media-'));
process.env.KD_DATA_DIR = root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
const { createStoreRepository } = await import('../lib/storeRepository.ts');
const { collectCloudinaryVideoUsage } = await import('../lib/cloudinaryMediaUsageCore.ts');
const { scanCloudinaryCleanupVideos, deleteCloudinaryOrphanVideos } = await import('../lib/cloudinaryCleanup.ts');
const repository = createStoreRepository();
const homePath = path.join(root, 'store/homepage.json');
const webPath = path.join(root, 'store/website-data.json');
const ids = Array.from({length: 8}, (_, i) => `kd-coffee/videos/00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const media = publicId => ({type:'video', provider:'cloudinary', publicId, url:`https://res.cloudinary.com/test/video/upload/${publicId}.mp4`, alt:''});
const resource = publicId => ({publicId, resourceType:'video', deliveryType:'upload', createdAt:'2020-01-01T00:00:00Z'});
let destroyed = [];
let lookupHook = async () => {};
let destroyHook = async () => {};
globalThis.__storeMediaTest = {
  list: async () => ({resources:ids.map(resource)}),
  lookup: async id => { await lookupHook(id); return resource(id); },
  destroy: async id => { await destroyHook(id); destroyed.push(id); return true; },
};
let passed = 0;
async function test(name, fn) {
  try { await fn(); console.log(`PASS ${++passed} ${name}`); }
  catch (error) { console.error(`FAIL ${name}`); throw error; }
}
async function write(file, value) { await fs.writeFile(file, JSON.stringify(value)); }
try {
  await fs.mkdir(path.dirname(homePath), {recursive:true});
  await write(homePath, {hero:{media:media(ids[2])}});
  await write(webPath, {menu:{products:[{name:'Artwork', slug:'artwork', assets:{hero:{media:media(ids[3])}}, cleanRoastingMedia:{items:[{media:media(ids[4])}]}, productCustomSections:[{media:{asset:media(ids[5])}}]}]}});
  await repository.createSection({id:'section', name:'Store', slug:'store'});
  const product = await repository.createProduct({id:'product', name:'Store only', slug:'store-only', sectionId:'section', sku:'STORE', price:100, inventory:1, pvValue:0, heroMedia:media(ids[0]), gallery:[media(ids[1])]});
  const scan = await scanCloudinaryCleanupVideos();
  await test('Store heroMedia prevents orphan classification', () => assert.equal(scan.assets.find(a=>a.publicId===ids[0]).status, 'used'));
  await test('Store gallery prevents orphan classification', () => assert.equal(scan.assets.find(a=>a.publicId===ids[1]).status, 'used'));
  await test('Store-only assets cannot be deleted', async () => {
    assert.deepEqual((await deleteCloudinaryOrphanVideos(ids.slice(0,2))).map(r=>r.status), ['skipped_in_use','skipped_in_use']); assert.deepEqual(destroyed, []);
  });
  await test('Existing homepage reference is preserved', () => assert.equal(scan.assets.find(a=>a.publicId===ids[2]).canDelete, false));
  await test('Existing Artwork hero reference is preserved', () => assert.equal(scan.assets.find(a=>a.publicId===ids[3]).canDelete, false));
  await test('Existing roasting and custom-section sources are retained', () => {
    for (const id of ids.slice(4,6)) assert.equal(scan.assets.find(a=>a.publicId===id).status, 'used');
  });
  await test('Matching remains video publicId only, not poster/image/thumbnail', () => {
    const usage=collectCloudinaryVideoUsage({}, {}, {products:[{heroMedia:{...media(ids[0]), type:'image'}, gallery:[{...media(''), posterUrl:ids[1]}]}]});
    assert.equal(usage.referencedPublicIds.size,0);
  });
  await test('Store references identify existing global scanner source', () => {
    assert.equal(scan.assets.find(a=>a.publicId===ids[0]).references[0].sourceType,'store-product');
    assert.equal(scan.assets.find(a=>a.publicId===ids[1]).references[0].field,'gallery[0]');
  });
  const catalogBytes = await fs.readFile(repository.catalogPath,'utf8');
  await test('Unreadable Store catalog blocks scan and deletion', async () => {
    await fs.writeFile(repository.catalogPath,'{broken');
    await assert.rejects(scanCloudinaryCleanupVideos());
    await assert.rejects(deleteCloudinaryOrphanVideos([ids[6]]));
    assert.deepEqual(destroyed,[]);
    await fs.writeFile(repository.catalogPath,catalogBytes);
  });
  await test('Reference added after scan/lookup is protected by final recheck', async () => {
    assert.equal(scan.assets.find(a=>a.publicId===ids[6]).status,'orphan');
    lookupHook=async()=>{await repository.updateProduct(product.id,product.revision,{gallery:[media(ids[1]),media(ids[6])]});};
    assert.equal((await deleteCloudinaryOrphanVideos([ids[6]]))[0].status,'skipped_in_use');
    assert.deepEqual(destroyed,[]); lookupHook=async()=>{};
  });
  await test('Store read failure at final recheck blocks destruction', async () => {
    const bytes=await fs.readFile(repository.catalogPath,'utf8');
    lookupHook=async()=>{await fs.writeFile(repository.catalogPath,'{broken');};
    assert.equal((await deleteCloudinaryOrphanVideos([ids[7]]))[0].status,'failed');
    assert.deepEqual(destroyed,[]); lookupHook=async()=>{};
    await fs.writeFile(repository.catalogPath,bytes);
  });
  await test('Homepage and Artwork read failures also block destruction', async () => {
    for(const file of [homePath,webPath]) {
      const bytes=await fs.readFile(file,'utf8'); await fs.writeFile(file,'{broken');
      await assert.rejects(deleteCloudinaryOrphanVideos([ids[7]]));
      assert.deepEqual(destroyed,[]); await fs.writeFile(file,bytes);
    }
  });
  await test('Final deletion holds same catalog lock and excludes Store writers', async () => {
    let writer; let completed=false;
    destroyHook=async()=>{
      await fs.access(repository.catalogPath+'.lock');
      const current=(await repository.read()).products[0];
      writer=repository.updateProduct(current.id,current.revision,{name:'Updated safely'}).then(()=>{completed=true;});
      await new Promise(resolve=>setTimeout(resolve,100)); assert.equal(completed,false);
    };
    assert.equal((await deleteCloudinaryOrphanVideos([ids[7]]))[0].status,'deleted');
    await writer; assert.equal(completed,true); destroyHook=async()=>{};
  });
  await test('Genuinely unused managed video deletes when all sources succeed', () => assert.deepEqual(destroyed,[ids[7]]));
  await test('Archived Store product references remain protected', async () => {
    const current=(await repository.read()).products[0]; await repository.archiveProduct(current.id,current.revision);
    const after=await scanCloudinaryCleanupVideos(); assert.equal(after.assets.find(a=>a.publicId===ids[0]).status,'used');
  });
  await test('Absent catalog is safely empty without creating a catalog file', async () => {
    await fs.unlink(repository.catalogPath);
    assert.equal((await deleteCloudinaryOrphanVideos([ids[0]]))[0].status,'deleted');
    await assert.rejects(fs.access(repository.catalogPath),{code:'ENOENT'});
  });
  console.log(`J.6C Store media protection: ${passed}/${passed} PASS`);
} finally {
  delete globalThis.__storeMediaTest;
  await fs.rm(root,{recursive:true,force:true});
}
