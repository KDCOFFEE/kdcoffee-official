import type { CustomerNotificationPhoto } from "./customerNotifications";
export type ReturnPaymentResult = { amount:number; merchandisePaidTotal:number; originalPaidTotal:number; method:"manual_cash"|"manual_bank_transfer"; originalPayment:string; confirmedBy:string; confirmedAt:string; proof:CustomerNotificationPhoto[]; note:string; allocationFingerprint:string };
