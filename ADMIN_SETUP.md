# KD Coffee 工作室管理後台設定

在 `.env.local` 加入：

```env
ADMIN_PASSWORD=請設定只有工作室知道的管理密碼
ADMIN_SESSION_SECRET=至少32字元的隨機字串
```

修改後停止並重新啟動網站：

```bash
npm run dev
```

後台網址：

```text
http://localhost:3000/admin
```

後台目前可查看訂單、門市、客戶、商品與金額，並更新訂單狀態及物流編號。訂單狀態變更時會使用既有的 LINE Messaging API 設定通知工作室群組。
