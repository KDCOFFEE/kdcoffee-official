import { CREDIT_COPY_CATALOG } from "./creditCopyCatalog";
// Presentation keys only. Never use these identifiers as business program keys.
export type MemberCopyDefinition = {
  key: string;
  group: string;
  purpose: string;
  defaultText: string;
  tokens: Record<string, string>;
  multiline: boolean;
};

export const MEMBER_CENTER_COPY_CATALOG: readonly MemberCopyDefinition[] = [
  {
    "key": "member.dashboard.label.90d197949f",
    "group": "dashboard",
    "purpose": "工作室建議",
    "defaultText": "工作室建議",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.dec93acc38",
    "group": "dashboard",
    "purpose": "7-ELEVEN 取貨付款",
    "defaultText": "7-ELEVEN 取貨付款",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.58fb8f1cc6",
    "group": "dashboard",
    "purpose": "宅配",
    "defaultText": "宅配",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.84ede12f33",
    "group": "dashboard",
    "purpose": "工作室自取",
    "defaultText": "工作室自取",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.c5569cbd4f",
    "group": "dashboard",
    "purpose": "待建立寄件單",
    "defaultText": "待建立寄件單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.button.0c052f231a",
    "group": "dashboard",
    "purpose": "待確認自取時間",
    "defaultText": "待確認自取時間",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.e99b48a29b",
    "group": "dashboard",
    "purpose": "已完成",
    "defaultText": "已完成",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.button.a5ffdc95ee",
    "group": "dashboard",
    "purpose": "已取消",
    "defaultText": "已取消",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.695cdb3455",
    "group": "dashboard",
    "purpose": "訂單已成立",
    "defaultText": "訂單已成立",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.2ed1df28b6",
    "group": "dashboard",
    "purpose": "KD COFFEE MEMBER",
    "defaultText": "KD COFFEE MEMBER",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.button.a5b6f95f4c",
    "group": "dashboard",
    "purpose": "快速會員登入",
    "defaultText": "快速會員登入",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.button.d2a50e44a9",
    "group": "dashboard",
    "purpose": "可使用 LINE、手機號碼或 Email 登入。登入後可查看自己的訂單與常用資料。",
    "defaultText": "可使用 LINE、手機號碼或 Email 登入。登入後可查看自己的訂單與常用資料。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.button.bb6d3547de",
    "group": "dashboard",
    "purpose": "此登入方式需要完成帳號連結驗證。請先登入既有帳號，再從會員中心連結 LINE。",
    "defaultText": "此登入方式需要完成帳號連結驗證。請先登入既有帳號，再從會員中心連結 LINE。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.button.9f5ca4c2ae",
    "group": "dashboard",
    "purpose": "LINE 登入未完成，請再試一次。",
    "defaultText": "LINE 登入未完成，請再試一次。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.button.d4fc75acc4",
    "group": "dashboard",
    "purpose": "使用 LINE 登入／註冊",
    "defaultText": "使用 LINE 登入／註冊",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.30f4d7cfe8",
    "group": "dashboard",
    "purpose": "或",
    "defaultText": "或",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.button.095d7c587e",
    "group": "dashboard",
    "purpose": "返回首頁",
    "defaultText": "返回首頁",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.kdPoints.title",
    "group": "dashboard",
    "purpose": "KD點",
    "defaultText": "KD點",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.c573867b5f",
    "group": "dashboard",
    "purpose": "進行中",
    "defaultText": "進行中",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.0478e8abbe",
    "group": "dashboard",
    "purpose": "已暫停",
    "defaultText": "已暫停",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.75dddf524e",
    "group": "dashboard",
    "purpose": "已停止",
    "defaultText": "已停止",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.cf0c9cef2b",
    "group": "dashboard",
    "purpose": "待啟用",
    "defaultText": "待啟用",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.emptyState.973d987f2b",
    "group": "dashboard",
    "purpose": "尚未建立",
    "defaultText": "尚未建立",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.d469f2341a",
    "group": "dashboard",
    "purpose": "尚未設定",
    "defaultText": "尚未設定",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.button.8579bfa65b",
    "group": "dashboard",
    "purpose": "LINE 登入方式已連結完成。",
    "defaultText": "LINE 登入方式已連結完成。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.button.a05abde82b",
    "group": "dashboard",
    "purpose": "此登入方式需要完成帳號連結驗證。請先登入既有帳號，再從「登入方式」連結 LINE。",
    "defaultText": "此登入方式需要完成帳號連結驗證。請先登入既有帳號，再從「登入方式」連結 LINE。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.emptyState.d1f5280fe7",
    "group": "dashboard",
    "purpose": "LINE 連結未完成。此 LINE 可能已連結其他會員，或驗證已逾時；會員資料沒有變更。",
    "defaultText": "LINE 連結未完成。此 LINE 可能已連結其他會員，或驗證已逾時；會員資料沒有變更。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.hint.90cfb35f86",
    "group": "dashboard",
    "purpose": "會員頭像",
    "defaultText": "會員頭像",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.60575e1068",
    "group": "dashboard",
    "purpose": "KD",
    "defaultText": "KD",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.58a3f601aa",
    "group": "dashboard",
    "purpose": "…，歡迎回來",
    "defaultText": "{memberName}，歡迎回來",
    "tokens": {
      "memberName": "目前登入會員的名稱"
    },
    "multiline": false
  },
  {
    "key": "member.dashboard.label.0c9be6ce2a",
    "group": "dashboard",
    "purpose": "歡迎回來",
    "defaultText": "歡迎回來",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.fd3851014b",
    "group": "dashboard",
    "purpose": "享受每一杯咖啡，也感謝你成為 KD Coffee 的一份子。",
    "defaultText": "享受每一杯咖啡，也感謝你成為 KD Coffee 的一份子。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.3944973732",
    "group": "dashboard",
    "purpose": "會員編號",
    "defaultText": "會員編號",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.tooltip.832656d60e",
    "group": "dashboard",
    "purpose": "會員總覽",
    "defaultText": "會員總覽",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.3dd941956d",
    "group": "dashboard",
    "purpose": "可用折抵額",
    "defaultText": "可用{creditName}",
    "tokens": {"creditName": "共用顯示名稱；取自抵用金統一顯示名稱設定"},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.622f3c5acb",
    "group": "dashboard",
    "purpose": "元",
    "defaultText": "元",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.reward.65ec2fee29",
    "group": "dashboard",
    "purpose": "已正式入帳，結帳時可自行選擇使用",
    "defaultText": "已正式入帳，結帳時可自行選擇使用",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.pendingReward.title",
    "group": "dashboard",
    "purpose": "待入帳回饋",
    "defaultText": "待入帳回饋",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.3b6ef811b8",
    "group": "dashboard",
    "purpose": "共",
    "defaultText": "共",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.693d81614f",
    "group": "dashboard",
    "purpose": "筆・預估折抵 NT$",
    "defaultText": "筆・預估{creditName} NT$",
    "tokens": {"creditName": "共用顯示名稱；取自抵用金統一顯示名稱設定"},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.840598845c",
    "group": "dashboard",
    "purpose": "・部分歷史點數未記錄",
    "defaultText": "・部分歷史點數未記錄",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.3a822c9855",
    "group": "dashboard",
    "purpose": "下一次配送",
    "defaultText": "下一次配送",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.4e2330070b",
    "group": "dashboard",
    "purpose": "尚未排定",
    "defaultText": "尚未排定",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.20e524ae66",
    "group": "dashboard",
    "purpose": "建立定期配送後會顯示於此",
    "defaultText": "建立定期配送後會顯示於此",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.6117b251cb",
    "group": "dashboard",
    "purpose": "最近訂單",
    "defaultText": "最近訂單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.emptyState.7f1881cd57",
    "group": "dashboard",
    "purpose": "尚無訂單",
    "defaultText": "尚無訂單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.3d411edd76",
    "group": "dashboard",
    "purpose": "完成第一筆訂購後會顯示於此",
    "defaultText": "完成第一筆訂購後會顯示於此",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.tooltip.45202e34a4",
    "group": "dashboard",
    "purpose": "快速功能",
    "defaultText": "快速功能",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.title",
    "group": "dashboard",
    "purpose": "我的回饋",
    "defaultText": "我的回饋",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.d33e15dcd3",
    "group": "dashboard",
    "purpose": "配送設定",
    "defaultText": "配送設定",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.c5695a9b10",
    "group": "dashboard",
    "purpose": "我的訂單",
    "defaultText": "我的訂單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.73a5eb4680",
    "group": "dashboard",
    "purpose": "帳戶設定",
    "defaultText": "帳戶設定",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.b69468c933",
    "group": "dashboard",
    "purpose": "最近動態",
    "defaultText": "最近動態",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.button.4aaca147e0",
    "group": "dashboard",
    "purpose": "查看訂單",
    "defaultText": "查看訂單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.19d4b55568",
    "group": "dashboard",
    "purpose": "定期配送",
    "defaultText": "定期配送",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.reward.842ec6b52a",
    "group": "dashboard",
    "purpose": "會員回饋",
    "defaultText": "會員回饋",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.reward.74a9305151",
    "group": "dashboard",
    "purpose": "回饋待入帳",
    "defaultText": "回饋待入帳",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.reward.665878eb9a",
    "group": "dashboard",
    "purpose": "查看回饋",
    "defaultText": "查看回饋",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.emptyState.bbae21bad1",
    "group": "dashboard",
    "purpose": "目前沒有需要處理的新動態。",
    "defaultText": "目前沒有需要處理的新動態。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.tooltip.502431afe2",
    "group": "dashboard",
    "purpose": "帳戶資料",
    "defaultText": "帳戶資料",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.tooltip.bad46aea44",
    "group": "dashboard",
    "purpose": "編輯",
    "defaultText": "編輯",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.2269fd0d8b",
    "group": "dashboard",
    "purpose": "Email 尚未設定",
    "defaultText": "Email 尚未設定",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.de43cd7f15",
    "group": "dashboard",
    "purpose": "電話尚未設定",
    "defaultText": "電話尚未設定",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.fbd3821b33",
    "group": "dashboard",
    "purpose": "Email 已連結",
    "defaultText": "Email 已連結",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.13bc6f3fd7",
    "group": "dashboard",
    "purpose": "Email 未連結",
    "defaultText": "Email 未連結",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.2f4a54d1c7",
    "group": "dashboard",
    "purpose": "LINE 已連結",
    "defaultText": "LINE 已連結",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.6b27c5d6b5",
    "group": "dashboard",
    "purpose": "LINE 未連結",
    "defaultText": "LINE 未連結",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.47dbd9196c",
    "group": "dashboard",
    "purpose": "固定會員識別，不可變更。",
    "defaultText": "固定會員識別，不可變更。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.9ab57b0a32",
    "group": "dashboard",
    "purpose": "會員建立日期",
    "defaultText": "會員建立日期",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.button.997e1653f3",
    "group": "dashboard",
    "purpose": "最近登入：",
    "defaultText": "最近登入：",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.d704ae0fdc",
    "group": "dashboard",
    "purpose": "常用門市",
    "defaultText": "常用門市",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.7fb70d75e4",
    "group": "dashboard",
    "purpose": "會員帳號",
    "defaultText": "會員帳號",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.button.958f723d92",
    "group": "dashboard",
    "purpose": "登入方式",
    "defaultText": "登入方式",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.f25aefdfcd",
    "group": "dashboard",
    "purpose": "電子郵件",
    "defaultText": "電子郵件",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.5868ac1119",
    "group": "dashboard",
    "purpose": "已連結",
    "defaultText": "已連結",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.d282c48582",
    "group": "dashboard",
    "purpose": "尚未連結",
    "defaultText": "尚未連結",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.23486fa0f1",
    "group": "dashboard",
    "purpose": "✓ 可使用",
    "defaultText": "✓ 可使用",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.e4e9d5a3d4",
    "group": "dashboard",
    "purpose": "信箱驗證功能準備中",
    "defaultText": "信箱驗證功能準備中",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.528a45acf6",
    "group": "dashboard",
    "purpose": "LINE",
    "defaultText": "LINE",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.372d4a9554",
    "group": "dashboard",
    "purpose": "連結 LINE",
    "defaultText": "連結 LINE",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.button.70bd4dd0bb",
    "group": "dashboard",
    "purpose": "登入方式只用來確認是您本人；訂單與會員紀錄都會保留在同一個會員帳號。",
    "defaultText": "登入方式只用來確認是您本人；訂單與會員紀錄都會保留在同一個會員帳號。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.85ebc1d56a",
    "group": "dashboard",
    "purpose": "登出會員",
    "defaultText": "登出會員",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.tooltip.dae4685fc3",
    "group": "dashboard",
    "purpose": "管理配送",
    "defaultText": "管理配送",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.22dbe96421",
    "group": "dashboard",
    "purpose": "每 … 天",
    "defaultText": "每 {value1} 天",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.dashboard.emptyState.371f0a4177",
    "group": "dashboard",
    "purpose": "尚未建立方案",
    "defaultText": "尚未建立方案",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.93b905ce79",
    "group": "dashboard",
    "purpose": "下一次 …",
    "defaultText": "下一次 {date}",
    "tokens": {
      "date": "原系統日期顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.dashboard.label.ceaf1d4515",
    "group": "dashboard",
    "purpose": "下一次尚未排定",
    "defaultText": "下一次尚未排定",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.tooltip.f7acefd2d4",
    "group": "dashboard",
    "purpose": "查看",
    "defaultText": "查看",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.e98904a309",
    "group": "dashboard",
    "purpose": "ORDER HISTORY",
    "defaultText": "ORDER HISTORY",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.5511a36c82",
    "group": "dashboard",
    "purpose": "顯示最近",
    "defaultText": "顯示最近",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.ff04772d06",
    "group": "dashboard",
    "purpose": "筆・共",
    "defaultText": "筆・共",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.d0bb9b2b8e",
    "group": "dashboard",
    "purpose": "筆",
    "defaultText": "筆",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.1b3dc97c90",
    "group": "dashboard",
    "purpose": "取貨門市：",
    "defaultText": "取貨門市：",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.678b9b4b70",
    "group": "dashboard",
    "purpose": "取貨期限：",
    "defaultText": "取貨期限：",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.3d3f1fa5f0",
    "group": "dashboard",
    "purpose": "LINE 已通知工作室",
    "defaultText": "LINE 已通知工作室",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.635f6c85fa",
    "group": "dashboard",
    "purpose": "訂單已保存",
    "defaultText": "訂單已保存",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.button.856635f66d",
    "group": "dashboard",
    "purpose": "查看／管理此訂單",
    "defaultText": "查看／管理此訂單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.emptyState.3d8eae7ae3",
    "group": "dashboard",
    "purpose": "目前還沒有會員訂單",
    "defaultText": "目前還沒有會員訂單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.83128e9576",
    "group": "dashboard",
    "purpose": "完成第一筆訂購後，訂單紀錄會顯示在這裡。",
    "defaultText": "完成第一筆訂購後，訂單紀錄會顯示在這裡。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.e5b29ed3a7",
    "group": "dashboard",
    "purpose": "開始選購咖啡",
    "defaultText": "開始選購咖啡",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.fb467be060",
    "group": "dashboard",
    "purpose": "重新設定密碼",
    "defaultText": "重新設定密碼",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.f83155d195",
    "group": "dashboard",
    "purpose": "密碼重設連結無效或已過期，請重新申請。",
    "defaultText": "密碼重設連結無效或已過期，請重新申請。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.button.06e330cc50",
    "group": "dashboard",
    "purpose": "回到會員登入",
    "defaultText": "回到會員登入",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.button.645760d08c",
    "group": "login",
    "purpose": "此 Email 已經註冊過，請直接登入。",
    "defaultText": "此 Email 已經註冊過，請直接登入。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.d624cbb886",
    "group": "login",
    "purpose": "操作失敗，請稍後再試",
    "defaultText": "操作失敗，請稍後再試",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.button.e88798ce94",
    "group": "login",
    "purpose": "如果此 Email 已註冊，我們會將密碼重設方式寄到您的信箱。",
    "defaultText": "如果此 Email 已註冊，我們會將密碼重設方式寄到您的信箱。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.button.f7ab085b8a",
    "group": "login",
    "purpose": "使用 Email 快速註冊",
    "defaultText": "使用 Email 快速註冊",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.0382e81f94",
    "group": "login",
    "purpose": "EMAIL MEMBER",
    "defaultText": "EMAIL MEMBER",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.button.bbef7c1dcf",
    "group": "login",
    "purpose": "Email 登入",
    "defaultText": "Email 登入",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.d886263f73",
    "group": "login",
    "purpose": "建立 Email 會員",
    "defaultText": "建立 Email 會員",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.e10e462480",
    "group": "login",
    "purpose": "忘記密碼",
    "defaultText": "忘記密碼",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.6e25cb2224",
    "group": "login",
    "purpose": "密碼",
    "defaultText": "密碼",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.1ba8285ef7",
    "group": "login",
    "purpose": "再次輸入密碼",
    "defaultText": "再次輸入密碼",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.1e038f9b55",
    "group": "login",
    "purpose": "處理中…",
    "defaultText": "處理中…",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.button.da8245197e",
    "group": "login",
    "purpose": "登入",
    "defaultText": "登入",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.58ae02a218",
    "group": "login",
    "purpose": "建立會員",
    "defaultText": "建立會員",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.3f9a4f5a91",
    "group": "login",
    "purpose": "寄送密碼重設方式",
    "defaultText": "寄送密碼重設方式",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.1befc9459d",
    "group": "login",
    "purpose": "忘記密碼？",
    "defaultText": "忘記密碼？",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.button.637f8d33d4",
    "group": "login",
    "purpose": "還不是會員？使用 Email 快速註冊",
    "defaultText": "還不是會員？使用 Email 快速註冊",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.button.def3843182",
    "group": "login",
    "purpose": "已經是 Email 會員？Email 登入",
    "defaultText": "已經是 Email 會員？Email 登入",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.button.8bd458f689",
    "group": "login",
    "purpose": "返回 Email 登入",
    "defaultText": "返回 Email 登入",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.1f08d10c12",
    "group": "login",
    "purpose": "直接使用訪客下單",
    "defaultText": "直接使用訪客下單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.button.5733748206",
    "group": "login",
    "purpose": "無需註冊會員，也可以直接購買",
    "defaultText": "無需註冊會員，也可以直接購買",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.description.77ca14fcc9",
    "group": "referral",
    "purpose": "最近喝到一家我很喜歡的咖啡，想分享給你 ☕\n\nKD Coffee 是自己烘焙的精品咖啡，每款都有不同的風味。有空可以逛逛，說不定會找到你喜歡的那一杯。",
    "defaultText": "最近喝到一家我很喜歡的咖啡，想分享給你 ☕\n\nKD Coffee 是自己烘焙的精品咖啡，每款都有不同的風味。有空可以逛逛，說不定會找到你喜歡的那一杯。",
    "tokens": {},
    "multiline": true
  },
  {
    "key": "member.referral.label.5927602525",
    "group": "referral",
    "purpose": "分享完成",
    "defaultText": "分享完成",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.329faf23ac",
    "group": "referral",
    "purpose": "分享內容已複製，可以直接貼給朋友",
    "defaultText": "分享內容已複製，可以直接貼給朋友",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.0993a6179a",
    "group": "referral",
    "purpose": "暫時無法分享，請稍後再試",
    "defaultText": "暫時無法分享，請稍後再試",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.dbeb65765b",
    "group": "referral",
    "purpose": "分享連結已複製",
    "defaultText": "分享連結已複製",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.83f1e9aca1",
    "group": "referral",
    "purpose": "複製失敗，請選取連結後手動複製",
    "defaultText": "複製失敗，請選取連結後手動複製",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.0c4f1858e6",
    "group": "referral",
    "purpose": "QR Code 圖片已下載",
    "defaultText": "QR Code 圖片已下載",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.c187b8bf1d",
    "group": "referral",
    "purpose": "已開啟 QR Code 圖片，可長按或另存圖片",
    "defaultText": "已開啟 QR Code 圖片，可長按或另存圖片",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.6d2194dbed",
    "group": "referral",
    "purpose": "SHARE KD COFFEE",
    "defaultText": "SHARE KD COFFEE",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.079deedf6d",
    "group": "referral",
    "purpose": "分享 KD Coffee",
    "defaultText": "分享 KD Coffee",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.tooltip.555397de7a",
    "group": "referral",
    "purpose": "關閉分享視窗",
    "defaultText": "關閉分享視窗",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.description.49e6f72d14",
    "group": "referral",
    "purpose": "把你喜歡的 KD Coffee 分享給朋友。連結會保留你的分享來源，朋友仍可自由瀏覽與選購。",
    "defaultText": "把你喜歡的 KD Coffee 分享給朋友。連結會保留你的分享來源，朋友仍可自由瀏覽與選購。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.12996088ad",
    "group": "referral",
    "purpose": "分享文字",
    "defaultText": "分享文字",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.a86fb4b250",
    "group": "referral",
    "purpose": "分享連結",
    "defaultText": "分享連結",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.bf3955b8e5",
    "group": "referral",
    "purpose": "KD Coffee 首頁＋你的分享碼",
    "defaultText": "KD Coffee 首頁＋你的分享碼",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.cd937c931b",
    "group": "referral",
    "purpose": "分享出去",
    "defaultText": "分享出去",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.619425e4de",
    "group": "referral",
    "purpose": "複製連結",
    "defaultText": "複製連結",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.26e251e403",
    "group": "referral",
    "purpose": "收起 QR Code",
    "defaultText": "收起 QR Code",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.02a940dd77",
    "group": "referral",
    "purpose": "顯示 QR Code",
    "defaultText": "顯示 QR Code",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.tooltip.7c7939ecf9",
    "group": "referral",
    "purpose": "分享 QR Code",
    "defaultText": "分享 QR Code",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.hint.8b41355715",
    "group": "referral",
    "purpose": "KD Coffee 分享 QR Code",
    "defaultText": "KD Coffee 分享 QR Code",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.b43ec6d57f",
    "group": "referral",
    "purpose": "下載 QR Code",
    "defaultText": "下載 QR Code",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.a05f7c69ac",
    "group": "referral",
    "purpose": "分享如何計算？",
    "defaultText": "分享如何計算？",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.button.752abff036",
    "group": "referral",
    "purpose": "朋友從這個連結進入 KD Coffee 後，以訪客身分完成有效訂單，可列入你的推廣零售；若朋友完成會員註冊，推薦關係會由系統自動記錄。已登入會員購買仍屬於該會員自己的消費。",
    "defaultText": "朋友從這個連結進入 KD Coffee 後，以訪客身分完成有效訂單，可列入你的推廣零售；若朋友完成會員註冊，推薦關係會由系統自動記錄。已登入會員購買仍屬於該會員自己的消費。",
    "tokens": {},
    "multiline": true
  },
  {
    "key": "member.account.label.142b437b42",
    "group": "account",
    "purpose": "頭像上傳失敗",
    "defaultText": "頭像上傳失敗",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.label.9559ddaeb2",
    "group": "account",
    "purpose": "頭像已更新。重新整理後首頁頭像也會同步。 ",
    "defaultText": "頭像已更新。重新整理後首頁頭像也會同步。 ",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.label.ef19a0ad30",
    "group": "account",
    "purpose": "頭像移除失敗",
    "defaultText": "頭像移除失敗",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.label.dff539dac7",
    "group": "account",
    "purpose": "已恢復 LINE 頭像。",
    "defaultText": "已恢復 LINE 頭像。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.label.6fad82efc0",
    "group": "account",
    "purpose": "已恢復 KD 預設頭像。",
    "defaultText": "已恢復 KD 預設頭像。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.hint.90aa475dcf",
    "group": "account",
    "purpose": "目前會員頭像",
    "defaultText": "目前會員頭像",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.description.0b77571386",
    "group": "account",
    "purpose": "可上傳 JPG、PNG 或 WebP，檔案上限 5MB。自行上傳的照片會優先於 LINE 頭像。",
    "defaultText": "可上傳 JPG、PNG 或 WebP，檔案上限 5MB。自行上傳的照片會優先於 LINE 頭像。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.label.5d509870cd",
    "group": "account",
    "purpose": "更換照片",
    "defaultText": "更換照片",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.label.44552afd2a",
    "group": "account",
    "purpose": "上傳照片",
    "defaultText": "上傳照片",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.label.7cc3fc92d2",
    "group": "account",
    "purpose": "移除自訂頭像",
    "defaultText": "移除自訂頭像",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.216076a213",
    "group": "dashboard",
    "purpose": "KD Coffee 會員",
    "defaultText": "KD Coffee 會員",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.button.4186bf6148",
    "group": "dashboard",
    "purpose": "會員登入",
    "defaultText": "會員登入",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.button.4989b5cf94",
    "group": "dashboard",
    "purpose": "管理",
    "defaultText": "管理",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.dashboard.label.52c158ce9c",
    "group": "dashboard",
    "purpose": "收合",
    "defaultText": "收合",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.button.5ab0c1e079",
    "group": "account",
    "purpose": "會員資料儲存失敗",
    "defaultText": "會員資料儲存失敗",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.label.67ea5905bd",
    "group": "account",
    "purpose": "會員資料已更新，下次結帳會自動帶入。",
    "defaultText": "會員資料已更新，下次結帳會自動帶入。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.label.79799fc6ec",
    "group": "account",
    "purpose": "PROFILE",
    "defaultText": "PROFILE",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.label.c738ebbf02",
    "group": "account",
    "purpose": "基本資料",
    "defaultText": "基本資料",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.button.3c9fd9713e",
    "group": "account",
    "purpose": "可直接修改後儲存",
    "defaultText": "可直接修改後儲存",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.label.0e8c35e4e6",
    "group": "account",
    "purpose": "常用姓名",
    "defaultText": "常用姓名",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.hint.dbfbdab468",
    "group": "account",
    "purpose": "請填寫真實姓名",
    "defaultText": "請填寫真實姓名",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.label.59e431e2fb",
    "group": "account",
    "purpose": "手機號碼",
    "defaultText": "手機號碼",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.hint.49863db7db",
    "group": "account",
    "purpose": "例如 0912345678",
    "defaultText": "例如 0912345678",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.label.4733c50420",
    "group": "account",
    "purpose": "選填",
    "defaultText": "選填",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.hint.e88ebbc411",
    "group": "account",
    "purpose": "用於日後寄送訂單通知",
    "defaultText": "用於日後寄送訂單通知",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.button.8488ea2522",
    "group": "account",
    "purpose": "儲存中…",
    "defaultText": "儲存中…",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.account.button.8aa42c6a63",
    "group": "account",
    "purpose": "儲存會員資料",
    "defaultText": "儲存會員資料",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.1d44ceb578",
    "group": "qualification",
    "purpose": "定期配送會員",
    "defaultText": "定期配送會員",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.2e984b8c9c",
    "group": "qualification",
    "purpose": "一般會員",
    "defaultText": "一般會員",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.033719b7f2",
    "group": "qualification",
    "purpose": "依一般會員資格判定",
    "defaultText": "依一般會員資格判定",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.4166ea16f9",
    "group": "qualification",
    "purpose": "依有效定期配送會員資格判定",
    "defaultText": "依有效定期配送會員資格判定",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.e8dd705a40",
    "group": "qualification",
    "purpose": "需同時符合一般會員與定期配送會員資格",
    "defaultText": "需同時符合一般會員與定期配送會員資格",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.263f5926ba",
    "group": "qualification",
    "purpose": "一般會員或定期配送會員任一路徑達成即可",
    "defaultText": "一般會員或定期配送會員任一路徑達成即可",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.da9e4d37a7",
    "group": "qualification",
    "purpose": "商品 …",
    "defaultText": "商品 {pointName}",
    "tokens": {
      "pointName": "原點數顯示名稱"
    },
    "multiline": false
  },
  {
    "key": "member.qualification.label.b5e6348d4c",
    "group": "qualification",
    "purpose": "有效消費",
    "defaultText": "有效消費",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.0899d49ce4",
    "group": "qualification",
    "purpose": "已達推薦回饋資格",
    "defaultText": "已達推薦回饋資格",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.1e9605efbb",
    "group": "qualification",
    "purpose": "資格條件已達成",
    "defaultText": "資格條件已達成",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.98d36f12e4",
    "group": "qualification",
    "purpose": "尚差 …",
    "defaultText": "尚差 {remainingPoints}",
    "tokens": {
      "remainingPoints": "現有資格計算的差額（沿用原顯示單位）"
    },
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.269eeb6a20",
    "group": "qualification",
    "purpose": "目前資格有效至 …",
    "defaultText": "目前資格有效至 {date}",
    "tokens": {
      "date": "原系統日期顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.8491c016dd",
    "group": "qualification",
    "purpose": "目前已符合推薦回饋領取資格。",
    "defaultText": "目前已符合推薦回饋領取資格。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.c1fae22989",
    "group": "qualification",
    "purpose": "目前累積條件已符合，系統會依正式訂單完成事件確認資格。",
    "defaultText": "目前累積條件已符合，系統會依正式訂單完成事件確認資格。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.fc1ba23c41",
    "group": "qualification",
    "purpose": "最近 … 天累積…即可逐步達成資格。",
    "defaultText": "最近 {windowDays} 天累積{value2}即可逐步達成資格。",
    "tokens": {
      "windowDays": "原資格累積期間天數",
      "value2": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.cc571a8dd6",
    "group": "qualification",
    "purpose": "目前資格",
    "defaultText": "目前資格",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.ad385d382a",
    "group": "qualification",
    "purpose": "有效",
    "defaultText": "有效",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.90d0b07de9",
    "group": "qualification",
    "purpose": "至 …",
    "defaultText": "至 {date}",
    "tokens": {
      "date": "原系統日期顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.qualification.label.b5d0a901ee",
    "group": "qualification",
    "purpose": "目標 …",
    "defaultText": "目標 {requiredPoints}",
    "tokens": {
      "requiredPoints": "現有資格門檻顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.qualification.label.147f75c8ed",
    "group": "qualification",
    "purpose": "REFERRAL REWARD QUALIFICATION",
    "defaultText": "REFERRAL REWARD QUALIFICATION",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.d853ed0a38",
    "group": "qualification",
    "purpose": "推薦回饋資格",
    "defaultText": "推薦回饋資格",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.02837eef11",
    "group": "qualification",
    "purpose": "資格有效",
    "defaultText": "資格有效",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.2e1af05012",
    "group": "qualification",
    "purpose": "累積中",
    "defaultText": "累積中",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.b04e5a22ef",
    "group": "qualification",
    "purpose": "目前狀態",
    "defaultText": "目前狀態",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.tooltip.32046980b4",
    "group": "qualification",
    "purpose": "推薦回饋資格進度",
    "defaultText": "推薦回饋資格進度",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.4994ef32c5",
    "group": "qualification",
    "purpose": "目前已符合資格",
    "defaultText": "目前已符合資格",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.03e5b4cb30",
    "group": "qualification",
    "purpose": "還差 …",
    "defaultText": "還差 {remainingPoints}",
    "tokens": {
      "remainingPoints": "現有資格計算的差額（沿用原顯示單位）"
    },
    "multiline": false
  },
  {
    "key": "member.qualification.label.6f5d282d8e",
    "group": "qualification",
    "purpose": "條件已達成",
    "defaultText": "條件已達成",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.db3479422e",
    "group": "qualification",
    "purpose": "QUALIFICATION DETAILS",
    "defaultText": "QUALIFICATION DETAILS",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.1521fdb89f",
    "group": "qualification",
    "purpose": "查看資格計算明細",
    "defaultText": "查看資格計算明細",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.3dc5540427",
    "group": "qualification",
    "purpose": "目前有效資格",
    "defaultText": "目前有效資格",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.76aa4272cb",
    "group": "qualification",
    "purpose": "達成日期：",
    "defaultText": "達成日期：",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.64691d05d7",
    "group": "qualification",
    "purpose": "CURRENT QUALIFICATION EVIDENCE",
    "defaultText": "CURRENT QUALIFICATION EVIDENCE",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.button.f2edf46338",
    "group": "qualification",
    "purpose": "查看本期合格消費",
    "defaultText": "查看本期合格消費",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.5c0984e11d",
    "group": "qualification",
    "purpose": "本期取得資格",
    "defaultText": "本期取得資格",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.bd0c7775a2",
    "group": "qualification",
    "purpose": "本期資格使用",
    "defaultText": "本期資格使用",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.e7b62e6d9b",
    "group": "qualification",
    "purpose": "達標路徑",
    "defaultText": "達標路徑",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.89ac8c6c40",
    "group": "qualification",
    "purpose": "本筆達標",
    "defaultText": "本筆達標",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.398308a8d4",
    "group": "qualification",
    "purpose": "訂單合格值",
    "defaultText": "訂單合格值",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.a439e101c5",
    "group": "qualification",
    "purpose": "本期採計",
    "defaultText": "本期採計",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.b16cf1e676",
    "group": "qualification",
    "purpose": "累積採計",
    "defaultText": "累積採計",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.708d828818",
    "group": "qualification",
    "purpose": "此處顯示的是實際用於取得目前推薦回饋資格的已完成訂單；同一筆已採計消費不會重複計入下一資格週期。",
    "defaultText": "此處顯示的是實際用於取得目前推薦回饋資格的已完成訂單；同一筆已採計消費不會重複計入下一資格週期。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.fb90be8a93",
    "group": "qualification",
    "purpose": "NEXT QUALIFICATION CYCLE",
    "defaultText": "NEXT QUALIFICATION CYCLE",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.f3ac6be3d1",
    "group": "qualification",
    "purpose": "下一資格週期累積",
    "defaultText": "下一資格週期累積",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.77dd1ce025",
    "group": "qualification",
    "purpose": "你目前的推薦回饋資格仍然有效。以下顯示下一個資格週期重新累積的進度，不影響目前有效資格。",
    "defaultText": "你目前的推薦回饋資格仍然有效。以下顯示下一個資格週期重新累積的進度，不影響目前有效資格。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.14b4155501",
    "group": "qualification",
    "purpose": "下一輪累積",
    "defaultText": "下一輪累積",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.0b81a2c573",
    "group": "qualification",
    "purpose": "已達標",
    "defaultText": "已達標",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.f627395733",
    "group": "qualification",
    "purpose": "目前未啟用",
    "defaultText": "目前未啟用",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.8c73d90eca",
    "group": "qualification",
    "purpose": "最近",
    "defaultText": "最近",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.c66b75dd5b",
    "group": "qualification",
    "purpose": "天累積",
    "defaultText": "天累積",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.71b24bf68e",
    "group": "qualification",
    "purpose": "資格門檻",
    "defaultText": "資格門檻",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.4236bf09db",
    "group": "qualification",
    "purpose": "此路徑需目前具有有效的定期配送資格。",
    "defaultText": "此路徑需目前具有有效的定期配送資格。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.fe5b74041c",
    "group": "qualification",
    "purpose": "完成訂單",
    "defaultText": "完成訂單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.f4ce7c88ec",
    "group": "qualification",
    "purpose": "目前可計入",
    "defaultText": "目前可計入",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.emptyState.4bb6400886",
    "group": "qualification",
    "purpose": "目前下一資格週期尚無可重新計入的已完成訂單。",
    "defaultText": "目前下一資格週期尚無可重新計入的已完成訂單。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.2f0a81b98a",
    "group": "qualification",
    "purpose": "資格進度依已完成訂單與目前後台規則計算；已用於取得目前資格的消費不會重複計入下一資格週期。",
    "defaultText": "資格進度依已完成訂單與目前後台規則計算；已用於取得目前資格的消費不會重複計入下一資格週期。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.4cdb21ae7d",
    "group": "qualification",
    "purpose": "已達成 ✓",
    "defaultText": "已達成 ✓",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.reward.25e7eef558",
    "group": "qualification",
    "purpose": "等待訂單完成確認",
    "defaultText": "等待訂單完成確認",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.dab53ff98f",
    "group": "qualification",
    "purpose": "有效至 …",
    "defaultText": "有效至 {date}",
    "tokens": {
      "date": "原系統日期顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.57dfb75c3b",
    "group": "qualification",
    "purpose": "目前資格有效",
    "defaultText": "目前資格有效",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.reward.c36bd8afdf",
    "group": "qualification",
    "purpose": "等待有效訂單完成後確認",
    "defaultText": "等待有效訂單完成後確認",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.7687521b81",
    "group": "qualification",
    "purpose": "查看目前資格進度",
    "defaultText": "查看目前資格進度",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.button.7eba3bdf9f",
    "group": "qualification",
    "purpose": "查看詳情",
    "defaultText": "查看詳情",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.label.438c798a3e",
    "group": "qualification",
    "purpose": "REWARD QUALIFICATION",
    "defaultText": "REWARD QUALIFICATION",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.qualification.931793e1fe",
    "group": "qualification",
    "purpose": "推薦回饋資格詳情",
    "defaultText": "推薦回饋資格詳情",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.qualification.tooltip.500297dc03",
    "group": "qualification",
    "purpose": "關閉推薦回饋資格詳情",
    "defaultText": "關閉推薦回饋資格詳情",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.21002e3262",
    "group": "referral",
    "purpose": "… 元",
    "defaultText": "{value1} 元",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.selfPurchase.title",
    "group": "referral",
    "purpose": "自己的消費",
    "defaultText": "自己的消費",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.66dad4c359",
    "group": "referral",
    "purpose": "第 … 代推薦回饋",
    "defaultText": "第 {generation} 代推薦回饋",
    "tokens": {
      "generation": "原推薦代數"
    },
    "multiline": false
  },
  {
    "key": "member.retailPromotion.title",
    "group": "referral",
    "purpose": "推廣零售回饋",
    "defaultText": "推廣零售回饋",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.ffcb33d172",
    "group": "referral",
    "purpose": "推薦回饋",
    "defaultText": "推薦回饋",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.38cf00bdb4",
    "group": "referral",
    "purpose": "已入帳 ✓",
    "defaultText": "已入帳 ✓",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.beb9e7d8b0",
    "group": "referral",
    "purpose": "REFERRAL",
    "defaultText": "REFERRAL",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.006747b0e8",
    "group": "referral",
    "purpose": "推薦",
    "defaultText": "推薦",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.button.f4ae165070",
    "group": "referral",
    "purpose": "分享咖啡、查看推薦人與團隊，並直接開啟三代組織圖。",
    "defaultText": "分享咖啡、查看推薦人與團隊，並直接開啟三代組織圖。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.26de6d02b4",
    "group": "referral",
    "purpose": "分享給朋友",
    "defaultText": "分享給朋友",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.8388054bee",
    "group": "referral",
    "purpose": "這是會員中心唯一的分享入口。朋友透過你的專屬連結加入會員，系統會保留推薦關係；訪客完成有效購買，也可能帶來推廣零售回饋。",
    "defaultText": "這是會員中心唯一的分享入口。朋友透過你的專屬連結加入會員，系統會保留推薦關係；訪客完成有效購買，也可能帶來推廣零售回饋。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.26003e0161",
    "group": "referral",
    "purpose": "我的推薦碼",
    "defaultText": "我的推薦碼",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.0356872f2c",
    "group": "referral",
    "purpose": "專屬連結",
    "defaultText": "專屬連結",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.70283369a3",
    "group": "referral",
    "purpose": "INVITED BY",
    "defaultText": "INVITED BY",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.aecceea641",
    "group": "referral",
    "purpose": "誰邀請我",
    "defaultText": "誰邀請我",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.b463d2abc2",
    "group": "referral",
    "purpose": "會員 …",
    "defaultText": "會員 {value1}",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.referral.label.8639317de1",
    "group": "referral",
    "purpose": "無推薦人資料",
    "defaultText": "無推薦人資料",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.6300f96956",
    "group": "referral",
    "purpose": "這是你的推薦關係來源；會員聯絡資料不會在此顯示。",
    "defaultText": "這是你的推薦關係來源；會員聯絡資料不會在此顯示。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.emptyState.1a0d124447",
    "group": "referral",
    "purpose": "目前沒有其他會員的推薦關係紀錄。",
    "defaultText": "目前沒有其他會員的推薦關係紀錄。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.8380d33dfc",
    "group": "referral",
    "purpose": "直接推薦",
    "defaultText": "直接推薦",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.4912771a42",
    "group": "referral",
    "purpose": "人",
    "defaultText": "人",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.ad89e6b116",
    "group": "referral",
    "purpose": "團隊人數",
    "defaultText": "團隊人數",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.cbd9871f9f",
    "group": "referral",
    "purpose": "MY TEAM",
    "defaultText": "MY TEAM",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.8ed9248644",
    "group": "referral",
    "purpose": "我的推薦團隊",
    "defaultText": "我的推薦團隊",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.button.0f37fcdf39",
    "group": "referral",
    "purpose": "先看自己的第一代；也可以打開三代樹狀組織圖，點選會員後以他為中心繼續往下查看。",
    "defaultText": "先看自己的第一代；也可以打開三代樹狀組織圖，點選會員後以他為中心繼續往下查看。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.button.93a94331d4",
    "group": "referral",
    "purpose": "查看組織圖",
    "defaultText": "查看組織圖",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.button.4dc5e6c555",
    "group": "referral",
    "purpose": "← 返回上一層",
    "defaultText": "← 返回上一層",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.66493384d0",
    "group": "referral",
    "purpose": "我的第一代",
    "defaultText": "我的第一代",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.tooltip.1cc2fe71f6",
    "group": "referral",
    "purpose": "推薦團隊瀏覽路徑",
    "defaultText": "推薦團隊瀏覽路徑",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.button.9f305cb4fa",
    "group": "referral",
    "purpose": "目前查看",
    "defaultText": "目前查看",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.8f83efb79b",
    "group": "referral",
    "purpose": "會員",
    "defaultText": "會員",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.69bf3dfc21",
    "group": "referral",
    "purpose": "你的第",
    "defaultText": "你的第",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.50bf454068",
    "group": "referral",
    "purpose": "代會員",
    "defaultText": "代會員",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.390c469308",
    "group": "referral",
    "purpose": "他的直接推薦",
    "defaultText": "他的直接推薦",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.44e7a4284c",
    "group": "referral",
    "purpose": "代 ·",
    "defaultText": "代 ·",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.b5a9258cf7",
    "group": "referral",
    "purpose": "代",
    "defaultText": "代",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.aeced44bac",
    "group": "referral",
    "purpose": "直推",
    "defaultText": "直推",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.cb3fe31f73",
    "group": "referral",
    "purpose": "團隊",
    "defaultText": "團隊",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.button.e1b6f68ea7",
    "group": "referral",
    "purpose": "查看下線 ›",
    "defaultText": "查看下線 ›",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.emptyState.5a7286d409",
    "group": "referral",
    "purpose": "尚無下線",
    "defaultText": "尚無下線",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.emptyState.241a6fac10",
    "group": "referral",
    "purpose": "會員 … 目前沒有直接推薦會員",
    "defaultText": "會員 {value1} 目前沒有直接推薦會員",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.referral.emptyState.61fc69f34b",
    "group": "referral",
    "purpose": "目前還沒有第一代推薦會員",
    "defaultText": "目前還沒有第一代推薦會員",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.button.ec572aa1fb",
    "group": "referral",
    "purpose": "可返回上一層繼續查看其他推薦會員。",
    "defaultText": "可返回上一層繼續查看其他推薦會員。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.430efdac67",
    "group": "referral",
    "purpose": "分享給朋友後，完成會員加入就會在這裡顯示。",
    "defaultText": "分享給朋友後，完成會員加入就會在這裡顯示。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.d03acbf1f1",
    "group": "referral",
    "purpose": "REWARDS",
    "defaultText": "REWARDS",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.844ff5842a",
    "group": "referral",
    "purpose": "回饋",
    "defaultText": "回饋",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.qualification.78aed18bf0",
    "group": "referral",
    "purpose": "推廣零售、會員回饋、資格與歷史明細各自清楚呈現。",
    "defaultText": "推廣零售、會員回饋、資格與歷史明細各自清楚呈現。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.9f21433d5c",
    "group": "referral",
    "purpose": "MEMBER REWARDS",
    "defaultText": "MEMBER REWARDS",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.174938c940",
    "group": "referral",
    "purpose": "回饋點數與折抵金額都以正式紀錄為準。",
    "defaultText": "回饋點數與折抵金額都以正式紀錄為準。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.899b2f0a17",
    "group": "referral",
    "purpose": "MY REWARDS",
    "defaultText": "MY REWARDS",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.dc9160b21b",
    "group": "referral",
    "purpose": "待入帳",
    "defaultText": "待入帳",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.6bd122e2dd",
    "group": "referral",
    "purpose": "已入帳",
    "defaultText": "已入帳",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.10aad3f559",
    "group": "referral",
    "purpose": "查看回饋明細",
    "defaultText": "查看回饋明細",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.2053611867",
    "group": "referral",
    "purpose": "REWARD DETAILS",
    "defaultText": "REWARD DETAILS",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.a36b14bb19",
    "group": "referral",
    "purpose": "推薦與會員回饋",
    "defaultText": "推薦與會員回饋",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.tooltip.fd8688ce9b",
    "group": "referral",
    "purpose": "關閉回饋明細",
    "defaultText": "關閉回饋明細",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.1b6580e9b2",
    "group": "referral",
    "purpose": "REWARD HISTORY",
    "defaultText": "REWARD HISTORY",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.da565254f6",
    "group": "referral",
    "purpose": "回饋總覽",
    "defaultText": "回饋總覽",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.qualification.263bbdd968",
    "group": "referral",
    "purpose": "先看回饋結果，需要時再展開計算、資格與來源訂單。",
    "defaultText": "先看回饋結果，需要時再展開計算、資格與來源訂單。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.tooltip.be6e512f4b",
    "group": "referral",
    "purpose": "已入帳抵用金總覽",
    "defaultText": "已入帳{creditName}總覽",
    "tokens": {"creditName": "共用顯示名稱；取自抵用金統一顯示名稱設定"},
    "multiline": false
  },
  {
    "key": "member.referral.label.5b29dc001e",
    "group": "referral",
    "purpose": "目前可用折抵額",
    "defaultText": "可用{creditName}",
    "tokens": {"creditName": "共用顯示名稱；取自抵用金統一顯示名稱設定"},
    "multiline": false
  },
  {
    "key": "member.referral.reward.0f78857ceb",
    "group": "referral",
    "purpose": "直接取自正式抵用金帳本，不由回饋紀錄重算",
    "defaultText": "直接取自正式{creditName}帳本，不由回饋紀錄重算",
    "tokens": {"creditName": "共用顯示名稱；取自抵用金統一顯示名稱設定"},
    "multiline": false
  },
  {
    "key": "member.referral.reward.5513b261d0",
    "group": "referral",
    "purpose": "回饋入帳來源",
    "defaultText": "回饋入帳來源",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.66ef2bf5c3",
    "group": "referral",
    "purpose": "推廣零售、推薦回饋與自己的消費",
    "defaultText": "推廣零售、推薦回饋與自己的消費",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.tooltip.596d938320",
    "group": "referral",
    "purpose": "回饋點數總覽",
    "defaultText": "回饋點數總覽",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.7dc7d454e0",
    "group": "referral",
    "purpose": "累計回饋",
    "defaultText": "累計回饋",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.aaf98411db",
    "group": "referral",
    "purpose": "已入帳＋有效待入帳",
    "defaultText": "已入帳＋有效待入帳",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.761dfcd646",
    "group": "referral",
    "purpose": "本月已入帳",
    "defaultText": "本月已入帳",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.d6dee35436",
    "group": "referral",
    "purpose": "會員／推薦回饋本月正式發放",
    "defaultText": "會員／推薦回饋本月正式發放",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.4b94fc68fd",
    "group": "referral",
    "purpose": "推薦回饋如何計算？",
    "defaultText": "推薦回饋如何計算？",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.710b7c9cbe",
    "group": "referral",
    "purpose": "加入推薦團隊不等於立即產生回饋；仍須依活動、消費與成功取貨條件判定。",
    "defaultText": "加入推薦團隊不等於立即產生回饋；仍須依活動、消費與成功取貨條件判定。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.7631502fb3",
    "group": "referral",
    "purpose": "回饋明細",
    "defaultText": "回饋明細",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.e2e8a2bbcc",
    "group": "referral",
    "purpose": "查看推廣零售、推薦與自己消費所產生的回饋與入帳狀態。",
    "defaultText": "查看推廣零售、推薦與自己消費所產生的回饋與入帳狀態。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.tooltip.056fffd4bf",
    "group": "referral",
    "purpose": "回饋紀錄篩選",
    "defaultText": "回饋紀錄篩選",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.778fc8f994",
    "group": "referral",
    "purpose": "全部",
    "defaultText": "全部",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.tooltip.17078f9678",
    "group": "referral",
    "purpose": "依推薦代數篩選",
    "defaultText": "依推薦代數篩選",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.da3eb7ffe6",
    "group": "referral",
    "purpose": "全部代數",
    "defaultText": "全部代數",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.dae828fe4f",
    "group": "referral",
    "purpose": "第",
    "defaultText": "第",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.tooltip.a4d02f9a56",
    "group": "referral",
    "purpose": "回饋紀錄",
    "defaultText": "回饋紀錄",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.e370c60b3d",
    "group": "referral",
    "purpose": "商品 …",
    "defaultText": "商品 {value1}",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.referral.description.f8ec4556e8",
    "group": "referral",
    "purpose": "最近 … 天累積…達 …。",
    "defaultText": "最近 {windowDays} 天累積{value2}達 {requiredPoints}。",
    "tokens": {
      "windowDays": "原資格累積期間天數",
      "value2": "原畫面提供的顯示值；不能在文案中修改計算",
      "requiredPoints": "現有資格門檻顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.referral.description.3696ffe6c4",
    "group": "referral",
    "purpose": "有效定期配送會員最近 … 天累積…達 …。",
    "defaultText": "有效定期配送會員最近 {windowDays} 天累積{value2}達 {requiredPoints}。",
    "tokens": {
      "windowDays": "原資格累積期間天數",
      "value2": "原畫面提供的顯示值；不能在文案中修改計算",
      "requiredPoints": "現有資格門檻顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.referral.description.590ad08f26",
    "group": "referral",
    "purpose": "需同時符合一般會員最近 … 天累積…達 …，以及有效定期配送會員最近 … 天累積…達 …。",
    "defaultText": "需同時符合一般會員最近 {windowDays} 天累積{value2}達 {requiredPoints}，以及有效定期配送會員最近 {windowDays4} 天累積{value5}達 {requiredPoints6}。",
    "tokens": {
      "windowDays": "原資格累積期間天數",
      "value2": "原畫面提供的顯示值；不能在文案中修改計算",
      "requiredPoints": "現有資格門檻顯示值",
      "windowDays4": "原畫面提供的顯示值；不能在文案中修改計算",
      "value5": "原畫面提供的顯示值；不能在文案中修改計算",
      "requiredPoints6": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": true
  },
  {
    "key": "member.referral.description.d338d2208f",
    "group": "referral",
    "purpose": "一般會員最近 … 天累積…達 …，或有效定期配送會員最近 … 天累積…達 …，任一條件符合即可。",
    "defaultText": "一般會員最近 {windowDays} 天累積{value2}達 {requiredPoints}，或有效定期配送會員最近 {windowDays4} 天累積{value5}達 {requiredPoints6}，任一條件符合即可。",
    "tokens": {
      "windowDays": "原資格累積期間天數",
      "value2": "原畫面提供的顯示值；不能在文案中修改計算",
      "requiredPoints": "現有資格門檻顯示值",
      "windowDays4": "原畫面提供的顯示值；不能在文案中修改計算",
      "value5": "原畫面提供的顯示值；不能在文案中修改計算",
      "requiredPoints6": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": true
  },
  {
    "key": "member.referral.qualification.6d672bbde2",
    "group": "referral",
    "purpose": "推廣零售回饋不需推薦資格；訂單完成後進入安全等待。",
    "defaultText": "推廣零售回饋不需推薦資格；訂單完成後進入安全等待。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.9890baca75",
    "group": "referral",
    "purpose": "本筆已完成正式入帳。",
    "defaultText": "本筆已完成正式入帳。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.qualification.0f87b093ab",
    "group": "referral",
    "purpose": "本人消費回饋不需推薦資格。",
    "defaultText": "本人消費回饋不需推薦資格。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.qualification.b0a2ab4719",
    "group": "referral",
    "purpose": "本筆已由有效推薦資格涵蓋 ✓",
    "defaultText": "本筆已由有效推薦資格涵蓋 ✓",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.qualification.7763aec47e",
    "group": "referral",
    "purpose": "本筆推薦資格已確認 ✓",
    "defaultText": "本筆推薦資格已確認 ✓",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.qualification.81110e401b",
    "group": "referral",
    "purpose": "本筆回饋資格期限已結束。",
    "defaultText": "本筆回饋資格期限已結束。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.qualification.550d7a2f49",
    "group": "referral",
    "purpose": "尚待取得推薦回饋資格。",
    "defaultText": "尚待取得推薦回饋資格。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.843d319901",
    "group": "referral",
    "purpose": "待系統入帳",
    "defaultText": "待系統入帳",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.02b679429d",
    "group": "referral",
    "purpose": "安全等待",
    "defaultText": "安全等待",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.728376b9cc",
    "group": "referral",
    "purpose": "回饋產生",
    "defaultText": "回饋產生",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.9ca88defb0",
    "group": "referral",
    "purpose": "訂單完成",
    "defaultText": "訂單完成",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.21abfe5d16",
    "group": "referral",
    "purpose": "正式入帳",
    "defaultText": "正式入帳",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.qualification.5f869d977f",
    "group": "referral",
    "purpose": "資格確認",
    "defaultText": "資格確認",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.qualification.066c7ec739",
    "group": "referral",
    "purpose": "等待資格",
    "defaultText": "等待資格",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.emptyState.b71404cdb6",
    "group": "referral",
    "purpose": "沒有符合目前篩選條件的回饋紀錄",
    "defaultText": "沒有符合目前篩選條件的回饋紀錄",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.button.64d6eec1cf",
    "group": "referral",
    "purpose": "可切換狀態或代數查看其他紀錄。",
    "defaultText": "可切換狀態或代數查看其他紀錄。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.tooltip.2a023bc810",
    "group": "referral",
    "purpose": "推薦回饋分頁",
    "defaultText": "推薦回饋分頁",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.d1bf40b0d2",
    "group": "referral",
    "purpose": "上一頁",
    "defaultText": "上一頁",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.d04825997b",
    "group": "referral",
    "purpose": "頁",
    "defaultText": "頁",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.d44baa5198",
    "group": "referral",
    "purpose": "下一頁",
    "defaultText": "下一頁",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.emptyState.82aaf191ea",
    "group": "referral",
    "purpose": "目前還沒有推薦回饋紀錄",
    "defaultText": "目前還沒有推薦回饋紀錄",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.f8ed05c62f",
    "group": "referral",
    "purpose": "推薦會員產生符合規則的有效消費後，回饋紀錄會顯示在這裡。",
    "defaultText": "推薦會員產生符合規則的有效消費後，回饋紀錄會顯示在這裡。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.af6932a69a",
    "group": "referral",
    "purpose": "人 · 團隊",
    "defaultText": "人 · 團隊",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.272014d0f2",
    "group": "referral",
    "purpose": "新訂單",
    "defaultText": "新訂單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.button.6393d05d17",
    "group": "referral",
    "purpose": "查看 ›",
    "defaultText": "查看 ›",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.f21e6840ae",
    "group": "referral",
    "purpose": "新訂單 0",
    "defaultText": "新訂單 0",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.ece5e4b637",
    "group": "referral",
    "purpose": "本週期",
    "defaultText": "本週期",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.button.b42ba1d9c0",
    "group": "referral",
    "purpose": "查看他的組織圖 ›",
    "defaultText": "查看他的組織圖 ›",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.emptyState.51497bddc6",
    "group": "referral",
    "purpose": "目前沒有下線",
    "defaultText": "目前沒有下線",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.tooltip.926f6c9525",
    "group": "referral",
    "purpose": "關閉新訂單明細",
    "defaultText": "關閉新訂單明細",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.a31766c94e",
    "group": "referral",
    "purpose": "NEW ORDERS",
    "defaultText": "NEW ORDERS",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.e15a25f681",
    "group": "referral",
    "purpose": "的新訂單",
    "defaultText": "的新訂單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.ad0ac7044e",
    "group": "referral",
    "purpose": "近 30 日共",
    "defaultText": "近 30 日共",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.6dd2081e40",
    "group": "referral",
    "purpose": "筆；內容直接讀取既有訂單與回饋紀錄。",
    "defaultText": "筆；內容直接讀取既有訂單與回饋紀錄。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.tooltip.ddc05404b0",
    "group": "referral",
    "purpose": "關閉",
    "defaultText": "關閉",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.7451f569a6",
    "group": "referral",
    "purpose": "會員消費回饋",
    "defaultText": "會員消費回饋",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.tooltip.2bba4d89b2",
    "group": "referral",
    "purpose": "關閉推薦組織圖",
    "defaultText": "關閉推薦組織圖",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.button.2f41fba088",
    "group": "referral",
    "purpose": "← 返回推薦",
    "defaultText": "← 返回推薦",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.6f99c18e8e",
    "group": "referral",
    "purpose": "REFERRAL ORGANIZATION",
    "defaultText": "REFERRAL ORGANIZATION",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.ac00cedafd",
    "group": "referral",
    "purpose": "推薦組織圖",
    "defaultText": "推薦組織圖",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.ea56f3266f",
    "group": "referral",
    "purpose": "顯示 3 代內",
    "defaultText": "顯示 3 代內",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.button.126dae6f9c",
    "group": "referral",
    "purpose": "點擊有下線的會員，即可以他為最上層重新查看下一個三代組織。",
    "defaultText": "點擊有下線的會員，即可以他為最上層重新查看下一個三代組織。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.tooltip.64e46b94f2",
    "group": "referral",
    "purpose": "推薦組織圖摘要",
    "defaultText": "推薦組織圖摘要",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.b99cda9585",
    "group": "referral",
    "purpose": "我的推薦成員",
    "defaultText": "我的推薦成員",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.b5a2132d42",
    "group": "referral",
    "purpose": "近 30 日有效訂單",
    "defaultText": "近 30 日有效訂單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.bb0b81e3c9",
    "group": "referral",
    "purpose": "依正式回饋紀錄",
    "defaultText": "依正式回饋紀錄",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.0b67b01f4b",
    "group": "referral",
    "purpose": "本週期入帳",
    "defaultText": "本週期入帳",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.2fc429d2d5",
    "group": "referral",
    "purpose": "我的組織圖 · …",
    "defaultText": "我的組織圖 · {value1}",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.referral.label.0fb52490f9",
    "group": "referral",
    "purpose": "收合摘要",
    "defaultText": "收合摘要",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.c12776c70a",
    "group": "referral",
    "purpose": "展開摘要",
    "defaultText": "展開摘要",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.98bb63d2e2",
    "group": "referral",
    "purpose": "⌂ 回到我的組織圖",
    "defaultText": "⌂ 回到我的組織圖",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.tooltip.4b944e3e3b",
    "group": "referral",
    "purpose": "組織圖縮放",
    "defaultText": "組織圖縮放",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.tooltip.7e4b258bfa",
    "group": "referral",
    "purpose": "縮小",
    "defaultText": "縮小",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.tooltip.d7f48a059c",
    "group": "referral",
    "purpose": "放大",
    "defaultText": "放大",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.587046034d",
    "group": "referral",
    "purpose": "適合畫面",
    "defaultText": "適合畫面",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.1a554318c8",
    "group": "referral",
    "purpose": "拖曳移動畫布 · 滾輪或雙指縮放",
    "defaultText": "拖曳移動畫布 · 滾輪或雙指縮放",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.reward.10812e4930",
    "group": "referral",
    "purpose": "新訂單／回饋數字僅顯示既有會員與回饋資料，不另行計算。",
    "defaultText": "新訂單／回饋數字僅顯示既有會員與回饋資料，不另行計算。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.navigation.label.e1050a2800",
    "group": "navigation",
    "purpose": "總覽",
    "defaultText": "總覽",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.navigation.label.728928ed7d",
    "group": "navigation",
    "purpose": "帳戶",
    "defaultText": "帳戶",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.navigation.label.b6e8d4b718",
    "group": "navigation",
    "purpose": "配送",
    "defaultText": "配送",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.navigation.label.59fcdacba3",
    "group": "navigation",
    "purpose": "訂單",
    "defaultText": "訂單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.navigation.tooltip.4ed5f73a74",
    "group": "navigation",
    "purpose": "會員中心導覽",
    "defaultText": "會員中心導覽",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.navigation.tooltip.a440b76676",
    "group": "navigation",
    "purpose": "會員中心功能",
    "defaultText": "會員中心功能",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.navigation.label.fdf1f080a3",
    "group": "navigation",
    "purpose": "首頁",
    "defaultText": "首頁",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.reward.822a7a426d",
    "group": "subscription",
    "purpose": "等待首次取貨",
    "defaultText": "等待首次取貨",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.50d5bae029",
    "group": "subscription",
    "purpose": "定期配送啟用中",
    "defaultText": "定期配送啟用中",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.6f069bb7bf",
    "group": "subscription",
    "purpose": "定期配送已暫停",
    "defaultText": "定期配送已暫停",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.89d100c9bc",
    "group": "subscription",
    "purpose": "定期配送已停止",
    "defaultText": "定期配送已停止",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.5e678bd394",
    "group": "subscription",
    "purpose": "尚未選擇商品",
    "defaultText": "尚未選擇商品",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.66897aeca0",
    "group": "subscription",
    "purpose": "尚未選擇門市",
    "defaultText": "尚未選擇門市",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.description.99511e85d3",
    "group": "subscription",
    "purpose": "…｜…｜每 … 天｜…",
    "defaultText": "{value1}｜{value2}｜每 {value3} 天｜{value4}",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算",
      "value2": "原畫面提供的顯示值；不能在文案中修改計算",
      "value3": "原畫面提供的顯示值；不能在文案中修改計算",
      "value4": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.label.1b2d52e86d",
    "group": "subscription",
    "purpose": "數量必須是 1 到 12。",
    "defaultText": "數量必須是 1 到 12。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.7aed94250d",
    "group": "subscription",
    "purpose": "原耳掛商品或 SKU 已無法供應，請選擇新的耳掛規格。",
    "defaultText": "原耳掛商品或 SKU 已無法供應，請選擇新的耳掛規格。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.ede36d5752",
    "group": "subscription",
    "purpose": "咖啡豆組合不完整。",
    "defaultText": "咖啡豆組合不完整。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.3219720245",
    "group": "subscription",
    "purpose": "請選擇正確的專屬烘焙度。",
    "defaultText": "請選擇正確的專屬烘焙度。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.1510ce5e4a",
    "group": "subscription",
    "purpose": "原咖啡豆商品或 SKU 已無法供應，請選擇新的咖啡豆規格。",
    "defaultText": "原咖啡豆商品或 SKU 已無法供應，請選擇新的咖啡豆規格。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.4e3e376a03",
    "group": "subscription",
    "purpose": "已無法供應的耳掛商品 × …",
    "defaultText": "已無法供應的耳掛商品 × {value1}",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.label.593ef5a6f6",
    "group": "subscription",
    "purpose": "已無法供應的咖啡豆",
    "defaultText": "已無法供應的咖啡豆",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.4c61bd252f",
    "group": "subscription",
    "purpose": "咖啡豆",
    "defaultText": "咖啡豆",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.537b4f6dc0",
    "group": "subscription",
    "purpose": "・專屬烘焙：…",
    "defaultText": "・專屬烘焙：{value1}",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.label.334b951894",
    "group": "subscription",
    "purpose": "一磅",
    "defaultText": "一磅",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.029bb8518e",
    "group": "subscription",
    "purpose": "半磅",
    "defaultText": "半磅",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.b40d17356f",
    "group": "subscription",
    "purpose": "訂單取消，抵用金已返還",
    "defaultText": "訂單取消，{creditName}已返還",
    "tokens": {"creditName": "共用顯示名稱；取自抵用金統一顯示名稱設定"},
    "multiline": false
  },
  {
    "key": "member.subscription.label.6408880e24",
    "group": "subscription",
    "purpose": "本筆已保留折抵",
    "defaultText": "本筆已保留折抵",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.e3e713f72e",
    "group": "subscription",
    "purpose": "本筆已使用",
    "defaultText": "本筆已使用",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.8f596fb788",
    "group": "subscription",
    "purpose": "定期配送已暫停。",
    "defaultText": "定期配送已暫停。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.194a8dfd1b",
    "group": "subscription",
    "purpose": "定期配送已恢復。下一次配送日期：…。",
    "defaultText": "定期配送已恢復。下一次配送日期：{date}。",
    "tokens": {
      "date": "原系統日期顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.label.eb671b1099",
    "group": "subscription",
    "purpose": "定期配送已重新啟動。下一次配送日期：…。",
    "defaultText": "定期配送已重新啟動。下一次配送日期：{date}。",
    "tokens": {
      "date": "原系統日期顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.label.191219b726",
    "group": "subscription",
    "purpose": "已跳過 … 本次配送。",
    "defaultText": "已跳過 {date} 本次配送。",
    "tokens": {
      "date": "原系統日期顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.label.f37d99b914",
    "group": "subscription",
    "purpose": "已跳過本次配送。",
    "defaultText": "已跳過本次配送。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.d8fc14bd73",
    "group": "subscription",
    "purpose": "…下一次配送日期：…。",
    "defaultText": "{value1}下一次配送日期：{date}。",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算",
      "date": "原系統日期顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.button.223644c274",
    "group": "subscription",
    "purpose": "…下一次配送安排尚待確認。",
    "defaultText": "{value1}下一次配送安排尚待確認。",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.label.8edfbf0e43",
    "group": "subscription",
    "purpose": "下一次配送日期已更新。新的配送日期：…。",
    "defaultText": "下一次配送日期已更新。新的配送日期：{date}。",
    "tokens": {
      "date": "原系統日期顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.label.94667b77d9",
    "group": "subscription",
    "purpose": "未來定期配送的取貨方式已更新。",
    "defaultText": "未來定期配送的取貨方式已更新。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.f91e3a39f1",
    "group": "subscription",
    "purpose": "補貨安排已建立。預計配送日期：…。",
    "defaultText": "補貨安排已建立。預計配送日期：{date}。",
    "tokens": {
      "date": "原系統日期顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.button.74b0589abb",
    "group": "subscription",
    "purpose": "定期配送已取消／停止；目前已建立的訂單不會自動取消。",
    "defaultText": "定期配送已取消／停止；目前已建立的訂單不會自動取消。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.0c6b3a65fb",
    "group": "subscription",
    "purpose": "已從我的定期配送移除。歷史訂單與紀錄仍會保留。",
    "defaultText": "已從我的定期配送移除。歷史訂單與紀錄仍會保留。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.6d6cb2f85d",
    "group": "subscription",
    "purpose": "下一次配送內容已更新。",
    "defaultText": "下一次配送內容已更新。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.196e9ec3f0",
    "group": "subscription",
    "purpose": "定期配送安排已更新。",
    "defaultText": "定期配送安排已更新。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.3431d1d85c",
    "group": "subscription",
    "purpose": "一般價",
    "defaultText": "一般價",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.d17c49a56e",
    "group": "subscription",
    "purpose": "定期購價",
    "defaultText": "定期購價",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.5874347b85",
    "group": "subscription",
    "purpose": "一磅組合",
    "defaultText": "一磅組合",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.d96d8235aa",
    "group": "subscription",
    "purpose": "本商品 ×",
    "defaultText": "本商品 ×",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.e56cdacfdb",
    "group": "subscription",
    "purpose": "目前定期購價格",
    "defaultText": "目前定期購價格",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.3939c7527b",
    "group": "subscription",
    "purpose": "… 折",
    "defaultText": "{percentage} 折",
    "tokens": {
      "percentage": "原比例顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.label.5e90a074ab",
    "group": "subscription",
    "purpose": "其他：…",
    "defaultText": "其他：{value1}",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.label.223fb3c8fb",
    "group": "subscription",
    "purpose": "操作未完成",
    "defaultText": "操作未完成",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.f45622cd39",
    "group": "subscription",
    "purpose": "操作未完成，請再試一次。",
    "defaultText": "操作未完成，請再試一次。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.6d05adf73e",
    "group": "subscription",
    "purpose": "無法更新最新配送安排",
    "defaultText": "無法更新最新配送安排",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.f8320833ac",
    "group": "subscription",
    "purpose": "尚未選擇",
    "defaultText": "尚未選擇",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.e4d107d021",
    "group": "subscription",
    "purpose": "取貨",
    "defaultText": "取貨",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.2ca355d4bf",
    "group": "subscription",
    "purpose": "目前一磅只開放同款 A+A 組合，請重新選擇第二款咖啡。",
    "defaultText": "目前一磅只開放同款 A+A 組合，請重新選擇第二款咖啡。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.30373a7e1e",
    "group": "subscription",
    "purpose": "下一次配送日期已更新為目前最早可選的 …。",
    "defaultText": "下一次配送日期已更新為目前最早可選的 {date}。",
    "tokens": {
      "date": "原系統日期顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.button.db8ff3ff5d",
    "group": "subscription",
    "purpose": "請填寫其他取消原因。",
    "defaultText": "請填寫其他取消原因。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.111d1bdf5a",
    "group": "subscription",
    "purpose": "請選擇取消本次配送的原因。",
    "defaultText": "請選擇取消本次配送的原因。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.e94e895267",
    "group": "subscription",
    "purpose": "取消申請未完成",
    "defaultText": "取消申請未完成",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.3d5030ccbd",
    "group": "subscription",
    "purpose": "取消處理已送出；請以重新整理後的訂單狀態為準。",
    "defaultText": "取消處理已送出；請以重新整理後的訂單狀態為準。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.reward.5798cd7bbd",
    "group": "subscription",
    "purpose": "… 未來定期配送已停止；本次配送仍需等待物流單作廢確認。",
    "defaultText": "{value1} 未來定期配送已停止；本次配送仍需等待物流單作廢確認。",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.button.703ad13cf1",
    "group": "subscription",
    "purpose": "本次配送已取消，未來定期配送也已停止。",
    "defaultText": "本次配送已取消，未來定期配送也已停止。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.56d3a76372",
    "group": "subscription",
    "purpose": "… 物流單作廢確認前，尚未變更下一次配送日期。",
    "defaultText": "{value1} 物流單作廢確認前，尚未變更下一次配送日期。",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.button.b30a02ff1e",
    "group": "subscription",
    "purpose": "本次配送已取消，定期配送保留。下一次配送日期：…。",
    "defaultText": "本次配送已取消，定期配送保留。下一次配送日期：{date}。",
    "tokens": {
      "date": "原系統日期顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.button.fc846b90db",
    "group": "subscription",
    "purpose": "本次配送已成功取消，但下一次配送日期未能更新：…。請重新選擇下一次配送日期。",
    "defaultText": "本次配送已成功取消，但下一次配送日期未能更新：{value1}。請重新選擇下一次配送日期。",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.button.2a22d55191",
    "group": "subscription",
    "purpose": "本次配送已成功取消，但未來定期配送未能停止：…。請再試一次。",
    "defaultText": "本次配送已成功取消，但未來定期配送未能停止：{value1}。請再試一次。",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.button.3b0eb3360c",
    "group": "subscription",
    "purpose": "本次配送已成功取消，但最新畫面未能更新：…。請重新整理頁面。",
    "defaultText": "本次配送已成功取消，但最新畫面未能更新：{value1}。請重新整理頁面。",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.label.9e5e16bfda",
    "group": "subscription",
    "purpose": "SUBSCRIPTION",
    "defaultText": "SUBSCRIPTION",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.title",
    "group": "subscription",
    "purpose": "我的定期配送",
    "defaultText": "我的定期配送",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.125377920f",
    "group": "subscription",
    "purpose": "首次取貨完成後，啟動定期配送",
    "defaultText": "首次取貨完成後，啟動定期配送",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.5e12281d1f",
    "group": "subscription",
    "purpose": "下次配送日期",
    "defaultText": "下次配送日期",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.emptyState.fe155b084b",
    "group": "subscription",
    "purpose": "還沒有定期配送",
    "defaultText": "還沒有定期配送",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.description.7a6055b514",
    "group": "subscription",
    "purpose": "第一次購買時可勾選加入。首筆仍是原價，成功取貨後才會開始定期配送並享有優惠。",
    "defaultText": "第一次購買時可勾選加入。首筆仍是原價，成功取貨後才會開始定期配送並享有優惠。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.35f0a757ed",
    "group": "subscription",
    "purpose": "挑選咖啡作品",
    "defaultText": "挑選咖啡作品",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.292c968262",
    "group": "subscription",
    "purpose": "選擇定期配送",
    "defaultText": "選擇定期配送",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.d28052e940",
    "group": "subscription",
    "purpose": "每筆定期配送分開保存；切換後可查看各自狀態與安排。",
    "defaultText": "每筆定期配送分開保存；切換後可查看各自狀態與安排。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.2a3c1fefce",
    "group": "subscription",
    "purpose": "配送週期",
    "defaultText": "配送週期",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.7757f7570e",
    "group": "subscription",
    "purpose": "每",
    "defaultText": "每",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.c3304d1e49",
    "group": "subscription",
    "purpose": "天",
    "defaultText": "天",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.64564225d2",
    "group": "subscription",
    "purpose": "下次安排",
    "defaultText": "下次安排",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.e9797bcb92",
    "group": "subscription",
    "purpose": "首筆取貨後安排",
    "defaultText": "首筆取貨後安排",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.aa419646d6",
    "group": "subscription",
    "purpose": "配送方式",
    "defaultText": "配送方式",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.166967f6db",
    "group": "subscription",
    "purpose": "宅配・…・…",
    "defaultText": "宅配・{value1}・{value2}",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算",
      "value2": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.button.0b17d89de2",
    "group": "subscription",
    "purpose": "地址待確認",
    "defaultText": "地址待確認",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.4792fb7c82",
    "group": "subscription",
    "purpose": "貨到付款",
    "defaultText": "貨到付款",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.ea49b01f29",
    "group": "subscription",
    "purpose": "ATM 轉帳",
    "defaultText": "ATM 轉帳",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.215d63b784",
    "group": "subscription",
    "purpose": "下一次商品",
    "defaultText": "下一次商品",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.9475320eef",
    "group": "subscription",
    "purpose": "修改截止",
    "defaultText": "修改截止",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.a6cf84b8de",
    "group": "subscription",
    "purpose": "啟動後顯示",
    "defaultText": "啟動後顯示",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.8fca5aa10a",
    "group": "subscription",
    "purpose": "本期應付",
    "defaultText": "本期應付",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.028830cdf6",
    "group": "subscription",
    "purpose": "預估應付",
    "defaultText": "預估應付",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.2c7419430e",
    "group": "subscription",
    "purpose": "啟動後計算",
    "defaultText": "啟動後計算",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.695bc7a3fa",
    "group": "subscription",
    "purpose": "一般購買",
    "defaultText": "一般購買",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.9189a0e72a",
    "group": "subscription",
    "purpose": "→ 定期購預估",
    "defaultText": "→ 定期購預估",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.c11954f2ab",
    "group": "subscription",
    "purpose": "商品優惠省",
    "defaultText": "商品優惠省",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.3bafb5b9a4",
    "group": "subscription",
    "purpose": " ＋ 配送優惠省 …",
    "defaultText": " ＋ 配送優惠省 {creditAmount}",
    "tokens": {
      "creditAmount": "原金額顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.label.4709bbddb3",
    "group": "subscription",
    "purpose": "＝ 本期共省",
    "defaultText": "＝ 本期共省",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.d05b418809",
    "group": "subscription",
    "purpose": "查看金額明細",
    "defaultText": "查看金額明細",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.47fb4e4847",
    "group": "subscription",
    "purpose": "目前配送安排",
    "defaultText": "目前配送安排",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.53d7751431",
    "group": "subscription",
    "purpose": "立即補貨",
    "defaultText": "立即補貨",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.b1453cedfe",
    "group": "subscription",
    "purpose": "訂單：",
    "defaultText": "訂單：",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.reward.31a0abf29e",
    "group": "subscription",
    "purpose": "狀態：等待建立訂單",
    "defaultText": "狀態：等待建立訂單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.c7c7d81482",
    "group": "subscription",
    "purpose": "預計建立訂單：",
    "defaultText": "預計建立訂單：",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.964f464280",
    "group": "subscription",
    "purpose": "目前不會自動建立下一張訂單",
    "defaultText": "目前不會自動建立下一張訂單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.description.a2bebf5a58",
    "group": "subscription",
    "purpose": "等首筆原價訂單成功取貨後，才會正式啟動。 啟動後第一次定期配送起享",
    "defaultText": "等首筆原價訂單成功取貨後，才會正式啟動。 啟動後第一次定期配送起享",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.f50cea048c",
    "group": "subscription",
    "purpose": "定期購優惠。",
    "defaultText": "定期購優惠。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.6403eae2ee",
    "group": "subscription",
    "purpose": "如果您已經不需要定期配送，可以現在取消。 取消不會影響目前這張首筆訂單。",
    "defaultText": "如果您已經不需要定期配送，可以現在取消。 取消不會影響目前這張首筆訂單。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.c6dbdbddc5",
    "group": "subscription",
    "purpose": "取消這個定期配送設定",
    "defaultText": "取消這個定期配送設定",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.2ed345b39b",
    "group": "subscription",
    "purpose": "此定期配送已停止",
    "defaultText": "此定期配送已停止",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.e83e22fe5f",
    "group": "subscription",
    "purpose": "想繼續配送嗎？選擇下一次配送日期後即可重新啟動。",
    "defaultText": "想繼續配送嗎？選擇下一次配送日期後即可重新啟動。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.8ad2cf5440",
    "group": "subscription",
    "purpose": "重新啟動定期配送",
    "defaultText": "重新啟動定期配送",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.7034511115",
    "group": "subscription",
    "purpose": "下一次配送日期",
    "defaultText": "下一次配送日期",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.277f489ba3",
    "group": "subscription",
    "purpose": "最早可選：",
    "defaultText": "最早可選：",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.a157967a47",
    "group": "subscription",
    "purpose": "自訂天數",
    "defaultText": "自訂天數",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.5dcf8cae02",
    "group": "subscription",
    "purpose": "自訂配送週期",
    "defaultText": "自訂配送週期",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.d819f53ddb",
    "group": "subscription",
    "purpose": "可設定",
    "defaultText": "可設定",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.d051be6685",
    "group": "subscription",
    "purpose": "商品：",
    "defaultText": "商品：",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.e93a4d3b18",
    "group": "subscription",
    "purpose": "配送方式：",
    "defaultText": "配送方式：",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.11d0241540",
    "group": "subscription",
    "purpose": "返回",
    "defaultText": "返回",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.0123ba2e5a",
    "group": "subscription",
    "purpose": "確認重新啟動",
    "defaultText": "確認重新啟動",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.62b959da1d",
    "group": "subscription",
    "purpose": "查看其他定期配送",
    "defaultText": "查看其他定期配送",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.ca9a06d47f",
    "group": "subscription",
    "purpose": "刪除這筆已停止的定期配送",
    "defaultText": "刪除這筆已停止的定期配送",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.841216572d",
    "group": "subscription",
    "purpose": "取消本次配送",
    "defaultText": "取消本次配送",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.56b6215615",
    "group": "subscription",
    "purpose": "取消本次配送與停止未來定期配送是兩件不同的事。請明確選擇要處理的範圍。",
    "defaultText": "取消本次配送與停止未來定期配送是兩件不同的事。請明確選擇要處理的範圍。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.a7e447a603",
    "group": "subscription",
    "purpose": "取消原因",
    "defaultText": "取消原因",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.9920d1d476",
    "group": "subscription",
    "purpose": "請選擇取消原因",
    "defaultText": "請選擇取消原因",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.hint.7b11aadcbd",
    "group": "subscription",
    "purpose": "單純想取消",
    "defaultText": "單純想取消",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.hint.88e31b8bc4",
    "group": "subscription",
    "purpose": "行程／取貨時間不方便",
    "defaultText": "行程／取貨時間不方便",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.hint.0693b339c6",
    "group": "subscription",
    "purpose": "咖啡還沒喝完，暫時不需要",
    "defaultText": "咖啡還沒喝完，暫時不需要",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.hint.45539f7552",
    "group": "subscription",
    "purpose": "想更換咖啡／數量／烘焙度",
    "defaultText": "想更換咖啡／數量／烘焙度",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.hint.a9ce78177c",
    "group": "subscription",
    "purpose": "重複下單或誤操作",
    "defaultText": "重複下單或誤操作",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.hint.2df5392217",
    "group": "subscription",
    "purpose": "預算考量",
    "defaultText": "預算考量",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.hint.1a26edf94a",
    "group": "subscription",
    "purpose": "其他",
    "defaultText": "其他",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.2e129a58fb",
    "group": "subscription",
    "purpose": "其他取消原因",
    "defaultText": "其他取消原因",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.hint.1574401e26",
    "group": "subscription",
    "purpose": "請簡單告訴我們取消原因",
    "defaultText": "請簡單告訴我們取消原因",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.1285838880",
    "group": "subscription",
    "purpose": "只取消本次配送",
    "defaultText": "只取消本次配送",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.8845af8b1d",
    "group": "subscription",
    "purpose": "取消本次配送，並停止之後的定期配送",
    "defaultText": "取消本次配送，並停止之後的定期配送",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.2e325149ab",
    "group": "subscription",
    "purpose": "保留定期配送時的下一次配送日期",
    "defaultText": "保留定期配送時的下一次配送日期",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.8c4fd820dc",
    "group": "subscription",
    "purpose": "取消本次配送，保留定期配送並更新下次日期",
    "defaultText": "取消本次配送，保留定期配送並更新下次日期",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.db97c0f0a9",
    "group": "subscription",
    "purpose": "若此訂單已建立 7-ELEVEN 寄件資訊，送出後只是取消申請；KD Coffee 確認寄件單作廢前，訂單不會顯示為已取消，也不會回補庫存。",
    "defaultText": "若此訂單已建立 7-ELEVEN 寄件資訊，送出後只是取消申請；KD Coffee 確認寄件單作廢前，訂單不會顯示為已取消，也不會回補庫存。",
    "tokens": {},
    "multiline": true
  },
  {
    "key": "member.subscription.label.7e2483a656",
    "group": "subscription",
    "purpose": "調整下一次日期",
    "defaultText": "調整下一次日期",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.fc25b1a603",
    "group": "subscription",
    "purpose": "本期含專屬烘焙；距配送不足 … 天時會先顯示提醒，但仍可確認送出。",
    "defaultText": "本期含專屬烘焙；距配送不足 {value1} 天時會先顯示提醒，但仍可確認送出。",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.label.53497fed45",
    "group": "subscription",
    "purpose": "最早可配送日為 …。",
    "defaultText": "最早可配送日為 {date}。",
    "tokens": {
      "date": "原系統日期顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.description.eeaaf8d45b",
    "group": "subscription",
    "purpose": "選好日期後，請決定只套用本次，或讓之後的定期購也從新日期重新計算。",
    "defaultText": "選好日期後，請決定只套用本次，或讓之後的定期購也從新日期重新計算。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.b0547aaea6",
    "group": "subscription",
    "purpose": " 本期還可修改 … 次。",
    "defaultText": " 本期還可修改 {value1} 次。",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.subscription.label.231771fa50",
    "group": "subscription",
    "purpose": "新的配送日期",
    "defaultText": "新的配送日期",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.97ea640ded",
    "group": "subscription",
    "purpose": "新建立訂單日與修改截止日會在確認後依目前營運規則重新計算。",
    "defaultText": "新建立訂單日與修改截止日會在確認後依目前營運規則重新計算。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.f196f22734",
    "group": "subscription",
    "purpose": "只套用這一次",
    "defaultText": "只套用這一次",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.a50674459e",
    "group": "subscription",
    "purpose": "之後也從新日期重新計算",
    "defaultText": "之後也從新日期重新計算",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.d79295572a",
    "group": "subscription",
    "purpose": "提前",
    "defaultText": "提前",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.fa9c9022b4",
    "group": "subscription",
    "purpose": "延後",
    "defaultText": "延後",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.0731405bb9",
    "group": "subscription",
    "purpose": "跳過這一次",
    "defaultText": "跳過這一次",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.71e0a27e71",
    "group": "subscription",
    "purpose": "只跳過",
    "defaultText": "只跳過",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.d047389c7e",
    "group": "subscription",
    "purpose": "這一次。",
    "defaultText": "這一次。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.7954e3c3e2",
    "group": "subscription",
    "purpose": "確認跳過",
    "defaultText": "確認跳過",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.1e51c526ee",
    "group": "subscription",
    "purpose": "調整下一次配送商品",
    "defaultText": "調整下一次配送商品",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.description.fbf101eae9",
    "group": "subscription",
    "purpose": "可調整下一次配送的商品、數量與咖啡豆烘焙設定。變更只套用目前這一期，除非現有產品流程明確另有規則。",
    "defaultText": "可調整下一次配送的商品、數量與咖啡豆烘焙設定。變更只套用目前這一期，除非現有產品流程明確另有規則。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.e983619991",
    "group": "subscription",
    "purpose": "本期已達修改次數上限，無法再調整商品。",
    "defaultText": "本期已達修改次數上限，無法再調整商品。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.c45ac196b5",
    "group": "subscription",
    "purpose": "SUBSCRIPTION ITEM",
    "defaultText": "SUBSCRIPTION ITEM",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.004922066e",
    "group": "subscription",
    "purpose": "商品",
    "defaultText": "商品",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.20f8847400",
    "group": "subscription",
    "purpose": "目前規則未開放增減商品數量",
    "defaultText": "目前規則未開放增減商品數量",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.8da5cf2a4e",
    "group": "subscription",
    "purpose": "移除此商品",
    "defaultText": "移除此商品",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.7ed6aae42d",
    "group": "subscription",
    "purpose": "商品類型",
    "defaultText": "商品類型",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.1a10cd160d",
    "group": "subscription",
    "purpose": "耳掛咖啡",
    "defaultText": "耳掛咖啡",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.43a166ff56",
    "group": "subscription",
    "purpose": "規格",
    "defaultText": "規格",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.b90358f2fe",
    "group": "subscription",
    "purpose": "一磅（兩個半磅組合）",
    "defaultText": "一磅（兩個半磅組合）",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.204ac40adb",
    "group": "subscription",
    "purpose": "第一款半磅咖啡",
    "defaultText": "第一款半磅咖啡",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.fec3278317",
    "group": "subscription",
    "purpose": "第二款半磅咖啡",
    "defaultText": "第二款半磅咖啡",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.5509a760b2",
    "group": "subscription",
    "purpose": "半磅咖啡",
    "defaultText": "半磅咖啡",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.a20126024c",
    "group": "subscription",
    "purpose": "原咖啡豆 SKU 已無法供應，請重新選擇",
    "defaultText": "原咖啡豆 SKU 已無法供應，請重新選擇",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.4f085fb173",
    "group": "subscription",
    "purpose": "預設烘焙：",
    "defaultText": "預設烘焙：",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.b6607da6b8",
    "group": "subscription",
    "purpose": "咖啡作品",
    "defaultText": "咖啡作品",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.1dfa640ca2",
    "group": "subscription",
    "purpose": "原耳掛商品已無法供應，請重新選擇",
    "defaultText": "原耳掛商品已無法供應，請重新選擇",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.dc577114a0",
    "group": "subscription",
    "purpose": "耳掛規格",
    "defaultText": "耳掛規格",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.6818020ff2",
    "group": "subscription",
    "purpose": "原耳掛 SKU 已無法供應，請重新選擇",
    "defaultText": "原耳掛 SKU 已無法供應，請重新選擇",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.8d61728842",
    "group": "subscription",
    "purpose": "數量",
    "defaultText": "數量",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.859ff10dc4",
    "group": "subscription",
    "purpose": "專屬烘焙",
    "defaultText": "專屬烘焙",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.description.8d7fc25ed5",
    "group": "subscription",
    "purpose": "同一款咖啡累積達 2 磅，可選擇專屬烘焙；不同咖啡不合併計算。",
    "defaultText": "同一款咖啡累積達 2 磅，可選擇專屬烘焙；不同咖啡不合併計算。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.23e8152f4d",
    "group": "subscription",
    "purpose": "使用專屬烘焙｜",
    "defaultText": "使用專屬烘焙｜",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.88a07f2913",
    "group": "subscription",
    "purpose": "磅）",
    "defaultText": "磅）",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.9ff882f491",
    "group": "subscription",
    "purpose": "指定烘焙度",
    "defaultText": "指定烘焙度",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.9cb09b081e",
    "group": "subscription",
    "purpose": "專屬烘焙標準排程需要至少",
    "defaultText": "專屬烘焙標準排程需要至少",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.4644a91a11",
    "group": "subscription",
    "purpose": "天準備時間。",
    "defaultText": "天準備時間。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.7072c1d715",
    "group": "subscription",
    "purpose": "＋ 新增商品",
    "defaultText": "＋ 新增商品",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.9cc6467c8c",
    "group": "subscription",
    "purpose": "項",
    "defaultText": "項",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.ad15f50314",
    "group": "subscription",
    "purpose": "儲存下一次配送商品",
    "defaultText": "儲存下一次配送商品",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.a2d787b48f",
    "group": "subscription",
    "purpose": "變更配送方式",
    "defaultText": "變更配送方式",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.f6a43b432c",
    "group": "subscription",
    "purpose": "請填寫完整宅配地址",
    "defaultText": "請填寫完整宅配地址",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.b59c73791d",
    "group": "subscription",
    "purpose": "未來定期配送方式",
    "defaultText": "未來定期配送方式",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.1856b4bebc",
    "group": "subscription",
    "purpose": "7-ELEVEN 取貨",
    "defaultText": "7-ELEVEN 取貨",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.82742bbeaa",
    "group": "subscription",
    "purpose": "收件人姓名",
    "defaultText": "收件人姓名",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.354277d40c",
    "group": "subscription",
    "purpose": "手機／聯絡電話",
    "defaultText": "手機／聯絡電話",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.e286f2b673",
    "group": "subscription",
    "purpose": "郵遞區號",
    "defaultText": "郵遞區號",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.021c309898",
    "group": "subscription",
    "purpose": "縣市",
    "defaultText": "縣市",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.eea4c516a3",
    "group": "subscription",
    "purpose": "區／鄉鎮市",
    "defaultText": "區／鄉鎮市",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.1362f770f6",
    "group": "subscription",
    "purpose": "詳細地址",
    "defaultText": "詳細地址",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.976c4365b5",
    "group": "subscription",
    "purpose": "宅配定期配送付款方式：貨到付款",
    "defaultText": "宅配定期配送付款方式：貨到付款",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.59db86d791",
    "group": "subscription",
    "purpose": "貨到付款手續費 NT$",
    "defaultText": "貨到付款手續費 NT$",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.8f396112dd",
    "group": "subscription",
    "purpose": "／次；實際金額以每期鎖定時的設定為準。",
    "defaultText": "／次；實際金額以每期鎖定時的設定為準。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.06be046bae",
    "group": "subscription",
    "purpose": "此變更只套用未來配送；已鎖定期次與已建立的訂單保留原快照。",
    "defaultText": "此變更只套用未來配送；已鎖定期次與已建立的訂單保留原快照。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.a1fbf70a51",
    "group": "subscription",
    "purpose": "儲存配送方式",
    "defaultText": "儲存配送方式",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.46ee636f72",
    "group": "subscription",
    "purpose": "暫停定期配送",
    "defaultText": "暫停定期配送",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.702344fe93",
    "group": "subscription",
    "purpose": "恢復或停止定期配送",
    "defaultText": "恢復或停止定期配送",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.53d7c14a1b",
    "group": "subscription",
    "purpose": "暫停後不會安排新的定期配送，之後可再選擇下一次配送日期恢復。",
    "defaultText": "暫停後不會安排新的定期配送，之後可再選擇下一次配送日期恢復。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.f9f7ccddef",
    "group": "subscription",
    "purpose": "可選擇下一次配送日期恢復，或停止這筆定期配送。",
    "defaultText": "可選擇下一次配送日期恢復，或停止這筆定期配送。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.f455878bf3",
    "group": "subscription",
    "purpose": "暫停未來定期配送",
    "defaultText": "暫停未來定期配送",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.8b0e347caf",
    "group": "subscription",
    "purpose": "新的配送週期",
    "defaultText": "新的配送週期",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.6e9bfd87bb",
    "group": "subscription",
    "purpose": "確認恢復",
    "defaultText": "確認恢復",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.34aeb998bb",
    "group": "subscription",
    "purpose": "停止這筆定期配送",
    "defaultText": "停止這筆定期配送",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.7519592be1",
    "group": "subscription",
    "purpose": "立即補貨（不改下次日期）",
    "defaultText": "立即補貨（不改下次日期）",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.13314c1e7f",
    "group": "subscription",
    "purpose": "刪除這筆已停止的定期配送？",
    "defaultText": "刪除這筆已停止的定期配送？",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.7ce0eb8be1",
    "group": "subscription",
    "purpose": "刪除後，這筆已停止的定期配送會從會員中心移除。",
    "defaultText": "刪除後，這筆已停止的定期配送會從會員中心移除。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.reward.2d6e36e89d",
    "group": "subscription",
    "purpose": "歷史訂單、取貨紀錄與回饋資料仍會保留，不會被刪除。",
    "defaultText": "歷史訂單、取貨紀錄與回饋資料仍會保留，不會被刪除。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.020d8a7f26",
    "group": "subscription",
    "purpose": "刪除後將不再享有這筆定期配送的",
    "defaultText": "刪除後將不再享有這筆定期配送的",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.f35bce5df1",
    "group": "subscription",
    "purpose": "優惠；如果之後需要，必須重新建立定期配送。",
    "defaultText": "優惠；如果之後需要，必須重新建立定期配送。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.1d63b95811",
    "group": "subscription",
    "purpose": "確認刪除",
    "defaultText": "確認刪除",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.dacd062878",
    "group": "subscription",
    "purpose": "取消這個定期配送設定？",
    "defaultText": "取消這個定期配送設定？",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.3b8ca54830",
    "group": "subscription",
    "purpose": "確定停止定期配送嗎？",
    "defaultText": "確定停止定期配送嗎？",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.bce2c7d5de",
    "group": "subscription",
    "purpose": "取消後，目前這張首筆原價訂單仍會照常處理。",
    "defaultText": "取消後，目前這張首筆原價訂單仍會照常處理。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.ba92f931e8",
    "group": "subscription",
    "purpose": "即使本次成功取貨，也不會再啟動定期配送。",
    "defaultText": "即使本次成功取貨，也不會再啟動定期配送。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.415f0c413e",
    "group": "subscription",
    "purpose": "您也不會再享有後續",
    "defaultText": "您也不會再享有後續",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.b4d23b0cd4",
    "group": "subscription",
    "purpose": "停止後，之後不再安排新的定期配送。",
    "defaultText": "停止後，之後不再安排新的定期配送。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.944fe8eeea",
    "group": "subscription",
    "purpose": "這次已成立的訂單會照原安排處理。",
    "defaultText": "這次已成立的訂單會照原安排處理。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.a21df2a9e3",
    "group": "subscription",
    "purpose": "先不要",
    "defaultText": "先不要",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.2d199d0f8f",
    "group": "subscription",
    "purpose": "確認取消定期配送",
    "defaultText": "確認取消定期配送",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.1869a6a9c2",
    "group": "subscription",
    "purpose": "確認停止定期配送",
    "defaultText": "確認停止定期配送",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.01e661c26c",
    "group": "subscription",
    "purpose": "DEDICATED ROAST",
    "defaultText": "DEDICATED ROAST",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.96816543b7",
    "group": "subscription",
    "purpose": "專屬烘焙準備時間提醒",
    "defaultText": "專屬烘焙準備時間提醒",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.description.2d03afed69",
    "group": "subscription",
    "purpose": "您目前選擇的配送日期較近，我們仍會接受這次訂單並盡力安排，但實際配送時間可能因此延後。",
    "defaultText": "您目前選擇的配送日期較近，我們仍會接受這次訂單並盡力安排，但實際配送時間可能因此延後。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.button.e8f0e3d500",
    "group": "subscription",
    "purpose": "返回修改日期",
    "defaultText": "返回修改日期",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.34f1e8ee42",
    "group": "subscription",
    "purpose": "我了解，繼續下單",
    "defaultText": "我了解，繼續下單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.cce4d84c08",
    "group": "subscription",
    "purpose": "SUBSCRIPTION PRICE",
    "defaultText": "SUBSCRIPTION PRICE",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.aca06dab05",
    "group": "subscription",
    "purpose": "本期金額明細",
    "defaultText": "本期金額明細",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.e5727b37e7",
    "group": "subscription",
    "purpose": "商品原價",
    "defaultText": "商品原價",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.81bfb9bc73",
    "group": "subscription",
    "purpose": "一般配送運費",
    "defaultText": "一般配送運費",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.ebdd19cf14",
    "group": "subscription",
    "purpose": "一般購買合計",
    "defaultText": "一般購買合計",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.62f37a9f0d",
    "group": "subscription",
    "purpose": "定期購優惠（",
    "defaultText": "定期購優惠（",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.cf3c65c4e6",
    "group": "subscription",
    "purpose": "折）",
    "defaultText": "折）",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.c227f25ff7",
    "group": "subscription",
    "purpose": "定期購配送優惠",
    "defaultText": "定期購配送優惠",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.31eaef433a",
    "group": "subscription",
    "purpose": "定期購價格",
    "defaultText": "定期購價格",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.732574b86c",
    "group": "subscription",
    "purpose": "活動價格",
    "defaultText": "活動價格",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.4e1fc4fc0e",
    "group": "subscription",
    "purpose": "本期採用",
    "defaultText": "本期採用",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.582e25f326",
    "group": "subscription",
    "purpose": "活動優惠價",
    "defaultText": "活動優惠價",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.611d739c3d",
    "group": "subscription",
    "purpose": "定期購優惠價",
    "defaultText": "定期購優惠價",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.635918e917",
    "group": "subscription",
    "purpose": "鎖定本期時自動比較較優惠價格",
    "defaultText": "鎖定本期時自動比較較優惠價格",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.6ad2f24c75",
    "group": "subscription",
    "purpose": "本期配送費",
    "defaultText": "本期配送費",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.12ef48e17a",
    "group": "subscription",
    "purpose": "貨到付款手續費",
    "defaultText": "貨到付款手續費",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.storeCredit.title",
    "group": "storeCredit",
    "purpose": "抵用金統一顯示名稱（供會員、結帳、訂單及相關提示使用）",
    "defaultText": "抵用金",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.02001764c3",
    "group": "subscription",
    "purpose": "本期優惠合計",
    "defaultText": "本期優惠合計",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.45ad4f70b6",
    "group": "subscription",
    "purpose": "省",
    "defaultText": "省",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.7a9b212c24",
    "group": "subscription",
    "purpose": "目前預估應付",
    "defaultText": "目前預估應付",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.description.e63e884dab",
    "group": "subscription",
    "purpose": "此期尚未鎖定。活動優惠、配送費與抵用金會在本期鎖定時依正式規則重新計算，系統會自動採用較優惠的商品價格。",
    "defaultText": "此期尚未鎖定。活動優惠與配送費會在本期鎖定時依正式規則重新計算；{creditName}會在建單時依本期使用方式與可用餘額確認，系統會自動採用較優惠的商品價格。",
    "tokens": {"creditName": "共用顯示名稱；取自抵用金統一顯示名稱設定"},
    "multiline": false
  },
  {
    "key": "member.subscription.label.dd3760c80a",
    "group": "subscription",
    "purpose": "我知道了",
    "defaultText": "我知道了",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.b33b538dad",
    "group": "subscription",
    "purpose": "CREDIT",
    "defaultText": "CREDIT",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.a519a98b2f",
    "group": "subscription",
    "purpose": "我的抵用金",
    "defaultText": "我的{creditName}",
    "tokens": {"creditName": "共用顯示名稱；取自抵用金統一顯示名稱設定"},
    "multiline": false
  },
  {
    "key": "member.subscription.label.924d8b1af2",
    "group": "subscription",
    "purpose": "現在可用",
    "defaultText": "現在可用",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.reward.38147e5939",
    "group": "subscription",
    "purpose": "僅顯示已正式入帳、可於結帳使用的折抵額。",
    "defaultText": "僅顯示已正式入帳、可於結帳使用的折抵額。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.reward.654ff9e0ec",
    "group": "subscription",
    "purpose": "回饋來源訂單",
    "defaultText": "回饋來源訂單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.a0d14fb922",
    "group": "subscription",
    "purpose": "餘額",
    "defaultText": "餘額",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.8066e0f41f",
    "group": "subscription",
    "purpose": "到期",
    "defaultText": "到期",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.emptyState.193dab97b4",
    "group": "subscription",
    "purpose": "目前沒有抵用金紀錄",
    "defaultText": "目前沒有{creditName}紀錄",
    "tokens": {"creditName": "共用顯示名稱；取自抵用金統一顯示名稱設定"},
    "multiline": false
  },
  {
    "key": "member.subscription.description.4b6e30e9c5",
    "group": "subscription",
    "purpose": "有抵用金時，結帳會讓您自行選擇是否使用，並優先使用最快到期的額度。",
    "defaultText": "有{creditName}時，結帳會讓您自行選擇是否使用，並優先使用最快到期的額度。",
    "tokens": {"creditName": "共用顯示名稱；取自抵用金統一顯示名稱設定"},
    "multiline": false
  },
  {
    "key": "member.subscription.label.4a6dd8d07c",
    "group": "subscription",
    "purpose": "推薦紀錄摘要",
    "defaultText": "推薦紀錄摘要",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.74c77a8ab0",
    "group": "subscription",
    "purpose": "位",
    "defaultText": "位",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.a7e04001fc",
    "group": "subscription",
    "purpose": "已加入會員",
    "defaultText": "已加入會員",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.a32eca65f9",
    "group": "subscription",
    "purpose": "符合消費",
    "defaultText": "符合消費",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.label.5e5b8169ee",
    "group": "subscription",
    "purpose": "次",
    "defaultText": "次",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.emptyState.ce5ee9030e",
    "group": "subscription",
    "purpose": "還沒有推薦紀錄",
    "defaultText": "還沒有推薦紀錄",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.subscription.reward.d5a5a612e3",
    "group": "subscription",
    "purpose": "這裡只會顯示安全的會員稱呼、是否加入與回饋進度，不會顯示對方的聯絡資料。",
    "defaultText": "這裡只會顯示安全的會員稱呼、是否加入與回饋進度，不會顯示對方的聯絡資料。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.723f9200db",
    "group": "login",
    "purpose": "請輸入正確的台灣手機號碼",
    "defaultText": "請輸入正確的台灣手機號碼",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.aea7a7ae95",
    "group": "login",
    "purpose": "密碼至少需要 8 個字元",
    "defaultText": "密碼至少需要 8 個字元",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.182a3b8747",
    "group": "login",
    "purpose": "兩次輸入的密碼不一致",
    "defaultText": "兩次輸入的密碼不一致",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.button.abbcada1db",
    "group": "login",
    "purpose": "此手機號碼已經註冊過，請直接登入。",
    "defaultText": "此手機號碼已經註冊過，請直接登入。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.17dff313da",
    "group": "login",
    "purpose": "手機號碼或密碼錯誤",
    "defaultText": "手機號碼或密碼錯誤",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.176d340ea5",
    "group": "login",
    "purpose": "建立會員失敗，請稍後再試",
    "defaultText": "建立會員失敗，請稍後再試",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.button.3d8ca4acc0",
    "group": "login",
    "purpose": "使用手機號碼登入／註冊",
    "defaultText": "使用手機號碼登入／註冊",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.5bb3fb77b1",
    "group": "login",
    "purpose": "PHONE MEMBER",
    "defaultText": "PHONE MEMBER",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.button.600592c895",
    "group": "login",
    "purpose": "手機號碼登入",
    "defaultText": "手機號碼登入",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.34faa8e11c",
    "group": "login",
    "purpose": "建立手機會員",
    "defaultText": "建立手機會員",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.010342b8bb",
    "group": "login",
    "purpose": "忘記手機會員密碼",
    "defaultText": "忘記手機會員密碼",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.button.40c7ad97bd",
    "group": "login",
    "purpose": "目前可以傳訊息給 KD Coffee，由我們協助確認會員資料並重設新密碼。",
    "defaultText": "目前可以傳訊息給 KD Coffee，由我們協助確認會員資料並重設新密碼。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.button.e79e0f1873",
    "group": "login",
    "purpose": "人工協助的方式會持續保留；我們不會查看或提供您原本的密碼。",
    "defaultText": "人工協助的方式會持續保留；我們不會查看或提供您原本的密碼。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.db0115eb10",
    "group": "login",
    "purpose": "傳訊息給 KD Coffee",
    "defaultText": "傳訊息給 KD Coffee",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.button.a317021097",
    "group": "login",
    "purpose": "返回手機登入",
    "defaultText": "返回手機登入",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.2eb8e20559",
    "group": "login",
    "purpose": "例如：0912 345 678",
    "defaultText": "例如：0912 345 678",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.45dd4ff3f1",
    "group": "login",
    "purpose": "設定密碼",
    "defaultText": "設定密碼",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.5cf4d26b8d",
    "group": "login",
    "purpose": "密碼至少 8 個字元",
    "defaultText": "密碼至少 8 個字元",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.32f2b634f2",
    "group": "login",
    "purpose": "第一次使用？建立手機會員",
    "defaultText": "第一次使用？建立手機會員",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.button.c6e7b5595a",
    "group": "login",
    "purpose": "已經是手機會員？返回登入",
    "defaultText": "已經是手機會員？返回登入",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.button.462d7641fc",
    "group": "login",
    "purpose": "改用其他登入方式",
    "defaultText": "改用其他登入方式",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.6c5befc7e3",
    "group": "login",
    "purpose": "密碼重設失敗，請重新申請。",
    "defaultText": "密碼重設失敗，請重新申請。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.button.3e7695dbbf",
    "group": "login",
    "purpose": "密碼已重新設定，請使用新密碼登入。",
    "defaultText": "密碼已重新設定，請使用新密碼登入。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.af9f142a95",
    "group": "login",
    "purpose": "新密碼",
    "defaultText": "新密碼",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.55ea6a030b",
    "group": "login",
    "purpose": "再次輸入新密碼",
    "defaultText": "再次輸入新密碼",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.label.8240581d66",
    "group": "login",
    "purpose": "重設中…",
    "defaultText": "重設中…",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.login.button.59bd7dd79c",
    "group": "login",
    "purpose": "返回會員登入",
    "defaultText": "返回會員登入",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.0ac4595e48",
    "group": "rewards",
    "purpose": "待訂單完成",
    "defaultText": "待訂單完成",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.2c0a067be7",
    "group": "rewards",
    "purpose": "已沖回",
    "defaultText": "已沖回",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.0fc2eff232",
    "group": "rewards",
    "purpose": "推廣零售資料暫時無法讀取",
    "defaultText": "推廣零售資料暫時無法讀取",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.6ae8dfb2fa",
    "group": "rewards",
    "purpose": "RETAIL PROMOTION",
    "defaultText": "RETAIL PROMOTION",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.84f422a0f6",
    "group": "rewards",
    "purpose": "推廣零售",
    "defaultText": "推廣零售",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.8e3cdd3850",
    "group": "rewards",
    "purpose": "朋友透過你在「推薦」中的分享連結，以訪客身分完成購買，即可依",
    "defaultText": "朋友透過你在「推薦」中的分享連結，以訪客身分完成購買，即可依",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.320a916475",
    "group": "rewards",
    "purpose": "比例獲得推廣零售獎金。",
    "defaultText": "比例獲得推廣零售獎金。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.13af0fe9ad",
    "group": "rewards",
    "purpose": "目前未啟用新的推廣零售獎金；分享功能仍集中在「推薦」。",
    "defaultText": "目前未啟用新的推廣零售獎金；分享功能仍集中在「推薦」。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.button.1feb150b85",
    "group": "rewards",
    "purpose": "訪客購買帶來的推廣零售成果會顯示在這裡；分享請前往「推薦」。",
    "defaultText": "訪客購買帶來的推廣零售成果會顯示在這裡；分享請前往「推薦」。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.75dc5efccf",
    "group": "rewards",
    "purpose": "讀取中…",
    "defaultText": "讀取中…",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.tooltip.8a24a6accd",
    "group": "rewards",
    "purpose": "推廣零售獎金摘要",
    "defaultText": "推廣零售獎金摘要",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.243b4f1599",
    "group": "rewards",
    "purpose": "推廣零售詳情",
    "defaultText": "推廣零售詳情",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.tooltip.6075642230",
    "group": "rewards",
    "purpose": "關閉推廣零售詳情",
    "defaultText": "關閉推廣零售詳情",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.tooltip.7dea39c001",
    "group": "rewards",
    "purpose": "目前推廣零售規則",
    "defaultText": "目前推廣零售規則",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.48c6d2ab30",
    "group": "rewards",
    "purpose": "目前獎金比例",
    "defaultText": "目前獎金比例",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.decc9d97b8",
    "group": "rewards",
    "purpose": "計算基礎",
    "defaultText": "計算基礎",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.1c60f12f4e",
    "group": "rewards",
    "purpose": "實付商品金額",
    "defaultText": "實付商品金額",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.649ebc9271",
    "group": "rewards",
    "purpose": "分享有效期間",
    "defaultText": "分享有效期間",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.description.a2e8013bd2",
    "group": "rewards",
    "purpose": "依訪客訂單的有效 …（PV）× 獎金比例計算，再依每 1 … = NT$ … 換算抵用金。",
    "defaultText": "依訪客訂單的有效 {pointName}（PV）× 獎金比例計算，再依每 1 {pointName2} = NT$ {creditAmount} 換算{creditName}。",
    "tokens": {"creditName": "共用顯示名稱；取自抵用金統一顯示名稱設定",
      "pointName": "原點數顯示名稱",
      "pointName2": "原畫面提供的顯示值；不能在文案中修改計算",
      "creditAmount": "原金額顯示值"
    },
    "multiline": true
  },
  {
    "key": "member.rewards.description.a331dc7b2c",
    "group": "rewards",
    "purpose": "依訪客訂單的有效商品實付金額 × 獎金比例計算；運費不列入計算。",
    "defaultText": "依訪客訂單的有效商品實付金額 × 獎金比例計算；運費不列入計算。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.tooltip.cdd123301c",
    "group": "rewards",
    "purpose": "推廣零售完整數據",
    "defaultText": "推廣零售完整數據",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.8f69f7f4f0",
    "group": "rewards",
    "purpose": "實付商品業績",
    "defaultText": "實付商品業績",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.button.ecfe4930d2",
    "group": "rewards",
    "purpose": "待確認",
    "defaultText": "待確認",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.bcc1f8ae85",
    "group": "rewards",
    "purpose": "業績",
    "defaultText": "業績",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.13e54ce098",
    "group": "rewards",
    "purpose": "PV",
    "defaultText": "PV",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.02dc4661b3",
    "group": "rewards",
    "purpose": "待入帳獎金",
    "defaultText": "待入帳獎金",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.fba0933522",
    "group": "rewards",
    "purpose": "已入帳獎金",
    "defaultText": "已入帳獎金",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.9829888260",
    "group": "rewards",
    "purpose": "規則簡介",
    "defaultText": "規則簡介",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.description.0ad5131ae0",
    "group": "rewards",
    "purpose": "朋友透過你的分享連結進站，以訪客身分完成有效訂單後，該筆訂單會列入你的推廣零售業績。",
    "defaultText": "朋友透過你的分享連結進站，以訪客身分完成有效訂單後，該筆訂單會列入你的推廣零售業績。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.button.cb8c743345",
    "group": "rewards",
    "purpose": "已登入會員購買時，該筆消費仍屬於會員自己的消費；未登入會員以訪客方式購買時，才視為訪客訂單。",
    "defaultText": "已登入會員購買時，該筆消費仍屬於會員自己的消費；未登入會員以訪客方式購買時，才視為訪客訂單。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.8e0bb29725",
    "group": "rewards",
    "purpose": "訂單建立時會固定分享來源、計算基礎與比例，之後不會重新改寫。",
    "defaultText": "訂單建立時會固定分享來源、計算基礎與比例，之後不會重新改寫。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.c93abcab03",
    "group": "rewards",
    "purpose": "推廣零售紀錄",
    "defaultText": "推廣零售紀錄",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.f95cf81756",
    "group": "rewards",
    "purpose": "訪客訂單",
    "defaultText": "訪客訂單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.description.839906ad8c",
    "group": "rewards",
    "purpose": "有效 … … PV",
    "defaultText": "有效 {pointName} {creditAmount} PV",
    "tokens": {
      "pointName": "原點數顯示名稱",
      "creditAmount": "原金額顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.rewards.label.ed3760966f",
    "group": "rewards",
    "purpose": "有效業績 …",
    "defaultText": "有效業績 {creditAmount}",
    "tokens": {
      "creditAmount": "原金額顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.rewards.label.c27f341ce5",
    "group": "rewards",
    "purpose": "比例",
    "defaultText": "比例",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.61da7128e6",
    "group": "rewards",
    "purpose": "預計",
    "defaultText": "預計",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.9c67ac7faf",
    "group": "rewards",
    "purpose": "入帳",
    "defaultText": "入帳",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.emptyState.005c0b0780",
    "group": "rewards",
    "purpose": "目前還沒有推廣零售紀錄",
    "defaultText": "目前還沒有推廣零售紀錄",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.button.c3b4116c97",
    "group": "rewards",
    "purpose": "未登入訪客透過有效分享連結完成購買後，紀錄會顯示在這裡。",
    "defaultText": "未登入訪客透過有效分享連結完成購買後，紀錄會顯示在這裡。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.09ca4ad02d",
    "group": "referral",
    "purpose": "和你分享 KD Coffee",
    "defaultText": "和你分享 KD Coffee",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.tooltip.86ae7c9c15",
    "group": "referral",
    "purpose": "分享這個頁面",
    "defaultText": "分享這個頁面",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.label.7a92434114",
    "group": "referral",
    "purpose": "分享",
    "defaultText": "分享",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.15dad30c2a",
    "group": "rewards",
    "purpose": "已入帳 …",
    "defaultText": "已入帳 {date}",
    "tokens": {
      "date": "原系統日期顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.rewards.reward.add68c0594",
    "group": "rewards",
    "purpose": "預計 … 入帳",
    "defaultText": "預計 {date} 入帳",
    "tokens": {
      "date": "原系統日期顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.rewards.reward.ad0caaddb6",
    "group": "rewards",
    "purpose": "入帳日期確認中",
    "defaultText": "入帳日期確認中",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.29512857a8",
    "group": "rewards",
    "purpose": "待完成取貨後計算",
    "defaultText": "待完成取貨後計算",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.7970afc503",
    "group": "rewards",
    "purpose": "有效商品金額",
    "defaultText": "有效商品金額",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.2d7240edfd",
    "group": "rewards",
    "purpose": "有效 …",
    "defaultText": "有效 {pointName}",
    "tokens": {
      "pointName": "原點數顯示名稱"
    },
    "multiline": false
  },
  {
    "key": "member.rewards.label.99ff24be30",
    "group": "rewards",
    "purpose": "歷史資料未記錄",
    "defaultText": "歷史資料未記錄",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.a773691ee9",
    "group": "rewards",
    "purpose": "歷史訂單",
    "defaultText": "歷史訂單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.1843ce06c3",
    "group": "rewards",
    "purpose": "點數未記錄",
    "defaultText": "點數未記錄",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.291c4718d4",
    "group": "rewards",
    "purpose": "收合詳情",
    "defaultText": "收合詳情",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.e6e9ffffbb",
    "group": "rewards",
    "purpose": "回饋怎麼算",
    "defaultText": "回饋怎麼算",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.bcdf839b88",
    "group": "rewards",
    "purpose": "回饋比例",
    "defaultText": "回饋比例",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.5ff465da46",
    "group": "rewards",
    "purpose": "本筆回饋",
    "defaultText": "本筆回饋",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.26e649895b",
    "group": "rewards",
    "purpose": "已沖回折抵",
    "defaultText": "已沖回折抵",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.14f77fbdd5",
    "group": "rewards",
    "purpose": "實際入帳",
    "defaultText": "實際入帳",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.de7f9bd9d5",
    "group": "rewards",
    "purpose": "預估折抵",
    "defaultText": "預估{creditName}",
    "tokens": {"creditName": "共用顯示名稱；取自抵用金統一顯示名稱設定"},
    "multiline": false
  },
  {
    "key": "member.rewards.label.544eb7a56c",
    "group": "rewards",
    "purpose": "來源訂單",
    "defaultText": "來源訂單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.927baf2c3e",
    "group": "rewards",
    "purpose": "・完整來源明細未保留",
    "defaultText": "・完整來源明細未保留",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.qualification.e1ace5bfdf",
    "group": "rewards",
    "purpose": "資格狀態",
    "defaultText": "資格狀態",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.qualification.1eead48278",
    "group": "rewards",
    "purpose": "推薦資格有效至",
    "defaultText": "推薦資格有效至",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.qualification.a3dc142801",
    "group": "rewards",
    "purpose": "查看資格規則",
    "defaultText": "查看資格規則",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.79c46a2cf8",
    "group": "rewards",
    "purpose": "入帳進度",
    "defaultText": "入帳進度",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.tooltip.69340cf301",
    "group": "rewards",
    "purpose": "回饋入帳進度",
    "defaultText": "回饋入帳進度",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.b416dd2263",
    "group": "rewards",
    "purpose": "預計至",
    "defaultText": "預計至",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.c5769e5a26",
    "group": "rewards",
    "purpose": "入帳日期",
    "defaultText": "入帳日期",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.6339e76163",
    "group": "rewards",
    "purpose": "沖回日期",
    "defaultText": "沖回日期",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.c37db45be6",
    "group": "rewards",
    "purpose": "入帳狀態",
    "defaultText": "入帳狀態",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.bf25b703bb",
    "group": "rewards",
    "purpose": "預計入帳日期",
    "defaultText": "預計入帳日期",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.288a8028b8",
    "group": "rewards",
    "purpose": "REWARD SOURCE ORDER",
    "defaultText": "REWARD SOURCE ORDER",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.540dc43609",
    "group": "rewards",
    "purpose": "訂單類型",
    "defaultText": "訂單類型",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.a724b98d08",
    "group": "rewards",
    "purpose": "訂單狀態",
    "defaultText": "訂單狀態",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.363cb82ec7",
    "group": "rewards",
    "purpose": "完成取貨",
    "defaultText": "完成取貨",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.9008c2ba8d",
    "group": "rewards",
    "purpose": "來源會員",
    "defaultText": "來源會員",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.ae864ac31e",
    "group": "rewards",
    "purpose": "購買內容",
    "defaultText": "購買內容",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.ccf442cc5e",
    "group": "rewards",
    "purpose": "預估折抵價值",
    "defaultText": "預估{creditName}價值",
    "tokens": {"creditName": "共用顯示名稱；取自抵用金統一顯示名稱設定"},
    "multiline": false
  },
  {
    "key": "member.rewards.label.229d82de81",
    "group": "rewards",
    "purpose": "目前可用",
    "defaultText": "目前可用",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.0ce1d41474",
    "group": "rewards",
    "purpose": "完整訂單",
    "defaultText": "完整訂單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.button.52c7dd3708",
    "group": "rewards",
    "purpose": "查看完整訂單 →",
    "defaultText": "查看完整訂單 →",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.3afab4927f",
    "group": "rewards",
    "purpose": "歷史時間未記錄",
    "defaultText": "歷史時間未記錄",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.tooltip.6ad8e8daac",
    "group": "rewards",
    "purpose": "查看安全等待說明",
    "defaultText": "查看安全等待說明",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.9b6c1b038a",
    "group": "rewards",
    "purpose": "說明",
    "defaultText": "說明",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.ec6226ad10",
    "group": "rewards",
    "purpose": "此筆來源訂單已完成取貨。",
    "defaultText": "此筆來源訂單已完成取貨。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.afccb6ad2c",
    "group": "rewards",
    "purpose": "為保障退貨、取消或其他交易異常的處理期間，這筆回饋會依本筆回饋建立時的規則經過安全等待期。",
    "defaultText": "為保障退貨、取消或其他交易異常的處理期間，這筆回饋會依本筆回饋建立時的規則經過安全等待期。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.e44effcabf",
    "group": "rewards",
    "purpose": "若等待期間內交易維持正常，回饋將由系統自動入帳，您不需要另外操作。",
    "defaultText": "若等待期間內交易維持正常，回饋將由系統自動入帳，您不需要另外操作。",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.4925fe0641",
    "group": "rewards",
    "purpose": "基礎等待",
    "defaultText": "基礎等待",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.6c6d2b4aae",
    "group": "rewards",
    "purpose": "退貨保護",
    "defaultText": "退貨保護",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.a11162e104",
    "group": "rewards",
    "purpose": "安全等待規則",
    "defaultText": "安全等待規則",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.d20644062a",
    "group": "rewards",
    "purpose": "依本筆回饋建立時的規則執行",
    "defaultText": "依本筆回饋建立時的規則執行",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.a1b04f9a8b",
    "group": "rewards",
    "purpose": "預計入帳",
    "defaultText": "預計入帳",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.86b4d04b60",
    "group": "rewards",
    "purpose": "日期未記錄",
    "defaultText": "日期未記錄",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.aaac6982df",
    "group": "rewards",
    "purpose": "已沖回 …",
    "defaultText": "已沖回 {date}",
    "tokens": {
      "date": "原系統日期顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.rewards.label.f5da329f69",
    "group": "rewards",
    "purpose": "已到預計發放日，系統將自動處理",
    "defaultText": "已到預計發放日，系統將自動處理",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.ee2a78a453",
    "group": "rewards",
    "purpose": "發放日 …・系統將自動處理",
    "defaultText": "發放日 {date}・系統將自動處理",
    "tokens": {
      "date": "原系統日期顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.rewards.label.9abc393ec1",
    "group": "rewards",
    "purpose": "已到預計發放日 …，系統將自動處理",
    "defaultText": "已到預計發放日 {date}，系統將自動處理",
    "tokens": {
      "date": "原系統日期顯示值"
    },
    "multiline": false
  },
  {
    "key": "member.rewards.reward.dd43716d31",
    "group": "rewards",
    "purpose": "安全等待中",
    "defaultText": "安全等待中",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.bddfdb2f71",
    "group": "rewards",
    "purpose": "… ＋ … 項商品",
    "defaultText": "{value1} ＋ {value2} 項商品",
    "tokens": {
      "value1": "原畫面提供的顯示值；不能在文案中修改計算",
      "value2": "原畫面提供的顯示值；不能在文案中修改計算"
    },
    "multiline": false
  },
  {
    "key": "member.rewards.qualification.c755ce381b",
    "group": "rewards",
    "purpose": "尚待取得資格",
    "defaultText": "尚待取得資格",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.qualification.d8ce8fc25a",
    "group": "rewards",
    "purpose": "資格已逾期",
    "defaultText": "資格已逾期",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.b6ba022cb6",
    "group": "rewards",
    "purpose": "等待來源訂單完成",
    "defaultText": "等待來源訂單完成",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.qualification.44fe9bcd79",
    "group": "rewards",
    "purpose": "尚待取得推薦回饋資格",
    "defaultText": "尚待取得推薦回饋資格",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.qualification.0d4bce97f3",
    "group": "rewards",
    "purpose": "本人消費不需推薦資格・安全等待中",
    "defaultText": "本人消費不需推薦資格・安全等待中",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.qualification.3a65b85a55",
    "group": "rewards",
    "purpose": "資格已確認・安全等待中",
    "defaultText": "資格已確認・安全等待中",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.a701df6137",
    "group": "rewards",
    "purpose": "自己的訂單",
    "defaultText": "自己的訂單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.90d776a3e5",
    "group": "rewards",
    "purpose": "第 … 代會員訂單",
    "defaultText": "第 {generation} 代會員訂單",
    "tokens": {
      "generation": "原推薦代數"
    },
    "multiline": false
  },
  {
    "key": "member.rewards.label.26b37ec57a",
    "group": "rewards",
    "purpose": "會員訂單",
    "defaultText": "會員訂單",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.4d85796775",
    "group": "rewards",
    "purpose": "已完成取貨",
    "defaultText": "已完成取貨",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.0f55ad5c45",
    "group": "rewards",
    "purpose": "等待取貨",
    "defaultText": "等待取貨",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.reward.651c3745cf",
    "group": "rewards",
    "purpose": "已到店等待取貨",
    "defaultText": "已到店等待取貨",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.9c2295475c",
    "group": "rewards",
    "purpose": "已出貨",
    "defaultText": "已出貨",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.2b5ab72ab6",
    "group": "rewards",
    "purpose": "配送中",
    "defaultText": "配送中",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.69683a901b",
    "group": "rewards",
    "purpose": "準備中",
    "defaultText": "準備中",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.d709b396ab",
    "group": "rewards",
    "purpose": "未完成取貨",
    "defaultText": "未完成取貨",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.ae16f4a52d",
    "group": "rewards",
    "purpose": "處理中",
    "defaultText": "處理中",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.label.7222b6e454",
    "group": "rewards",
    "purpose": "KD Coffee 商品",
    "defaultText": "KD Coffee 商品",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.rewards.kdPoints.spacedTitle",
    "group": "referral",
    "purpose": "KD 點",
    "defaultText": "KD 點",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.generation1.title",
    "group": "referral",
    "purpose": "第 1 代推薦回饋",
    "defaultText": "第 1 代推薦回饋",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.generation2.title",
    "group": "referral",
    "purpose": "第 2 代推薦回饋",
    "defaultText": "第 2 代推薦回饋",
    "tokens": {},
    "multiline": false
  },
  {
    "key": "member.referral.generation3.title",
    "group": "referral",
    "purpose": "第 3 代推薦回饋",
    "defaultText": "第 3 代推薦回饋",
    "tokens": {},
    "multiline": false
  },
  { key: "member.orders.fulfillment.orderCreated.label", group: "orders", purpose: "訂單摘要／訂單成立狀態", defaultText: "訂單成立", tokens: {}, multiline: false },
  { key: "member.orders.fulfillment.shipped.label", group: "orders", purpose: "訂單摘要／交寄狀態", defaultText: "已交寄", tokens: {}, multiline: false },
  { key: "member.orders.fulfillment.arrived.label", group: "orders", purpose: "訂單摘要／到店狀態", defaultText: "已到店", tokens: {}, multiline: false },
  { key: "member.orders.fulfillment.ready.label", group: "orders", purpose: "訂單摘要／可取貨狀態", defaultText: "可以取貨", tokens: {}, multiline: false },
  { key: "member.orders.fulfillment.suspectedUncollected.label", group: "orders", purpose: "訂單摘要／疑似逾期未取狀態", defaultText: "疑似逾期未取", tokens: {}, multiline: false },
  { key: "member.orders.fulfillment.uncollected.label", group: "orders", purpose: "訂單摘要／未取貨狀態", defaultText: "未取貨", tokens: {}, multiline: false },
  { key: "member.orders.fulfillment.review.label", group: "orders", purpose: "訂單摘要／人工確認狀態", defaultText: "需要人工確認", tokens: {}, multiline: false },
  ...CREDIT_COPY_CATALOG,
];

export const DEFAULT_MEMBER_CENTER_COPY: Readonly<Record<string, string>> = Object.fromEntries(MEMBER_CENTER_COPY_CATALOG.map((entry) => [entry.key, entry.defaultText]));
