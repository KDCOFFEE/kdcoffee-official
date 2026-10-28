import "server-only";
import { cache } from "react";
import { readMemberCenterCopy } from "./memberCenterCopyStore";
import { resolveMemberCopy, creditDisplayName } from "./memberCenterCopy";
import { readPointDisplayName } from "./pointDisplayNameStore";
import { orderFlowDescription } from "./orderStatusPolicy";
import { readCustomerServiceState } from "./customerServiceStore";
import { DEFAULT_SERVICE_DOCUMENT, SERVICE_SOURCES, type ServiceDocument, type ServiceFaq, type ResolvedServiceFaq } from "./customerServiceContent";

/** Routing guidance never asserts eligibility, deadlines, conversion rates or refund entitlements. */
export function resolveServiceFaq(item: ServiceFaq, copy: (key: string) => string): ResolvedServiceFaq {
  let answer = item.answer;
  switch (item.source) {
    case "orders": answer = "登入會員中心，開啟「我的訂單」並選擇該筆訂單，即可查看目前狀態、付款資訊與訂單詢問。實際付款方式與操作請在訂單頁確認。"; break;
    case "delivery": answer = `7-ELEVEN 取貨付款：${orderFlowDescription("711_cod")}\n工作室自取：${orderFlowDescription("studio_pickup")}\n宅配：${orderFlowDescription("home_delivery")}\n每筆訂單的最新進度與取貨資訊，請開啟訂單查看。`; break;
    case "cancellation": answer = "請開啟該筆訂單，查看目前提供的取消操作與說明。系統會依該筆訂單的正式狀態處理；若需要協助，請使用訂單詢問聯絡客服。"; break;
    case "returns": answer = "請開啟該筆訂單，透過訂單詢問提出退貨或退款相關問題；也可使用下方客服管道，提供訂單編號以便查詢。相關處理請由客服協助確認。"; break;
    case "kd": answer = [copy("member.rewards.reward.afccb6ad2c"), copy("member.rewards.reward.e44effcabf")].filter(Boolean).join("\n"); break;
    case "credit": answer = [copy("credit.help.lifecycle"), copy("credit.help.subscription")].filter(Boolean).join("\n"); break;
    case "subscription": answer = "登入會員中心的「定期配送」，查看你的配送安排、各期狀態及目前可使用的管理操作。個別期次的設定與說明，請在該期次確認。"; break;
    case "coffee": answer = "咖啡作品頁提供各作品的風味、規格與目前可選的烘焙選項；也可以先閱讀本月豆單。客製烘焙與可選取貨日期，請依商品頁及結帳當下顯示的資訊確認。"; break;
  }
  return { ...item, answer, ...(item.source === "editorial" ? {} : { sourceLabel: SERVICE_SOURCES[item.source] }) };
}
/** Request-local deduplication only. Never cache personalized information across requests. */
export const readCustomerServicePage = cache(async () => {
  const [saved, memberCopy, point] = await Promise.allSettled([readCustomerServiceState(), readMemberCenterCopy(), readPointDisplayName()]);
  const contentUnavailable = saved.status === "rejected";
  const document: ServiceDocument = saved.status === "fulfilled" ? saved.value.document : structuredClone(DEFAULT_SERVICE_DOCUMENT);
  const overrides = memberCopy.status === "fulfilled" ? memberCopy.value.overrides : {};
  const pointName = point.status === "fulfilled" ? point.value : "KD 點數";
  const creditName = creditDisplayName(overrides);
  const copy = (key: string) => resolveMemberCopy(overrides, key, {}, "", pointName);
  return {
    config: document.config,
    contentUnavailable,
    pointName, creditName,
    cards: document.cards.filter(card => card.enabled).sort((a, b) => a.sortOrder - b.sortOrder),
    faqs: document.faqs.filter(faq => faq.enabled).sort((a, b) => a.sortOrder - b.sortOrder).map(faq => resolveServiceFaq(faq, copy)),
  };
});
