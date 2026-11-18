import {AdminAuthorizationError,requireAdminAuthenticated} from '@/lib/adminAuthorization';
import {readProductionSourceCheck} from '@/lib/googleProductProductionSourceCheck';
import {productionDiagnosticFailure,PRODUCTION_DIAGNOSTIC_FLAGS} from '@/lib/googleProductProductionSourceCheckContract';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
const headers={'Cache-Control':'private, no-store, max-age=0',Vary:'Cookie','X-Content-Type-Options':'nosniff'};
/** Owner authorization precedes capability, source paths and all product IO. */
export async function GET(request:Request){
  try{
    const session=await requireAdminAuthenticated();
    if(session.legacy||session.role!=='owner')throw new AdminAuthorizationError(403);
    const url=new URL(request.url),origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');
    const publicOrigin='https://www.kdcoffee1962.com',publicHost='www.kdcoffee1962.com';
    const host=request.headers.get('host'),forwardedHost=request.headers.get('x-forwarded-host');
    // Host is an allowlist check, never session authority. Forwarded-Host cannot grant access.
    const canonicalUrl=url.origin===publicOrigin&&(host===null||host===publicHost);
    const internalUrl=['http:','https:'].includes(url.protocol)&&
      ['localhost','127.0.0.1','0.0.0.0','[::1]'].includes(url.hostname)&&host===publicHost&&
      (origin===publicOrigin||site==='same-origin');
    if(url.search||(!canonicalUrl&&!internalUrl)||
      (forwardedHost!==null&&forwardedHost!==publicHost)||
      (origin!==null&&origin!==publicOrigin)||(site!==null&&!['same-origin','none'].includes(site)))
      return Response.json({error:'INVALID_DIAGNOSTIC_REQUEST',...PRODUCTION_DIAGNOSTIC_FLAGS},{status:400,headers});
    const result=await readProductionSourceCheck();
    return Response.json(result,{status:result.state==='diagnostic_complete'?200:503,headers});
  }catch(error){
    if(error instanceof AdminAuthorizationError)return Response.json({error:error.status===401?'UNAUTHENTICATED':'FORBIDDEN',...PRODUCTION_DIAGNOSTIC_FLAGS},{status:error.status,headers});
    return Response.json(productionDiagnosticFailure('source_unreadable'),{status:503,headers});
  }
}
