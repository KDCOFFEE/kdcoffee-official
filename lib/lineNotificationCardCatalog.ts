import type {NotificationCardDefinition} from './lineNotificationCards';
/** Built-in synthetic preview defaults only. No transport/config/runtime data dependencies. */
export const LINE_CARD_CATALOG = [
 {
  "eventKey": "customer.subscription.next_cycle",
  "family": "REMINDER",
  "recipient": "customer",
  "displayName": "下一期配送可調整",
  "defaultCopy": {
   "title": "下一期配送可調整",
   "intro": "下一期配送已開放調整，請於修改期限前確認配送安排。",
   "secondaryText": "",
   "ctaLabel": "查看會員中心",
   "altText": "KD Coffee｜下一期配送可調整",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "最新通知",
   "tone": "brand"
  },
  "fields": [
   {
    "key": "plannedDate",
    "label": "配送日期",
    "formatter": "date",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "modificationDeadline",
    "label": "修改期限",
    "formatter": "date",
    "required": false,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "subscription"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "plannedDate",
   "modificationDeadline"
  ],
  "previewSample": {
   "plannedDate": "2026-11-03",
   "modificationDeadline": "2026-11-03"
  }
 },
 {
  "eventKey": "customer.subscription.modification_cutoff",
  "family": "REMINDER",
  "recipient": "customer",
  "displayName": "修改期限提醒",
  "defaultCopy": {
   "title": "修改期限提醒",
   "intro": "本期配送的修改期限即將截止，請確認是否需要調整。",
   "secondaryText": "",
   "ctaLabel": "查看會員中心",
   "altText": "KD Coffee｜修改期限提醒",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "到期提醒",
   "tone": "pending"
  },
  "fields": [
   {
    "key": "plannedDate",
    "label": "配送日期",
    "formatter": "date",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "modificationDeadline",
    "label": "修改期限",
    "formatter": "date",
    "required": false,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "subscription"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "plannedDate",
   "modificationDeadline"
  ],
  "previewSample": {
   "plannedDate": "2026-11-03",
   "modificationDeadline": "2026-11-03"
  }
 },
 {
  "eventKey": "customer.subscription.order_created",
  "family": "ORDER",
  "recipient": "customer",
  "displayName": "定期購訂單已成立",
  "defaultCopy": {
   "title": "定期購訂單已成立",
   "intro": "本期定期購訂單已建立，請至會員中心查看訂單安排。",
   "secondaryText": "",
   "ctaLabel": "查看會員中心",
   "altText": "KD Coffee｜定期購訂單已成立",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "最新通知",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "subscription"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.subscription.shipped",
  "family": "FULFILLMENT",
  "recipient": "customer",
  "displayName": "定期購訂單已出貨",
  "defaultCopy": {
   "title": "定期購訂單已出貨",
   "intro": "本期咖啡已出貨，請留意後續配送通知。",
   "secondaryText": "",
   "ctaLabel": "查看會員中心",
   "altText": "KD Coffee｜定期購訂單已出貨",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "最新通知",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "subscription"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.subscription.ready_for_pickup",
  "family": "FULFILLMENT",
  "recipient": "customer",
  "displayName": "定期購已到店",
  "defaultCopy": {
   "title": "定期購已到店",
   "intro": "本期咖啡已進入取貨階段，請至會員中心確認取貨資訊。",
   "secondaryText": "",
   "ctaLabel": "查看會員中心",
   "altText": "KD Coffee｜定期購已到店",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "最新通知",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "subscription"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.subscription.uncollected",
  "family": "REMINDER",
  "recipient": "customer",
  "displayName": "定期購未取貨狀態確認",
  "defaultCopy": {
   "title": "定期購未取貨狀態確認",
   "intro": "有一期配送未完成取貨，請查看會員中心的最新狀態。",
   "secondaryText": "",
   "ctaLabel": "查看會員中心",
   "altText": "KD Coffee｜定期購未取貨狀態確認",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "最新通知",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "subscription"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.reward.gift_milestone",
  "family": "REWARD",
  "recipient": "customer",
  "displayName": "贈品里程碑",
  "defaultCopy": {
   "title": "贈品里程碑",
   "intro": "本次完成配送已達贈品里程碑，請查看會員中心紀錄。",
   "secondaryText": "",
   "ctaLabel": "查看回饋紀錄",
   "altText": "KD Coffee｜贈品里程碑",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "最新通知",
   "tone": "brand"
  },
  "fields": [
   {
    "key": "fulfillmentNumber",
    "label": "完成配送次數",
    "formatter": "count",
    "required": false,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "rewards"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "fulfillmentNumber"
  ],
  "previewSample": {
   "fulfillmentNumber": 3
  }
 },
 {
  "eventKey": "customer.subscription.stock_blocked",
  "family": "REMINDER",
  "recipient": "customer",
  "displayName": "配送商品需重新選擇",
  "defaultCopy": {
   "title": "配送商品需重新選擇",
   "intro": "本期配送商品需要重新選擇，請至會員中心查看可調整項目。",
   "secondaryText": "",
   "ctaLabel": "查看會員中心",
   "altText": "KD Coffee｜配送商品需重新選擇",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "最新通知",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "subscription"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.subscription.paused",
  "family": "REMINDER",
  "recipient": "customer",
  "displayName": "定期配送已暫停",
  "defaultCopy": {
   "title": "定期配送已暫停",
   "intro": "您的定期配送已暫停，請至會員中心查看目前安排。",
   "secondaryText": "",
   "ctaLabel": "查看會員中心",
   "altText": "KD Coffee｜定期配送已暫停",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "最新通知",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "subscription"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.subscription.resumed",
  "family": "REMINDER",
  "recipient": "customer",
  "displayName": "定期配送已恢復",
  "defaultCopy": {
   "title": "定期配送已恢復",
   "intro": "您的定期配送已恢復，請確認最新配送安排。",
   "secondaryText": "",
   "ctaLabel": "查看會員中心",
   "altText": "KD Coffee｜定期配送已恢復",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "最新通知",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "subscription"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.subscription.terminated",
  "family": "REMINDER",
  "recipient": "customer",
  "displayName": "定期配送已停止",
  "defaultCopy": {
   "title": "定期配送已停止",
   "intro": "您的定期配送已停止，相關紀錄可至會員中心查閱。",
   "secondaryText": "",
   "ctaLabel": "查看會員中心",
   "altText": "KD Coffee｜定期配送已停止",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "最新通知",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "subscription"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.subscription.skipped",
  "family": "REMINDER",
  "recipient": "customer",
  "displayName": "本期配送已跳過",
  "defaultCopy": {
   "title": "本期配送已跳過",
   "intro": "本期定期配送已跳過，請至會員中心查看後續安排。",
   "secondaryText": "",
   "ctaLabel": "查看會員中心",
   "altText": "KD Coffee｜本期配送已跳過",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "最新通知",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "subscription"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.reward.referral",
  "family": "REWARD",
  "recipient": "customer",
  "displayName": "推薦回饋狀態更新",
  "defaultCopy": {
   "title": "推薦回饋狀態更新",
   "intro": "您的回饋狀態已更新；是否可使用請以會員中心紀錄為準。",
   "secondaryText": "",
   "ctaLabel": "查看回饋紀錄",
   "altText": "KD Coffee｜推薦回饋狀態更新",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "最新通知",
   "tone": "brand"
  },
  "fields": [
   {
    "key": "rewardAmount",
    "label": "抵用額",
    "formatter": "credit",
    "required": true,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "rewards"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "rewardAmount"
  ],
  "previewSample": {
   "rewardAmount": 100
  }
 },
 {
  "eventKey": "customer.reward.credit_issued",
  "family": "REWARD",
  "recipient": "customer",
  "displayName": "會員抵用額已入帳",
  "defaultCopy": {
   "title": "會員抵用額已入帳",
   "intro": "本次抵用額已入帳，可前往會員中心查看。",
   "secondaryText": "",
   "ctaLabel": "查看回饋紀錄",
   "altText": "KD Coffee｜會員抵用額已入帳",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "最新通知",
   "tone": "brand"
  },
  "fields": [
   {
    "key": "amount",
    "label": "抵用額",
    "formatter": "credit",
    "required": true,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "rewards"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "amount"
  ],
  "previewSample": {
   "amount": 100
  }
 },
 {
  "eventKey": "customer.reward.credit_expiring",
  "family": "REMINDER",
  "recipient": "customer",
  "displayName": "會員抵用額到期提醒",
  "defaultCopy": {
   "title": "會員抵用額到期提醒",
   "intro": "您有抵用額即將到期，請留意原有效期限與可用餘額。",
   "secondaryText": "",
   "ctaLabel": "查看回饋紀錄",
   "altText": "KD Coffee｜會員抵用額到期提醒",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "到期提醒",
   "tone": "pending"
  },
  "fields": [
   {
    "key": "amount",
    "label": "抵用額",
    "formatter": "credit",
    "required": true,
    "visibility": "visible"
   },
   {
    "key": "expiresOn",
    "label": "原有效期限",
    "formatter": "date",
    "required": false,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "rewards"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "amount",
   "expiresOn"
  ],
  "previewSample": {
   "amount": 100,
   "expiresOn": "2026-11-03"
  }
 },
 {
  "eventKey": "admin.return.request_received",
  "family": "ADMIN",
  "recipient": "admin",
  "displayName": "收到新的退貨申請",
  "defaultCopy": {
   "title": "收到新的退貨申請",
   "intro": "有一筆退貨申請等待您處理。",
   "secondaryText": "",
   "ctaLabel": "處理退貨",
   "altText": "KD Coffee｜收到新的退貨申請",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "待處理",
   "tone": "pending"
  },
  "fields": [
   {
    "key": "orderNumber",
    "label": "訂單編號",
    "formatter": "text",
    "required": true,
    "visibility": "visible"
   },
   {
    "key": "memberName",
    "label": "會員",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "quantity",
    "label": "申請件數",
    "formatter": "quantity",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "requestedAt",
    "label": "申請時間",
    "formatter": "date",
    "required": false,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "adminReturn"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "orderNumber",
   "memberName",
   "quantity",
   "requestedAt"
  ],
  "previewSample": {
   "orderNumber": "KD20261031-1234",
   "memberName": "王小明",
   "quantity": 1,
   "requestedAt": "2026-11-03T04:00:00Z"
  }
 },
 {
  "eventKey": "customer.return.received",
  "family": "RETURN",
  "recipient": "customer",
  "displayName": "退貨申請已收到",
  "defaultCopy": {
   "title": "退貨申請已收到",
   "intro": "我們已收到您的退貨申請，請至會員中心查看處理進度。",
   "secondaryText": "",
   "ctaLabel": "查看退貨進度",
   "altText": "KD Coffee｜退貨申請已收到",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "最新通知",
   "tone": "brand"
  },
  "fields": [
   {
    "key": "orderNumber",
    "label": "訂單編號",
    "formatter": "text",
    "required": true,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "returns"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "orderNumber"
  ],
  "previewSample": {
   "orderNumber": "KD20261031-1234"
  }
 },
 {
  "eventKey": "customer.return.approved",
  "family": "RETURN",
  "recipient": "customer",
  "displayName": "退貨申請已核准",
  "defaultCopy": {
   "title": "退貨申請已核准",
   "intro": "您的退貨申請已核准，後續資訊請至退貨進度查看。",
   "secondaryText": "",
   "ctaLabel": "查看退貨進度",
   "altText": "KD Coffee｜退貨申請已核准",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "已核准",
   "tone": "success"
  },
  "fields": [
   {
    "key": "orderNumber",
    "label": "訂單編號",
    "formatter": "text",
    "required": true,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "returns"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "orderNumber"
  ],
  "previewSample": {
   "orderNumber": "KD20261031-1234"
  }
 },
 {
  "eventKey": "customer.return.rejected",
  "family": "RETURN",
  "recipient": "customer",
  "displayName": "退貨申請未核准",
  "defaultCopy": {
   "title": "退貨申請未核准",
   "intro": "您的退貨申請未核准，請至退貨紀錄查看說明。",
   "secondaryText": "",
   "ctaLabel": "查看退貨進度",
   "altText": "KD Coffee｜退貨申請未核准",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "未核准",
   "tone": "warning"
  },
  "fields": [
   {
    "key": "orderNumber",
    "label": "訂單編號",
    "formatter": "text",
    "required": true,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "returns"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "orderNumber"
  ],
  "previewSample": {
   "orderNumber": "KD20261031-1234"
  }
 },
 {
  "eventKey": "customer.return.refund_completed",
  "family": "RETURN",
  "recipient": "customer",
  "displayName": "退款完成",
  "defaultCopy": {
   "title": "退款完成",
   "intro": "您的退款已辦理完成，請查看退款資訊。",
   "secondaryText": "",
   "ctaLabel": "查看退款紀錄",
   "altText": "KD Coffee｜退款完成",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "已完成",
   "tone": "success"
  },
  "fields": [
   {
    "key": "orderNumber",
    "label": "訂單編號",
    "formatter": "text",
    "required": true,
    "visibility": "visible"
   },
   {
    "key": "refundAmount",
    "label": "退款金額",
    "formatter": "money",
    "required": true,
    "visibility": "visible"
   },
   {
    "key": "refundMethod",
    "label": "退款方式",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "completedAt",
    "label": "完成時間",
    "formatter": "date",
    "required": false,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "returns"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "orderNumber",
   "refundAmount",
   "refundMethod",
   "completedAt"
  ],
  "previewSample": {
   "orderNumber": "KD20261031-1234",
   "refundAmount": 500,
   "refundMethod": "銀行轉帳",
   "completedAt": "2026-11-03T04:00:00Z"
  }
 },
 {
  "eventKey": "customer.order.confirmed",
  "family": "ORDER",
  "recipient": "customer",
  "displayName": "訂單已確認",
  "defaultCopy": {
   "title": "訂單已確認",
   "intro": "我們已收到並確認您的訂單，會依訂單內容為您準備。",
   "secondaryText": "",
   "ctaLabel": "查看訂單",
   "altText": "KD Coffee｜訂單已確認",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "已確認",
   "tone": "brand"
  },
  "fields": [
   {
    "key": "orderNumber",
    "label": "訂單編號",
    "formatter": "text",
    "required": true,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "orders"
  },
  "imagePolicy": "optional_public_order_photo",
  "allowedPlaceholders": [
   "orderNumber"
  ],
  "previewSample": {
   "orderNumber": "KD20261031-1234"
  }
 },
 {
  "eventKey": "customer.order.ready_for_pickup.studio",
  "family": "FULFILLMENT",
  "recipient": "customer",
  "displayName": "工作室咖啡已備妥",
  "defaultCopy": {
   "title": "工作室咖啡已備妥",
   "intro": "您的咖啡已準備完成，請依確認的預約時間前來取貨。",
   "secondaryText": "",
   "ctaLabel": "查看訂單",
   "altText": "KD Coffee｜工作室咖啡已備妥",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "最新通知",
   "tone": "brand"
  },
  "fields": [
   {
    "key": "orderNumber",
    "label": "訂單編號",
    "formatter": "text",
    "required": true,
    "visibility": "visible"
   },
   {
    "key": "pickupDate",
    "label": "取貨日期",
    "formatter": "date",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "pickupTime",
    "label": "取貨時間",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "orders"
  },
  "imagePolicy": "optional_public_order_photo",
  "allowedPlaceholders": [
   "orderNumber",
   "pickupDate",
   "pickupTime"
  ],
  "previewSample": {
   "orderNumber": "KD20261031-1234",
   "pickupDate": "2026-11-03",
   "pickupTime": "14:00–16:00"
  }
 },
 {
  "eventKey": "customer.order.shipment_created",
  "family": "FULFILLMENT",
  "recipient": "customer",
  "displayName": "寄件資訊已建立",
  "defaultCopy": {
   "title": "寄件資訊已建立",
   "intro": "您的訂單已建立寄件資訊，工作室將依流程完成寄送。",
   "secondaryText": "",
   "ctaLabel": "查看訂單",
   "altText": "KD Coffee｜寄件資訊已建立",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "最新通知",
   "tone": "brand"
  },
  "fields": [
   {
    "key": "orderNumber",
    "label": "訂單編號",
    "formatter": "text",
    "required": true,
    "visibility": "visible"
   },
   {
    "key": "trackingNumber",
    "label": "追蹤資訊",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "orders"
  },
  "imagePolicy": "optional_public_order_photo",
  "allowedPlaceholders": [
   "orderNumber",
   "trackingNumber"
  ],
  "previewSample": {
   "orderNumber": "KD20261031-1234",
   "trackingNumber": "TEST123456789"
  }
 },
 {
  "eventKey": "customer.order.shipped",
  "family": "FULFILLMENT",
  "recipient": "customer",
  "displayName": "您的訂單已寄出",
  "defaultCopy": {
   "title": "您的訂單已寄出",
   "intro": "商品已完成寄件，請留意配送進度。",
   "secondaryText": "",
   "ctaLabel": "查看訂單",
   "altText": "KD Coffee｜您的訂單已寄出",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "最新通知",
   "tone": "brand"
  },
  "fields": [
   {
    "key": "orderNumber",
    "label": "訂單編號",
    "formatter": "text",
    "required": true,
    "visibility": "visible"
   },
   {
    "key": "storeName",
    "label": "取貨門市",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "trackingNumber",
    "label": "追蹤資訊",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "orders"
  },
  "imagePolicy": "optional_public_order_photo",
  "allowedPlaceholders": [
   "orderNumber",
   "storeName",
   "trackingNumber"
  ],
  "previewSample": {
   "orderNumber": "KD20261031-1234",
   "storeName": "7-ELEVEN 範例門市",
   "trackingNumber": "TEST123456789"
  }
 },
 {
  "eventKey": "customer.order.ready_for_pickup.711",
  "family": "FULFILLMENT",
  "recipient": "customer",
  "displayName": "7-ELEVEN 取貨階段",
  "defaultCopy": {
   "title": "7-ELEVEN 取貨階段",
   "intro": "包裹已進入取貨階段，請依門市與物流通知前往取貨。",
   "secondaryText": "",
   "ctaLabel": "查看訂單",
   "altText": "KD Coffee｜7-ELEVEN 取貨階段",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "最新通知",
   "tone": "brand"
  },
  "fields": [
   {
    "key": "orderNumber",
    "label": "訂單編號",
    "formatter": "text",
    "required": true,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "orders"
  },
  "imagePolicy": "optional_public_order_photo",
  "allowedPlaceholders": [
   "orderNumber"
  ],
  "previewSample": {
   "orderNumber": "KD20261031-1234"
  }
 },
 {
  "eventKey": "customer.order.completed",
  "family": "ORDER",
  "recipient": "customer",
  "displayName": "訂單已完成",
  "defaultCopy": {
   "title": "訂單已完成",
   "intro": "感謝您選擇 KD Coffee，本次訂單已完成。",
   "secondaryText": "",
   "ctaLabel": "查看訂單",
   "altText": "KD Coffee｜訂單已完成",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "已完成",
   "tone": "success"
  },
  "fields": [
   {
    "key": "orderNumber",
    "label": "訂單編號",
    "formatter": "text",
    "required": true,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "orders"
  },
  "imagePolicy": "optional_public_order_photo",
  "allowedPlaceholders": [
   "orderNumber"
  ],
  "previewSample": {
   "orderNumber": "KD20261031-1234"
  }
 },
 {
  "eventKey": "admin.order.created",
  "family": "ADMIN",
  "recipient": "admin",
  "displayName": "收到新的訂單",
  "defaultCopy": {
   "title": "收到新的訂單",
   "intro": "有一筆新訂單等待您確認與安排。",
   "secondaryText": "",
   "ctaLabel": "查看訂單",
   "altText": "KD Coffee｜收到新的訂單",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "待處理",
   "tone": "pending"
  },
  "fields": [
   {
    "key": "orderNumber",
    "label": "訂單編號",
    "formatter": "text",
    "required": true,
    "visibility": "visible"
   },
   {
    "key": "memberName",
    "label": "會員",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "items",
    "label": "商品",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "total",
    "label": "訂單金額",
    "formatter": "money",
    "required": false,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "adminOrder"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "orderNumber",
   "memberName",
   "items",
   "total"
  ],
  "previewSample": {
   "orderNumber": "KD20261031-1234",
   "memberName": "王小明",
   "items": "範例咖啡 × 1",
   "total": 500
  }
 },
 {
  "eventKey": "admin.order.gift_inquiry",
  "family": "ADMIN",
  "recipient": "admin",
  "displayName": "企業送禮洽詢",
  "defaultCopy": {
   "title": "企業送禮洽詢",
   "intro": "收到一筆企業送禮需求，請至後台查看並聯絡洽詢。",
   "secondaryText": "",
   "ctaLabel": "查看詢問",
   "altText": "KD Coffee｜企業送禮洽詢",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "待處理",
   "tone": "pending"
  },
  "fields": [
   {
    "key": "orderNumber",
    "label": "訂單編號",
    "formatter": "text",
    "required": true,
    "visibility": "visible"
   },
   {
    "key": "memberName",
    "label": "會員",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "boxQuantity",
    "label": "預估盒數",
    "formatter": "quantity",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "desiredDate",
    "label": "希望交貨日",
    "formatter": "date",
    "required": false,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "adminOrder"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "orderNumber",
   "memberName",
   "boxQuantity",
   "desiredDate"
  ],
  "previewSample": {
   "orderNumber": "KD20261031-1234",
   "memberName": "王小明",
   "boxQuantity": 1,
   "desiredDate": "2026-11-03"
  }
 },
 {
  "eventKey": "admin.order.status_updated",
  "family": "ADMIN",
  "recipient": "admin",
  "displayName": "訂單狀態更新",
  "defaultCopy": {
   "title": "訂單狀態更新",
   "intro": "訂單狀態已更新，請至後台查看訂單資訊。",
   "secondaryText": "",
   "ctaLabel": "查看訂單",
   "altText": "KD Coffee｜訂單狀態更新",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "狀態更新",
   "tone": "neutral"
  },
  "fields": [
   {
    "key": "orderNumber",
    "label": "訂單編號",
    "formatter": "text",
    "required": true,
    "visibility": "visible"
   },
   {
    "key": "memberName",
    "label": "會員",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "status",
    "label": "目前狀態",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "trackingNumber",
    "label": "追蹤資訊",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "adminOrder"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "orderNumber",
   "memberName",
   "status",
   "trackingNumber"
  ],
  "previewSample": {
   "orderNumber": "KD20261031-1234",
   "memberName": "王小明",
   "status": "待確認",
   "trackingNumber": "TEST123456789"
  }
 },
 {
  "eventKey": "admin.order.cancelled",
  "family": "ADMIN",
  "recipient": "admin",
  "displayName": "訂單已取消",
  "defaultCopy": {
   "title": "訂單已取消",
   "intro": "訂單已取消，請至後台查看處理紀錄。",
   "secondaryText": "",
   "ctaLabel": "查看訂單",
   "altText": "KD Coffee｜訂單已取消",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "已取消",
   "tone": "neutral"
  },
  "fields": [
   {
    "key": "orderNumber",
    "label": "訂單編號",
    "formatter": "text",
    "required": true,
    "visibility": "visible"
   },
   {
    "key": "memberName",
    "label": "會員",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "status",
    "label": "目前狀態",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "trackingNumber",
    "label": "追蹤資訊",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "adminOrder"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "orderNumber",
   "memberName",
   "status",
   "trackingNumber"
  ],
  "previewSample": {
   "orderNumber": "KD20261031-1234",
   "memberName": "王小明",
   "status": "已取消",
   "trackingNumber": "TEST123456789"
  }
 },
 {
  "eventKey": "admin.order.atm_transfer_claim",
  "family": "ADMIN",
  "recipient": "admin",
  "displayName": "ATM 匯款回報",
  "defaultCopy": {
   "title": "ATM 匯款回報",
   "intro": "客人已回報匯款，請核對銀行入帳後再確認付款。",
   "secondaryText": "",
   "ctaLabel": "查看訂單",
   "altText": "KD Coffee｜ATM 匯款回報",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "待處理",
   "tone": "pending"
  },
  "fields": [
   {
    "key": "orderNumber",
    "label": "訂單編號",
    "formatter": "text",
    "required": true,
    "visibility": "visible"
   },
   {
    "key": "amount",
    "label": "金額",
    "formatter": "money",
    "required": true,
    "visibility": "visible"
   },
   {
    "key": "transferredAt",
    "label": "匯款時間",
    "formatter": "date",
    "required": false,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "adminOrder"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "orderNumber",
   "amount",
   "transferredAt"
  ],
  "previewSample": {
   "orderNumber": "KD20261031-1234",
   "amount": 500,
   "transferredAt": "2026-11-03T04:00:00Z"
  }
 },
 {
  "eventKey": "admin.order.inquiry_received",
  "family": "ADMIN",
  "recipient": "admin",
  "displayName": "新訂單詢問",
  "defaultCopy": {
   "title": "新訂單詢問",
   "intro": "客人有新的訂單問題等待回覆，請登入後台查看並處理。",
   "secondaryText": "",
   "ctaLabel": "查看詢問",
   "altText": "KD Coffee｜新訂單詢問",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "待處理",
   "tone": "pending"
  },
  "fields": [
   {
    "key": "orderNumber",
    "label": "訂單編號",
    "formatter": "text",
    "required": true,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "adminOrder"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "orderNumber"
  ],
  "previewSample": {
   "orderNumber": "KD20261031-1234"
  }
 },
 {
  "eventKey": "customer.inquiry.admin_reply",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "訂單詢問已有回覆",
  "defaultCopy": {
   "title": "訂單詢問已有回覆",
   "intro": "KD Coffee 已回覆您的訂單詢問，請回到訂單頁查看完整內容。",
   "secondaryText": "",
   "ctaLabel": "查看訂單",
   "altText": "KD Coffee｜訂單詢問已有回覆",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "最新通知",
   "tone": "brand"
  },
  "fields": [
   {
    "key": "orderNumber",
    "label": "訂單編號",
    "formatter": "text",
    "required": true,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "orders"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "orderNumber"
  ],
  "previewSample": {
   "orderNumber": "KD20261031-1234"
  }
 },
 {
  "eventKey": "admin.fulfillment.shipment_created",
  "family": "ADMIN",
  "recipient": "admin",
  "displayName": "賣貨便訂單成立",
  "defaultCopy": {
   "title": "賣貨便訂單成立",
   "intro": "收到賣貨便訂單成立通知，請確認商品內容並安排備貨。",
   "secondaryText": "",
   "ctaLabel": "查看物流",
   "altText": "KD Coffee｜賣貨便訂單成立",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "寄件資訊已建立",
   "tone": "brand"
  },
  "fields": [
   {
    "key": "items",
    "label": "商品",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "total",
    "label": "訂單金額",
    "formatter": "money",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "storeName",
    "label": "取貨門市",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "occurredAt",
    "label": "通知時間",
    "formatter": "date",
    "required": false,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "adminFulfillment"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "items",
   "total",
   "storeName",
   "occurredAt"
  ],
  "previewSample": {
   "items": "範例咖啡 × 1",
   "total": 500,
   "storeName": "7-ELEVEN 範例門市",
   "occurredAt": "2026-11-03T04:00:00Z"
  }
 },
 {
  "eventKey": "admin.fulfillment.shipped",
  "family": "ADMIN",
  "recipient": "admin",
  "displayName": "賣貨便已交寄",
  "defaultCopy": {
   "title": "賣貨便已交寄",
   "intro": "賣貨便訂單已交寄，等待後續到店通知。",
   "secondaryText": "",
   "ctaLabel": "查看物流",
   "altText": "KD Coffee｜賣貨便已交寄",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "已寄出",
   "tone": "brand"
  },
  "fields": [
   {
    "key": "items",
    "label": "商品",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "total",
    "label": "訂單金額",
    "formatter": "money",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "storeName",
    "label": "取貨門市",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "occurredAt",
    "label": "通知時間",
    "formatter": "date",
    "required": false,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "adminFulfillment"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "items",
   "total",
   "storeName",
   "occurredAt"
  ],
  "previewSample": {
   "items": "範例咖啡 × 1",
   "total": 500,
   "storeName": "7-ELEVEN 範例門市",
   "occurredAt": "2026-11-03T04:00:00Z"
  }
 },
 {
  "eventKey": "admin.fulfillment.arrived",
  "family": "ADMIN",
  "recipient": "admin",
  "displayName": "賣貨便已到店",
  "defaultCopy": {
   "title": "賣貨便已到店",
   "intro": "賣貨便包裹已到店，請查看門市與取貨期限。",
   "secondaryText": "",
   "ctaLabel": "查看物流",
   "altText": "KD Coffee｜賣貨便已到店",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "已到店",
   "tone": "brand"
  },
  "fields": [
   {
    "key": "items",
    "label": "商品",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "total",
    "label": "訂單金額",
    "formatter": "money",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "storeName",
    "label": "取貨門市",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "occurredAt",
    "label": "通知時間",
    "formatter": "date",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "pickupDeadline",
    "label": "取貨期限",
    "formatter": "date",
    "required": false,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "adminFulfillment"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "items",
   "total",
   "storeName",
   "occurredAt",
   "pickupDeadline"
  ],
  "previewSample": {
   "items": "範例咖啡 × 1",
   "total": 500,
   "storeName": "7-ELEVEN 範例門市",
   "occurredAt": "2026-11-03T04:00:00Z",
   "pickupDeadline": "2026-11-03"
  }
 },
 {
  "eventKey": "admin.fulfillment.picked_up",
  "family": "ADMIN",
  "recipient": "admin",
  "displayName": "賣貨便已取貨",
  "defaultCopy": {
   "title": "賣貨便已取貨",
   "intro": "賣貨便訂單已完成取貨，可至後台查看物流紀錄。",
   "secondaryText": "",
   "ctaLabel": "查看物流",
   "altText": "KD Coffee｜賣貨便已取貨",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "已完成",
   "tone": "success"
  },
  "fields": [
   {
    "key": "items",
    "label": "商品",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "total",
    "label": "訂單金額",
    "formatter": "money",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "storeName",
    "label": "取貨門市",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "occurredAt",
    "label": "通知時間",
    "formatter": "date",
    "required": false,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "adminFulfillment"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "items",
   "total",
   "storeName",
   "occurredAt"
  ],
  "previewSample": {
   "items": "範例咖啡 × 1",
   "total": 500,
   "storeName": "7-ELEVEN 範例門市",
   "occurredAt": "2026-11-03T04:00:00Z"
  }
 },
 {
  "eventKey": "customer.support.root",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "客服首頁",
  "defaultCopy": {
   "title": "客服首頁",
   "intro": "想了解哪一項？請從下方分類開始。",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜客服首頁",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.coffee",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "咖啡與豆單",
  "defaultCopy": {
   "title": "咖啡與豆單",
   "intro": "請選擇想了解的項目。",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜咖啡與豆單",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.orders",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "購買、訂單與取貨",
  "defaultCopy": {
   "title": "購買、訂單與取貨",
   "intro": "請選擇想了解的項目。",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜購買、訂單與取貨",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.members",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "會員與回饋",
  "defaultCopy": {
   "title": "會員與回饋",
   "intro": "請選擇想了解的項目。",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜會員與回饋",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.service",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "店舖與服務",
  "defaultCopy": {
   "title": "店舖與服務",
   "intro": "請選擇想了解的項目。",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜店舖與服務",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.monthly-menu",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "本月豆單",
  "defaultCopy": {
   "title": "本月豆單",
   "intro": "一次閱讀本月作品、風味、規格與參考售價。",
   "secondaryText": "",
   "ctaLabel": "查看本月豆單",
   "altText": "KD Coffee｜本月豆單",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [
   {
    "key": "productName",
    "label": "作品",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "productPrice",
    "label": "參考售價",
    "formatter": "money",
    "required": false,
    "visibility": "visible"
   },
   {
    "key": "productDetails",
    "label": "風味說明",
    "formatter": "text",
    "required": false,
    "visibility": "visible"
   }
  ],
  "cta": {
   "destinationType": "menu"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [
   "productName",
   "productPrice",
   "productDetails"
  ],
  "previewSample": {
   "productName": "範例咖啡",
   "productPrice": 500,
   "productDetails": "柔和果香，平衡口感"
  }
 },
 {
  "eventKey": "customer.support.works",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "咖啡作品",
  "defaultCopy": {
   "title": "咖啡作品",
   "intro": "開始選購咖啡",
   "secondaryText": "",
   "ctaLabel": "查看咖啡作品",
   "altText": "KD Coffee｜咖啡作品",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "works"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.roast-flavors",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "焙度與風味",
  "defaultCopy": {
   "title": "焙度與風味",
   "intro": "一次閱讀本月作品、風味、規格與參考售價。",
   "secondaryText": "",
   "ctaLabel": "查看本月豆單",
   "altText": "KD Coffee｜焙度與風味",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "menu"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.purchase",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "購買方式",
  "defaultCopy": {
   "title": "購買方式",
   "intro": "一般訂購可選 7-ELEVEN 取貨付款、KD Coffee 工作室自取或宅配。",
   "secondaryText": "",
   "ctaLabel": "查看咖啡作品",
   "altText": "KD Coffee｜購買方式",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "works"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.my-orders",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "查看我的訂單",
  "defaultCopy": {
   "title": "查看我的訂單",
   "intro": "可使用 LINE、手機號碼或 Email 登入。登入後可查看自己的訂單與常用資料。",
   "secondaryText": "",
   "ctaLabel": "開啟會員中心",
   "altText": "KD Coffee｜查看我的訂單",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "member"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.my-order-status",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "訂單 / 配送進度",
  "defaultCopy": {
   "title": "訂單 / 配送進度",
   "intro": "可使用 LINE、手機號碼或 Email 登入。登入後可查看自己的訂單與常用資料。",
   "secondaryText": "",
   "ctaLabel": "開啟會員中心",
   "altText": "KD Coffee｜訂單 / 配送進度",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "member"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.seven-eleven",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "7-ELEVEN 取貨",
  "defaultCopy": {
   "title": "7-ELEVEN 取貨",
   "intro": "商品到店後再付款取貨",
   "secondaryText": "",
   "ctaLabel": "查看購買方式",
   "altText": "KD Coffee｜7-ELEVEN 取貨",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "checkout"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.studio-pickup",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "工作室自取",
  "defaultCopy": {
   "title": "工作室自取",
   "intro": "請選擇希望日期，工作室確認後會通知你。",
   "secondaryText": "",
   "ctaLabel": "查看購買方式",
   "altText": "KD Coffee｜工作室自取",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "checkout"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.payment",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "付款方式",
  "defaultCopy": {
   "title": "付款方式",
   "intro": "一般訂購可選 7-ELEVEN 取貨付款、KD Coffee 工作室自取或宅配。",
   "secondaryText": "",
   "ctaLabel": "查看購買方式",
   "altText": "KD Coffee｜付款方式",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "checkout"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.order-help",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "訂單協助",
  "defaultCopy": {
   "title": "訂單協助",
   "intro": "可使用 LINE、手機號碼或 Email 登入。登入後可查看自己的訂單與常用資料。",
   "secondaryText": "",
   "ctaLabel": "開啟會員中心",
   "altText": "KD Coffee｜訂單協助",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "member"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.kd-points",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "KD 點數",
  "defaultCopy": {
   "title": "KD 點數",
   "intro": "回饋點數與折抵金額都以正式紀錄為準。",
   "secondaryText": "",
   "ctaLabel": "開啟會員中心",
   "altText": "KD Coffee｜KD 點數",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "member"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.credits",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "抵用金",
  "defaultCopy": {
   "title": "抵用金",
   "intro": "有抵用金時，結帳會讓您自行選擇是否使用，並優先使用最快到期的額度。",
   "secondaryText": "",
   "ctaLabel": "開啟會員中心",
   "altText": "KD Coffee｜抵用金",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "member"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.purchase-rewards",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "購物回饋",
  "defaultCopy": {
   "title": "購物回饋",
   "intro": "回饋點數與折抵金額都以正式紀錄為準。",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜購物回饋",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.referral",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "推薦好友",
  "defaultCopy": {
   "title": "推薦好友",
   "intro": "請選擇想了解的項目。 這是會員中心唯一的分享入口。朋友透過你的專屬連結加入會員，系統會保留推薦關係；訪客完成有效購買，也可能帶來推廣零售回饋。",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜推薦好友",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.referral-how",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "怎麼推薦好友",
  "defaultCopy": {
   "title": "怎麼推薦好友",
   "intro": "這是會員中心唯一的分享入口。朋友透過你的專屬連結加入會員，系統會保留推薦關係；訪客完成有效購買，也可能帶來推廣零售回饋。",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜怎麼推薦好友",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.referral-first",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "第一代推薦回饋",
  "defaultCopy": {
   "title": "第一代推薦回饋",
   "intro": "先看自己的第一代；也可以打開三代樹狀組織圖，點選會員後以他為中心繼續往下查看。",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜第一代推薦回饋",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.referral-second",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "第二代推薦回饋",
  "defaultCopy": {
   "title": "第二代推薦回饋",
   "intro": "請選擇想了解的項目。 先看自己的第一代；也可以打開三代樹狀組織圖，點選會員後以他為中心繼續往下查看。",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜第二代推薦回饋",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.second-who",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "誰算第二代",
  "defaultCopy": {
   "title": "誰算第二代",
   "intro": "先看自己的第一代；也可以打開三代樹狀組織圖，點選會員後以他為中心繼續往下查看。",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜誰算第二代",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.second-calculation",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "回饋怎麼計算",
  "defaultCopy": {
   "title": "回饋怎麼計算",
   "intro": "回饋點數與折抵金額都以正式紀錄為準。",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜回饋怎麼計算",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.second-qualification",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "符合資格條件",
  "defaultCopy": {
   "title": "符合資格條件",
   "intro": "加入推薦團隊不等於立即產生回饋；仍須依活動、消費與成功取貨條件判定。",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜符合資格條件",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.second-release",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "什麼時候入帳",
  "defaultCopy": {
   "title": "什麼時候入帳",
   "intro": "為保障退貨、取消或其他交易異常的處理期間，這筆回饋會依本筆回饋建立時的規則經過安全等待期。",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜什麼時候入帳",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.second-pending",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "為什麼待符合資格",
  "defaultCopy": {
   "title": "為什麼待符合資格",
   "intro": "加入推薦團隊不等於立即產生回饋；仍須依活動、消費與成功取貨條件判定。",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜為什麼待符合資格",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.second-my-rewards",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "查看我的推薦回饋",
  "defaultCopy": {
   "title": "查看我的推薦回饋",
   "intro": "回饋點數與折抵金額都以正式紀錄為準。",
   "secondaryText": "",
   "ctaLabel": "開啟會員中心",
   "altText": "KD Coffee｜查看我的推薦回饋",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "member"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.referral-qualification",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "推薦資格",
  "defaultCopy": {
   "title": "推薦資格",
   "intro": "加入推薦團隊不等於立即產生回饋；仍須依活動、消費與成功取貨條件判定。",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜推薦資格",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.referral-calculation",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "回饋計算",
  "defaultCopy": {
   "title": "回饋計算",
   "intro": "回饋點數與折抵金額都以正式紀錄為準。",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜回饋計算",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.referral-release",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "入帳時間",
  "defaultCopy": {
   "title": "入帳時間",
   "intro": "為保障退貨、取消或其他交易異常的處理期間，這筆回饋會依本筆回饋建立時的規則經過安全等待期。",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜入帳時間",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.my-referral-rewards",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "我的推薦回饋入口",
  "defaultCopy": {
   "title": "我的推薦回饋入口",
   "intro": "回饋點數與折抵金額都以正式紀錄為準。",
   "secondaryText": "",
   "ctaLabel": "開啟會員中心",
   "altText": "KD Coffee｜我的推薦回饋入口",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "member"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.subscription",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "定期配送",
  "defaultCopy": {
   "title": "定期配送",
   "intro": "可使用 LINE、手機號碼或 Email 登入。登入後可查看自己的訂單與常用資料。",
   "secondaryText": "",
   "ctaLabel": "開啟會員中心",
   "altText": "KD Coffee｜定期配送",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "member"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.member-profile",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "我的會員資料",
  "defaultCopy": {
   "title": "我的會員資料",
   "intro": "可使用 LINE、手機號碼或 Email 登入。登入後可查看自己的訂單與常用資料。",
   "secondaryText": "",
   "ctaLabel": "開啟會員中心",
   "altText": "KD Coffee｜我的會員資料",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "member"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.location",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "地址 / 導航",
  "defaultCopy": {
   "title": "地址 / 導航",
   "intro": "高雄市鳳山區過埤路 501 號",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜地址 / 導航",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.contact",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "聯絡方式",
  "defaultCopy": {
   "title": "聯絡方式",
   "intro": "LINE @kdcoffee",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜聯絡方式",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.brand",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "品牌 / 烘焙特色",
  "defaultCopy": {
   "title": "品牌 / 烘焙特色",
   "intro": "咖啡藝術工坊\n享受每一口咖啡的驚奇之旅。",
   "secondaryText": "",
   "ctaLabel": "查看客服資訊",
   "altText": "KD Coffee｜品牌 / 烘焙特色",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "support"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.welcome",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "加入好友歡迎",
  "defaultCopy": {
   "title": "加入好友歡迎",
   "intro": "歡迎加入 KD Coffee，請從客服選單選擇想了解的項目。",
   "secondaryText": "",
   "ctaLabel": "查看會員中心",
   "altText": "KD Coffee｜加入好友歡迎",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "member"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.fallback",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "未匹配客服問題",
  "defaultCopy": {
   "title": "未匹配客服問題",
   "intro": "請從客服首頁選擇想了解的項目。",
   "secondaryText": "",
   "ctaLabel": "查看會員中心",
   "altText": "KD Coffee｜未匹配客服問題",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "member"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 },
 {
  "eventKey": "customer.support.unlinked",
  "family": "CONVERSATION",
  "recipient": "customer",
  "displayName": "會員尚未連結提示",
  "defaultCopy": {
   "title": "會員尚未連結提示",
   "intro": "請先登入並連結會員身份，再查看您的會員資訊。",
   "secondaryText": "",
   "ctaLabel": "查看會員中心",
   "altText": "KD Coffee｜會員尚未連結提示",
   "footerText": "KD Coffee Studio"
  },
  "status": {
   "label": "客服資訊",
   "tone": "brand"
  },
  "fields": [],
  "cta": {
   "destinationType": "member"
  },
  "imagePolicy": "none",
  "allowedPlaceholders": [],
  "previewSample": {}
 }
] as const satisfies readonly NotificationCardDefinition[];
export const LINE_CARD_INVENTORY_MAPPING = [
 {
  "inventoryKey": "commerce.modification_window",
  "eventKey": "customer.subscription.next_cycle",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "commerce.deadline_tomorrow",
  "eventKey": "customer.subscription.modification_cutoff",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "commerce.order_created",
  "eventKey": "customer.subscription.order_created",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "commerce.shipped",
  "eventKey": "customer.subscription.shipped",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "commerce.ready_for_pickup",
  "eventKey": "customer.subscription.ready_for_pickup",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "commerce.uncollected_terminated",
  "eventKey": "customer.subscription.uncollected",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "commerce.gift_eligible",
  "eventKey": "customer.reward.gift_milestone",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "commerce.stock_blocked",
  "eventKey": "customer.subscription.stock_blocked",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "commerce.subscription_paused",
  "eventKey": "customer.subscription.paused",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "commerce.subscription_resumed",
  "eventKey": "customer.subscription.resumed",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "commerce.subscription_terminated",
  "eventKey": "customer.subscription.terminated",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "commerce.cycle_skipped",
  "eventKey": "customer.subscription.skipped",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "commerce.referral_conversion",
  "eventKey": "customer.reward.referral",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "commerce.credit_issued",
  "eventKey": "customer.reward.credit_issued",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "commerce.credit_expiring",
  "eventKey": "customer.reward.credit_expiring",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "commerce.return_admin_request_received",
  "eventKey": "admin.return.request_received",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "commerce.return_request_received",
  "eventKey": "customer.return.received",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "commerce.return_request_approved",
  "eventKey": "customer.return.approved",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "commerce.return_request_rejected",
  "eventKey": "customer.return.rejected",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "commerce.return_refund_completed",
  "eventKey": "customer.return.refund_completed",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "order.order_confirmed",
  "eventKey": "customer.order.confirmed",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "order.studio_ready_for_pickup",
  "eventKey": "customer.order.ready_for_pickup.studio",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "order.shipment_created",
  "eventKey": "customer.order.shipment_created",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "order.order_shipped",
  "eventKey": "customer.order.shipped",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "order.seven_eleven_ready_for_pickup",
  "eventKey": "customer.order.ready_for_pickup.711",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "order.order_completed",
  "eventKey": "customer.order.completed",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "internal.new_order.711_cod",
  "eventKey": "admin.order.created",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "internal.new_order.home_delivery",
  "eventKey": "admin.order.created",
  "reason": "相同顧客可見語意共用 canonical card"
 },
 {
  "inventoryKey": "internal.new_order.studio_pickup",
  "eventKey": "admin.order.created",
  "reason": "相同顧客可見語意共用 canonical card"
 },
 {
  "inventoryKey": "internal.new_order.corporate_gift",
  "eventKey": "admin.order.gift_inquiry",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "internal.order_status_updated",
  "eventKey": "admin.order.status_updated",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "internal.order_cancelled",
  "eventKey": "admin.order.cancelled",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "internal.atm_transfer_claim",
  "eventKey": "admin.order.atm_transfer_claim",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "internal.order_inquiry_received",
  "eventKey": "admin.order.inquiry_received",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "order.order_conversation_reply",
  "eventKey": "customer.inquiry.admin_reply",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "logistics.order_created",
  "eventKey": "admin.fulfillment.shipment_created",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "logistics.shipped",
  "eventKey": "admin.fulfillment.shipped",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "logistics.arrived_at_pickup_store",
  "eventKey": "admin.fulfillment.arrived",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "logistics.completed",
  "eventKey": "admin.fulfillment.picked_up",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.root",
  "eventKey": "customer.support.root",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.coffee",
  "eventKey": "customer.support.coffee",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.orders",
  "eventKey": "customer.support.orders",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.members",
  "eventKey": "customer.support.members",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.service",
  "eventKey": "customer.support.service",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.monthly-menu",
  "eventKey": "customer.support.monthly-menu",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.works",
  "eventKey": "customer.support.works",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.choose-coffee",
  "excludedReason": "既有預設停用且缺正式說明，不創造可發送範本"
 },
 {
  "inventoryKey": "support.node.roast-flavors",
  "eventKey": "customer.support.roast-flavors",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.purchase",
  "eventKey": "customer.support.purchase",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.my-orders",
  "eventKey": "customer.support.my-orders",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.my-order-status",
  "eventKey": "customer.support.my-order-status",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.seven-eleven",
  "eventKey": "customer.support.seven-eleven",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.studio-pickup",
  "eventKey": "customer.support.studio-pickup",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.payment",
  "eventKey": "customer.support.payment",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.order-change",
  "excludedReason": "既有預設停用且缺正式說明，不創造可發送範本"
 },
 {
  "inventoryKey": "support.node.order-help",
  "eventKey": "customer.support.order-help",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.kd-points",
  "eventKey": "customer.support.kd-points",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.credits",
  "eventKey": "customer.support.credits",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.purchase-rewards",
  "eventKey": "customer.support.purchase-rewards",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.referral",
  "eventKey": "customer.support.referral",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.referral-how",
  "eventKey": "customer.support.referral-how",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.referral-first",
  "eventKey": "customer.support.referral-first",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.referral-second",
  "eventKey": "customer.support.referral-second",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.second-meaning",
  "excludedReason": "既有預設停用且缺正式說明，不創造可發送範本"
 },
 {
  "inventoryKey": "support.node.second-who",
  "eventKey": "customer.support.second-who",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.second-calculation",
  "eventKey": "customer.support.second-calculation",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.second-qualification",
  "eventKey": "customer.support.second-qualification",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.second-release",
  "eventKey": "customer.support.second-release",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.second-pending",
  "eventKey": "customer.support.second-pending",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.second-my-rewards",
  "eventKey": "customer.support.second-my-rewards",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.referral-qualification",
  "eventKey": "customer.support.referral-qualification",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.referral-calculation",
  "eventKey": "customer.support.referral-calculation",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.referral-release",
  "eventKey": "customer.support.referral-release",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.my-referral-rewards",
  "eventKey": "customer.support.my-referral-rewards",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.subscription",
  "eventKey": "customer.support.subscription",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.member-profile",
  "eventKey": "customer.support.member-profile",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.hours",
  "excludedReason": "既有預設停用且缺正式說明，不創造可發送範本"
 },
 {
  "inventoryKey": "support.node.location",
  "eventKey": "customer.support.location",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.contact",
  "eventKey": "customer.support.contact",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.node.brand",
  "eventKey": "customer.support.brand",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.welcome",
  "eventKey": "customer.support.welcome",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.fallback",
  "eventKey": "customer.support.fallback",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.unlinked",
  "eventKey": "customer.support.unlinked",
  "reason": "獨立事件"
 },
 {
  "inventoryKey": "support.legacy.beanMenu",
  "eventKey": "customer.support.monthly-menu",
  "reason": "相同顧客可見語意共用 canonical card"
 },
 {
  "inventoryKey": "support.legacy.businessHours",
  "excludedReason": "舊版可配置契約，無內建營業時間文案；不捏造正式時段"
 },
 {
  "inventoryKey": "support.legacy.location",
  "eventKey": "customer.support.location",
  "reason": "相同顧客可見語意共用 canonical card"
 },
 {
  "inventoryKey": "support.legacy.purchaseGuide",
  "eventKey": "customer.support.purchase",
  "reason": "相同顧客可見語意共用 canonical card"
 },
 {
  "inventoryKey": "support.legacy.sevenElevenPickup",
  "eventKey": "customer.support.seven-eleven",
  "reason": "相同顧客可見語意共用 canonical card"
 },
 {
  "inventoryKey": "support.legacy.studioPickup",
  "eventKey": "customer.support.studio-pickup",
  "reason": "相同顧客可見語意共用 canonical card"
 },
 {
  "inventoryKey": "support.legacy.paymentMethods",
  "eventKey": "customer.support.payment",
  "reason": "相同顧客可見語意共用 canonical card"
 },
 {
  "inventoryKey": "support.legacy.orderHelp",
  "eventKey": "customer.support.order-help",
  "reason": "相同顧客可見語意共用 canonical card"
 },
 {
  "inventoryKey": "support.legacy.membership",
  "eventKey": "customer.support.members",
  "reason": "相同顧客可見語意共用 canonical card"
 },
 {
  "inventoryKey": "support.legacy.kdPoints",
  "eventKey": "customer.support.kd-points",
  "reason": "相同顧客可見語意共用 canonical card"
 },
 {
  "inventoryKey": "support.legacy.subscription",
  "eventKey": "customer.support.subscription",
  "reason": "相同顧客可見語意共用 canonical card"
 },
 {
  "inventoryKey": "support.legacy.referral",
  "eventKey": "customer.support.referral",
  "reason": "相同顧客可見語意共用 canonical card"
 },
 {
  "inventoryKey": "support.legacy.customRule",
  "excludedReason": "非固定事件：舊版自訂規則／fallback 契約，保留原客服設定與文字"
 },
 {
  "inventoryKey": "support.legacy.fallback",
  "excludedReason": "非固定事件：舊版自訂規則／fallback 契約，保留原客服設定與文字"
 },
 {
  "inventoryKey": "support.customNode",
  "excludedReason": "Owner 動態自訂節點擴充契約，非固定內建事件；留待安全接入"
 },
 {
  "inventoryKey": "diagnostic.line_test",
  "excludedReason": "人工診斷，不屬於 Owner 卡片"
 }
] as const;
