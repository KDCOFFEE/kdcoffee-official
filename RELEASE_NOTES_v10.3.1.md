# KD Coffee Studio v10.3.1 Stable

## 修正

- 修正 `/admin/products` 的 `Cannot read properties of undefined (reading assets)`。
- 過濾無效或空白產品資料。
- `hasAsset`、完成度與素材統計全面加入空值保護。
- 舊資料即使沒有 `assets`、`pageLayout`、`galleryAssets`、`history`、`publish`、`displayFields` 或 `skus`，仍可正常載入。

## Migration

- API 讀取時自動轉換為 v10.3.1 相容格式。
- 儲存後將 `schemaVersion` 寫入網站資料與每一件 Artwork。
- 不會刪除既有 Artwork、咖啡資料、圖片路徑或 SKU。

## 使用方式

1. 關閉原本的開發伺服器。
2. 解壓縮本版本。
3. 執行 `npm run dev`。
4. 開啟 `/admin/products`。
5. 若看到自動升級提示，按一次「儲存變更」即可永久寫入新格式。
