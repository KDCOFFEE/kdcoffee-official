# Local ngrok auth / origin / redirect

Owner 已完成相關功能驗收。本修正只提交本機；尚未授權 push 或部署。

## 行為

- 非 production、非 Railway 的開發程序，可透過明確 `DEV_PUBLIC_ORIGIN` 接受當次 tunnel 的完整 origin；不接受任意 ngrok 網域或 Host/forwarded host。
- Admin credit 的 Origin 驗證與跳轉目的地分開處理；保留 URL 格式限制與 Sec-Fetch-Site 驗證。
- 本機開發的 loopback 跳轉維持 HTTP，即使 proxy 使內部 Request URL 顯示 HTTPS。
- ngrok proxy metadata 只能選擇伺服器明確設定的同一個 DEV_PUBLIC_ORIGIN，不能產生其他外站目的地。
- Railway／正式公開網域維持 `https://www.kdcoffee1962.com`；正式抵用來源不因 DEV_PUBLIC_ORIGIN 擴張。
- 會員登出維持 POST、303 根路徑跳轉與既有 host-only cookie 清除；不新增 GET 登出。
- LINE 授權與 callback、管理驗證／session 期限／權限、商務計算不變。

## 診斷清理

移除 Admin credit 與會員登出的暫時 development logging、診斷 helper／狀態。developmentPublicOrigin 仍供真正的 origin 邏輯使用，只移除其不再需要的公開 export。
登出 route 移除暫時診斷後與基準 HEAD 相同，因此不列入 commit 的變更檔案。
11 個登出流程案例保留，改為檢查 development／production 都沒有暫時診斷輸出；原 cookie／POST／Location／GET 405／OPTIONS／隱私案例保留。
歷史報告及 QA 快照的診斷引用留存，不覆寫歷史證據。

## 精確提交範圍

- `app/api/admin/members/[memberId]/credit/route.ts`
- `lib/publicSiteOrigin.ts`
- `scripts/test-admin-credit-dev-origin.mts`
- `scripts/test-dev-auth-redirects.mts`
- `scripts/test-member-logout-flow.mts`
- 本文件。

既有測試 bootstrap 已在基準 commit 中，不需要新增依賴。沒有 passbook UI、runtime JSON、production config、Launcher、資產、QA output、登入憑證或其他資料進入此組。

## 最終回歸

最終隔離回歸：原 Admin origin 39、development origin 51、公開網址／LINE 25、auth redirect 78、logout flow 11、member auth 24、Admin auth 15 項全部通過。21 個相關程式／測試檔 ESLint exit 0；git diff --check exit 0。

logout flow 測試以真正 Headers 建構請求，只加入有字串值的 fixture header，維持 11 個原案例；未加入 any／ts-ignore、未放寬 production 型別。

隔離 WebsiteData 種子依 data/websiteData.ts 的型別補齊 version、updatedAt、MonthlyCampaign 的完整必要字串／details 欄位及 menu metadata。只修改 Temp 建立工具／合成資料，未改正式 JSON 或 schema；生成工具與 QA 產物不納入提交。

隔離 TypeScript exit 0；node node_modules/next/dist/bin/next build --webpack exit 0。驗證以基準 HEAD 加兩組明確提交內容的快照執行，不借用其他未提交來源。資料／網路隔離，未操作 Owner 或正式 session。
