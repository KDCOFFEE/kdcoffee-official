# KD Coffee 7-ELEVEN 門市資料更新器 v3.2

## 正式資料

網站結帳頁使用：

`public/data/711-stores.json`

更新器只有在新資料通過完整性檢查後，才會覆蓋正式檔案。官方系統忙碌、下載失敗或資料不完整時，舊資料都會保留。

## 一般更新

雙擊：

`update-711-stores.cmd`

或執行：

```bash
npm run update:711
```

## v3.2 改善內容

1. 先開啟官方 EMap 頁面建立工作階段與 Cookie。
2. 自動交替使用 POST 與 GET 兩種下載方式。
3. 加入防快取參數，避免取得舊的錯誤回應。
4. 官方連續兩次回傳「系統忙碌／E0001」時自動停止，不再密集重試。
5. 下載或解析失敗時，正式門市資料絕不被修改。
6. 失敗原因會寫入 `data/711-update-report.json`。
7. 保留瀏覽器下載 XML 後離線匯入的備援方式。

## 官方忙碌時

看到「系統忙碌」不代表網站門市資料壞掉。這表示官方 EMap 當下沒有提供有效 XML。

建議先停止重試 15–60 分鐘，再執行一次。也可更換手機網路測試。

不要在短時間內連續雙擊更新器，v3.2 會自動提前停止，以免暫時限制持續延長。

## 使用本機 XML 匯入

```bash
npm run update:711 -- --input="C:\路徑\門市資料.xml"
```

## 使用最近一次有效原始 XML

只有在你清楚知道資料不是最新，但希望重新產生 JSON 時才使用：

```bash
npm run update:711 -- --use-cache
```

快取超過 14 天就不會使用，也不會假裝是最新下載。

## 強制完成三次嘗試

一般不建議。只有排除暫時限制時使用：

```bash
npm run update:711 -- --force
```

## 只測試、不覆蓋

```bash
npm run update:711:check
```

## 解析器測試

```bash
npm run test:711-parser
```

## 重要檔案

- 正式資料：`public/data/711-stores.json`
- 候選資料：`public/data/711-stores.pending.json`
- 原始 XML：`data/711-raw.xml`
- 更新報告：`data/711-update-report.json`
- 自動備份：`data/store-backups/`
