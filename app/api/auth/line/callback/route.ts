import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  getCurrentMember,
  linkLineIdentityToMember,
  loginLineMember,
  MEMBER_SESSION_COOKIE,
  memberSessionCookieOptions,
  safeReturnPath,
} from "@/lib/memberAuth";

function env(name: string) {
  return process.env[name]?.trim();
}

function safeOrigin(value: string | undefined) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function resolveBaseUrl(request: NextRequest) {
  const cookieOrigin = safeOrigin(request.cookies.get("line_oauth_base")?.value);
  if (cookieOrigin) return cookieOrigin;

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`.replace(/\/$/, "");
  }

  return (env("NEXT_PUBLIC_SITE_URL") || request.nextUrl.origin).replace(/\/$/, "");
}

function clearOAuthCookies(response: NextResponse) {
  response.cookies.delete("line_oauth_state");
  response.cookies.delete("line_oauth_nonce");
  response.cookies.delete("line_oauth_return");
  response.cookies.delete("line_oauth_base");
  response.cookies.delete("line_oauth_mode");
  response.cookies.delete("line_link_transaction");
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");
  const savedState = request.cookies.get("line_oauth_state")?.value;
  const nonce = request.cookies.get("line_oauth_nonce")?.value;
  const returnTo = safeReturnPath(request.cookies.get("line_oauth_return")?.value);
  const mode = request.cookies.get("line_oauth_mode")?.value === "link" ? "link" : "login";
  const linkTransactionId = request.cookies.get("line_link_transaction")?.value;
  const channelId = env("LINE_LOGIN_CHANNEL_ID");
  const channelSecret = env("LINE_LOGIN_CHANNEL_SECRET");
  const baseUrl = resolveBaseUrl(request);

  if (
    error ||
    !code ||
    !state ||
    !savedState ||
    state !== savedState ||
    !nonce ||
    !channelId ||
    !channelSecret
  ) {
    console.error("LINE login precheck failed", {
      lineError: error,
      hasCode: Boolean(code),
      hasState: Boolean(state),
      hasSavedState: Boolean(savedState),
      stateMatches: Boolean(state && savedState && state === savedState),
      hasNonce: Boolean(nonce),
      hasChannelId: Boolean(channelId),
      hasChannelSecret: Boolean(channelSecret),
      baseUrl,
    });
    const failed = NextResponse.redirect(`${baseUrl}/member?error=line_login_failed`);
    clearOAuthCookies(failed);
    return failed;
  }

  try {
    const redirectUri = `${baseUrl}/api/auth/line/callback`;
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: channelId,
      client_secret: channelSecret,
    });

    const tokenResponse = await fetch("https://api.line.me/oauth2/v2.1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });

    const tokenText = await tokenResponse.text();
    if (!tokenResponse.ok) {
      console.error("LINE token exchange rejected", {
        status: tokenResponse.status,
        redirectUri,
        channelId,
        requestId: tokenResponse.headers.get("x-line-request-id"),
      });
      throw new Error(`LINE token exchange failed: ${tokenResponse.status}`);
    }

    const token = JSON.parse(tokenText) as { id_token?: string };
    if (!token.id_token) throw new Error("LINE did not return an ID token");

    const verifyBody = new URLSearchParams({
      id_token: token.id_token,
      client_id: channelId,
      nonce,
    });

    const verifyResponse = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: verifyBody,
      cache: "no-store",
    });

    const verifyText = await verifyResponse.text();
    if (!verifyResponse.ok) {
      console.error("LINE ID token verification rejected", {
        status: verifyResponse.status,
        requestId: verifyResponse.headers.get("x-line-request-id"),
      });
      throw new Error(`LINE ID token verify failed: ${verifyResponse.status}`);
    }

    const verified = JSON.parse(verifyText) as {
      sub: string;
      name?: string;
      picture?: string;
      email?: string;
      nonce?: string;
    };

    if (!verified.sub || verified.nonce !== nonce) {
      throw new Error("LINE nonce verification failed");
    }

    if (mode === "link") {
      const member = await getCurrentMember();
      if (!member || !linkTransactionId) throw new Error("LINE linking session is invalid");

      await linkLineIdentityToMember({
        transactionId: linkTransactionId,
        member,
        state,
        profile: {
          sub: verified.sub,
          name: verified.name,
          picture: verified.picture,
        },
      });

      const linked = NextResponse.redirect(`${baseUrl}/member?linked=line`);
      clearOAuthCookies(linked);
      return linked;
    }

    const login = await loginLineMember({
      sub: verified.sub,
      name: verified.name,
      picture: verified.picture,
      email: verified.email,
    });

    if (login.status === "link-required") {
      const linkRequired = NextResponse.redirect(`${baseUrl}/member?error=account_link_required`);
      clearOAuthCookies(linkRequired);
      return linkRequired;
    }

    const member = login.member;

    const response = NextResponse.redirect(`${baseUrl}${returnTo}`);
    response.cookies.set(
      MEMBER_SESSION_COOKIE,
      createSessionToken(member.id),
      memberSessionCookieOptions(baseUrl.startsWith("https://")),
    );
    clearOAuthCookies(response);
    return response;
  } catch (err) {
    console.error("LINE login callback failed", {
      reason: err instanceof Error ? err.name : "unknown",
      mode,
    });
    const errorCode = mode === "link" ? "line_link_failed" : "line_login_failed";
    const failed = NextResponse.redirect(`${baseUrl}/member?error=${errorCode}`);
    clearOAuthCookies(failed);
    return failed;
  }
}
