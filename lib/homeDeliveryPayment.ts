import { maximumCreditRedemption } from "./membershipPolicies";
import type { MembershipBusinessRules } from "./membershipRuleTypes";

export type HomeDeliveryPaymentMethod = "atm_transfer" | "cash_on_delivery" | "credit_card";
export type ActiveHomeDeliveryPaymentMethod = Exclude<HomeDeliveryPaymentMethod, "credit_card">;
export type HomeDeliveryPaymentStatus = "pending" | "paid" | "failed" | "refunded";

export type HomeDeliveryPaymentDetails = {
  method: HomeDeliveryPaymentMethod;
  status: HomeDeliveryPaymentStatus;
  paidAt?: string;
  confirmedBy?: "admin";
  provider?: string;
  providerReference?: string;
};

function money(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label}必須是非負整數`);
  return value;
}

/** Creates additive fields for a future home order; existing payment strings remain readable. */
export function createHomeDeliveryPaymentSnapshot(
  method: ActiveHomeDeliveryPaymentMethod,
  rules: MembershipBusinessRules,
) {
  if (method !== "atm_transfer" && method !== "cash_on_delivery") {
    throw new Error("此宅配付款方式尚未開放");
  }
  return {
    payment: method,
    paymentDetails: { method, status: "pending" } satisfies HomeDeliveryPaymentDetails,
    codServiceFee: method === "cash_on_delivery" ? rules.shipping.homeDeliveryCodFee : 0,
  };
}

/** Credit eligibility remains merchandise plus permitted shipping; the COD fee is outside it. */
export function quoteHomeDeliveryPayable(input: {
  merchandiseSubtotal: number;
  shipping: number;
  availableCredit: number;
  requestedCredit: number;
  method: ActiveHomeDeliveryPaymentMethod;
  rules: MembershipBusinessRules;
}) {
  const merchandiseSubtotal = money(input.merchandiseSubtotal, "商品小計");
  const shipping = money(input.shipping, "運費");
  const availableCredit = money(input.availableCredit, "可用抵用金");
  const requestedCredit = money(input.requestedCredit, "欲使用抵用金");
  const payment = createHomeDeliveryPaymentSnapshot(input.method, input.rules);
  const codServiceFee = money(payment.codServiceFee, "貨到付款手續費");
  const maximumCredit = maximumCreditRedemption({ merchandiseSubtotal, shipping, rules: input.rules });
  const creditApplied = Math.min(availableCredit, requestedCredit, maximumCredit);
  const totalBeforeCredit = merchandiseSubtotal + shipping + codServiceFee;
  return {
    ...payment,
    merchandiseSubtotal,
    shipping,
    maximumCredit,
    creditApplied,
    totalBeforeCredit,
    total: totalBeforeCredit - creditApplied,
  };
}


export type AtmTransferSnapshot = {
  bankName: string;
  bankCode: string;
  branchName: string;
  accountName: string;
  accountNumber: string;
  instructions: string;
  bankbookImageUrl: string | null;
  showBankbookImage: boolean;
};

export function isAtmTransferConfigured(rules: MembershipBusinessRules) {
  const atm = rules.payment.atmTransfer;
  return Boolean(
    atm.bankName.trim() &&
    atm.bankCode.trim() &&
    atm.accountName.trim() &&
    atm.accountNumber.trim(),
  );
}

export function createAtmTransferSnapshot(rules: MembershipBusinessRules): AtmTransferSnapshot {
  if (!isAtmTransferConfigured(rules)) {
    throw new Error("ATM 轉帳資訊尚未完整設定，請改用貨到付款或聯繫 KD Coffee 客服。");
  }
  const atm = rules.payment.atmTransfer;
  return {
    bankName: atm.bankName.trim(),
    bankCode: atm.bankCode.trim(),
    branchName: atm.branchName.trim(),
    accountName: atm.accountName.trim(),
    accountNumber: atm.accountNumber.trim(),
    instructions: atm.instructions.trim(),
    bankbookImageUrl: atm.bankbookImageUrl,
    showBankbookImage: Boolean(atm.showBankbookImageAtCheckout && atm.bankbookImageUrl),
  };
}

export function publicAtmTransferSettings(rules: MembershipBusinessRules) {
  const atm = rules.payment.atmTransfer;
  const configured = isAtmTransferConfigured(rules);
  return {
    configured,
    bankName: atm.bankName.trim(),
    bankCode: atm.bankCode.trim(),
    branchName: atm.branchName.trim(),
    accountName: atm.accountName.trim(),
    accountNumber: atm.accountNumber.trim(),
    instructions: atm.instructions.trim(),
    bankbookImageUrl: atm.showBankbookImageAtCheckout && atm.bankbookImageUrl ? atm.bankbookImageUrl : null,
    showBankbookImageAtCheckout: Boolean(atm.showBankbookImageAtCheckout && atm.bankbookImageUrl),
  };
}

export type AtmTransferReceipt = {
  url: string;
  mimeType: string;
  bytes: number;
  width?: number;
  height?: number;
};

export type AtmTransferClaim = {
  actionId: string;
  accountLast5: string;
  amount: number;
  transferredAt: string;
  submittedAt: string;
  receipt?: AtmTransferReceipt;
};

export class AtmTransferClaimValidationError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AtmTransferClaimValidationError";
    this.status = status;
  }
}

export function validateAtmTransferClaimInput(input: {
  accountLast5: unknown;
  transferredAt: unknown;
  amount: number;
  now?: Date;
}) {
  const accountLast5 = String(input.accountLast5 ?? "").trim();
  if (!/^\d{5}$/.test(accountLast5)) {
    throw new AtmTransferClaimValidationError("請輸入匯款帳號末五碼（5 位數字）。");
  }

  const transferredAtRaw = String(input.transferredAt ?? "").trim();
  const transferredAtDate = new Date(transferredAtRaw);
  if (!transferredAtRaw || Number.isNaN(transferredAtDate.getTime())) {
    throw new AtmTransferClaimValidationError("請填寫正確的匯款日期與時間。");
  }

  const now = input.now ?? new Date();
  if (transferredAtDate.getTime() > now.getTime() + 60 * 60 * 1000) {
    throw new AtmTransferClaimValidationError("匯款時間不能晚於現在太多，請重新確認。");
  }

  return {
    accountLast5,
    transferredAt: transferredAtDate.toISOString(),
    amount: money(input.amount, "匯款金額"),
  };
}

export function normalizeAtmTransferClaims(value: unknown): AtmTransferClaim[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    const actionId = typeof row.actionId === "string" ? row.actionId : "";
    const accountLast5 = typeof row.accountLast5 === "string" ? row.accountLast5 : "";
    const amount = typeof row.amount === "number" && Number.isSafeInteger(row.amount) && row.amount >= 0 ? row.amount : -1;
    const transferredAt = typeof row.transferredAt === "string" ? row.transferredAt : "";
    const submittedAt = typeof row.submittedAt === "string" ? row.submittedAt : "";
    if (!actionId || !/^\d{5}$/.test(accountLast5) || amount < 0 || !transferredAt || !submittedAt) return [];

    const receiptRow = row.receipt && typeof row.receipt === "object" ? row.receipt as Record<string, unknown> : null;
    const receipt = receiptRow && typeof receiptRow.url === "string" && receiptRow.url.startsWith("/uploads/order-notifications/")
      ? {
          url: receiptRow.url,
          mimeType: typeof receiptRow.mimeType === "string" ? receiptRow.mimeType : "image/webp",
          bytes: typeof receiptRow.bytes === "number" && Number.isSafeInteger(receiptRow.bytes) && receiptRow.bytes >= 0 ? receiptRow.bytes : 0,
          ...(typeof receiptRow.width === "number" ? { width: receiptRow.width } : {}),
          ...(typeof receiptRow.height === "number" ? { height: receiptRow.height } : {}),
        }
      : undefined;

    return [{ actionId, accountLast5, amount, transferredAt, submittedAt, ...(receipt ? { receipt } : {}) }];
  });
}
