# KD Coffee 統一會員身份基礎

## 資料責任

- `data/members/*.json`（正式環境為 `$KD_DATA_DIR/members`）繼續保存會員個人資料與既有密碼憑證。
- `data/member-identity/registry.json`（正式環境為 `$KD_DATA_DIR/member-identity/registry.json`）只保存會員編號、雜湊後的登入識別、相容對照、連結交易與安全稽核。
- 歷史會員 ID 與訂單不會自動改寫。既有會員第一次成功登入或進入會員中心時，才在身份註冊表建立相容對照與會員編號。

## 安全界線

- Email 相同只是一個疑似重複訊號，不是合併授權。
- LINE 必須由已登入會員從會員中心主動發起連結。
- 連結交易綁定目前會員、OAuth state、十分鐘期限，且只能成功一次。
- 同一登入識別只能屬於一位會員；衝突時不搬移、不覆寫、不合併。
- 身份註冊表不保存原始 Email、LINE subject、OAuth code、session 或密碼資料。
- 不提供自動合併或正式資料批次 migration。

## 相容策略

- 既有 Email、LINE、混合會員檔案仍使用原本 ID，該 ID 直接成為其穩定 canonical member ID。
- 新會員使用與登入提供者無關的隨機 member ID。
- 現有 session payload 仍保存 member ID；相容 resolver 可處理未來的 legacy alias。
- 現有與新訂單仍保存相同的 canonical member ID，因此不需改寫歷史訂單或改變 Checkout 語意。

## 部署設定

身份雜湊優先使用 `MEMBER_IDENTITY_SECRET`，未設定時沿用 `AUTH_SESSION_SECRET`。正式環境密鑰至少 32 字元，設定後不可任意更換；更換會使既有登入身份索引無法查找。Persistent Storage 初始化只建立身份目錄，不會 seed 或覆蓋 registry。

## 延後項目

LINE 自助連結已完成。LINE 會員新增 Email 登入仍需獨立、可驗證 Email ownership 的寄信交易；本階段只保留 Email identity 與 linking transaction 的資料模型，不提供未驗證的即時連結。解除登入方式也只建立「不得解除最後一個登入方式」規則基礎，尚未開放 UI。
