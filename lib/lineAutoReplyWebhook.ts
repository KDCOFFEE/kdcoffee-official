import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { atomicWriteJson } from "./jsonFileStore";
import { withLineClaimLock } from "./lineAutoReplyClaimLock";
import { getLineAutoReplyDir } from "./storagePaths";
import { readLineProducts, readLineSettings } from "./lineAutoReplyStore";
import { matchLineKeywords, normalizeLineText, resolveLineReply } from "./lineAutoReplyEngine";
import type { CoffeeArtwork } from "@/data/websiteData";
import type { LineAutoReplySettings } from "./lineAutoReplyTypes";

export function verifyCustomerLineSignature(raw: Uint8Array, signature: string | null, secret: string) {
  if (!secret || !signature || !/^[A-Za-z0-9+/]{43}=$/u.test(signature)) return false;
  const supplied = Buffer.from(signature, "base64");
  const expected = createHmac("sha256",secret).update(raw).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied,expected);
}
const TTL = 7*24*60*60*1000, MAX_CLAIMS = 5000;
export async function claimLineEvent(eventKey: string, now = Date.now()) {
  const dir = getLineAutoReplyDir(), file = path.join(dir,"event-claims.json");
  await fs.mkdir(dir,{recursive:true});
  return withLineClaimLock(async()=>{
    let claims: Record<string,number> = {};
    try {
      const parsed = JSON.parse(await fs.readFile(file,"utf8"));
      if (!parsed || parsed.schemaVersion !== 1 || !parsed.claims || typeof parsed.claims !== "object" || Array.isArray(parsed.claims) ||
        Object.entries(parsed.claims).some(([k,v])=> !/^[a-f0-9]{64}$/u.test(k) || typeof v !== "number" || !Number.isFinite(v))) throw new Error("Invalid claim state");
      claims = parsed.claims;
    } catch(error) { if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") throw new Error("Claim state unavailable"); }
    claims = Object.fromEntries(Object.entries(claims).filter(([,time])=>time>now-TTL));
    const key = createHash("sha256").update(eventKey).digest("hex");
    if (claims[key] !== undefined) return false;
    // Never evict a live claim to admit a new event: fail closed at capacity.
    if (Object.keys(claims).length >= MAX_CLAIMS) throw new Error("Claim capacity reached");
    claims[key] = now;
    await atomicWriteJson(file,{schemaVersion:1,claims});
    return true;
  });
}
export async function replyCustomerLine(replyToken: string, messages: readonly string[], fetcher: typeof fetch = fetch) {
  const token = process.env.LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN?.trim();
  if (!token) return { sent:false, code:"customer-token-missing" };
  try {
    const response = await fetcher("https://api.line.me/v2/bot/message/reply",{
      method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
      body:JSON.stringify({replyToken,messages:messages.map(text=>({type:"text",text}))}),signal:AbortSignal.timeout(8000),
    });
    return {sent:response.ok,code:response.ok?"sent":"line-rejected",httpStatus:response.status};
  } catch { return {sent:false,code:"line-request-failed"}; }
}
type Dependencies = {
  loadSettings?: ()=>Promise<LineAutoReplySettings>; loadProducts?: ()=>Promise<CoffeeArtwork[]>;
  claim?: (key:string)=>Promise<boolean>; fetcher?: typeof fetch;
};
export async function handleCustomerLineWebhook(request: Request, dependencies: Dependencies = {}) {
  const secret = process.env.LINE_CUSTOMER_CHANNEL_SECRET?.trim() || "";
  if (!secret) return Response.json({error:"channel-secret-missing"},{status:503});
  // Retain exact bytes. Bound the stream before decoding or parsing.
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  if (reader) {
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength;
      if (bytes>256_000) { await reader.cancel(); return Response.json({error:"payload-too-large"},{status:413}); } chunks.push(chunk.value); }
  }
  const raw = Buffer.concat(chunks);
  if (!verifyCustomerLineSignature(raw,request.headers.get("x-line-signature"),secret)) return Response.json({error:"invalid-signature"},{status:401});
  let body: unknown;
  try { body = JSON.parse(raw.toString("utf8")); } catch { return Response.json({error:"invalid-payload"},{status:400}); }
  if (!body || typeof body !== "object" || !Array.isArray((body as {events?:unknown}).events)) return Response.json({error:"invalid-events"},{status:400});
  const events = (body as {events: unknown[]}).events;
  if (events.length>100) return Response.json({error:"too-many-events"},{status:400});
  let sent = 0, duplicates = 0, failed = 0;
  try {
    // Load dynamically only after authentication; never persist disabled defaults.
    const settings = await (dependencies.loadSettings || readLineSettings)();
    if (!settings.enabled) return Response.json({ok:true,sent,duplicates,failed});
    let catalog: CoffeeArtwork[] | undefined;
    for (const rawEvent of events) {
      if (!rawEvent || typeof rawEvent !== "object") continue;
      const event = rawEvent as {type?:unknown;mode?:unknown;replyToken?:unknown;webhookEventId?:unknown;message?:{type?:unknown;text?:unknown;id?:unknown}};
      if (event.mode === "standby" || event.type !== "message" || event.message?.type !== "text" ||
        typeof event.message.text !== "string" || event.message.text.length>5000 ||
        typeof event.replyToken !== "string" || !event.replyToken || event.replyToken.length>200) continue;
      const beanMatch = settings.beanMenu.enabled && matchLineKeywords(normalizeLineText(event.message.text),settings.beanMenu.keywords,settings.beanMenu.matchMode);
      if (beanMatch) catalog ??= await (dependencies.loadProducts || readLineProducts)();
      const result = resolveLineReply(event.message.text,settings,catalog || [],process.env.MEMBER_SITE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "");
      if (!result.messages.length) continue;
      if (!process.env.LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN?.trim()) { failed++; continue; }
      const key = typeof event.webhookEventId === "string" && event.webhookEventId.length<=200 && event.webhookEventId
        ? `event:${event.webhookEventId}` : typeof event.message.id === "string" && event.message.id.length<=200 && event.message.id
          ? `message:${event.message.id}` : `reply:${event.replyToken}`;
      if (!(await (dependencies.claim || claimLineEvent)(key))) { duplicates++; continue; }
      // Persist claim before one external attempt; failures are retained to avoid blind token retries.
      const delivery = await replyCustomerLine(event.replyToken,result.messages,dependencies.fetcher);
      if (delivery.sent) sent++; else failed++;
    }
    return Response.json({ok:true,sent,duplicates,failed});
  } catch { return Response.json({error:"auto-reply-unavailable"},{status:503}); }
}
