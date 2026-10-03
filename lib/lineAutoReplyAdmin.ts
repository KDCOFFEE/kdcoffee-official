import "server-only";
import { readAdminSession } from "./adminAuth";
import { isSameOriginRequest } from "./requestSecurity";
import { LineSettingsError, readLineProducts, readLineSettings, saveLineSettings, validateLineSettings } from "./lineAutoReplyStore";
import { isLineBeanAvailable, lineProductId, resolveLineReply } from "./lineAutoReplyEngine";

type AdminDependencies = { authorized?: ()=>Promise<boolean> };
export async function handleLineReplyAdmin(request: Request, action: "get" | "save" | "simulate", dependencies: AdminDependencies = {}) {
  // Same owner session and origin policy as the existing owner-managed copy editor.
  const authorized = dependencies.authorized ? await dependencies.authorized() : (await readAdminSession())?.role === "owner";
  if (!authorized) return Response.json({error:"未授權"},{status:401});
  if (action !== "get" && !isSameOriginRequest(request)) return Response.json({error:"無法確認操作來源。"},{status:403});
  try {
    if (action === "get") {
      const [settings,catalog] = await Promise.all([readLineSettings(),readLineProducts()]);
      return Response.json({settings,products:catalog.map(p=>({productId:lineProductId(p),name:p.name,available:isLineBeanAvailable(p),description:p.shortCopy?.trim() || p.mood?.trim() || ""}))},{headers:{"Cache-Control":"no-store"}});
    }
    const raw = await request.text();
    if (raw.length>256_000) return Response.json({error:"設定內容過大。"},{status:413});
    let body;
    try { body = JSON.parse(raw); } catch { throw new LineSettingsError("設定格式不正確。"); }
    if (action === "save") return Response.json({settings:await saveLineSettings(body?.settings,body?.expectedRevision)},{headers:{"Cache-Control":"no-store"}});
    if (typeof body?.message !== "string" || body.message.length>5000) throw new LineSettingsError("測試訊息格式或長度不正確。");
    // Preview the draft without saving it, using the exact production engine and live catalog.
    const settings = body.settings ? validateLineSettings(body.settings) : await readLineSettings();
    const result = resolveLineReply(body.message,settings,await readLineProducts(),process.env.MEMBER_SITE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "");
    return Response.json({result},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    const status = error instanceof LineSettingsError ? error.status : 500;
    return Response.json({error:error instanceof LineSettingsError ? error.message : "設定無法安全處理，請稍後再試。"},{status});
  }
}
