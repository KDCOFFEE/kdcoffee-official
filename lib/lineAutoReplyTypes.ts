export const beanFields = ["price", "roast", "origin", "process", "flavors", "variety", "altitude", "status", "productUrl"] as const;
export type BeanField = (typeof beanFields)[number];
export type MatchMode = "exact" | "contains";
export type LineReplyRule = {
  id: string; enabled: boolean; name: string; order: number; matchMode: MatchMode;
  keywords: string[]; replyText: string; createdAt: string; updatedAt: string;
};
export type LineBeanSelection = { productId: string; enabled: boolean; order: number; lineDescriptionOverride: string };
export type LineAutoReplySettings = {
  schemaVersion: 1; revision: number; enabled: boolean; updatedAt: string;
  fallback: { enabled: boolean; text: string };
  beanMenu: {
    enabled: boolean; matchMode: MatchMode; keywords: string[]; title: string; intro: string;
    helpText: string; emptyStateReply: string; footer: string; ctaLabel: string; ctaUrl: string;
    displayFields: Record<BeanField, boolean>; labels: Record<BeanField, string>;
    availableText: string; products: LineBeanSelection[]; updatedAt: string;
  };
  rules: LineReplyRule[];
};
export type LineReplyResult = {
  normalizedMessage: string; category: "beanMenu" | "rule" | "fallback" | "noReply";
  ruleId?: string; ruleName?: string; keyword?: string; productIds: string[];
  text: string; messages: string[]; reason?: string;
};
