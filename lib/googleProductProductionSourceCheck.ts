import 'server-only';
import path from 'node:path';
import {constants} from 'node:fs';
import {lstat,realpath,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getStorageRootContract,getWebsiteDataFile} from './storagePaths';
import {isProductListedInWorks} from './productListing';
import {readCanonicalCoffeeCommercialContract} from './googleProductCoffeeCanonicalContract';
import {productionDiagnosticFailure} from './googleProductProductionSourceCheckContract';
import type {CoffeeProductDiagnostic,ProductionSourceCheckResult} from './googleProductProductionSourceCheckContract';

const MAX_BYTES=8*1024*1024, MAX_RESPONSE_BYTES=1024*1024;
type Stat=Readonly<{size:number;dev:number;ino:number;mtimeMs:number;ctimeMs:number;nlink:number;
  isFile:()=>boolean;isDirectory:()=>boolean;isSymbolicLink:()=>boolean}>;
/** Explicit, trusted test/server port only. Never constructed from HTTP input. No write operations. */
export type ProductionDiagnosticPorts=Readonly<{
  environment:Readonly<{enabled:boolean;production:boolean;platform:string;serviceName:string;
    serviceId:string;deploymentCommit:string}>;
  storage:()=>Readonly<{root:string;source:string;railwayMountPath:string}>;
  websiteFile:()=>string;
  io:Readonly<{lstat:(file:string)=>Promise<Stat>;realpath:(file:string)=>Promise<string>;
    readBounded:(file:string,maxBytes:number)=>Promise<Uint8Array>}>;
}>;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const text=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=200&&v.trim()===v&&!/[\u0000-\u001f\u007f]/u.test(v);
type FileIdentity=Pick<Stat,'dev'|'ino'|'size'|'mtimeMs'|'ctimeMs'>;
function identity(s:FileIdentity):FileIdentity{return {dev:s.dev,ino:s.ino,size:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs};}
function sameStat(a:FileIdentity,b:FileIdentity){return a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs;}
function errorCode(error:unknown){return record(error)&&typeof error.code==='string'?error.code:'';}
function within(root:string,target:string){const relative=path.posix.relative(root,target);return relative===''||(!relative.startsWith('../')&&relative!=='..'&&!path.posix.isAbsolute(relative));}
function analyze(value:unknown){
  if(!record(value)||!integer(value.version)||typeof value.updatedAt!=='string'||
    !Number.isFinite(Date.parse(value.updatedAt))||new Date(value.updatedAt).toISOString()!==value.updatedAt||
    !record(value.menu)||!Array.isArray(value.menu.products)||value.menu.products.length>1000)throw Error('INVALID_DOCUMENT');
  const skuCounts=new Map<string,number>();
  for(const p of value.menu.products){
    if(!record(p)||(p.skus!==undefined&&!Array.isArray(p.skus)))throw Error('INVALID_DOCUMENT');
    if(Array.isArray(p.skus)){
      if(p.skus.length>100)throw Error('INVALID_DOCUMENT');
      for(const s of p.skus)if(record(s)&&text(s.id))skuCounts.set(s.id,(skuCounts.get(s.id)??0)+1);
    }
  }
  const diagnostics:CoffeeProductDiagnostic[]=value.menu.products.map((p:unknown)=>{
    if(!record(p))throw Error('INVALID_DOCUMENT');
    if(p.skus!==undefined&&!Array.isArray(p.skus))throw Error('INVALID_DOCUMENT');
    const skus=Array.isArray(p.skus)?p.skus:null;
    if(skus&&skus.length>100)throw Error('INVALID_DOCUMENT');
    const missing=!skus?.length;
    const reasons:CoffeeProductDiagnostic['reasons'][number][]=[];
    if(missing)reasons.push('missing_persisted_skus');
    if(skus?.some((s:unknown)=>record(s)&&text(s.id)&&(skuCounts.get(s.id)??0)>1))reasons.push('duplicate_persisted_sku');
    if(skus?.some((s:unknown)=>record(s)&&!integer(s.price)))reasons.push('invalid_sku_price');
    if(skus?.some((s:unknown)=>record(s)&&!integer(s.stock)))reasons.push('invalid_sku_stock');
    if(skus?.some((s:unknown)=>!record(s)||!text(s.id)||!text(s.label)||typeof s.detail!=='string'||
      s.detail.length>2000||/[\u0000-\u001f\u007f]/u.test(s.detail)))reasons.push('invalid_sku_fields');
    const incomplete=missing||reasons.length>0;
    if(skus?.some((s:unknown)=>record(s)&&s.kind===undefined))reasons.push('missing_preparation_kind');
    if(skus?.some((s:unknown)=>record(s)&&s.kind==='beans'))reasons.push('beans_ground_unverified');
    return {productId:text(p.id)?p.id:null,slug:text(p.slug)?p.slug:null,name:text(p.name)?p.name:null,
      comingSoon:p.status==='coming_soon',worksListStatus:isProductListedInWorks({inMonthlyMenu:p.inMonthlyMenu,status:p.status,showWhenSoldOut:p.showWhenSoldOut})?'listed':'not_listed',
      active:typeof p.active==='boolean'?p.active:null,purchasable:typeof p.purchasable==='boolean'?p.purchasable:null,
      persistedSkuEntries:skus?skus.length:null,skuIncomplete:incomplete,reasons};
  });
  let validatedSkuCount:number|null=null;
  // Exact transplanted validator: no omission of drafts, normalization or purchase fallback.
  try{validatedSkuCount=readCanonicalCoffeeCommercialContract(value).rows.length;}catch{/* Remains invalid; diagnostics are not offers. */}
  return {version:value.version,updatedAt:value.updatedAt,productCount:diagnostics.length,
    rawPersistedSkuEntries:diagnostics.reduce((n,p)=>n+(p.persistedSkuEntries??0),0),validatedSkuCount,
    notListedProductCount:diagnostics.filter(p=>p.worksListStatus==='not_listed').length,
    comingSoonProductCount:diagnostics.filter(p=>p.comingSoon).length,
    skuIncompleteProductCount:diagnostics.filter(p=>p.skuIncomplete).length,diagnostics};
}

/** Isolated diagnostic engine. It never issues transaction/image authority or a Store snapshot. */
export async function inspectProductionCoffeeSource(ports:ProductionDiagnosticPorts):Promise<ProductionSourceCheckResult>{
  const env={...ports.environment};
  if(!env.enabled)return productionDiagnosticFailure('capability_off');
  if(!env.production||env.platform!=='linux'||env.serviceName!=='kdcoffee-official'||!env.serviceId||
    !/^[a-f0-9]{40}$/.test(env.deploymentCommit))return productionDiagnosticFailure('runtime_unverified');
  let root:string,mount:string,file:string;
  try{
    const storage=ports.storage();root=storage.root;mount=storage.railwayMountPath;
    if(!root||!mount||!['KD_DATA_DIR','RAILWAY_VOLUME_MOUNT_PATH'].includes(storage.source)||!path.posix.isAbsolute(root)||!path.posix.isAbsolute(mount)||
      root==='/'||mount==='/'||root!==path.posix.normalize(root)||mount!==path.posix.normalize(mount)||
      root.includes('\0')||mount.includes('\0')||!within(mount,root))throw Error('INVALID_STORAGE');
    file=ports.websiteFile();
    if(file!==path.posix.join(root,'store','website-data.json'))throw Error('INVALID_STORAGE');
  }catch{return productionDiagnosticFailure('storage_unverified');}
  const result=productionDiagnosticFailure('source_unreadable');
  const base={...result,deploymentCommit:env.deploymentCommit,deploymentIdentity:'server_metadata_only' as const};
  let phase:'before'|'after'|'complete'='before';
  const snapshot=async()=>{
    // Verify all ancestors, including the mount. Never follow filesystem redirects.
    const parts=file.split('/').filter(Boolean);let current='';
    for(const [index,part] of parts.entries()){
      current+='/'+part;const s=await ports.io.lstat(current);
      if(s.isSymbolicLink()||await ports.io.realpath(current)!==current||
        (index<parts.length-1&&!s.isDirectory()))throw Error('INVALID_PATH');
    }
    const before=await ports.io.lstat(file);
    if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||!integer(before.size)||before.size<2||before.size>MAX_BYTES)throw Error('INVALID_FILE');
    const pinned=identity(before);
    const bytes=await ports.io.readBounded(file,MAX_BYTES),after=await ports.io.lstat(file);
    if(!(bytes instanceof Uint8Array)||bytes.length!==pinned.size||!sameStat(pinned,after))throw Error('SOURCE_CHANGED');
    return {bytes,stat:identity(after),sha256:createHash('sha256').update(bytes).digest('hex')};
  };
  try{
    const first=await snapshot();
    let summary:ReturnType<typeof analyze>|null=null;
    try{summary=analyze(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(first.bytes)));}catch{/* Invalid, not empty. */}
    phase='after';const last=await snapshot();
    if(first.sha256!==last.sha256||!sameStat(first.stat,last.stat))throw Error('SOURCE_CHANGED');
    phase='complete';
    const valid=summary!==null&&summary.validatedSkuCount!==null;
    const response:ProductionSourceCheckResult={...base,state:valid?'diagnostic_complete':'blocked',
      coffee:{...base.coffee,physicalState:'present',documentStructure:summary?'valid_envelope':'invalid',
        commercialValidation:valid?'valid_projection':'invalid',consistency:'stable_bracket',sha256:first.sha256,
        ...(summary??{})},reasons:[...(valid?[]:['source_invalid' as const]),'transaction_unverified','image_unapproved','atomicity_unproven','store_not_requested']};
    if(Buffer.byteLength(JSON.stringify(response),'utf8')>MAX_RESPONSE_BYTES)throw Error('INVALID_RESPONSE_SIZE');
    return response;
  }catch(error){
    const changed=phase==='after'||(error instanceof Error&&error.message==='SOURCE_CHANGED');
    const missing=!changed&&errorCode(error)==='ENOENT';
    const failure=productionDiagnosticFailure(changed?'source_changed':missing?'source_missing':'source_unreadable');
    return {...failure,deploymentCommit:env.deploymentCommit,deploymentIdentity:'server_metadata_only',
      coffee:{...failure.coffee,physicalState:missing?'missing':'unverified',consistency:changed?'changed':'not_checked'}};
  }
}

async function readBounded(file:string,maxBytes:number):Promise<Uint8Array>{
  const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const before=await handle.stat();
    if(!before.isFile()||before.nlink!==1||before.size<2||before.size>maxBytes)throw Error('INVALID_FILE');
    const buffer=Buffer.alloc(before.size+1);let offset=0;
    while(offset<buffer.length){const r=await handle.read(buffer,offset,buffer.length-offset,offset);if(!r.bytesRead)break;offset+=r.bytesRead;}
    const after=await handle.stat(),current=await lstat(file);
    if(offset!==before.size||!sameStat(before,after)||!sameStat(after,current)||current.isSymbolicLink())throw Error('SOURCE_CHANGED');
    return buffer.subarray(0,offset);
  }finally{await handle.close();}
}
/** Sole HTTP-facing service: no arguments, arbitrary paths, env loader or production read on Windows. */
export function readProductionSourceCheck():Promise<ProductionSourceCheckResult>{
  return inspectProductionCoffeeSource({environment:{
    enabled:process.env.GOOGLE_PRODUCT_SOURCE_DIAGNOSTIC_ENABLED==='true',production:process.env.NODE_ENV==='production',
    platform:process.platform,serviceName:process.env.RAILWAY_SERVICE_NAME??'',serviceId:process.env.RAILWAY_SERVICE_ID??'',
    deploymentCommit:process.env.RAILWAY_GIT_COMMIT_SHA??''},storage:getStorageRootContract,websiteFile:getWebsiteDataFile,
    io:{lstat,realpath,readBounded}});
}
