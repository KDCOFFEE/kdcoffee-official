import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';


function resolveLocalTsModule(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
    path.join(basePath, 'index.js'),
    path.join(basePath, 'index.mjs'),
  ];

  return candidates.find(candidate => existsSync(candidate));
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kd-monthly-video-'));
const websiteFile = path.join(root, 'website.json');
const imageName = 'kdcoffee-monthly-menu-background-v01.webp';
const image = `/uploads/artworks/monthly-menu/${imageName}`;
const video = id => ({ type: 'video', provider: 'cloudinary', publicId: `kd-coffee/videos/${id}`, url: `https://res.cloudinary.com/test/video/upload/${id}.mp4`, posterUrl: `https://res.cloudinary.com/test/video/upload/${id}.jpg` });
const first = video('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const second = video('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
globalThis.monthlyVideoFixture = { authenticated: true, websiteFile, root, resources: new Map([first, second].map(media => [media.publicId, media])), verifications: 0 };
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') return nextResolve('next/server.js', context);

  if (specifier.startsWith('@/')) {
    const base = path.resolve(process.cwd(), specifier.slice(2));

    const candidates = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.js`,
      `${base}.mjs`,
      path.join(base, 'index.ts'),
      path.join(base, 'index.tsx'),
      path.join(base, 'index.js'),
      path.join(base, 'index.mjs'),
    ];

    const resolved = candidates.find(candidate => existsSync(candidate));

    if (!resolved) {
      throw new Error(`Unable to resolve alias: ${specifier}`);
    }

    return {
      url: pathToFileURL(resolved).href,
      shortCircuit: true,
    };
  }


  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    context.parentURL?.startsWith('file:')
  ) {
    const parentFile = fileURLToPath(context.parentURL);
    const base = path.resolve(path.dirname(parentFile), specifier);
    const resolved = resolveLocalTsModule(base);

    if (resolved) {
      return {
        url: pathToFileURL(resolved).href,
        shortCircuit: true,
      };
    }
  }

  return nextResolve(specifier, context);
}, load(url, context, nextLoad) {
  let source;
  if (url.endsWith('/lib/adminAuth.ts')) source = 'export async function isAdminAuthenticated(){return globalThis.monthlyVideoFixture.authenticated}';
  if (url.endsWith('/lib/storagePaths.ts')) source = 'export const getWebsiteDataFile=()=>globalThis.monthlyVideoFixture.websiteFile; export const getArtworkUploadDir=()=>globalThis.monthlyVideoFixture.root;';
  if (url.endsWith('/lib/cloudinary.ts')) source = 'export async function verifyCloudinaryVideo(id,usage){if(usage!=="hero")throw Error("Wrong limits");globalThis.monthlyVideoFixture.verifications++;const media=globalThis.monthlyVideoFixture.resources.get(id);if(!media)throw Error("Resource missing");return media;}';
  return source ? { format: 'module', source, shortCircuit: true } : nextLoad(url, context);
} });

try {
  await fs.writeFile(path.join(root, imageName), 'isolated image fixture');
  const products = [{ slug: 'unchanged', price: 500 }];
  await fs.writeFile(websiteFile, JSON.stringify({ version: 1, menu: { products, background: { image, opacity: 1, position: 'auto', fit: 'cover' } }, unrelated: { keep: true } }));
  const { GET, PUT } = await import('../app/api/admin/monthly-menu/route.ts');
  assert.equal((await (await GET()).json()).background.image, image);
  const save = async background => {
    const response = await PUT(new Request('http://localhost/api/admin/monthly-menu', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ background: { opacity: 1, position: 'auto', fit: 'cover', ...background } }) }));
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.deepEqual((await (await GET()).json()).background, saved.background);
    const disk = JSON.parse(await fs.readFile(websiteFile, 'utf8'));
    assert.deepEqual(disk.menu.products, products);
    assert.deepEqual(disk.unrelated, { keep: true });
    return saved.background;
  };
  assert.equal((await save({ image })).image, image);
  // Tampered delivery metadata must be replaced by canonical server verification.
  assert.deepEqual((await save({ media: { ...first, url: 'https://res.cloudinary.com/tampered.mp4', posterUrl: 'https://untrusted.example/poster.jpg' } })).media, first);
  assert.equal((await save({ image })).media, undefined);
  await save({ media: first });
  assert.deepEqual((await save({ media: second })).media, second);
  assert.equal(globalThis.monthlyVideoFixture.verifications, 3);
  const invalid = await PUT(new Request('http://localhost/api/admin/monthly-menu', { method: 'PUT', body: JSON.stringify({ background: { opacity: 1, position: 'auto', fit: 'cover', media: { ...first, publicId: '../invalid' } } }) }));
  assert.equal(invalid.status, 400);
  globalThis.monthlyVideoFixture.authenticated = false;
  assert.equal((await GET()).status, 401);
  assert.equal((await PUT(new Request('http://localhost'))).status, 401);
  console.log('Monthly Menu API: A–G save/reload, canonical video metadata, unrelated-data preservation, validation/auth PASS (isolated fixtures; Cloudinary mocked)');
} finally {
  await fs.rm(root, { recursive: true, force: true });
  delete globalThis.monthlyVideoFixture;
}
