# KD Coffee 訂單功能設定｜v6.1 賣貨便人工確認版

## 現行流程

1. 客人在網站選商品並送出訂單。
2. 網站透過 LINE Messaging API 將完整訂單推送到 KD Coffee 訂單群組。
3. KD Coffee 依訂單建立 7-ELEVEN 賣貨便專屬連結。
4. 將連結提供給客人。
5. 客人在賣貨便頁面付款，並使用正式電子地圖選擇門市。

這個版本不使用假門市，也不讓客人在網站自行輸入門市，以免產生配送資料錯誤。

## LINE 設定

將 `.env.example` 複製為 `.env.local`：

```env
LINE_CHANNEL_ACCESS_TOKEN=你的 Channel Access Token
LINE_ORDER_RECIPIENT_ID=先前取得的訂單群組 Group ID
```

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
