import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { spawn, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const qa = path.resolve(process.env.CS1_QA_OUTPUT || 'qa-output/cs1');
assert.ok(qa.startsWith(path.resolve('qa-output') + path.sep), 'QA output must stay inside this worktree');
await fs.mkdir(qa, { recursive: true });
const fixtureRoot = path.resolve('qa-output/cs1');
await fs.mkdir(fixtureRoot, { recursive: true });
const dataRoot = await fs.mkdtemp(path.join(fixtureRoot, 'browser-data-'));
const port = Number(process.env.CS1_QA_PORT || 3317), origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, KD_DATA_DIR: dataRoot, AUTH_SESSION_SECRET: crypto.randomBytes(48).toString('hex'), ADMIN_SESSION_SECRET: crypto.randomBytes(48).toString('hex'), NEXT_TELEMETRY_DISABLED: '1' };
for (const key of Object.keys(env)) if (/^(RAILWAY_|LINE_|GMAIL_|GOOGLE_|SMTP_|CLOUDINARY_)/.test(key)) delete env[key];
execFileSync(process.execPath, ['--experimental-strip-types', '--import', './scripts/member-auth-test-bootstrap.mjs', 'scripts/customer-service-qa-fixture.mts'], { cwd: process.cwd(), env, stdio: 'pipe' });
const chromeRoot = process.env.CS1_CHROME_RUNTIME && path.resolve(process.env.CS1_CHROME_RUNTIME);
if (chromeRoot) {
  assert.ok(chromeRoot.startsWith(path.resolve('qa-output') + path.sep), 'Chrome snapshot must be worktree-local');
  for (const name of ['assets.json', 'homepage.json']) await fs.copyFile(path.join(chromeRoot, 'store', name), path.join(dataRoot, 'store', name));
  const manifest = JSON.parse(await fs.readFile(path.join(chromeRoot, 'chrome-source-manifest.json'), 'utf8'));
  for (const asset of manifest.media) {
    const relative = new URL(asset.source).pathname.slice(1), target = path.join(dataRoot, relative);
    assert.ok(path.resolve(target).startsWith(dataRoot + path.sep));
    await fs.mkdir(path.dirname(target), { recursive: true }); await fs.copyFile(path.join(chromeRoot, relative), target);
  }
}
// The existing public coffee environment is an image, not a commerce fixture.
const heroImage = 'kd-coffee-choose-coffee-by-flavor-v01.webp';
const heroSource = chromeRoot ? path.join(chromeRoot, 'uploads/home003', heroImage) : path.resolve('qa-output/cs1b-runtime/uploads/home003', heroImage);
await fs.copyFile(heroSource, path.join(dataRoot, 'uploads/home003', heroImage));
const sessions = JSON.parse(await fs.readFile(path.join(dataRoot, 'qa-sessions.json'), 'utf8'));
const { chromium } = await import(pathToFileURL(path.join(fixtureRoot, 'tools/node_modules/playwright/index.mjs')).href);
const { default: AxeBuilder } = await import(pathToFileURL(path.join(fixtureRoot, 'tools/node_modules/@axe-core/playwright/dist/index.mjs')).href);
const log = await fs.open(path.join(qa, 'browser-server.log'), 'w');
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', process.env.CS1_SERVER_MODE || 'start', '-p', String(port), '-H', '127.0.0.1'], { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
server.stdout.on('data', data => log.write(data)); server.stderr.on('data', data => log.write(data));
const checks = [], errors = [], browserChecks = [], a11y = [], screenshots = [];
const cachePolicy = process.env.CS1_SERVER_MODE === 'dev' ? /no-cache/ : /private|no-store/;
async function test(name, run) { await run(); checks.push(name); console.log(`PASS ${checks.length} ${name}`); }
async function fingerprint(directory) {
  const result = {};
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name === 'customer-service' || entry.name === 'qa-sessions.json') continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else result[path.relative(directory, file)] = crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
    }
  }
  await walk(directory); return result;
}
let browser;
try {
  const until = Date.now() + 120000;
  while (true) {
    try { const response = await fetch(origin + '/customer-service'); if (response.ok) break; } catch { /* listener starting */ }
    if (server.exitCode !== null || Date.now() > until) throw new Error('QA server did not start: ' + await fs.readFile(path.join(qa, 'browser-server.log'), 'utf8'));
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  const protectedBefore = await fingerprint(dataRoot);
  const request = async (method, data, cookie = sessions.owner, extra = {}) => {
    const response = await fetch(origin + '/api/admin/customer-service', { method, headers: { ...(cookie ? { Cookie: `kd_admin_session=${cookie}` } : {}), ...(method === 'PUT' ? { Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' } : {}), ...extra }, ...(method === 'PUT' ? { body: typeof data === 'string' ? data : JSON.stringify(data) } : {}) });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(`Expected JSON from Admin API, received HTTP ${response.status}`);
    return { status: response.status, body: await response.json(), headers: response.headers };
  };
  await test('public SSR route returns 200 with Hero, quick services, FAQ and canonical metadata', async () => {
    const response = await fetch(origin + '/customer-service'), html = await response.text();
    assert.equal(response.status, 200); for (const text of ['客服中心', 'CUSTOMER SERVICE', '讓我們為你指引', '常見問題', '想和我們聊聊？']) assert.ok(html.includes(text));
    assert.match(html, /https:\/\/www.kdcoffee1962.com\/customer-service/); assert.ok(!html.includes('MUST_NOT_LEAK_TO_BROWSER'));
    assert.match(response.headers.get('cache-control') || '', cachePolicy);
  });
  let state;
  await test('Admin API denies guest and non-owner; owner GET is no-store and performs no writes', async () => {
    assert.equal((await request('GET', null, '')).status, 401); assert.equal((await request('GET', null, sessions.admin)).status, 403);
    const result = await request('GET'); assert.equal(result.status, 200); assert.match(result.headers.get('cache-control'), /no-store/); state = result.body;
    await assert.rejects(fs.stat(path.join(dataRoot, 'customer-service')), { code: 'ENOENT' });
    assert.equal((await request('PUT', state, '')).status, 401); assert.equal((await request('PUT', state, sessions.admin)).status, 403);
  });
  await test('Admin writes require same-origin and explicit Origin', async () => {
    assert.equal((await request('PUT', { revision: state.revision, document: state.document }, sessions.owner, { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await request('PUT', { revision: state.revision, document: state.document }, sessions.owner, { Origin: '' })).status, 403);
  });
  await test('Admin rejects unsafe links, HTML, policy copies, invalid JSON and oversized input', async () => {
    const doc = structuredClone(state.document); doc.cards[0].link = 'javascript:alert(1)';
    assert.equal((await request('PUT', { revision: 0, document: doc })).status, 400);
    doc.cards[0].link = '/member#orders'; doc.config.title = '<script>alert(1)</script>';
    assert.equal((await request('PUT', { revision: 0, document: doc })).status, 400);
    doc.config.title = '客服中心'; doc.faqs.find(item => item.source === 'kd').answer = 'new policy';
    assert.equal((await request('PUT', { revision: 0, document: doc })).status, 400);
    assert.equal((await request('PUT', '{invalid')).status, 400);
    assert.equal((await request('PUT', '{}', sessions.owner, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await request('PUT', 'x'.repeat(1024 * 1024 + 10))).status, 413);
  });
  browser = await chromium.launch({ headless: true, executablePath: process.env.CS1_BROWSER || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (new URL(page.url()).pathname === '/customer-service' && ['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  const pageTop = async () => {
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }); });
    await page.waitForFunction(() => window.scrollY === 0);
  };
  const sectionScreenshot = async (selector, file) => {
    await pageTop();
    const clip = await page.locator(selector).evaluate(element => {
      const box = element.getBoundingClientRect();
      return { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height };
    });
    await page.screenshot({ path: file, fullPage: true, clip, caret: 'initial' });
  };
  await page.goto(origin + '/customer-service'); await page.locator('#service-search').waitFor();
  await test('production chrome snapshot and coffee image render through the original shared components', async () => {
    if (chromeRoot) {
      const manifest = JSON.parse(await fs.readFile(path.join(chromeRoot, 'chrome-source-manifest.json'), 'utf8'));
      assert.deepEqual(await page.locator('.desktop-navigation a').allTextContents(), manifest.navigation.map(item => item.label));
      assert.equal(await page.locator('header.v2-header .brand img').getAttribute('src'), new URL(manifest.media[0].source).pathname);
      assert.equal(await page.locator('header.v2-header .brand img').evaluate(element => getComputedStyle(element).filter), 'none');
    }
    await page.getByAltText('KD Coffee 咖啡風味品飲情境').waitFor();
    await page.waitForFunction(() => { const image = document.querySelector('#service-main figure img'); return image?.complete && image.naturalWidth > 0; });
  });
  const triggers = () => page.locator('[data-faq-trigger]');
  await test('logged-out recent orders shows a login entry and no private order data', async () => {
    await page.locator('#recent-orders').getByRole('link', { name: '登入會員' }).waitFor(); assert.equal(await page.locator('#recent-orders article').count(), 0);
  });
  const questions = () => triggers().locator('> span:nth-child(2)').allTextContents();
  const categoryButton = name => page.getByRole('group', { name: '選擇問題分類' }).getByRole('button', { name, exact: true });
  const expectedQuestions = category => state.document.faqs.filter(item => item.enabled && (category === 'all' || item.category === category)).sort((a, b) => a.sortOrder - b.sortOrder).map(item => item.question);
  await test('FAQ defaults to six CMS-ordered featured questions with every answer closed', async () => {
    assert.deepEqual(await questions(), expectedQuestions('all').slice(0, 6));
    assert.equal(await categoryButton('熱門問題').getAttribute('aria-pressed'), 'true');
    assert.ok((await page.locator('#service-faq-results [role=status]').innerText()).includes('熱門問題'));
    assert.equal(await page.locator('[data-faq-trigger][aria-expanded=true]').count(), 0);
    assert.ok(!(await page.getByRole('group', { name: '選擇問題分類' }).innerText()).includes('↗'));
    const file = path.join(qa, 'faq-default-1440.png'); await sectionScreenshot('#faq', file); screenshots.push(file);
  });
  await test('every desktop category changes selection, exact question set, label and count', async () => {
    for (const [id, label] of [['orders', '訂單與付款'], ['delivery', '配送與取貨'], ['cancellation', '取消與退貨'], ['account', '會員帳號'], ['kd', 'KD 點數／抵用金'], ['subscription', '定期配送'], ['coffee', 'Coffee'], ['store', 'Store'], ['gifts', 'Gifts'], ['other', '其他問題']]) {
      await categoryButton(label).click(); const expected = expectedQuestions(id);
      assert.deepEqual(await questions(), expected);
      assert.equal(await categoryButton(label).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('[aria-pressed=true]').filter({ hasText: label }).count(), 1);
      const status = await page.locator('#service-faq-results [role=status]').innerText();
      assert.ok(status.includes(label)); assert.ok(status.includes('/ ' + expected.length + ' 則'));
      assert.equal(await categoryButton(label).locator('[aria-hidden=true]').innerText(), String(expected.length));
    }
  });
  await test('search stays in the selected category and clearing restores that category', async () => {
    await categoryButton('KD 點數／抵用金').click();
    const file = path.join(qa, 'faq-selected-category-1440.png'); await sectionScreenshot('#faq', file); screenshots.push(file);
    await page.getByLabel('想了解什麼？').fill('ATM'); assert.equal(await triggers().count(), 0);
    assert.equal(await categoryButton('KD 點數／抵用金').getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: '清除搜尋', exact: true }).click();
    assert.deepEqual(await questions(), expectedQuestions('kd'));
    await page.getByLabel('想了解什麼？').fill('抵用金如何使用'); assert.deepEqual(await questions(), ['抵用金如何使用？']);
    await page.getByRole('button', { name: '清除搜尋', exact: true }).click(); assert.deepEqual(await questions(), expectedQuestions('kd'));
    await categoryButton('訂單與付款').click(); await page.getByLabel('想了解什麼？').fill('ATM'); assert.deepEqual(await questions(), expectedQuestions('orders'));
    await page.getByRole('button', { name: '清除搜尋', exact: true }).click();
  });
  await test('direct FAQ links initialize the matching category and progressive all view', async () => {
    await page.goto(origin + '/customer-service#faq-kd');
    await page.waitForFunction(() => document.querySelectorAll('[data-faq-trigger]').length === 2);
    assert.deepEqual(await questions(), expectedQuestions('kd'));
    assert.equal(await categoryButton('KD 點數／抵用金').getAttribute('aria-pressed'), 'true');
    await page.goto(origin + '/customer-service#faq-all');
    await page.waitForFunction(() => document.querySelectorAll('[data-faq-trigger]').length === 8);
    assert.equal(await categoryButton('全部問題').getAttribute('aria-pressed'), 'true');
  });
  await test('all questions require explicit selection and reveal eight at a time with keyboard focus', async () => {
    await categoryButton('全部問題').click(); assert.equal(await triggers().count(), 8);
    assert.equal(await page.locator('[data-faq-trigger][aria-expanded=true]').count(), 0);
    assert.ok((await page.locator('#service-faq-results [role=status]').innerText()).includes('/ 12 則'));
    await page.getByRole('button', { name: /顯示更多/ }).focus(); await page.getByRole('button', { name: /顯示更多/ }).press('Enter');
    assert.deepEqual(await questions(), expectedQuestions('all'));
    await page.waitForFunction(() => document.querySelectorAll('[data-faq-trigger]')[8] === document.activeElement);
    assert.equal(await triggers().nth(8).evaluate(element => element === document.activeElement), true);
    assert.equal(await page.locator('[data-faq-trigger][aria-expanded=true]').count(), 0);
    assert.equal(await page.getByRole('button', { name: /顯示更多/ }).count(), 0);
    await categoryButton('熱門問題').click(); assert.equal(await triggers().count(), 6);
  });
  await test('desktop category controls work with Space and Enter and close previous answers', async () => {
    await triggers().first().click();
    await categoryButton('訂單與付款').focus(); await categoryButton('訂單與付款').press('Space');
    assert.deepEqual(await questions(), expectedQuestions('orders'));
    assert.equal(await page.locator('[data-faq-trigger][aria-expanded=true]').count(), 0);
    await categoryButton('KD 點數／抵用金').focus(); await categoryButton('KD 點數／抵用金').press('Enter');
    assert.deepEqual(await questions(), expectedQuestions('kd'));
    await categoryButton('熱門問題').click();
  });
  await test('search matches question, keyword and answer text, and clear restores results', async () => {
    for (const [query, expected] of [['風味', '怎麼查看咖啡規格、風味與客製烘焙選項？'], ['ATM', '在哪裡查看訂單與付款資訊？'], ['安全等待期', '為什麼回饋顯示待入帳？']]) {
      await page.getByLabel('想了解什麼？').fill(query); await page.getByRole('button', { name: new RegExp(expected.replace(/[？]/g, '')) }).waitFor();
    }
    await page.getByRole('button', { name: '清除搜尋', exact: true }).click(); assert.equal(await triggers().count(), 6);
  });
  await test('desktop category filtering and quick-service FAQ anchor work', async () => {
    await page.getByRole('button', { name: '配送與取貨', exact: true }).click(); assert.equal(await triggers().count(), 1);
    await page.locator('a').filter({ has: page.getByRole('heading', { name: '訂單取消', exact: true }) }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-faq-trigger]').length === 2); assert.ok(page.url().endsWith('#faq-cancellation'));
    await categoryButton('訂單與付款').click(); assert.deepEqual(await questions(), expectedQuestions('orders'));
    await page.locator('#quick-services a').filter({ has: page.getByRole('heading', { name: '訂單取消', exact: true }) }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-faq-trigger]').length === 2);
    assert.deepEqual(await questions(), expectedQuestions('cancellation'));
    assert.equal(await categoryButton('取消與退貨').getAttribute('aria-pressed'), 'true');
    await page.goBack(); await page.waitForFunction(() => document.querySelectorAll('[data-faq-trigger]').length === 1);
    assert.deepEqual(await questions(), expectedQuestions('orders'));
    await page.goForward(); await page.waitForFunction(() => document.querySelectorAll('[data-faq-trigger]').length === 2);
    assert.deepEqual(await questions(), expectedQuestions('cancellation'));
  });
  await test('accordion toggles with pointer/keyboard and supports arrow/Home/End navigation', async () => {
    await triggers().first().click(); assert.equal(await triggers().first().getAttribute('aria-expanded'), 'true');
    await triggers().first().press('Space'); assert.equal(await triggers().first().getAttribute('aria-expanded'), 'false');
    await triggers().first().press('ArrowDown'); assert.equal(await triggers().nth(1).evaluate(element => element === document.activeElement), true);
    await triggers().nth(1).press('Home'); assert.equal(await triggers().first().evaluate(element => element === document.activeElement), true);
    await triggers().first().press('End'); assert.equal(await triggers().nth(1).evaluate(element => element === document.activeElement), true);
  });
  await test('empty search result provides reset and contact actions', async () => {
    await page.getByLabel('想了解什麼？').fill('no-result-432100'); await page.getByRole('heading', { name: '還沒找到你想問的？' }).waitFor(); assert.equal(await triggers().count(), 0);
    await page.getByRole('button', { name: '清除搜尋條件', exact: true }).click(); assert.equal(await triggers().count(), 2);
    assert.equal(await categoryButton('取消與退貨').getAttribute('aria-pressed'), 'true');
  });
  await test('responsive sizes have no overflow, accessible controls and desktop/tablet/mobile screenshots', async () => {
    for (const width of [360, 390, 430, 768, 1280, 1440, 1600]) {
      await page.setViewportSize({ width, height: width < 640 ? 844 : 1000 }); await page.goto(origin + '/customer-service', { waitUntil: 'networkidle' });
      const measured = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
      assert.ok(measured.content <= measured.viewport, JSON.stringify({ width, ...measured })); browserChecks.push({ width, ...measured });
      const grid = await page.locator('#quick-services > div').last().evaluate(element => {
        const cards = Array.from(element.children), rows = new Map();
        cards.forEach(card => { const y = Math.round(card.getBoundingClientRect().top); rows.set(y, (rows.get(y) || 0) + 1); });
        return [...rows.values()];
      });
      assert.ok(grid.every(count => count === (width >= 1080 ? 5 : 2)), `Balanced ten-service grid at ${width}: ${grid}`);
      if ([390, 768, 1440].includes(width)) {
        const heroHeight = await page.locator('#service-main > header').evaluate(element => element.getBoundingClientRect().height);
        if (width === 390) assert.ok(heroHeight < 540, `Compact mobile Hero: ${heroHeight}`);
        for (const [name, selector] of [['hero', '#service-main > header'], ['quick-services', '#quick-services'], ['faq', '#faq'], ['recent-orders', '#recent-orders'], ['contact', '#contact'], ['keep-exploring', '#keep-exploring'], ['header', 'header.v2-header']]) {
          const closeup = path.join(qa, `${name}-${width}.png`); await sectionScreenshot(selector, closeup); screenshots.push(closeup);
        }
      }
      await pageTop();
      const name = `customer-service-${width}.png`, file = path.join(qa, name); await page.screenshot({ path: file, fullPage: true, caret: 'initial' }); screenshots.push(file);
      if ([390, 768, 1440].includes(width)) {
        const report = await new AxeBuilder({ page }).include('#service-main').include('#service-location').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        a11y.push({ width, violations: report.violations }); assert.deepEqual(report.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => node.target) })), []);
      }
    }
  });
  await test('mobile category selector, anchor filtering, search and accordion work', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(origin + '/customer-service');
    assert.equal(await page.getByLabel('問題分類', { exact: true }).inputValue(), 'featured'); assert.equal(await triggers().count(), 6);
    const dropdown = path.join(qa, 'faq-mobile-dropdown-390.png'); await sectionScreenshot('#faq', dropdown); screenshots.push(dropdown);
    for (const [id, label] of [['orders', '訂單與付款'], ['delivery', '配送與取貨'], ['cancellation', '取消與退貨'], ['account', '會員帳號'], ['kd', 'KD 點數／抵用金'], ['subscription', '定期配送'], ['coffee', 'Coffee'], ['store', 'Store'], ['gifts', 'Gifts'], ['other', '其他問題']]) {
      await page.getByLabel('問題分類', { exact: true }).selectOption(id);
      assert.deepEqual(await questions(), expectedQuestions(id)); assert.equal(await page.getByLabel('問題分類', { exact: true }).inputValue(), id);
      assert.ok((await page.locator('#service-faq-results [role=status]').innerText()).includes(label));
    }
    await page.getByLabel('問題分類', { exact: true }).selectOption('kd'); assert.equal(await triggers().count(), 2);
    const selected = path.join(qa, 'faq-selected-category-390.png'); await sectionScreenshot('#faq', selected); screenshots.push(selected);
    await triggers().first().click(); assert.equal(await triggers().first().getAttribute('aria-expanded'), 'true');
    await page.getByLabel('想了解什麼？').fill('ATM'); assert.equal(await triggers().count(), 0);
    assert.equal(await page.getByLabel('問題分類', { exact: true }).inputValue(), 'kd');
    await page.getByRole('button', { name: '清除搜尋', exact: true }).click(); assert.deepEqual(await questions(), expectedQuestions('kd'));
    await page.getByLabel('問題分類', { exact: true }).selectOption('all'); assert.equal(await triggers().count(), 8);
    await page.getByRole('button', { name: /顯示更多/ }).click(); assert.equal(await triggers().count(), 12);
    await page.getByLabel('問題分類', { exact: true }).selectOption('featured'); assert.equal(await triggers().count(), 6);
  });
  await test('expanded long FAQ answers stay readable without overflow on mobile', async () => {
    await page.getByLabel('想了解什麼？').fill(''); await page.getByLabel('問題分類', { exact: true }).selectOption('delivery');
    await triggers().first().click();
    assert.equal(await triggers().first().getAttribute('aria-expanded'), 'true');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const file = path.join(qa, 'faq-expanded-390.png'); await sectionScreenshot('#faq', file); screenshots.push(file);
  });
  await test('refined SVG badges and editorial exploration preserve the original service destinations', async () => {
    const badges = await page.locator('#quick-services a > span > span:first-child').evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect(), svg = element.querySelector('svg');
      return { width: box.width, height: box.height, stroke: svg?.getAttribute('stroke-width'), linecap: svg?.getAttribute('stroke-linecap'), hidden: svg?.getAttribute('aria-hidden') };
    }));
    assert.equal(badges.length, 10); assert.ok(badges.every(item => item.width >= 40 && item.width <= 48 && item.height === item.width && item.stroke === '1.65' && item.linecap === 'round' && item.hidden === 'true'));
    assert.equal(await page.locator('#quick-services img, #contact img, #keep-exploring img').count(), 0);
    assert.deepEqual(await page.locator('#keep-exploring nav').first().locator('a').evaluateAll(elements => elements.map(a => a.getAttribute('href'))), ['/works', '/monthly-menu', '/store', '/gifts']);
    assert.deepEqual(await page.locator('#keep-exploring nav').last().locator('a').evaluateAll(elements => elements.map(a => a.getAttribute('href'))), ['/member', '/member#rewards', '/member#subscription', '#service-location']);
    const rows = await page.locator('#keep-exploring nav').first().locator('a').evaluateAll(elements => elements.map(a => Math.round(a.getBoundingClientRect().top)));
    assert.equal(rows[0], rows[1]); assert.equal(rows[2], rows[3]); assert.ok(rows[2] > rows[0]);
  });
  await test('a 52-question CMS fixture stays progressive, searchable and keyboard usable', async () => {
    const initial = (await request('GET')).body, large = structuredClone(initial.document);
    for (let index = 0; index < 40; index++) large.faqs.push({ id: 'qa-more-' + index, category: 'other', question: 'QA 額外問題 ' + index + '？', answer: '僅供本機長列表 UI 驗證，不是客服政策。', source: 'editorial', keywords: ['QA'], ctaLabel: '', ctaHref: '', enabled: true, sortOrder: 200 + index });
    assert.equal((await request('PUT', { revision: initial.revision, document: large })).status, 200);
    try {
      await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(origin + '/customer-service');
      assert.equal(await triggers().count(), 6); await categoryButton('全部問題').click(); assert.equal(await triggers().count(), 8);
      for (const count of [16, 24, 32, 40, 48, 52]) {
        await page.getByRole('button', { name: /顯示更多/ }).focus(); await page.getByRole('button', { name: /顯示更多/ }).press('Enter'); assert.equal(await triggers().count(), count);
      }
      assert.equal(await page.getByRole('button', { name: /顯示更多/ }).count(), 0);
      assert.equal(await page.locator('[data-faq-trigger][aria-expanded=true]').count(), 0);
      await triggers().first().focus(); await triggers().first().press('End'); assert.equal(await triggers().last().evaluate(element => element === document.activeElement), true);
      await triggers().last().press('Home'); assert.equal(await triggers().first().evaluate(element => element === document.activeElement), true);
      await categoryButton('其他問題').click(); assert.equal(await triggers().count(), 8);
      await page.getByLabel('想了解什麼？').fill('QA 額外問題 39'); assert.deepEqual(await questions(), ['QA 額外問題 39？']);
      await page.getByRole('button', { name: '清除搜尋', exact: true }).click(); assert.equal(await triggers().count(), 8);
      assert.equal(await categoryButton('其他問題').getAttribute('aria-pressed'), 'true');
      const adminContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      try {
        await adminContext.addCookies([{ name: 'kd_admin_session', value: sessions.owner, url: origin }]);
        const admin = await adminContext.newPage(); admin.on('pageerror', error => errors.push(error.message));
        await admin.goto(origin + '/admin/customer-service'); await admin.getByRole('tab', { name: /FAQ/ }).click();
        assert.equal(await admin.locator('article').count(), 20); assert.equal(await admin.locator('[data-service-editor=faq]').count(), 0);
        await admin.getByRole('button', { name: '下一頁', exact: true }).click(); assert.equal(await admin.locator('article').count(), 20);
        await admin.getByRole('button', { name: '下一頁', exact: true }).click(); assert.equal(await admin.locator('article').count(), 12);
        await admin.getByLabel('搜尋問題、關鍵字', { exact: true }).fill('QA 額外問題 39'); assert.equal(await admin.locator('article').count(), 1);
        await admin.getByRole('button', { name: '編輯QA 額外問題 39？', exact: true }).click(); assert.equal(await admin.locator('[data-service-editor=faq]').count(), 1);
        assert.ok(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight < 6500));
      } finally { await adminContext.close(); }
    } finally {
      const current = (await request('GET')).body;
      assert.equal((await request('PUT', { revision: current.revision, document: initial.document })).status, 200);
      state = (await request('GET')).body;
    }
  });
  await context.addCookies([{ name: 'kd_member_session', value: sessions.member, url: origin }]);
  await test('logged-in page returns only own latest three orders with canonical statuses and methods', async () => {
    await page.goto(origin + '/customer-service'); const orders = page.locator('#recent-orders'); await orders.getByRole('link', { name: '查看訂單' }).first().waitFor();
    assert.equal(await orders.locator('article').count(), 3);
    const text = await orders.innerText(); for (const id of ['000004', '000003', '000002']) assert.ok(text.includes(id));
    for (const id of ['000005', '000001']) assert.ok(!text.includes(id));
    assert.ok(text.includes('工作室自取')); assert.ok(text.includes('宅配')); assert.ok(text.includes('7-ELEVEN')); assert.ok(text.includes('可以取貨'));
    const html = await page.content(); assert.ok(!html.includes('MUST_NOT_LEAK_TO_BROWSER')); assert.ok(!html.includes('private-not-for-client'));
    const file = path.join(qa, 'customer-service-member-390.png'); await page.screenshot({ path: file, fullPage: true, caret: 'initial' }); screenshots.push(file);
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(origin + '/customer-service', { waitUntil: 'networkidle' });
    const desktop = path.join(qa, 'customer-service-member-1440.png'); await page.screenshot({ path: desktop, fullPage: true, caret: 'initial' }); screenshots.push(desktop);
  });
  await test('member responses are private and a subsequent guest sees no order numbers', async () => {
    const response = await fetch(origin + '/customer-service', { headers: { Cookie: `kd_member_session=${sessions.member}` } }); const html = await response.text();
    assert.ok(html.includes('KD20261027-000004')); assert.ok(!html.includes('KD20261027-000005')); assert.match(response.headers.get('cache-control'), cachePolicy);
    const guest = await (await fetch(origin + '/customer-service')).text(); assert.ok(!guest.includes('KD20261027-000004'));
  });
  await context.addCookies([{ name: 'kd_admin_session', value: sessions.owner, url: origin }]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const adminTab = name => page.getByRole('tab', { name, exact: true });
  const saveAdmin = async () => { await page.getByRole('button', { name: '儲存客服內容', exact: true }).click(); await page.getByRole('status').filter({ hasText: '客服內容已儲存' }).waitFor(); };
  const adminShot = async name => { await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); }); const clip = await page.locator('main.admin-page').evaluate(element => { const box = element.getBoundingClientRect(); return { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height }; }); const file = path.join(qa, name); await page.screenshot({ path: file, fullPage: true, clip, caret: 'initial' }); screenshots.push(file); await pageTop(); };
  const adminDetailShot = async (selector, name) => {
    await page.locator(selector).evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    const clip = await page.locator(selector).evaluate(element => { const box = element.getBoundingClientRect(); return { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height }; });
    const file = path.join(qa, name); await page.screenshot({ path: file, fullPage: true, clip, caret: 'initial' }); screenshots.push(file);
  };
  await test('Admin sections expose one focused panel and preserve unsaved drafts across navigation', async () => {
    await page.goto(origin + '/admin/customer-service');
    assert.equal(await page.getByRole('tabpanel').count(), 1);
    assert.equal(await page.getByRole('heading', { name: '頁面與 Hero', exact: true }).count(), 1);
    await page.getByLabel('頁面標題', { exact: true }).fill('尚未儲存的導覽草稿');
    await adminTab('預覽 / 狀態').click(); assert.ok((await page.getByRole('tabpanel').innerText()).includes('有未儲存變更'));
    await adminTab('頁面 / Hero').click(); assert.equal(await page.getByLabel('頁面標題', { exact: true }).inputValue(), '尚未儲存的導覽草稿');
    await page.reload();
    await adminShot('admin-page-hero-1440.png');
    await adminDetailShot('figure[aria-label="Hero 桌機預覽"]', 'hero-desktop-preview.png');
    await adminDetailShot('figure[aria-label="Hero 手機預覽"]', 'hero-mobile-preview.png');
    await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await adminShot('admin-page-hero-390.png'); await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await test('Admin FAQ is collapsed, single-editor, searchable and category filtered', async () => {
    await page.getByRole('tab', { name: /FAQ/ }).click(); assert.equal(await page.locator('[data-service-editor=faq]').count(), 0);
    const editButtons = page.getByRole('button', { name: /^編輯/ }); const first = editButtons.first(); await first.click(); assert.equal(await page.locator('[data-service-editor=faq]').count(), 1);
    assert.equal(await page.getByLabel('回答', { exact: true }).getAttribute('readonly'), '');
    await editButtons.first().click(); assert.equal(await page.locator('[data-service-editor=faq]').count(), 1);
    await page.getByLabel('搜尋問題、關鍵字', { exact: true }).fill('ATM'); assert.equal(await page.locator('article').count(), 1);
    await page.getByLabel('搜尋問題、關鍵字', { exact: true }).fill(''); await page.getByLabel('篩選 FAQ 分類', { exact: true }).selectOption('kd'); assert.equal(await page.locator('article').count(), 2);
    await page.getByLabel('搜尋問題、關鍵字', { exact: true }).fill('ATM'); assert.equal(await page.locator('article').count(), 0);
    await page.getByLabel('搜尋問題、關鍵字', { exact: true }).fill(''); await page.getByLabel('篩選 FAQ 分類', { exact: true }).selectOption('all');
    await page.reload(); await page.getByRole('tab', { name: /FAQ/ }).click();
    await adminShot('admin-faq-collapsed-1440.png');
    await page.getByRole('button', { name: '編輯如何登入或更新會員資料？', exact: true }).click(); await adminShot('admin-faq-edit-1440.png');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight < 6500));
    await adminShot('admin-faq-edit-390.png');
    await page.reload(); await page.getByRole('tab', { name: /FAQ/ }).click(); await adminShot('admin-faq-collapsed-390.png');
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await test('Admin compact Quick Services, tabs and mobile save controls remain usable', async () => {
    await page.getByRole('tab', { name: /快速服務/ }).click(); assert.equal(await page.locator('[data-service-editor=card]').count(), 0);
    await adminShot('admin-quick-services-1440.png');
    await page.getByRole('button', { name: '編輯我的訂單', exact: true }).click(); assert.equal(await page.locator('[data-service-editor=card]').count(), 1);
    await page.getByRole('button', { name: '編輯配送與取貨', exact: true }).click(); assert.equal(await page.locator('[data-service-editor=card]').count(), 1);
    await adminTab('頁面 / Hero').click(); await adminTab('頁面 / Hero').press('ArrowRight'); assert.equal(await page.getByRole('tab', { name: /快速服務/ }).getAttribute('aria-selected'), 'true');
    await page.setViewportSize({ width: 390, height: 844 }); await adminShot('admin-quick-services-390.png');
    assert.ok(await page.getByRole('button', { name: '儲存客服內容', exact: true }).evaluate(element => element.getBoundingClientRect().height >= 44));
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.reload();
  });
  await test('Owner CMS UI saves contact config, FAQ add/edit/disable, card config and ordering', async () => {
    await page.goto(origin + '/admin/customer-service'); await page.getByRole('heading', { name: '客服中心內容', exact: true }).waitFor();
    await page.getByRole('tab', { name: '聯絡方式', exact: true }).click();
    await page.getByLabel('客服時間', { exact: true }).fill('週一至週五 10:00–17:00（QA 測試）');
    await page.getByLabel('客服 Email', { exact: true }).fill('cs1@example.test');
    await page.getByRole('tab', { name: /快速服務/ }).click();
    await page.getByRole('button', { name: '編輯我的訂單', exact: true }).click();
    await page.getByLabel('服務標題', { exact: true }).fill('我的訂單查詢');
    await page.getByRole('button', { name: '下移我的訂單查詢', exact: true }).click();
    await page.getByRole('tab', { name: /FAQ/ }).click();
    await page.getByRole('button', { name: '新增問題', exact: true }).click();
    const newFaq = page.locator('fieldset:has(> legend)').last();
    await newFaq.getByLabel('問題', { exact: true }).fill('客服測試問題？'); await newFaq.getByLabel('回答', { exact: true }).fill('客服測試回答');
    await newFaq.getByLabel('關鍵字（以逗號分隔）', { exact: true }).fill('客服測試,QA'); await newFaq.getByLabel('啟用問題').check();
    await page.getByRole('button', { name: '儲存客服內容', exact: true }).click(); await page.getByRole('status').filter({ hasText: '客服內容已儲存' }).waitFor();
    await page.reload(); await page.getByRole('tab', { name: /FAQ/ }).click();
    await page.getByRole('button', { name: '編輯客服測試問題？', exact: true }).click();
    const added = page.locator('[data-service-editor=faq]');
    assert.equal(await added.getByLabel('回答', { exact: true }).inputValue(), '客服測試回答');
    await page.getByRole('button', { name: '上移客服測試問題？', exact: true }).click();
    await saveAdmin();
    const moved = [...(await request('GET')).body.document.faqs].sort((a, b) => a.sortOrder - b.sortOrder);
    assert.equal(moved.at(-2).question, '客服測試問題？');
    await page.getByRole('button', { name: '下移客服測試問題？', exact: true }).click();
    await added.getByLabel('回答', { exact: true }).fill('已更新的客服測試回答'); await added.getByLabel('啟用問題').uncheck();
    await page.getByRole('button', { name: '儲存客服內容', exact: true }).click(); await page.getByRole('status').filter({ hasText: '客服內容已儲存' }).waitFor();
    const saved = (await request('GET')).body; assert.equal(saved.document.config.email, 'cs1@example.test');
    assert.equal([...saved.document.cards].sort((a, b) => a.sortOrder - b.sortOrder)[1].title, '我的訂單查詢');
    assert.equal(saved.document.faqs.at(-1).enabled, false); assert.equal(saved.document.faqs.at(-1).answer, '已更新的客服測試回答');
    const file = path.join(qa, 'customer-service-admin-1440.png'); await page.screenshot({ path: file, fullPage: true, caret: 'initial' }); screenshots.push(file);
    const desktopViewport = path.join(qa, 'customer-service-admin-viewport-1440.png'); await page.screenshot({ path: desktopViewport, caret: 'initial' }); screenshots.push(desktopViewport);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const mobileViewport = path.join(qa, 'customer-service-admin-viewport-390.png'); await page.screenshot({ path: mobileViewport, caret: 'initial' }); screenshots.push(mobileViewport);
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await test('Owner CMS UI deletes added FAQ and supports adding/deleting service cards', async () => {
    await page.getByRole('button', { name: '刪除客服測試問題？', exact: true }).click();
    await page.getByRole('tab', { name: /快速服務/ }).click();
    await page.getByRole('button', { name: '新增服務卡', exact: true }).click();
    const card = page.locator('[data-service-editor=card]');
    await card.getByLabel('服務標題', { exact: true }).fill('QA 服務卡'); await card.getByLabel('啟用服務卡').check();
    await page.getByRole('button', { name: '儲存客服內容', exact: true }).click(); await page.getByRole('status').filter({ hasText: '客服內容已儲存' }).waitFor();
    assert.ok((await request('GET')).body.document.cards.some(item => item.title === 'QA 服務卡'));
    await page.getByRole('button', { name: '刪除QA 服務卡', exact: true }).click(); await page.getByRole('button', { name: '儲存客服內容', exact: true }).click(); await page.getByRole('status').filter({ hasText: '客服內容已儲存' }).waitFor();
  });
  await test('CMS revision conflict preserves unsaved UI draft', async () => {
    await page.getByRole('tab', { name: '頁面 / Hero', exact: true }).click();
    const current = (await request('GET')).body, changed = structuredClone(current.document); changed.config.announcement = '平行視窗更新（測試）';
    assert.equal((await request('PUT', { revision: current.revision, document: changed })).status, 200);
    await page.getByLabel('頁面標題', { exact: true }).fill('尚未儲存的草稿'); await page.getByRole('button', { name: '儲存客服內容', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '內容已由另一個視窗更新' }).waitFor(); assert.equal(await page.getByLabel('頁面標題', { exact: true }).inputValue(), '尚未儲存的草稿');
  });
  await test('empty contact fields and disabled services/FAQs have graceful public states', async () => {
    const current = (await request('GET')).body;
    const doc = structuredClone(current.document); for (const key of ['line', 'facebook', 'email', 'phone', 'serviceHours', 'announcement']) doc.config[key] = '';
    doc.cards.forEach(item => { item.enabled = false; }); doc.faqs.forEach(item => { item.enabled = false; });
    assert.equal((await request('PUT', { revision: current.revision, document: doc })).status, 200);
    await page.goto(origin + '/customer-service'); await page.getByText('客服聯絡方式尚未公告。', { exact: true }).waitFor(); assert.equal(await triggers().count(), 0);
    await page.getByText('客服時間尚未公告，歡迎先透過以下管道留言。', { exact: true }).waitFor();
    const now = (await request('GET')).body; assert.equal((await request('PUT', { revision: now.revision, document: state.document })).status, 200);
  });
  await test('public linked entry routes and existing Gift/Store publication gates remain available', async () => {
    for (const route of ['/member', '/works', '/monthly-menu', '/store', '/gifts', '/orders/KD20261027-000004']) {
      const response = await fetch(origin + route); assert.equal(response.status, 200, route);
    }
    assert.equal((await fetch(origin + '/api/admin/store')).status, 401);
  });
  await test('recent order and CMS activity leaves all commerce, orders, fulfillment, identity and catalog bytes unchanged', async () => {
    assert.deepEqual(await fingerprint(dataRoot), protectedBefore);
  });
  const defaultHeroSrc = '/images/home003/kd-coffee-choose-coffee-by-flavor-v01.webp';
  const heroPreview = () => page.locator('figure[aria-label="Hero 桌機預覽"] img');
  const heroImage = async (format, color) => ({ name: 'cs1e-hero-' + color + '.' + format, mimeType: 'image/' + format, buffer: await sharp({ create: { width: 1600, height: 1200, channels: 3, background: color === 'a' ? '#8b6a49' : '#65745c' } }).toFormat(format).toBuffer() });
  const uploadHero = file => page.getByLabel('上傳新圖片', { exact: true }).setInputFiles(file);
  const libraryBeforeHero = JSON.parse(await fs.readFile(path.join(dataRoot, 'store/assets.json'), 'utf8'));
  const heroFiles = new Set();
  let uploadedA, uploadedB;
  await test('an existing public Asset Library image can be selected and saved without copying its bytes', async () => {
    const asset = libraryBeforeHero.assets.find(item => item.status === 'active' && /^\/uploads\/assets\/.*\.(jpe?g|png|webp)$/i.test(item.path));
    assert.ok(asset); const file = path.join(process.cwd(), 'public', asset.path.slice(1)), bytes = await fs.readFile(file);
    await page.goto(origin + '/admin/customer-service'); await page.getByRole('button', { name: '從素材庫選擇圖片', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '從素材庫選擇圖片', exact: true }); await picker.getByLabel('搜尋素材').fill(asset.name);
    await picker.getByRole('button').filter({ has: page.locator('img[src="' + asset.path + '"]') }).first().click();
    await saveAdmin(); assert.equal((await request('GET')).body.document.config.hero.src, asset.path);
    assert.deepEqual(await fs.readFile(file), bytes);
    const current = (await request('GET')).body; assert.equal((await request('PUT', { revision: current.revision, document: state.document })).status, 200);
  });
  await test('current Hero preview loads from CMS and upload blocks Save until canonical persistence completes', async () => {
    await page.goto(origin + '/admin/customer-service');
    assert.equal(await heroPreview().getAttribute('src'), defaultHeroSrc);
    assert.equal((await request('GET')).body.document.config.hero.src, defaultHeroSrc);
    await page.getByLabel('Hero 圖片 alt', { exact: true }).fill('尚未儲存的 Hero 草稿');
    let release; const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/admin/customer-service', async route => { await gate; await route.continue(); });
    await uploadHero(await heroImage('png', 'a'));
    await page.getByRole('button', { name: '上傳中…', exact: true }).waitFor();
    assert.ok(await page.getByRole('button', { name: '儲存客服內容', exact: true }).isDisabled());
    assert.equal(await heroPreview().getAttribute('src'), defaultHeroSrc);
    await adminShot('admin-hero-upload-pending.png');
    release(); await page.getByText('上傳成功', { exact: true }).waitFor(); await page.unroute('**/api/admin/customer-service');
    uploadedA = await heroPreview().getAttribute('src'); heroFiles.add(uploadedA.slice(1));
    assert.ok(uploadedA.startsWith('/uploads/assets/page-builder/')); assert.equal((await page.request.get(origin + uploadedA)).status(), 200);
    assert.equal((await request('GET')).body.document.config.hero.src, defaultHeroSrc);
  });
  await test('Hero alt and focal position save with the existing revision, then survive Admin reload', async () => {
    await page.getByLabel('Hero 圖片 alt', { exact: true }).fill('客服 Hero 測試圖片');
    await page.getByLabel('圖片裁切位置', { exact: true }).selectOption('top'); await saveAdmin();
    await page.reload(); assert.equal(await heroPreview().getAttribute('src'), uploadedA);
    assert.equal(await page.getByLabel('Hero 圖片 alt', { exact: true }).inputValue(), '客服 Hero 測試圖片');
    assert.equal(await page.getByLabel('圖片裁切位置', { exact: true }).inputValue(), 'top');
  });
  await test('a successful upload followed by a config conflict preserves the draft and a real existing asset', async () => {
    await uploadHero(await heroImage('webp', 'b')); await page.getByText('上傳成功', { exact: true }).waitFor();
    uploadedB = await heroPreview().getAttribute('src'); heroFiles.add(uploadedB.slice(1));
    const current = (await request('GET')).body, doc = structuredClone(current.document); doc.config.announcement = '平行 Hero 視窗更新（QA）';
    assert.equal((await request('PUT', { revision: current.revision, document: doc })).status, 200);
    await page.getByRole('button', { name: '儲存客服內容', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '內容已由另一個視窗更新' }).waitFor();
    assert.equal(await heroPreview().getAttribute('src'), uploadedB);
    assert.equal((await request('GET')).body.document.config.hero.src, uploadedA);
    assert.equal((await page.request.get(origin + uploadedB)).status(), 200);
    await page.reload();
  });
  await test('existing safe assets can be selected with the shared picker and saved as Hero', async () => {
    await page.getByRole('button', { name: '從素材庫選擇圖片', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '從素材庫選擇圖片', exact: true });
    await picker.getByLabel('搜尋素材').fill('cs1e-hero-b');
    const file = path.join(qa, 'admin-hero-asset-picker.png'); await page.screenshot({ path: file, caret: 'initial' }); screenshots.push(file);
    await picker.getByRole('button').filter({ hasText: 'cs1e-hero-b' }).click();
    assert.equal(await heroPreview().getAttribute('src'), uploadedB);
    assert.equal((await request('GET')).body.document.config.hero.src, uploadedA);
    await page.getByLabel('Hero 圖片 alt', { exact: true }).fill('客服 Hero 素材選擇測試');
    await saveAdmin(); await page.reload(); assert.equal(await heroPreview().getAttribute('src'), uploadedB);
  });
  await test('public Hero uses the saved asset and alt at desktop and mobile without changing FAQ behavior', async () => {
    const publicPage = await context.newPage(); publicPage.on('pageerror', error => errors.push(error.message));
    publicPage.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
    try {
      for (const width of [1440, 390]) {
        await publicPage.setViewportSize({ width, height: width === 390 ? 844 : 1000 }); await publicPage.goto(origin + '/customer-service', { waitUntil: 'networkidle' });
        const image = publicPage.getByAltText('客服 Hero 素材選擇測試', { exact: true });
        await image.evaluate(element => element.decode());
        const src = new URL(await image.getAttribute('src'), origin); assert.equal(src.searchParams.get('url') || src.pathname, uploadedB);
        assert.equal(await publicPage.locator('[data-faq-trigger]').count(), 6);
        assert.ok(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const file = path.join(qa, 'public-selected-hero-' + width + '.png'); await publicPage.screenshot({ path: file, fullPage: true, caret: 'initial' }); screenshots.push(file);
      }
    } finally { await publicPage.close(); }
  });
  await test('invalid Hero upload leaves saved config and the current draft selection unchanged', async () => {
    const current = (await request('GET')).body;
    await uploadHero({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
    await page.getByText(/^上傳失敗：/).waitFor(); assert.equal(await heroPreview().getAttribute('src'), uploadedB);
    assert.deepEqual((await request('GET')).body, current);
    await page.getByRole('button', { name: '使用原始圖片', exact: true }).click(); assert.equal(await heroPreview().getAttribute('src'), defaultHeroSrc);
    await page.getByRole('button', { name: '回復已儲存圖片', exact: true }).click(); assert.equal(await heroPreview().getAttribute('src'), uploadedB);
  });
  await test('missing stored Hero files fall back safely without modifying CMS on public GET', async () => {
    const assetFile = path.join(dataRoot, uploadedB.slice(1)), bytes = await fs.readFile(assetFile), current = (await request('GET')).body;
    await fs.unlink(assetFile);
    try {
      const html = await (await fetch(origin + '/customer-service')).text(); assert.ok(html.includes(defaultHeroSrc)); assert.deepEqual((await request('GET')).body, current);
    } finally { await fs.writeFile(assetFile, bytes); }
  });
  await test('Admin media, FAQ edit and compact mobile sections pass accessibility checks', async () => {
    await page.reload();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      for (const tab of ['頁面 / Hero', /FAQ/, /快速服務/, '聯絡方式', '預覽 / 狀態']) {
        await page.getByRole('tab', { name: tab, exact: typeof tab === 'string' }).click();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight < 6500));
        const report = await new AxeBuilder({ page }).include('main.admin-page').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        a11y.push({ width, scope: 'Admin ' + String(tab), violations: report.violations }); assert.deepEqual(report.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), []);
      }
    }
    const current = (await request('GET')).body; assert.equal((await request('PUT', { revision: current.revision, document: state.document })).status, 200);
    const after = await fingerprint(dataRoot), changed = Object.keys(after).filter(key => after[key] !== protectedBefore[key]).map(key => key.replaceAll('\\', '/'));
    assert.ok(changed.every(key => key === 'store/assets.json' || heroFiles.has(key)));
    for (const key of Object.keys(protectedBefore)) if (key.replaceAll('\\', '/') !== 'store/assets.json') assert.equal(after[key], protectedBefore[key]);
    const libraryAfter = JSON.parse(await fs.readFile(path.join(dataRoot, 'store/assets.json'), 'utf8'));
    assert.deepEqual(libraryAfter.assets.slice(0, libraryBeforeHero.assets.length), libraryBeforeHero.assets);
    assert.equal(libraryAfter.assets.length, libraryBeforeHero.assets.length + 2);
  });
  const opaqueHeroName = crypto.randomUUID();
  let metadataAsset;
  await test('UUID-named upload initializes empty ALT and requires Owner description before Save', async () => {
    await page.goto(origin + '/admin/customer-service');
    const file = await heroImage('png', 'metadata'); file.name = opaqueHeroName + '.png';
    const before = (await request('GET')).body;
    await uploadHero(file); await page.getByText('上傳成功', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('Hero 圖片 alt', { exact: true }).inputValue(), '');
    assert.equal(await heroPreview().getAttribute('alt'), '');
    const library = (await (await page.request.get(origin + '/api/admin/assets')).json());
    const currentPath = await heroPreview().getAttribute('src');
    metadataAsset = library.assets.find(asset => asset.path === currentPath);
    assert.ok(metadataAsset); assert.equal(metadataAsset.alt, ''); assert.equal(metadataAsset.originalFileName, file.name); heroFiles.add(currentPath.slice(1));
    await page.getByRole('button', { name: '儲存客服內容', exact: true }).click(); await page.getByRole('alert').filter({ hasText: '請填寫' }).waitFor();
    assert.deepEqual((await request('GET')).body, before);
    for (const alt of ['', opaqueHeroName, metadataAsset.id, metadataAsset.path]) {
      const document = structuredClone(before.document); document.config.hero = { src: currentPath, alt, position: 'center' };
      assert.equal((await request('PUT', { revision: before.revision, document })).status, 400);
    }
  });
  await test('Asset Picker and upload share meaningful ALT, display name, original filename and empty fallback', async () => {
    const before = await fs.readFile(path.join(dataRoot, 'store/assets.json'));
    const cases = [
      { alt: 'KD Coffee 禮盒', name: '禮盒名稱', originalFileName: opaqueHeroName + '.png', expected: 'KD Coffee 禮盒' },
      { alt: '', name: 'KD Coffee 秋日禮盒', originalFileName: opaqueHeroName + '.png', expected: 'KD Coffee 秋日禮盒' },
      { alt: opaqueHeroName, name: opaqueHeroName, originalFileName: 'KD咖啡禮盒秋日限定.jpg', expected: 'KD咖啡禮盒秋日限定' },
      { alt: opaqueHeroName, name: opaqueHeroName, originalFileName: opaqueHeroName + '.png', expected: '' },
    ];
    for (const entry of cases) {
      await page.route('**/api/admin/assets', route => route.fulfill({ json: { assets: [{ ...metadataAsset, ...entry }] } }));
      await page.getByRole('button', { name: '從素材庫選擇圖片', exact: true }).click();
      const picker = page.getByRole('dialog', { name: '從素材庫選擇圖片', exact: true });
      assert.equal(await picker.locator('.page-asset-grid img').first().getAttribute('alt'), entry.expected);
      await picker.locator('.page-asset-grid > button').first().click();
      assert.equal(await page.getByLabel('Hero 圖片 alt', { exact: true }).inputValue(), entry.expected);
      await page.unroute('**/api/admin/assets');
    }
    assert.deepEqual(await fs.readFile(path.join(dataRoot, 'store/assets.json')), before);
  });
  await test('Owner-approved ALT survives Save, reload and public HTML exactly without identifier leakage', async () => {
    const approved = 'KD Coffee 精品咖啡禮盒';
    await page.getByLabel('Hero 圖片 alt', { exact: true }).fill(approved); await saveAdmin(); await page.reload();
    assert.equal(await page.getByLabel('Hero 圖片 alt', { exact: true }).inputValue(), approved);
    const publicPage = await context.newPage();
    try {
      for (const width of [1440, 390]) {
        await publicPage.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        const response = await publicPage.goto(origin + '/customer-service', { waitUntil: 'networkidle' });
        const html = await response.text();
        assert.ok(!html.includes('alt="' + opaqueHeroName + '"'));
        const image = publicPage.locator('#service-main figure img').first();
        assert.equal(await image.getAttribute('alt'), approved);
        assert.ok(!(await publicPage.locator('img').evaluateAll(images => images.map(image => image.alt))).some(alt => alt.includes(opaqueHeroName) || alt === metadataAsset.id || alt.startsWith('/uploads/')));
        const file = path.join(qa, 'owner-approved-alt-' + width + '.png'); await publicPage.screenshot({ path: file, fullPage: true }); screenshots.push(file);
      }
    } finally { await publicPage.close(); }
  });
  await test('Legacy saved UUID ALT is suppressed on public output with no GET migration', async () => {
    const file = path.join(dataRoot, 'customer-service/content.json'), before = await fs.readFile(file), legacy = JSON.parse(before.toString());
    legacy.document.config.hero.alt = opaqueHeroName; await fs.writeFile(file, JSON.stringify(legacy));
    const stored = await fs.readFile(file), publicPage = await context.newPage();
    try {
      await publicPage.goto(origin + '/customer-service');
      assert.equal(await publicPage.locator('#service-main figure img').first().getAttribute('alt'), '');
      assert.deepEqual(await fs.readFile(file), stored);
    } finally { await publicPage.close(); await fs.writeFile(file, before); }
    const current = (await request('GET')).body; assert.equal((await request('PUT', { revision: current.revision, document: state.document })).status, 200);
    const after = await fingerprint(dataRoot);
    for (const key of Object.keys(protectedBefore)) if (key.replaceAll('\\', '/') !== 'store/assets.json') assert.equal(after[key], protectedBefore[key]);
  });
  await test('no public console errors, JavaScript errors or React warnings', async () => { assert.deepEqual(errors, []); });
  await fs.writeFile(path.join(qa, 'browser-results.json'), JSON.stringify({ pass: checks.length, checks, responsive: browserChecks, accessibility: a11y, screenshots, errors, dataRoot, serverMode: process.env.CS1_SERVER_MODE || 'start' }, null, 2));
  console.log(`CUSTOMER SERVICE BROWSER: ${checks.length} PASS`);
} finally {
  if (browser) await browser.close();
  server.kill();
  await new Promise(resolve => { if (server.exitCode !== null) resolve(); else { server.once('exit', resolve); setTimeout(resolve, 5000); } });
  await log.close();
}
