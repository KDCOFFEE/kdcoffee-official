# KD Coffee Studio v14.0 LTS

## 版本定位

以 v13.0 Stable Commerce 為基底，整合已確認需要的 LINE、ngrok、會員與購物流程修正，不再要求額外疊加舊版 Patch。

## 核心修正

- `next.config.ts` 允許目前固定 ngrok 網域與 ngrok 測試來源。
- LINE OAuth callback 直接在最終 redirect response 寫入會員 Session Cookie。
- 全站 Header 由伺服器先讀會員，再交由瀏覽器同步。
- 商品規格、豆／粉、耳掛、數量、購物車、立即購買維持同一個 Client Component 流程。
- 新增 `/api/health` 與 `npm run health`。
- 更新包格式納入 `KD_UPDATE_MANIFEST.json`。

## Hero

主標題：

> 不用先懂咖啡，第一包就選到你真正喜歡的味道。

副標：

> 從花香、果香到溫暖甜感，我們幫你把複雜的咖啡資訊，變成一個容易做對的選擇。
