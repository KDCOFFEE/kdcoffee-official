# LINE Login 400 排錯

重新啟動網站後再登入一次。若失敗，Terminal 會顯示：

```text
LINE token exchange rejected {
  status: 400,
  redirectUri: 'http://localhost:3000/api/auth/line/callback',
  channelId: '...',
  response: '{"error":"...","error_description":"..."}'
}
```

常見原因：

1. `client_secret is invalid`：`.env.local` 的 LINE Login Channel Secret 錯誤或已重新發行。
2. `redirect_uri does not match`：LINE Developers 回呼 URL 與 `NEXT_PUBLIC_SITE_URL` 不一致。
3. `invalid_grant`：授權碼已使用、過期，或重新整理 callback；回結帳頁重新登入即可。

請勿把 `.env.local` 上傳、傳給他人或放進 Git。
