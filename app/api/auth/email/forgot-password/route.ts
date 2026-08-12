import { NextResponse } from "next/server";

import {
  createPasswordResetUrl,
  sendPasswordResetEmail,
} from "@/lib/memberEmail";
import {
  createEmailPasswordReset,
  isValidEmail,
  normalizeEmail,
} from "@/lib/memberAuth";

const SUCCESS_MESSAGE =
  "如果此 Email 已註冊，我們會將密碼重設方式寄到您的信箱。";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = normalizeEmail(String(body.email ?? ""));

    if (isValidEmail(email)) {
      const reset = await createEmailPasswordReset(email);

      if (reset) {
        const resetUrl = createPasswordResetUrl(reset.token);

        if (resetUrl) {
          await sendPasswordResetEmail({
            recipientEmail: reset.email,
            resetUrl,
            expiresAt: reset.expiresAt,
          }).catch(() => undefined);
        }
      }
    }

    return NextResponse.json({ message: SUCCESS_MESSAGE });
  } catch {
    return NextResponse.json({ message: SUCCESS_MESSAGE });
  }
}
