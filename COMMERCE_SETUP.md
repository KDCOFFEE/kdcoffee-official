# KD Coffee 訂單功能設定｜v6.1 賣貨便人工確認版

## 現行流程

1. 客人在網站選商品並送出訂單。
2. 網站透過 INTERNAL Messaging API 將完整訂單推送到 KD Coffee 訂單群組；客戶／會員通知使用獨立的 CUSTOMER Messaging API。
3. KD Coffee 依訂單建立 7-ELEVEN 賣貨便專屬連結。
4. 將連結提供給客人。
5. 客人在賣貨便頁面付款，並使用正式電子地圖選擇門市。

這個版本不使用假門市，也不讓客人在網站自行輸入門市，以免產生配送資料錯誤。

## LINE 設定：INTERNAL、CUSTOMER、LOGIN 分開

將 `.env.example` 複製為 `.env.local`：

```env
# INTERNAL：舊「KD咖啡訂單傳送」，僅內部營運提醒
LINE_INTERNAL_CHANNEL_ACCESS_TOKEN=
LINE_INTERNAL_RECIPIENT_ID=

# CUSTOMER：@kdcoffee，客戶／會員訊息；收件者由訂單／會員解析
LINE_CUSTOMER_CHANNEL_ACCESS_TOKEN=

# LOGIN：與 @kdcoffee 同 Provider 的 LINE Login Channel
LINE_LOGIN_CHANNEL_ID=
LINE_LOGIN_CHANNEL_SECRET=

# DEPRECATED：僅供 Railway 遷移期間 fallback，完成後移除
LINE_CHANNEL_ACCESS_TOKEN=
LINE_ORDER_RECIPIENT_ID=
```

INTERNAL token／recipient 分別優先使用新變數，空值時 fallback 至 legacy token／recipient；CUSTOMER token 優先使用自己的新變數，空值時只 fallback 至 legacy token。兩者不互相使用新 token，LINE Login 行為不變。

`npm run test:line-messaging-split` 使用 mock fetch 驗證分流，不送真實訊息。真實 token 切換與舊 queue 清理屬後續 cutover；此程式變更不會自動更動環境變數或資料。

修改後重新啟動：

```bash
npm.cmd run dev
```

## 本機訂單備份

Cursor 本機測試時，訂單會另外儲存在：

```text
data/orders/
```

正式部署仍需接資料庫，不能把主機檔案系統當成永久訂單資料庫。
