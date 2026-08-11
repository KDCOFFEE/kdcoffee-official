# KD Coffee LINE 登入與訂單通知設定（v7.4）

## 一、LINE Login

1. 在 LINE Developers 同一個 Provider 新增「LINE Login」Channel。
2. Web app Callback URL 設定：
   - 本機測試：`http://localhost:3000/api/auth/line/callback`
   - 正式站：`https://你的網域/api/auth/line/callback`
3. 將 Channel ID、Channel secret 填入 `.env.local`。
4. `AUTH_SESSION_SECRET` 請使用至少 32 字元的隨機字串。
5. Email 權限未經 LINE 核准前，維持 `LINE_LOGIN_EMAIL_SCOPE=false`。

登入流程會驗證 OAuth state、nonce 與 LINE ID token，成功後建立 30 天 HttpOnly Session。

## 二、LINE 訂單群組通知

1. 使用 Messaging API Channel 的 long-lived Channel access token。
2. 確認官方帳號機器人已加入訂單群組。
3. 把群組 ID 填入 `LINE_ORDER_RECIPIENT_ID`。
4. 測試：`npm run test:line`

訂單流程固定為：先寫入 `data/orders`，再推送 LINE。若 LINE 暫時失敗，訂單仍保留，完成頁會提醒「不要重複下單」。

## 三、本機啟動

```bash
npm install
npm run test:line
npm run dev
```
