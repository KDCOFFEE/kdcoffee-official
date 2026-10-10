import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { registerHooks, createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';

// Only Next's request context/navigation and this component's React state are
// supplied. Auth signatures, role checks, API/security/domain/files all stay real.
const reactUrl=pathToFileURL(createRequire(import.meta.url).resolve('react')).href;
registerHooks({resolve(specifier,context,nextResolve){
  if(specifier==='next/headers')return{url:'data:text/javascript,export async function cookies(){return {get(){const value=globalThis.__storeAdminCookie;return value?{value}:undefined;}};}',shortCircuit:true};
  if(specifier==='next/navigation')return{url:'data:text/javascript,'+encodeURIComponent(`export function redirect(location){throw Object.assign(new Error('redirect'),{location});} export function forbidden(){throw Object.assign(new Error('forbidden'),{status:403});} export function usePathname(){return '/admin/store';} export function useSearchParams(){return new URLSearchParams();}`),shortCircuit:true};
  if(specifier==='react'&&context.parentURL?.endsWith('/components/admin/StoreWorkspace.tsx'))return{url:'data:text/javascript,'+encodeURIComponent(`import React from ${JSON.stringify(reactUrl)};export * from ${JSON.stringify(reactUrl)};export default React;export const useState=(value)=>globalThis.__storeUiFixture?globalThis.__storeUiFixture.useState(value):React.useState(value);export const useRef=(value)=>globalThis.__storeUiFixture?globalThis.__storeUiFixture.useRef(value):React.useRef(value);`),shortCircuit:true};
  return nextResolve(specifier,context);
}});
const root=await fs.mkdtemp(path.join(os.tmpdir(),'kd-j6c-admin-'));
process.env.KD_DATA_DIR=root;
delete process.env.RAILWAY_VOLUME_MOUNT_PATH;
const protectedFiles=['components/admin/ProductManager.tsx','app/admin/products/page.tsx','app/api/admin/products/route.ts','app/admin/works/page.tsx','data/websiteData.ts','lib/membershipCommerce.ts','lib/referralPv.ts','lib/membershipBusinessRules.ts','lib/pointDisplayName.ts','lib/pointDisplayNameStore.ts','lib/cloudinary.ts','lib/cloudinaryCleanup.ts','components/admin/MediaUploader.tsx','components/admin/HeroMediaLibraryPicker.tsx','components/media/KdMedia.tsx','app/cart/page.tsx','app/checkout/page.tsx','app/api/orders/route.ts','lib/fulfillment.ts','public/data/website-data.json'];
const hashes=async()=>Object.fromEntries(await Promise.all(protectedFiles.map(async file=>[file,createHash('sha256').update(await fs.readFile(file)).digest('hex')])));
const before=await hashes();
const {createAdminSessionValue}=await import('../lib/adminAuth.ts');
const {createStoreRepository}=await import('../lib/storeRepository.ts');
const {DEFAULT_MEMBERSHIP_RULES,saveMembershipBusinessRules}=await import('../lib/membershipBusinessRules.ts');
const {storeSeoPreview}=await import('../lib/storeSeo.ts');
const {newStoreAdminDraft,storeDraftPayload,changeStoreDraftSection,selectedStoreMedia,moveStoreGallery}=await import('../lib/storeAdminDraft.ts');
const catalogApi=await import('../app/api/admin/store/route.ts');
const api={sections:await import('../app/api/admin/store/sections/route.ts'),categories:await import('../app/api/admin/store/categories/route.ts'),products:await import('../app/api/admin/store/products/route.ts')};
const {default:StorePage}=await import('../app/admin/store/page.tsx');
const {default:StoreWorkspace}=await import('../components/admin/StoreWorkspace.tsx');
const repository=createStoreRepository();
const cookie=(role='owner')=>{globalThis.__storeAdminCookie=createAdminSessionValue({role});};
const url='http://127.0.0.1:4318';
function request(kind,method,value,headers={}){return new Request(`${url}/api/admin/store/${kind}`,{method,headers:{'content-type':'application/json',origin:url,...headers},body:typeof value==='string'?value:JSON.stringify(value)});}
async function create(kind,value){const response=await api[kind].POST(request(kind,'POST',value));assert.equal(response.status,201,await response.clone().text());return response.json();}
async function patch(kind,item,changes,expected=200){const response=await api[kind].PATCH(request(kind,'PATCH',{id:item.id,expectedRevision:item.revision,action:'update',changes}));assert.equal(response.status,expected,await response.clone().text());return response.json();}
async function archive(kind,item,expected=200){const response=await api[kind].PATCH(request(kind,'PATCH',{id:item.id,expectedRevision:item.revision,action:'archive'}));assert.equal(response.status,expected,await response.clone().text());return response.json();}
let passed=0;
async function test(label,run){try{await run();console.log(`PASS ${++passed} ${label}`);}catch(error){console.error(`FAIL ${label}`);throw error;}}
let sectionA,sectionB,categoryA,categoryB,product;
const productInput=(extra={})=>({name:'測試器具',slug:'test-tool',sectionId:sectionA.id,categoryId:categoryA.id,productType:'equipment',sku:'STORE-TEST',price:500,salePrice:450,inventory:8,pvValue:0,...extra});
const image=(name)=>({type:'image',provider:'local',url:`/uploads/assets/test/${name}.webp`,alt:name});
try {
  await test('Admin route exists and uses existing auth',async()=>{const source=await fs.readFile('app/admin/store/page.tsx','utf8');assert.match(source,/readAdminSession/);assert.match(source,/forbidden\(\)/);});
  await test('Unauthenticated page redirects to existing login',async()=>{delete globalThis.__storeAdminCookie;await assert.rejects(StorePage(),{location:'/admin/login'});});
  await test('Unauthenticated catalog access is 401',async()=>assert.equal((await catalogApi.GET()).status,401));
  await test('Unauthenticated write rejected before persistence',async()=>{assert.equal((await api.sections.POST(request('sections','POST',{name:'denied',slug:'denied'}))).status,401);assert.equal((await repository.read()).sections.length,0);});
  await test('Non-owner page and API denied',async()=>{cookie('admin');await assert.rejects(StorePage(),{status:403});assert.equal((await catalogApi.GET()).status,403);assert.equal((await api.sections.POST(request('sections','POST',{}))).status,403);});
  cookie();
  await test('Cross-origin write rejected',async()=>assert.equal((await api.sections.POST(request('sections','POST',{}, {origin:'https://foreign.example'}))).status,403));
  await test('Non-JSON write rejected',async()=>assert.equal((await api.sections.POST(request('sections','POST','{}',{'content-type':'text/plain'}))).status,415));
  await test('Malformed JSON rejected',async()=>assert.equal((await api.sections.POST(request('sections','POST','{broken'))).status,400));
  await test('Declared oversized request rejected',async()=>assert.equal((await api.sections.POST(request('sections','POST','{}',{'content-length':'524289'}))).status,413));
  await test('Actual oversized request rejected without trusting header',async()=>assert.equal((await api.sections.POST(request('sections','POST',JSON.stringify({description:'x'.repeat(524289)})))).status,413));
  await test('Unknown create fields rejected',async()=>assert.equal((await api.sections.POST(request('sections','POST',{name:'x',slug:'x',unexpected:true}))).status,400));
  await test('Client create identity rejected',async()=>assert.equal((await api.sections.POST(request('sections','POST',{id:'client-id',name:'x',slug:'x'}))).status,400));
  await test('Section creation generates private identity',async()=>{sectionA=await create('sections',{name:'咖啡器具',slug:'equipment',published:true});assert.match(sectionA.id,/^store-section-/);assert.equal(sectionA.revision,1);});
  await test('Section edit preserves slug unless explicitly changed',async()=>{sectionA=await patch('sections',sectionA,{name:'精品器具',description:'專區介紹',seoTitle:'專區 SEO'});assert.equal(sectionA.slug,'equipment');assert.equal(sectionA.seoTitle,'專區 SEO');});
  await test('Section reorder persists',async()=>{sectionA=await patch('sections',sectionA,{sortOrder:4,showOnHomepage:true,homepageSortOrder:3,showInNavigation:true,navigationSortOrder:2});assert.equal(sectionA.sortOrder,4);assert.equal(sectionA.navigationSortOrder,2);});
  await test('Section stale revision returns clear 409',async()=>{const body=await patch('sections',{...sectionA,revision:1},{name:'stale'},409);assert.match(body.error,/重新載入/);});
  sectionB=await create('sections',{name:'手工餅乾',slug:'cookies',published:true});
  await test('Category creation belongs to valid Section',async()=>{categoryA=await create('categories',{name:'濾杯',slug:'dripper',sectionId:sectionA.id});assert.equal(categoryA.sectionId,sectionA.id);});
  await test('Category edit and reorder persist',async()=>{categoryA=await patch('categories',categoryA,{name:'陶瓷濾杯',description:'分類說明',sortOrder:2});assert.equal(categoryA.name,'陶瓷濾杯');assert.equal(categoryA.sortOrder,2);});
  await test('Category missing parent rejected',async()=>assert.equal((await api.categories.POST(request('categories','POST',{name:'invalid',slug:'invalid',sectionId:'missing'}))).status,400));
  await test('Category stale revision rejected',async()=>{await patch('categories',{...categoryA,revision:1},{name:'stale'},409);});
  categoryB=await create('categories',{name:'餅乾',slug:'cookie',sectionId:sectionB.id});
  await test('Product creation and Section/Category assignment persist',async()=>{product=await create('products',productInput());assert.equal(product.sectionId,sectionA.id);assert.equal(product.categoryId,categoryA.id);});
  await test('Product type/price/sale/SKU/inventory persist',()=>{assert.equal(product.productType,'equipment');assert.equal(product.price,500);assert.equal(product.salePrice,450);assert.equal(product.sku,'STORE-TEST');assert.equal(product.inventory,8);});
  await test('pvValue=0 is valid and subscription stays false',()=>{assert.equal(product.pvValue,0);assert.equal(product.subscriptionEligible,false);});
  await test('Product edit and decimal PV persist independently of price',async()=>{product=await patch('products',product,{name:'器具改名',pvValue:12.375,inventory:7});assert.equal(product.pvValue,12.375);assert.equal(product.price,500);assert.equal(product.slug,'test-tool');});
  await test('Negative PV rejected and persisted bytes preserved',async()=>{const bytes=await fs.readFile(repository.catalogPath,'utf8');await patch('products',product,{pvValue:-1},400);assert.equal(await fs.readFile(repository.catalogPath,'utf8'),bytes);});
  await test('Invalid category/section pairing rejected',async()=>{await patch('products',product,{categoryId:categoryB.id},400);});
  await test('Referenced category cannot silently change Section',async()=>{await patch('categories',categoryA,{sectionId:sectionB.id},400);});
  await test('Sale price cannot exceed original price',async()=>{await patch('products',product,{salePrice:501},400);});
  await test('Subscription eligibility cannot be edited',async()=>{await patch('products',product,{subscriptionEligible:true},400);});
  await test('Subscription true cannot be created',async()=>assert.equal((await api.products.POST(request('products','POST',productInput({slug:'subscription',sku:'SUB',subscriptionEligible:true})))).status,400));
  await test('Duplicate Store point naming rejected',async()=>{await patch('products',product,{pointDisplayName:'duplicate'},400);});
  await test('Product stale revision rejected without overwrite',async()=>{await patch('products',{...product,revision:1},{inventory:999},409);assert.equal((await repository.read()).products[0].inventory,7);});
  await test('Hero media uses existing media schema and persists',async()=>{product=await patch('products',product,{heroMedia:image('hero')});assert.deepEqual(product.heroMedia,image('hero'));});
  await test('Gallery order persists and reorder uses same values',async()=>{const gallery=[image('a'),image('b')];product=await patch('products',product,{gallery:moveStoreGallery(gallery,1,-1)});assert.deepEqual(product.gallery,[image('b'),image('a')]);});
  await test('Existing asset selection preserves metadata and Owner ALT',()=>{const media={type:'video',provider:'cloudinary',publicId:'kd-coffee/videos/existing',url:'https://example.com/video.mp4',posterUrl:'https://example.com/poster.jpg',width:1280};assert.deepEqual(selectedStoreMedia(media,'影片'),{...media,alt:'影片'});});
  await test('Gallery remove persists without deleting shared asset',async()=>{product=await patch('products',product,{gallery:product.gallery.slice(1),heroMedia:null});assert.equal(product.gallery.length,1);assert.equal(Object.hasOwn(product,'heroMedia'),false);});
  await test('Flexible specifications persist with Owner-entered values',async()=>{product=await patch('products',product,{specifications:[{key:'material',label:'材質',value:'Owner 輸入',sortOrder:1}]});assert.equal(product.specifications[0].value,'Owner 輸入');});
  await test('Manual Product SEO fields persist',async()=>{product=await patch('products',product,{seoTitle:'商品 SEO',seoDescription:'手動 SEO 說明'});assert.equal(product.seoTitle,'商品 SEO');assert.equal(product.seoDescription,'手動 SEO 說明');});
  await test('Manual SEO always wins preview',()=>{assert.equal(storeSeoPreview(product).title,'商品 SEO');assert.equal(storeSeoPreview(product).description,'手動 SEO 說明');});
  await test('Automatic title fallback is computed without mutation',()=>{const draft={...product,seoTitle:'',seoDescription:'',shortDescription:'短文'};const bytes=JSON.stringify(draft);assert.equal(storeSeoPreview(draft).title,draft.name);assert.equal(JSON.stringify(draft),bytes);});
  await test('Automatic description prefers short description',()=>assert.equal(storeSeoPreview({...product,seoDescription:'',shortDescription:'短文',description:'長文'}).description,'短文'));
  await test('Automatic description truncates full description safely',()=>{const preview=storeSeoPreview({...product,seoDescription:'',shortDescription:'',description:'🟢'.repeat(600)});assert.equal(Array.from(preview.description).length,500);assert.equal(preview.description.endsWith('🟢'),true);});
  await test('Unrelated save preserves manual SEO and published slug',async()=>{product=await patch('products',product,{published:true});product=await patch('products',product,{name:'再次改名',inventory:6});assert.equal(product.seoTitle,'商品 SEO');assert.equal(product.seoDescription,'手動 SEO 說明');assert.equal(product.slug,'test-tool');});
  await test('Optional blank SEO clears only manual values',async()=>{product=await patch('products',product,{seoTitle:'',seoDescription:' '});assert.equal(Object.hasOwn(product,'seoTitle'),false);assert.equal(Object.hasOwn(product,'seoDescription'),false);});
  await test('New draft payload preserves absent optional fields',()=>{const values=JSON.parse(JSON.stringify(storeDraftPayload('products',newStoreAdminDraft('products',sectionA.id))));assert.equal(Object.hasOwn(values,'seoTitle'),false);assert.equal(Object.hasOwn(values,'heroMedia'),false);assert.equal(Object.hasOwn(values,'subscriptionEligible'),false);});
  await test('Section change clears incompatible Category with explicit flag',()=>{const next=changeStoreDraftSection(product,sectionB.id,[categoryA,categoryB]);assert.equal(next.cleared,true);assert.equal(next.draft.categoryId,undefined);assert.equal(next.draft.sectionId,sectionB.id);});
  await test('Valid Category remains when Section unchanged',()=>{const next=changeStoreDraftSection(product,sectionA.id,[categoryA]);assert.equal(next.cleared,false);assert.equal(next.draft.categoryId,categoryA.id);});
  const rules=structuredClone(DEFAULT_MEMBERSHIP_RULES);rules.referral.pointDisplayName='Owner 自訂點';await saveMembershipBusinessRules({expectedRevision:0,rules});
  await test('Owner page loads canonical point name and real catalog',async()=>{const element=await StorePage();assert.equal(element.props.pointDisplayName,'Owner 自訂點');assert.equal(element.props.initialCatalog.products[0].id,product.id);});
  await test('Canonical point name never enters Product persistence',async()=>assert.equal((await fs.readFile(repository.catalogPath,'utf8')).includes('Owner 自訂點'),false));

  // Execute the real editor handlers with deterministic React state. Other
  // components still use real React/SSR; no business module is stubbed.
  let state=[],refs=[],stateIndex=0,refIndex=0;
  globalThis.__storeUiFixture={useState(initial){const index=stateIndex++;if(!(index in state))state[index]=typeof initial==='function'?initial():initial;return[state[index],value=>{state[index]=typeof value==='function'?value(state[index]):value;}];},useRef(initial){const index=refIndex++;return refs[index]??(refs[index]={current:initial});}};
  function ui(){stateIndex=refIndex=0;return StoreWorkspace({initialCatalog:{...awaitCatalog},pointDisplayName:'Owner 自訂點'});}
  let awaitCatalog=await repository.read();
  function nodes(tree,predicate,result=[]){if(Array.isArray(tree)){for(const item of tree)nodes(item,predicate,result);return result;}if(!tree||typeof tree!=='object')return result;if(predicate(tree))result.push(tree);nodes(tree.props?.children,predicate,result);return result;}
  function text(tree){if(tree==null||typeof tree==='boolean')return'';if(typeof tree==='string'||typeof tree==='number')return String(tree);if(Array.isArray(tree))return tree.map(text).join('');return text(tree.props?.children);}
  function button(tree,label){const found=nodes(tree,node=>node.type==='button'&&text(node)===label)[0];assert.ok(found,`Button missing: ${label}`);return found;}
  function control(tree,label){const owner=nodes(tree,node=>node.type==='label'&&text(node).startsWith(label))[0];assert.ok(owner,`Label missing: ${label}`);const input=nodes(owner,node=>['input','select','textarea'].includes(node.type))[0];assert.ok(input);return input;}
  globalThis.window={confirm:()=>true};
  await test('Centralized editor has four Owner navigation entries',()=>{const tree=ui();for(const label of ['銷售專區','商品分類','商品','設定'])assert.ok(button(tree,label));});
  await test('Selecting a Product opens centralized editor and selected state',()=>{let tree=ui();button(tree,'商品').props.onClick();tree=ui();const row=nodes(tree,node=>node.type==='button'&&text(node).includes(product.name))[0];assert.ok(row);row.props.onClick();tree=ui();assert.ok(nodes(tree,node=>node.type==='button'&&node.props['aria-pressed']===true).length);for(const label of ['基本資料','分類','價格與庫存','商品點數（PV）','圖片與影片','規格','SEO','發布狀態'])assert.ok(nodes(tree,node=>node.type==='h3'&&text(node)===label).length);});
  await test('Product category options filter selected Section',()=>{const input=control(ui(),'商品分類（可留空）');const options=nodes(input,node=>node.type==='option');assert.ok(options.some(node=>node.props.value===categoryA.id));assert.ok(!options.some(node=>node.props.value===categoryB.id));});
  await test('Real Section selector clears Category and shows feedback',()=>{control(ui(),'銷售專區').props.onChange({target:{value:sectionB.id}});const tree=ui();assert.equal(control(tree,'商品分類（可留空）').props.value,'');assert.match(text(tree),/原商品分類已清除/);});
  await test('PV UI supports decimals and canonical display helper',()=>{const tree=ui();assert.equal(control(tree,'PV 值').props.step,'any');assert.match(text(tree),/前台顯示名稱：Owner 自訂點/);assert.ok(!nodes(tree,node=>node.type==='input'&&node.props.type==='checkbox'&&text(node).includes('subscription')).length);});
  await test('Actual picker selection appends gallery and retains media shape',async()=>{
    const previousFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({assets:[]});try{await button(ui(),'從網站素材庫加入相簿').props.onClick();let tree=ui();const picker=nodes(tree,node=>node.type?.name==='HeroMediaLibraryPicker')[0];assert.ok(picker);picker.props.onChoose(image('selected'));tree=ui();const media=nodes(tree,node=>node.type?.name==='KdMedia').map(node=>node.props.media);assert.ok(media.some(item=>item.url===image('selected').url));}finally{globalThis.fetch=previousFetch;}
  });
  await test('MediaUploader reuses image/video sign-finalize context and product usage',()=>{const uploaders=nodes(ui(),node=>node.type?.name==='MediaUploader');assert.equal(uploaders.length,2);for(const uploader of uploaders){assert.equal(uploader.props.usage,'product');assert.equal(uploader.props.allowCloudinaryImage,true);assert.equal(uploader.props.productMediaNaming.mediaPurpose,'custom-section');assert.match(uploader.props.productMediaNaming.sectionId,/^cs-/);}});
  // Gallery hotfix: exercise the real card handlers, draft-only changes and Save boundary.
  product=await patch('products',product,{heroMedia:image('gallery-hero'),gallery:[image('gallery-a'),image('gallery-b'),image('gallery-c')]});
  const sharedGalleryProduct=await create('products',productInput({name:'Shared gallery reference',slug:'gallery-shared',sku:'GALLERY-SHARED',heroMedia:image('gallery-b'),gallery:[image('gallery-b')]}));
  const gallerySourceFile=path.join(root,'uploads/assets/test/gallery-b.webp');
  const galleryLibraryFile=path.join(root,'store/assets.json');
  await fs.mkdir(path.dirname(gallerySourceFile),{recursive:true});await fs.writeFile(gallerySourceFile,'isolated shared media sentinel');
  await fs.mkdir(path.dirname(galleryLibraryFile),{recursive:true});await fs.writeFile(galleryLibraryFile,JSON.stringify({assets:[{id:'gallery-b',...image('gallery-b')}]}));
  const sourceBytes=await fs.readFile(gallerySourceFile),libraryBytes=await fs.readFile(galleryLibraryFile),galleryCatalogBytes=await fs.readFile(repository.catalogPath);
  const heroBefore=structuredClone(product.heroMedia),originalOrder=product.gallery.map(item=>item.url);
  awaitCatalog=await repository.read();state=[];refs=[];
  let galleryTree=ui();button(galleryTree,'商品').props.onClick();galleryTree=ui();nodes(galleryTree,node=>node.type==='button'&&text(node).includes(product.name))[0].props.onClick();
  const galleryCards=()=>nodes(ui(),node=>node.type==='article'&&nodes(node,child=>child.props?.role==='group'&&child.props['aria-label']?.startsWith('商品相簿第 ')).length>0);
  const galleryMedia=()=>galleryCards().map(card=>nodes(card,node=>node.type?.name==='KdMedia')[0].props.media);
  const galleryOrder=()=>galleryMedia().map(media=>media.url);
  const galleryAction=(index,label)=>button(galleryCards()[index],label);
  const currentHero=()=>nodes(ui(),node=>node.type==='article'&&!nodes(node,child=>child.props?.role==='group').length).map(card=>nodes(card,node=>node.type?.name==='KdMedia')[0]?.props.media).find(Boolean);
  const galleryPreviousFetch=globalThis.fetch,galleryRequests=[];
  globalThis.fetch=(url)=>{galleryRequests.push(String(url));throw new Error('Gallery draft action must not issue a request');};
  await test('Gallery cards expose accessible non-submit controls outside bounded previews',()=>{
    assert.equal(galleryCards().length,3);
    for(const [index,card] of galleryCards().entries()){
      const preview=nodes(card,node=>node.props?.className==='mediaPreview')[0];assert.ok(preview);assert.equal(nodes(preview,node=>node.type==='button').length,0);assert.equal(nodes(preview,node=>node.type?.name==='KdMedia').length,1);
      for(const label of ['上移','下移','移除']){const action=galleryAction(index,label);assert.equal(action.props.type,'button');assert.match(action.props['aria-label'],new RegExp(`第 ${index+1} 項`));}
    }
    assert.equal(nodes(ui(),node=>node.type==='article'&&nodes(node,child=>child.type==='button'&&text(child)==='移除此引用').length).length,1);
  });
  await test('Gallery index 1 up changes visual draft order and dirty state only',async()=>{
    galleryAction(1,'上移').props.onClick();assert.deepEqual(galleryOrder(),[originalOrder[1],originalOrder[0],originalOrder[2]]);assert.deepEqual(currentHero(),heroBefore);assert.match(text(ui()),/尚未儲存/);assert.deepEqual(await fs.readFile(repository.catalogPath),galleryCatalogBytes);assert.deepEqual(galleryRequests,[]);
  });
  await test('Gallery first up and last down are prevented without changing media',()=>{
    assert.equal(galleryAction(0,'上移').props.disabled,true);assert.equal(galleryAction(2,'下移').props.disabled,true);
    const media=galleryMedia();assert.deepEqual(moveStoreGallery(media,0,-1),media);assert.deepEqual(moveStoreGallery(media,media.length-1,1),media);assert.deepEqual(currentHero(),heroBefore);
  });
  await test('Gallery down handler restores order without touching hero',()=>{galleryAction(0,'下移').props.onClick();assert.deepEqual(galleryOrder(),originalOrder);assert.deepEqual(currentHero(),heroBefore);});
  await test('Gallery remove only unlinks draft reference, with no deletion requests or source changes',async()=>{
    galleryAction(1,'移除').props.onClick();assert.deepEqual(galleryOrder(),[originalOrder[0],originalOrder[2]]);assert.deepEqual(currentHero(),heroBefore);assert.deepEqual(galleryRequests,[]);assert.deepEqual(await fs.readFile(repository.catalogPath),galleryCatalogBytes);assert.deepEqual(await fs.readFile(gallerySourceFile),sourceBytes);assert.deepEqual(await fs.readFile(galleryLibraryFile),libraryBytes);assert.deepEqual((await repository.read()).products.find(item=>item.id===sharedGalleryProduct.id),sharedGalleryProduct);
  });
  const galleryStoreRequests=[];
  globalThis.fetch=async(url,options={})=>{
    galleryStoreRequests.push({url:String(url),method:options.method||'GET'});
    if(url==='/api/admin/store'&&!options.method)return catalogApi.GET();
    if(url==='/api/admin/store/products'&&options.method==='PATCH')return api.products.PATCH(request('products','PATCH',options.body));
    throw new Error(`Unexpected media/deletion request: ${url}`);
  };
  await test('Reload discards unsaved gallery edits without a write',async()=>{await button(ui(),'重新載入').props.onClick();assert.deepEqual(galleryOrder(),originalOrder);assert.deepEqual(currentHero(),heroBefore);assert.deepEqual(await fs.readFile(repository.catalogPath),galleryCatalogBytes);assert.ok(galleryStoreRequests.every(item=>item.method==='GET'));});
  await test('Reordered UI payload validates, persists through Save and survives reload',async()=>{
    galleryAction(1,'上移').props.onClick();await nodes(ui(),node=>node.type==='form')[0].props.onSubmit({preventDefault(){}});product=(await repository.read()).products.find(item=>item.id===product.id);assert.deepEqual(product.gallery.map(item=>item.url),[originalOrder[1],originalOrder[0],originalOrder[2]]);assert.deepEqual(product.heroMedia,heroBefore);await button(ui(),'重新載入').props.onClick();assert.deepEqual(galleryOrder(),product.gallery.map(item=>item.url));
  });
  await test('Removed UI payload validates and persists while shared media/library stay intact',async()=>{
    galleryAction(0,'移除').props.onClick();await nodes(ui(),node=>node.type==='form')[0].props.onSubmit({preventDefault(){}});product=(await repository.read()).products.find(item=>item.id===product.id);assert.deepEqual(product.gallery.map(item=>item.url),[originalOrder[0],originalOrder[2]]);assert.deepEqual(product.heroMedia,heroBefore);await button(ui(),'重新載入').props.onClick();assert.deepEqual(galleryOrder(),product.gallery.map(item=>item.url));assert.deepEqual(await fs.readFile(gallerySourceFile),sourceBytes);assert.deepEqual(await fs.readFile(galleryLibraryFile),libraryBytes);assert.deepEqual((await repository.read()).products.find(item=>item.id===sharedGalleryProduct.id),sharedGalleryProduct);assert.ok(galleryStoreRequests.every(item=>item.url==='/api/admin/store'||item.url==='/api/admin/store/products'));
  });
  globalThis.fetch=galleryPreviousFetch;
  await test('Busy editor disables all gallery actions without changing media',async()=>{
    let release;globalThis.fetch=()=>new Promise(resolve=>{release=resolve;});
    try{const pending=button(ui(),'從網站素材庫加入相簿').props.onClick();for(const card of galleryCards())for(const label of ['上移','下移','移除'])assert.equal(button(card,label).props.disabled,true);release(Response.json({assets:[]}));await pending;assert.deepEqual(currentHero(),heroBefore);assert.deepEqual(galleryOrder(),product.gallery.map(item=>item.url));}finally{globalThis.fetch=galleryPreviousFetch;}
  });

  await test('Leaving editor ignores a late upload from previous selection',()=>{const tree=ui();const uploader=nodes(tree,node=>node.type?.name==='MediaUploader')[0];button(tree,'商品分類').props.onClick();const before=JSON.stringify(state);uploader.props.onChange(image('late'));assert.equal(JSON.stringify(state),before);});
  await test('Save 409 retains draft and blocks overwrite until reload',async()=>{
    let tree=ui();button(tree,'商品').props.onClick();tree=ui();nodes(tree,node=>node.type==='button'&&text(node).includes(product.name))[0].props.onClick();control(ui(),'名稱').props.onChange({target:{value:'未儲存內容'}});
    const previousFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({error:'資料已被其他操作更新，請重新載入後再儲存。'},{status:409});try{const form=nodes(ui(),node=>node.type==='form')[0];await form.props.onSubmit({preventDefault(){}});tree=ui();assert.equal(control(tree,'名稱').props.value,'未儲存內容');assert.equal(button(tree,'儲存').props.disabled,true);assert.match(text(tree),/您的未儲存內容仍保留/);assert.ok(button(tree,'重新載入最新版本'));}finally{globalThis.fetch=previousFetch;}
  });
  delete globalThis.__storeUiFixture;delete globalThis.window;
  await test('Default workspace renders on real SSR',async()=>{assert.match(renderToStaticMarkup(await StorePage()),/商店工作區/);});
  await test('Product archive retains values and identity',async()=>{const archived=await archive('products',product);assert.equal(archived.id,product.id);assert.equal(archived.inventory,product.inventory);assert.equal(archived.pvValue,product.pvValue);assert.equal(archived.published,false);assert.ok(archived.archivedAt);product=archived;});
  await test('Category archive retains records and cascades children',async()=>{const other=await create('products',productInput({slug:'category-child',sku:'CATEGORY-CHILD',sectionId:sectionB.id,categoryId:categoryB.id}));categoryB=await archive('categories',categoryB);const saved=(await repository.read()).products.find(item=>item.id===other.id);assert.ok(saved.archivedAt);assert.equal(saved.pvValue,0);});
  await test('Section archive retains graph and cancels publication',async()=>{sectionA=await archive('sections',sectionA);const catalog=await repository.read();assert.ok(catalog.categories.find(item=>item.id===categoryA.id).archivedAt);assert.equal(sectionA.published,false);assert.equal(catalog.products.some(item=>item.id===product.id),true);});
  await test('No hard delete endpoint or unrestricted repository action',()=>{for(const value of Object.values(api))assert.equal('DELETE'in value,false);});
  await test('Corrupt catalog returns failure without replacing contents',async()=>{const bytes=await fs.readFile(repository.catalogPath,'utf8');await fs.writeFile(repository.catalogPath,'{broken');assert.equal((await catalogApi.GET()).status,500);assert.equal(await fs.readFile(repository.catalogPath,'utf8'),'{broken');await fs.writeFile(repository.catalogPath,bytes);});
  await test('Artwork/commerce/reward/wallet/media sources and production JSON unchanged',async()=>assert.deepEqual(await hashes(),before));
  await test('Store CRUD references only Store-specific APIs',async()=>{const source=await fs.readFile('components/admin/StoreWorkspace.tsx','utf8');assert.ok(source.includes('/api/admin/store'));assert.ok(!source.includes('/api/admin/products'));assert.ok(!source.includes('/api/orders'));});
  await test('No new Store uploader, wallet conversion or point configuration',async()=>{const source=await fs.readFile('lib/storeAdminApi.ts','utf8');assert.ok(!source.includes('cloudinary'));assert.ok(!source.includes('membershipCommerce'));assert.ok(!source.includes('pointDisplayName'));});
  await test('Admin entry and responsive stacked layout exist',async()=>{assert.match(await fs.readFile('app/admin/page.tsx','utf8'),/href="\/admin\/store"/);assert.match(await fs.readFile('components/admin/StoreWorkspace.module.css','utf8'),/@media\(max-width:680px\)/);});
  await test('No tracked Store catalog or public Store transaction route introduced',async()=>{
    await fs.access('app/store/page.tsx');
    await fs.access('app/store/[slug]');
    await assert.rejects(fs.access('app/api/store'),{code:'ENOENT'});
    const backupFiles=await fs.readdir(path.join(path.dirname(repository.catalogPath),'backups'));
    assert.ok(backupFiles.length>0,'Actual Store backups must exist for ignore evaluation');
    const catalogPath=path.posix.join('data/store-domain',path.basename(repository.catalogPath));
    const runtimePaths=[catalogPath,`${catalogPath}.lock`,path.posix.join('data/store-domain/backups',backupFiles[0])];
    function git(args,expectedStatus){
      const result=spawnSync('git',args,{cwd:process.cwd(),encoding:'utf8',windowsHide:true});
      assert.ifError(result.error);assert.equal(result.signal,null);
      assert.equal(result.status,expectedStatus,result.stderr||result.stdout||`git ${args.join(' ')} exited ${result.status}`);
      return result.stdout.trim();
    }
    for(const runtimePath of runtimePaths)git(['check-ignore','--no-index','--quiet','--',runtimePath],0);
    git(['check-ignore','--no-index','--quiet','--','data/store-domain/.gitignore'],1);
    assert.equal(git(['ls-files','--error-unmatch','--','data/store-domain/.gitignore'],0),'data/store-domain/.gitignore');
    assert.equal(git(['ls-files','--',...runtimePaths],0),'','Store runtime data must not already be tracked');
  });
  console.log(`J.6C Store Admin: ${passed}/${passed} PASS; isolated fixtures only.`);
}finally{delete globalThis.__storeAdminCookie;delete globalThis.__storeUiFixture;delete globalThis.window;await fs.rm(root,{recursive:true,force:true});}
