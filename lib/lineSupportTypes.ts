export const memberActionTypes = ["viewOrders","viewOrderStatus","viewKdPoints","viewCredits","viewReferralRewards","viewSubscriptions","viewMemberCenter"] as const;
export type MemberAction = typeof memberActionTypes[number];
export type SupportSource = { type: string; source: string; section: string; classification: "static"|"dynamic-link"|"missing"; needsOwner: boolean };
export type SupportNode = {
  id: string; parentId: string|null; type: "menu"|"answer"|"member_action"; enabled: boolean;
  title: string; promptText: string; keywords: string[]; matchMode: "exact"|"contains";
  replyText: string; linkLabel: string; destination: string; memberAction: MemberAction|"";
  order: number; sourceMetadata: SupportSource; createdAt: string; updatedAt: string;
};
import type { LineWelcome, LineBeanMenu } from "./lineSupportFeatures";
export type SupportSettings = {
  welcome?: LineWelcome; beanMenu?: LineBeanMenu;
  schemaVersion: 3; revision: number; enabled: boolean; updatedAt: string; rootNodeId: string; nodes: SupportNode[];
  navigation: { backLabel: string; homeLabel: string; previousLabel: string; nextLabel: string };
  unlinkedText: string; fallback: { enabled: boolean; text: string; showRootChoices: boolean };
};
export type SupportInput = { mode: "welcome" } | { mode: "text"; text: string } | { mode: "node"; nodeId: string; page?: number } | { mode: "postback"; data: string };
export type SupportAction = { type:"action"; action: {type:"postback"; label:string; data:string} | {type:"uri";label:string;uri:string} };
export type SupportMessage = {type:"text";text:string;quickReply?:{items:SupportAction[]}};
export type SupportResult = {
  category: "node"|"fallback"|"noReply"; normalizedMessage: string; keyword?:string; reason?:string;
  nodeId?:string; nodeType?:SupportNode["type"]; parentId?:string|null; childIds:string[];
  replyText:string; text:string; destination:string; memberAction:MemberAction|"";
  authenticationRequired:boolean; linked:boolean; page:number; pageCount:number; messages:SupportMessage[];
};
