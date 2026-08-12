import Link from "next/link";

import ResetPasswordForm from "@/components/member/ResetPasswordForm";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;

  return (
    <main className="member-page">
      <section className="member-login-card">
        <p className="eyebrow dark">KD COFFEE MEMBER</p>
        <h1>重新設定密碼</h1>

        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="email-reset-success">
            <p className="form-error">密碼重設連結無效或已過期，請重新申請。</p>
            <Link className="email-auth-submit" href="/member">
              回到會員登入
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
