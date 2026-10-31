import {NextResponse} from 'next/server';
import {readAdminSession} from '@/lib/adminAuth';
import {isSameOriginRequest} from '@/lib/requestSecurity';
import {LineCardValidationError} from '@/lib/lineCardConfiguration';
import {LineCardConflictError,readLineCardConfig,writeLineCardConfig} from '@/lib/lineCardConfigStore';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){const session=await readAdminSession();if(!session)return json({error:'請先登入後台。'},401);if(session.role!=='owner')return json({error:'此功能限 Owner 使用。'},403);try{return json(await readLineCardConfig());}catch{return json({error:'無法讀取卡片設定，請稍後再試。'},500);}}
export async function PUT(request:Request){
 const session=await readAdminSession();if(!session)return json({error:'請先登入後台。'},401);if(session.role!=='owner'||session.legacy)return json({error:'此功能限 Owner 使用。'},403);
 if(!isSameOriginRequest(request)||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'無法確認操作來源。'},403);
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json({error:'請使用 JSON 設定格式。'},415);
 try{const reader=request.body?.getReader();if(!reader)throw new LineCardValidationError('設定內容不可空白。');const parts:Uint8Array[]=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return json({error:'卡片設定內容過大。'},413);}parts.push(value);}let body;try{body=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new LineCardValidationError('設定格式不正確。');}
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['action','eventKey','overrides','expectedRevision'].includes(key))||!['save','restore'].includes(body.action)||typeof body.eventKey!=='string'||(body.action==='restore'&&Object.hasOwn(body,'overrides')))throw new LineCardValidationError('卡片操作包含不允許的欄位。');
 return json(await writeLineCardConfig({action:body.action,eventKey:body.eventKey,overrides:body.overrides,expectedRevision:body.expectedRevision,actor:session.adminId}));
 }catch(error){const status=error instanceof LineCardConflictError?409:error instanceof LineCardValidationError?400:500;return json({error:status===500?'卡片設定儲存失敗，未變更正式通知。':(error as Error).message},status);}
}
