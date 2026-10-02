# KD Coffee LINE 登入與 Messaging 設定

## 一、LINE Login

1. LINE Login Channel 使用與 @kdcoffee Messaging API 相同的 Provider「KD COFFEE 1962」。
2. Web app Callback URL 設定：
   - 本機測試：`http://localhost:3000/api/auth/line/callback`
   - 正式站：`https://你的網域/api/auth/line/callback`
3. 將 Channel ID、Channel secret 分別填入 `.env.local` 的 `LINE_LOGIN_CHANNEL_ID`、`LINE_LOGIN_CHANNEL_SECRET`；它們不是 Messaging access token。
4. `AUTH_SESSION_SECRET` 請使用至少 32 字元的隨機字串。
5. Email 權限未經 LINE 核准前，維持 `LINE_LOGIN_EMAIL_SCOPE=false`。

登入流程會驗證 OAuth state、nonce 與 LINE ID token，成功後建立 30 天 HttpOnly Session。

## 二、INTERNAL：內部營運通知

1. 使用舊「KD咖啡訂單傳送」Messaging API Channel。
2. token 填入 `LINE_INTERNAL_CHANNEL_ACCESS_TOKEN`。
3. 群組／內部收件者 ID 填入 `LINE_INTERNAL_RECIPIENT_ID`；確認機器人已加入群組。
4. 用於新訂單、取消訂單、客戶詢問、ATM 轉帳回報及管理端營運提醒。

訂單流程固定為：先寫入 `data/orders`，再推送 LINE。若 LINE 暫時失敗，訂單仍保留，完成頁會提醒「不要重複下單」。

## 三、CUSTOMER：客戶／會員通知

1. 使用品牌官方帳號「K. D咖啡藝術工坊」@kdcoffee 的 Messaging API Channel。
2. token 填入 `LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN`。
3. 收件者由訂單／會員的既有解析流程提供，不使用 `LINE_INTERNAL_RECIPIENT_ID`。
4. 用於訂單狀態、出貨／取貨、詢問回覆、定期購、推薦／本人消費／零售推廣回饋及抵用金通知。會員通知的重試與 Email fallback 維持原流程。

## 四、LEGACY 過渡相容

新變數未設定或空白時，INTERNAL token／recipient 分別 fallback 至 `LINE_CHANNEL_ACCESS_TOKEN`／`LINE_ORDER_RECIPIENT_ID`；CUSTOMER token fallback 至 `LINE_CHANNEL_ACCESS_TOKEN`。兩個 adapter 不會讀取對方的新 token。

Railway 遷移完成前保留 legacy 變數，完成後移除；使用 legacy token 的客戶通知仍由舊 Bot 發送，不代表已切換 @kdcoffee。切換真實 CUSTOMER token 前，另行完成舊測試 queue 的停派送與 clean cutover。

修改本機變數後需要重新啟動。此階段不自動修改 `.env.local`、Railway 或真實 token。

## 五、安全驗證與本機啟動

```bash
npm install
npm run test:line-messaging-split
npm run dev
```

`test:line-messaging-split` 僅使用合成設定與 mock fetch，不載入 `.env.local`、不送真實 LINE，也不修改現有 runtime 資料。既有 `test:line` 是只讀 legacy 變數、會實際送訊息的手動工具，不能用來驗證此次分流；只有另外明確授權真實傳送時才使用。
