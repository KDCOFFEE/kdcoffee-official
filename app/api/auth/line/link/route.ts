import { NextResponse } from "next/server";

import { createLineLinkTransaction } from "@/lib/memberIdentity";
import { getCurrentMember, getMemberLoginMethods, randomState } from "@/lib/memberAuth";

function resolveBaseUrl(request: Request, requestUrl: URL) {
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || requestUrl.origin;
}

export async function POST(request: Request) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.redirect(new URL("/member", request.url));
  const methods = await getMemberLoginMethods(member);
  if (methods.lineLinked) {
    return NextResponse.redirect(new URL("/member?linked=line", request.url), 303);
  }

  const channelId = process.env.LINE_LOGIN_CHANNEL_ID?.trim();
  if (!channelId) {
    return NextResponse.json({ error: "目前無法連結 LINE，請稍後再試。" }, { status: 503 });
  }

  const requestUrl = new URL(request.url);
  const baseUrl = resolveBaseUrl(request, requestUrl);
  const state = randomState();
  const nonce = randomState();
  const transaction = await createLineLinkTransaction(member.id, state);
  const redirectUri = `${baseUrl}/api/auth/line/callback`;
  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", channelId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "openid profile");
  url.searchParams.set("nonce", nonce);

  const response = NextResponse.redirect(url, 303);
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: baseUrl.startsWith("https://"),
    maxAge: 600,
    path: "/",
  };
  response.cookies.set("line_oauth_state", state, options);
  response.cookies.set("line_oauth_nonce", nonce, options);
  response.cookies.set("line_oauth_return", "/member", options);
  response.cookies.set("line_oauth_base", baseUrl, options);
  response.cookies.set("line_oauth_mode", "link", options);
  response.cookies.set("line_link_transaction", transaction.transactionId, options);
  return response;
}
