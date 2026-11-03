import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import SocialImageField from '../components/admin/SocialImageField';
let passed=0;
function test(name:string,run:()=>void){run();console.log(`PASS ${++passed}: ${name}`);}
const render=(value?:{path:string;alt:string},disabled=false)=>renderToStaticMarkup(createElement(SocialImageField,{value,disabled,assets:[],onChange:()=>{},label:'首頁分享圖片',help:'未設定時，會使用全站預設分享圖片。'}));
test('Friendly empty state exposes native upload and library actions without remove',()=>{const html=render();assert.ok(html.includes('尚未設定專屬分享圖片'));assert.ok(html.includes('>上傳圖片<'));assert.ok(html.includes('>從素材庫選擇<'));assert.ok(!html.includes('>移除設定<'));assert.ok(html.includes('type="file"'));assert.ok(!html.includes('type="url"'));});
test('Selected image preserves path, meaningful alt and replace/remove semantics',()=>{const html=render({path:'/uploads/assets/page-builder/fixture.png',alt:'咖啡風味圖片'});assert.ok(html.includes('alt="咖啡風味圖片"'));assert.ok(html.includes('>更換圖片<'));assert.ok(html.includes('>移除設定<'));assert.ok(html.includes('移除設定不會刪除素材庫中的原始圖片。'));});
test('Platform and size guidance each appear once without engineering copy',()=>{for(const html of [render(),render({path:'/uploads/assets/page-builder/fixture.png',alt:''})]){assert.equal(html.split('LINE、Facebook、Messenger').length-1,1);assert.equal(html.split('建議尺寸 1200 × 630 px').length-1,1);assert.ok(!/Open Graph|Hero|Desktop|Mobile|fallback|備援/.test(html));}});
test('Accessible title/help relationships resolve to existing IDs',()=>{const html=render();for(const attr of ['aria-labelledby','aria-describedby']){const id=html.match(new RegExp(`${attr}="([^"]+)"`))?.[1];assert.ok(id);assert.ok(html.includes(`id="${id}"`));}assert.ok(html.includes('accept="image/jpeg,image/png,image/webp"'));});
test('Disabled field keeps every action and file control disabled',()=>{const html=render({path:'/uploads/assets/page-builder/fixture.png',alt:'咖啡'},true);for(const control of html.matchAll(/<(button|input)\b[^>]*>/g))assert.ok(control[0].includes('disabled=""'));});
const usages=[['HomepageSocialImageSettings','首頁分享圖片'],['CustomerServiceManager','客服中心分享圖片'],['GlobalSocialImageSettings','全站預設分享圖片'],['GiftCmsEditor','商店首頁分享圖片'],['GiftCmsEditor','禮盒頁分享圖片'],['WorksPageManager','作品頁分享圖片'],['ProductManager','作品分享圖片'],['GallerySeoControls','藝廊分享圖片'],['PageBuilderManager','分享圖片']];
for(const [file,label] of usages){const text=await fs.readFile(`components/admin/${file}.tsx`,'utf8');test(`${file} supplies normalized ${label} without repeating shared guidance`,()=>{assert.ok(text.includes(`label="${label}"`));for(const match of text.matchAll(/<SocialImageField\b[\s\S]*?help="([^"]+)"/g)){assert.ok(!/1200|LINE|Open Graph|fallback|備援/.test(match[1]));}});}
console.log(`ADMIN UX UNIT: ${passed} PASS`);
