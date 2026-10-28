import assert from 'node:assert/strict';
import {createRequire,registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import './gift-frontend-test-bootstrap.mjs';
const {resolveCmsLink,validateCmsLinkValue,inferCmsLink,CMS_INTERNAL_DESTINATIONS}=await import('../lib/cmsLinks.ts');
const {resolveHomepageNavigation}=await import('../lib/homepageCms.ts');
const {default:CmsLink}=await import('../components/CmsLink.tsx');
const {default:NextLink}=await import('next/link.js');
let passed=0;const test=(name,run)=>{run();console.log('PASS '+(++passed)+' '+name);};
const presetBefore=JSON.stringify(CMS_INTERNAL_DESTINATIONS);
test('Custom internal and future paths use existing Next Link in the same tab',()=>{
 for(const url of ['/customer-service','/gifts','/store','/pages/about','/future-configurable-page']){
  const value={type:'custom',url},resolved=resolveCmsLink(value),element=CmsLink({value,children:'服務'});
  assert.equal(resolved.valid,true);assert.equal(resolved.external,false);assert.equal(resolved.newTab,false);validateCmsLinkValue(value,'導航');assert.equal(element.type,NextLink);assert.equal(element.props.href,url);assert.equal(element.props.target,undefined);
 }
});
test('Custom HTTP/HTTPS destinations default to a safe new tab',()=>{
 for(const url of ['https://www.facebook.com/example','https://line.me/example','http://example.com/help']){
  const value={type:'custom',url},resolved=resolveCmsLink(value),element=CmsLink({value,children:'服務'});validateCmsLinkValue(value,'導航');assert.equal(resolved.external,true);assert.equal(resolved.newTab,true);assert.equal(element.type,'a');assert.equal(element.props.target,'_blank');assert.equal(element.props.rel,'noopener noreferrer');
 }
});
test('Owner overrides both internal and external opening behavior',()=>{
 for(const [url,newTab]of [['/pages/about',true],['https://example.com',false]]){const value={type:'custom',url,newTab};validateCmsLinkValue(value,'導航');assert.equal(resolveCmsLink(value).newTab,newTab);const element=CmsLink({value,children:'服務'});assert.equal(element.props.target,newTab?'_blank':undefined);assert.equal(element.props.rel,newTab?'noopener noreferrer':undefined);assert.ok(renderToStaticMarkup(React.createElement(CmsLink,{value},'服務')).includes('href='));}
});
test('Legacy links and website presets keep their existing behavior without mutation',()=>{
 assert.deepEqual(CMS_INTERNAL_DESTINATIONS.map(item=>item.id),['gifts','home','works','monthly-menu','member','cart']);
 assert.equal(CmsLink({value:'/store',children:'Store'}).props.target,undefined);assert.equal(CmsLink({value:'https://example.com',children:'External'}).props.target,'_blank');assert.equal(resolveCmsLink({type:'external',url:'http://example.com'}).valid,false);assert.deepEqual(inferCmsLink('/works'),{type:'internal',target:'works'});assert.equal(JSON.stringify(CMS_INTERNAL_DESTINATIONS),presetBefore);
});
test('Custom validation rejects unsafe destinations and invalid tab flags',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,test','//evil.example','/\\evil.example']){assert.equal(resolveCmsLink({type:'custom',url}).valid,false);assert.throws(()=>validateCmsLinkValue({type:'custom',url},'導航'));}
 assert.throws(()=>validateCmsLinkValue({type:'custom',url:'/store',newTab:'false'},'導航'));
});
test('The existing homepage navigation preserves the optional flag through JSON round-trip',()=>{
 const input=[{id:'NAV-CUSTOM',label:'客服中心',href:{type:'custom',url:'/customer-service',newTab:false},enabled:true,order:0}],before=JSON.stringify(input);const saved=JSON.parse(before),resolved=resolveHomepageNavigation(saved);assert.deepEqual(resolved.find(item=>item.id==='NAV-CUSTOM').href,input[0].href);assert.equal(JSON.stringify(saved),before);
});
// Exercise the actual picker handlers without a browser, server, or CMS writes.
const reactUrl=pathToFileURL(createRequire(import.meta.url).resolve('react')).href;
let slots=[],cursor=0;globalThis.__customLinkHooks={useState(initial){const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return[slots[index],next=>{slots[index]=typeof next==='function'?next(slots[index]):next;}];}};
const hook=registerHooks({resolve(specifier,context,next){return specifier==='react'&&context.parentURL?.endsWith('/SmartLinkPicker.tsx')?{url:'data:text/javascript,'+encodeURIComponent('export * from '+JSON.stringify(reactUrl)+';export const useState=value=>globalThis.__customLinkHooks.useState(value);export const useMemo=fn=>fn();export const useContext=()=>null;export const useId=()=>"custom-link-test";'),shortCircuit:true}:next(specifier,context);}});
try{
 const {default:Picker}=await import('../components/admin/SmartLinkPicker.tsx');let changes=[];const saved={type:'custom',url:'/existing-page'},props={value:saved,products:[],label:'導覽連結',buttonText:'服務',onChange:value=>changes.push(value)};
 const text=node=>Array.isArray(node)?node.map(text).join(''):React.isValidElement(node)?text(node.props.children):typeof node==='string'?node:'';
 function flatten(node){if(Array.isArray(node))return node.flatMap(flatten);if(!React.isValidElement(node))return[];if(typeof node.type==='function')return flatten(node.type(node.props));return[node,...flatten(node.props.children)];}
 const nodes=()=>{cursor=0;return flatten(Picker(props));};
 const button=label=>nodes().find(node=>node.type==='button'&&text(node).includes(label));
 const input=()=>nodes().find(node=>node.type==='input'&&node.props.id?.endsWith('-custom'));
 const checkbox=()=>nodes().find(node=>node.type==='input'&&node.props.type==='checkbox');
 test('Admin custom URL defaults switch automatically, while explicit Owner override persists',()=>{
  button('修改連結').props.onClick();button('進階自訂').props.onClick();input().props.onChange({target:{value:'/customer-service'}});assert.equal(checkbox().props.checked,false);input().props.onChange({target:{value:'https://example.com'}});assert.equal(checkbox().props.checked,true);checkbox().props.onChange({target:{checked:false}});input().props.onChange({target:{value:'http://example.com/other'}});assert.equal(checkbox().props.checked,false);assert.equal(changes.length,0);button('確認目的地').props.onClick();assert.deepEqual(changes,[{type:'custom',url:'http://example.com/other',newTab:false}]);
 });
 test('Admin can override an internal link to new-tab and Cancel makes no saved change',()=>{
  slots=[];changes=[];button('修改連結').props.onClick();button('進階自訂').props.onClick();input().props.onChange({target:{value:'/pages/about'}});checkbox().props.onChange({target:{checked:true}});assert.equal(checkbox().props.checked,true);button('取消').props.onClick();assert.equal(changes.length,0);assert.deepEqual(saved,{type:'custom',url:'/existing-page'});
 });
}finally{hook.deregister();delete globalThis.__customLinkHooks;}
console.log('HOMEPAGE CUSTOM LINKS: '+passed+' PASS');
