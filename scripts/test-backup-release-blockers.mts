import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as drive from '../lib/googleDriveMemberBackup';
import type {VerifiedMemberBackup} from '../lib/memberBackup';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'kd-release-blockers-'));
const openssl='C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe';
const environment={AUTH_SESSION_SECRET:'synthetic-only-intent-authentication-key-12345',GOOGLE_DRIVE_CLIENT_ID:'MOCK',GOOGLE_DRIVE_CLIENT_SECRET:'MOCK',GOOGLE_DRIVE_REFRESH_TOKEN:'MOCK',GOOGLE_DRIVE_BACKUP_FOLDER_ID:'synthetic_folder_123',KD_MEMBER_BACKUP_ENCRYPTION_ENABLED:'true'};
const cert=path.join(root,'test-cert.pem'),raw=path.join(root,'test-key.pem');
const run=(args:string[])=>assert.equal(spawnSync(openssl,args,{stdio:'ignore',windowsHide:true}).status,0);
const zip=Buffer.from('PK\x03\x04synthetic verified ZIP bytes for release regression');
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
let passed=0;const check=async(name:string,fn:()=>Promise<unknown>)=>{await fn();console.log('PASS '+(++passed)+' '+name);};
async function fixture(sequence:number){
 const directory=path.join(root,'snapshot-'+sequence);await fs.mkdir(directory);const backupId='20261112T010203Z_'+sequence.toString(16).padStart(8,'0');
 const verified={directory,files:[],manifest:{backupId,status:'verified',source:'test',environment:'test',createdAt:'2026-11-12T01:02:03Z',gitCommit:'synthetic',counts:{canonicalMembers:1,orders:1}}} as unknown as VerifiedMemberBackup;
 let remote:Record<string,unknown>|null=null,bytes=new Uint8Array(),initializations=0,puts=0,downloads=0,mode='normal',failAfterStore=false;
 const calls:string[]=[];
 const fetcher:typeof fetch=async(input,init={})=>{const url=new URL(String(input));calls.push((init.method??'GET')+' '+url.pathname+(url.searchParams.get('alt')==='media'?' media':''));
  if(url.hostname==='oauth2.googleapis.com')return json({access_token:'MOCK'});
  if(url.pathname==='/drive/v3/files')return json({files:remote?(mode==='duplicate'?[remote,remote]:[remote]):[]});
  if(url.pathname==='/upload/drive/v3/files'&&init.method==='POST'){initializations++;remote=null;const meta=JSON.parse(String(init.body));remote={...meta,id:'synthetic_file_123',size:'0',createdTime:'2026-11-12T01:03:00Z'};return new Response(null,{headers:{location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=mock'}});}
  if(url.searchParams.get('upload_id')==='mock'&&init.method==='PUT'){
   puts++;if(mode==='interrupt'){remote=null;return json({},500);}
   bytes=new Uint8Array(await new Response(init.body).arrayBuffer());remote!.size=String(bytes.length);
   if(failAfterStore){failAfterStore=false;return json({},500);}return json(remote);
  }
  if(url.pathname==='/drive/v3/files/synthetic_file_123'&&url.searchParams.get('alt')==='media'){downloads++;if(mode==='read-fail')return new Response(null,{status:503});return new Response(mode==='tamper'?Uint8Array.from([1,2,3]):bytes);}
  if(url.pathname==='/drive/v3/files/synthetic_file_123')return json(remote);
  throw Error('Unexpected mock call');};
 const options={environment,fetcher,resolveVerifiedBackup:async()=>verified,createZipArtifact:async()=>({bytes:zip.length,body:new ReadableStream<Uint8Array>({start(c){c.enqueue(zip);c.close();}})}),encryption:{certificatePath:cert,opensslPath:openssl}};
 return {backupId,verified,options,upload:()=>drive.uploadVerifiedMemberBackupToGoogleDrive(backupId,options),state:()=>({remote,bytes,initializations,puts,downloads,calls}),mode:(v:string)=>{mode=v;},mutate:(fn:(r:Record<string,unknown>)=>void)=>fn(remote!),failAfterStore:()=>{failAfterStore=true;}};
}
try{
 run(['genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:3072','-out',raw]);run(['req','-new','-x509','-key',raw,'-out',cert,'-subj','/CN=TEST ONLY']);
 const f=await fixture(1);
 await check('first upload saves authenticated ZIP/cipher identity and reads remote bytes',async()=>{assert.equal((await f.upload()).status,'uploaded');assert.equal(f.state().downloads,1);const p=f.state().remote!.appProperties as Record<string,string>;assert.equal(p.kdZipSha256,hash(zip));assert.equal(p.kdCipherSha256,hash(f.state().bytes));});
 const original=new Uint8Array(f.state().bytes);
 await check('same snapshot/ZIP/key retry reads original remote ciphertext with no new PUT',async()=>{assert.equal((await f.upload()).status,'already-uploaded');assert.equal(f.state().initializations,1);assert.equal(f.state().downloads,2);assert.deepEqual(f.state().bytes,original);});
 await check('retention offsite lookup downloads and validates existing ciphertext',async()=>{assert.ok(await drive.findVerifiedMemberBackupOnGoogleDrive(f.backupId,f.options));assert.equal(f.state().downloads,3);});
 await check('same snapshot different ZIP hash rejects before upload',async()=>{await assert.rejects(()=>drive.uploadVerifiedMemberBackupToGoogleDrive(f.backupId,{...f.options,createZipArtifact:async()=>({bytes:zip.length,body:new ReadableStream<Uint8Array>({start(c){c.enqueue(Buffer.alloc(zip.length));c.close();}})})}));assert.equal(f.state().initializations,1);});
 await check('different certificate/keyId cannot merge',async()=>{const other=path.join(root,'other-cert.pem');run(['req','-new','-x509','-key',raw,'-out',other,'-subj','/CN=OTHER TEST']);await assert.rejects(()=>drive.uploadVerifiedMemberBackupToGoogleDrive(f.backupId,{...f.options,encryption:{certificatePath:other,opensslPath:openssl}}));});
 await check('tampered remote ciphertext rejects upload retry and retention lookup',async()=>{f.mode('tamper');await assert.rejects(()=>f.upload(),/readback checksum/);await assert.rejects(()=>drive.findVerifiedMemberBackupOnGoogleDrive(f.backupId,f.options),/readback checksum/);f.mode('normal');});
 await check('duplicate remote canonical objects fail closed',async()=>{f.mode('duplicate');await assert.rejects(()=>f.upload(),/Multiple/);f.mode('normal');});
 await check('wrong keyId/ZIP metadata rejects',async()=>{const saved=structuredClone(f.state().remote!.appProperties);f.mutate(r=>{r.appProperties={...(r.appProperties as object),kdKeyId:'wrong'};});await assert.rejects(()=>f.upload());f.mutate(r=>{r.appProperties={...(saved as object),kdZipSha256:'0'.repeat(64)};});await assert.rejects(()=>f.upload());f.mutate(r=>{r.appProperties=saved;});});
 await check('incomplete remote size rejects',async()=>{const size=f.state().remote!.size;f.mutate(r=>{r.size='1';});await assert.rejects(()=>f.upload());f.mutate(r=>{r.size=size;});});
 await check('tampered local intent cannot trust matching remote metadata',async()=>{const file=path.join(f.verified.directory,'encrypted-offsite-intent.json'),saved=await fs.readFile(file);const record=JSON.parse(saved.toString());record.intent.zipSha256='0'.repeat(64);await fs.writeFile(file,JSON.stringify(record));await assert.rejects(()=>f.upload());await fs.writeFile(file,saved);});
 await check('interrupted upload retries original saved ciphertext',async()=>{const g=await fixture(2);g.mode('interrupt');await assert.rejects(()=>g.upload());const saved=await fs.readFile(path.join(g.verified.directory,'encrypted-offsite.kdcbak'));g.mode('normal');await g.upload();assert.ok(saved.equals(Buffer.from(g.state().bytes)),'Ciphertext bytes differ');assert.equal((await g.upload()).status,'already-uploaded');assert.equal(g.state().puts,2);});
 await check('upload completed but response lost: retry finds remote with no duplicate upload',async()=>{const g=await fixture(3);g.failAfterStore();await assert.rejects(()=>g.upload());assert.equal((await g.upload()).status,'already-uploaded');assert.equal(g.state().initializations,1);});
 await check('lookup without authenticated intent does not encrypt or create local artifacts',async()=>{const g=await fixture(4);await assert.rejects(()=>drive.findVerifiedMemberBackupOnGoogleDrive(g.backupId,g.options));assert.deepEqual(await fs.readdir(g.verified.directory),[]);assert.equal(g.state().initializations,0);});
 await check('concurrent encrypted retries serialize and create only one remote object',async()=>{const g=await fixture(5);const results=await Promise.all([g.upload(),g.upload()]);assert.deepEqual(results.map(r=>r.status).sort(),['already-uploaded','uploaded']);assert.equal(g.state().initializations,1);});
 const priorFlag=process.env.KD_MEMBER_BACKUP_ENCRYPTION_ENABLED;process.env.KD_MEMBER_BACKUP_ENCRYPTION_ENABLED='true';
 try{
 const history=path.join(root,'history');await fs.mkdir(history);await fs.writeFile(path.join(history,'old.zip'),'OLD SYNTHETIC');const before=await fs.readFile(path.join(history,'old.zip'));
 const forbidden=async()=>{throw Error('cleanup callback must not run');};let creates=0;
 const acceptance={cleanupMode:'first-encrypted-acceptance' as const,acceptanceStorageCheck:async()=>null as never,createBackup:async()=>{creates++;return {manifest:f.verified.manifest} as never;},uploadBackup:()=>f.upload(),preflightStorage:forbidden,pruneBackups:forbidden,driveRetentionPlan:forbidden,finalStorage:async()=>null};
 await check('single-call no-cleanup bypasses both local cleanup paths and Drive retention',async()=>{const result=await drive.runScheduledMemberBackupOffsiteWorkflow(acceptance);assert.equal(result.driveRetention,null);assert.equal(creates,1);assert.deepEqual(await fs.readFile(path.join(history,'old.zip')),before);assert.ok(f.state().remote);assert.ok(f.state().calls.every(c=>!c.startsWith('DELETE')&&!c.startsWith('PATCH')));});
 await check('readback failure returns no success and invokes no cleanup',async()=>{f.mode('tamper');await assert.rejects(()=>drive.runScheduledMemberBackupOffsiteWorkflow(acceptance),/readback checksum/);f.mode('normal');assert.deepEqual(await fs.readFile(path.join(history,'old.zip')),before);});
 await check('encryption or interrupted PUT failure never falls back to ZIP and never prunes',async()=>{
  for(const failure of ['certificate','upload']){const g=await fixture(failure==='certificate'?6:7);if(failure==='upload')g.mode('interrupt');
   await assert.rejects(()=>drive.runScheduledMemberBackupOffsiteWorkflow({...acceptance,createBackup:async()=>({manifest:g.verified.manifest}) as never,uploadBackup:()=>drive.uploadVerifiedMemberBackupToGoogleDrive(g.backupId,{...g.options,encryption:{certificatePath:failure==='certificate'?path.join(root,'missing.pem'):cert,opensslPath:openssl}})}));
   assert.ok(g.state().calls.every(c=>!c.startsWith('DELETE')&&!c.startsWith('PATCH')));if(failure==='certificate')assert.equal(g.state().initializations,0);else assert.ok(String(g.state().remote?.name??'').endsWith('.zip')===false);
  }assert.deepEqual(await fs.readFile(path.join(history,'old.zip')),before);
 });
 await check('no-cleanup insufficient capacity fails before snapshot creation',async()=>{const old=creates;await assert.rejects(()=>drive.runScheduledMemberBackupOffsiteWorkflow({...acceptance,acceptanceStorageCheck:async()=>{throw Error('insufficient capacity');}}));assert.equal(creates,old);});
 await check('acceptance mode does not leak into next normal scheduled call',async()=>{const calls:string[]=[];await drive.runScheduledMemberBackupOffsiteWorkflow({createBackup:async()=>({manifest:f.verified.manifest}) as never,uploadBackup:()=>f.upload(),preflightStorage:async()=>{calls.push('preflight');return null;},pruneBackups:async()=>{calls.push('prune');},driveRetentionPlan:async()=>{calls.push('drive-plan');return null;},finalStorage:async()=>null});assert.deepEqual(calls,['preflight','prune','drive-plan']);});
 }finally{if(priorFlag===undefined)delete process.env.KD_MEMBER_BACKUP_ENCRYPTION_ENABLED;else process.env.KD_MEMBER_BACKUP_ENCRYPTION_ENABLED=priorFlag;}
 console.log('RELEASE_BLOCKER_FIX '+passed+'/'+passed+' PASS');
}finally{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(root,{recursive:true,force:true});}
