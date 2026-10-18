export const lineQuickReplyTypes = [
  "beanMenu",
  "businessHours",
  "location",
  "purchaseGuide",
  "sevenElevenPickup",
  "studioPickup",
  "paymentMethods",
  "orderHelp",
  "membership",
  "kdPoints",
  "subscription",
  "referral",
] as const;

export type LineQuickReplyType = (typeof lineQuickReplyTypes)[number];
export const lineQuickReplyAdminNames: Record<LineQuickReplyType, string> = {
  beanMenu: "豆單",
  businessHours: "營業時間",
  location: "地址 / 導航",
  purchaseGuide: "購買方式",
  sevenElevenPickup: "7-ELEVEN 取貨",
  studioPickup: "工作室自取",
  paymentMethods: "付款方式",
  orderHelp: "訂單協助",
  membership: "會員",
  kdPoints: "KD 點數 / 抵用金",
  subscription: "定期配送",
  referral: "推薦分享",
};
export type MatchMode = "exact" | "contains";

export type LineReplyItem = {
  enabled: boolean;
  name: string;
  order: number;
  matchMode: MatchMode;
  keywords: string[];
  replyText: string;
  buttonLabel: string;
  destination: string;
  updatedAt: string;
};

export type LineQuickReplyItem = LineReplyItem & { id: LineQuickReplyType };
export type LineCustomReplyRule = LineReplyItem & { id: string; createdAt: string };

export type LineAutoReplySettings = {
  schemaVersion: 2;
  revision: number;
  enabled: boolean;
  updatedAt: string;
  quickReplies: LineQuickReplyItem[];
  customRules: LineCustomReplyRule[];
  fallback: { enabled: boolean; text: string };
};

export type LineReplyResult = {
  normalizedMessage: string;
  category: "quickReply" | "customRule" | "fallback" | "noReply";
  itemId?: string;
  itemName?: string;
  keyword?: string;
  replyText: string;
  buttonLabel: string;
  destination: string;
  resolvedDestination: string;
  text: string;
  messages: string[];
  reason?: string;
};
