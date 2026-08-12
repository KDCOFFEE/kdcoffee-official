import { NextResponse } from "next/server";
import { clearMemberSession } from "@/lib/memberAuth";

function resolvePublicOrigin(request: Request) {
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    "https";

  if (forwardedHost) {
    const protocol =
      forwardedProto === "http" || forwardedProto === "https"
        ? forwardedProto
        : "https";

    try {
      return new URL(`${protocol}://${forwardedHost}`).origin;
    } catch {
      // Fall back to the request origin if proxy headers are malformed.
    }
  }

  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  await clearMemberSession();

  return NextResponse.redirect(
    new URL("/", resolvePublicOrigin(request)),
    303,
  );
}
