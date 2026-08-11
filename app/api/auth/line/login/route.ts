import { NextResponse } from "next/server";
import { randomState, safeReturnPath } from "@/lib/memberAuth";

function safeOrigin(value: string | null) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function resolveBaseUrl(request: Request, requestUrl: URL) {
  const explicitOrigin = safeOrigin(requestUrl.searchParams.get("origin"));
  if (explicitOrigin) return explicitOrigin;

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`.replace(/\/$/, "");

  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  return requestUrl.origin.replace(/\/$/, "");
}

export async function GET(request: Request) {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID?.trim();
  const requestUrl = new URL(request.url);
  const baseUrl = resolveBaseUrl(request, requestUrl);

  if (!channelId) {
    return NextResponse.json({ error: "尚未設定 LINE_LOGIN_CHANNEL_ID" }, { status: 503 });
  }

  const state = randomState();
  const nonce = randomState();
  const returnTo = safeReturnPath(requestUrl.searchParams.get("returnTo"));
  const redirectUri = `${baseUrl}/api/auth/line/callback`;

  const url = new URL("https://access.line.me/oauth2/v2.1/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", channelId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set(
    "scope",
    process.env.LINE_LOGIN_EMAIL_SCOPE === "true" ? "openid profile email" : "openid profile",
  );
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("bot_prompt", "aggressive");

  const response = NextResponse.redirect(url);
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: baseUrl.startsWith("https://"),
    maxAge: 600,
    path: "/",
  };
  response.cookies.set("line_oauth_state", state, options);
  response.cookies.set("line_oauth_nonce", nonce, options);
  response.cookies.set("line_oauth_return", returnTo, options);
  response.cookies.set("line_oauth_base", baseUrl, options);
  return response;
}
