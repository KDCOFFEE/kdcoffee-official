import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as nodeModule from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveHomepageNavigation, validateHomepageCms } from '../lib/homepageCms';

let route = '/gallery';
type ResolveContext = { parentURL?: string };
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { resolve: (specifier: string, context: ResolveContext, next: (specifier: string, context: ResolveContext) => { url: string }) => { url: string; shortCircuit?: boolean } }) => void };
Object.assign(globalThis, { __headerTestPathname: () => route });
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'next/navigation' && context.parentURL?.includes('/HeaderNavigation.tsx')) {
    return { url: 'data:text/javascript,export function usePathname(){return globalThis.__headerTestPathname().split("?")[0]}', shortCircuit: true };
  }
  return next(specifier, context);
} });
const { default: HeaderNavigation } = await import('../components/layout/HeaderNavigation');
let count = 0;
function test(name: string, fn: () => void) { fn(); count++; console.log('PASS ' + name); }
const old = [
  {id:'NAV-FIRST',label:'第一次怎麼選',href:'/#home003',order:0},
  {id:'NAV-MONTHLY',label:'本月推薦',href:'/#home004',order:1},
  {id:'NAV-WORKS',label:'全部咖啡',href:'/works',order:2},
  {id:'NAV-WHY-KD',label:'為什麼是 KD',href:'/#home002',order:3},
  {id:'NAV-GIFT',label:'送禮',href:'/gifts',order:4},
];
const items = resolveHomepageNavigation(old);
test('older CMS navigation inserts Gallery after Works and before Why', () => {
  assert.deepEqual(items.map(x => x.label), ['第一次怎麼選','本月推薦','全部咖啡','作品詮釋','為什麼是 KD','送禮']);
  assert.equal(items[3].href, '/gallery');
  assert.deepEqual(items.filter(x => x.id !== 'NAV-GALLERY'), old.map(x => ({...x,enabled:true})));
});
test('default navigation and persisted navigation converge without duplicate', () => {
  assert.deepEqual(resolveHomepageNavigation(undefined).map(x=>[x.label,x.href]),items.map(x=>[x.label,x.href]));
  assert.equal(resolveHomepageNavigation(items).filter(x=>x.href==='/gallery').length,1);
  assert.equal(resolveHomepageNavigation([...old,{id:'CUSTOM-GALLERY',label:'作品詮釋',href:{type:'custom',url:'/gallery'},order:3}]).filter(x=>x.label==='作品詮釋').length,1);
});
test('navigation resolution leaves saved CMS input unchanged', () => {
  const before=JSON.stringify(old); resolveHomepageNavigation(old); assert.equal(JSON.stringify(old),before);
});
test('existing custom targets remain unchanged', () => {
  const custom=old.map(x=>x.id==='NAV-WORKS'?{...x,label:'咖啡選集',href:'/monthly-menu'}:x);
  assert.equal(resolveHomepageNavigation(custom)[2].href,'/monthly-menu');
});
for (const pathname of ['/gallery','/gallery?work=giotto-awakening','/works','/']) {
  test('desktop/mobile SSR links and current page: '+pathname, () => {
    route=pathname;
    const html=renderToStaticMarkup(createElement(HeaderNavigation,{items}));
    assert.equal((html.match(/href="\/gallery"/g)||[]).length,2);
    assert.ok(html.includes('aria-label="主要導覽"'));assert.ok(html.includes('aria-label="手機主要導覽"'));
    const current=(html.match(/<a[^>]*aria-current="page"[^>]*>/g)||[]);
    assert.equal(current.length,pathname==='/'?0:2);
    for(const link of current)assert.ok(link.includes(`href="${pathname.split('?')[0]}"`));
    for(const item of old)assert.equal((html.match(new RegExp('href="'+item.href+'"','g'))||[]).length,2);
  });
}
const homepage=JSON.parse(await fs.readFile('public/data/homepage.json','utf8'));
test('resolved defaults remain valid when saved through existing CMS', () => {
  validateHomepageCms({...homepage,navigation:resolveHomepageNavigation(undefined)});
  assert.ok(resolveHomepageNavigation(undefined).every(x=>Number.isInteger(x.order)));
});
const css=(await fs.readFile('app/globals.css','utf8')).replaceAll('\r\n','\n');
test('responsive reuse keeps typography and existing mobile controls', () => {
  assert.ok(css.includes('@media(max-width:1100px){\n  .v2-header{z-index:950}'));
  assert.ok(css.includes('.mobile-menu-button:focus-visible'));
  assert.ok(css.includes('.header-navigation a[aria-current="page"]'));
});
console.log(`GALLERY HEADER ${count} PASS`);
