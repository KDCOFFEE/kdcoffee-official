# ADMIN 公開網址跳轉修復紀錄（2026-10-06）

## 範圍與目前狀態

- 分支：`j5d7b-reward-cron-notification-isolation`。
- HEAD：`3be5feb4c2dfe0086f6811c587e613b472483892`。
- 本輪只修改程式、新增隔離回歸測試及本文件。未 stage、commit、push、deploy，未修改 Railway 設定。
- 未操作正式登入／登出 session、訂單、會員、排程或通知。未修改抵用計算。
- 既有抵用功能報告、整合測試差異、資料差異、未追蹤檔案及 launcher 刪除狀態均保留。

## 已證實根因

唯讀查看 Railway `efficient-surprise / production / kdcoffee-official` 的個別網址變數：

| 設定 | 目前值 | 結論 |
| --- | --- | --- |
| NEXT_PUBLIC_SITE_URL | https://kdcoffee-official-production.up.railway.app | 既有 ADMIN 登入／登出直接採用，導向平台網域 |
| MEMBER_SITE_URL | https://www.kdcoffee1962.com | 正確；會員信件及其他相關網址使用 |
| Railway 平台公開網域 | kdcoffee-official-production.up.railway.app | 平台提供的服務網域，不是應修改為自訂網域的變數 |

沒有列印整份環境變數或其他憑證。

匿名正式 GET：首頁 200；`/admin` 307、`Location: /admin/login`；登入頁 200，表單為 `/api/admin/login`，返回網站為 `/`。這些相對路徑不會自行切換網域。當次首頁 HTML 未找到 ADMIN 連結，不能據此宣稱已點擊實際 ADMIN 入口；直接請求 `/admin` 已核對未登入跳轉。

第一個已證實會改變網域的回應，是既有 `POST /api/admin/login`：`getSiteUrl()` 優先採用錯誤的 NEXT_PUBLIC_SITE_URL，再建立絕對 Location。成功、密碼錯誤、密碼未設定都會前往 railway.app；管理登出亦同。返回網站的 `/` 隨當時所在網域解析，因此只改返回連結不能修好前段。

未向正式站送出登入／登出 POST。從 HEAD 讀出的原始 routes 在隔離資料中重現：

| 原始路由結果 | HTTP | Location |
| --- | --- | --- |
| 成功 | 303 | https://kdcoffee-official-production.up.railway.app/admin |
| 密碼錯誤 | 303 | https://kdcoffee-official-production.up.railway.app/admin/login?error=invalid |
| 密碼未設定 | 303 | https://kdcoffee-official-production.up.railway.app/admin/login?error=not_configured |
| 管理登出 | 303 | https://kdcoffee-official-production.up.railway.app/admin/login |

原管理 login/logout 最後修改來自 `5f02ed725d7c20d51a6864b04158e2f095b9d59c`（Add owner admin authorization foundation）。比較抵用 commit 的 parent `e4b0ea8b88f1564ec0d4fa737184acb0d2cc40ad` 與目前 HEAD，兩個 routes 的 blobs 相同。這是既有問題，不是抵用功能造成。

## 最小修復與呼叫關係

1. 新增 `lib/publicSiteOrigin.ts` 的 `resolvePublicSiteOrigin(request)`，供管理登入、管理登出及會員登出共用。
2. Railway runtime、KD 正式／裸網域、Railway 代理內部網址，解析為 `https://www.kdcoffee1962.com`。即使正式網址變數仍錯指 Railway，也不再採用它作 ADMIN 的 Location。
3. 本機 localhost、127.0.0.1、IPv6 loopback 保留原埠及本機 cookie 行為。Next 內部將 127.0.0.1 正規化為 localhost 時，只接受同埠且限定 loopback 的 Host；任意外部 Host、x-forwarded-host、query origin/returnTo 均不提供跳轉目的地。
4. 非本機開發網域需透過可信環境設定明確配置 HTTPS origin。含帳密、非 HTTP(S)、不可信外部 HTTP 設定不採用；未知請求 host 回到正式公開 origin。
5. `app/api/admin/login/route.ts` 保留密碼驗證、session 建立、權限及 12 小時期限；只替換網址解析。
6. `app/api/admin/logout/route.ts` 使用相同 origin，清除同一 host-only cookie，保留 Path=/、Max-Age=0，並與登入一致使用 HttpOnly、SameSite=lax、依 HTTPS 設 Secure。沒有設定 cookie Domain。
7. `app/api/auth/logout/route.ts` 沿用 clearMemberSession()，改為上述共用網址解析，移除無條件信任任意 forwarded host 的舊行為。
8. ADMIN 頁面的相對跳轉／表單／返回連結不用修改。LINE login/link/callback、OAuth state/nonce、return path 與 cookie 規則不修改；本輪驗證既有 LINE login/callback 相容性，不宣稱已進行完整 OAuth 安全稽核。

本輪產品檔案：

- `lib/publicSiteOrigin.ts`（新增）
- `app/api/admin/login/route.ts`
- `app/api/admin/logout/route.ts`
- `app/api/auth/logout/route.ts`

本輪回歸及文件：

- `scripts/public-origin-test-bootstrap.mjs`（新增）
- `scripts/test-public-site-origin.mts`（新增）
- `docs/ADMIN_PUBLIC_ORIGIN_FIX_20261006.md`（新增）

## 驗證結果

| 驗證 | 命令／方式 | 結果 |
| --- | --- | --- |
| 共用 origin／routes／LINE 相容 | `node --experimental-strip-types --import ./scripts/public-origin-test-bootstrap.mjs scripts/test-public-site-origin.mts` | 25 項通過；最終 loopback 修正後執行 |
| 管理權限 | `node --experimental-strip-types --import ./scripts/public-origin-test-bootstrap.mjs scripts/test-phase-j5d5c-a1-admin-authorization.ts` | 15 項通過；最終修正後執行 |
| 會員 session | `node --experimental-strip-types --import ./scripts/member-auth-test-bootstrap.mjs scripts/test-member-auth.ts` | 24 項通過；會員 session 模組未修改 |
| TypeScript | 隔離 app 執行 `node node_modules/typescript/bin/tsc --noEmit --incremental false` | exit 0；涵蓋最終修改 |
| Production build | 隔離 app 執行 `node node_modules/next/dist/bin/next build --webpack` | exit 0；涵蓋最終修改 |
| 真實本機 HTTP | 最終 build 的 Next production server，127.0.0.1:4319，隨機隔離密碼 | 10 項通過 |
| 瀏覽器 | 隔離本機錯誤密碼登入及返回網站 | 顯示「密碼不正確」，網址維持 127.0.0.1；返回首頁仍同網域 |
| 正式網站 | 匿名 GET 首頁、ADMIN、登入頁 | 如上；未操作正式 session |

25 項回歸涵蓋正式／代理內部 URL 的登入成功、錯誤密碼、未設定密碼、管理登出、會員登出；惡意轉送 headers、缺值／畸形 URL、localhost／127.0.0.1／IPv6、明確 HTTPS 開發設定、正常返回連結；LINE 授權網址、成功／失敗 callback、state/nonce、會員 cookie、原回訪路徑。LINE API 回應使用 stub，其他測試網路請求阻擋，會員資料使用 mkdtemp 隔離目錄。

10 項 HTTP 驗證包括：未登入 307、登入表單、錯誤密碼 303、成功登入 303、實際回應 cookie 可進後台、登出清除 cookie、登出後重新要求登入、返回首頁、偽造轉送 header、會員登出清除 session。正式 HTTPS 的 Secure cookie 由 route 回歸驗證；本機真實 HTTP cookie 為非 Secure，仍具 HttpOnly、SameSite=lax、Path=/、Max-Age=43200、無 Domain。

隔離資料與驗收證據根目錄：
`qa-output/admin-origin-validation-CDdT7T/`

- `build-final.log`、`build-final-result.json`：最終 build exit 0。
- `http-smoke-results.json`：10 項實際 HTTP 結果，不含密碼或 cookie 值。
- `original-location-proof.json`：原始 HEAD routes 的隔離重現。
- `browser-wrong-password.jpg`：瀏覽器畫面。
- `protection-result.json`、`git-status-final.txt`：本輪保護核對。
- `app/`：最終隔離程式快照；3 個 routes、共用模組及 2 個測試檔雜湊與工作區一致。
- `runtime/`：只供本輪測試。
- `isolated-env.json`：隨機本機測試設定；不得提交、分享或列印內容。

隔離 build 未複製 .env 檔或既有 runtime JSON，秘密改用隨機值，停用寄信。公開網站素材只用於唯讀渲染。第一次跨磁碟 Temp snapshot 的 Turbopack／Webpack 因 junction 路徑解析失敗；保留失敗 log，改用同磁碟隔離 snapshot 的 Webpack build 成功。未更改正式 bundler／Next 設定；沒有宣稱預設 Turbopack build 通過。

實際 HTTP 測試曾發現 Next 將 127.0.0.1 正規化為 localhost，造成本機 host-only cookie 與跳轉 host 不一致；因此加入上述同埠 loopback 解析，補回歸並重建最終 build，10 項 HTTP 隨後全部通過。

僅停止已核對 PID、命令列、隔離路徑及 4319 埠的本輪測試服務，未停止其他服務。

## 資料保護與限制

本輪開始前保存新的逐檔 SHA-256 紀錄（2153 個既有檔案；排除 .git、node_modules、.next），時間 `2026-10-06T11:47:37.084Z`。完成後逐檔核對：只有本輪的 3 個 API routes 改變；其餘本輪開始時存在的檔案完全一致。189 個既有 data/public-data/uploads/brand 檔案，差異 0。index 原始位元組雜湊一致，staged 0；HEAD 與分支未變。

此證據只涵蓋本轮 ADMIN 修復的開始至完成區間，並不是之前遺失的抵用功能原始基準。沒有宣稱重驗不存在的歷史基準。

既有 CREDIT 報告與整合測試原文、資料的原有未提交差異、.env 設定、LINE routes、抵用計算及其他既有檔案均未改寫。新增 qa-output 與 Temp 驗收檔案不是產品提交內容。未刪除不明用途的既有檔案。

正式成功登入／登出、正式 cookie 及真正 LINE 授權未操作；需後續正式部署後由 Owner 人工驗收。當次正式首頁未找到 ADMIN 入口，未修改網站內容或入口配置。

## 建議 Railway 修正（本輪未執行）

Owner 後續在 `efficient-surprise / production / kdcoffee-official`：

1. 將 `NEXT_PUBLIC_SITE_URL` 從平台 URL 改成 `https://www.kdcoffee1962.com`。
2. 保持 `MEMBER_SITE_URL=https://www.kdcoffee1962.com`。
3. 不修改平台 RAILWAY_PUBLIC_DOMAIN／PRIVATE_DOMAIN，不調整密碼、session secret、Volume、排程或通知。
4. NEXT_PUBLIC 變數可能在 build 時內嵌；應在後續已授權的正式 build/deploy 中使用正確值。僅修改環境值而沿用舊 build，不能保證其他讀取該變數的功能更新。

這項設定修正也讓既有 LINE link fallback 等使用 NEXT_PUBLIC_SITE_URL 的位置取得正確公開網址；本輪沒有全面改寫 OAuth 路由。LINE Console 的正式 callback 應仍對應 `https://www.kdcoffee1962.com/api/auth/line/callback`，不由本輪變更。

## 正式部署後人工驗收路徑

需取得下一階段提交／部署授權後才上線。Owner 在新的正式登入狀態下：

1. 開啟 `https://www.kdcoffee1962.com`，由實際 ADMIN 入口或 `/admin` 進入；未登入跳轉應留在 www 的 `/admin/login`。
2. 錯誤密碼應留在 www 的 `/admin/login?error=invalid`；正常登入到 www 的 `/admin`。
3. 檢查登入 Set-Cookie：host-only、無 Domain、Secure、HttpOnly、SameSite=Lax、Path=/、12 小時；不得有 railway.app Domain。
4. 管理登出回 www 的 `/admin/login` 並清除同名 cookie；再進 `/admin` 要求登入。
5. 點返回網站回 www 首頁；整段歷程不得跳到 railway.app。
6. 另核對會員登出回 www 首頁；LINE 授權 redirect_uri 及 callback/回訪路徑維持原規則。不要以實際訂單或抵用扣款當作此次跳轉驗收。

本輪完成後停止：尚未 stage／commit／push／deploy，Railway 網址變數尚未修改。
