# Artwork Studio v10.0 使用說明

## 建立作品
1. 進入 `/admin/products`
2. 按「建立新作品」
3. 輸入中文作品名稱、英文作品名稱、藝術家
4. 建立草稿
5. 按「儲存並發布」

系統會自動建立 Product ID、Artwork SKU 與 Slug，不需要手動輸入。

## Artwork 與販售規格
Artwork 是作品本身，例如「梵谷風靡」。
販售規格是實際可購買商品，例如半磅 227g、耳掛 10 入、未來禮盒。
各規格可分開設定價格、庫存與是否啟用。

## Slug 規則
英文作品名稱 `Van Gogh Passion` 會建立 `van-gogh-passion`。
若重複，系統自動建立 `van-gogh-passion-2`。
已發布作品會保留原 Slug，避免舊網址失效。
