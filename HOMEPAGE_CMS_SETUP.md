# 首頁內容管理使用說明

啟動網站並登入後台後，開啟：

`http://localhost:3000/admin/homepage`

可管理：

1. Hero 封面照片、WebM／MP4 影片、標題與按鈕
2. 多筆首頁活動：新增、刪除、排序、日期、上下架、活動圖片
3. 首頁推薦作品 Cover 圖片

主要 JSON：

- `public/data/homepage.json`：Hero、活動區與活動陣列
- `public/data/website-data.json`：商品資料與商品 Cover

上傳的首頁媒體會保存於：

`public/uploads/homepage/`

注意：目前採本機檔案儲存，正式部署時必須使用可持久化磁碟或日後改接雲端媒體儲存；純 Vercel 無伺服器環境不適合直接寫入專案檔案。
