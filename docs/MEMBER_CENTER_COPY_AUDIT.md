# MEMBER_CENTER_COPY_AUDIT

Baseline: j5d7b-reward-cron-notification-isolation @ 9aa18cceea15a42cc9a2109fbc41a89bcc332ea9.

## Scope and classification

Inventory covers 25 member routes/components/presentation helpers; 1038 source occurrences ({"STATIC":916,"DYNAMIC":67,"NOT SAFE TO EDIT":16,"BUSINESS GENERATED":39}). Source occurrences include duplicates and presentation helper fallbacks.

- STATIC: fixed captions, titles, descriptions, buttons, accessibility help, empty states and prompts.
- DYNAMIC: surrounding copy with values already produced by existing member/business logic; only template wording is editable. Tokens never calculate or store balances, percentages, dates or thresholds.
- BUSINESS GENERATED: existing status/qualification/timing captions from read-only presentation helpers. Only the final rendered wording is resolved; their source values and any comparisons stay unchanged.
- NOT SAFE TO EDIT: type literals, comparisons, identifiers, routes and validation expressions. Also outside the catalog: actual names/contact data, product/SKU names, order numbers, amounts, ledger records, rule parameters and authentication secrets.

## Implementation plan

Final imported-label follow-up additionally inspects the existing `fulfillmentStateLabels` map in `lib/fulfillmentTypes.ts` (11 BUSINESS GENERATED captions, seven previously uncatalogued). The original map and every enum remain untouched. Final scope is 26 source files / 1049 occurrences / 805 unique copy definitions. Identical default wording shares one copy definition.

| Imported source | Existing captions | Display handling |
| --- | --- | --- |
| lib/fulfillmentTypes.ts:19 | 訂單成立、準備中、已交寄、配送中、已到店、可以取貨、已完成取貨、疑似逾期未取、未取貨、已取消、需要人工確認 | Final member-order render boundaries only; no state translation or mutation |

1. Central defaults and metadata in lib/memberCenterCopyCatalog.ts; safe resolver in lib/memberCenterCopy.ts.
2. Independent JSON store data/member-center/display-copy.json locally, persistent root/member-center/display-copy.json on Railway. Read missing/corrupt files without initializing or writing them.
3. Member route layout loads plain-text overrides; client provider applies them only to text at render boundaries. No renamed business keys or translated values fed back into business code.
4. Admin /admin/member-center/copy, grouped fields, defaults/current copy, token purpose, preview and revision-aware atomic save. Owner session + same-origin enforcement.
5. Exact per-template whitelist: expressions/HTML/unknown or missing required tokens rejected on save; invalid historical config falls back to defaults. No eval or HTML renderer.
6. Tests use isolated temporary storage and compare protected file hashes and domain results. Existing Owner-dirty MemberSubscriptionExperience.tsx is MIXED and edited only at display boundaries. app/globals.css and runtime/CMS data remain untouched.

## Complete source inventory

| Source | Kind | Category | Default / template | Tokens |
| --- | --- | --- | --- | --- |
| app/member/page.tsx:192 | STATIC | label | 工作室建議 |  |
| app/member/page.tsx:208 | STATIC | label | 7-ELEVEN 取貨付款 |  |
| app/member/page.tsx:209 | STATIC | label | 宅配 |  |
| app/member/page.tsx:209 | STATIC | label | 工作室自取 |  |
| app/member/page.tsx:253 | STATIC | label | 待建立寄件單 |  |
| app/member/page.tsx:260 | STATIC | button | 待確認自取時間 |  |
| app/member/page.tsx:267 | STATIC | label | 已完成 |  |
| app/member/page.tsx:274 | STATIC | button | 已取消 |  |
| app/member/page.tsx:277 | STATIC | label | 訂單已成立 |  |
| app/member/page.tsx:311 | STATIC | label | KD COFFEE MEMBER |  |
| app/member/page.tsx:315 | STATIC | button | 快速會員登入 |  |
| app/member/page.tsx:319 | STATIC | button | 可使用 LINE、手機號碼或 Email 登入。登入後可查看自己的訂單與常用資料。 |  |
| app/member/page.tsx:325 | STATIC | button | 此登入方式需要完成帳號連結驗證。請先登入既有帳號，再從會員中心連結 LINE。 |  |
| app/member/page.tsx:326 | STATIC | button | LINE 登入未完成，請再試一次。 |  |
| app/member/page.tsx:334 | STATIC | button | 使用 LINE 登入／註冊 |  |
| app/member/page.tsx:340 | STATIC | label | 或 |  |
| app/member/page.tsx:349 | STATIC | button | 返回首頁 |  |
| app/member/page.tsx:375 | STATIC | label | KD點 |  |
| app/member/page.tsx:388 | STATIC | label | 進行中 |  |
| app/member/page.tsx:388 | STATIC | label | 已暫停 |  |
| app/member/page.tsx:388 | STATIC | label | 已停止 |  |
| app/member/page.tsx:388 | STATIC | label | 待啟用 |  |
| app/member/page.tsx:389 | STATIC | emptyState | 尚未建立 |  |
| app/member/page.tsx:391 | STATIC | label | 宅配 |  |
| app/member/page.tsx:391 | STATIC | label | 工作室自取 |  |
| app/member/page.tsx:392 | STATIC | label | 尚未設定 |  |
| app/member/page.tsx:427 | STATIC | button | LINE 登入方式已連結完成。 |  |
| app/member/page.tsx:430 | STATIC | button | 此登入方式需要完成帳號連結驗證。請先登入既有帳號，再從「登入方式」連結 LINE。 |  |
| app/member/page.tsx:433 | STATIC | emptyState | LINE 連結未完成。此 LINE 可能已連結其他會員，或驗證已逾時；會員資料沒有變更。 |  |
| app/member/page.tsx:441 | STATIC | hint | 會員頭像 |  |
| app/member/page.tsx:443 | STATIC | label | KD |  |
| app/member/page.tsx:447 | STATIC | label | KD COFFEE MEMBER |  |
| app/member/page.tsx:448 | DYNAMIC | label | {memberName}，歡迎回來 | memberName |
| app/member/page.tsx:448 | STATIC | label | 歡迎回來 |  |
| app/member/page.tsx:449 | STATIC | label | 享受每一杯咖啡，也感謝你成為 KD Coffee 的一份子。 |  |
| app/member/page.tsx:451 | STATIC | label | 會員編號 |  |
| app/member/page.tsx:463 | STATIC | tooltip | 會員總覽 |  |
| app/member/page.tsx:470 | STATIC | label | 可用折抵額 |  |
| app/member/page.tsx:471 | STATIC | label | 元 |  |
| app/member/page.tsx:472 | STATIC | reward | 已正式入帳，結帳時可自行選擇使用 |  |
| app/member/page.tsx:479 | STATIC | reward | 待入帳回饋 |  |
| app/member/page.tsx:481 | STATIC | label | 共 |  |
| app/member/page.tsx:481 | STATIC | label | 筆・預估折抵 NT$ |  |
| app/member/page.tsx:481 | STATIC | label | ・部分歷史點數未記錄 |  |
| app/member/page.tsx:484 | STATIC | label | 下一次配送 |  |
| app/member/page.tsx:485 | STATIC | label | 尚未排定 |  |
| app/member/page.tsx:486 | STATIC | label | 建立定期配送後會顯示於此 |  |
| app/member/page.tsx:489 | STATIC | label | 最近訂單 |  |
| app/member/page.tsx:490 | STATIC | emptyState | 尚無訂單 |  |
| app/member/page.tsx:491 | STATIC | label | 完成第一筆訂購後會顯示於此 |  |
| app/member/page.tsx:497 | STATIC | tooltip | 快速功能 |  |
| app/member/page.tsx:498 | STATIC | label | 快速功能 |  |
| app/member/page.tsx:500 | STATIC | reward | 我的回饋 |  |
| app/member/page.tsx:501 | STATIC | label | 配送設定 |  |
| app/member/page.tsx:502 | STATIC | label | 我的訂單 |  |
| app/member/page.tsx:503 | STATIC | label | 帳戶設定 |  |
| app/member/page.tsx:508 | STATIC | label | 最近動態 |  |
| app/member/page.tsx:513 | STATIC | label | 最近訂單 |  |
| app/member/page.tsx:517 | STATIC | button | 查看訂單 |  |
| app/member/page.tsx:523 | STATIC | label | 定期配送 |  |
| app/member/page.tsx:524 | STATIC | label | 下一次配送 |  |
| app/member/page.tsx:527 | STATIC | label | 配送設定 |  |
| app/member/page.tsx:533 | STATIC | reward | 會員回饋 |  |
| app/member/page.tsx:534 | STATIC | reward | 回饋待入帳 |  |
| app/member/page.tsx:537 | STATIC | reward | 查看回饋 |  |
| app/member/page.tsx:540 | STATIC | emptyState | 目前沒有需要處理的新動態。 |  |
| app/member/page.tsx:549 | STATIC | tooltip | 帳戶資料 |  |
| app/member/page.tsx:550 | STATIC | tooltip | 編輯 |  |
| app/member/page.tsx:551 | STATIC | label | Email 尚未設定 |  |
| app/member/page.tsx:551 | STATIC | label | 電話尚未設定 |  |
| app/member/page.tsx:551 | STATIC | label | Email 已連結 |  |
| app/member/page.tsx:551 | STATIC | label | Email 未連結 |  |
| app/member/page.tsx:551 | STATIC | label | LINE 已連結 |  |
| app/member/page.tsx:551 | STATIC | label | LINE 未連結 |  |
| app/member/page.tsx:556 | STATIC | label | 會員編號 |  |
| app/member/page.tsx:558 | STATIC | label | 固定會員識別，不可變更。 |  |
| app/member/page.tsx:561 | STATIC | label | 會員建立日期 |  |
| app/member/page.tsx:563 | STATIC | button | 最近登入： |  |
| app/member/page.tsx:566 | STATIC | label | 常用門市 |  |
| app/member/page.tsx:567 | STATIC | label | 尚未設定 |  |
| app/member/page.tsx:582 | STATIC | label | 會員帳號 |  |
| app/member/page.tsx:582 | STATIC | button | 登入方式 |  |
| app/member/page.tsx:583 | STATIC | label | 電子郵件 |  |
| app/member/page.tsx:583 | STATIC | label | 已連結 |  |
| app/member/page.tsx:583 | STATIC | label | 尚未連結 |  |
| app/member/page.tsx:583 | STATIC | label | ✓ 可使用 |  |
| app/member/page.tsx:583 | STATIC | label | 信箱驗證功能準備中 |  |
| app/member/page.tsx:584 | STATIC | label | LINE |  |
| app/member/page.tsx:584 | STATIC | label | 已連結 |  |
| app/member/page.tsx:584 | STATIC | label | 尚未連結 |  |
| app/member/page.tsx:584 | STATIC | label | ✓ 可使用 |  |
| app/member/page.tsx:584 | STATIC | label | 連結 LINE |  |
| app/member/page.tsx:585 | STATIC | button | 登入方式只用來確認是您本人；訂單與會員紀錄都會保留在同一個會員帳號。 |  |
| app/member/page.tsx:587 | STATIC | label | 登出會員 |  |
| app/member/page.tsx:594 | STATIC | tooltip | 定期配送 |  |
| app/member/page.tsx:594 | STATIC | tooltip | 管理配送 |  |
| app/member/page.tsx:594 | DYNAMIC | label | 每 {value1} 天 | value1 |
| app/member/page.tsx:594 | STATIC | emptyState | 尚未建立方案 |  |
| app/member/page.tsx:594 | DYNAMIC | label | 下一次 {date} | date |
| app/member/page.tsx:594 | STATIC | label | 下一次尚未排定 |  |
| app/member/page.tsx:601 | STATIC | tooltip | 我的訂單 |  |
| app/member/page.tsx:601 | STATIC | tooltip | 查看 |  |
| app/member/page.tsx:601 | STATIC | emptyState | 尚無訂單 |  |
| app/member/page.tsx:601 | STATIC | label | 完成第一筆訂購後會顯示於此 |  |
| app/member/page.tsx:606 | STATIC | label | ORDER HISTORY |  |
| app/member/page.tsx:610 | STATIC | label | 最近訂單 |  |
| app/member/page.tsx:615 | STATIC | label | 顯示最近 |  |
| app/member/page.tsx:615 | STATIC | label | 筆・共 |  |
| app/member/page.tsx:615 | STATIC | label | 筆 |  |
| app/member/page.tsx:646 | STATIC | label | 取貨門市： |  |
| app/member/page.tsx:658 | STATIC | label | 取貨期限： |  |
| app/member/page.tsx:693 | STATIC | label | LINE 已通知工作室 |  |
| app/member/page.tsx:694 | STATIC | label | 訂單已保存 |  |
| app/member/page.tsx:701 | STATIC | button | 查看／管理此訂單 |  |
| app/member/page.tsx:710 | STATIC | emptyState | 目前還沒有會員訂單 |  |
| app/member/page.tsx:714 | STATIC | label | 完成第一筆訂購後，訂單紀錄會顯示在這裡。 |  |
| app/member/page.tsx:718 | STATIC | label | 開始選購咖啡 |  |
| app/member/reset-password/page.tsx:15 | STATIC | label | KD COFFEE MEMBER |  |
| app/member/reset-password/page.tsx:16 | STATIC | label | 重新設定密碼 |  |
| app/member/reset-password/page.tsx:22 | STATIC | label | 密碼重設連結無效或已過期，請重新申請。 |  |
| app/member/reset-password/page.tsx:24 | STATIC | button | 回到會員登入 |  |
| components/member/EmailAuthForms.tsx:64 | STATIC | button | 此 Email 已經註冊過，請直接登入。 |  |
| components/member/EmailAuthForms.tsx:70 | STATIC | label | 操作失敗，請稍後再試 |  |
| components/member/EmailAuthForms.tsx:76 | STATIC | button | 如果此 Email 已註冊，我們會將密碼重設方式寄到您的信箱。 |  |
| components/member/EmailAuthForms.tsx:88 | STATIC | label | 操作失敗，請稍後再試 |  |
| components/member/EmailAuthForms.tsx:102 | STATIC | button | 使用 Email 快速註冊 |  |
| components/member/EmailAuthForms.tsx:108 | STATIC | label | EMAIL MEMBER |  |
| components/member/EmailAuthForms.tsx:111 | STATIC | button | Email 登入 |  |
| components/member/EmailAuthForms.tsx:113 | STATIC | label | 建立 Email 會員 |  |
| components/member/EmailAuthForms.tsx:114 | STATIC | label | 忘記密碼 |  |
| components/member/EmailAuthForms.tsx:133 | STATIC | label | 密碼 |  |
| components/member/EmailAuthForms.tsx:147 | STATIC | label | 再次輸入密碼 |  |
| components/member/EmailAuthForms.tsx:164 | STATIC | label | 處理中… |  |
| components/member/EmailAuthForms.tsx:166 | STATIC | button | 登入 |  |
| components/member/EmailAuthForms.tsx:168 | STATIC | label | 建立會員 |  |
| components/member/EmailAuthForms.tsx:169 | STATIC | label | 寄送密碼重設方式 |  |
| components/member/EmailAuthForms.tsx:179 | STATIC | label | 忘記密碼？ |  |
| components/member/EmailAuthForms.tsx:189 | STATIC | button | 還不是會員？使用 Email 快速註冊 |  |
| components/member/EmailAuthForms.tsx:191 | STATIC | button | 已經是 Email 會員？Email 登入 |  |
| components/member/EmailAuthForms.tsx:192 | STATIC | button | 返回 Email 登入 |  |
| components/member/EmailAuthForms.tsx:198 | STATIC | label | 或 |  |
| components/member/EmailAuthForms.tsx:206 | STATIC | label | 直接使用訪客下單 |  |
| components/member/EmailAuthForms.tsx:208 | STATIC | button | 無需註冊會員，也可以直接購買 |  |
| components/member/KdShareDialog.tsx:15 | STATIC | description | 最近喝到一家我很喜歡的咖啡，想分享給你 ☕<br><br>KD Coffee 是自己烘焙的精品咖啡，每款都有不同的風味。有空可以逛逛，說不定會找到你喜歡的那一杯。 |  |
| components/member/KdShareDialog.tsx:60 | STATIC | label | 分享完成 |  |
| components/member/KdShareDialog.tsx:63 | STATIC | label | 分享內容已複製，可以直接貼給朋友 |  |
| components/member/KdShareDialog.tsx:67 | STATIC | label | 暫時無法分享，請稍後再試 |  |
| components/member/KdShareDialog.tsx:74 | STATIC | label | 分享連結已複製 |  |
| components/member/KdShareDialog.tsx:76 | STATIC | label | 複製失敗，請選取連結後手動複製 |  |
| components/member/KdShareDialog.tsx:93 | STATIC | label | QR Code 圖片已下載 |  |
| components/member/KdShareDialog.tsx:96 | STATIC | label | 已開啟 QR Code 圖片，可長按或另存圖片 |  |
| components/member/KdShareDialog.tsx:104 | STATIC | label | SHARE KD COFFEE |  |
| components/member/KdShareDialog.tsx:104 | STATIC | label | 分享 KD Coffee |  |
| components/member/KdShareDialog.tsx:105 | STATIC | tooltip | 關閉分享視窗 |  |
| components/member/KdShareDialog.tsx:108 | STATIC | description | 把你喜歡的 KD Coffee 分享給朋友。連結會保留你的分享來源，朋友仍可自由瀏覽與選購。 |  |
| components/member/KdShareDialog.tsx:110 | STATIC | label | 分享文字 |  |
| components/member/KdShareDialog.tsx:113 | STATIC | label | 分享連結 |  |
| components/member/KdShareDialog.tsx:113 | STATIC | label | KD Coffee 首頁＋你的分享碼 |  |
| components/member/KdShareDialog.tsx:115 | STATIC | label | 分享出去 |  |
| components/member/KdShareDialog.tsx:116 | STATIC | label | 複製連結 |  |
| components/member/KdShareDialog.tsx:117 | STATIC | label | 收起 QR Code |  |
| components/member/KdShareDialog.tsx:117 | STATIC | label | 顯示 QR Code |  |
| components/member/KdShareDialog.tsx:119 | STATIC | tooltip | 分享 QR Code |  |
| components/member/KdShareDialog.tsx:120 | STATIC | hint | KD Coffee 分享 QR Code |  |
| components/member/KdShareDialog.tsx:121 | STATIC | label | 下載 QR Code |  |
| components/member/KdShareDialog.tsx:123 | STATIC | label | 分享如何計算？ |  |
| components/member/KdShareDialog.tsx:123 | STATIC | button | 朋友從這個連結進入 KD Coffee 後，以訪客身分完成有效訂單，可列入你的推廣零售；若朋友完成會員註冊，推薦關係會由系統自動記錄。已登入會員購買仍屬於該會員自己的消費。 |  |
| components/member/MemberAvatarForm.tsx:21 | STATIC | label | 頭像上傳失敗 |  |
| components/member/MemberAvatarForm.tsx:22 | STATIC | label | 頭像已更新。重新整理後首頁頭像也會同步。  |  |
| components/member/MemberAvatarForm.tsx:23 | STATIC | label | 頭像上傳失敗 |  |
| components/member/MemberAvatarForm.tsx:32 | STATIC | label | 頭像移除失敗 |  |
| components/member/MemberAvatarForm.tsx:33 | STATIC | label | 已恢復 LINE 頭像。 |  |
| components/member/MemberAvatarForm.tsx:33 | STATIC | label | 已恢復 KD 預設頭像。 |  |
| components/member/MemberAvatarForm.tsx:34 | STATIC | label | 頭像移除失敗 |  |
| components/member/MemberAvatarForm.tsx:38 | STATIC | tooltip | 會員頭像 |  |
| components/member/MemberAvatarForm.tsx:39 | STATIC | hint | 目前會員頭像 |  |
| components/member/MemberAvatarForm.tsx:39 | STATIC | label | KD |  |
| components/member/MemberAvatarForm.tsx:40 | STATIC | label | 會員頭像 |  |
| components/member/MemberAvatarForm.tsx:40 | STATIC | description | 可上傳 JPG、PNG 或 WebP，檔案上限 5MB。自行上傳的照片會優先於 LINE 頭像。 |  |
| components/member/MemberAvatarForm.tsx:40 | STATIC | label | 處理中… |  |
| components/member/MemberAvatarForm.tsx:40 | STATIC | label | 更換照片 |  |
| components/member/MemberAvatarForm.tsx:40 | STATIC | label | 上傳照片 |  |
| components/member/MemberAvatarForm.tsx:40 | STATIC | label | 移除自訂頭像 |  |
| components/member/MemberLink.tsx:22 | STATIC | label | KD Coffee 會員 |  |
| components/member/MemberLink.tsx:46 | STATIC | button | 會員登入 |  |
| components/member/MemberMobileDisclosure.tsx:32 | STATIC | button | 管理 |  |
| components/member/MemberMobileDisclosure.tsx:88 | STATIC | label | 收合 |  |
| components/member/MemberProfileForm.tsx:34 | STATIC | button | 會員資料儲存失敗 |  |
| components/member/MemberProfileForm.tsx:35 | STATIC | label | 會員資料已更新，下次結帳會自動帶入。 |  |
| components/member/MemberProfileForm.tsx:37 | STATIC | button | 會員資料儲存失敗 |  |
| components/member/MemberProfileForm.tsx:47 | STATIC | label | PROFILE |  |
| components/member/MemberProfileForm.tsx:48 | STATIC | label | 基本資料 |  |
| components/member/MemberProfileForm.tsx:50 | STATIC | button | 可直接修改後儲存 |  |
| components/member/MemberProfileForm.tsx:55 | STATIC | label | 常用姓名 |  |
| components/member/MemberProfileForm.tsx:61 | STATIC | hint | 請填寫真實姓名 |  |
| components/member/MemberProfileForm.tsx:66 | STATIC | label | 手機號碼 |  |
| components/member/MemberProfileForm.tsx:73 | STATIC | hint | 例如 0912345678 |  |
| components/member/MemberProfileForm.tsx:78 | STATIC | label | 選填 |  |
| components/member/MemberProfileForm.tsx:84 | STATIC | hint | 用於日後寄送訂單通知 |  |
| components/member/MemberProfileForm.tsx:91 | STATIC | button | 儲存中… |  |
| components/member/MemberProfileForm.tsx:91 | STATIC | button | 儲存會員資料 |  |
| components/member/MemberQualificationProgress.tsx:78 | STATIC | label | KD點 |  |
| components/member/MemberQualificationProgress.tsx:103 | STATIC | label | 定期配送會員 |  |
| components/member/MemberQualificationProgress.tsx:104 | STATIC | label | 一般會員 |  |
| components/member/MemberQualificationProgress.tsx:111 | STATIC | qualification | 依一般會員資格判定 |  |
| components/member/MemberQualificationProgress.tsx:115 | STATIC | qualification | 依有效定期配送會員資格判定 |  |
| components/member/MemberQualificationProgress.tsx:119 | STATIC | qualification | 需同時符合一般會員與定期配送會員資格 |  |
| components/member/MemberQualificationProgress.tsx:122 | STATIC | label | 一般會員或定期配送會員任一路徑達成即可 |  |
| components/member/MemberQualificationProgress.tsx:177 | DYNAMIC | label | 商品 {pointName} | pointName |
| components/member/MemberQualificationProgress.tsx:178 | STATIC | label | 有效消費 |  |
| components/member/MemberQualificationProgress.tsx:187 | STATIC | qualification | 已達推薦回饋資格 |  |
| components/member/MemberQualificationProgress.tsx:189 | STATIC | qualification | 資格條件已達成 |  |
| components/member/MemberQualificationProgress.tsx:190 | DYNAMIC | label | 尚差 {remainingPoints} | remainingPoints |
| components/member/MemberQualificationProgress.tsx:199 | DYNAMIC | qualification | 目前資格有效至 {date} | date |
| components/member/MemberQualificationProgress.tsx:202 | STATIC | qualification | 目前已符合推薦回饋領取資格。 |  |
| components/member/MemberQualificationProgress.tsx:204 | STATIC | qualification | 目前累積條件已符合，系統會依正式訂單完成事件確認資格。 |  |
| components/member/MemberQualificationProgress.tsx:205 | DYNAMIC | qualification | 最近 {windowDays} 天累積{value2}即可逐步達成資格。 | windowDays, value2 |
| components/member/MemberQualificationProgress.tsx:214 | STATIC | qualification | 目前資格 |  |
| components/member/MemberQualificationProgress.tsx:219 | STATIC | label | 有效 |  |
| components/member/MemberQualificationProgress.tsx:229 | DYNAMIC | label | 至 {date} | date |
| components/member/MemberQualificationProgress.tsx:232 | DYNAMIC | label | 目標 {requiredPoints} | requiredPoints |
| components/member/MemberQualificationProgress.tsx:242 | STATIC | label | 定期配送會員 |  |
| components/member/MemberQualificationProgress.tsx:243 | STATIC | label | 一般會員 |  |
| components/member/MemberQualificationProgress.tsx:260 | STATIC | label | REFERRAL REWARD QUALIFICATION |  |
| components/member/MemberQualificationProgress.tsx:264 | STATIC | qualification | 推薦回饋資格 |  |
| components/member/MemberQualificationProgress.tsx:280 | STATIC | qualification | 資格有效 |  |
| components/member/MemberQualificationProgress.tsx:281 | STATIC | label | 累積中 |  |
| components/member/MemberQualificationProgress.tsx:287 | STATIC | label | 目前狀態 |  |
| components/member/MemberQualificationProgress.tsx:315 | STATIC | tooltip | 推薦回饋資格進度 |  |
| components/member/MemberQualificationProgress.tsx:337 | STATIC | qualification | 目前已符合資格 |  |
| components/member/MemberQualificationProgress.tsx:339 | DYNAMIC | label | 還差 {remainingPoints} | remainingPoints |
| components/member/MemberQualificationProgress.tsx:344 | STATIC | label | 條件已達成 |  |
| components/member/MemberQualificationProgress.tsx:351 | STATIC | label | QUALIFICATION DETAILS |  |
| components/member/MemberQualificationProgress.tsx:352 | STATIC | qualification | 查看資格計算明細 |  |
| components/member/MemberQualificationProgress.tsx:361 | STATIC | qualification | 目前有效資格 |  |
| components/member/MemberQualificationProgress.tsx:374 | STATIC | label | 達成日期： |  |
| components/member/MemberQualificationProgress.tsx:389 | STATIC | label | CURRENT QUALIFICATION EVIDENCE |  |
| components/member/MemberQualificationProgress.tsx:393 | STATIC | button | 查看本期合格消費 |  |
| components/member/MemberQualificationProgress.tsx:398 | STATIC | label | 共 |  |
| components/member/MemberQualificationProgress.tsx:403 | STATIC | label | 筆 |  |
| components/member/MemberQualificationProgress.tsx:410 | STATIC | qualification | 本期取得資格 |  |
| components/member/MemberQualificationProgress.tsx:426 | STATIC | qualification | 本期資格使用 |  |
| components/member/MemberQualificationProgress.tsx:440 | STATIC | label | 達標路徑 |  |
| components/member/MemberQualificationProgress.tsx:477 | STATIC | label | 本筆達標 |  |
| components/member/MemberQualificationProgress.tsx:485 | STATIC | label | 訂單合格值 |  |
| components/member/MemberQualificationProgress.tsx:501 | STATIC | label | 本期採計 |  |
| components/member/MemberQualificationProgress.tsx:517 | STATIC | label | 累積採計 |  |
| components/member/MemberQualificationProgress.tsx:537 | STATIC | qualification | 此處顯示的是實際用於取得目前推薦回饋資格的已完成訂單；同一筆已採計消費不會重複計入下一資格週期。 |  |
| components/member/MemberQualificationProgress.tsx:546 | STATIC | label | NEXT QUALIFICATION CYCLE |  |
| components/member/MemberQualificationProgress.tsx:550 | STATIC | qualification | 下一資格週期累積 |  |
| components/member/MemberQualificationProgress.tsx:554 | STATIC | qualification | 你目前的推薦回饋資格仍然有效。以下顯示下一個資格週期重新累積的進度，不影響目前有效資格。 |  |
| components/member/MemberQualificationProgress.tsx:584 | STATIC | label | 下一輪累積 |  |
| components/member/MemberQualificationProgress.tsx:586 | STATIC | label | 已達標 |  |
| components/member/MemberQualificationProgress.tsx:589 | STATIC | label | 目前未啟用 |  |
| components/member/MemberQualificationProgress.tsx:590 | STATIC | label | 累積中 |  |
| components/member/MemberQualificationProgress.tsx:597 | STATIC | label | 最近 |  |
| components/member/MemberQualificationProgress.tsx:597 | STATIC | label | 天累積 |  |
| components/member/MemberQualificationProgress.tsx:610 | STATIC | qualification | 資格門檻 |  |
| components/member/MemberQualificationProgress.tsx:639 | STATIC | qualification | 此路徑需目前具有有效的定期配送資格。 |  |
| components/member/MemberQualificationProgress.tsx:646 | STATIC | label | 完成訂單 |  |
| components/member/MemberQualificationProgress.tsx:678 | STATIC | label | 目前可計入 |  |
| components/member/MemberQualificationProgress.tsx:692 | STATIC | emptyState | 目前下一資格週期尚無可重新計入的已完成訂單。 |  |
| components/member/MemberQualificationProgress.tsx:700 | STATIC | qualification | 資格進度依已完成訂單與目前後台規則計算；已用於取得目前資格的消費不會重複計入下一資格週期。 |  |
| components/member/MemberQualificationSummary.tsx:17 | STATIC | label | 已達成 ✓ |  |
| components/member/MemberQualificationSummary.tsx:19 | STATIC | reward | 等待訂單完成確認 |  |
| components/member/MemberQualificationSummary.tsx:20 | STATIC | label | 累積中 |  |
| components/member/MemberQualificationSummary.tsx:22 | DYNAMIC | label | 有效至 {date} | date |
| components/member/MemberQualificationSummary.tsx:22 | STATIC | qualification | 目前資格有效 |  |
| components/member/MemberQualificationSummary.tsx:24 | STATIC | reward | 等待有效訂單完成後確認 |  |
| components/member/MemberQualificationSummary.tsx:25 | STATIC | qualification | 查看目前資格進度 |  |
| components/member/MemberQualificationSummary.tsx:37 | STATIC | qualification | 推薦回饋資格 |  |
| components/member/MemberQualificationSummary.tsx:42 | STATIC | button | 查看詳情 |  |
| components/member/MemberQualificationSummary.tsx:46 | STATIC | label | REWARD QUALIFICATION |  |
| components/member/MemberQualificationSummary.tsx:46 | STATIC | qualification | 推薦回饋資格詳情 |  |
| components/member/MemberQualificationSummary.tsx:46 | STATIC | tooltip | 關閉推薦回饋資格詳情 |  |
| components/member/MemberReferralCenter.tsx:28 | NOT SAFE TO EDIT | label | 推廣零售 |  |
| components/member/MemberReferralCenter.tsx:28 | NOT SAFE TO EDIT | reward | 推薦回饋 |  |
| components/member/MemberReferralCenter.tsx:28 | NOT SAFE TO EDIT | label | 自己的消費 |  |
| components/member/MemberReferralCenter.tsx:36 | NOT SAFE TO EDIT | label | 推廣零售 |  |
| components/member/MemberReferralCenter.tsx:152 | DYNAMIC | label | {value1} 元 | value1 |
| components/member/MemberReferralCenter.tsx:317 | STATIC | label | KD點 |  |
| components/member/MemberReferralCenter.tsx:357 | STATIC | label | 自己的消費 |  |
| components/member/MemberReferralCenter.tsx:357 | DYNAMIC | reward | 第 {generation} 代推薦回饋 | generation |
| components/member/MemberReferralCenter.tsx:378 | STATIC | reward | 推廣零售回饋 |  |
| components/member/MemberReferralCenter.tsx:400 | STATIC | reward | 推廣零售回饋 |  |
| components/member/MemberReferralCenter.tsx:402 | STATIC | label | 自己的消費 |  |
| components/member/MemberReferralCenter.tsx:404 | DYNAMIC | reward | 第 {generation} 代推薦回饋 | generation |
| components/member/MemberReferralCenter.tsx:405 | STATIC | reward | 推薦回饋 |  |
| components/member/MemberReferralCenter.tsx:406 | STATIC | reward | 已入帳 ✓ |  |
| components/member/MemberReferralCenter.tsx:433 | NOT SAFE TO EDIT | reward | 推廣零售回饋 |  |
| components/member/MemberReferralCenter.tsx:444 | STATIC | label | REFERRAL |  |
| components/member/MemberReferralCenter.tsx:444 | STATIC | label | 推薦 |  |
| components/member/MemberReferralCenter.tsx:444 | STATIC | button | 分享咖啡、查看推薦人與團隊，並直接開啟三代組織圖。 |  |
| components/member/MemberReferralCenter.tsx:448 | STATIC | label | SHARE KD COFFEE |  |
| components/member/MemberReferralCenter.tsx:448 | STATIC | label | 分享給朋友 |  |
| components/member/MemberReferralCenter.tsx:449 | STATIC | reward | 這是會員中心唯一的分享入口。朋友透過你的專屬連結加入會員，系統會保留推薦關係；訪客完成有效購買，也可能帶來推廣零售回饋。 |  |
| components/member/MemberReferralCenter.tsx:451 | STATIC | label | 我的推薦碼 |  |
| components/member/MemberReferralCenter.tsx:452 | STATIC | label | 專屬連結 |  |
| components/member/MemberReferralCenter.tsx:452 | STATIC | label | KD Coffee 首頁＋你的分享碼 |  |
| components/member/MemberReferralCenter.tsx:454 | STATIC | label | 分享 KD Coffee |  |
| components/member/MemberReferralCenter.tsx:457 | STATIC | label | INVITED BY |  |
| components/member/MemberReferralCenter.tsx:457 | STATIC | label | 誰邀請我 |  |
| components/member/MemberReferralCenter.tsx:458 | DYNAMIC | label | 會員 {value1} | value1 |
| components/member/MemberReferralCenter.tsx:458 | STATIC | label | 無推薦人資料 |  |
| components/member/MemberReferralCenter.tsx:459 | STATIC | label | 這是你的推薦關係來源；會員聯絡資料不會在此顯示。 |  |
| components/member/MemberReferralCenter.tsx:459 | STATIC | emptyState | 目前沒有其他會員的推薦關係紀錄。 |  |
| components/member/MemberReferralCenter.tsx:460 | STATIC | label | 直接推薦 |  |
| components/member/MemberReferralCenter.tsx:460 | STATIC | label | 人 |  |
| components/member/MemberReferralCenter.tsx:460 | STATIC | label | 團隊人數 |  |
| components/member/MemberReferralCenter.tsx:460 | STATIC | label | 人 |  |
| components/member/MemberReferralCenter.tsx:466 | STATIC | label | MY TEAM |  |
| components/member/MemberReferralCenter.tsx:466 | STATIC | label | 我的推薦團隊 |  |
| components/member/MemberReferralCenter.tsx:466 | STATIC | button | 先看自己的第一代；也可以打開三代樹狀組織圖，點選會員後以他為中心繼續往下查看。 |  |
| components/member/MemberReferralCenter.tsx:467 | STATIC | button | 查看組織圖 |  |
| components/member/MemberReferralCenter.tsx:471 | STATIC | button | ← 返回上一層 |  |
| components/member/MemberReferralCenter.tsx:471 | STATIC | label | 我的第一代 |  |
| components/member/MemberReferralCenter.tsx:472 | STATIC | tooltip | 推薦團隊瀏覽路徑 |  |
| components/member/MemberReferralCenter.tsx:473 | STATIC | label | 我的推薦團隊 |  |
| components/member/MemberReferralCenter.tsx:476 | STATIC | button | 目前查看 |  |
| components/member/MemberReferralCenter.tsx:476 | STATIC | label | 會員 |  |
| components/member/MemberReferralCenter.tsx:476 | STATIC | label | 你的第 |  |
| components/member/MemberReferralCenter.tsx:476 | STATIC | label | 代會員 |  |
| components/member/MemberReferralCenter.tsx:476 | STATIC | label | 他的直接推薦 |  |
| components/member/MemberReferralCenter.tsx:476 | STATIC | label | 人 |  |
| components/member/MemberReferralCenter.tsx:478 | STATIC | label | 你的第 |  |
| components/member/MemberReferralCenter.tsx:478 | STATIC | label | 代 · |  |
| components/member/MemberReferralCenter.tsx:478 | STATIC | label | 人 |  |
| components/member/MemberReferralCenter.tsx:481 | STATIC | label | 會員 |  |
| components/member/MemberReferralCenter.tsx:481 | STATIC | label | 你的第 |  |
| components/member/MemberReferralCenter.tsx:481 | STATIC | label | 代 |  |
| components/member/MemberReferralCenter.tsx:482 | STATIC | label | 直推 |  |
| components/member/MemberReferralCenter.tsx:482 | STATIC | label | 人 |  |
| components/member/MemberReferralCenter.tsx:482 | STATIC | label | 團隊 |  |
| components/member/MemberReferralCenter.tsx:482 | STATIC | label | 人 |  |
| components/member/MemberReferralCenter.tsx:482 | STATIC | button | 查看下線 › |  |
| components/member/MemberReferralCenter.tsx:482 | STATIC | emptyState | 尚無下線 |  |
| components/member/MemberReferralCenter.tsx:483 | DYNAMIC | emptyState | 會員 {value1} 目前沒有直接推薦會員 | value1 |
| components/member/MemberReferralCenter.tsx:483 | STATIC | emptyState | 目前還沒有第一代推薦會員 |  |
| components/member/MemberReferralCenter.tsx:483 | STATIC | button | 可返回上一層繼續查看其他推薦會員。 |  |
| components/member/MemberReferralCenter.tsx:483 | STATIC | label | 分享給朋友後，完成會員加入就會在這裡顯示。 |  |
| components/member/MemberReferralCenter.tsx:490 | STATIC | label | REWARDS |  |
| components/member/MemberReferralCenter.tsx:490 | STATIC | reward | 回饋 |  |
| components/member/MemberReferralCenter.tsx:490 | STATIC | qualification | 推廣零售、會員回饋、資格與歷史明細各自清楚呈現。 |  |
| components/member/MemberReferralCenter.tsx:493 | STATIC | label | MEMBER REWARDS |  |
| components/member/MemberReferralCenter.tsx:493 | STATIC | reward | 會員回饋 |  |
| components/member/MemberReferralCenter.tsx:493 | STATIC | reward | 回饋點數與折抵金額都以正式紀錄為準。 |  |
| components/member/MemberReferralCenter.tsx:496 | STATIC | label | MY REWARDS |  |
| components/member/MemberReferralCenter.tsx:496 | STATIC | reward | 我的回饋 |  |
| components/member/MemberReferralCenter.tsx:497 | STATIC | reward | 待入帳 |  |
| components/member/MemberReferralCenter.tsx:497 | STATIC | reward | 已入帳 |  |
| components/member/MemberReferralCenter.tsx:498 | STATIC | reward | 查看回饋明細 |  |
| components/member/MemberReferralCenter.tsx:504 | STATIC | label | REWARD DETAILS |  |
| components/member/MemberReferralCenter.tsx:504 | STATIC | reward | 推薦與會員回饋 |  |
| components/member/MemberReferralCenter.tsx:504 | STATIC | tooltip | 關閉回饋明細 |  |
| components/member/MemberReferralCenter.tsx:507 | STATIC | label | REWARD HISTORY |  |
| components/member/MemberReferralCenter.tsx:507 | STATIC | reward | 回饋總覽 |  |
| components/member/MemberReferralCenter.tsx:507 | STATIC | qualification | 先看回饋結果，需要時再展開計算、資格與來源訂單。 |  |
| components/member/MemberReferralCenter.tsx:509 | STATIC | tooltip | 已入帳抵用金總覽 |  |
| components/member/MemberReferralCenter.tsx:510 | STATIC | label | 目前可用折抵額 |  |
| components/member/MemberReferralCenter.tsx:510 | STATIC | reward | 直接取自正式抵用金帳本，不由回饋紀錄重算 |  |
| components/member/MemberReferralCenter.tsx:511 | STATIC | reward | 回饋入帳來源 |  |
| components/member/MemberReferralCenter.tsx:511 | STATIC | label | 筆 |  |
| components/member/MemberReferralCenter.tsx:511 | STATIC | reward | 推廣零售、推薦回饋與自己的消費 |  |
| components/member/MemberReferralCenter.tsx:514 | STATIC | tooltip | 回饋點數總覽 |  |
| components/member/MemberReferralCenter.tsx:515 | STATIC | reward | 累計回饋 |  |
| components/member/MemberReferralCenter.tsx:515 | STATIC | reward | 已入帳＋有效待入帳 |  |
| components/member/MemberReferralCenter.tsx:516 | STATIC | reward | 已入帳 |  |
| components/member/MemberReferralCenter.tsx:516 | STATIC | label | 筆 |  |
| components/member/MemberReferralCenter.tsx:517 | STATIC | reward | 待入帳 |  |
| components/member/MemberReferralCenter.tsx:517 | STATIC | label | 筆・預估折抵 NT$ |  |
| components/member/MemberReferralCenter.tsx:518 | STATIC | reward | 本月已入帳 |  |
| components/member/MemberReferralCenter.tsx:518 | STATIC | reward | 會員／推薦回饋本月正式發放 |  |
| components/member/MemberReferralCenter.tsx:521 | STATIC | reward | 推薦回饋如何計算？ |  |
| components/member/MemberReferralCenter.tsx:521 | STATIC | reward | 加入推薦團隊不等於立即產生回饋；仍須依活動、消費與成功取貨條件判定。 |  |
| components/member/MemberReferralCenter.tsx:523 | STATIC | label | REWARD DETAILS |  |
| components/member/MemberReferralCenter.tsx:523 | STATIC | reward | 回饋明細 |  |
| components/member/MemberReferralCenter.tsx:523 | STATIC | reward | 查看推廣零售、推薦與自己消費所產生的回饋與入帳狀態。 |  |
| components/member/MemberReferralCenter.tsx:523 | STATIC | label | 共 |  |
| components/member/MemberReferralCenter.tsx:523 | STATIC | label | 筆 |  |
| components/member/MemberReferralCenter.tsx:525 | STATIC | tooltip | 回饋紀錄篩選 |  |
| components/member/MemberReferralCenter.tsx:528 | STATIC | label | 全部 |  |
| components/member/MemberReferralCenter.tsx:528 | STATIC | reward | 待入帳 |  |
| components/member/MemberReferralCenter.tsx:528 | STATIC | reward | 已入帳 |  |
| components/member/MemberReferralCenter.tsx:530 | STATIC | tooltip | 依推薦代數篩選 |  |
| components/member/MemberReferralCenter.tsx:531 | STATIC | label | 全部代數 |  |
| components/member/MemberReferralCenter.tsx:532 | STATIC | label | 第 |  |
| components/member/MemberReferralCenter.tsx:532 | STATIC | label | 代 |  |
| components/member/MemberReferralCenter.tsx:536 | STATIC | tooltip | 回饋紀錄 |  |
| components/member/MemberReferralCenter.tsx:548 | DYNAMIC | label | 商品 {value1} | value1 |
| components/member/MemberReferralCenter.tsx:548 | STATIC | label | 有效消費 |  |
| components/member/MemberReferralCenter.tsx:552 | DYNAMIC | description | 最近 {windowDays} 天累積{value2}達 {requiredPoints}。 | windowDays, value2, requiredPoints |
| components/member/MemberReferralCenter.tsx:554 | DYNAMIC | description | 有效定期配送會員最近 {windowDays} 天累積{value2}達 {requiredPoints}。 | windowDays, value2, requiredPoints |
| components/member/MemberReferralCenter.tsx:556 | DYNAMIC | description | 需同時符合一般會員最近 {windowDays} 天累積{value2}達 {requiredPoints}，以及有效定期配送會員最近 {windowDays4} 天累積{value5}達 {requiredPoints6}。 | windowDays, value2, requiredPoints, windowDays4, value5, requiredPoints6 |
| components/member/MemberReferralCenter.tsx:557 | DYNAMIC | description | 一般會員最近 {windowDays} 天累積{value2}達 {requiredPoints}，或有效定期配送會員最近 {windowDays4} 天累積{value5}達 {requiredPoints6}，任一條件符合即可。 | windowDays, value2, requiredPoints, windowDays4, value5, requiredPoints6 |
| components/member/MemberReferralCenter.tsx:560 | STATIC | qualification | 推廣零售回饋不需推薦資格；訂單完成後進入安全等待。 |  |
| components/member/MemberReferralCenter.tsx:562 | STATIC | reward | 本筆已完成正式入帳。 |  |
| components/member/MemberReferralCenter.tsx:564 | STATIC | qualification | 本人消費回饋不需推薦資格。 |  |
| components/member/MemberReferralCenter.tsx:566 | STATIC | qualification | 本筆已由有效推薦資格涵蓋 ✓ |  |
| components/member/MemberReferralCenter.tsx:568 | STATIC | qualification | 本筆推薦資格已確認 ✓ |  |
| components/member/MemberReferralCenter.tsx:570 | STATIC | qualification | 本筆回饋資格期限已結束。 |  |
| components/member/MemberReferralCenter.tsx:571 | STATIC | qualification | 尚待取得推薦回饋資格。 |  |
| components/member/MemberReferralCenter.tsx:573 | NOT SAFE TO EDIT | reward | 待系統入帳 |  |
| components/member/MemberReferralCenter.tsx:573 | STATIC | reward | 待系統入帳 |  |
| components/member/MemberReferralCenter.tsx:573 | STATIC | reward | 安全等待 |  |
| components/member/MemberReferralCenter.tsx:575 | STATIC | reward | 回饋產生 |  |
| components/member/MemberReferralCenter.tsx:575 | STATIC | label | 訂單完成 |  |
| components/member/MemberReferralCenter.tsx:575 | STATIC | reward | 正式入帳 |  |
| components/member/MemberReferralCenter.tsx:576 | STATIC | reward | 回饋產生 |  |
| components/member/MemberReferralCenter.tsx:576 | STATIC | qualification | 資格確認 |  |
| components/member/MemberReferralCenter.tsx:576 | STATIC | qualification | 等待資格 |  |
| components/member/MemberReferralCenter.tsx:576 | STATIC | reward | 正式入帳 |  |
| components/member/MemberReferralCenter.tsx:609 | STATIC | emptyState | 沒有符合目前篩選條件的回饋紀錄 |  |
| components/member/MemberReferralCenter.tsx:609 | STATIC | button | 可切換狀態或代數查看其他紀錄。 |  |
| components/member/MemberReferralCenter.tsx:610 | STATIC | tooltip | 推薦回饋分頁 |  |
| components/member/MemberReferralCenter.tsx:610 | STATIC | label | 上一頁 |  |
| components/member/MemberReferralCenter.tsx:610 | STATIC | label | 第 |  |
| components/member/MemberReferralCenter.tsx:610 | STATIC | label | 頁 |  |
| components/member/MemberReferralCenter.tsx:610 | STATIC | label | 下一頁 |  |
| components/member/MemberReferralCenter.tsx:611 | STATIC | emptyState | 目前還沒有推薦回饋紀錄 |  |
| components/member/MemberReferralCenter.tsx:611 | STATIC | reward | 推薦會員產生符合規則的有效消費後，回饋紀錄會顯示在這裡。 |  |
| components/member/MemberReferralOrgChart.tsx:68 | STATIC | label | 會員 |  |
| components/member/MemberReferralOrgChart.tsx:69 | STATIC | label | 直推 |  |
| components/member/MemberReferralOrgChart.tsx:69 | STATIC | label | 人 · 團隊 |  |
| components/member/MemberReferralOrgChart.tsx:69 | STATIC | label | 人 |  |
| components/member/MemberReferralOrgChart.tsx:73 | STATIC | label | 新訂單 |  |
| components/member/MemberReferralOrgChart.tsx:73 | STATIC | button | 查看 › |  |
| components/member/MemberReferralOrgChart.tsx:75 | STATIC | label | 新訂單 0 |  |
| components/member/MemberReferralOrgChart.tsx:76 | STATIC | reward | 待入帳 |  |
| components/member/MemberReferralOrgChart.tsx:77 | STATIC | label | 本週期 |  |
| components/member/MemberReferralOrgChart.tsx:81 | STATIC | button | 查看他的組織圖 › |  |
| components/member/MemberReferralOrgChart.tsx:83 | STATIC | emptyState | 目前沒有下線 |  |
| components/member/MemberReferralOrgChart.tsx:119 | STATIC | tooltip | 關閉新訂單明細 |  |
| components/member/MemberReferralOrgChart.tsx:123 | STATIC | label | NEW ORDERS |  |
| components/member/MemberReferralOrgChart.tsx:124 | STATIC | label | 會員 |  |
| components/member/MemberReferralOrgChart.tsx:124 | STATIC | label | 的新訂單 |  |
| components/member/MemberReferralOrgChart.tsx:125 | STATIC | label | 近 30 日共 |  |
| components/member/MemberReferralOrgChart.tsx:125 | STATIC | reward | 筆；內容直接讀取既有訂單與回饋紀錄。 |  |
| components/member/MemberReferralOrgChart.tsx:127 | STATIC | tooltip | 關閉 |  |
| components/member/MemberReferralOrgChart.tsx:134 | STATIC | label | KD點 |  |
| components/member/MemberReferralOrgChart.tsx:135 | DYNAMIC | reward | 第 {generation} 代推薦回饋 | generation |
| components/member/MemberReferralOrgChart.tsx:135 | STATIC | reward | 會員消費回饋 |  |
| components/member/MemberReferralOrgChart.tsx:207 | STATIC | tooltip | 關閉推薦組織圖 |  |
| components/member/MemberReferralOrgChart.tsx:210 | STATIC | button | ← 返回推薦 |  |
| components/member/MemberReferralOrgChart.tsx:212 | STATIC | label | REFERRAL ORGANIZATION |  |
| components/member/MemberReferralOrgChart.tsx:213 | STATIC | label | 推薦組織圖 |  |
| components/member/MemberReferralOrgChart.tsx:213 | STATIC | label | 顯示 3 代內 |  |
| components/member/MemberReferralOrgChart.tsx:214 | STATIC | button | 點擊有下線的會員，即可以他為最上層重新查看下一個三代組織。 |  |
| components/member/MemberReferralOrgChart.tsx:216 | STATIC | tooltip | 關閉 |  |
| components/member/MemberReferralOrgChart.tsx:219 | STATIC | tooltip | 推薦組織圖摘要 |  |
| components/member/MemberReferralOrgChart.tsx:220 | STATIC | label | 我的推薦成員 |  |
| components/member/MemberReferralOrgChart.tsx:220 | STATIC | label | 人 |  |
| components/member/MemberReferralOrgChart.tsx:221 | STATIC | label | 新訂單 |  |
| components/member/MemberReferralOrgChart.tsx:221 | STATIC | label | 近 30 日有效訂單 |  |
| components/member/MemberReferralOrgChart.tsx:222 | STATIC | reward | 待入帳回饋 |  |
| components/member/MemberReferralOrgChart.tsx:222 | STATIC | reward | 依正式回饋紀錄 |  |
| components/member/MemberReferralOrgChart.tsx:223 | STATIC | reward | 本週期入帳 |  |
| components/member/MemberReferralOrgChart.tsx:228 | STATIC | button | 目前查看 |  |
| components/member/MemberReferralOrgChart.tsx:229 | DYNAMIC | label | 我的組織圖 · {value1} | value1 |
| components/member/MemberReferralOrgChart.tsx:229 | DYNAMIC | label | 會員 {value1} | value1 |
| components/member/MemberReferralOrgChart.tsx:238 | STATIC | label | 收合摘要 |  |
| components/member/MemberReferralOrgChart.tsx:238 | STATIC | label | 展開摘要 |  |
| components/member/MemberReferralOrgChart.tsx:241 | STATIC | button | ← 返回上一層 |  |
| components/member/MemberReferralOrgChart.tsx:242 | STATIC | label | ⌂ 回到我的組織圖 |  |
| components/member/MemberReferralOrgChart.tsx:244 | STATIC | tooltip | 組織圖縮放 |  |
| components/member/MemberReferralOrgChart.tsx:245 | STATIC | tooltip | 縮小 |  |
| components/member/MemberReferralOrgChart.tsx:247 | STATIC | tooltip | 放大 |  |
| components/member/MemberReferralOrgChart.tsx:248 | STATIC | label | 適合畫面 |  |
| components/member/MemberReferralOrgChart.tsx:307 | STATIC | label | 拖曳移動畫布 · 滾輪或雙指縮放 |  |
| components/member/MemberReferralOrgChart.tsx:308 | STATIC | reward | 新訂單／回饋數字僅顯示既有會員與回饋資料，不另行計算。 |  |
| components/member/MemberSectionNav.tsx:10 | STATIC | label | 會員總覽 |  |
| components/member/MemberSectionNav.tsx:10 | STATIC | label | 總覽 |  |
| components/member/MemberSectionNav.tsx:11 | STATIC | label | 帳戶資料 |  |
| components/member/MemberSectionNav.tsx:11 | STATIC | label | 帳戶 |  |
| components/member/MemberSectionNav.tsx:12 | STATIC | label | 定期配送 |  |
| components/member/MemberSectionNav.tsx:12 | STATIC | label | 配送 |  |
| components/member/MemberSectionNav.tsx:13 | STATIC | label | 推薦 |  |
| components/member/MemberSectionNav.tsx:13 | STATIC | label | 推薦 |  |
| components/member/MemberSectionNav.tsx:14 | STATIC | reward | 回饋 |  |
| components/member/MemberSectionNav.tsx:14 | STATIC | reward | 回饋 |  |
| components/member/MemberSectionNav.tsx:15 | STATIC | label | 訂單 |  |
| components/member/MemberSectionNav.tsx:15 | STATIC | label | 訂單 |  |
| components/member/MemberSectionNav.tsx:59 | STATIC | tooltip | 會員中心導覽 |  |
| components/member/MemberSectionNav.tsx:60 | STATIC | tooltip | 會員中心功能 |  |
| components/member/MemberSectionNav.tsx:79 | STATIC | button | 返回首頁 |  |
| components/member/MemberSectionNav.tsx:80 | STATIC | label | 首頁 |  |
| components/member/memberSubscriptionDashboardModel.ts:37 | STATIC | reward | 等待首次取貨 |  |
| components/member/memberSubscriptionDashboardModel.ts:38 | STATIC | label | 定期配送啟用中 |  |
| components/member/memberSubscriptionDashboardModel.ts:39 | STATIC | label | 定期配送已暫停 |  |
| components/member/memberSubscriptionDashboardModel.ts:40 | STATIC | label | 定期配送已停止 |  |
| components/member/memberSubscriptionDashboardModel.ts:91 | STATIC | label | 尚未選擇商品 |  |
| components/member/memberSubscriptionDashboardModel.ts:93 | STATIC | label | 尚未選擇門市 |  |
| components/member/memberSubscriptionDashboardModel.ts:94 | STATIC | label | 工作室自取 |  |
| components/member/memberSubscriptionDashboardModel.ts:95 | DYNAMIC | description | {value1}｜{value2}｜每 {value3} 天｜{value4} | value1, value2, value3, value4 |
| components/member/memberSubscriptionEditorModel.ts:95 | STATIC | label | 工作室建議 |  |
| components/member/memberSubscriptionEditorModel.ts:206 | STATIC | label | 數量必須是 1 到 12。 |  |
| components/member/memberSubscriptionEditorModel.ts:208 | STATIC | label | 原耳掛商品或 SKU 已無法供應，請選擇新的耳掛規格。 |  |
| components/member/memberSubscriptionEditorModel.ts:210 | STATIC | label | 咖啡豆組合不完整。 |  |
| components/member/memberSubscriptionEditorModel.ts:211 | STATIC | label | 請選擇正確的專屬烘焙度。 |  |
| components/member/memberSubscriptionEditorModel.ts:214 | STATIC | label | 原咖啡豆商品或 SKU 已無法供應，請選擇新的咖啡豆規格。 |  |
| components/member/memberSubscriptionEditorModel.ts:257 | DYNAMIC | label | 已無法供應的耳掛商品 × {value1} | value1 |
| components/member/memberSubscriptionEditorModel.ts:259 | STATIC | label | 已無法供應的咖啡豆 |  |
| components/member/memberSubscriptionEditorModel.ts:264 | STATIC | label | 咖啡豆 |  |
| components/member/memberSubscriptionEditorModel.ts:268 | DYNAMIC | label | ・專屬烘焙：{value1} | value1 |
| components/member/memberSubscriptionEditorModel.ts:270 | DYNAMIC | label | ・專屬烘焙：{value1} | value1 |
| components/member/memberSubscriptionEditorModel.ts:272 | STATIC | label | 一磅 |  |
| components/member/memberSubscriptionEditorModel.ts:272 | STATIC | label | 半磅 |  |
| components/member/MemberSubscriptionExperience.tsx:119 | STATIC | button | 訂單取消，抵用金已返還 |  |
| components/member/MemberSubscriptionExperience.tsx:119 | STATIC | label | 本筆已保留折抵 |  |
| components/member/MemberSubscriptionExperience.tsx:119 | STATIC | label | 本筆已使用 |  |
| components/member/MemberSubscriptionExperience.tsx:120 | STATIC | label | 尚未排定 |  |
| components/member/MemberSubscriptionExperience.tsx:123 | STATIC | label | 定期配送已暫停。 |  |
| components/member/MemberSubscriptionExperience.tsx:124 | DYNAMIC | label | 定期配送已恢復。下一次配送日期：{date}。 | date |
| components/member/MemberSubscriptionExperience.tsx:125 | DYNAMIC | label | 定期配送已重新啟動。下一次配送日期：{date}。 | date |
| components/member/MemberSubscriptionExperience.tsx:128 | DYNAMIC | label | 已跳過 {date} 本次配送。 | date |
| components/member/MemberSubscriptionExperience.tsx:129 | STATIC | label | 已跳過本次配送。 |  |
| components/member/MemberSubscriptionExperience.tsx:131 | DYNAMIC | label | {value1}下一次配送日期：{date}。 | value1, date |
| components/member/MemberSubscriptionExperience.tsx:132 | DYNAMIC | button | {value1}下一次配送安排尚待確認。 | value1 |
| components/member/MemberSubscriptionExperience.tsx:134 | DYNAMIC | label | 下一次配送日期已更新。新的配送日期：{date}。 | date |
| components/member/MemberSubscriptionExperience.tsx:135 | STATIC | label | 未來定期配送的取貨方式已更新。 |  |
| components/member/MemberSubscriptionExperience.tsx:136 | DYNAMIC | label | 補貨安排已建立。預計配送日期：{date}。 | date |
| components/member/MemberSubscriptionExperience.tsx:137 | STATIC | button | 定期配送已取消／停止；目前已建立的訂單不會自動取消。 |  |
| components/member/MemberSubscriptionExperience.tsx:138 | STATIC | label | 已從我的定期配送移除。歷史訂單與紀錄仍會保留。 |  |
| components/member/MemberSubscriptionExperience.tsx:139 | STATIC | label | 下一次配送內容已更新。 |  |
| components/member/MemberSubscriptionExperience.tsx:140 | STATIC | label | 定期配送安排已更新。 |  |
| components/member/MemberSubscriptionExperience.tsx:164 | STATIC | label | 一般價 |  |
| components/member/MemberSubscriptionExperience.tsx:164 | STATIC | label | 定期購價 |  |
| components/member/MemberSubscriptionExperience.tsx:166 | STATIC | label | 一磅組合 |  |
| components/member/MemberSubscriptionExperience.tsx:166 | STATIC | label | 一般價 |  |
| components/member/MemberSubscriptionExperience.tsx:166 | STATIC | label | 定期購價 |  |
| components/member/MemberSubscriptionExperience.tsx:167 | STATIC | label | 本商品 × |  |
| components/member/MemberSubscriptionExperience.tsx:167 | STATIC | label | 一般價 |  |
| components/member/MemberSubscriptionExperience.tsx:167 | STATIC | label | 定期購價 |  |
| components/member/MemberSubscriptionExperience.tsx:218 | STATIC | label | 目前定期購價格 |  |
| components/member/MemberSubscriptionExperience.tsx:220 | DYNAMIC | label | {percentage} 折 | percentage |
| components/member/MemberSubscriptionExperience.tsx:221 | DYNAMIC | label | {percentage} 折 | percentage |
| components/member/MemberSubscriptionExperience.tsx:223 | NOT SAFE TO EDIT | label | 其他 |  |
| components/member/MemberSubscriptionExperience.tsx:225 | DYNAMIC | label | 其他：{value1} | value1 |
| components/member/MemberSubscriptionExperience.tsx:235 | STATIC | label | 操作未完成 |  |
| components/member/MemberSubscriptionExperience.tsx:240 | STATIC | label | 操作未完成，請再試一次。 |  |
| components/member/MemberSubscriptionExperience.tsx:252 | STATIC | label | 無法更新最新配送安排 |  |
| components/member/MemberSubscriptionExperience.tsx:341 | STATIC | label | 尚未選擇 |  |
| components/member/MemberSubscriptionExperience.tsx:342 | STATIC | label | 尚未選擇 |  |
| components/member/MemberSubscriptionExperience.tsx:344 | STATIC | label | 取貨 |  |
| components/member/MemberSubscriptionExperience.tsx:346 | STATIC | label | 宅配 |  |
| components/member/MemberSubscriptionExperience.tsx:347 | STATIC | label | 工作室自取 |  |
| components/member/MemberSubscriptionExperience.tsx:354 | STATIC | label | 目前一磅只開放同款 A+A 組合，請重新選擇第二款咖啡。 |  |
| components/member/MemberSubscriptionExperience.tsx:412 | DYNAMIC | label | 下一次配送日期已更新為目前最早可選的 {date}。 | date |
| components/member/MemberSubscriptionExperience.tsx:435 | DYNAMIC | label | 下一次配送日期已更新為目前最早可選的 {date}。 | date |
| components/member/MemberSubscriptionExperience.tsx:518 | NOT SAFE TO EDIT | label | 其他 |  |
| components/member/MemberSubscriptionExperience.tsx:518 | STATIC | button | 請填寫其他取消原因。 |  |
| components/member/MemberSubscriptionExperience.tsx:518 | STATIC | button | 請選擇取消本次配送的原因。 |  |
| components/member/MemberSubscriptionExperience.tsx:535 | STATIC | button | 取消申請未完成 |  |
| components/member/MemberSubscriptionExperience.tsx:543 | STATIC | button | 取消處理已送出；請以重新整理後的訂單狀態為準。 |  |
| components/member/MemberSubscriptionExperience.tsx:544 | STATIC | button | 取消處理已送出；請以重新整理後的訂單狀態為準。 |  |
| components/member/MemberSubscriptionExperience.tsx:548 | DYNAMIC | reward | {value1} 未來定期配送已停止；本次配送仍需等待物流單作廢確認。 | value1 |
| components/member/MemberSubscriptionExperience.tsx:549 | STATIC | button | 本次配送已取消，未來定期配送也已停止。 |  |
| components/member/MemberSubscriptionExperience.tsx:552 | DYNAMIC | button | {value1} 物流單作廢確認前，尚未變更下一次配送日期。 | value1 |
| components/member/MemberSubscriptionExperience.tsx:555 | DYNAMIC | button | 本次配送已取消，定期配送保留。下一次配送日期：{date}。 | date |
| components/member/MemberSubscriptionExperience.tsx:562 | STATIC | label | 操作未完成，請再試一次。 |  |
| components/member/MemberSubscriptionExperience.tsx:566 | DYNAMIC | button | 本次配送已成功取消，但下一次配送日期未能更新：{value1}。請重新選擇下一次配送日期。 | value1 |
| components/member/MemberSubscriptionExperience.tsx:568 | DYNAMIC | button | 本次配送已成功取消，但未來定期配送未能停止：{value1}。請再試一次。 | value1 |
| components/member/MemberSubscriptionExperience.tsx:569 | DYNAMIC | button | 本次配送已成功取消，但最新畫面未能更新：{value1}。請重新整理頁面。 | value1 |
| components/member/MemberSubscriptionExperience.tsx:582 | STATIC | label | SUBSCRIPTION |  |
| components/member/MemberSubscriptionExperience.tsx:583 | STATIC | label | 我的定期配送 |  |
| components/member/MemberSubscriptionExperience.tsx:592 | STATIC | label | 首次取貨完成後，啟動定期配送 |  |
| components/member/MemberSubscriptionExperience.tsx:597 | STATIC | label | 下次配送日期 |  |
| components/member/MemberSubscriptionExperience.tsx:600 | STATIC | label | 尚未排定 |  |
| components/member/MemberSubscriptionExperience.tsx:607 | STATIC | emptyState | 還沒有定期配送 |  |
| components/member/MemberSubscriptionExperience.tsx:607 | STATIC | description | 第一次購買時可勾選加入。首筆仍是原價，成功取貨後才會開始定期配送並享有優惠。 |  |
| components/member/MemberSubscriptionExperience.tsx:607 | STATIC | label | 挑選咖啡作品 |  |
| components/member/MemberSubscriptionExperience.tsx:608 | STATIC | label | 選擇定期配送 |  |
| components/member/MemberSubscriptionExperience.tsx:608 | STATIC | button | 每筆定期配送分開保存；切換後可查看各自狀態與安排。 |  |
| components/member/MemberSubscriptionExperience.tsx:610 | STATIC | label | 配送週期 |  |
| components/member/MemberSubscriptionExperience.tsx:610 | STATIC | label | 每 |  |
| components/member/MemberSubscriptionExperience.tsx:610 | STATIC | label | 天 |  |
| components/member/MemberSubscriptionExperience.tsx:611 | STATIC | label | 下次安排 |  |
| components/member/MemberSubscriptionExperience.tsx:611 | STATIC | label | 首筆取貨後安排 |  |
| components/member/MemberSubscriptionExperience.tsx:611 | STATIC | label | 尚未排定 |  |
| components/member/MemberSubscriptionExperience.tsx:612 | STATIC | label | 配送方式 |  |
| components/member/MemberSubscriptionExperience.tsx:612 | STATIC | label | 尚未選擇門市 |  |
| components/member/MemberSubscriptionExperience.tsx:612 | DYNAMIC | label | 宅配・{value1}・{value2} | value1, value2 |
| components/member/MemberSubscriptionExperience.tsx:612 | STATIC | button | 地址待確認 |  |
| components/member/MemberSubscriptionExperience.tsx:612 | STATIC | label | 貨到付款 |  |
| components/member/MemberSubscriptionExperience.tsx:612 | STATIC | label | ATM 轉帳 |  |
| components/member/MemberSubscriptionExperience.tsx:612 | STATIC | label | 工作室自取 |  |
| components/member/MemberSubscriptionExperience.tsx:613 | STATIC | label | 下一次商品 |  |
| components/member/MemberSubscriptionExperience.tsx:613 | STATIC | label | 尚未選擇 |  |
| components/member/MemberSubscriptionExperience.tsx:614 | STATIC | label | 修改截止 |  |
| components/member/MemberSubscriptionExperience.tsx:614 | STATIC | label | 啟動後顯示 |  |
| components/member/MemberSubscriptionExperience.tsx:616 | STATIC | label | 本期應付 |  |
| components/member/MemberSubscriptionExperience.tsx:616 | STATIC | label | 預估應付 |  |
| components/member/MemberSubscriptionExperience.tsx:617 | STATIC | label | 啟動後計算 |  |
| components/member/MemberSubscriptionExperience.tsx:621 | STATIC | label | 一般購買 |  |
| components/member/MemberSubscriptionExperience.tsx:621 | STATIC | label | → 定期購預估 |  |
| components/member/MemberSubscriptionExperience.tsx:626 | STATIC | label | 商品優惠省 |  |
| components/member/MemberSubscriptionExperience.tsx:628 | DYNAMIC | label |  ＋ 配送優惠省 {creditAmount} | creditAmount |
| components/member/MemberSubscriptionExperience.tsx:630 | STATIC | label | ＝ 本期共省 |  |
| components/member/MemberSubscriptionExperience.tsx:637 | STATIC | button | 查看金額明細 |  |
| components/member/MemberSubscriptionExperience.tsx:644 | STATIC | label | 目前配送安排 |  |
| components/member/MemberSubscriptionExperience.tsx:644 | STATIC | label | 立即補貨 |  |
| components/member/MemberSubscriptionExperience.tsx:644 | STATIC | label | 定期配送 |  |
| components/member/MemberSubscriptionExperience.tsx:644 | STATIC | label | 訂單： |  |
| components/member/MemberSubscriptionExperience.tsx:644 | STATIC | reward | 狀態：等待建立訂單 |  |
| components/member/MemberSubscriptionExperience.tsx:644 | STATIC | label | 預計建立訂單： |  |
| components/member/MemberSubscriptionExperience.tsx:648 | STATIC | label | 目前不會自動建立下一張訂單 |  |
| components/member/MemberSubscriptionExperience.tsx:651 | STATIC | description | 等首筆原價訂單成功取貨後，才會正式啟動。 啟動後第一次定期配送起享 |  |
| components/member/MemberSubscriptionExperience.tsx:654 | STATIC | label | 定期購優惠。 |  |
| components/member/MemberSubscriptionExperience.tsx:658 | STATIC | button | 如果您已經不需要定期配送，可以現在取消。 取消不會影響目前這張首筆訂單。 |  |
| components/member/MemberSubscriptionExperience.tsx:672 | STATIC | button | 取消這個定期配送設定 |  |
| components/member/MemberSubscriptionExperience.tsx:680 | STATIC | label | 此定期配送已停止 |  |
| components/member/MemberSubscriptionExperience.tsx:682 | STATIC | label | 想繼續配送嗎？選擇下一次配送日期後即可重新啟動。 |  |
| components/member/MemberSubscriptionExperience.tsx:691 | STATIC | label | 重新啟動定期配送 |  |
| components/member/MemberSubscriptionExperience.tsx:697 | STATIC | label | 重新啟動定期配送 |  |
| components/member/MemberSubscriptionExperience.tsx:699 | STATIC | label | 下一次配送日期 |  |
| components/member/MemberSubscriptionExperience.tsx:713 | STATIC | label | 最早可選： |  |
| components/member/MemberSubscriptionExperience.tsx:716 | STATIC | label | 配送週期 |  |
| components/member/MemberSubscriptionExperience.tsx:729 | STATIC | label | 每 |  |
| components/member/MemberSubscriptionExperience.tsx:729 | STATIC | label | 天 |  |
| components/member/MemberSubscriptionExperience.tsx:730 | STATIC | label | 自訂天數 |  |
| components/member/MemberSubscriptionExperience.tsx:735 | STATIC | label | 自訂配送週期 |  |
| components/member/MemberSubscriptionExperience.tsx:743 | STATIC | label | 可設定 |  |
| components/member/MemberSubscriptionExperience.tsx:743 | STATIC | label | 天 |  |
| components/member/MemberSubscriptionExperience.tsx:747 | STATIC | label | 商品： |  |
| components/member/MemberSubscriptionExperience.tsx:748 | STATIC | label | 配送方式： |  |
| components/member/MemberSubscriptionExperience.tsx:757 | STATIC | button | 返回 |  |
| components/member/MemberSubscriptionExperience.tsx:764 | STATIC | label | 處理中… |  |
| components/member/MemberSubscriptionExperience.tsx:764 | STATIC | button | 確認重新啟動 |  |
| components/member/MemberSubscriptionExperience.tsx:780 | STATIC | button | 查看其他定期配送 |  |
| components/member/MemberSubscriptionExperience.tsx:794 | STATIC | label | 刪除這筆已停止的定期配送 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | button | 取消本次配送 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | button | 取消本次配送與停止未來定期配送是兩件不同的事。請明確選擇要處理的範圍。 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | button | 取消原因 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | NOT SAFE TO EDIT | label | 其他 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | button | 請選擇取消原因 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | hint | 單純想取消 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | button | 單純想取消 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | hint | 行程／取貨時間不方便 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | label | 行程／取貨時間不方便 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | hint | 咖啡還沒喝完，暫時不需要 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | label | 咖啡還沒喝完，暫時不需要 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | hint | 想更換咖啡／數量／烘焙度 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | label | 想更換咖啡／數量／烘焙度 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | hint | 重複下單或誤操作 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | label | 重複下單或誤操作 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | hint | 預算考量 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | label | 預算考量 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | hint | 其他 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | label | 其他 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | NOT SAFE TO EDIT | label | 其他 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | button | 其他取消原因 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | hint | 請簡單告訴我們取消原因 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | button | 只取消本次配送 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | button | 取消本次配送，並停止之後的定期配送 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | label | 保留定期配送時的下一次配送日期 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | button | 取消本次配送，保留定期配送並更新下次日期 |  |
| components/member/MemberSubscriptionExperience.tsx:799 | STATIC | button | 若此訂單已建立 7-ELEVEN 寄件資訊，送出後只是取消申請；KD Coffee 確認寄件單作廢前，訂單不會顯示為已取消，也不會回補庫存。 |  |
| components/member/MemberSubscriptionExperience.tsx:800 | STATIC | label | 調整下一次日期 |  |
| components/member/MemberSubscriptionExperience.tsx:800 | DYNAMIC | button | 本期含專屬烘焙；距配送不足 {value1} 天時會先顯示提醒，但仍可確認送出。 | value1 |
| components/member/MemberSubscriptionExperience.tsx:800 | DYNAMIC | label | 最早可配送日為 {date}。 | date |
| components/member/MemberSubscriptionExperience.tsx:800 | STATIC | description | 選好日期後，請決定只套用本次，或讓之後的定期購也從新日期重新計算。 |  |
| components/member/MemberSubscriptionExperience.tsx:800 | DYNAMIC | label |  本期還可修改 {value1} 次。 | value1 |
| components/member/MemberSubscriptionExperience.tsx:800 | STATIC | label | 新的配送日期 |  |
| components/member/MemberSubscriptionExperience.tsx:800 | STATIC | button | 新建立訂單日與修改截止日會在確認後依目前營運規則重新計算。 |  |
| components/member/MemberSubscriptionExperience.tsx:800 | STATIC | label | 只套用這一次 |  |
| components/member/MemberSubscriptionExperience.tsx:800 | STATIC | label | 之後也從新日期重新計算 |  |
| components/member/MemberSubscriptionExperience.tsx:800 | STATIC | label | 提前 |  |
| components/member/MemberSubscriptionExperience.tsx:800 | STATIC | label | 天 |  |
| components/member/MemberSubscriptionExperience.tsx:800 | STATIC | label | 延後 |  |
| components/member/MemberSubscriptionExperience.tsx:800 | STATIC | label | 天 |  |
| components/member/MemberSubscriptionExperience.tsx:801 | STATIC | label | 跳過這一次 |  |
| components/member/MemberSubscriptionExperience.tsx:801 | STATIC | label | 只跳過 |  |
| components/member/MemberSubscriptionExperience.tsx:801 | STATIC | label | 這一次。 |  |
| components/member/MemberSubscriptionExperience.tsx:801 | STATIC | button | 確認跳過 |  |
| components/member/MemberSubscriptionExperience.tsx:802 | STATIC | label | 調整下一次配送商品 |  |
| components/member/MemberSubscriptionExperience.tsx:803 | STATIC | description | 可調整下一次配送的商品、數量與咖啡豆烘焙設定。變更只套用目前這一期，除非現有產品流程明確另有規則。 |  |
| components/member/MemberSubscriptionExperience.tsx:804 | STATIC | label | 本期已達修改次數上限，無法再調整商品。 |  |
| components/member/MemberSubscriptionExperience.tsx:811 | STATIC | label | SUBSCRIPTION ITEM |  |
| components/member/MemberSubscriptionExperience.tsx:811 | STATIC | label | 商品 |  |
| components/member/MemberSubscriptionExperience.tsx:811 | STATIC | label | 目前規則未開放增減商品數量 |  |
| components/member/MemberSubscriptionExperience.tsx:811 | STATIC | label | 移除此商品 |  |
| components/member/MemberSubscriptionExperience.tsx:813 | STATIC | label | 商品類型 |  |
| components/member/MemberSubscriptionExperience.tsx:813 | STATIC | label | 咖啡豆 |  |
| components/member/MemberSubscriptionExperience.tsx:813 | STATIC | label | 耳掛咖啡 |  |
| components/member/MemberSubscriptionExperience.tsx:815 | STATIC | label | 規格 |  |
| components/member/MemberSubscriptionExperience.tsx:815 | STATIC | label | 半磅 |  |
| components/member/MemberSubscriptionExperience.tsx:815 | STATIC | label | 一磅（兩個半磅組合） |  |
| components/member/MemberSubscriptionExperience.tsx:821 | STATIC | label | 第一款半磅咖啡 |  |
| components/member/MemberSubscriptionExperience.tsx:821 | STATIC | label | 第二款半磅咖啡 |  |
| components/member/MemberSubscriptionExperience.tsx:821 | STATIC | label | 半磅咖啡 |  |
| components/member/MemberSubscriptionExperience.tsx:828 | STATIC | label | 工作室建議 |  |
| components/member/MemberSubscriptionExperience.tsx:830 | STATIC | label | 原咖啡豆 SKU 已無法供應，請重新選擇 |  |
| components/member/MemberSubscriptionExperience.tsx:830 | STATIC | label | 預設烘焙： |  |
| components/member/MemberSubscriptionExperience.tsx:830 | STATIC | label | 工作室建議 |  |
| components/member/MemberSubscriptionExperience.tsx:833 | STATIC | label | 咖啡作品 |  |
| components/member/MemberSubscriptionExperience.tsx:837 | STATIC | label | 原耳掛商品已無法供應，請重新選擇 |  |
| components/member/MemberSubscriptionExperience.tsx:838 | STATIC | label | 耳掛規格 |  |
| components/member/MemberSubscriptionExperience.tsx:838 | STATIC | label | 原耳掛 SKU 已無法供應，請重新選擇 |  |
| components/member/MemberSubscriptionExperience.tsx:840 | STATIC | label | 數量 |  |
| components/member/MemberSubscriptionExperience.tsx:847 | STATIC | label | 專屬烘焙 |  |
| components/member/MemberSubscriptionExperience.tsx:847 | STATIC | description | 同一款咖啡累積達 2 磅，可選擇專屬烘焙；不同咖啡不合併計算。 |  |
| components/member/MemberSubscriptionExperience.tsx:847 | STATIC | label | 使用專屬烘焙｜ |  |
| components/member/MemberSubscriptionExperience.tsx:847 | STATIC | label | 磅） |  |
| components/member/MemberSubscriptionExperience.tsx:847 | STATIC | label | 指定烘焙度 |  |
| components/member/MemberSubscriptionExperience.tsx:847 | STATIC | label | 專屬烘焙標準排程需要至少 |  |
| components/member/MemberSubscriptionExperience.tsx:847 | STATIC | label | 天準備時間。 |  |
| components/member/MemberSubscriptionExperience.tsx:851 | STATIC | label | ＋ 新增商品 |  |
| components/member/MemberSubscriptionExperience.tsx:851 | STATIC | label | 項 |  |
| components/member/MemberSubscriptionExperience.tsx:852 | STATIC | button | 儲存下一次配送商品 |  |
| components/member/MemberSubscriptionExperience.tsx:854 | STATIC | label | 變更配送方式 |  |
| components/member/MemberSubscriptionExperience.tsx:860 | STATIC | label | 請填寫完整宅配地址 |  |
| components/member/MemberSubscriptionExperience.tsx:863 | STATIC | label | 未來定期配送方式 |  |
| components/member/MemberSubscriptionExperience.tsx:863 | STATIC | label | 工作室自取 |  |
| components/member/MemberSubscriptionExperience.tsx:863 | STATIC | label | 7-ELEVEN 取貨 |  |
| components/member/MemberSubscriptionExperience.tsx:863 | STATIC | label | 宅配 |  |
| components/member/MemberSubscriptionExperience.tsx:866 | STATIC | label | 收件人姓名 |  |
| components/member/MemberSubscriptionExperience.tsx:866 | STATIC | label | 手機／聯絡電話 |  |
| components/member/MemberSubscriptionExperience.tsx:866 | STATIC | label | 郵遞區號 |  |
| components/member/MemberSubscriptionExperience.tsx:866 | STATIC | label | 縣市 |  |
| components/member/MemberSubscriptionExperience.tsx:866 | STATIC | label | 區／鄉鎮市 |  |
| components/member/MemberSubscriptionExperience.tsx:866 | STATIC | label | 詳細地址 |  |
| components/member/MemberSubscriptionExperience.tsx:867 | STATIC | label | 宅配定期配送付款方式：貨到付款 |  |
| components/member/MemberSubscriptionExperience.tsx:867 | STATIC | label | 貨到付款手續費 NT$ |  |
| components/member/MemberSubscriptionExperience.tsx:867 | STATIC | label | ／次；實際金額以每期鎖定時的設定為準。 |  |
| components/member/MemberSubscriptionExperience.tsx:868 | STATIC | label | 此變更只套用未來配送；已鎖定期次與已建立的訂單保留原快照。 |  |
| components/member/MemberSubscriptionExperience.tsx:868 | STATIC | button | 儲存配送方式 |  |
| components/member/MemberSubscriptionExperience.tsx:876 | STATIC | label | 暫停定期配送 |  |
| components/member/MemberSubscriptionExperience.tsx:876 | STATIC | label | 恢復或停止定期配送 |  |
| components/member/MemberSubscriptionExperience.tsx:876 | STATIC | label | 暫停後不會安排新的定期配送，之後可再選擇下一次配送日期恢復。 |  |
| components/member/MemberSubscriptionExperience.tsx:876 | STATIC | label | 可選擇下一次配送日期恢復，或停止這筆定期配送。 |  |
| components/member/MemberSubscriptionExperience.tsx:876 | STATIC | label | 暫停未來定期配送 |  |
| components/member/MemberSubscriptionExperience.tsx:876 | STATIC | label | 下一次配送日期 |  |
| components/member/MemberSubscriptionExperience.tsx:882 | STATIC | label | 最早可選： |  |
| components/member/MemberSubscriptionExperience.tsx:882 | STATIC | label | 新的配送週期 |  |
| components/member/MemberSubscriptionExperience.tsx:894 | STATIC | label | 每 |  |
| components/member/MemberSubscriptionExperience.tsx:894 | STATIC | label | 天 |  |
| components/member/MemberSubscriptionExperience.tsx:895 | STATIC | label | 自訂天數 |  |
| components/member/MemberSubscriptionExperience.tsx:900 | STATIC | label | 自訂配送週期 |  |
| components/member/MemberSubscriptionExperience.tsx:911 | STATIC | label | 可設定 |  |
| components/member/MemberSubscriptionExperience.tsx:911 | STATIC | label | 天 |  |
| components/member/MemberSubscriptionExperience.tsx:915 | STATIC | button | 確認恢復 |  |
| components/member/MemberSubscriptionExperience.tsx:915 | STATIC | label | 停止這筆定期配送 |  |
| components/member/MemberSubscriptionExperience.tsx:916 | STATIC | label | 立即補貨（不改下次日期） |  |
| components/member/MemberSubscriptionExperience.tsx:938 | STATIC | label | SUBSCRIPTION |  |
| components/member/MemberSubscriptionExperience.tsx:941 | STATIC | label | 刪除這筆已停止的定期配送？ |  |
| components/member/MemberSubscriptionExperience.tsx:945 | STATIC | label | 刪除後，這筆已停止的定期配送會從會員中心移除。 |  |
| components/member/MemberSubscriptionExperience.tsx:947 | STATIC | reward | 歷史訂單、取貨紀錄與回饋資料仍會保留，不會被刪除。 |  |
| components/member/MemberSubscriptionExperience.tsx:949 | STATIC | label | 刪除後將不再享有這筆定期配送的 |  |
| components/member/MemberSubscriptionExperience.tsx:951 | STATIC | label | 優惠；如果之後需要，必須重新建立定期配送。 |  |
| components/member/MemberSubscriptionExperience.tsx:963 | STATIC | button | 返回 |  |
| components/member/MemberSubscriptionExperience.tsx:974 | STATIC | label | 處理中… |  |
| components/member/MemberSubscriptionExperience.tsx:975 | STATIC | button | 確認刪除 |  |
| components/member/MemberSubscriptionExperience.tsx:985 | STATIC | label | SUBSCRIPTION |  |
| components/member/MemberSubscriptionExperience.tsx:988 | STATIC | button | 取消這個定期配送設定？ |  |
| components/member/MemberSubscriptionExperience.tsx:989 | STATIC | label | 確定停止定期配送嗎？ |  |
| components/member/MemberSubscriptionExperience.tsx:994 | STATIC | button | 取消後，目前這張首筆原價訂單仍會照常處理。 |  |
| components/member/MemberSubscriptionExperience.tsx:996 | STATIC | label | 即使本次成功取貨，也不會再啟動定期配送。 |  |
| components/member/MemberSubscriptionExperience.tsx:998 | STATIC | label | 您也不會再享有後續 |  |
| components/member/MemberSubscriptionExperience.tsx:1000 | STATIC | label | 定期購優惠。 |  |
| components/member/MemberSubscriptionExperience.tsx:1004 | STATIC | label | 停止後，之後不再安排新的定期配送。 |  |
| components/member/MemberSubscriptionExperience.tsx:1007 | STATIC | label | 這次已成立的訂單會照原安排處理。 |  |
| components/member/MemberSubscriptionExperience.tsx:1019 | STATIC | label | 先不要 |  |
| components/member/MemberSubscriptionExperience.tsx:1028 | STATIC | label | 處理中… |  |
| components/member/MemberSubscriptionExperience.tsx:1030 | STATIC | button | 確認取消定期配送 |  |
| components/member/MemberSubscriptionExperience.tsx:1031 | STATIC | button | 確認停止定期配送 |  |
| components/member/MemberSubscriptionExperience.tsx:1041 | STATIC | label | DEDICATED ROAST |  |
| components/member/MemberSubscriptionExperience.tsx:1042 | STATIC | label | 專屬烘焙準備時間提醒 |  |
| components/member/MemberSubscriptionExperience.tsx:1043 | STATIC | label | 專屬烘焙標準排程需要至少 |  |
| components/member/MemberSubscriptionExperience.tsx:1043 | STATIC | label | 天準備時間。 |  |
| components/member/MemberSubscriptionExperience.tsx:1043 | STATIC | description | 您目前選擇的配送日期較近，我們仍會接受這次訂單並盡力安排，但實際配送時間可能因此延後。 |  |
| components/member/MemberSubscriptionExperience.tsx:1044 | STATIC | button | 返回修改日期 |  |
| components/member/MemberSubscriptionExperience.tsx:1044 | STATIC | label | 我了解，繼續下單 |  |
| components/member/MemberSubscriptionExperience.tsx:1064 | STATIC | label | SUBSCRIPTION PRICE |  |
| components/member/MemberSubscriptionExperience.tsx:1065 | STATIC | label | 本期金額明細 |  |
| components/member/MemberSubscriptionExperience.tsx:1069 | STATIC | tooltip | 關閉 |  |
| components/member/MemberSubscriptionExperience.tsx:1078 | STATIC | label | 商品原價 |  |
| components/member/MemberSubscriptionExperience.tsx:1084 | STATIC | label | 一般配送運費 |  |
| components/member/MemberSubscriptionExperience.tsx:1091 | STATIC | label | 一般購買合計 |  |
| components/member/MemberSubscriptionExperience.tsx:1098 | STATIC | label | 定期購優惠（ |  |
| components/member/MemberSubscriptionExperience.tsx:1101 | STATIC | label | 折） |  |
| components/member/MemberSubscriptionExperience.tsx:1108 | STATIC | label | 定期購配送優惠 |  |
| components/member/MemberSubscriptionExperience.tsx:1116 | STATIC | label | 定期購價格 |  |
| components/member/MemberSubscriptionExperience.tsx:1122 | STATIC | label | 活動價格 |  |
| components/member/MemberSubscriptionExperience.tsx:1128 | STATIC | label | 本期採用 |  |
| components/member/MemberSubscriptionExperience.tsx:1132 | STATIC | label | 活動優惠價 |  |
| components/member/MemberSubscriptionExperience.tsx:1133 | STATIC | label | 定期購優惠價 |  |
| components/member/MemberSubscriptionExperience.tsx:1134 | STATIC | label | 鎖定本期時自動比較較優惠價格 |  |
| components/member/MemberSubscriptionExperience.tsx:1139 | STATIC | label | 本期配送費 |  |
| components/member/MemberSubscriptionExperience.tsx:1144 | STATIC | label | 貨到付款手續費 |  |
| components/member/MemberSubscriptionExperience.tsx:1148 | STATIC | label | 抵用金 |  |
| components/member/MemberSubscriptionExperience.tsx:1158 | STATIC | label | 本期優惠合計 |  |
| components/member/MemberSubscriptionExperience.tsx:1160 | STATIC | label | 省 |  |
| components/member/MemberSubscriptionExperience.tsx:1168 | STATIC | label | 本期應付 |  |
| components/member/MemberSubscriptionExperience.tsx:1168 | STATIC | label | 目前預估應付 |  |
| components/member/MemberSubscriptionExperience.tsx:1175 | STATIC | description | 此期尚未鎖定。活動優惠、配送費與抵用金會在本期鎖定時依正式規則重新計算，系統會自動採用較優惠的商品價格。 |  |
| components/member/MemberSubscriptionExperience.tsx:1184 | STATIC | label | 我知道了 |  |
| components/member/MemberSubscriptionExperience.tsx:1189 | STATIC | label | CREDIT |  |
| components/member/MemberSubscriptionExperience.tsx:1189 | STATIC | label | 我的抵用金 |  |
| components/member/MemberSubscriptionExperience.tsx:1189 | STATIC | label | 現在可用 |  |
| components/member/MemberSubscriptionExperience.tsx:1189 | STATIC | reward | 僅顯示已正式入帳、可於結帳使用的折抵額。 |  |
| components/member/MemberSubscriptionExperience.tsx:1189 | STATIC | reward | 回饋來源訂單 |  |
| components/member/MemberSubscriptionExperience.tsx:1189 | STATIC | label | 訂單 |  |
| components/member/MemberSubscriptionExperience.tsx:1189 | STATIC | label | 訂單 |  |
| components/member/MemberSubscriptionExperience.tsx:1189 | STATIC | label | 餘額 |  |
| components/member/MemberSubscriptionExperience.tsx:1189 | STATIC | label | 到期 |  |
| components/member/MemberSubscriptionExperience.tsx:1189 | STATIC | emptyState | 目前沒有抵用金紀錄 |  |
| components/member/MemberSubscriptionExperience.tsx:1189 | STATIC | description | 有抵用金時，結帳會讓您自行選擇是否使用，並優先使用最快到期的額度。 |  |
| components/member/MemberSubscriptionExperience.tsx:1191 | STATIC | label | REFERRAL |  |
| components/member/MemberSubscriptionExperience.tsx:1191 | STATIC | label | 推薦紀錄摘要 |  |
| components/member/MemberSubscriptionExperience.tsx:1191 | STATIC | label | 位 |  |
| components/member/MemberSubscriptionExperience.tsx:1191 | STATIC | label | KD Coffee 會員 |  |
| components/member/MemberSubscriptionExperience.tsx:1191 | STATIC | label | 已加入會員 |  |
| components/member/MemberSubscriptionExperience.tsx:1191 | STATIC | label | 符合消費 |  |
| components/member/MemberSubscriptionExperience.tsx:1191 | STATIC | label | 次 |  |
| components/member/MemberSubscriptionExperience.tsx:1191 | STATIC | emptyState | 還沒有推薦紀錄 |  |
| components/member/MemberSubscriptionExperience.tsx:1191 | STATIC | reward | 這裡只會顯示安全的會員稱呼、是否加入與回饋進度，不會顯示對方的聯絡資料。 |  |
| components/member/PhoneAuthForms.tsx:55 | STATIC | label | 請輸入正確的台灣手機號碼 |  |
| components/member/PhoneAuthForms.tsx:59 | STATIC | label | 密碼至少需要 8 個字元 |  |
| components/member/PhoneAuthForms.tsx:63 | STATIC | label | 兩次輸入的密碼不一致 |  |
| components/member/PhoneAuthForms.tsx:87 | STATIC | button | 此手機號碼已經註冊過，請直接登入。 |  |
| components/member/PhoneAuthForms.tsx:91 | STATIC | label | 手機號碼或密碼錯誤 |  |
| components/member/PhoneAuthForms.tsx:91 | STATIC | label | 建立會員失敗，請稍後再試 |  |
| components/member/PhoneAuthForms.tsx:96 | STATIC | label | 操作失敗，請稍後再試 |  |
| components/member/PhoneAuthForms.tsx:112 | STATIC | button | 使用手機號碼登入／註冊 |  |
| components/member/PhoneAuthForms.tsx:120 | STATIC | label | PHONE MEMBER |  |
| components/member/PhoneAuthForms.tsx:122 | STATIC | button | 手機號碼登入 |  |
| components/member/PhoneAuthForms.tsx:122 | STATIC | label | 建立手機會員 |  |
| components/member/PhoneAuthForms.tsx:122 | STATIC | label | 忘記手機會員密碼 |  |
| components/member/PhoneAuthForms.tsx:128 | STATIC | button | 目前可以傳訊息給 KD Coffee，由我們協助確認會員資料並重設新密碼。 |  |
| components/member/PhoneAuthForms.tsx:129 | STATIC | button | 人工協助的方式會持續保留；我們不會查看或提供您原本的密碼。 |  |
| components/member/PhoneAuthForms.tsx:137 | STATIC | label | 傳訊息給 KD Coffee |  |
| components/member/PhoneAuthForms.tsx:140 | STATIC | button | 返回手機登入 |  |
| components/member/PhoneAuthForms.tsx:147 | STATIC | label | 手機號碼 |  |
| components/member/PhoneAuthForms.tsx:159 | STATIC | label | 例如：0912 345 678 |  |
| components/member/PhoneAuthForms.tsx:163 | STATIC | label | 設定密碼 |  |
| components/member/PhoneAuthForms.tsx:163 | STATIC | label | 密碼 |  |
| components/member/PhoneAuthForms.tsx:172 | STATIC | label | 密碼至少 8 個字元 |  |
| components/member/PhoneAuthForms.tsx:177 | STATIC | label | 再次輸入密碼 |  |
| components/member/PhoneAuthForms.tsx:192 | STATIC | label | 處理中… |  |
| components/member/PhoneAuthForms.tsx:192 | STATIC | button | 登入 |  |
| components/member/PhoneAuthForms.tsx:192 | STATIC | label | 建立會員 |  |
| components/member/PhoneAuthForms.tsx:198 | STATIC | label | 忘記密碼？ |  |
| components/member/PhoneAuthForms.tsx:207 | STATIC | label | 第一次使用？建立手機會員 |  |
| components/member/PhoneAuthForms.tsx:207 | STATIC | button | 已經是手機會員？返回登入 |  |
| components/member/PhoneAuthForms.tsx:210 | STATIC | button | 改用其他登入方式 |  |
| components/member/ResetPasswordForm.tsx:27 | STATIC | label | 密碼重設失敗，請重新申請。 |  |
| components/member/ResetPasswordForm.tsx:37 | STATIC | label | 密碼重設失敗，請重新申請。 |  |
| components/member/ResetPasswordForm.tsx:47 | STATIC | button | 密碼已重新設定，請使用新密碼登入。 |  |
| components/member/ResetPasswordForm.tsx:49 | STATIC | button | 回到會員登入 |  |
| components/member/ResetPasswordForm.tsx:58 | STATIC | label | 新密碼 |  |
| components/member/ResetPasswordForm.tsx:70 | STATIC | label | 再次輸入新密碼 |  |
| components/member/ResetPasswordForm.tsx:84 | STATIC | label | 重設中… |  |
| components/member/ResetPasswordForm.tsx:84 | STATIC | label | 重新設定密碼 |  |
| components/member/ResetPasswordForm.tsx:88 | STATIC | button | 返回會員登入 |  |
| components/member/RetailPromotionCenter.tsx:49 | STATIC | label | 待訂單完成 |  |
| components/member/RetailPromotionCenter.tsx:49 | STATIC | reward | 待入帳 |  |
| components/member/RetailPromotionCenter.tsx:49 | STATIC | reward | 已入帳 |  |
| components/member/RetailPromotionCenter.tsx:49 | STATIC | label | 已沖回 |  |
| components/member/RetailPromotionCenter.tsx:49 | STATIC | button | 已取消 |  |
| components/member/RetailPromotionCenter.tsx:62 | STATIC | label | 推廣零售資料暫時無法讀取 |  |
| components/member/RetailPromotionCenter.tsx:65 | STATIC | label | 推廣零售資料暫時無法讀取 |  |
| components/member/RetailPromotionCenter.tsx:84 | STATIC | label | RETAIL PROMOTION |  |
| components/member/RetailPromotionCenter.tsx:85 | STATIC | label | 推廣零售 |  |
| components/member/RetailPromotionCenter.tsx:86 | STATIC | label | 朋友透過你在「推薦」中的分享連結，以訪客身分完成購買，即可依 |  |
| components/member/RetailPromotionCenter.tsx:86 | STATIC | label | 比例獲得推廣零售獎金。 |  |
| components/member/RetailPromotionCenter.tsx:86 | STATIC | label | 目前未啟用新的推廣零售獎金；分享功能仍集中在「推薦」。 |  |
| components/member/RetailPromotionCenter.tsx:86 | STATIC | button | 訪客購買帶來的推廣零售成果會顯示在這裡；分享請前往「推薦」。 |  |
| components/member/RetailPromotionCenter.tsx:88 | STATIC | label | 讀取中… |  |
| components/member/RetailPromotionCenter.tsx:89 | STATIC | tooltip | 推廣零售獎金摘要 |  |
| components/member/RetailPromotionCenter.tsx:90 | STATIC | reward | 待入帳 |  |
| components/member/RetailPromotionCenter.tsx:91 | STATIC | reward | 已入帳 |  |
| components/member/RetailPromotionCenter.tsx:94 | STATIC | button | 查看詳情 |  |
| components/member/RetailPromotionCenter.tsx:99 | STATIC | label | RETAIL PROMOTION |  |
| components/member/RetailPromotionCenter.tsx:99 | STATIC | label | 推廣零售詳情 |  |
| components/member/RetailPromotionCenter.tsx:100 | STATIC | tooltip | 關閉推廣零售詳情 |  |
| components/member/RetailPromotionCenter.tsx:103 | STATIC | tooltip | 目前推廣零售規則 |  |
| components/member/RetailPromotionCenter.tsx:105 | STATIC | label | 目前獎金比例 |  |
| components/member/RetailPromotionCenter.tsx:106 | STATIC | label | 計算基礎 |  |
| components/member/RetailPromotionCenter.tsx:106 | STATIC | label | 實付商品金額 |  |
| components/member/RetailPromotionCenter.tsx:107 | STATIC | label | 分享有效期間 |  |
| components/member/RetailPromotionCenter.tsx:107 | STATIC | label | 天 |  |
| components/member/RetailPromotionCenter.tsx:109 | DYNAMIC | description | 依訪客訂單的有效 {pointName}（PV）× 獎金比例計算，再依每 1 {pointName2} = NT$ {creditAmount} 換算抵用金。 | pointName, pointName2, creditAmount |
| components/member/RetailPromotionCenter.tsx:109 | STATIC | description | 依訪客訂單的有效商品實付金額 × 獎金比例計算；運費不列入計算。 |  |
| components/member/RetailPromotionCenter.tsx:112 | STATIC | tooltip | 推廣零售完整數據 |  |
| components/member/RetailPromotionCenter.tsx:113 | STATIC | label | 實付商品業績 |  |
| components/member/RetailPromotionCenter.tsx:113 | STATIC | button | 待確認 |  |
| components/member/RetailPromotionCenter.tsx:114 | STATIC | label | 業績 |  |
| components/member/RetailPromotionCenter.tsx:114 | STATIC | label | PV |  |
| components/member/RetailPromotionCenter.tsx:114 | STATIC | button | 待確認 |  |
| components/member/RetailPromotionCenter.tsx:114 | STATIC | label | PV |  |
| components/member/RetailPromotionCenter.tsx:115 | STATIC | reward | 待入帳獎金 |  |
| components/member/RetailPromotionCenter.tsx:116 | STATIC | reward | 已入帳獎金 |  |
| components/member/RetailPromotionCenter.tsx:120 | STATIC | label | 規則簡介 |  |
| components/member/RetailPromotionCenter.tsx:121 | STATIC | description | 朋友透過你的分享連結進站，以訪客身分完成有效訂單後，該筆訂單會列入你的推廣零售業績。 |  |
| components/member/RetailPromotionCenter.tsx:122 | STATIC | button | 已登入會員購買時，該筆消費仍屬於會員自己的消費；未登入會員以訪客方式購買時，才視為訪客訂單。 |  |
| components/member/RetailPromotionCenter.tsx:123 | STATIC | label | 訂單建立時會固定分享來源、計算基礎與比例，之後不會重新改寫。 |  |
| components/member/RetailPromotionCenter.tsx:127 | STATIC | label | 推廣零售紀錄 |  |
| components/member/RetailPromotionCenter.tsx:133 | STATIC | tooltip | 推廣零售回饋 |  |
| components/member/RetailPromotionCenter.tsx:136 | STATIC | label | 訪客訂單 |  |
| components/member/RetailPromotionCenter.tsx:136 | DYNAMIC | description | 有效 {pointName} {creditAmount} PV | pointName, creditAmount |
| components/member/RetailPromotionCenter.tsx:136 | DYNAMIC | label | 有效業績 {creditAmount} | creditAmount |
| components/member/RetailPromotionCenter.tsx:137 | STATIC | label | 比例 |  |
| components/member/RetailPromotionCenter.tsx:137 | STATIC | label | 預計 |  |
| components/member/RetailPromotionCenter.tsx:137 | STATIC | reward | 入帳 |  |
| components/member/RetailPromotionCenter.tsx:138 | STATIC | emptyState | 目前還沒有推廣零售紀錄 |  |
| components/member/RetailPromotionCenter.tsx:138 | STATIC | button | 未登入訪客透過有效分享連結完成購買後，紀錄會顯示在這裡。 |  |
| components/member/RetailPromotionShareButton.tsx:38 | STATIC | label | 和你分享 KD Coffee |  |
| components/member/RetailPromotionShareButton.tsx:39 | STATIC | label | 分享完成 |  |
| components/member/RetailPromotionShareButton.tsx:42 | STATIC | label | 分享連結已複製 |  |
| components/member/RetailPromotionShareButton.tsx:46 | STATIC | label | 暫時無法分享，請稍後再試 |  |
| components/member/RetailPromotionShareButton.tsx:53 | STATIC | tooltip | 分享這個頁面 |  |
| components/member/RetailPromotionShareButton.tsx:53 | STATIC | label | 分享 |  |
| components/member/RewardLedgerCompactCard.tsx:78 | STATIC | label | 已沖回 |  |
| components/member/RewardLedgerCompactCard.tsx:82 | DYNAMIC | reward | 已入帳 {date} | date |
| components/member/RewardLedgerCompactCard.tsx:84 | STATIC | label | 已沖回 |  |
| components/member/RewardLedgerCompactCard.tsx:85 | STATIC | button | 已取消 |  |
| components/member/RewardLedgerCompactCard.tsx:88 | DYNAMIC | reward | 預計 {date} 入帳 | date |
| components/member/RewardLedgerCompactCard.tsx:90 | STATIC | reward | 入帳日期確認中 |  |
| components/member/RewardLedgerCompactCard.tsx:91 | STATIC | label | 待完成取貨後計算 |  |
| components/member/RewardLedgerCompactCard.tsx:92 | STATIC | label | 有效商品金額 |  |
| components/member/RewardLedgerCompactCard.tsx:92 | DYNAMIC | label | 有效 {pointName} | pointName |
| components/member/RewardLedgerCompactCard.tsx:94 | STATIC | label | 歷史資料未記錄 |  |
| components/member/RewardLedgerCompactCard.tsx:111 | STATIC | label | 歷史訂單 |  |
| components/member/RewardLedgerCompactCard.tsx:115 | STATIC | label | 點數未記錄 |  |
| components/member/RewardLedgerCompactCard.tsx:126 | STATIC | label | 收合詳情 |  |
| components/member/RewardLedgerCompactCard.tsx:126 | STATIC | button | 查看詳情 |  |
| components/member/RewardLedgerCompactCard.tsx:131 | STATIC | reward | 回饋怎麼算 |  |
| components/member/RewardLedgerCompactCard.tsx:134 | STATIC | reward | 回饋比例 |  |
| components/member/RewardLedgerCompactCard.tsx:134 | STATIC | label | 歷史資料未記錄 |  |
| components/member/RewardLedgerCompactCard.tsx:135 | STATIC | reward | 本筆回饋 |  |
| components/member/RewardLedgerCompactCard.tsx:135 | STATIC | label | 歷史資料未記錄 |  |
| components/member/RewardLedgerCompactCard.tsx:136 | STATIC | label | 已沖回折抵 |  |
| components/member/RewardLedgerCompactCard.tsx:136 | STATIC | reward | 實際入帳 |  |
| components/member/RewardLedgerCompactCard.tsx:136 | STATIC | label | 預估折抵 |  |
| components/member/RewardLedgerCompactCard.tsx:141 | STATIC | label | 來源訂單 |  |
| components/member/RewardLedgerCompactCard.tsx:151 | STATIC | label | 歷史資料未記錄 |  |
| components/member/RewardLedgerCompactCard.tsx:151 | STATIC | label | ・完整來源明細未保留 |  |
| components/member/RewardLedgerCompactCard.tsx:156 | STATIC | qualification | 資格狀態 |  |
| components/member/RewardLedgerCompactCard.tsx:158 | STATIC | qualification | 推薦資格有效至 |  |
| components/member/RewardLedgerCompactCard.tsx:161 | STATIC | qualification | 查看資格規則 |  |
| components/member/RewardLedgerCompactCard.tsx:168 | STATIC | reward | 入帳進度 |  |
| components/member/RewardLedgerCompactCard.tsx:169 | STATIC | tooltip | 回饋入帳進度 |  |
| components/member/RewardLedgerCompactCard.tsx:173 | NOT SAFE TO EDIT | reward | 安全等待 |  |
| components/member/RewardLedgerCompactCard.tsx:173 | STATIC | label | 預計至 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:37 | DYNAMIC | reward | 第 {generation} 代推薦回饋 | generation |
| components/member/RewardSourceOrderSummaryCard.tsx:39 | STATIC | reward | 會員消費回饋 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:40 | STATIC | reward | 推廣零售回饋 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:45 | STATIC | label | 歷史資料未記錄 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:50 | STATIC | label | 有效商品金額 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:51 | DYNAMIC | label | 有效 {pointName} | pointName |
| components/member/RewardSourceOrderSummaryCard.tsx:58 | STATIC | reward | 入帳日期 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:60 | STATIC | label | 沖回日期 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:62 | STATIC | reward | 入帳狀態 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:63 | STATIC | reward | 預計入帳日期 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:67 | STATIC | label | 已沖回 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:69 | STATIC | button | 已取消 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:73 | STATIC | label | 待完成取貨後計算 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:74 | STATIC | reward | 入帳日期確認中 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:84 | STATIC | label | REWARD SOURCE ORDER |  |
| components/member/RewardSourceOrderSummaryCard.tsx:91 | STATIC | label | 訂單類型 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:95 | STATIC | label | 訂單狀態 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:99 | STATIC | label | 完成取貨 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:102 | STATIC | label | 來源會員 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:104 | STATIC | label | 購買內容 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:110 | STATIC | reward | 回饋比例 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:111 | STATIC | reward | 本筆回饋 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:111 | STATIC | label | 歷史資料未記錄 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:112 | STATIC | reward | 實際入帳 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:112 | STATIC | label | 預估折抵價值 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:120 | STATIC | label | 目前可用 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:126 | STATIC | label | 完整訂單 |  |
| components/member/RewardSourceOrderSummaryCard.tsx:127 | STATIC | button | 查看完整訂單 → |  |
| components/member/RewardWaitingDisclosure.tsx:27 | STATIC | label | 歷史時間未記錄 |  |
| components/member/RewardWaitingDisclosure.tsx:34 | STATIC | tooltip | 查看安全等待說明 |  |
| components/member/RewardWaitingDisclosure.tsx:39 | STATIC | label | 說明 |  |
| components/member/RewardWaitingDisclosure.tsx:42 | STATIC | label | 此筆來源訂單已完成取貨。 |  |
| components/member/RewardWaitingDisclosure.tsx:43 | STATIC | reward | 為保障退貨、取消或其他交易異常的處理期間，這筆回饋會依本筆回饋建立時的規則經過安全等待期。 |  |
| components/member/RewardWaitingDisclosure.tsx:44 | STATIC | reward | 若等待期間內交易維持正常，回饋將由系統自動入帳，您不需要另外操作。 |  |
| components/member/RewardWaitingDisclosure.tsx:46 | STATIC | label | 完成取貨 |  |
| components/member/RewardWaitingDisclosure.tsx:49 | STATIC | reward | 基礎等待 |  |
| components/member/RewardWaitingDisclosure.tsx:49 | STATIC | label | 天 |  |
| components/member/RewardWaitingDisclosure.tsx:50 | STATIC | label | 退貨保護 |  |
| components/member/RewardWaitingDisclosure.tsx:50 | STATIC | label | 天 |  |
| components/member/RewardWaitingDisclosure.tsx:53 | STATIC | reward | 安全等待規則 |  |
| components/member/RewardWaitingDisclosure.tsx:53 | STATIC | reward | 依本筆回饋建立時的規則執行 |  |
| components/member/RewardWaitingDisclosure.tsx:55 | STATIC | reward | 預計入帳 |  |
| components/member/RewardWaitingDisclosure.tsx:55 | STATIC | reward | 入帳日期確認中 |  |
| lib/memberRewardPresentation.ts:83 | BUSINESS GENERATED | label | 歷史資料未記錄 |  |
| lib/memberRewardPresentation.ts:88 | BUSINESS GENERATED | label | 日期未記錄 |  |
| lib/memberRewardPresentation.ts:93 | BUSINESS GENERATED | label | 歷史資料未記錄 |  |
| lib/memberRewardPresentation.ts:110 | DYNAMIC | reward | 已入帳 {date} | date |
| lib/memberRewardPresentation.ts:110 | BUSINESS GENERATED | reward | 已入帳 |  |
| lib/memberRewardPresentation.ts:113 | DYNAMIC | label | 已沖回 {date} | date |
| lib/memberRewardPresentation.ts:113 | BUSINESS GENERATED | label | 已沖回 |  |
| lib/memberRewardPresentation.ts:117 | BUSINESS GENERATED | label | 已到預計發放日，系統將自動處理 |  |
| lib/memberRewardPresentation.ts:120 | DYNAMIC | label | 發放日 {date}・系統將自動處理 | date |
| lib/memberRewardPresentation.ts:121 | DYNAMIC | label | 已到預計發放日 {date}，系統將自動處理 | date |
| lib/memberRewardPresentation.ts:125 | DYNAMIC | reward | 預計 {date} 入帳 | date |
| lib/memberRewardPresentation.ts:126 | BUSINESS GENERATED | reward | 入帳日期確認中 |  |
| lib/memberRewardPresentation.ts:128 | BUSINESS GENERATED | label | 待完成取貨後計算 |  |
| lib/memberRewardPresentation.ts:130 | DYNAMIC | reward | 預計 {date} 入帳 | date |
| lib/memberRewardPresentation.ts:213 | NOT SAFE TO EDIT | reward | 待系統入帳 |  |
| lib/memberRewardPresentation.ts:215 | BUSINESS GENERATED | reward | 安全等待中 |  |
| lib/memberRewardPresentation.ts:236 | BUSINESS GENERATED | label | 歷史資料未記錄 |  |
| lib/memberRewardPresentation.ts:238 | DYNAMIC | label | {value1} ＋ {value2} 項商品 | value1, value2 |
| lib/memberRewardPresentation.ts:242 | NOT SAFE TO EDIT | qualification | 資格已確認・安全等待中 |  |
| lib/memberRewardPresentation.ts:242 | NOT SAFE TO EDIT | qualification | 本人消費不需推薦資格・安全等待中 |  |
| lib/memberRewardPresentation.ts:242 | BUSINESS GENERATED | reward | 安全等待中 |  |
| lib/memberRewardPresentation.ts:243 | NOT SAFE TO EDIT | reward | 已入帳 ✓ |  |
| lib/memberRewardPresentation.ts:243 | BUSINESS GENERATED | reward | 已入帳 |  |
| lib/memberRewardPresentation.ts:244 | NOT SAFE TO EDIT | qualification | 尚待取得推薦回饋資格 |  |
| lib/memberRewardPresentation.ts:244 | BUSINESS GENERATED | qualification | 尚待取得資格 |  |
| lib/memberRewardPresentation.ts:286 | BUSINESS GENERATED | reward | 已入帳 ✓ |  |
| lib/memberRewardPresentation.ts:287 | BUSINESS GENERATED | label | 已沖回 |  |
| lib/memberRewardPresentation.ts:288 | BUSINESS GENERATED | button | 已取消 |  |
| lib/memberRewardPresentation.ts:289 | BUSINESS GENERATED | qualification | 資格已逾期 |  |
| lib/memberRewardPresentation.ts:290 | BUSINESS GENERATED | reward | 等待來源訂單完成 |  |
| lib/memberRewardPresentation.ts:300 | BUSINESS GENERATED | reward | 等待來源訂單完成 |  |
| lib/memberRewardPresentation.ts:301 | BUSINESS GENERATED | qualification | 尚待取得推薦回饋資格 |  |
| lib/memberRewardPresentation.ts:308 | BUSINESS GENERATED | reward | 待系統入帳 |  |
| lib/memberRewardPresentation.ts:310 | BUSINESS GENERATED | qualification | 本人消費不需推薦資格・安全等待中 |  |
| lib/memberRewardPresentation.ts:311 | BUSINESS GENERATED | qualification | 資格已確認・安全等待中 |  |
| lib/memberRewardPresentation.ts:350 | BUSINESS GENERATED | label | 自己的訂單 |  |
| lib/memberRewardPresentation.ts:352 | BUSINESS GENERATED | label | 訪客訂單 |  |
| lib/memberRewardPresentation.ts:354 | DYNAMIC | label | 第 {generation} 代會員訂單 | generation |
| lib/memberRewardPresentation.ts:355 | BUSINESS GENERATED | label | 會員訂單 |  |
| lib/memberRewardPresentation.ts:367 | BUSINESS GENERATED | label | 已完成取貨 |  |
| lib/memberRewardPresentation.ts:368 | BUSINESS GENERATED | reward | 等待取貨 |  |
| lib/memberRewardPresentation.ts:369 | BUSINESS GENERATED | reward | 等待取貨 |  |
| lib/memberRewardPresentation.ts:370 | BUSINESS GENERATED | reward | 已到店等待取貨 |  |
| lib/memberRewardPresentation.ts:371 | BUSINESS GENERATED | label | 已出貨 |  |
| lib/memberRewardPresentation.ts:372 | BUSINESS GENERATED | label | 配送中 |  |
| lib/memberRewardPresentation.ts:373 | BUSINESS GENERATED | label | 準備中 |  |
| lib/memberRewardPresentation.ts:374 | BUSINESS GENERATED | label | 訂單已成立 |  |
| lib/memberRewardPresentation.ts:375 | BUSINESS GENERATED | button | 已取消 |  |
| lib/memberRewardPresentation.ts:376 | BUSINESS GENERATED | label | 未完成取貨 |  |
| lib/memberRewardPresentation.ts:377 | BUSINESS GENERATED | label | 處理中 |  |
| lib/memberRewardPresentation.ts:377 | BUSINESS GENERATED | label | 歷史資料未記錄 |  |
| lib/memberRewardPresentation.ts:384 | BUSINESS GENERATED | label | KD Coffee 商品 |  |
