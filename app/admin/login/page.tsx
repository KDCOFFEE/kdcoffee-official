export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const message = params.error === "invalid" ? "密碼不正確" : params.error === "not_configured" ? "尚未設定 ADMIN_PASSWORD" : "";
  return <main className="admin-login-page"><section className="admin-login-card"><p className="eyebrow dark">KD COFFEE STUDIO</p><h1>工作室管理後台</h1><p>管理訂單、取貨門市與出貨進度。</p>{message && <p className="form-error">{message}</p>}<form action="/api/admin/login" method="post"><label>管理密碼<input name="password" type="password" autoComplete="current-password" required /></label><button className="admin-primary-button">登入後台</button></form><a className="text-link" href="/">返回網站</a></section></main>;
}
