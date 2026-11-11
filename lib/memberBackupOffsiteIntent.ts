import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import type {VerifiedMemberBackup} from './memberBackup';
import {createEncryptedMemberBackupArtifact,type EncryptedMemberBackupArtifact} from './memberBackupEncryption';

export const offsiteHash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
type Intent={version:1;backupId:string;zipSha256:string;keyId:string;format:EncryptedMemberBackupArtifact['format'];cipherSha256:string;bytes:number};
/** Server-authenticated, immutable intent binds verified ZIP to the original random CMS bytes.
 * Kept outside the manifest inventory; never included in the downloadable ZIP.
 * Losing/rotating the signing secret requires review, never metadata-only recovery.
 */
export async function preparedEncryptedBackup(verified:VerifiedMemberBackup,zip:Uint8Array,options:{certificatePath:string;opensslPath:string;signingSecret:string;readOnly?:boolean}) {
 if(options.signingSecret.length<32)throw Error('Encrypted backup intent signing secret is unavailable');
 const stat=await fs.lstat(verified.directory);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Invalid verified backup directory');
 const recordFile=path.join(verified.directory,'encrypted-offsite-intent.json'),bodyFile=path.join(verified.directory,'encrypted-offsite.kdcbak');
 const zipSha256=offsiteHash(zip),keyId=offsiteHash(await fs.readFile(options.certificatePath)).slice(0,32);
 const mac=(intent:Intent)=>createHmac('sha256',options.signingSecret).update('KDCOFFEE-OFFSITE-INTENT-v1\0').update(JSON.stringify(intent)).digest('hex');
 const existing=await fs.readFile(recordFile,'utf8').catch((e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return null;throw e;});
 if(existing!==null){
  if((await fs.lstat(recordFile)).isSymbolicLink()||(await fs.lstat(bodyFile)).isSymbolicLink())throw Error('Encrypted offsite artifacts must be regular files');
  const saved=JSON.parse(existing) as {intent:Intent;mac:string};const i=saved.intent;
  if(!i||typeof saved.mac!=='string'||!/^[a-f0-9]{64}$/.test(saved.mac)||!timingSafeEqual(Buffer.from(saved.mac,'hex'),Buffer.from(mac(i),'hex')))throw Error('Encrypted backup intent authentication failed');
  if(i.version!==1||i.backupId!==verified.manifest.backupId||i.zipSha256!==zipSha256||i.keyId!==keyId||i.format!=='KDCOFFEE-KDCBAK-CMS-1')throw Error('Encrypted backup intent identity mismatch');
  const body=await fs.readFile(bodyFile);if(body.length!==i.bytes||offsiteHash(body)!==i.cipherSha256)throw Error('Saved encrypted backup is incomplete or corrupt');
  return {backupId:i.backupId,name:`kdcoffee-member-backup_${i.backupId}.kdcbak`,format:i.format,keyId:i.keyId,sha256:i.cipherSha256,plaintextZipSha256:i.zipSha256,bytes:i.bytes,body};
 }
 if(options.readOnly)throw Error('No authenticated encrypted backup intent exists; remote identity is not verified');
 // Never replace partial/unrecognised historical artifacts. A partial write fails closed.
 if(await fs.lstat(bodyFile).then(()=>true,(e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return false;throw e;}))throw Error('Encrypted backup artifact has no authenticated intent; review required');
 const artifact=await createEncryptedMemberBackupArtifact(verified,{certificatePath:options.certificatePath,opensslPath:options.opensslPath,createZipArtifact:async()=>({bytes:zip.length,body:new ReadableStream<Uint8Array>({start(c){c.enqueue(zip);c.close();}})})});
 if(artifact.keyId!==keyId||artifact.plaintextZipSha256!==zipSha256||offsiteHash(await fs.readFile(options.certificatePath)).slice(0,32)!==keyId)throw Error('Public certificate changed during encryption');
 const intent:Intent={version:1,backupId:artifact.backupId,zipSha256,keyId,format:artifact.format,cipherSha256:artifact.sha256,bytes:artifact.bytes};
 await fs.writeFile(bodyFile,artifact.body,{flag:'wx',mode:0o600});
 if(offsiteHash(await fs.readFile(bodyFile))!==artifact.sha256)throw Error('Encrypted artifact persistence verification failed');
 await fs.writeFile(recordFile,JSON.stringify({intent,mac:mac(intent)}),{flag:'wx',mode:0o600});
 return artifact;
}
