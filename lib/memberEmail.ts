export type PasswordResetEmailInput = {
  recipientEmail: string;
  resetUrl: string;
  expiresAt: string;
};

export type MemberEmailDeliveryResult =
  | { status: "sent"; providerMessageId?: string }
  | { status: "not_configured" };

export function createPasswordResetUrl(token: string) {
  const siteUrl = process.env.MEMBER_SITE_URL?.trim();
  if (!siteUrl) return null;

  try {
    const baseUrl = new URL(siteUrl);
    if (baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:") {
      return null;
    }

    const resetUrl = new URL("/member/reset-password", baseUrl.origin);
    resetUrl.searchParams.set("token", token);
    return resetUrl.toString();
  } catch {
    return null;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export async function sendPasswordResetEmail(
  input: PasswordResetEmailInput,
): Promise<MemberEmailDeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MEMBER_EMAIL_FROM?.trim();
  const siteUrl = process.env.MEMBER_SITE_URL?.trim();

  if (!apiKey || !from || !siteUrl) {
    return { status: "not_configured" };
  }

  const safeResetUrl = escapeHtml(input.resetUrl);
  let response: Response;

  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.recipientEmail],
        subject: "KD Coffee 會員密碼重設",
        html: `
          <div style="font-family:Arial,'Noto Sans TC',sans-serif;line-height:1.7;color:#2b211b;max-width:560px;margin:auto;padding:24px;">
            <h1 style="font-size:24px;margin:0 0 18px;">KD Coffee</h1>
            <p>我們收到您的會員密碼重設申請。</p>
            <p style="margin:28px 0;">
              <a href="${safeResetUrl}" style="display:inline-block;padding:13px 20px;border-radius:8px;background:#2b2019;color:#ffffff;text-decoration:none;font-weight:700;">重新設定密碼</a>
            </p>
            <p>此連結有效 30 分鐘，使用一次後即會失效。</p>
            <p>如果不是您本人提出申請，請忽略此信，原密碼不會受到影響。</p>
          </div>
        `,
      }),
    });
  } catch {
    console.error("Resend password reset email request failed");
    throw new Error("Password reset email delivery failed");
  }

  if (!response.ok) {
    console.error("Resend password reset email rejected", {
      status: response.status,
    });
    throw new Error("Password reset email delivery failed");
  }

  let providerMessageId: string | undefined;
  try {
    const result = (await response.json()) as { id?: unknown };
    if (typeof result.id === "string") providerMessageId = result.id;
  } catch {
    // A successful response without JSON still counts as delivered.
  }

  return providerMessageId
    ? { status: "sent", providerMessageId }
    : { status: "sent" };
}
