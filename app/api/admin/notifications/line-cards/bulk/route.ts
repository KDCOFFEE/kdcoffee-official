import {NextResponse} from 'next/server';
import {readAdminSession} from '@/lib/adminAuth';
import {isSameOriginRequest} from '@/lib/requestSecurity';
import {LineCardValidationError} from '@/lib/lineCardConfiguration';
import {parseBulkModeRequest} from '@/lib/lineCardBulkMode';
import {LineCardConflictError,writeLineCardBulkConfig} from '@/lib/lineCardConfigStore';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 const session=await readAdminSession();if(!session)return json({error:'請先登入後台。'},401);
 if(session.role!=='owner'||session.legacy)return json({error:'此功能限 Owner 使用。'},403);
 if(!isSameOriginRequest(request)||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'無法確認操作來源。'},403);
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json({error:'請使用 JSON 設定格式。'},415);
 try{
  const reader=request.body?.getReader();if(!reader)throw new LineCardValidationError('設定不可空白。');
  const parts:Uint8Array[]=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return json({error:'批次設定內容過大。'},413);}parts.push(value);}
  let body;try{body=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new LineCardValidationError('設定格式不正確。');}
  return json(await writeLineCardBulkConfig(parseBulkModeRequest(body),{actor:session.adminId}));
 }catch(error){const status=error instanceof LineCardConflictError?409:error instanceof LineCardValidationError?400:500;return json({error:status===500?'批次儲存失敗，未回報成功。請重新讀取設定確認結果。':(error as Error).message},status);}
}
