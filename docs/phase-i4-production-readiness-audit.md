# KD Coffee Studio Phase I.4 — Owner Acceptance 與 Production Readiness 稽核

稽核日期：2026-08-31（Asia/Taipei）
分支：`main`
正式基線：`b39793ed41161123cd46406853c2f3eadf12e238`（Complete Phase I.3 membership referral reward system）

## 1. Executive summary

最終分類：**READY FOR CONTROLLED OWNER ACCEPTANCE**。

目前程式已具備受控 Owner 驗收所需的完整工程路徑：會員身份、Email／LINE 登入、結帳、抵用金、定期購、履約、推薦資格與獎勵、多代與 PV、Admin、Member Center、Test Lab 均有可重現自動化證據，production build 成功。

這不代表已可直接正式上線。正式部署前仍有四類必要工作：

1. 建立並驗證 Railway Persistent Volume，將既有資料安全搬到 `/data`；現有啟動程序只會補 seed，不會搬移既有會員、訂單或商務資料。
2. 完成正式環境變數、外部服務與 callback 設定，並在真實裝置／瀏覽器驗收 LINE、Email、Gmail、7-ELEVEN。
3. 配置 Railway scheduler；現有 repository 沒有 Railway cron 設定。通知投遞、Gmail 同步與逾期取貨評估還缺少 scheduler 可安全呼叫的 internal endpoint。
4. 先完成 production data 備份、唯讀相容性演練與 rollback rehearsal。

`AUTHENTICATED BROWSER QA = NOT COMPLETED`：目前瀏覽器沒有可合法沿用的登入工作階段；沒有猜測密碼、讀取秘密或弱化驗證。

## 2. READY items

- Email 註冊／登入、密碼雜湊、30 天簽章 session、密碼重設 token 一次性與時效控制。
- LINE OAuth state、nonce、callback、帳號衝突與明確連結流程。
- Canonical member identity、固定會員編號、Email／LINE 共用會員本體與舊資料相容路徑。
- 訪客與會員結帳、伺服器價格／庫存／運費／抵用金／PV／會員身份重算。
- 訂單、價格、規則與定期購期次 snapshot；重送與併發冪等。
- 抵用金 FEFO、reserve／consume／release、零元政策與跨會員拒絕。
- 定期購建立、取貨啟用、30／45／60 快捷週期、目前 Owner 自訂 14–120 天、提前／延後／skip／pause／resume／terminate／立即補貨。
- 工作室自取與 7-ELEVEN 訂單資料、履約狀態機、取消、未取、退款、贈品進度。
- I.3C.3 canonical 推薦資格、日期、等待、月上限、部分發放、撤銷、多代、PV 與圖譜安全。
- Owner Admin 導覽、每日工作台、會員、訂單、履約、會員規則、推薦、PV、產品與 Test Lab 入口。
- 規則由 runtime 使用、持久化、有 server validation、版本／snapshot、繁體中文標籤、Help、目前值與儲存回饋。
- Test Lab namespace、資料檔與 production commerce 完全分離；production 預設停用。

## 3. CONFIGURATION REQUIRED

- Railway 掛載 Persistent Volume 並設定 `KD_DATA_DIR=/data`。
- 建立 production env inventory；目前無法由 repository 判斷 Railway 的實際值。
- 設定正式網站 domain、LINE Login callback、LINE Messaging、Resend、Gmail OAuth、Cloudinary 與 scheduler secret。
- 在 Railway 建立自動建單及獎勵發放排程。
- 決定通知、Gmail 與逾期取貨工作採自動排程或暫時由 Owner 手動操作；目前自動排程入口不完整。
- 建立 `/data` 備份、保留週期、還原演練與監控告警。

## 4. REAL-WORLD QA REQUIRED

- 真實 Email 收信、垃圾郵件、密碼重設及寄件網域。
- iOS／Android LINE Login、帳號連結、Messaging push、圖片 original／preview 顯示。
- 真實 7-ELEVEN 門市選擇、實際物流通知信格式、到店／取貨／未取流程。
- Owner Admin 在 desktop／tablet／mobile 的登入、導覽、表單、Help drawer、儲存成功／錯誤訊息。
- Guest、Email member、LINE member 各完成一次受控結帳；確認訂單、庫存、抵用金與 Member Center 一致。
- 正式 domain、reverse proxy、HTTPS cookie、callback URL、公開通知圖片 URL。
- Railway restart、redeploy、volume 持久化、scheduler retry 與外部服務暫時失敗演練。

## 5. OWNER DECISION REQUIRED

- 核准目前有效設定：PV 模式、自訂週期 14–120 天、快捷 30／45／60、零元訂單關閉、月推薦上限 0（不限額）。
- 決定 production scheduler 實際頻率與可接受延遲；程式沒有硬編碼營運頻率。
- 決定 Gmail 自動追蹤是否啟用、同步頻率及人工 fallback 值班方式。
- 決定外部通知未完成前，是否允許以 Member Center＋Admin 人工作業開始小規模上線。
- 核准備份保留期、部署時段、rollback 決策人與可接受停機時間。

現行規則內沒有 `owner-decision-required` 的有效設定值；上述為正式營運簽核，不應由工程端代決定。

## 6. BLOCKERS

### 受控 Owner Acceptance

目前沒有工程 blocker；可在本機或隔離 staging 開始。

### 正式部署前 blocker

1. **資料搬移與還原尚未驗證。** `KD_DATA_DIR` 切換不會自動搬移既有會員、訂單、身份、規則、商務與履約資料。
2. **Railway production env 狀態未知。** 不可把本機 `.env.local` 視為 production 已設定。
3. **Production scheduler 尚未配置。** repository 沒有 Railway cron 宣告。
4. **通知／Gmail／逾期取貨自動化入口不完整。** 目前通知與 Gmail 只接受 Admin session；`evaluatePickupDeadlines()` 沒有 route；不能直接交給 Railway cron。
5. **真實外部服務與登入瀏覽器 QA 未完成。** LINE、Email、Gmail、7-ELEVEN 不可宣稱 production ready。
6. **完整 production backup／restore rehearsal 未完成。** 不可在沒有可驗證備份時切換資料路徑或 schema。

## 7. Scheduler matrix

| 工作 | 目的／入口 | 驗證 | 時區 | 冪等／重試／紀錄 | 建議頻率 | Railway 狀態 |
|---|---|---|---|---|---|---|
| 定期購自動建單＋提醒入列 | `POST /api/internal/subscription-orders` → `runSubscriptionOrderScheduler()` | Bearer `SUBSCRIPTION_SCHEDULER_SECRET` 或 Admin session | 以 Asia/Taipei business date 判定 | cycle lock、deterministic order number、idempotency key；逐筆失敗摘要 | 建議每 15 分鐘；至少每日且需涵蓋建單日 | CONFIGURATION REQUIRED |
| 推薦資格逾期／獎勵發放 | `POST /api/internal/referral-rewards` | 同一 Bearer secret 或 Admin session | Asia/Taipei date-only | 單一 commerce lock、reward／credit idempotency、結果寫入狀態 | 建議每 15 分鐘 | CONFIGURATION REQUIRED |
| 會員通知投遞 | `POST /api/admin/membership-notifications` | 僅 Admin session | 事件日期由入列工作決定 | 有有限 attempts 與 failure state；process crash 後缺少 processing lease recovery | 建議每 5 分鐘 | **缺 scheduler auth endpoint** |
| 抵用金到期提醒 | 由 subscription scheduler 入列，再由通知投遞處理 | 同上 | Asia/Taipei date-only | notification idempotency key | 每日入列＋5 分鐘投遞 | 依賴前兩項 |
| Gmail 履約同步 | `POST /api/admin/fulfillment/gmail-sync` | 僅 Admin session＋Google OAuth | Gmail 時間轉 ISO；規則控制回看天數 | Message-ID fingerprint 去重；失敗更新 connection status | 啟用時建議每 5–10 分鐘 | **目前只能 Admin 手動觸發** |
| 取貨逾期評估 | `evaluatePickupDeadlines()` | 尚無 route | 依 pickup deadline instant | deadline fingerprint 去重，只標「疑似未取」 | 建議每小時 | **缺 production invocation path** |
| Cloudinary orphan 掃描／刪除 | Admin cleanup scan/delete routes | Admin session、刪除二階段 | 不敏感 | scan 與 delete 分離，有 log | 每月人工維護 | READY AS MANUAL |
| 7-ELEVEN 門市資料更新 | `npm run update:711`／dry-run | 本機維護程序 | 不敏感 | pending、backup、report | 需要時人工 | 非 runtime cron |

排程失敗應由 Railway HTTP status／log 告警；目前 repository 沒有告警配置。停用程序是先停 Railway invocation，再於 Admin 關閉對應通知／自動追蹤；不要刪除歷史 queue 或 ledger。

## 8. Environment variable matrix

本機狀態只代表名稱是否存在，不代表值正確；沒有讀取或記錄任何秘密值。Production 全部標示 UNKNOWN，直到 Owner／Railway 對照完成。

| ENV NAME | 用途 | 必要性 | 本機 | Production | 缺少時行為 |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | 正式網域、LINE callback、公開圖片基準 | Production required | CONFIGURED | UNKNOWN | 可能退回 request origin；proxy／callback 易不一致 |
| `MEMBER_SITE_URL` | 密碼重設連結與 Email 公開網址 | Email required | MISSING | UNKNOWN | 密碼重設回傳服務未設定 |
| `AUTH_SESSION_SECRET` | Member session 簽章 | Production required，至少 32 字元 | CONFIGURED | UNKNOWN | production 直接拒絕不安全 secret |
| `MEMBER_IDENTITY_SECRET` | Canonical identity HMAC | Optional，否則沿用 auth secret | MISSING | UNKNOWN | fallback `AUTH_SESSION_SECRET` |
| `ADMIN_PASSWORD` | Admin 登入 | Production required | CONFIGURED | UNKNOWN | 無法登入 Admin |
| `ADMIN_SESSION_SECRET` | Admin session 簽章 | 建議 required；可 fallback auth secret | CONFIGURED | UNKNOWN | 未提供且無 auth secret 時 Admin session 失敗 |
| `LINE_LOGIN_CHANNEL_ID` | LINE Login | Feature required | CONFIGURED | UNKNOWN | Login route 503 |
| `LINE_LOGIN_CHANNEL_SECRET` | LINE token exchange | Feature required | CONFIGURED | UNKNOWN | callback 失敗 |
| `LINE_LOGIN_EMAIL_SCOPE` | 是否請求 email scope | Optional | MISSING | UNKNOWN | 只用 openid/profile |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging push | Feature required | CONFIGURED | UNKNOWN | 通知標記 not configured／failed |
| `LINE_ORDER_RECIPIENT_ID` | 工作室訂單 LINE 收件者 | Internal order notification required | CONFIGURED | UNKNOWN | 訂單仍保存，工作室 LINE 通知失敗 |
| `RESEND_API_KEY` | 密碼重設與客戶 Email | Email required | MISSING | UNKNOWN | Email 不寄送／not configured |
| `MEMBER_EMAIL_FROM` | Email 寄件者 | Email required | MISSING | UNKNOWN | Email 不寄送 |
| `GMAIL_CLIENT_ID` | Gmail OAuth | Gmail required | MISSING | UNKNOWN | 顯示未連接 |
| `GMAIL_CLIENT_SECRET` | Gmail OAuth | Gmail required | MISSING | UNKNOWN | 顯示未連接 |
| `GMAIL_REFRESH_TOKEN` | Gmail OAuth | Gmail required | MISSING | UNKNOWN | 顯示未連接 |
| `GMAIL_FULFILLMENT_LABEL` | 限制掃描 Gmail label | Optional | MISSING | UNKNOWN | 仍以可信寄件者與日期 query 掃描 |
| `CLOUDINARY_CLOUD_NAME` | 媒體儲存 | Media admin required | CONFIGURED | UNKNOWN | 媒體上傳／管理失敗 |
| `CLOUDINARY_API_KEY` | 媒體簽章 | Media admin required | CONFIGURED | UNKNOWN | 媒體操作失敗 |
| `CLOUDINARY_API_SECRET` | 媒體簽章／驗證 | Media admin required | CONFIGURED | UNKNOWN | 媒體操作失敗 |
| `SUBSCRIPTION_SCHEDULER_SECRET` | Internal scheduler Bearer auth | Production scheduler required | MISSING | UNKNOWN | internal cron 401；Admin session 仍可手動執行 |
| `KD_DATA_DIR` | Persistent data root | Railway required，預期 `/data` | MISSING（本機正常） | UNKNOWN | runtime 寫入部署檔案系統，redeploy 可能遺失 |
| `ENABLE_MEMBERSHIP_TEST_LAB` | Test Lab gate | Production 必須 false 或未設定 | MISSING | UNKNOWN | production 預設 disabled；development 預設 enabled |
| `NODE_ENV` | Secure cookie／Test Lab production guard | Platform managed | Platform | UNKNOWN | 不可用 development 模式正式營運 |

`.env.example` 尚未列出 Resend、Gmail、Cloudinary、scheduler、persistent storage 與 Test Lab 變數；上線手冊必須以本表補齊，不能只依現有範例檔。

## 9. Persistent data safety map

| 資料 | 本機 | Railway production | 初始化／相容 | 備份／風險 |
|---|---|---|---|---|
| Members | `data/members/*.json` | `/data/members/*.json` | 缺目錄建立；不自動搬移 | PII＋password hash，部署前完整備份 |
| Identity registry | `data/member-identity/registry.json` | `/data/member-identity/registry.json` | 舊會員登入時可補 canonical identity | 必須與 members 一起還原 |
| Orders | `data/orders/*.json` | `/data/orders/*.json` | 舊欄位有 fallback；不自動搬移 | 不可被 image redeploy 覆蓋；逐檔備份 |
| Business rules | `data/membership-commerce/business-rules.json` | `/data/membership-commerce/business-rules.json` | 缺欄位補安全預設、保留版本；不由 repository seed 到 `/data` | Owner 目前 custom min 14 必須搬移，不可重設成 default 20 |
| Subscription／credit／referral／reward／notification／idempotency | `data/membership-commerce/commerce-state.json` | `/data/membership-commerce/commerce-state.json` | 缺檔建空 state；既有檔嚴格要求 schema v1 | 最重要交易帳本；必須原子備份與唯讀 validate |
| Fulfillment records | `data/fulfillment/state.json` | `/data/fulfillment/state.json` | 缺檔建空；歷史 order 可推導初始畫面 | 必須與 orders／commerce 同一時間點備份 |
| Fulfillment settings | `data/fulfillment/settings.json` | `/data/fulfillment/settings.json` | 缺檔使用安全 default | 自動追蹤與截止日設定需搬移 |
| Website／products／inventory | `public/data/website-data.json` | `/data/store/website-data.json` | fresh volume 缺檔才 seed，絕不覆蓋已存在檔 | 與訂單庫存交易一致性重要 |
| Homepage／assets／menus／pages | `public/data/*.json` | `/data/store/*.json` | 五個 store JSON 缺檔才 seed | CMS 更新後需備份 |
| Uploaded media／notification photos | `public/...` | `/data/uploads/...` 或 Cloudinary | 目錄建立；不搬移舊 local uploads | volume＋Cloudinary metadata 一併盤點 |
| Test Lab | `data/membership-test-lab/*` | `/data/membership-test-lab/*` | production 預設 disabled、SIM namespace | 不得混入 production backup restore 的交易驗證 |
| Sessions | Signed HttpOnly cookie | 無 server session store | 30 天、secret 驗簽 | 換 secret 會讓既有 session 登出，無交易資料損失 |
| Backups | `data/backups` | `/data/backups` | 只建立目錄 | 同一 volume 內副本不是完整災難復原，需外部匯出 |

Git 已忽略 members、orders、identity、Test Lab；但 `membership-commerce` 與 `fulfillment` runtime 檔目前沒有整體 ignore，且 repository 追蹤 business rules 與一份 fulfillment state。Production 使用 `/data` 時不會直接讀這些 repo runtime 檔，但未來應在完成資料策略後整理；本稽核不擅自修改 `.gitignore`。

## 10. External-service readiness

| 服務 | 工程狀態 | 正式狀態 |
|---|---|---|
| LINE Login | OAuth state／nonce／token verify／identity linking 已實作 | CONFIGURATION＋REAL-WORLD QA REQUIRED |
| LINE Messaging | text/image、JPEG conversion、尺寸、timeout、有限 retry、failure logging 已測 | CONFIGURATION＋REAL-DEVICE QA REQUIRED |
| Resend Email | password reset 與 customer email 路徑已實作 | CONFIGURATION＋DELIVERABILITY QA REQUIRED |
| Gmail | OAuth refresh、可信寄件者 query、Message-ID dedupe、人工 review 已實作 | CONFIGURATION；目前 Admin 手動 sync |
| 7-ELEVEN | 店選、靜態門市資料、訂單物流欄位、Email-derived fulfillment 已實作 | 真實信件／物流 QA；不是 API/webhook real-time |
| Cloudinary | signed upload、finalize、圖片／影片與 cleanup 已實作 | Production env＋實際 upload QA |

## 11. 7-ELEVEN readiness

- Store selection：本機 `711-stores.json`，可搜尋／選門市；更新是人工維護腳本，不是即時 API。
- Order logistics data：訂單保存店號、店名、地址與 7-ELEVEN COD 模式。
- Fulfillment：可由 Admin 人工更新，或由可信 7-ELEVEN Email parser 更新。
- Arrival／pickup：Email-derived 或 Admin-derived；沒有證據顯示 API／webhook real-time 串接。
- Unclaimed：到期只能先標「疑似未取」，最終未取必須 Owner 明確確認。
- Reconciliation：未知格式、錯誤寄件者與模糊訂單都不猜測，進人工 review。
- Production gap：Gmail cron 與 pickup-deadline evaluator 尚未接到 Railway。

## 12. Self-pickup readiness

- Checkout 由 server 驗證希望自取日期、一般／客製烘焙備貨天數與 blocked dates。
- 自取運費在 server 固定為 0；訂單保存日期與 snapshot。
- Admin 可在規則允許且物流仍可逆時調整日期／門市，保留操作者、理由與前後值。
- Owner 手動工作：確認開始準備、通知可以取貨、確認成功取貨／取消／未取；目前沒有實體現場自動感測。
- 逾期標示函式存在但尚無 production scheduler invocation。

## 13. LINE readiness

### LINE Login

需要正式 channel ID／secret、HTTPS domain 及 `${SITE_URL}/api/auth/line/callback` 白名單。工程測試涵蓋 state、nonce、identity conflict 與 linking；仍需 iOS／Android 真機驗收。

### LINE Messaging

需要 channel access token；工作室訂單通知另需 recipient ID。Customer push 使用會員 `lineUserId`，圖片先轉真正 JPEG，驗證公開 HTTPS、original／preview 尺寸，失敗不會偽報成功。仍需真實 push、封鎖官方帳號、圖片載入與 retry 驗收。

## 14. Email／Gmail readiness

- Email member authentication：READY（不依賴外部 Email 才能登入）。
- Password reset：CONFIGURATION REQUIRED（`MEMBER_SITE_URL`、Resend key、from）。
- Operational customer Email：CONFIGURATION REQUIRED；失敗保留 Member Center／Admin 紀錄。
- Gmail fulfillment：CONFIGURATION REQUIRED；本機缺 OAuth，程式正確顯示未連線，沒有假裝成功。
- Production Gmail status：UNKNOWN；未讀取 Railway 或真實信箱。

## 15. Production-data compatibility

- Members：舊 member JSON 可讀，登入時可補 canonical identity／member number；缺少不可重建的登入 subject 時需人工處理。
- Orders：大量欄位有 fallback；歷史訂單缺 snapshot 時只能保留當時已有事實，不應以新規則回算。
- Products：舊 `purchase` 可正規化為 `skus`；新增 PV 欄位有安全 default。
- Business rules：舊 Phase I.3 欄位會合併安全預設；舊 `referralNewRewardReleaseDelayDays` 對應新 base waiting；既有版本保留。
- Commerce state：缺檔會建立空 schema v1；現有檔必須是 schema v1 且包含核心集合。沒有任意舊 schema migration。
- Legacy referral reward：缺 qualification metadata 的 reward 走明確 legacy compatibility；新 reward 不要求 active subscription。
- Fulfillment：缺 state 可由 order 呈現推導狀態；事件／外部編號仍需原始資料才能重建。

結論：程式具備相容路徑，但未取得 production snapshot，不能宣稱正式資料已相容。部署前必須對匿名化副本執行 read-only load、數量／金額／ledger 對帳，任何 validation error 都應停止部署。

## 16. Security findings

- Admin business API 均有 server-side Admin session 驗證；login／logout 為預期例外。
- Member API 以 signed HttpOnly cookie 解析當前 canonical member，不接受 body memberId 取代身份。
- Cross-member subscription／credit 修改、referral view 與 order access 有拒絕測試。
- Guest order 使用獨立 access token；會員訂單以 member linkage 授權。
- 自薦、cycle、re-parent、duplicate reward／credit／order 均被阻擋或冪等。
- Internal scheduler 使用 timing-safe Bearer secret；但通知／Gmail 尚未提供相同 cron auth。
- Client price、shipping、credit、subscription discount、PV、reward、identity 均不作為 server authority。
- Production Test Lab 在未明確啟用時回 404，且仍需要 Admin auth。
- Audit／notification safe data 測試不含登入 secret；報告沒有輸出 env 值。
- Non-blocking historical lint debt 仍為 15 errors／43 warnings，未由 I.4 新增。

## 17. Test Lab safety

- 使用 `/membership-test-lab` 專屬檔案與 `SIM_MEMBER_*`／`SIM_*` namespace。
- Simulation commerce／rules 與 production commerce／rules 路徑不同。
- 不寫 production member、order、reward、credit。
- 不發 LINE、Email、不讀 Gmail、不觸發 7-ELEVEN 或 Railway scheduler。
- Production 預設 disabled；只有 `ENABLE_MEMBERSHIP_TEST_LAB=true` 才開啟，且 API 仍需 Admin auth。

## 18. Backup plan（未執行）

1. 停止所有 scheduler invocation，暫停外部 notification delivery。
2. 記錄目前 deployed commit、Railway service、volume mount、env 名稱與 health 結果。
3. 對 `/data` 做同一時間點完整 snapshot／export；另保存檔案清單、size、hash、timestamp。
4. 至少保存 members、identity、orders、membership-commerce、fulfillment、store、uploads、backups。
5. 對副本執行 JSON parse、schema validation、會員／訂單／ledger 數量與金額對帳。
6. 在隔離環境完成 restore rehearsal；確認會員登入、歷史訂單、credit balance、reward ledger 與 Owner rules。
7. 備份放到 volume 之外的受控儲存；加密、限制存取並設定保留期。

## 19. Deployment plan（未執行）

### PRE-DEPLOY

1. 完成上節備份及 restore rehearsal。
2. 確認現行 production commit、domain、health、env presence 與外部服務狀態。
3. 建立／驗證 `/data` volume；若舊版資料不在 `/data`，先停寫並以可回復程序搬移。
4. 用匿名化 production snapshot 跑 schema compatibility 與完整 regression。
5. 確認 Test Lab disabled、scheduler 尚未啟動、notification 尚未對外發送。

### DEPLOY

6. 部署明確 target commit。
7. 確認 startup、`/api/health`、volume mount 與資料數量，先做 read-only smoke test。
8. Owner 登入 Admin，核對規則版本、自訂週期 14 天、訂單／會員／credit／referral 數量。
9. 使用專用測試帳號做單筆 controlled write：會員登入、結帳、Admin、Member Center。
10. 分別測試通知與 scheduler；確認後才逐項啟用 cron。

## 20. Rollback plan（未執行）

1. 先停 scheduler、Gmail sync 與外部通知，保留現場 log／資料 snapshot。
2. Code 問題優先只 rollback code 到已知 commit，保持 `/data` 不動。
3. 不可直接把整個舊 snapshot 覆蓋新資料，否則會刪掉部署後的有效新訂單／付款／ledger。
4. 只有確認資料已損壞或新 schema 無法回讀時才做 data rollback；先匯出部署後新增交易並制定合併方案。
5. 若需還原，依一致性群組同時處理 orders、members／identity、commerce、fulfillment、store inventory，不可單檔任意倒退。
6. 還原後重跑 read-only 對帳，再恢復網站；scheduler／notification 最後啟用。

## 21. Owner Acceptance checklist

簡易可勾選版本見 `docs/phase-i4-owner-acceptance-checklist.md`。建議使用五個概念測試帳號，不在本階段建立正式帳號：

- A：一般 Email 會員。
- B：LINE 會員。
- C：定期購會員。
- D：推薦人。
- E：被推薦人。

本機／staging 可驗證 UI、流程、Admin 與資料一致性；正式 credential／外部服務測試需在 production-like domain，以專用測試資料逐項執行。

## 22. Automated test evidence

16 組 suite、合計 523 checks／assertions／scenarios 全數 PASS：

- I.3C.3 36、I.3C.2 41、I.3C.1 51、I.3C.0A 22。
- I.3C 57、I.3B 66、I.3A 34、I.3 17。
- Identity 32、Auth 24、Commerce 41、Membership Experience 36。
- Fulfillment 28、Checkout 20、LINE image 11、7-ELEVEN parser 7。

工程檢查結果：TypeScript PASS；I.4 文件 24 個必要章節與 99 個 Owner checkbox 完整性檢查 PASS；Next.js 16.2.10 production build PASS。I.4 只新增 Markdown，沒有可套用的 targeted ESLint 程式檔。全專案 lint 精確維持 historical baseline 15 errors／43 warnings，I.4 沒有新增問題；`git diff --check` 結果見最終 Git 核對。

## 23. Exact files changed during I.4

- `docs/phase-i4-production-readiness-audit.md`
- `docs/phase-i4-owner-acceptance-checklist.md`

沒有修改 runtime code、business rules、seed、`.gitignore`、Railway 或 production data。

## 24. Final classification

**READY FOR CONTROLLED OWNER ACCEPTANCE**

工程基線可開始受控 Owner 測試，但在 Persistent Volume 搬移／備份、production env、scheduler、外部服務及真實瀏覽器／裝置 QA 完成前，**不得分類為 production ready，也不得部署**。

## 25. 2026-08-31 — Phase I.4A Owner Acceptance Completion Addendum

Phase I.4A 本機 Owner Acceptance Rounds 1–4 已全部完成並標記 **PASS**。

本次 Owner Browser QA、canonical data review 與隔離自動測試已驗證：

- 會員結帳、7-ELEVEN 訂單建立，以及 Admin／Member 訂單投影
- Admin／Member 會員管理與安全資料呈現
- Owner 抵用金發放、結帳保留與折抵資訊可見性
- 訂單取消、抵用金釋放與庫存恰好回補一次
- 正常履約流程與成功取貨完成
- 成功履約不會重複扣除或返還庫存
- 無抵用金訂單不會建立假抵用金交易，且既有無關抵用金保持不變
- 不符合 canonical 資格的訂單不會意外建立 subscription、referral 或 reward 副作用

### PRODUCTION NOT READY

Phase I.4A 本機 Owner Acceptance PASS 不構成部署核准。正式環境仍須完成 Phase I.4B／I.4C 的上線準備與驗收，至少包括：

- Railway Persistent Volume 與正式持久化路徑
- production data migration、restore 與相容性驗證
- mutable inventory、commerce-state 與 fulfillment-state 的正式持久化
- 完整 backup／restore rehearsal
- production environment variables 與秘密管理
- scheduler／subscription scheduler 的安全入口、冪等與執行頻率
- LINE、Email、適用時的 Gmail、Cloudinary 與 7-ELEVEN 真實環境 QA
- controlled production checkout QA
- 部署後 restart／persistence verification

上述項目完成並取得獨立 Owner 核准前，**PRODUCTION NOT READY**，不得視為可部署或已取得 deployment approval。
