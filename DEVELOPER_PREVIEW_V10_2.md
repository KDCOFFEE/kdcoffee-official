# KD Coffee Studio Developer Preview v10.2

## SEO Smart Upload

- 上傳圖片前顯示原始檔名與 SEO 建議檔名。
- 固定命名結構：`kdcoffee-{artwork-slug}-{asset-purpose}-v01.ext`。
- 同類素材再次上傳時，自動遞增為 v02、v03，不覆蓋舊檔。
- 實際檔案儲存在 `/public/uploads/artworks/{artwork-slug}/`。
- 自動建立並可修改 ALT、Image Title、Caption。
- SEO 欄位跟隨 Artwork Asset 儲存並進入 History。
- 內部 Artwork ID / SKU 與公開圖片檔名分離。

本版本不使用影像辨識猜測產品；在作品頁上傳時，直接引用目前 Artwork，避免錯誤分類。
